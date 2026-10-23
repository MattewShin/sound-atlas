import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {analyzeStoredProgram,programAnalysisCacheKey,MATCHER_VERSION,CATALOG_HASH,CATALOG_JSON,hashJson} from './programAnalysis.mjs'
import {validateProgramManifest} from './programCanary.mjs'
import {analyzeProgramTargets,createProgramAnalysisStore} from './supabaseProgramAnalysis.mjs'
import {createPipelineRepository} from './pipelineRepository.mjs'
import {CLEANUP_SCHEMA_VERSION} from './pipelineCleanup.mjs'
import {parseProgramArgs,runProgramCli} from '../scripts/analyzeConcertPrograms.mjs'

const fixture=()=>{
  const concert={id:randomUUID(),kopis_id:'PF900003',title:'Local version fixture',venue:'Local hall',start_date:'2026-10-19',end_date:'2026-10-19',program_context_revision:0}
  const image={id:randomUUID(),concert_id:concert.id,image_type:'DETAIL',is_active:true,evidence_revision:0,source_url:'https://kopis.or.kr/upload/fixture.png'}
  const ocr={id:randomUUID(),image_id:image.id,raw_text:'PROGRAM\nF Chopin\nBallade No.4 in F minor Op:52',detections:[],width:800,created_at:'2026-10-19T00:00:00Z'}
  const attempt={id:randomUUID(),image_id:image.id,result_id:ocr.id,status:'SUCCEEDED',created_at:ocr.created_at,finished_at:ocr.created_at}
  return {concert,image,ocr,attempt}
}

test('v4 version separates cache, payload hash and candidate provenance while preserving logical identity',()=>{
  const f=fixture(),a=analyzeStoredProgram(f),b=analyzeStoredProgram(f)
  assert.equal(MATCHER_VERSION,'stored-program-4')
  assert.deepEqual(a,b)
  assert.equal(a.matcher_version,MATCHER_VERSION)
  assert.notEqual(programAnalysisCacheKey(f),programAnalysisCacheKey(f,{version:'stored-program-2'}))
  assert.notEqual(programAnalysisCacheKey(f),programAnalysisCacheKey(f,{version:'stored-program-3'}))
  const {payload_hash,...payload}=a
  assert.equal(payload_hash,hashJson(payload))
  assert.notEqual(payload_hash,hashJson({...payload,matcher_version:'stored-program-2'}))
  assert.notEqual(payload_hash,hashJson({...payload,matcher_version:'stored-program-3'}))
  assert.ok(a.candidates.every(c=>c.generation_version===MATCHER_VERSION&&c.logical_work_id===a.logical_works[0].logical_work_id))
  assert.ok(a.logical_works.every(w=>w.catalog_matches.length<=1))
  assert.equal(a.candidates.length,a.logical_works.length)
})

test('exact OCR manifest validates identity sets and cannot override the generation version',()=>{
  const f=fixture(),manifest={schema_version:'program-ocr-canary-1',source_run_id:randomUUID(),expected_count:1,targets:[{ocr_result_id:f.ocr.id,source_analysis_id:randomUUID(),kopis_id:f.concert.kopis_id}]}
  assert.equal(validateProgramManifest(manifest).target_set_hash,hashJson([f.ocr.id]))
  assert.throws(()=>validateProgramManifest({...manifest,expected_count:2,targets:[manifest.targets[0],manifest.targets[0]]}),/INVALID/)
  assert.throws(()=>parseProgramArgs(['analyze','--version','stored-program-2']),/WRITE_VERSION/)
  assert.throws(()=>parseProgramArgs(['analyze','--ocr-manifest','x.json','--kopis-id','PF1']),/CONFLICT/)
  assert.equal(parseProgramArgs(['snapshots','--ocr-manifest','x.json','--version','stored-program-2']).version,'stored-program-2')
})

