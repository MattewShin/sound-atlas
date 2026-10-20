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
import { fallbackCleanupPlan, cleanupCounts } from './pipelineCleanup.mjs'
import sharp from 'sharp'
import { getOcrImageConfig } from './ocrImageConfig.mjs'
import { downloadKopisImage, imageValidationKey } from './kopisImageDownload.mjs'
import { ocrSelection } from './pipelineSelection.mjs'
import { CollectionError } from './collectionHttp.mjs'

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
    rollout:{writeVersion:'stored-program-3',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:true},
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
  const run=(options={},plan=false,signal)=>runConcertPipeline({runtime,local,state,options:{...PIPELINE_DEFAULTS,...options},plan,now:()=>time,signal})
  return {runtime,local,state,data,calls,reports,run,advance:ms=>{time+=ms}}
}

test('pipeline uses collect -> OCR -> analysis, caps attempts and resumes past the first ten',async()=>{
  const h=harness(),a=await h.run()
  assert.equal(a.status,'SUCCESS');assert.equal(a.exit_code,0)
  assert.equal(a.matcher_version,'stored-program-3')
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
  assert.deepEqual(h.calls,['preflight','snapshot','cleanupPlan','reviews','close'])
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
  assert.deepEqual(h.calls,['preflight','snapshot','cleanupPlan','reviews','close'])
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
  h.runtime.download=async url=>{const value=await download(url);h.advance(31000);return value}
  const result=await h.run({collectLimit:2,ocrLimit:2,maxSeconds:30})
  assert.equal(result.status,'PARTIAL');assert.equal(result.time_limit_reached,true)
  assert.equal(h.calls.includes('recognize'),false);assert.equal(h.calls.includes('saveOcr'),false)
  assert.equal(h.state.priority.ocr,undefined);assert.equal(h.data.attempts.length,0)
  assert.equal(result.stages.ocr.duration_ms,31000)
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
