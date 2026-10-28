import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {analyzeStoredProgram,CATALOG_JSON,hashJson} from './programAnalysis.mjs'
import {createProgramAnalysisStore} from './supabaseProgramAnalysis.mjs'
import {getProgramRollout} from './programRollout.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

// In-memory PostgreSQL only. Never load .env or contact KOPIS/Supabase/OCR.
const sql=await readFile(new URL('../supabase/migrations/202610230003_program_analysis_v4.sql',import.meta.url),'utf8')
const rehash=a=>{const {payload_hash,...body}=a;return {...body,payload_hash:hashJson(body)}}
const rows=async(db,table)=>(await db.query('select * from public.'+table+' order by 1')).rows
const save=async(db,a,catalog=CATALOG_JSON)=>(await db.query('select public.save_concert_program_analysis_v4($1::jsonb,$2::text) id',[JSON.stringify(a),catalog])).rows[0].id
const enable=async db=>db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
const policy=async db=>(await db.query("select * from public.concert_program_version_policy where matcher_version='stored-program-4'")).rows
const counts=async db=>Promise.all(['concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_catalogs'].map(async t=>(await db.query('select count(*)::int n from public.'+t)).rows[0].n))
const legacyDigest=async db=>{
  const a=(await rows(db,'concert_program_analyses')).filter(x=>['stored-program-2','stored-program-3'].includes(x.matcher_version))
  const c=(await rows(db,'concert_program_candidates')).filter(x=>a.some(y=>y.id===x.analysis_id))
  const r=(await rows(db,'concert_program_reviews')).filter(x=>c.some(y=>y.id===x.candidate_id))
  const status=(await db.query("select * from public.concert_program_candidate_status where matcher_version in ('stored-program-2','stored-program-3') order by id")).rows
  return hashJson({a,c,r,status})
}
const definitions=async db=>(await db.query("select p.oid::text,p.proname,p.proacl::text,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname<>'save_concert_program_analysis_v4' order by p.oid")).rows
const tableSecurity=async db=>(await db.query("select c.oid::text,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.oid")).rows

const setup=async({seed=true}={})=>{
  const db=new PGlite()
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
    for(const path of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql','migrations/202610150001_concert_program_analysis.sql','drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql'])
      await db.exec(await readFile(new URL('../supabase/'+path,import.meta.url),'utf8'))
    if(!seed)return {db}
    await db.exec('set role service_role')
    const concert={kopis_id:'PF900054',title:'Local v4 SQL fixture',venue:'Local hall',region:'서울',start_date:'2099-10-23',end_date:'2099-10-23',performance_status:'공연예정',synced_at:'2026-10-23T00:00:00Z'}
    const images=['ballade','scherzo','empty'].map((name,sort_order)=>({source_url:`https://kopis.or.kr/upload/v4-fixture-${name}.png`,image_type:'DETAIL',sort_order}))
    await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(concert),JSON.stringify(images)])
    const storedConcert=(await rows(db,'concerts'))[0],payloads=[]
    for(const image of (await rows(db,'concert_program_images')).sort((a,b)=>a.sort_order-b.sort_order)){
      const raw_text=['[Program]\nF. Chopin\nBallade No.4 in F minor Op.52','[Program]\nF. Chopin\nScherzo No.4 in E Major, Op.54','PROGRAM'][image.sort_order]
      const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,pipeline_version:EASYOCR_PIPELINE_VERSION,content_sha256:String(image.sort_order+1).repeat(64),status:'SUCCEEDED',started_at:'2026-10-23T00:00:00Z',finished_at:'2026-10-23T00:00:01Z',duration_ms:1000}
      await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text,detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:200})])
      const ocr=(await rows(db,'concert_image_ocr_results')).find(o=>o.image_id===image.id)
      payloads.push(analyzeStoredProgram({concert:{...storedConcert,...concert},image,ocr,attempt}))
    }
    // Fixed Ballade evidence is unchanged by the Scherzo rule. These are legacy
    // storage fixtures, not a rerun/reimplementation of the v3 matcher suite.
    for(const version of ['stored-program-2','stored-program-3']){
      const legacy=rehash({...payloads[0],matcher_version:version,candidates:payloads[0].candidates.map(c=>({...c,generation_version:version}))})
      const fn=version==='stored-program-3'?'save_concert_program_analysis_v3':'save_concert_program_analysis'
      const id=(await db.query('select public.'+fn+'($1,$2) id',[JSON.stringify(legacy),CATALOG_JSON])).rows[0].id
      const c=(await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===id)
      await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',[c.id,version==='stored-program-3'?'CONFIRMED':'REJECTED','Local historical receipt',id,version,CATALOG_JSON])
    }
    await db.exec('reset role')
    return {db,payloads}
  }catch(error){await db.close();throw error}
}