test('manifest dry-run fetches only stored evidence with GET and never broadens the UUID set or saves',async()=>{
  const f=fixture(),sourceId=randomUUID(),manifest={schema_version:'program-ocr-canary-1',source_run_id:randomUUID(),expected_count:1,targets:[{ocr_result_id:f.ocr.id,source_analysis_id:sourceId,kopis_id:f.concert.kopis_id}]},calls=[]
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    calls.push(url);assert.equal(init.method,'GET');assert.equal(url.origin,'https://fixture.supabase.co');assert.ok(!url.pathname.includes('/rpc/'))
    const table=url.pathname.split('/').at(-1)
    const values={concert_program_analyses:[{id:sourceId,ocr_result_id:f.ocr.id,matcher_version:'stored-program-2'}],concert_image_ocr_results:[f.ocr],concert_program_images:[f.image],concerts:[f.concert],concert_image_ocr_attempts:[f.attempt]}
    assert.ok(url.searchParams.has(table==='concert_image_ocr_attempts'?'image_id':table==='concert_image_ocr_results'&&url.searchParams.has('image_id')?'image_id':'id'))
    return new Response(JSON.stringify(values[table]))
  }})
  store.save=()=>{throw new Error('MUST_NOT_WRITE')}
  const result=await analyzeProgramTargets(store,{manifest})
  assert.equal(calls.length,6);assert.equal(result.saved,0);assert.equal(result.analyzed_images,1)
  assert.equal(result.matcher_version,MATCHER_VERSION);assert.equal(result.analyses[0].ocr_result_id,f.ocr.id)
  assert.equal(result.summary.catalog_linked_candidates,1)
})

test('one failed target can be retried without losing successful versioned analyses',async()=>{
  const a=fixture(),b=fixture(),rows=new Map();let fail=true
  const manifest={schema_version:'program-ocr-canary-1',source_run_id:randomUUID(),expected_count:2,targets:[a,b].map(f=>({ocr_result_id:f.ocr.id,source_analysis_id:randomUUID(),kopis_id:f.concert.kopis_id}))}
  const store={preflightSave:async()=>{},manifestTargets:async()=>({targets:[a,b],coverage:{},skipped:[]}),save:async analysis=>{
    if(analysis.ocr_result_id===a.ocr.id&&fail)throw new Error('LOCAL_TRANSIENT_FAILURE')
    const key=analysis.ocr_result_id+analysis.matcher_version
    if(!rows.has(key))rows.set(key,randomUUID())
    return rows.get(key)
  }}
  const first=await analyzeProgramTargets(store,{save:true,manifest,version:MATCHER_VERSION});assert.equal(first.failures.length,1);assert.equal(rows.size,1)
  const preserved=first.analyses[0].analysis_id;fail=false
  const second=await analyzeProgramTargets(store,{save:true,manifest,version:MATCHER_VERSION});assert.equal(second.failures.length,0);assert.equal(rows.size,2)
  assert.equal(second.analyses.find(x=>x.ocr_result_id===b.ocr.id).analysis_id,preserved)
})

test('legacy candidate UUID remains readable without a v3 snapshot and CLI names its local version',async()=>{
  const f=fixture(),candidate={id:randomUUID(),analysis_id:randomUUID(),matcher_version:'stored-program-2',catalog_hash:CATALOG_HASH,track_id:null}
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET')
    const rows={concert_program_candidate_status:[candidate],concert_program_analyses:[{id:candidate.analysis_id,ocr_result_id:f.ocr.id}],concert_image_ocr_results:[f.ocr],concert_program_reviews:[],concert_program_catalogs:[{catalog:JSON.parse(CATALOG_JSON)}]}
    return new Response(JSON.stringify(rows[url.pathname.split('/').at(-1)]))
  }})
  const shown=await runProgramCli(['show',candidate.id],{store,print:()=>{}})
  assert.equal(shown.matcher_version,'stored-program-2');assert.equal(shown.local_version_current,false);assert.equal(shown.local_matcher_version,MATCHER_VERSION)
})

