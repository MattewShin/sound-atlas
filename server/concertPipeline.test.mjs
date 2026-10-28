import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { runConcertPipeline } from './concertPipeline.mjs'
import { initialPipelineState, acquirePipelineLock, atomicJson, createPipelineLocal } from './pipelineLocal.mjs'
import { PIPELINE_DEFAULTS, parsePipelineArgs, pipelineError, serializePipelineReport, getPipelineStageSettings, pipelineStageSettings } from './pipelineConfig.mjs'
import { createPipelineRuntime } from './pipelineRuntime.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { analysisSelection } from './pipelineSelection.mjs'
import { createCollectionKopisClient } from './concertCollector.mjs'
import { fallbackCleanupPlan, cleanupCounts } from './pipelineCleanup.mjs'
import sharp from 'sharp'
import { getOcrImageConfig } from './ocrImageConfig.mjs'
import { downloadKopisImage, imageValidationKey } from './kopisImageDownload.mjs'
import { ocrSelection } from './pipelineSelection.mjs'
import { CollectionError } from './collectionHttp.mjs'
import { createMonotonicDeadline } from './pipelineDeadline.mjs'

const base=Date.parse('2026-10-15T00:00:00Z')
const cleanup=async path=>{assert.ok(resolve(path).startsWith(resolve(tmpdir())+sep)&&basename(path).startsWith('atlas-pipeline-'));await rm(path,{recursive:true,force:true})}
const listing=(n)=>({mt20id:`PF${900000+n}`,prfnm:`Local fixture ${n}`,fcltynm:'Local hall',area:'서울특별시',genrenm:'서양음악(클래식)',prfstate:'공연예정',
  prfpdfrom:'2026.10.20',prfpdto:'2026.10.20',styurls:{styurl:`https://kopis.or.kr/upload/fixture-${n}.png`}})
const harness=()=>{
  let time=base,tick=0
  const calls=[],data={concerts:[],images:[],results:[],attempts:[],analyses:[],candidates:[]}
  const state=initialPipelineState(),reports=[]
  const local={async saveState(){calls.push('checkpoint')},async saveReport(r){reports.push(structuredClone(r))}}
  const stamp=()=>new Date(time+(tick++)).toISOString()
  const runtime={
    rollout:{writeVersion:'stored-program-4',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:true},
    async preflight({plan}){calls.push('preflight');return {plan}},
    client:{async list({page,state}){calls.push(`list:${state}:${page}`);return page===1?Array.from({length:100},(_,i)=>listing(i+1)):[]},async detail(id){calls.push('detail:'+id);return listing(Number(id.slice(2))-900000)}},
    worker:{async recognize(){calls.push('recognize');return {raw_text:'PROGRAM\nChopin Ballade No.1 Op.23',detections:[],width:800,height:300,engine_version:'fixture',torch_version:'fixture',mean_confidence:null}},close(){calls.push('close')}},
    async download(url){calls.push('download');return {contentHash:createHash('sha256').update(url).digest('hex'),width:800,height:300,buffer:Buffer.from('fixture')}},
    repository:{
      async snapshot(){calls.push('snapshot');return structuredClone(data)},
      async cleanupPlan(limit,today){calls.push('cleanupPlan');return {...fallbackCleanupPlan({concerts:data.concerts,
        concert_program_images:data.images,concert_image_ocr_results:data.results,concert_image_ocr_attempts:data.attempts,
        concert_program_analyses:data.analyses,concert_program_candidates:data.candidates,concert_program_reviews:[]},today,limit),migration_required:false}},
      async cleanupDelete(id){calls.push('cleanupDelete');const concert=data.concerts.find(c=>c.id===id)
        if(!concert)return {status:'NOT_FOUND'}
        const images=data.images.filter(i=>i.concert_id===id).map(i=>i.id),analyses=data.analyses.filter(a=>a.concert_id===id).map(a=>a.id)
        const counts=cleanupCounts({concert_program_images:data.images,concert_image_ocr_results:data.results,concert_image_ocr_attempts:data.attempts,
          concert_program_analyses:data.analyses,concert_program_candidates:data.candidates,concert_program_reviews:[]},[concert])
        data.concerts=data.concerts.filter(c=>c.id!==id);data.images=data.images.filter(i=>i.concert_id!==id)
        data.results=data.results.filter(r=>!images.includes(r.image_id));data.attempts=data.attempts.filter(a=>!images.includes(a.image_id))
        data.analyses=data.analyses.filter(a=>a.concert_id!==id);data.candidates=data.candidates.filter(c=>!analyses.includes(c.analysis_id))
        return {status:'DELETED',kopis_id:concert.kopis_id,deleted_at:stamp(),counts}},
      collector:{async save(value){calls.push('saveConcert');let c=data.concerts.find(c=>c.kopis_id===value.concert.kopis_id);if(!c){c={id:randomUUID(),program_context_revision:0};data.concerts.push(c)}Object.assign(c,value.concert)
        for(const image of value.images)if(!data.images.some(i=>i.concert_id===c.id&&i.source_url===image.source_url))data.images.push({...image,id:randomUUID(),concert_id:c.id,is_active:true,evidence_revision:0})}},
      ocr:{async preflight(){calls.push('ocrPreflight')},async findResult(imageId,hash){calls.push('cacheLookup');return data.results.find(r=>r.image_id===imageId&&r.content_sha256===hash&&r.pipeline_version===EASYOCR_PIPELINE_VERSION)},
        async saveAttempt(attempt,result){calls.push('saveOcr');let r=data.results.find(r=>r.image_id===attempt.image_id&&r.content_sha256===attempt.content_sha256&&r.pipeline_version===attempt.pipeline_version)
          if(result&&!r){r={...result,id:randomUUID(),image_id:attempt.image_id,content_sha256:attempt.content_sha256,pipeline_version:attempt.pipeline_version,created_at:stamp()};data.results.push(r)}
          data.attempts.push({...attempt,result_id:result?r.id:null,created_at:stamp()})}},
      async ocrResult(id){calls.push('readOcr');return structuredClone(data.results.find(r=>r.id===id))},
      analysis:{async save(a){calls.push('saveAnalysis');let existing=data.analyses.find(x=>x.ocr_result_id===a.ocr_result_id&&x.source_attempt_id===a.source_attempt_id&&x.matcher_version===a.matcher_version&&x.catalog_hash===a.catalog_hash&&x.image_revision===a.image_revision&&x.concert_revision===a.concert_revision);if(existing)return existing.id
        for(const row of data.analyses)if(row.image_id===a.image_id)row.is_current=false
        existing={...a,id:randomUUID(),is_current:true,created_at:stamp()};data.analyses.push(existing)
        for(const c of a.candidates)data.candidates.push({...c,id:randomUUID(),analysis_id:existing.id})
        return existing.id}},
      async candidates(id){return structuredClone(data.candidates.filter(c=>c.analysis_id===id))},
      async reviewSummary(){calls.push('reviews');return data.candidates.filter(c=>c.review_status==='REVIEW_REQUIRED').map(c=>{const a=data.analyses.find(a=>a.id===c.analysis_id),concert=data.concerts.find(x=>x.id===a.concert_id);return {...c,matcher_version:a.matcher_version,catalog_hash:a.catalog_hash,stale_reason:a.is_current?null:'ANALYSIS_SUPERSEDED',kopis_id:concert.kopis_id,concert_title:concert.title}})},
    },
  }
  const run=(options={},plan=false,signal,clockOptions={})=>runConcertPipeline({runtime,local,state,options:{...PIPELINE_DEFAULTS,...options},plan,now:()=>time,signal,...clockOptions})
  return {runtime,local,state,data,calls,reports,run,advance:ms=>{time+=ms}}
}