test('v4 migration is additive; late failure rolls back the RPC and policy without touching existing objects or legacy receipts',async()=>{
  const {db}=await setup()
  try{
    const before={legacy:await legacyDigest(db),definitions:await definitions(db),security:await tableSecurity(db)}
    await assert.rejects(db.exec(sql.replace(/commit;\s*$/,()=>"do $$ begin raise exception 'late fixture failure';end $$;commit;")),/late fixture failure/)
    await db.exec('rollback')
    assert.equal((await db.query("select to_regprocedure('public.save_concert_program_analysis_v4(jsonb,text)') f")).rows[0].f,null)
    assert.deepEqual(await policy(db),[])
    assert.equal(await legacyDigest(db),before.legacy)
    assert.deepEqual(await definitions(db),before.definitions);assert.deepEqual(await tableSecurity(db),before.security)
    await db.exec(sql)
    assert.deepEqual(await definitions(db),before.definitions);assert.deepEqual(await tableSecurity(db),before.security)
    assert.equal(await legacyDigest(db),before.legacy)
    assert.equal((await policy(db))[0].enabled,false)
    for(const name of ['save_concert_program_rematch_v4','decide_automatic_program_candidate_v4'])assert.equal((await db.query('select count(*)::int n from pg_proc where proname=$1',[name])).rows[0].n,0)
  }finally{await db.close()}
})

test('migration rejects missing v3 prerequisites and preserves existing enabled/disabled operator policy on collision',async()=>{
  const {db}=await setup({seed:false})
  try{
    await db.exec('drop function public.save_concert_program_analysis_v3(jsonb,text)')
    await assert.rejects(db.exec(sql),/reviewed v3 storage contract/);await db.exec('rollback')
    assert.deepEqual(await policy(db),[])
  }finally{await db.close()}
  for(const enabled of [false,true]){
    const {db}=await setup({seed:false})
    try{
      await db.query("insert into public.concert_program_version_policy values('stored-program-4',$1,'Pre-existing operator decision')",[enabled])
      const original=await policy(db)
      await db.exec(sql);assert.deepEqual(await policy(db),original)
      const fn=(await db.query("select oid::text,proacl::text from pg_proc where oid='public.save_concert_program_analysis_v4(jsonb,text)'::regprocedure")).rows
      await assert.rejects(db.exec(sql),/already exists/);await db.exec('rollback')
      assert.deepEqual(await policy(db),original)
      assert.deepEqual((await db.query("select oid::text,proacl::text from pg_proc where oid='public.save_concert_program_analysis_v4(jsonb,text)'::regprocedure")).rows,fn)
    }finally{await db.close()}
  }
})