test('scheduled repository rejects an absent v4 RPC before writes while read-only plan reports the blocker',async()=>{
  const paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis','plan_expired_concert_cleanup','delete_expired_concert'].map(n=>['/rpc/'+n,{}]))
  const repo=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET')
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{schema_version:CLEANUP_SCHEMA_VERSION}:[]))
  }})
  paths['/rpc/save_concert_program_analysis_v3']={}
  await assert.rejects(repo.preflight(),{code:'PROGRAM_ANALYSIS_V4_MIGRATION_REQUIRED'})
  const plan=await repo.preflight({plan:true});assert.equal(plan.matcher_version,MATCHER_VERSION);assert.equal(plan.analysis_schema_ready,false)
  paths['/rpc/save_concert_program_analysis_v4']={}
  await assert.rejects(repo.preflight(),{code:'PROGRAM_WORK_IDENTITY_MIGRATION_REQUIRED'})
  paths['/rpc/review_concert_program_candidate_identity']={};paths['/rpc/save_concert_program_rematch']={}
  await assert.rejects(repo.preflight(),{code:'PROGRAM_AUTOMATION_MIGRATION_REQUIRED'})
  assert.equal((await repo.preflight({plan:true})).automation_schema_ready,false)
  paths['/rpc/decide_automatic_program_candidate']={}
  const disabled=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET')
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{schema_version:CLEANUP_SCHEMA_VERSION}:url.pathname.endsWith('/concert_program_version_policy')?[{enabled:false}]:[]))
  }})
  await assert.rejects(disabled.preflight(),{code:'PROGRAM_ANALYSIS_VERSION_DISABLED'})
  assert.equal((await disabled.preflight({plan:true})).analysis_version_enabled,false)
})

test('direct v4 save checks readiness and never POSTs to v3 or legacy RPC when v4 is absent',async()=>{
  const a=analyzeStoredProgram(fixture()),calls=[]
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    calls.push(url.pathname);assert.equal(url.pathname,'/rest/v1/');assert.equal(init.method,'GET')
    return new Response(JSON.stringify({paths:{'/rpc/save_concert_program_analysis_v3':{}}}))
  }})
  await assert.rejects(store.save(a),/PROGRAM_ANALYSIS_V4_MIGRATION_REQUIRED/);assert.equal(calls.length,1)
  await assert.rejects(store.save({...a,matcher_version:'stored-program-2'}),/SAVE_VERSION_MISMATCH/)
  assert.equal(calls.length,1)
})

test('every v4 store entry point rejects missing, malformed or disabled policy before POST',async()=>{
  for(const policy of [[],null,{},[{}],[{enabled:null}],[{enabled:'true'}],[{enabled:1}],[{enabled:false}],[{enabled:true},{enabled:true}]]){
    const paths=Object.fromEntries(['save_concert_program_analysis_v3','save_concert_program_analysis_v4','review_concert_program_candidate_identity','save_concert_program_rematch','save_concert_program_rematch_v4'].map(n=>['/rpc/'+n,{}]))
    const calls=[],store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
      calls.push(init.method);assert.equal(init.method,'GET')
      if(url.pathname.endsWith('/concert_program_version_policy'))assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
      return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:policy))
    }})
    for(const save of [()=>store.preflightSave(),()=>store.save(analyzeStoredProgram(fixture())),()=>store.saveRematch(randomUUID(),{generation_version:MATCHER_VERSION})])
      await assert.rejects(save(),/VERSION_POLICY_REQUIRED|VERSION_DISABLED|DB_ROWS_INVALID/)
    assert.ok(calls.length>0&&calls.every(method=>method==='GET'))
  }
})