test('stage booleans default ON and reject malformed OFF settings without changing profile limits',()=>{
  assert.deepEqual(getPipelineStageSettings({}),{cleanup:true,collection:true,ocr:true,analysis:true})
  const env={PIPELINE_CLEANUP_ENABLED:'false',PIPELINE_COLLECTION_ENABLED:'true',PIPELINE_OCR_ENABLED:'false',PIPELINE_ANALYSIS_ENABLED:'false'}
  const {options}=parsePipelineArgs(['plan','--profile','daily'],env)
  assert.deepEqual(options.stageSettings,{cleanup:false,collection:true,ocr:false,analysis:false})
  assert.equal(options.ocrLimit,20);assert.equal(options.analysisLimit,20)
  for(const name of Object.keys(env))for(const value of ['','0','1','yes','FALSE'])assert.throws(()=>getPipelineStageSettings({...env,[name]:value}),{code:name+'_INVALID'})
  assert.throws(()=>pipelineStageSettings({ocr:'false'}),{code:'PIPELINE_STAGE_SETTING_INVALID'})
  assert.throws(()=>pipelineStageSettings({unknown:false}),{code:'PIPELINE_STAGE_SETTING_INVALID'})
  assert.throws(()=>parsePipelineArgs(['plan','--analysis-only','--ocr-manifest','fixture.json'],env),{code:'PIPELINE_ANALYSIS_DISABLED'})
})

test('collection-only simulation and plan never select or invoke disabled cleanup/OCR/analysis/automatic work',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1})
  h.advance(25*3600000);h.calls.length=0
  const disabled=()=>assert.fail('Disabled stage capability accessed')
  h.runtime.download=disabled;h.runtime.prepareOcr=disabled;h.runtime.ocrStageRepository=disabled
  h.runtime.worker={recognize:disabled,close:disabled}
  const repo=h.runtime.repository,snapshot=repo.snapshot
  for(const name of ['cleanupPlan','cleanupDelete','ocrResult','candidates','reviewSummary'])repo[name]=disabled
  repo.analysis={save:disabled};repo.ocr={saveAttempt:disabled}
  repo.automation=new Proxy({},{get:disabled})
  repo.snapshot=async()=>{
    const data=await snapshot()
    for(const name of ['images','results','attempts','analyses'])Object.defineProperty(data,name,{get:disabled})
    return data
  }
  const stageSettings={cleanup:false,collection:true,ocr:false,analysis:false}
  const a=await h.run({stageSettings,collectLimit:1})
  assert.equal(a.status,'SUCCESS');assert.equal(a.stages.collection.succeeded,1)
  assert.ok(h.calls.includes('saveConcert'))
  assert.deepEqual(a.stage_settings,stageSettings)
  for(const name of ['cleanup','ocr','analysis'])assert.equal(a.stages[name].status,'SKIPPED_DISABLED')
  assert.deepEqual(a.priority_selection.ocr,[]);assert.deepEqual(a.priority_selection.analysis,[])
  const before=structuredClone(h.state);h.calls.length=0
  const p=await h.run({stageSettings},true)
  assert.equal(p.status,'PLAN_READY');assert.equal(p.plan.automatic_decisions_enabled,false)
  assert.deepEqual(p.plan.stage_settings,stageSettings);assert.deepEqual(p.environment.stage_settings,stageSettings)
  assert.equal(p.plan.ocr_calls,0);assert.equal(p.plan.db_writes,0)
  assert.equal(p.plan.active_detail_images,'NOT_SCANNED_DISABLED');assert.deepEqual(h.state,before)
  assert.deepEqual(h.calls,['preflight','snapshot'])
})

test('all stages OFF preserves collection cursor and performs no work beyond mock preflight/snapshot/checkpoint',async()=>{
  const h=harness(),before=structuredClone(h.state)
  h.runtime.worker={close:()=>assert.fail('OFF worker closed')}
  const a=await h.run({stageSettings:{cleanup:false,collection:false,ocr:false,analysis:false}})
  assert.equal(a.status,'SUCCESS');assert.deepEqual(h.state,before)
  assert.ok(!h.calls.some(c=>/^list:|^detail:|^save|download|recognize|cleanup/.test(c)))
  assert.deepEqual(a.priority_selection,{collection:[],ocr:[],analysis:[]})
})

test('OCR OFF can analyze existing OCR without downloading or starting a worker',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1});h.data.analyses=[];h.calls.length=0
  const fail=()=>assert.fail('OCR disabled')
  h.runtime.download=fail;h.runtime.prepareOcr=fail;h.runtime.worker={recognize:fail,close:fail}
  const a=await h.run({stageSettings:{cleanup:false,collection:false,ocr:false,analysis:true}})
  assert.equal(a.status,'SUCCESS');assert.equal(a.stages.analysis.succeeded,1)
  assert.ok(h.calls.includes('saveAnalysis'));assert.ok(!h.calls.some(c=>c.startsWith('list:')))
})

test('analysis OFF blocks automatic queue and decisions while OCR simulation remains ON',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1});h.data.results=[];h.data.attempts=[];h.advance(25*3600000);h.calls.length=0
  h.runtime.repository.automation=new Proxy({},{get:()=>assert.fail('Automatic queue accessed while analysis OFF')})
  h.runtime.repository.analysis={save:()=>assert.fail('Analysis saved while OFF')}
  const a=await h.run({stageSettings:{cleanup:false,collection:false,ocr:true,analysis:false},ocrLimit:1})
  assert.equal(a.status,'SUCCESS');assert.equal(a.stages.ocr.attempted,1)
  assert.ok(h.calls.includes('saveOcr'));assert.ok(!h.calls.includes('saveAnalysis'))
  assert.deepEqual(a.priority_selection.analysis,[])
})

