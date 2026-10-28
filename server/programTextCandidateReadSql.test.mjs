import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {programTextConfirmationFixture,rows,payload,save,rehash,hash,originalDigest} from './testSupport/programTextConfirmationFixture.mjs'

const migration=await readFile(new URL('../supabase/migrations/202610270002_program_text_candidate_status_read.sql',import.meta.url),'utf8')
const fn='read_concert_program_text_candidate_status_v4'
const read=async(db,id)=>(await db.query('select * from public.'+fn+'($1) order by id',[id])).rows
const old=async(db,id)=>(await db.query('select * from public.concert_program_text_candidate_status where analysis_id=$1 order by id',[id])).rows
async function setup(){const db=new PGlite();try{return await programTextConfirmationFixture(db)}catch(e){await db.close();throw e}}

test('one-analysis invoker/STABLE GET is field-for-field equivalent for policy, stale and ambiguous cases; existing views/data/ACL stay intact',async()=>{
  const f=await setup(),{db}=f
  try{
    const before=await originalDigest(db),views=(await db.query("select viewname,definition from pg_views where schemaname='public' order by viewname")).rows
    const acl=(await db.query("select relname,relacl::text,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') order by relname")).rows
    await assert.rejects(db.exec(migration.replace(/commit;\s*$/,()=>"do $$ begin raise exception 'rollback read RPC';end $$;commit;")),/rollback read RPC/)
    await db.exec('rollback')
    assert.equal((await db.query('select to_regprocedure($1) f',['public.'+fn+'(uuid)'])).rows[0].f,null)
    await db.exec(migration)
    assert.equal(await originalDigest(db),before)
    assert.deepEqual((await db.query("select viewname,definition from pg_views where schemaname='public' order by viewname")).rows,views)
    assert.deepEqual((await db.query("select relname,relacl::text,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') order by relname")).rows,acl)
    const meta=(await db.query('select prosecdef,provolatile,proconfig from pg_proc where oid=$1::regprocedure',['public.'+fn+'(uuid)'])).rows[0]
    assert.equal(meta.prosecdef,false);assert.equal(meta.provolatile,'s');assert.ok(meta.proconfig.includes('search_path=""'))
    const modifications=[null,"update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'",
      "update public.concerts set kopis_detail_text_hash=repeat('f',64)","update public.concerts set title='Changed context'",
      "update public.concert_program_text_analyses set is_current=false",
      "update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{review_reasons}','[\"COMPOSER_CONFLICT\"]')",
      "update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{relation}','\"WHOLE_WORK_REFERENCE\"')"]
    for(const change of modifications){
      await db.exec('begin');if(change)await db.exec(change);await db.exec('set local role service_role')
      const expected=await old(db,f.analysis.id),actual=await read(db,f.analysis.id)
      assert.deepEqual(actual,expected);assert.equal(actual.length,1)
      assert.equal(actual[0].automatic_ready,change===null)
      await db.exec('rollback')
    }
    assert.deepEqual(await read(db,null),[]);assert.deepEqual(await read(db,randomUUID()),[])
    for(const role of ['anon','authenticated']){
      assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,'public.'+fn+'(uuid)'])).rows[0].ok,false)
      await db.exec('set role '+role);await assert.rejects(read(db,f.analysis.id),/permission denied/);await db.exec('reset role')
      // Accidental future EXECUTE/SELECT grants cannot bypass base-table RLS.
      await db.exec('grant execute on function public.'+fn+'(uuid),public.program_identity_canonical(jsonb) to '+role)
      for(const table of ['concerts','concert_program_text_analyses','concert_program_text_candidates','concert_program_catalogs','concert_program_version_policy'])await db.exec('grant select on public.'+table+' to '+role)
      await db.exec('set role '+role);assert.deepEqual(await read(db,f.analysis.id),[]);await db.exec('reset role')
    }
  }finally{await db.close()}
})

test('large official snapshot with 19 candidates completes bounded read and preserves duplicate/ambiguous exclusions under both policies',async()=>{
  const f=await setup(),{db}=f
  try{
    await db.exec(migration)
    const text=Array.from({length:18},()=>f.concert.kopis_detail_text).join('\nBiography\n')+'\n[Program]\nJ. Brahms\nIntermezzo Op.118 No.2'
    const concert={...f.concert,kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
    await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[text,hash(text),concert.id])
    const p=payload(concert);assert.equal(p.candidates.length,19)
    p.diagnostic_metadata.padding='diagnostic '.repeat(23000)
    p.candidates[0].review_reasons.push('COMPOSER_CONFLICT')
    const aid=await save(db,rehash(p))
    const dataState=async()=>JSON.stringify(await Promise.all(['concerts','concert_program_text_analyses','concert_program_text_candidates','concert_program_catalogs','concert_program_reviews'].map(t=>rows(db,t))))
    for(const enabled of [false,true]){
      await db.query("update public.concert_program_version_policy set enabled=$1 where matcher_version='stored-program-4'",[enabled])
      const before=await dataState(),start=performance.now(),actual=await read(db,aid),elapsed=performance.now()-start
      assert.ok(elapsed<10000,'single analysis read exceeds bounded fixture budget')
      assert.deepEqual(actual,await old(db,aid));assert.equal(actual.length,19)
      assert.equal(actual.filter(c=>c.automatic_ready).length,enabled?1:0)
      assert.equal(actual.filter(c=>c.exclusion_reasons.includes('DUPLICATE_TRACK_OR_WORK')).length,18)
      assert.ok(actual.some(c=>c.exclusion_reasons.includes('UNRESOLVED_REVIEW_OR_SCOPE')))
      assert.equal(await dataState(),before)
    }
  }finally{await db.close()}
})