test('manifest save blocks before reading targets when only v3 RPC exists',async()=>{
  const f=fixture(),manifest={schema_version:'program-ocr-canary-1',source_run_id:randomUUID(),expected_count:1,targets:[{ocr_result_id:f.ocr.id,source_analysis_id:randomUUID(),kopis_id:f.concert.kopis_id}]},calls=[]
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    calls.push(url.pathname);assert.equal(init.method,'GET');assert.equal(url.pathname,'/rest/v1/')
    return new Response(JSON.stringify({paths:{'/rpc/save_concert_program_analysis_v3':{}}}))
  }})
  store.manifestTargets=()=>{throw new Error('MUST_NOT_READ_TARGETS')}
  await assert.rejects(analyzeProgramTargets(store,{save:true,version:MATCHER_VERSION,manifest,env:{}}),/PROGRAM_ANALYSIS_V4_MIGRATION_REQUIRED/)
  assert.equal(calls.length,1)
})

test('future v4 mock save uses v4 exclusively, rechecks policy and never retries a missing RPC as v3',async()=>{
  const a=analyzeStoredProgram(fixture()),paths=Object.fromEntries(['save_concert_program_analysis_v3','save_concert_program_analysis_v4','review_concert_program_candidate_identity','save_concert_program_rematch'].map(n=>['/rpc/'+n,{}]))
  const calls=[];let enabled=true,missing=false
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method})
    if(init.method==='POST'){
      assert.equal(url.pathname,'/rest/v1/rpc/save_concert_program_analysis_v4')
      const payload=JSON.parse(init.body).p_analysis
      assert.equal(payload.matcher_version,'stored-program-4');assert.ok(payload.candidates.every(c=>c.generation_version==='stored-program-4'))
      return new Response(JSON.stringify(missing?{code:'PGRST202'}:'mock-analysis-id'),{status:missing?404:200})
    }
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:[{enabled}]))
  }})
  assert.equal(await store.save(a),'mock-analysis-id')
  enabled=false;await assert.rejects(store.save(a),/VERSION_DISABLED/)
  assert.equal(calls.filter(c=>c.method==='POST').length,1)
  enabled=true;missing=true;await assert.rejects(store.save(a))
  assert.equal(calls.filter(c=>c.method==='POST').length,2)
  await assert.rejects(store.save({...a,matcher_version:'stored-program-3'}),/SAVE_VERSION_MISMATCH/)
  await assert.rejects(store.saveRematch(randomUUID(),{generation_version:'stored-program-3'}),/SAVE_VERSION_MISMATCH/)
  await assert.rejects(store.saveRematch(randomUUID(),{generation_version:MATCHER_VERSION}),/PROGRAM_REMATCH_V4_MIGRATION_REQUIRED/)
  assert.equal(calls.filter(c=>c.method==='POST').length,2)
})

test('repository policy must be explicitly true; plan reports missing/malformed policy without writing',async()=>{
  const paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis','save_concert_program_analysis_v3','save_concert_program_analysis_v4','review_concert_program_candidate_identity','save_concert_program_rematch','decide_automatic_program_candidate','plan_expired_concert_cleanup','delete_expired_concert'].map(n=>['/rpc/'+n,{}]))
  for(const policy of [[],null,{},[{}],[{enabled:'true'}],[{enabled:false}],[{enabled:true},{enabled:true}],[{enabled:true}]]){
    const repo=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
      assert.equal(init.method,'GET')
      if(url.pathname.endsWith('/concert_program_version_policy'))assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
      return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{schema_version:CLEANUP_SCHEMA_VERSION}:url.pathname.endsWith('/concert_program_version_policy')?policy:[]))
    }})
    const enabled=Array.isArray(policy)&&policy.length===1&&policy[0].enabled===true
    if(enabled)assert.equal((await repo.preflight()).analysis_version_enabled,true)
    else await assert.rejects(repo.preflight(),/VERSION_POLICY_REQUIRED|VERSION_DISABLED/)
    assert.equal((await repo.preflight({plan:true})).analysis_version_enabled,policy===null?'UNKNOWN':enabled)
  }
})