test('default/missing policy blocks save; explicit test-only enable stores Scherzo v4 idempotently while retaining v2/v3 current rows and receipts',async()=>{
  const {db,payloads}=await setup()
  try{
    const before=await legacyDigest(db)
    await db.exec(sql);await db.exec('set role service_role')
    const baseline=await counts(db)
    await assert.rejects(save(db,payloads[1]),/disabled or policy missing/)
    assert.deepEqual(await counts(db),baseline)
    await db.exec('reset role');await db.exec("delete from public.concert_program_version_policy where matcher_version='stored-program-4'");await db.exec('set role service_role')
    await assert.rejects(save(db,payloads[1]),/disabled or policy missing/)
    await db.exec('reset role');await db.exec("insert into public.concert_program_version_policy values('stored-program-4',true,'Test-only enabled policy')");await db.exec('set role service_role')
    const a=payloads[1],c=a.candidates[0]
    assert.equal(c.track_id,'chopin-scherzo-op54-no4');assert.equal(c.outcome,'MATCHED');assert.equal(c.relation,'EXACT')
    const id=await save(db,a),savedCounts=await counts(db)
    assert.equal(await save(db,structuredClone(a)),id);assert.deepEqual(await counts(db),savedCounts)
    const stored=(await rows(db,'concert_program_analyses')).find(r=>r.id===id)
    assert.deepEqual(stored.snapshot,a);assert.equal(stored.matcher_version,'stored-program-4')
    assert.equal((await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===id).review_status,'REVIEW_REQUIRED')
    // Same image/evidence as the historical rows: current is isolated by version.
    const sameImage=await save(db,payloads[0]);assert.equal(await save(db,payloads[0]),sameImage)
    const versionRows=(await rows(db,'concert_program_analyses')).filter(r=>r.image_id===payloads[0].image_id)
    assert.deepEqual(versionRows.map(r=>r.matcher_version).sort(),['stored-program-2','stored-program-3','stored-program-4'])
    assert.ok(versionRows.every(r=>r.is_current));assert.equal(await legacyDigest(db),before)
    assert.equal((await rows(db,'concert_program_reviews')).length,2,'no v4 review/receipt is created')
    const changed=structuredClone(a);changed.candidates[0].matching.variants[0].normalized_text+=' changed'
    await assert.rejects(save(db,changed),/increment matcher version/)
    await assert.rejects(save(db,rehash(changed)),/increment matcher version/)
    const after=await counts(db);await db.exec('reset role');await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'");await db.exec('set role service_role')
    await assert.rejects(save(db,a),/disabled/);assert.deepEqual(await counts(db),after)
    assert.equal(await legacyDigest(db),before)
  }finally{await db.close()}
})

test('v4 contract rejects malformed logical IDs, generation labels, catalog/evidence/context changes atomically; empty snapshots remain reusable',async()=>{
  const {db,payloads}=await setup()
  try{
    await db.exec(sql);await enable(db);await db.exec('set role service_role')
    const original=await counts(db),a=payloads[1]
    const mutations=[
      [x=>{x.matcher_version='stored-program-3'},/V4 version/],
      [x=>{x.candidates[0].generation_version='stored-program-3'},/One V4 candidate/],
      [x=>{delete x.candidates[0].generation_version},/One V4 candidate/],
      [x=>{x.logical_works=null},/logical snapshot/],
      [x=>{x.grouping=[]},/logical snapshot/],
      [x=>{x.candidates=[]},/One V4 candidate/],
      [x=>{x.logical_works[0].logical_work_id=null},/One V4 candidate/],
      [x=>{x.logical_works[0].logical_work_id='';x.candidates[0].logical_work_id=''},/One V4 candidate/],
      [x=>{x.candidates[0].logical_work_id='other-work'},/One V4 candidate/],
      [x=>{x.logical_works.push(structuredClone(x.logical_works[0]));x.candidates.push(structuredClone(x.candidates[0]))},/One V4 candidate/],
      [x=>{x.logical_works[0].catalog_matches.push(structuredClone(x.logical_works[0].catalog_matches[0]))},/One V4 candidate/],
      [x=>{x.catalog_hash='f'.repeat(64)},/Catalog hash/],
      [x=>{x.payload_hash='bad-hash'},/payload_hash/],
      [x=>{x.candidates[0].evidence[0].quote='tampered quote'},/Evidence quote/],
      [x=>{x.candidates[0].evidence[0].start=-1},/Evidence quote/],
      [x=>{x.candidates[0].track_id='missing-track'},/Track is not in catalog/],
      [x=>{x.candidates[0].review_status='CONFIRMED'},/review required/],
      [x=>{x.candidates[0].section_index=999},/Invalid candidate section/],
      [x=>{x.image_revision++},/Stale program evidence/],
      [x=>{x.concert_context.title='changed context'},/Stale program evidence/],
      [x=>{x.source_attempt_id=randomUUID()},/Stale program evidence/],
    ]
    for(const [mutate,error] of mutations){
      let value=structuredClone(a);mutate(value)
      // Keep an explicitly invalid hash invalid; otherwise verify full payloads.
      if(value.payload_hash!=='bad-hash')value=rehash(value)
      await assert.rejects(save(db,value),error);assert.deepEqual(await counts(db),original)
    }
    await assert.rejects(save(db,a,CATALOG_JSON+' '),/Catalog hash/)
    const id=await save(db,a);assert.equal(await save(db,a),id)
    assert.equal(payloads[2].candidates.length,0)
    const empty=await save(db,payloads[2]),after=await counts(db)
    assert.equal(await save(db,payloads[2]),empty);assert.deepEqual(await counts(db),after)
  }finally{await db.close()}
})