test('collection-only real runtime preflight skips unavailable Python and disabled schemas; mocked transport permits only collector POST',async()=>{
  const calls=[],env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-secret',KOPIS_SERVICE_KEY:'fixture-key',
    PIPELINE_CLEANUP_ENABLED:'false',PIPELINE_COLLECTION_ENABLED:'true',PIPELINE_OCR_ENABLED:'false',PIPELINE_ANALYSIS_ENABLED:'false',
    EASYOCR_TIMEOUT_MS:'invalid-disabled-config',EASYOCR_PYTHON:'missing-fixture-python'}
  const runtime=createPipelineRuntime({env,fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method})
    assert.equal(url.origin,env.SUPABASE_URL)
    assert.ok(['/rest/v1/','/rest/v1/concerts','/rest/v1/concert_program_images','/rest/v1/rpc/sync_kopis_concert'].includes(url.pathname))
    if(init.method==='POST')assert.equal(url.pathname,'/rest/v1/rpc/sync_kopis_concert')
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths:{'/rpc/sync_kopis_concert':{}}}:url.pathname.endsWith('/sync_kopis_concert')?'00000000-0000-4000-8000-000000000001':[]))
  }})
  const p=await runtime.preflight({plan:true}),runPreflight=await runtime.preflight({plan:false})
  assert.equal(p.python_file_checked,false);assert.equal(p.model_files_checked,false);assert.equal(p.python_dependencies_checked,false)
  assert.equal(runPreflight.analysis_version_enabled,'SKIPPED_DISABLED')
  assert.equal(runtime.worker,undefined);assert.equal(runtime.download,undefined);assert.equal(runtime.prepareOcr,undefined)
  assert.equal(runtime.repository.ocr,undefined);assert.equal(runtime.repository.analysis,undefined);assert.equal(runtime.repository.automation,undefined)
  await runtime.repository.snapshot({region:'서울',from:'2026-10-23',to:'2026-11-22'},1)
  const options=parsePipelineArgs(['plan','--profile','daily'],env).options
  const plan=await runConcertPipeline({runtime,options,plan:true,state:initialPipelineState(),
    local:{saveState:()=>assert.fail('Plan checkpoint write'),saveReport:()=>assert.fail('Plan report write')}})
  assert.equal(plan.status,'PLAN_READY');assert.deepEqual(plan.plan.stage_settings,options.stageSettings)
  assert.equal(plan.plan.automatic_decisions_enabled,false);assert.equal(plan.plan.ocr_calls,0);assert.equal(plan.plan.db_writes,0)
  assert.deepEqual(plan.priority_selection.ocr,[]);assert.deepEqual(plan.priority_selection.analysis,[])
  assert.ok(calls.every(c=>c.method==='GET'))
  await runtime.repository.collector.save({concert:{kopis_id:'PF000001'},images:[]})
  assert.deepEqual(calls.filter(c=>c.method==='POST'),[{path:'/rest/v1/rpc/sync_kopis_concert',method:'POST'}])
})

test('collection OFF needs no KOPIS key and preflight rejects a settings mismatch before any transport',async()=>{
  const runtime=createPipelineRuntime({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-secret',
    PIPELINE_COLLECTION_ENABLED:'false',PIPELINE_OCR_ENABLED:'false',PIPELINE_ANALYSIS_ENABLED:'false'},fetchImpl:()=>assert.fail('No transport expected')})
  assert.equal(runtime.client,undefined)
  await assert.rejects(runtime.preflight({plan:true,stageSettings:{cleanup:false,collection:true,ocr:false,analysis:false}}),{code:'PIPELINE_STAGE_SETTINGS_MISMATCH'})
})

test('pipeline uses collect -> OCR -> analysis, caps attempts and resumes past the first ten',async()=>{
  const h=harness(),a=await h.run()
  assert.equal(a.status,'SUCCESS');assert.equal(a.exit_code,0)
  assert.equal(a.matcher_version,'stored-program-4')
  assert.equal(a.stages.collection.attempted,10);assert.equal(a.stages.ocr.attempted,3);assert.equal(a.stages.analysis.succeeded,3)
  assert.equal(a.review.new_candidates,3);assert.equal(a.review.new_linked_candidates,3)
  assert.ok(h.calls.indexOf('saveConcert')<h.calls.indexOf('recognize'))
  assert.ok(h.calls.indexOf('cleanupPlan')<h.calls.indexOf('list:02:1'))
  assert.ok(h.calls.lastIndexOf('saveOcr')<h.calls.indexOf('saveAnalysis'))
  assert.equal(h.state.collection.cycle,1);assert.equal(h.state.collection.pending.length,90)
  const first=h.data.concerts.map(c=>c.kopis_id)
  h.calls.length=0
  const b=await h.run()
  assert.equal(b.stages.collection.attempted,10);assert.equal(h.data.concerts.length,20)
  assert.ok(h.calls.filter(c=>c.startsWith('detail:')).every(c=>!first.includes(c.slice(7))))
  assert.ok(h.calls.includes('list:02:2'))
  assert.equal(b.review.new_candidates,3)
  h.advance(25*3600000);h.calls.length=0
  await h.run()
  const refreshed=h.calls.filter(c=>c.startsWith('detail:')).map(c=>c.slice(7))
  assert.ok(refreshed.some(id=>first.includes(id)),'oldest stored concerts also get slots')
  assert.ok(refreshed.some(id=>!first.includes(id)),'new discovery still advances')
})

test('list page cap advances the saved cursor and reports incomplete discovery',async()=>{
  const h=harness()
  const r=await h.run({collectLimit:120,listPages:1,ocrLimit:1,analysisLimit:1})
  assert.equal(r.stages.collection.pages,1);assert.equal(r.stages.collection.page_limit_reached,true)
  assert.equal(h.state.collection.page,2)
  const b=await h.run({collectLimit:1,listPages:1,ocrLimit:1,analysisLimit:1})
  assert.equal(b.stages.collection.pages,1)
  assert.ok(h.calls.includes('list:02:2'))
})

test('daily pipeline finalizes program links automatically and reuses completed decisions without a manual queue',async()=>{
 const h=harness(),data=h.data,repo=h.runtime.repository
 let decisions=0
 repo.automation={
  queue:async limit=>data.analyses.filter(a=>a.is_current&&!a.auto_done).slice(0,limit),
  target:async a=>({concert:data.concerts.find(c=>c.id===a.concert_id),image:data.images.find(i=>i.id===a.image_id),ocr:data.results.find(o=>o.id===a.ocr_result_id),attempt:data.attempts.find(t=>t.id===a.source_attempt_id)}),
  saveAnalysis:a=>repo.analysis.save(a),scope:async()=> 'unchanged',candidates:id=>repo.candidates(id),
  decide:async({candidate,decision})=>{decisions++;Object.assign(data.candidates.find(c=>c.id===candidate.id),{review_status:decision.status,auto_input_hash:'unchanged'});return {outcome:decision.status==='CONFIRMED'?'AUTO_CONFIRMED':'AUTO_UNLINKED',reasons:decision.reasons}},
  finish:async id=>{data.analyses.find(a=>a.id===id).auto_done=true}}
 const first=await h.run({collectLimit:3})
 assert.equal(first.automation.confirmed,3);assert.equal(first.review.operational_queue,false);assert.deepEqual(first.review.priority,[])
 assert(data.candidates.every(c=>c.review_status==='CONFIRMED'))
 h.state.collection.pending=[];h.runtime.client.list=async()=>[]
 const second=await h.run()
 assert.equal(second.automation.confirmed,0);assert.equal(decisions,3)
})

