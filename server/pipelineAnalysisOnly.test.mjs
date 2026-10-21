import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { runConcertPipeline } from './concertPipeline.mjs'
import { createAnalysisOnlyRuntime } from './pipelineAnalysisOnly.mjs'
import { parsePipelineArgs, pipelineError } from './pipelineConfig.mjs'
import { initialPipelineState } from './pipelineLocal.mjs'
import { analyzeStoredProgram } from './programAnalysis.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'

const harness=()=>{
  let time=Date.parse('2026-10-21T06:00:00Z')
  const calls=[],state=initialPipelineState(),reports=[]
  state.collection.pending=['PF999999'];state.retries['ocr:unrelated']={failures:2,until:time+3600000}
  const targets=Array.from({length:3},(_,n)=>{
    const concert={id:randomUUID(),kopis_id:'PF'+(900000+n),title:'Fixture',venue:'Fixture hall',region:'서울',start_date:'2026-10-27',end_date:'2026-10-27',program_context_revision:0}
    const image={id:randomUUID(),concert_id:concert.id,is_active:true,image_type:'DETAIL',evidence_revision:0,source_url:'https://kopis.or.kr/upload/fixture.jpg'}
    const ocr={id:randomUUID(),image_id:image.id,pipeline_version:EASYOCR_PIPELINE_VERSION,content_sha256:'a'.repeat(64),raw_text:'PROGRAM\nF Chopin Ballade No.4 in F Minor Op.52',detections:[],width:800,height:300,created_at:'2026-10-21T05:00:00Z'}
    const attempt={id:randomUUID(),image_id:image.id,result_id:ocr.id,status:'SUCCEEDED',content_sha256:ocr.content_sha256,pipeline_version:EASYOCR_PIPELINE_VERSION,created_at:'2026-10-21T05:00:01Z',finished_at:'2026-10-21T05:00:01Z'}
    return {concert,image,ocr,attempt}
  })
  const data={concerts:targets.map(t=>t.concert),images:targets.map(t=>t.image),results:targets.map(t=>t.ocr),attempts:targets.map(t=>t.attempt),analyses:[{...analyzeStoredProgram(targets[0]),id:randomUUID(),is_current:true}]}
  const manifest={schema_version:'program-ocr-manifest-2',expected_count:2,targets:targets.slice(1).map(t=>({kopis_id:t.concert.kopis_id,image_id:t.image.id,ocr_result_id:t.ocr.id,source_attempt_id:t.attempt.id,image_revision:0,concert_revision:0}))}
  const candidates=[],runtime={analysisOnly:true,manifest,rollout:{scheduleEnabled:true},activity:{},
    preflight:async()=>{calls.push('preflight');return {rpc_ready:true}},
    repository:{snapshot:async()=>structuredClone(data),analysis:{
      manifestTargets:async()=>({targets:targets.slice(1),skipped:[]}),
      save:async payload=>{calls.push('save');const id=randomUUID();data.analyses.push({...payload,id,is_current:true});candidates.push(...payload.candidates.map(c=>({...c,id:randomUUID(),analysis_id:id})));return id}},
      candidates:async id=>candidates.filter(c=>c.analysis_id===id),reviewSummary:async()=>[]}}
  for(const name of ['client','worker','download'])Object.defineProperty(runtime,name,{get(){throw Error('FORBIDDEN_'+name)}})
  for(const name of ['cleanupPlan','cleanupDelete','collector','ocr'])Object.defineProperty(runtime.repository,name,{get(){throw Error('FORBIDDEN_'+name)}})
  const local={saveState:async()=>calls.push('checkpoint'),saveReport:async r=>reports.push(structuredClone(r))}
  const options=parsePipelineArgs(['run','--profile','analysis-only','--ocr-manifest','fixture.json']).options
  const run=plan=>runConcertPipeline({runtime,local,state,options,plan,now:()=>time,onProgress:()=>{}})
  return {calls,state,reports,targets,data,runtime,options,run,advance:ms=>{time+=ms}}
}