test('v4 RPC is invoker/service-role only; public ACL and anon/authenticated table access remain closed with RLS intact',async()=>{
  const {db,payloads}=await setup()
  try{
    await db.exec(sql)
    const meta=(await db.query("select prorettype::regtype::text return_type,prosecdef,proconfig,pg_get_functiondef(oid) definition from pg_proc where oid='public.save_concert_program_analysis_v4(jsonb,text)'::regprocedure")).rows[0]
    assert.equal(meta.return_type,'uuid');assert.equal(meta.prosecdef,false);assert.ok(meta.proconfig.includes('search_path=""'))
    assert.match(meta.definition,/for share/i)
    const acl=(await db.query("select x.grantee,r.rolname,x.privilege_type from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x left join pg_roles r on r.oid=x.grantee where p.oid='public.save_concert_program_analysis_v4(jsonb,text)'::regprocedure")).rows
    assert.ok(!acl.some(x=>x.grantee===0||['anon','authenticated'].includes(x.rolname)))
    assert.ok(acl.some(x=>x.rolname==='service_role'&&x.privilege_type==='EXECUTE'))
    const tables=['concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_version_policy']
    for(const t of tables)assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+t])).rows[0].relrowsecurity,true)
    for(const role of ['anon','authenticated']){
      assert.equal((await db.query("select has_function_privilege($1,'public.save_concert_program_analysis_v4(jsonb,text)','EXECUTE') ok",[role])).rows[0].ok,false)
      await db.exec('set role '+role)
      await assert.rejects(save(db,payloads[1]),/permission denied/)
      for(const t of tables)await assert.rejects(rows(db,t),/permission denied/)
      await db.exec('reset role')
      // Even accidentally granting SELECT does not expose rows without RLS policy.
      for(const t of tables)await db.exec('grant select on public.'+t+' to '+role)
      await db.exec('set role '+role)
      for(const t of tables)assert.deepEqual(await rows(db,t),[])
      await db.exec('reset role')
    }
    await enable(db);await db.exec('set role service_role');assert.ok(await save(db,payloads[1]))
  }finally{await db.close()}
})

test('v4 preflight reads the isolated migration schema/policy and blocks disabled, missing policy and unimplemented rematch before POST',async()=>{
  const {db,payloads}=await setup()
  try{
    await db.exec(sql)
    const calls=[],store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
      calls.push(init.method);assert.equal(init.method,'GET','preflight must never POST')
      if(url.pathname==='/rest/v1/'){
        const fns=(await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows
        return new Response(JSON.stringify({paths:Object.fromEntries(fns.map(f=>['/rpc/'+f.proname,{}]))}))
      }
      assert.equal(url.pathname,'/rest/v1/concert_program_version_policy')
      assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
      return new Response(JSON.stringify(await policy(db)))
    }})
    await assert.rejects(store.preflightSave(),/VERSION_DISABLED/)
    await assert.rejects(store.save(payloads[1]),/VERSION_DISABLED/)
    await db.exec("delete from public.concert_program_version_policy where matcher_version='stored-program-4'")
    await assert.rejects(store.save(payloads[1]),/VERSION_POLICY_REQUIRED/)
    await db.exec("insert into public.concert_program_version_policy values('stored-program-4',true,'Test-only preflight policy')")
    assert.deepEqual(await store.preflightSave(),{rpc_ready:true,matcher_version:'stored-program-4'})
    await assert.rejects(store.saveRematch(randomUUID(),payloads[1].candidates[0]),/PROGRAM_REMATCH_V4_MIGRATION_REQUIRED/)
    assert.ok(calls.every(m=>m==='GET'))
    assert.deepEqual(getProgramRollout({}),{writeVersion:'stored-program-4',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:false})
  }finally{await db.close()}
})