test('cleanup respects its cap, prunes expired retries and cannot reingest expired list entries',async()=>{
  const h=harness();await h.run({collectLimit:3,ocrLimit:1})
  for(const concert of h.data.concerts){concert.start_date='2026-10-01';concert.end_date='2026-10-14'}
  h.state.collection.pending.unshift('PF900001');h.state.collection.dates.PF900001={from:'2026-10-01',to:'2026-10-14'}
  h.state.retries['collect:PF900001']={failures:1,until:base+3600000}
  const oldImage=h.data.images.find(i=>i.concert_id===h.data.concerts.find(c=>c.kopis_id==='PF900001').id)
  h.state.retries['ocr:'+oldImage.id]={failures:1,until:base+3600000}
  h.runtime.client.list=async()=>{h.calls.push('list:expired-fixture');return [{...listing(1),prfpdfrom:'2026.10.01',prfpdto:'2026.10.14'}]}
  h.state.collection.pending=['PF900001']
  h.calls.length=0
  const a=await h.run({cleanupLimit:1,collectLimit:1,ocrLimit:1})
  assert.equal(a.stages.cleanup.succeeded,1);assert.equal(a.stages.cleanup.remaining,2);assert.equal(a.stages.cleanup.limit_reached,true)
  assert.equal(a.stages.cleanup.deleted_counts.concerts,1);assert.ok(h.calls.indexOf('cleanupDelete')<h.calls.indexOf('list:expired-fixture'))
  assert.equal(h.calls.some(c=>c.startsWith('detail:')),false)
  const b=await h.run({cleanupLimit:100,collectLimit:1,ocrLimit:1})
  assert.equal(b.stages.cleanup.succeeded,2);assert.equal(b.stages.cleanup.remaining,0)
  const c=await h.run({collectLimit:1,ocrLimit:1})
  assert.equal(c.stages.cleanup.succeeded,0);assert.equal(c.stages.cleanup.deleted_counts.concerts,0)
  assert.equal(h.data.concerts.length,0)
})

test('cleanup failure continues collection; collection failure does not undo cleanup; missing schema is fatal first',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1})
  h.data.concerts[0].start_date='2026-10-01';h.data.concerts[0].end_date='2026-10-14'
  h.runtime.repository.cleanupDelete=async()=>{throw pipelineError('SUPABASE_HTTP_400')}
  const a=await h.run({collectLimit:1,ocrLimit:1})
  assert.equal(a.status,'PARTIAL');assert.equal(a.stages.cleanup.failed,1);assert.equal(a.stages.collection.succeeded,1)
  const offline=harness();await offline.run({collectLimit:1,ocrLimit:1})
  offline.data.concerts[0].start_date='2026-10-01';offline.data.concerts[0].end_date='2026-10-14'
  offline.runtime.client.list=async()=>{throw pipelineError('KOPIS_REQUEST_FAILED')}
  const b=await offline.run({collectLimit:1,ocrLimit:1})
  assert.equal(b.stages.cleanup.succeeded,1);assert.equal(b.status,'PARTIAL')
  const missing=harness(),before=JSON.stringify(missing.state)
  missing.runtime.preflight=async()=>{throw pipelineError('CLEANUP_MIGRATION_REQUIRED')}
  const c=await missing.run();assert.equal(c.status,'FATAL');assert.equal(c.exit_code,2)
  assert.equal(missing.calls.includes('cleanupDelete'),false);assert.equal(missing.calls.some(c=>c.startsWith('list:')),false)
  assert.equal(JSON.stringify(missing.state),before)
})

test('cached OCR and identical evidence, including empty analyses, preserve manual decisions',async()=>{
  for(const empty of [false,true]){
    const h=harness()
    h.runtime.client.list=async()=>[listing(1)]
    if(empty)h.runtime.worker.recognize=async()=>({raw_text:'PROGRAM\nTicket Information',detections:[],width:800,height:300,engine_version:'fixture',torch_version:'fixture'})
    const first=await h.run({collectLimit:1,ocrLimit:1})
    assert.equal(first.review.new_candidates,empty?0:1)
    const old=h.data.candidates[0]
    if(old){old.review_status='CONFIRMED';old.review_note='Kept local review';old.reviewed_at='fixture'}
    // PostgreSQL JSON object key order differs from JS construction order.
    h.data.analyses[0].concert_context=Object.fromEntries(Object.entries(h.data.analyses[0].concert_context).reverse())
    h.advance(25*3600000);h.calls.length=0
    const again=await h.run({collectLimit:1,ocrLimit:1})
    assert.equal(again.stages.ocr.reused,1);assert.equal(again.stages.analysis.reused,1)
    assert.equal(again.review.new_candidates,0);assert.equal(again.review.new_linked_candidates,0)
    assert.equal(h.calls.includes('recognize'),false);assert.equal(h.calls.includes('saveOcr'),false);assert.equal(h.calls.includes('saveAnalysis'),false)
    assert.equal(h.data.analyses.length,1)
    if(old){assert.equal(old.review_status,'CONFIRMED');assert.equal(old.review_note,'Kept local review')}
  }
})

test('individual failures continue and back off; collection outage still analyzes saved valid OCR',async()=>{
  const h=harness(),detail=h.runtime.client.detail
  h.runtime.client.detail=async id=>{if(id==='PF900001')throw pipelineError('KOPIS_REQUEST_FAILED');return detail(id)}
  const a=await h.run({collectLimit:3,ocrLimit:1})
  assert.equal(a.status,'PARTIAL');assert.equal(a.exit_code,1);assert.equal(a.stages.collection.succeeded,2);assert.equal(a.stages.analysis.succeeded,1)
  assert.ok(h.state.retries['collect:PF900001'].until>base)
  h.calls.length=0;await h.run({collectLimit:2,ocrLimit:1});assert.ok(!h.calls.includes('detail:PF900001'))
  // Force an unanalyzed valid artifact; existing OCR is processed despite list failure.
  h.data.analyses=[];h.data.candidates=[]
  h.runtime.client.list=async()=>{throw pipelineError('KOPIS_REQUEST_FAILED')}
  const outage=await h.run({collectLimit:1,ocrLimit:1})
  assert.equal(outage.status,'PARTIAL');assert.ok(outage.stages.analysis.succeeded>0)
  const fatal=harness();fatal.runtime.preflight=async()=>{throw pipelineError('SUPABASE_HTTP_401')}
  const r=await fatal.run();assert.equal(r.exit_code,2);assert.equal(r.status,'FATAL');assert.equal(fatal.calls.some(c=>c.startsWith('detail:')),false)
})

