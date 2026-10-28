import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {confirmationMigration,programTextConfirmationFixture,rows,originalDigest,confirm} from './testSupport/programTextConfirmationFixture.mjs'
import {createSupabaseConcertSearch} from './supabaseConcertSearch.mjs'

const migration=await readFile(new URL('../supabase/migrations/202610260004_program_text_confirmation_status.sql',import.meta.url),'utf8')
const view='concert_program_text_confirmation_status',table='concert_program_text_confirmations'
const setup=async(apply=true)=>{
  const db=new PGlite()
  try{
    const f=await programTextConfirmationFixture(db);await db.exec(confirmationMigration)
    await db.exec('set role service_role');f.receiptId=await confirm(db,f.input);await db.exec('reset role')
    if(apply)await db.exec(migration)
    return f
  }catch(e){await db.close();throw e}
}
const oldViews=async db=>(await db.query("select viewname,definition from pg_views where schemaname='public' and viewname<>'concert_program_text_confirmation_status' order by viewname")).rows
const functions=async db=>(await db.query("select oid::text,proname,pg_get_functiondef(oid) definition,proacl::text from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by oid")).rows

test('additive live status migration rolls back fully, preserves all old rows/functions/views/policy and exposes only scalar status/hashes',async()=>{
  const f=await setup(false),{db}=f
  try{
    const before={rows:await originalDigest(db),receipts:await rows(db,table),views:await oldViews(db),functions:await functions(db)}
    await assert.rejects(db.exec(migration.replace(/commit;\s*$/,()=>"do $$begin raise exception '3H rollback fixture';end $$;commit;")),/3H rollback fixture/)
    await db.exec('rollback');assert.equal((await db.query('select to_regclass($1) v',['public.'+view])).rows[0].v,null)
    await db.exec(migration);await db.exec('set role service_role')
    const status=(await rows(db,view))[0]
    assert.equal(status.id,f.receiptId);assert.equal(status.is_effectively_confirmed,true);assert.equal(status.stale_reason,null);assert.deepEqual(status.stale_reasons,[])
    assert.equal(status.track_id,f.candidate.snapshot.track_id);assert.equal(status.work_identity_hash,before.receipts[0].work_identity_hash)
    const columns=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1",[view])).rows.map(r=>r.column_name)
    for(const field of ['snapshot','candidate_snapshot','work_identity_snapshot','identity','evidence','quote','raw_text','kopis_detail_text'])assert.ok(!columns.includes(field))
    assert.ok(!JSON.stringify(status).includes(f.concert.kopis_detail_text))
    assert.equal(await originalDigest(db),before.rows);assert.deepEqual(await rows(db,table),before.receipts)
    await db.exec('reset role');assert.deepEqual(await oldViews(db),before.views);assert.deepEqual(await functions(db),before.functions)
  }finally{await db.close()}
})

test('receipt validity rechecks source/context, payload/candidate/evidence/catalog/identity, policy, scope and duplicates with stable stale reasons and no writes',async()=>{
  const f=await setup(),{db}=f
  try{
    const receipts=await rows(db,table)
    for(const [sql,reason]of [
      ["update public.concerts set kopis_detail_text=kopis_detail_text||'new bytes'",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set kopis_detail_text_hash=repeat('f',64)",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set kopis_detail_text=null,kopis_detail_text_hash=null",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set title='new context'",'CONCERT_CONTEXT_CHANGED'],
      ["update public.concert_program_text_analyses set concert_revision=concert_revision+1",'CONCERT_CONTEXT_CHANGED'],
      ["update public.concert_program_text_analyses set is_current=false",'ANALYSIS_SUPERSEDED'],
      ["update public.concert_program_text_analyses set snapshot=jsonb_set(snapshot,'{diagnostic_metadata,note}','true')",'ANALYSIS_SNAPSHOT_CHANGED'],
      ["update public.concert_program_text_analyses set snapshot=jsonb_set(snapshot,'{candidates}','{}')",'CANDIDATE_SNAPSHOT_CHANGED'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{track_id}','\"wrong\"')",'CANDIDATE_SNAPSHOT_CHANGED'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{evidence,0,quote}','\"wrong\"')",'EVIDENCE_CHANGED'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{evidence}','{}')",'EVIDENCE_CHANGED'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{evidence,0,start}',to_jsonb(repeat('9',100)))",'EVIDENCE_CHANGED'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{review_reasons}','[\"COMPOSER_CONFLICT\"]')",'UNRESOLVED_REVIEW_OR_SCOPE'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{scope,kind}','\"MOVEMENT_SET\"')",'UNRESOLVED_REVIEW_OR_SCOPE'],
      ["update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{outcome}','\"CONFLICT\"')",'NOT_MATCHED_EXACT'],
      ["update public.concert_program_catalogs set catalog=jsonb_set(catalog,'{targets}','[]')",'CATALOG_TARGET_CHANGED'],
      ["update public.concert_program_catalogs set catalog=jsonb_set(catalog,'{works,chopin-scherzo-op54-no4,title}','\"Changed identity\"')",'WORK_IDENTITY_CHANGED'],
      ["update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'",'VERSION_POLICY_DISABLED_OR_MISSING'],
      ["delete from public.concert_program_version_policy where matcher_version='stored-program-4'",'VERSION_POLICY_DISABLED_OR_MISSING'],
      ["insert into public.concert_program_text_candidates(analysis_id,candidate_key,logical_work_id,generation_version,snapshot) select analysis_id,repeat('e',64),'duplicate-fixture',generation_version,snapshot from public.concert_program_text_candidates",'DUPLICATE_TRACK_OR_WORK']
    ]){
      await db.exec('begin;'+sql+';set local role service_role')
      const a=(await rows(db,view))[0],b=(await rows(db,view))[0]
      assert.equal(a.is_effectively_confirmed,false,sql);assert.ok(a.stale_reasons.includes(reason),reason);assert.equal(a.stale_reason,b.stale_reason)
      assert.deepEqual(await rows(db,table),receipts);await db.exec('rollback')
    }
    // Owner-only corruption fixture bypasses immutable trigger temporarily to
    // prove a receipt/hash alone cannot authorize exposure. Never production.
    await db.exec("begin;alter table public.concert_program_text_confirmations disable trigger user;update public.concert_program_text_confirmations set verification_hash=repeat('e',64);set local role service_role")
    assert.ok((await rows(db,view))[0].stale_reasons.includes('RECEIPT_VERIFICATION_CHANGED'));await db.exec('rollback')
    await db.exec("begin;alter table public.concert_program_text_confirmations disable trigger user;update public.concert_program_text_confirmations set work_identity_hash=repeat('e',64);set local role service_role")
    assert.ok((await rows(db,view))[0].stale_reasons.includes('WORK_IDENTITY_CHANGED'));await db.exec('rollback')
    assert.equal((await rows(db,view))[0].is_effectively_confirmed,true)
  }finally{await db.close()}
})

