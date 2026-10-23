import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {getProgramRollout,getProgramReviewVersion,getProgramSearchVersion} from './programRollout.mjs'
import {createSupabaseConcertSearch} from './supabaseConcertSearch.mjs'
import {createProgramAnalysisStore,analyzeProgramTargets} from './supabaseProgramAnalysis.mjs'
import {runProgramCli,parseProgramArgs} from '../scripts/analyzeConcertPrograms.mjs'
import {CATALOG_HASH,CATALOG_JSON} from './programAnalysis.mjs'
import {workIdentity} from './programWorkIdentity.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {runConcertPipeline} from './concertPipeline.mjs'
import {initialPipelineState} from './pipelineLocal.mjs'
import {PIPELINE_DEFAULTS} from './pipelineConfig.mjs'

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private'}
const f=()=>{
  const concert={id:randomUUID(),kopis_id:'PF900005',title:'Local rollout fixture',venue:'Local hall',region:'서울',start_date:'2026-10-20',end_date:'2026-10-20',performance_status:'공연예정',synced_at:'2026-10-20T00:00:00Z',program_context_revision:0}
  const image={id:randomUUID(),concert_id:concert.id,image_type:'DETAIL',is_active:true,evidence_revision:0,source_url:'https://kopis.or.kr/upload/fixture.png'}
  const ocr={id:randomUUID(),image_id:image.id,raw_text:'PROGRAM\nF Chopin\nBallade No.4 in F minor Op:52',detections:[],width:800,created_at:'2026-10-20T00:00:00Z'}
  const attempt={id:randomUUID(),image_id:image.id,result_id:ocr.id,status:'SUCCEEDED',created_at:ocr.created_at,finished_at:ocr.created_at}
  return {concert,image,ocr,attempt}
}
const query={region:'서울',from:'2026-10-20',to:'2026-10-21',targetTrackId:'chopin-ballade-op52-no4'}
const row=(t,version,status='CONFIRMED')=>({id:randomUUID(),concert_id:t.concert.id,concerts:t.concert,track_id:query.targetTrackId,work_id:query.targetTrackId,
  relation:'EXACT',outcome:'MATCHED',matcher_version:version,catalog_hash:CATALOG_HASH,review_status:status,effective_status:status,is_effectively_confirmed:status==='CONFIRMED',analysis_is_current:true,stale_reason:null,source_url:t.image.source_url,
  confirmed_work_identity_hash:workIdentity(JSON.parse(CATALOG_JSON),query.targetTrackId).hash,confirmation_matcher_version:version,confirmation_pipeline_version:EASYOCR_PIPELINE_VERSION})

test('rollout defaults split v4 writes, v3 review, v2 public search and disabled integrated runs',async()=>{
  const settings=getProgramRollout({})
  assert.deepEqual(settings,{writeVersion:'stored-program-4',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:false})
  assert.deepEqual(await runProgramCli(['config'],{env:{},print:()=>{}}),{implementation_version:'stored-program-4',...settings})
  assert.throws(()=>getProgramRollout({PROGRAM_ANALYSIS_WRITE_VERSION:'stored-program-2'}),/INVALID/)
  assert.throws(()=>getProgramRollout({PROGRAM_ANALYSIS_SCHEDULE_ENABLED:''}),/INVALID/)
})

test('v3 pending canary and even v3 confirmed rows cannot displace explicitly selected v2 public results',async()=>{
  const t=f(),v2=row(t,'stored-program-2'),v3=row(t,'stored-program-3','REVIEW_REQUIRED'),calls=[]
  const service=createSupabaseConcertSearch({env,now:()=>Date.parse('2026-10-20T00:00:00Z'),fetchImpl:async(url,init)=>{
    calls.push(url);assert.equal(init.method,'GET');return new Response(JSON.stringify([v2,v3,row(t,'stored-program-3')].sort((a,b)=>a.id.localeCompare(b.id))))
  }})
  const result=await service.search(query)
  assert.equal(result.analysisVersion,'stored-program-2');assert.equal(result.concerts.length,1)
  assert.equal(result.concerts[0].programAnalysisVersion,'stored-program-2')
  assert.equal(calls[0].searchParams.get('matcher_version'),'eq.stored-program-2')
})