test('HTTP 400 diagnostics preserve previous data and reviews, continue other concerts and retain cooldown',async()=>{
  const h=harness()
  await h.run({collectLimit:1,ocrLimit:1})
  const oldConcert=structuredClone(h.data.concerts[0]),oldImages=structuredClone(h.data.images)
  const reviewed=h.data.candidates[0];reviewed.review_status='CONFIRMED';reviewed.review_note='Existing manual review'
  h.advance(25*3600000)
  h.state.priority.collect.slot=4 // Exercise the reserved maintenance slot.
  const detail=h.runtime.client.detail;let requests=0
  const failedClient=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'fixture-secret'},delay:async()=>{},
    fetchImpl:async()=>{requests++;return new Response('service=fixture-secret private upstream body',{status:400,headers:{'Content-Type':'text/html; charset=UTF-8'}})}})
  h.runtime.client.detail=id=>id===oldConcert.kopis_id?failedClient.detail(id):detail(id)
  const report=await h.run({collectLimit:3,ocrLimit:1})
  assert.equal(requests,1);assert.equal(report.status,'PARTIAL');assert.equal(report.exit_code,1)
  assert.equal(report.stages.collection.failed,1);assert.equal(report.stages.collection.succeeded,2)
  const error=report.errors.find(e=>e.id===oldConcert.kopis_id)
  assert.deepEqual(error.http,{http_status:400,content_type:'text/html',endpoint:`/openApi/restful/pblprfr/${oldConcert.kopis_id}`,query_parameter_names:['service']})
  assert.deepEqual(error.kopis.request,{origin:'https://kopis.or.kr',method:'GET',endpoint:`/openApi/restful/pblprfr/${oldConcert.kopis_id}`,query:{}})
  assert.equal(error.kopis.response.http_status,400)
  assert.ok(error.kopis.response.body_fingerprint)
  assert.ok(error.retry_at);assert.equal(h.state.retries['collect:'+oldConcert.kopis_id].failures,1)
  assert.deepEqual(h.data.concerts.find(c=>c.id===oldConcert.id),oldConcert)
  assert.deepEqual(h.data.images.filter(i=>i.concert_id===oldConcert.id),oldImages)
  assert.equal(reviewed.review_status,'CONFIRMED');assert.equal(reviewed.review_note,'Existing manual review')
  assert.ok(!JSON.stringify(report).includes('fixture-secret'));assert.ok(!JSON.stringify(report).includes('private upstream body'))
})

test('failed image does not block others; cache verification can recover failure without another OCR',async()=>{
  const h=harness();let count=0
  h.runtime.worker.recognize=async()=>{if(count++===0)throw pipelineError('EASYOCR_RECOGNITION_FAILED');return {raw_text:'PROGRAM\nChopin Ballade No.1 Op.23',detections:[],width:800,height:300,engine_version:'fixture',torch_version:'fixture'}}
  const first=await h.run({collectLimit:3,ocrLimit:3})
  assert.equal(first.stages.ocr.failed,1);assert.equal(first.stages.ocr.succeeded,2);assert.equal(first.stages.analysis.succeeded,2)
  const image=h.data.images.find(i=>h.data.results.some(r=>r.image_id===i.id)),artifact=h.data.results.find(r=>r.image_id===image.id)
  h.data.attempts.push({id:randomUUID(),image_id:image.id,result_id:null,status:'FAILED',created_at:new Date(base+10000).toISOString(),finished_at:new Date(base+10000).toISOString()})
  h.advance(25*3600000);h.calls.length=0
  // The existing active image is the only OCR target in this local fixture.
  h.data.images=h.data.images.filter(i=>i.id===image.id)
  h.runtime.client.list=async()=>[]
  h.runtime.repository.collector.save=async()=>{}
  const next=await h.run({collectLimit:1,ocrLimit:1})
  assert.equal(next.stages.ocr.cached_recovery_records,1)
  assert.equal(h.calls.includes('recognize'),false)
  assert.equal(h.data.results.filter(r=>r.image_id===image.id).length,1)
  assert.equal(h.data.attempts.filter(a=>a.image_id===image.id).at(-1).result_id,artifact.id)
})

const heldHarness=async()=>{
  const h=harness(),config={...getOcrImageConfig({}),maxPixels:100000}
  const jpeg=async(width,height)=>sharp({create:{width,height,channels:3,background:'white'}}).jpeg().toBuffer()
  const bytes=new Map([[listing(1).styurls.styurl,await jpeg(500,500)],[listing(2).styurls.styurl,await jpeg(8,12)]])
  h.runtime.imageValidationKey=imageValidationKey(config)
  h.runtime.client.list=async()=>[listing(1),listing(2)]
  h.runtime.download=async(url,options={})=>{h.calls.push('download:'+url);return downloadKopisImage(url,{config,knownLimit:options.knownLimit,
    fetchImpl:async()=>new Response(bytes.get(url)||Buffer.from('corrupt'))})}
  await h.run({collectLimit:2,ocrLimit:3})
  h.runtime.client.list=async()=>[];h.runtime.repository.collector.save=async()=>{}
  return {...h,config,bytes,jpeg,bad:h.data.images.find(i=>i.source_url===listing(1).styurls.styurl),good:h.data.images.find(i=>i.source_url===listing(2).styurls.styurl)}
}

test('image limit baseline preserves history, waits 24 hours, reports holds in read-only plan and suppresses identical failures after restart',async()=>{
  const h=await heldHarness(),first=h.reports.at(-1),key='ocr:'+h.bad.id
  assert.equal(first.status,'PARTIAL');assert.equal(first.stages.ocr.new_limit_failures,1)
  assert.equal(first.stages.ocr.failed,1);assert.equal(first.stages.ocr.succeeded,1)
  assert.equal(first.ocr_holds.count,1);assert.equal(first.ocr_holds.items[0].reason,'PIXEL_LIMIT')
  assert.equal(h.state.retries[key].until,base+24*3600000)
  assert.equal(h.data.results.some(r=>r.image_id===h.bad.id),false)
  const failed=h.data.attempts.find(a=>a.image_id===h.bad.id)
  assert.equal(failed.status,'FAILED');assert.match(failed.content_sha256,/^[a-f0-9]{64}$/)
  h.data.candidates[0].review_status='CONFIRMED';h.data.candidates[0].review_note='Keep manual decision'
  const original=structuredClone(h.data)
  // The on-disk checkpoint schema is sufficient after a process restart.
  const directory=await mkdtemp(join(tmpdir(),'atlas-pipeline-hold-'))
  try{
    const local=createPipelineLocal(directory,'hold',{})
    await local.saveState(h.state);Object.assign(h.state,await local.readState())
  }finally{await cleanup(directory)}
  h.advance(24*3600000-1);h.calls.length=0
  const before=JSON.stringify(h.state),plan=await h.run({},true)
  assert.equal(plan.plan.ocr_held,1);assert.equal(plan.ocr_holds.count,1)
  assert.equal(plan.ocr_holds.items[0].status,'WAITING_SOURCE_RECHECK')
  assert.equal(Date.parse(plan.ocr_holds.items[0].next_check_at),base+24*3600000)
  assert.deepEqual(h.calls,['preflight','snapshot','cleanupPlan','close'])
  assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.data,original)
  h.calls.length=0
  const waiting=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(waiting.status,'SUCCESS');assert.equal(waiting.stages.ocr.held_skipped,1)
  assert.equal(h.calls.some(c=>c.startsWith('download:')),false)
  h.advance(1);h.calls.length=0
  const duePlan=await h.run({},true)
  assert.equal(duePlan.ocr_holds.items[0].status,'SOURCE_RECHECK_DUE')
  assert.equal(h.calls.some(c=>c.startsWith('download:')),false)
  h.calls.length=0
  const unchanged=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(unchanged.status,'SUCCESS');assert.equal(unchanged.stages.ocr.failed,0)
  assert.equal(unchanged.stages.ocr.held_unchanged,1);assert.equal(unchanged.stages.ocr.attempted,0)
  assert.equal(unchanged.ocr_holds.count,1);assert.equal(h.state.retries[key].failures,1)
  assert.equal(h.state.retries[key].until,base+48*3600000)
  assert.equal(h.calls.includes('recognize'),false);assert.equal(h.calls.includes('saveOcr'),false)
  assert.equal(h.calls.includes('saveAnalysis'),false);assert.deepEqual(h.data,original)
})

