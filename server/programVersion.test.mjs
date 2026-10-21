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

test('v3 version separates cache, payload hash and candidate provenance while preserving logical identity',()=>{
  const f=fixture(),a=analyzeStoredProgram(f),b=analyzeStoredProgram(f)
  assert.equal(MATCHER_VERSION,'stored-program-3')
  assert.deepEqual(a,b)
  assert.equal(a.matcher_version,MATCHER_VERSION)
  assert.notEqual(programAnalysisCacheKey(f),programAnalysisCacheKey(f,{version:'stored-program-2'}))
  const {payload_hash,...payload}=a
  assert.equal(payload_hash,hashJson(payload))
  assert.notEqual(payload_hash,hashJson({...payload,matcher_version:'stored-program-2'}))
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
  const first=await analyzeProgramTargets(store,{save:true,manifest,version:'stored-program-3'});assert.equal(first.failures.length,1);assert.equal(rows.size,1)
  const preserved=first.analyses[0].analysis_id;fail=false
  const second=await analyzeProgramTargets(store,{save:true,manifest,version:'stored-program-3'});assert.equal(second.failures.length,0);assert.equal(rows.size,2)
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

test('scheduled repository rejects an absent v3 RPC before writes while read-only plan reports the blocker',async()=>{
  const paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis','plan_expired_concert_cleanup','delete_expired_concert'].map(n=>['/rpc/'+n,{}]))
  const repo=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET')
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{schema_version:CLEANUP_SCHEMA_VERSION}:[]))
  }})
  await assert.rejects(repo.preflight(),{code:'PROGRAM_ANALYSIS_V3_MIGRATION_REQUIRED'})
  const plan=await repo.preflight({plan:true});assert.equal(plan.matcher_version,MATCHER_VERSION);assert.equal(plan.analysis_schema_ready,false)
  paths['/rpc/save_concert_program_analysis_v3']={}
  await assert.rejects(repo.preflight(),{code:'PROGRAM_WORK_IDENTITY_MIGRATION_REQUIRED'})
  paths['/rpc/review_concert_program_candidate_identity']={};paths['/rpc/save_concert_program_rematch']={}
  const disabled=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET')
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{schema_version:CLEANUP_SCHEMA_VERSION}:url.pathname.endsWith('/concert_program_version_policy')?[{enabled:false}]:[]))
  }})
  await assert.rejects(disabled.preflight(),{code:'PROGRAM_ANALYSIS_VERSION_DISABLED'})
  assert.equal((await disabled.preflight({plan:true})).analysis_version_enabled,false)
})

test('v3 save never falls back to legacy RPC when the reviewed SQL draft is absent',async()=>{
  const a=analyzeStoredProgram(fixture()),calls=[]
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
    calls.push(url.pathname);assert.equal(url.pathname,'/rest/v1/rpc/save_concert_program_analysis_v3')
    assert.equal(JSON.parse(init.body).p_analysis.matcher_version,MATCHER_VERSION)
    return new Response(JSON.stringify({code:'PGRST202'}),{status:404})
  }})
  await assert.rejects(store.save(a));assert.equal(calls.length,1)
  await assert.rejects(store.save({...a,matcher_version:'stored-program-2'}),/SAVE_VERSION_MISMATCH/)
  assert.equal(calls.length,1)
})