test('only explicit v3/v4 search settings select those versions; no automatic union or latest fallback',async()=>{
  for(const version of ['stored-program-3','stored-program-4']){
  const t=f(),calls=[]
  const service=createSupabaseConcertSearch({env:{...env,PROGRAM_SEARCH_VERSION:version},now:()=>Date.parse('2026-10-20T00:00:00Z'),fetchImpl:async(url)=>{
    calls.push(url);return new Response(JSON.stringify(['stored-program-2','stored-program-3','stored-program-4'].map(v=>row(t,v)).sort((a,b)=>a.id.localeCompare(b.id))))
  }})
  const result=await service.search(query);assert.equal(result.analysisVersion,version);assert.equal(result.concerts.length,1)
  assert.equal(calls[0].searchParams.get('matcher_version'),`eq.${version}`)
  }
})

test('empty and unsupported search/review configuration fails before any DB request',async()=>{
  for(const value of ['', 'latest','stored-program-1','stored-program-99']){
    assert.throws(()=>getProgramSearchVersion({PROGRAM_SEARCH_VERSION:value}),/INVALID/)
    assert.throws(()=>getProgramReviewVersion({PROGRAM_REVIEW_VERSION:value}),/INVALID/)
    let calls=0
    const fetchImpl=()=>{calls++;throw new Error('MUST_NOT_FETCH')}
    const search=createSupabaseConcertSearch({env:{...env,PROGRAM_SEARCH_VERSION:value},fetchImpl})
    await assert.rejects(search.search(query),{code:'PROGRAM_SEARCH_VERSION_INVALID'})
    assert.equal(search.config().configured,false)
    await assert.rejects(createProgramAnalysisStore({env:{...env,PROGRAM_REVIEW_VERSION:value},fetchImpl}).candidates(),/INVALID/)
    assert.equal(calls,0)
  }
})

test('review lists use explicit v3 and a normal empty state while old UUID detail remains readable',async()=>{
  const t=f(),candidate={id:randomUUID(),analysis_id:randomUUID(),matcher_version:'stored-program-2',catalog_hash:CATALOG_HASH},calls=[]
  const store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
    calls.push(url);assert.equal(init.method,'GET')
    const table=url.pathname.split('/').at(-1)
    const values={concert_program_candidate_status:url.searchParams.has('id')?[candidate]:[],concert_program_analyses:[{id:candidate.analysis_id,ocr_result_id:t.ocr.id}],concert_image_ocr_results:[t.ocr],concert_program_reviews:[],concert_program_catalogs:[{catalog:JSON.parse(CATALOG_JSON)}]}
    return new Response(JSON.stringify(values[table]))
  }})
  const listed=await runProgramCli(['list'],{store,env:{},print:()=>{}})
  assert.equal(listed.review_version,'stored-program-3');assert.deepEqual(listed.candidates,[])
  assert.equal(calls[0].searchParams.get('matcher_version'),'eq.stored-program-3')
  const detail=await store.detail(candidate.id)
  assert.equal(detail.matcher_version,'stored-program-2');assert.equal(detail.review_version,'stored-program-3');assert.equal(detail.local_version_current,false)
})

test('v2/v3 row details and receipt history remain readable; v4 review selection requires explicit configuration',async()=>{
  for(const version of ['stored-program-2','stored-program-3','stored-program-4']){
    const t=f(),candidate={id:randomUUID(),analysis_id:randomUUID(),matcher_version:version,catalog_hash:CATALOG_HASH,track_id:query.targetTrackId,work_id:query.targetTrackId,review_status:'REVIEW_REQUIRED'}
    const receipt={id:randomUUID(),candidate_id:candidate.id,status:'CONFIRMED',note:'Local historical receipt',matcher_version:version}
    const before=structuredClone({candidate,receipt}),calls=[]
    const selectedEnv=version==='stored-program-4'?{...env,PROGRAM_REVIEW_VERSION:version}:env
    const store=createProgramAnalysisStore({env:selectedEnv,fetchImpl:async(url,init)=>{
      calls.push(url);assert.equal(init.method,'GET')
      const rows={concert_program_candidate_status:[candidate],concert_program_analyses:[{id:candidate.analysis_id,ocr_result_id:t.ocr.id,catalog_hash:CATALOG_HASH}],concert_image_ocr_results:[t.ocr],concert_program_reviews:[receipt],concert_program_catalogs:[{catalog:JSON.parse(CATALOG_JSON)}]}
      return new Response(JSON.stringify(rows[url.pathname.split('/').at(-1)]))
    }})
    const detail=await store.detail(candidate.id)
    assert.equal(detail.matcher_version,version);assert.deepEqual(detail.reviews,[receipt])
    assert.equal(detail.review_version,version==='stored-program-4'?version:'stored-program-3')
    assert.deepEqual({candidate,receipt},before)
    await store.candidates()
    assert.equal(calls.at(-1).searchParams.get('matcher_version'),`eq.${detail.review_version}`)
  }
})