test('analysis-only plan pins OCR, skips forbidden stages and writes neither state nor DB',async()=>{
  const h=harness(),before=structuredClone(h.state),r=await h.run(true)
  assert.equal(r.status,'PLAN_READY');assert.equal(r.plan.selected_count,2);assert.equal(r.plan.analysis_reused,1)
  for(const k of ['cleanup','collection','ocr'])assert.equal(r.stages[k].status,'SKIPPED_ANALYSIS_ONLY')
  assert.deepEqual(h.state,before);assert.deepEqual(h.calls,['preflight']);assert.equal(h.reports.length,0)
})
test('analysis-only saves only pinned ready OCR, preserves unrelated progress and reuses on rerun',async()=>{
  const h=harness(),before=structuredClone(h.state),old=structuredClone(h.data.analyses[0]),r=await h.run(false)
  assert.equal(r.status,'SUCCESS');assert.equal(r.stages.analysis.attempted,2);assert.equal(r.stages.analysis.succeeded,2)
  assert.equal(h.calls.filter(x=>x==='save').length,2);assert.deepEqual(h.data.analyses[0],old)
  assert.deepEqual(h.state.collection,before.collection);assert.deepEqual(h.state.retries['ocr:unrelated'],before.retries['ocr:unrelated'])
  h.calls.length=0;const again=await h.run(false)
  assert.equal(again.status,'SUCCESS');assert.equal(again.stages.analysis.reused,2);assert.equal(again.stages.analysis.attempted,0)
  assert.ok(!h.calls.includes('save'));assert.equal(again.review.new_candidates,0)
})
test('changed or blocked manifest evidence fails before any save',async()=>{
  for(const changed of [false,true]){
    const h=harness();if(changed)h.runtime.repository.analysis.manifestTargets=async()=>({targets:[],skipped:[{reason:'MANIFEST_EVIDENCE_CHANGED'}]})
    else h.data.attempts[1].status='FAILED'
    const r=await h.run(false);assert.equal(r.status,'FATAL');assert.ok(!h.calls.includes('save'))
  }
})
test('analysis-only budget preserves the completed save and never marks unfinished targets complete',async()=>{
  const h=harness(),save=h.runtime.repository.analysis.save
  h.runtime.repository.analysis.save=async p=>{const id=await save(p);h.advance(600001);return id}
  const r=await h.run(false)
  assert.equal(r.status,'PARTIAL');assert.equal(r.time_limit_reached,true);assert.equal(r.termination_reason,'TIME_LIMIT')
  assert.equal(r.stages.analysis.succeeded,1);assert.equal(h.data.analyses.length,2);assert.ok(r.finished_at)
})
test('analysis-only individual failure retains successes and retry state',async()=>{
  const h=harness(),save=h.runtime.repository.analysis.save;let n=0
  h.runtime.repository.analysis.save=p=>n++===0?Promise.reject(pipelineError('SUPABASE_HTTP_503')):save(p)
  const r=await h.run(false);assert.equal(r.status,'PARTIAL');assert.equal(r.stages.analysis.succeeded,1);assert.equal(r.stages.analysis.failed,1)
  assert.ok(r.errors[0].retry_at);assert.equal(h.data.analyses.length,2)
})
test('analysis-only runtime needs no KOPIS or Python and rejects non-analysis writes before network',async()=>{
  const calls=[],runtime=createAnalysisOnlyRuntime({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-key',EASYOCR_PYTHON:'nonexistent'},
    fetchImpl:async(url,init)=>{calls.push([new URL(url).pathname,init.method]);return new Response(JSON.stringify(new URL(url).pathname==='/rest/v1/'?{paths:{'/rpc/save_concert_program_analysis_v3':{},'/rpc/review_concert_program_candidate_identity':{},'/rpc/save_concert_program_rematch':{}}}:[]),{status:200})}})
  await runtime.preflight();assert.equal(runtime.worker,undefined);assert.equal(runtime.download,undefined);assert.equal(runtime.client,undefined)
  await assert.rejects(()=>runtime.repository.analysis.review(randomUUID(),'CONFIRMED','fixture',randomUUID()),{code:'ANALYSIS_ONLY_OPERATION_FORBIDDEN'})
  assert.ok(calls.every(([,method])=>method==='GET'));assert.equal(runtime.activity.analysis_save_calls,0)
})
test('analysis-only parser requires manifest and keeps daily defaults unchanged',()=>{
  assert.throws(()=>parsePipelineArgs(['run','--profile','analysis-only']),{code:'ANALYSIS_ONLY_MANIFEST_REQUIRED'})
  assert.throws(()=>parsePipelineArgs(['run','--ocr-manifest','x']),{code:'MANIFEST_REQUIRES_ANALYSIS_ONLY'})
  const a=parsePipelineArgs(['plan','--profile','analysis-only','--ocr-manifest','pinned.json']).options
  assert.equal(a.analysisOnly,true);assert.equal(a.analysisLimit,40);assert.equal(a.maxSeconds,600)
  const d=parsePipelineArgs(['run','--profile','daily']).options
  assert.equal(d.collectLimit,10);assert.equal(d.ocrLimit,20);assert.equal(d.analysisLimit,20);assert.equal(d.maxSeconds,1800)
})