test('changed oversized bytes are a new failure; changed valid bytes return to OCR and analysis without altering other evidence',async()=>{
  const h=await heldHarness(),originalFailed=structuredClone(h.data.attempts.find(a=>a.image_id===h.bad.id))
  h.data.candidates[0].review_status='CONFIRMED';h.data.candidates[0].review_note='Preserved'
  const goodEvidence=structuredClone({result:h.data.results.find(r=>r.image_id===h.good.id),
    analysis:h.data.analyses.find(a=>a.image_id===h.good.id),candidates:h.data.candidates})
  h.bytes.set(h.bad.source_url,await h.jpeg(501,500));h.advance(24*3600000)
  const changed=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(changed.status,'PARTIAL');assert.equal(changed.stages.ocr.new_limit_failures,1)
  assert.equal(changed.stages.ocr.held_unchanged,0);assert.equal(changed.ocr_holds.count,1)
  const attempts=h.data.attempts.filter(a=>a.image_id===h.bad.id)
  assert.equal(attempts.length,2);assert.notEqual(attempts[0].content_sha256,attempts[1].content_sha256)
  assert.equal(h.data.results.some(r=>r.image_id===h.bad.id),false)
  h.bytes.set(h.bad.source_url,await h.jpeg(16,16));h.advance(24*3600000);h.calls.length=0
  const recovered=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(recovered.status,'SUCCESS');assert.equal(recovered.ocr_holds.count,0)
  assert.equal(recovered.stages.ocr.succeeded,1);assert.equal(recovered.stages.analysis.succeeded,1)
  assert.equal(h.state.retries['ocr:'+h.bad.id],undefined)
  assert.deepEqual(h.data.attempts.find(a=>a.id===originalFailed.id),originalFailed)
  assert.deepEqual(h.data.results.find(r=>r.image_id===h.good.id),goodEvidence.result)
  assert.deepEqual(h.data.analyses.find(a=>a.image_id===h.good.id),goodEvidence.analysis)
  assert.deepEqual(h.data.candidates.filter(c=>c.analysis_id===goodEvidence.analysis.id),goodEvidence.candidates)
  assert.equal(h.bad.is_active,true)
})

test('generic historical INVALID does not establish a hold; changed URL or validation conditions invalidate a known hold',async()=>{
  const h=await heldHarness(),key='ocr:'+h.bad.id
  const snapshot=structuredClone(h.data)
  assert.equal(ocrSelection(snapshot,h.state,base,24,h.runtime.imageValidationKey).ready.some(i=>i.id===h.bad.id),false)
  assert.equal(ocrSelection(snapshot,h.state,base,24,'changed limits').ready.some(i=>i.id===h.bad.id),true)
  snapshot.images.find(i=>i.id===h.bad.id).source_url='https://kopis.or.kr/upload/replacement.jpg'
  assert.equal(ocrSelection(snapshot,h.state,base,24,h.runtime.imageValidationKey).ready.some(i=>i.id===h.bad.id),true)
  // Pre-upgrade FAILED record has no content hash. It remains untouched; a new
  // bounded download/validation is needed before establishing a baseline.
  delete h.state.retries[key].image_limit
  const legacy=h.data.attempts.find(a=>a.image_id===h.bad.id)
  legacy.error_code='OCR_IMAGE_INVALID';legacy.content_sha256=null
  const savedLegacy=structuredClone(legacy)
  h.advance(24*3600000)
  const first=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(first.ocr_holds.count,1)
  assert.deepEqual(h.data.attempts.find(a=>a.id===legacy.id),savedLegacy)
  assert.equal(h.data.attempts.filter(a=>a.image_id===h.bad.id).length,2)
})

test('other corrupt images keep PARTIAL policy while an unchanged limit hold is skipped',async()=>{
  const h=await heldHarness()
  h.bytes.set(h.good.source_url,Buffer.from('damaged'));h.advance(24*3600000);h.calls.length=0
  const report=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(report.status,'PARTIAL');assert.equal(report.stages.ocr.failed,1)
  assert.equal(report.stages.ocr.held_unchanged,1);assert.equal(report.stages.ocr.new_limit_failures,0)
  assert.equal(report.errors.some(e=>e.id===h.good.id&&e.code==='OCR_IMAGE_INVALID'),true)
  assert.equal(report.ocr_holds.count,1);assert.equal(report.ocr_holds.items[0].image_id,h.bad.id)
  assert.equal(h.data.results.filter(r=>r.image_id===h.good.id).length,1)
})

