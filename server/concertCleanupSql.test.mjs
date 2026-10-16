import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { analyzeStoredProgram, CATALOG_JSON } from './programAnalysis.mjs'
import { CLEANUP_TABLES } from './pipelineCleanup.mjs'

const migrations=['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql','202610160001_expired_concert_cleanup.sql']
const database=async(includeCleanup=true)=>{
  const db=new PGlite()
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
  for(const name of includeCleanup?migrations:migrations.slice(0,-1))await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
  return db
}
const plan=async(db,limit=100)=>(await db.query('select public.plan_expired_concert_cleanup($1) p',[limit])).rows[0].p
const remove=async(db,id,op=randomUUID(),run=randomUUID())=>(await db.query('select public.delete_expired_concert($1,$2,$3) r',[id,op,run])).rows[0].r
const add=async(db,n,offset=0,withGraph=false)=>{
  const row=(await db.query(`insert into public.concerts(kopis_id,title,venue,region,start_date,end_date,performance_status,synced_at)
    values($1,'Local cleanup fixture','Local hall','서울',(now() at time zone 'Asia/Seoul')::date+$2::int-2,
    (now() at time zone 'Asia/Seoul')::date+$2::int,'공연중',now()) returning *`,['PF'+n,offset])).rows[0]
  if(!withGraph)return row
  const image=(await db.query("insert into public.concert_program_images(concert_id,source_url,image_type,sort_order) values($1,$2,'DETAIL',0) returning *",[row.id,`https://kopis.or.kr/upload/local-cleanup-${n}.png`])).rows[0]
  const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,pipeline_version:'local-cleanup-v1',content_sha256:'a'.repeat(64),
    status:'SUCCEEDED',started_at:'2026-01-01T00:00:00Z',finished_at:'2026-01-01T00:00:01Z',duration_ms:1000}
  await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({engine_version:'local',torch_version:'local',settings:{},raw_text:'PROGRAM\nChopin Ballade No.1 Op.23',detections:[],width:400,height:300})])
  const ocr=(await db.query('select * from public.concert_image_ocr_results where image_id=$1',[image.id])).rows[0]
  const storedAttempt=(await db.query('select * from public.concert_image_ocr_attempts where id=$1',[attempt.id])).rows[0]
  for(const key of ['start_date','end_date'])if(row[key] instanceof Date)row[key]=row[key].toISOString().slice(0,10)
  const analysis=analyzeStoredProgram({concert:row,image,ocr,attempt:storedAttempt})
  const aid=(await db.query('select public.save_concert_program_analysis($1,$2) id',[JSON.stringify(analysis),CATALOG_JSON])).rows[0].id
  const candidate=(await db.query('select * from public.concert_program_candidates where analysis_id=$1',[aid])).rows[0]
  assert.ok(candidate)
  await db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[candidate.id,'CONFIRMED','Local fixture verification',aid,analysis.matcher_version,analysis.catalog_hash])
  return {...row,image,ocr,attempt:storedAttempt,analysis_id:aid}
}

test('cleanup SQL removes only expired owned graphs, preserves independent data, receipts and private access',async()=>{
  const db=await database()
  try{
    const old=await add(db,910001,-1,true),today=await add(db,910002,0,true),future=await add(db,910003,10)
    await db.exec("create table public.cleanup_test_users(id int primary key,track_id text);insert into public.cleanup_test_users values(1,'independent-track');")
    const before=await plan(db);assert.equal(before.total,1);assert.equal(before.foreign_keys.length,10)
    assert.ok(before.foreign_keys.every(f=>f.expected));assert.equal(before.targets[0].id,old.id)
    for(const t of CLEANUP_TABLES)assert.equal(before.counts[t],1,t)
    await db.exec('begin read only;set local role service_role;')
    assert.equal((await plan(db)).total,1);await db.exec('commit')
    await db.exec('set role service_role')
    const op=randomUUID(),run=randomUUID(),result=await remove(db,old.id,op,run)
    assert.equal(result.status,'DELETED');assert.deepEqual(result.counts,before.counts)
    const repeated=await remove(db,old.id,op,run);assert.equal(repeated.receipt_reused,true);assert.deepEqual(repeated.counts,result.counts)
    assert.equal((await remove(db,old.id)).status,'NOT_FOUND')
    assert.equal((await remove(db,today.id)).status,'NOT_EXPIRED');assert.equal((await remove(db,future.id)).status,'NOT_EXPIRED')
    assert.equal((await plan(db)).total,0)
    for(const t of CLEANUP_TABLES){const rows=(await db.query('select * from public.'+t)).rows;assert.equal(rows.length,t==='concerts'?2:1,t)}
    assert.equal((await db.query('select review_status from public.concert_program_candidates')).rows[0].review_status,'CONFIRMED')
    const receipt=(await db.query('select * from public.concert_cleanup_events')).rows
    assert.equal(receipt.length,1);assert.ok(!JSON.stringify(receipt).includes('Chopin'))
    await db.exec('reset role')
    assert.equal((await db.query('select * from public.cleanup_test_users')).rows.length,1)
    assert.equal((await db.query('select * from public.concert_program_catalogs')).rows.length,1)
    const edges=(await db.query(`select conrelid::regclass::text child,confrelid::regclass::text parent,
      (select attname from pg_attribute where attrelid=conrelid and attnum=conkey[1]) col
      from pg_constraint where contype='f' and connamespace='public'::regnamespace`)).rows
    for(const e of edges)assert.equal((await db.query(`select count(*)::int n from ${e.child} c left join ${e.parent} p
      on p.${e.parent.endsWith('concert_program_catalogs')?'catalog_hash':'id'}=c.${e.col} where c.${e.col} is not null and p.${e.parent.endsWith('concert_program_catalogs')?'catalog_hash':'id'} is null`)).rows[0].n,0,e.child+':'+e.col)
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role)
      await assert.rejects(plan(db),/permission denied/);await assert.rejects(remove(db,today.id),/permission denied/)
      await assert.rejects(db.query('delete from public.concerts'),/permission denied/)
      await assert.rejects(db.query('select * from public.concert_cleanup_events'),/permission denied/)
      await db.exec('reset role')
    }
  }finally{await db.close()}
})