test('private status SELECT ACL and security-invoker underlying RLS deny public/anon/authenticated, even accidental SELECT grants',async()=>{
  const {db}=await setup()
  try{
    const meta=(await db.query('select reloptions from pg_class where oid=$1::regclass',['public.'+view])).rows[0]
    assert.ok(meta.reloptions.includes('security_invoker=true'))
    const acl=(await db.query('select x.grantee,x.privilege_type,r.rolname from pg_class c cross join lateral aclexplode(c.relacl) x left join pg_roles r on r.oid=x.grantee where c.oid=$1::regclass',['public.'+view])).rows
    assert.ok(!acl.some(x=>x.grantee===0||['anon','authenticated'].includes(x.rolname)))
    assert.deepEqual(acl.filter(x=>x.rolname==='service_role').map(x=>x.privilege_type),['SELECT'])
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(rows(db,view),/permission denied/);await db.exec('reset role')
      for(const t of [view,table,'concert_program_text_analyses','concert_program_text_candidates','concerts','concert_program_catalogs','concert_program_version_policy'])await db.exec('grant select on public.'+t+' to '+role)
      await db.exec('grant execute on function public.program_identity_canonical(jsonb),public.program_work_identity(jsonb,text),public.program_identity_normalize(jsonb) to '+role)
      await db.exec('set role '+role);assert.deepEqual(await rows(db,view),[]);await db.exec('reset role')
    }
    await db.exec('set role service_role');await assert.rejects(db.exec('delete from public.'+view),/permission denied|cannot delete/)
  }finally{await db.close()}
})

test('real SQL official status feeds mock GET-only search, preserves DTO and suppresses OCR while receipt becomes stale',async()=>{
  const f=await setup(),{db}=f
  try{
    await db.exec('set role service_role');const before={digest:await originalDigest(db),receipts:await rows(db,table)},calls=[]
    const date=s=>s instanceof Date?s.toISOString().slice(0,10):s
    const fetchImpl=async(url,init)=>{
      assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.headers.Prefer,'count=exact')
      const name=url.pathname.split('/').pop();assert.ok(['concerts','concert_program_candidate_status',view].includes(name));calls.push(name)
      const stored=(await rows(db,'concerts'))[0],concert={...stored,start_date:date(stored.start_date),end_date:date(stored.end_date)}
      const visible=Object.fromEntries(['id','kopis_id','title','venue','region','start_date','end_date','performance_status','synced_at'].map(k=>[k,concert[k]]))
      if(visible.synced_at instanceof Date)visible.synced_at=visible.synced_at.toISOString()
      let data=name==='concerts'?[{...concert,synced_at:visible.synced_at}]:await rows(db,name)
      if(name!=='concerts'){
        // Model actual PostgREST filters and FK embed using real SQL statuses.
        for(const [key,value]of url.searchParams)if(!key.includes('.')&&value.startsWith('eq.'))data=data.filter(r=>String(r[key])===value.slice(3))
        data=data.map(r=>({...r,concerts:visible}))
      }
      return new Response(JSON.stringify(data),{headers:{'content-range':data.length?`0-${data.length-1}/${data.length}`:'*/0'}})
    }
    const service=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl,now:()=>Date.parse('2099-10-25T00:00:00Z')})
    const query={region:'전국',from:'2099-10-25',to:'2099-11-24',targetTrackId:f.candidate.snapshot.track_id}
    const out=await service.search(query);assert.equal(out.concerts.length,1);assert.equal(out.concerts[0].programAnalysisVersion,'stored-program-4')
    for(const forbidden of ['kopis_detail_text','work_identity_snapshot','evidence_hash',f.concert.kopis_detail_text])assert.ok(!JSON.stringify(out).includes(forbidden))
    assert.equal(await originalDigest(db),before.digest);assert.deepEqual(await rows(db,table),before.receipts)
    await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
    assert.deepEqual((await service.search(query)).concerts,[]);assert.deepEqual(await rows(db,table),before.receipts)
  }finally{await db.close()}
})