test('disabled rollout skips the entire pipeline before credentials, preflight, DB, OCR or state writes',async()=>{
  const state=initialPipelineState(),before=structuredClone(state),reports=[]
  const fail=()=>{throw new Error('GATE_BYPASSED')}
  const result=await runConcertPipeline({runtime:{rollout:getProgramRollout({}),preflight:fail,repository:{snapshot:fail},worker:{recognize:fail,close(){}}},state,
    local:{saveState:fail,saveReport:async report=>reports.push(structuredClone(report))},options:PIPELINE_DEFAULTS,now:()=>Date.parse('2026-10-20T00:00:00Z')})
  assert.equal(result.status,'SKIPPED_ROLLOUT_GATE');assert.equal(result.exit_code,0);assert.ok(result.finished_at)
  assert.equal(result.stages.analysis.status,'SKIPPED_ROLLOUT_GATE');assert.equal(result.stages.collection.status,'NOT_RUN');assert.deepEqual(result.errors,[])
  assert.deepEqual(state,before);assert.equal(reports.length,1);assert.equal(reports[0].status,'SKIPPED_ROLLOUT_GATE')
})

test('manual manifest save orchestration requires explicit v4 and calls readiness before scope/save',async()=>{
  const t=f(),manifest={schema_version:'program-ocr-canary-1',source_run_id:randomUUID(),expected_count:1,targets:[{kopis_id:t.concert.kopis_id,ocr_result_id:t.ocr.id,source_analysis_id:randomUUID()}]},calls=[]
  const store={preflightSave:async()=>calls.push('preflight'),manifestTargets:async()=>{calls.push('targets');return {targets:[t],skipped:[],coverage:{}}},save:async()=>{calls.push('save');return randomUUID()}}
  const result=await analyzeProgramTargets(store,{save:true,version:'stored-program-4',manifest,env:{}})
  assert.equal(result.saved,1);assert.deepEqual(calls,['preflight','targets','save'])
  assert.equal(parseProgramArgs(['analyze','--save','--version','stored-program-4','--ocr-manifest','exact.json']).save,true)
  assert.throws(()=>parseProgramArgs(['analyze','--dry-run','--version','stored-program-3']),/WRITE_VERSION_NOT_IMPLEMENTED/)
})

test('unscoped saves and implicit/old versions are blocked before preflight even when schedule is enabled',async()=>{
  const fail=()=>{throw new Error('MUST_NOT_RUN')},store={preflightSave:fail,targets:fail,save:fail}
  for(const args of [['analyze','--save'],['analyze','--save','--version','stored-program-4'],['analyze','--save','--ocr-manifest','exact.json']])assert.throws(()=>parseProgramArgs(args),/REQUIRES/)
  await assert.rejects(analyzeProgramTargets(store,{save:true,env:{PROGRAM_ANALYSIS_SCHEDULE_ENABLED:'true'}}),/REQUIRES_OCR_MANIFEST/)
})

test('SQL/RPC preflight blocks canary before POST when schema is absent or version policy disables writes',async()=>{
  for(const ready of [false,true]){
    const calls=[],store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
      calls.push(init.method);return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths:ready?{'/rpc/save_concert_program_analysis_v4':{},'/rpc/review_concert_program_candidate_identity':{},'/rpc/save_concert_program_rematch':{}}:{}}:[{enabled:false}]))
    }})
    await assert.rejects(store.preflightSave(),ready?/DISABLED/:/MIGRATION_REQUIRED/)
    assert.ok(calls.every(method=>method==='GET'))
  }
})

test('full reanalysis uses pinned OCR manifests and refuses changed evidence without replacement',async()=>{
  const t=f(),manifest={schema_version:'program-ocr-manifest-2',expected_count:1,targets:[{kopis_id:t.concert.kopis_id,ocr_result_id:t.ocr.id,image_id:t.image.id,source_attempt_id:randomUUID(),image_revision:0,concert_revision:0}]}
  const store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET');assert.ok(!url.pathname.includes('/rpc/'))
    const rows={concert_image_ocr_results:[t.ocr],concert_program_images:[t.image],concerts:[t.concert],concert_image_ocr_attempts:[t.attempt]}
    return new Response(JSON.stringify(rows[url.pathname.split('/').at(-1)]))
  }})
  const scope=await store.manifestTargets(manifest);assert.equal(scope.targets.length,0);assert.equal(scope.skipped[0].reason,'MANIFEST_EVIDENCE_CHANGED')
  manifest.targets[0].source_attempt_id=t.attempt.id
  assert.equal((await store.manifestTargets(manifest)).targets.length,1)
})
