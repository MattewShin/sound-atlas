import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
import { runConcertPipeline } from './concertPipeline.mjs'
import { initialPipelineState, acquirePipelineLock, atomicJson, createPipelineLocal } from './pipelineLocal.mjs'
import { PIPELINE_DEFAULTS, parsePipelineArgs, pipelineError, serializePipelineReport } from './pipelineConfig.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { analysisSelection } from './pipelineSelection.mjs'
import { createCollectionKopisClient } from './concertCollector.mjs'

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
    async preflight({plan}){calls.push('preflight');return {plan}},
    client:{async list({page,state}){calls.push(`list:${state}:${page}`);return page===1?Array.from({length:100},(_,i)=>listing(i+1)):[]},async detail(id){calls.push('detail:'+id);return listing(Number(id.slice(2))-900000)}},
    worker:{async recognize(){calls.push('recognize');return {raw_text:'PROGRAM\nChopin Ballade No.1 Op.23',detections:[],width:800,height:300,engine_version:'fixture',torch_version:'fixture',mean_confidence:null}},close(){calls.push('close')}},
    async download(url){calls.push('download');return {contentHash:createHash('sha256').update(url).digest('hex'),width:800,height:300,buffer:Buffer.from('fixture')}},
    repository:{
      async snapshot(){calls.push('snapshot');return structuredClone(data)},
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
  const run=(options={},plan=false,signal)=>runConcertPipeline({runtime,local,state,options:{...PIPELINE_DEFAULTS,...options},plan,now:()=>time,signal})
  return {runtime,local,state,data,calls,reports,run,advance:ms=>{time+=ms}}
}

test('pipeline uses collect -> OCR -> analysis, caps attempts and resumes past the first ten',async()=>{
  const h=harness(),a=await h.run()
  assert.equal(a.status,'SUCCESS');assert.equal(a.exit_code,0)
  assert.equal(a.stages.collection.attempted,10);assert.equal(a.stages.ocr.attempted,3);assert.equal(a.stages.analysis.succeeded,3)
  assert.equal(a.review.new_candidates,3);assert.equal(a.review.new_linked_candidates,3)
  assert.ok(h.calls.indexOf('saveConcert')<h.calls.indexOf('recognize'))
  assert.ok(h.calls.lastIndexOf('saveOcr')<h.calls.indexOf('saveAnalysis'))
  assert.equal(h.state.collection.page,2);assert.equal(h.state.collection.pending.length,90)
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
  const detail=h.runtime.client.detail;let requests=0
  const failedClient=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'fixture-secret'},delay:async()=>{},
    fetchImpl:async()=>{requests++;return new Response('service=fixture-secret private upstream body',{status:400,headers:{'Content-Type':'text/html; charset=UTF-8'}})}})
  h.runtime.client.detail=id=>id===oldConcert.kopis_id?failedClient.detail(id):detail(id)
  const report=await h.run({collectLimit:3,ocrLimit:1})
  assert.equal(requests,1);assert.equal(report.status,'PARTIAL');assert.equal(report.exit_code,1)
  assert.equal(report.stages.collection.failed,1);assert.equal(report.stages.collection.succeeded,2)
  const error=report.errors.find(e=>e.id===oldConcert.kopis_id)
  assert.deepEqual(error.http,{http_status:400,content_type:'text/html',endpoint:`/openApi/restful/pblprfr/${oldConcert.kopis_id}`,query_parameter_names:['service']})
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

test('plan does not call collection, downloads, OCR, writes, checkpoints or mutate state',async()=>{
  const h=harness();await h.run({collectLimit:1,ocrLimit:1})
  const before=JSON.stringify(h.state),data=JSON.stringify(h.data);h.calls.length=0
  const report=await h.run({},true)
  assert.equal(report.status,'PLAN_READY');assert.equal(report.plan.collection_api_candidates,'UNKNOWN_UNTIL_KOPIS_LIST')
  assert.deepEqual(h.calls,['preflight','snapshot','reviews','close'])
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