test('installing cleanup migration never deletes existing expired graphs',async()=>{
  const db=await database(false)
  try{
    await add(db,930001,-3,true)
    const counts=async()=>Promise.all(CLEANUP_TABLES.map(async t=>(await db.query('select count(*)::int n from public.'+t)).rows[0].n))
    const before=await counts()
    await db.exec(await readFile(new URL('../supabase/migrations/'+migrations.at(-1),import.meta.url),'utf8'))
    assert.deepEqual(await counts(),before);assert.equal((await plan(db)).total,1)
    // Reapply the completed file safely if an earlier draft was installed.
    await db.exec(await readFile(new URL('../supabase/migrations/'+migrations.at(-1),import.meta.url),'utf8'))
    assert.deepEqual(await counts(),before)
    await db.exec(await readFile(new URL('../supabase/verification/expired_concert_cleanup.sql',import.meta.url),'utf8'))
    assert.deepEqual(await counts(),before)
  }finally{await db.close()}
})

test('cleanup SQL handles KST boundary, invalid dates, extensions, deterministic limits, rollback and sharing safely',async()=>{
  const db=await database()
  try{
    const dates=(await db.query("select public.concert_cleanup_korean_date('2026-10-15T14:59:59Z')::text a,public.concert_cleanup_korean_date('2026-10-15T15:00:00Z')::text b")).rows[0]
    assert.deepEqual(dates,{a:'2026-10-15',b:'2026-10-16'})
    const oldest=await add(db,920001,-5,true),extended=await add(db,920002,-2),other=await add(db,920003,-1)
    const initial=await plan(db,1);assert.equal(initial.total,3);assert.equal(initial.targets.length,1);assert.equal(initial.targets[0].id,oldest.id)
    await db.query("update public.concerts set end_date=(now() at time zone 'Asia/Seoul')::date+3 where id=$1",[extended.id])
    assert.equal((await remove(db,extended.id)).status,'NOT_EXPIRED')
    await db.exec("create function public.cleanup_test_fail() returns trigger language plpgsql as $$begin raise exception 'Local delete failure';end;$$;create trigger cleanup_test_failure before delete on public.concerts for each row execute function public.cleanup_test_fail();")
    await assert.rejects(remove(db,oldest.id),/Local delete failure/)
    for(const t of CLEANUP_TABLES)assert.ok((await db.query('select count(*)::int n from public.'+t)).rows[0].n>0,t)
    assert.equal((await db.query('select count(*)::int n from public.concert_cleanup_events')).rows[0].n,0)
    await db.exec('drop trigger cleanup_test_failure on public.concerts')
    const kept=await add(db,920004,1,true)
    // A malformed cross-concert reference must block, never broaden the cascade.
    await db.query('update public.concert_image_ocr_attempts set result_id=$1 where id=$2',[oldest.ocr.id,kept.attempt.id])
    assert.equal((await plan(db)).targets.find(t=>t.id===oldest.id).shared_dependency,true)
    assert.equal((await remove(db,oldest.id)).status,'BLOCKED_SHARED_DEPENDENCY')
    await db.query('update public.concert_image_ocr_attempts set result_id=$1 where id=$2',[kept.ocr.id,kept.attempt.id])
    await db.exec('create table public.cleanup_unknown_owner(id uuid references public.concerts(id) on delete cascade)')
    assert.equal((await remove(db,oldest.id)).status,'BLOCKED_UNEXPECTED_FOREIGN_KEY')
    await db.exec('drop table public.cleanup_unknown_owner')
    assert.equal((await remove(db,oldest.id)).status,'DELETED');assert.equal((await plan(db,1)).total,1)
    assert.equal((await plan(db,1)).targets[0].id,other.id)
    const bad=await add(db,920005,-1),infinite=await add(db,920006,-1),reversed=await add(db,920007,-1)
    // Production DATE/NOT NULL/CHECK already reject malformed values. Relax ONLY
    // this isolated fixture to exercise legacy null/infinite/reversed protection.
    await assert.rejects(db.query('update public.concerts set end_date=$1 where id=$2',['not-a-date',bad.id]))
    await db.exec(`alter table public.concerts alter column end_date drop not null;
      do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.concerts'::regclass
        and contype='c' and pg_get_constraintdef(oid) like '%end_date%' loop
        execute format('alter table public.concerts drop constraint %I',c.conname);end loop;end;$$;`)
    await db.query('update public.concerts set end_date=null where id=$1',[bad.id])
    await db.query("update public.concerts set end_date='-infinity' where id=$1",[infinite.id])
    await db.query('update public.concerts set end_date=start_date-1 where id=$1',[reversed.id])
    assert.equal((await plan(db)).excluded_invalid_dates,3)
    for(const c of [bad,infinite,reversed])assert.equal((await remove(db,c.id)).status,'NOT_EXPIRED')
  }finally{await db.close()}
})