test('URL/condition changes are revalidated before the old hold expires; source-check HTTP failures remain distinct',async()=>{
  const h=await heldHarness(),key='ocr:'+h.bad.id
  h.bad.source_url='https://kopis.or.kr/upload/replacement.png'
  h.bytes.set(h.bad.source_url,await h.jpeg(10,10))
  const recovery=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(recovery.ocr_holds.count,0);assert.equal(recovery.stages.ocr.succeeded,1)
  const changed=await heldHarness()
  changed.config.maxPixels=110000;changed.runtime.imageValidationKey=imageValidationKey(changed.config)
  const updated=await changed.run({collectLimit:1,ocrLimit:3})
  assert.equal(updated.stages.ocr.new_limit_failures,1)
  assert.equal(changed.data.attempts.filter(a=>a.image_id===changed.bad.id).length,2)
  assert.equal(changed.state.retries['ocr:'+changed.bad.id].image_limit.validationKey,changed.runtime.imageValidationKey)
  const failing=await heldHarness(),download=failing.runtime.download
  failing.advance(24*3600000)
  failing.runtime.download=(url,options)=>url===failing.bad.source_url?downloadKopisImage(url,{config:failing.config,
    fetchImpl:async()=>new Response('not image data',{status:404})}):download(url,options)
  const failed=await failing.run({collectLimit:1,ocrLimit:3})
  assert.equal(failed.status,'PARTIAL');assert.equal(failed.stages.ocr.new_limit_failures,0)
  assert.equal(failed.ocr_holds.count,1);assert.equal(failed.ocr_holds.items[0].last_check_error,'OCR_IMAGE_HTTP_404')
  assert.equal(failing.state.retries['ocr:'+failing.bad.id].until,base+48*3600000)
  assert.equal(failing.data.attempts.filter(a=>a.image_id===failing.bad.id).at(-1).error_code,'OCR_IMAGE_HTTP_404')
  assert.equal(h.state.retries[key],undefined)
})

test('a limit failure cannot establish suppression if its FAILED attempt was not saved',async()=>{
  const h=await heldHarness()
  delete h.state.retries['ocr:'+h.bad.id]
  h.advance(24*3600000)
  const save=h.runtime.repository.ocr.saveAttempt
  h.runtime.repository.ocr.saveAttempt=(attempt,result)=>attempt.image_id===h.bad.id?Promise.reject(new CollectionError('SUPABASE_HTTP_503','Local simulated DB failure')):save(attempt,result)
  const report=await h.run({collectLimit:1,ocrLimit:3})
  assert.equal(report.status,'PARTIAL');assert.equal(report.ocr_holds.count,0)
  assert.equal(report.errors.some(e=>e.code==='SUPABASE_HTTP_503'),true)
  assert.equal(h.state.retries['ocr:'+h.bad.id].image_limit,undefined)
})

test('plan does not call collection, downloads, OCR, writes, checkpoints or mutate state',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1})
  const before=JSON.stringify(h.state),data=JSON.stringify(h.data);h.calls.length=0
  const report=await h.run({},true)
  assert.equal(report.status,'PLAN_READY');assert.equal(report.plan.collection_api_candidates,'UNKNOWN_UNTIL_KOPIS_LIST')
  assert.deepEqual(h.calls,['preflight','snapshot','cleanupPlan','close'])
  assert.equal(JSON.stringify(h.state),before);assert.equal(JSON.stringify(h.data),data)
})

test('deadline and cancellation are partial, never report whole success or continue steps',async()=>{
  const h=harness(),controller=new AbortController()
  h.runtime.client.list=async()=>{controller.abort();return [listing(1)]}
  const r=await h.run({},false,controller.signal)
  assert.equal(r.exit_code,1);assert.equal(r.status,'PARTIAL');assert.equal(h.calls.includes('recognize'),false)
  assert.ok(r.errors.some(e=>e.code==='BATCH_INTERRUPTED'))
  const early=harness(),earlyController=new AbortController()
  earlyController.abort()
  const interruptedPreflight=await early.run({},false,earlyController.signal)
  assert.equal(interruptedPreflight.exit_code,1)
  assert.equal(interruptedPreflight.stages.preflight.status,'INTERRUPTED')
  assert.equal(early.calls.includes('snapshot'),false)
})

test('deadline preserves completed checkpoints and does not complete or back off the interrupted next concert',async()=>{
  const h=harness(),detail=h.runtime.client.detail
  let requested=0
  h.runtime.client.detail=async id=>{if(++requested===2)h.advance(31000);return detail(id)}
  const result=await h.run({collectLimit:3,maxSeconds:30})
  assert.equal(result.status,'PARTIAL');assert.equal(result.time_limit_reached,true)
  assert.equal(h.data.concerts.length,1);assert.equal(result.stages.collection.succeeded,1)
  assert.equal(h.state.priority.collect.slot,1)
  const ids=h.calls.filter(c=>c.startsWith('detail:')).map(c=>c.slice(7))
  assert.equal(h.state.collection.pending.includes(ids[1]),true)
  assert.equal(h.state.retries['collect:'+ids[1]],undefined)
  assert.equal(result.stages.collection.duration_ms,31000)
  assert.equal(h.reports.at(-1).time_limit_reached,true)
})

test('deadline after image download starts no OCR or FAILED write and leaves the unfinished priority slot uncommitted',async()=>{
  const h=harness(),download=h.runtime.download
  h.runtime.download=async url=>{const value=await download(url);h.advance(211000);return value}
  const result=await h.run({collectLimit:2,ocrLimit:2,maxSeconds:210})
  assert.equal(result.status,'PARTIAL');assert.equal(result.time_limit_reached,true)
  assert.equal(h.calls.includes('recognize'),false);assert.equal(h.calls.includes('saveOcr'),false)
  assert.equal(h.state.priority.ocr,undefined);assert.equal(h.data.attempts.length,0)
  assert.equal(result.stages.ocr.duration_ms,211000)
})

test('fast OCR keeps its count cap and reports the reserved monotonic window',async()=>{
  const h=harness(),r=await h.run({collectLimit:3,ocrLimit:3,maxSeconds:1800})
  assert.equal(r.status,'SUCCESS');assert.equal(r.stages.ocr.succeeded,3);assert.equal(r.stages.analysis.succeeded,3)
  assert.equal(r.stages.ocr.time_budget.stage_deadline_elapsed_ms,1620000)
  assert.equal(r.stages.ocr.time_budget.processing_deadline_elapsed_ms,1615000)
  assert.equal(r.stages.ocr.time_budget_reached,false)
})

test('no remaining OCR budget starts neither Python preparation nor recognition, and analyzes stored OCR',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1})
  h.data.analyses=[];h.data.candidates=[];h.calls.length=0
  h.runtime.preflight=async()=>{h.advance(1620000);return {python_dependencies_checked:false}}
  h.runtime.client.list=async()=>[]
  h.runtime.prepareOcr=async()=>assert.fail('Python must not start')
  h.runtime.worker.recognize=async()=>assert.fail('OCR must not start')
  const r=await h.run({maxSeconds:1800})
  assert.equal(r.stages.ocr.time_budget_reached,true);assert.equal(r.stages.ocr.checked,0)
  assert.equal(r.stages.ocr.termination_reason,'OCR_STAGE_BUDGET_EXHAUSTED')
  assert.equal(r.stages.analysis.succeeded,1);assert.equal(r.stages.analysis.remaining_total_budget_ms_at_start,180000)
  assert.equal(r.errors.length,0);assert.equal(r.time_limit_reached,false);assert.equal(r.last_completed_stage,'analysis')
})

const syntheticTimers=()=>{
  const pending=new Set()
  return {factory:opts=>createMonotonicDeadline({...opts,setTimer:fn=>{pending.add(fn);return fn},clearTimer:fn=>pending.delete(fn)}),
    fire(){for(const fn of [...pending]){pending.delete(fn);fn()}},pending}
}
test('inflight OCR stage abort stops only the worker, keeps successful OCR for same-run analysis and leaves cancelled slots retryable',async()=>{
  const h=harness(),timers=syntheticTimers(),recognize=h.runtime.worker.recognize
  let n=0,stopped=0
  h.runtime.worker.recognize=(image,{signal})=>{
    if(++n===1)return recognize(image)
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>{stopped++;reject(new CollectionError('OCR_ABORTED','fixture cancellation'))},{once:true})
      h.advance(1615000);timers.fire()
    })
  }
  const r=await h.run({collectLimit:3,ocrLimit:3,maxSeconds:1800},false,undefined,{deadlineFactory:timers.factory})
  assert.equal(stopped,1);assert.equal(n,2)
  assert.equal(r.stages.ocr.failed,0);assert.equal(r.stages.ocr.succeeded,1);assert.equal(r.stages.ocr.budget_cancelled_images,1)
  assert.equal(h.data.attempts.length,1);assert.ok(h.data.attempts.every(a=>a.status==='SUCCEEDED'))
  assert.equal(r.stages.analysis.succeeded,1);assert.ok(r.stages.analysis.remaining_total_budget_ms_at_start>=180000)
  assert.equal(r.stages.ocr.remaining.known_unprocessed,2);assert.equal(r.stages.ocr.deferred_targets.length,2)
  for(const target of r.stages.ocr.deferred_targets){assert.equal(h.state.retries['ocr:'+target.image_id],undefined);assert.equal(h.state.touched['ocr:'+target.image_id],undefined)}
  const eligible=ocrSelection(h.data,h.state,base+1615000,24,h.runtime.imageValidationKey).ready
  assert.ok(r.stages.ocr.deferred_targets.every(t=>eligible.some(i=>i.id===t.image_id)))
  assert.equal(r.errors.length,0);assert.equal(r.exit_code,1);assert.equal(r.time_limit_reached,false)
  assert.equal(r.last_completed_stage,'analysis');assert.ok(r.finished_at);assert.equal(h.reports.at(-1).finished_at,r.finished_at)
  assert.equal(timers.pending.size,0)
})
test('stage cutoff after download starts no recognition, creates no failed attempt and still reaches analysis',async()=>{
  const h=harness(),download=h.runtime.download
  h.runtime.download=async(...args)=>{const result=await download(...args);h.advance(1615000);return result}
  const r=await h.run({collectLimit:2,ocrLimit:2,maxSeconds:1800})
  assert.equal(r.stages.ocr.time_budget_reached,true);assert.equal(h.calls.includes('recognize'),false)
  assert.equal(h.data.attempts.length,0);assert.equal(h.state.priority.ocr,undefined)
  assert.equal(r.stages.analysis.status,'SUCCEEDED');assert.equal(r.stages.ocr.failed,0)
})
test('real image timeout still writes a FAILED attempt and cooldown while other successes are analyzed',async()=>{
  const h=harness(),recognize=h.runtime.worker.recognize;let n=0
  h.runtime.worker.recognize=(...args)=>++n===1?Promise.reject(new CollectionError('EASYOCR_TIMEOUT','fixture timeout')):recognize(...args)
  const r=await h.run({collectLimit:2,ocrLimit:2,maxSeconds:1800})
  assert.equal(r.stages.ocr.time_budget_reached,false);assert.equal(r.stages.ocr.failed,1)
  const failed=h.data.attempts.find(a=>a.status==='FAILED');assert.equal(failed.error_code,'EASYOCR_TIMEOUT')
  assert.ok(h.state.retries['ocr:'+failed.image_id].until>base);assert.equal(r.stages.analysis.succeeded,1)
})
test('a success committed before an interrupted save response remains available to same-run analysis without FAILED/cooldown',async()=>{
  const h=harness(),timers=syntheticTimers(),save=h.runtime.repository.ocr.saveAttempt
  h.runtime.repository.ocr.saveAttempt=async(...args)=>{await save(...args);h.advance(1615000);timers.fire();throw new CollectionError('BATCH_INTERRUPTED','fixture lost response')}
  const r=await h.run({collectLimit:1,ocrLimit:1,maxSeconds:1800},false,undefined,{deadlineFactory:timers.factory})
  assert.equal(h.data.attempts.length,1);assert.equal(h.data.attempts[0].status,'SUCCEEDED')
  assert.equal(r.stages.ocr.failed,0);assert.equal(r.stages.analysis.succeeded,1)
  assert.equal(h.state.retries['ocr:'+h.data.images[0].id],undefined)
})

test('lock excludes live owners regardless of age, recovers dead owner and releases safely',async()=>{
  const path=await mkdtemp(join(tmpdir(),'atlas-pipeline-lock-'))
  try{
    const first=await acquirePipelineLock(path)
    assert.ok(first)
    assert.equal(await acquirePipelineLock(path),null)
    await first.release()
    await writeFile(join(path,'lock.json'),JSON.stringify({pid:123456789,token:'old',created_at:'2000-01-01'}))
    assert.equal(await acquirePipelineLock(path,{alive:()=>true}),null)
    const recovered=await acquirePipelineLock(path,{alive:()=>false});assert.ok(recovered)
    await recovered.release()
    const contenders=await Promise.all([acquirePipelineLock(path),acquirePipelineLock(path)])
    assert.equal(contenders.filter(Boolean).length,1);await contenders.find(Boolean).release()
    await writeFile(join(path,'lock.json'),'broken')
    await assert.rejects(acquirePipelineLock(path),e=>e.code==='LOCAL_STATE_UNREADABLE')
  }finally{await cleanup(path)}
})

test('atomic results and strict options never serialize credentials or keyed URLs',async()=>{
  assert.equal(parsePipelineArgs(['run','--ocr-limit','5']).options.ocrLimit,5)
  for(const args of [['run','--ocr-limit','0'],['plan','--max-seconds','1'],['run','--unknown','1']])assert.throws(()=>parsePipelineArgs(args))
  const env={KOPIS_SERVICE_KEY:'super-secret',SUPABASE_SERVICE_ROLE_KEY:'service-secret'}
  const json=serializePipelineReport({error:'super-secret service-secret',url:'https://kopis.or.kr/test?service=anything&safe=yes'},env)
  assert.ok(!json.includes('super-secret'));assert.ok(!json.includes('service-secret'));assert.ok(!json.includes('service=anything'))
  const path=await mkdtemp(join(tmpdir(),'atlas-pipeline-json-'))
  try{await atomicJson(join(path,'latest.json'),{value:1});await atomicJson(join(path,'latest.json'),{value:2});assert.equal(JSON.parse(await readFile(join(path,'latest.json'),'utf8')).value,2)
    const local=createPipelineLocal(path,'fixture',{});await local.saveState(initialPipelineState());assert.equal((await local.readState()).version,1)
  }finally{await cleanup(path)}
})
