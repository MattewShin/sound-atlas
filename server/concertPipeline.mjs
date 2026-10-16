import { randomUUID } from 'node:crypto'
import { collectionConditions, normalizeCollectionDetail } from './concertCollector.mjs'
import { normalizeKopisConcert } from './kopisData.mjs'
import { analyzeStoredProgram, CATALOG_HASH, MATCHER_VERSION, hashJson } from './programAnalysis.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { runEasyOcrBatch } from './easyOcrBatch.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { safeCode, fatalCode, koreanTime, pipelineError } from './pipelineConfig.mjs'
import { analysisSelection, ocrSelection, retryDue, failedItem, completedItem, interleave, latestAttempt } from './pipelineSelection.mjs'

const stage = () => ({status:'NOT_RUN',succeeded:0,failed:0,reused:0,skipped:0,limit_reached:false,remaining:null})
export const runConcertPipeline = async ({runtime,local,state,options,plan=false,signal,now=Date.now,onProgress=()=>{}}) => {
  const started=now(),conditions=collectionConditions(started)
  const report={run_id:randomUUID(),mode:plan?'PLAN':'RUN',started_at:koreanTime(started),finished_at:null,duration_ms:0,
    status:'RUNNING',exit_code:0,conditions,limits:options,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,
    stages:{preflight:stage(),collection:stage(),ocr:stage(),analysis:stage()},errors:[],review:{new_candidates:0,new_linked_candidates:0,priority:[]},
    coverage:'LIMITED_SAMPLE',retry:'Rerun the same run command after retry_at; use plan and latest to inspect.'}
  const persist=async()=>{if(!plan){await local.saveState(state);await local.saveReport(report)}}
  const checkpoint=async()=>{await persist();onProgress({event:'checkpoint',stages:report.stages})}
  const check=()=>{if(signal?.aborted||now()-started>=options.maxSeconds*1000)throw pipelineError('BATCH_INTERRUPTED')}
  const problem=(where,error,id,retryKey)=>{
    const key=retryKey||(where==='collection'?'collect:':where+':')+id
    const code=safeCode(error)
    // Reconstruct the fixed KOPIS route; do not copy URLs, headers or response
    // bodies into local reports. Query values (including service) stay private.
    const kopisHttp=where==='collection' && /^KOPIS_HTTP_\d{3}$/.test(code) && error.http_status===Number(code.slice(-3))
      ? {http_status:error.http_status,
        content_type:['application/xml','text/xml','text/html','application/json','text/plain'].includes(error.content_type)?error.content_type:null,
        endpoint:id&&/^PF\d{1,12}$/.test(id)?`/openApi/restful/pblprfr/${id}`:'/openApi/restful/pblprfr',
        query_parameter_names:id?['service']:['service','stdate','eddate','signgucode','shcate','prfstate','cpage','rows']} : undefined
    report.errors.push({stage:where,code,...(id?{id}:{}),...(kopisHttp?{http:kopisHttp}:{}),...(state.retries[key]?{retry_at:koreanTime(state.retries[key].until)}:{})})
    if(fatalCode(code))throw error
  }
  let snapshot,preflightDone=false
  try {
    report.stages.preflight.status='RUNNING'
    report.environment=await runtime.preflight({plan});check()
    snapshot=await runtime.repository.snapshot(conditions,options.dbPages);check()
    report.stages.preflight={...stage(),status:'SUCCEEDED',succeeded:1};preflightDone=true
    if(plan){
      const ocr=ocrSelection(snapshot,state,now(),options.recheckHours),analysis=analysisSelection(snapshot,state,now())
      report.plan={known_concerts:snapshot.concerts.length,active_detail_images:snapshot.images.length,
        collection_api_candidates:'UNKNOWN_UNTIL_KOPIS_LIST',new_or_changed_images_after_collection:'UNKNOWN',
        images_due_for_download_check:ocr.ready.length,new_ocr_attempts:'UNKNOWN_UNTIL_IMAGE_HASH_CHECK',
        ocr_cooldown:ocr.cooldown.length,ocr_recent:ocr.recent.length,analysis_ready:analysis.ready.length,
        analysis_reused:analysis.reused.length,analysis_blocked:analysis.blocked,analysis_cooldown:analysis.cooldown.length,
        collection_cursor:state.collection,checkpoint_changed:false,kopis_calls:0,image_downloads:0,ocr_calls:0,db_writes:0,
        selected_analysis_ocr_ids:analysis.ready.slice(0,options.analysisLimit).map(t=>t.ocr.id)}
      report.status='PLAN_READY'
    } else {
      await persist()
      // A real list request validates KOPIS authentication before any DB writes.
      const c=report.stages.collection;c.status='RUNNING';c.pages=0;c.attempted=0;c.listing_cycle_completed=false
      let first,firstError
      if(!retryDue(state,'listing',now())){firstError=pipelineError('LISTING_RETRY_WAIT');c.failed++;problem('collection',firstError,undefined,'listing')}
      else try {first=await runtime.client.list({conditions,state:conditions.states[state.collection.state],page:state.collection.page});c.pages++;completedItem(state,'listing',now())}
      catch(e){c.pages++;firstError=e;failedItem(state,'listing',now());c.failed++;problem('collection',e,undefined,'listing')}
      const cutoff=now()-options.recheckHours*3600000
      const known=new Map(snapshot.concerts.map(x=>[x.kopis_id,x]))
      const prune=()=>{state.collection.pending=[...new Set(state.collection.pending)].filter(id=>{
        const date=state.collection.dates[id]
        return (!date||(date.from<=conditions.to&&date.to>=conditions.from))&&(!known.has(id)||Date.parse(known.get(id).synced_at)<=cutoff)
      });const pending=new Set(state.collection.pending);for(const id of Object.keys(state.collection.dates))if(!pending.has(id))delete state.collection.dates[id]}
      prune()
      let usedFirst=false,completedCycle=false
      while(!firstError && state.collection.pending.filter(id=>retryDue(state,'collect:'+id,now())).length<options.collectLimit*2 && !completedCycle){
        check()
        if(usedFirst && c.pages>=options.listPages)break
        const cursor=state.collection
        let rows
        try {rows=usedFirst?await runtime.client.list({conditions,state:conditions.states[cursor.state],page:cursor.page}):first;if(usedFirst)c.pages++;usedFirst=true}
        catch(e){c.pages++;failedItem(state,'listing',now());c.failed++;problem('collection',e,undefined,'listing');break}
        const signature=hashJson(rows.map(r=>r?.mt20id))
        if(rows.length===100 && signature===cursor.lastSignature){failedItem(state,'listing',now());c.failed++;problem('collection',pipelineError('PAGINATION_STALLED'),undefined,'listing');break}
        for(const row of rows){
          try {const x=normalizeKopisConcert(row,new Date(now()).toISOString());if(!/^PF\d{1,12}$/.test(x.kopisId))throw pipelineError('INVALID_ID')
            if(x.dateFrom<=conditions.to&&x.dateTo>=conditions.from){cursor.pending.push(x.kopisId);cursor.dates[x.kopisId]={from:x.dateFrom,to:x.dateTo}}
          }catch(e){c.failed++;problem('collection',e)}
        }
        if(rows.length<100){cursor.state++;cursor.page=1;cursor.lastSignature=null;if(cursor.state>=conditions.states.length){cursor.state=0;cursor.cycle++;completedCycle=true}}
        else{cursor.page++;cursor.lastSignature=signature}
        prune();await checkpoint()
      }
      c.listing_cycle_completed=completedCycle
      const due=snapshot.concerts.filter(x=>Date.parse(x.synced_at)<=cutoff&&retryDue(state,'collect:'+x.kopis_id,now()))
        .sort((a,b)=>a.synced_at.localeCompare(b.synced_at)||a.kopis_id.localeCompare(b.kopis_id)).map(x=>x.kopis_id)
      const discovery=state.collection.pending.filter(id=>retryDue(state,'collect:'+id,now()))
      const selection=[...new Set(interleave(discovery,due,state.lanes.collect))]
      c.cooldown=state.collection.pending.length-discovery.length
      for(const id of selection.slice(0,options.collectLimit)){
        check();c.attempted++;const key='collect:'+id
        try{
          const row=await runtime.client.detail(id);check()
          const normalized=normalizeCollectionDetail(row,id,conditions,new Date(now()).toISOString())
          await runtime.repository.collector.save(normalized);c.succeeded++;completedItem(state,key,now())
          state.collection.pending=state.collection.pending.filter(x=>x!==id)
        }catch(e){c.failed++;failedItem(state,key,now());if(/^OUT_OF_SCOPE_/.test(safeCode(e)))state.collection.pending=state.collection.pending.filter(x=>x!==id);problem('collection',e,id)}
        state.lanes.collect=1-state.lanes.collect;await checkpoint()
      }
      c.limit_reached=selection.length>=options.collectLimit
      c.page_limit_reached=c.pages>=options.listPages&&!completedCycle
      c.remaining={known_due_not_attempted:Math.max(0,selection.length-c.attempted),discovery_pending:state.collection.pending.length,unseen_kopis:'UNKNOWN'}
      c.status=c.failed?'PARTIAL':'SUCCEEDED';await persist();check()
      // Read current DB independently of collection successes, including older valid OCR.
      snapshot=await runtime.repository.snapshot(conditions,options.dbPages)
      const o=report.stages.ocr;o.status='RUNNING';o.attempted=0;o.checked=0;o.cached_recovery_records=0
      const selected=ocrSelection(snapshot,state,now(),options.recheckHours)
      o.skipped=selected.cooldown.length+selected.recent.length
      for(const image of selected.ready){
        if(o.checked>=options.imageChecks||o.attempted>=options.ocrLimit)break
        check();o.checked++
        const repository={...runtime.repository.ocr,async *candidates(){yield image}}
        const result=await runEasyOcrBatch({repository,limit:1,signal,now,download:runtime.download,
          worker:{recognize:(...args)=>runtime.worker.recognize(...args),close(){}},
          onCached:async({cached,downloaded,startedAt,finishedAt})=>{
            const latest=latestAttempt(snapshot,image.id)
            // Cache hits ordinarily do NOT create attempts or invalidate reviews.
            // Recovery from an intervening failed/changed attempt requires a new
            // successful hash-verification record; the immutable artifact is reused.
            if(latest?.status==='SUCCEEDED'&&latest.result_id===cached.id)return
            const artifact=await runtime.repository.ocrResult(cached.id)
            await repository.saveAttempt({id:randomUUID(),image_id:image.id,source_url:image.source_url,
              pipeline_version:EASYOCR_PIPELINE_VERSION,content_sha256:downloaded.contentHash,status:'SUCCEEDED',error_code:null,
              started_at:new Date(startedAt).toISOString(),finished_at:new Date(finishedAt).toISOString(),duration_ms:Math.max(0,finishedAt-startedAt)},artifact)
            o.cached_recovery_records++
          }})
        o.attempted+=result.attempted;o.succeeded+=result.saved;o.reused+=result.cached
        if(result.failed||result.cancelled){failedItem(state,image.key,now());o.failed+=result.failed||1;for(const e of result.failures)problem('ocr',{code:e.persistenceError||e.code},image.id)}
        else completedItem(state,image.key,now())
        state.lanes.ocr=1-state.lanes.ocr;await checkpoint()
      }
      o.limit_reached=o.attempted>=options.ocrLimit||o.checked>=options.imageChecks
      o.remaining={known_due_not_checked:Math.max(0,selected.ready.length-o.checked),new_ocr_needed:'UNKNOWN_UNTIL_HASH_CHECK'}
      o.status=o.failed?'PARTIAL':'SUCCEEDED';check()
      snapshot=await runtime.repository.snapshot(conditions,options.dbPages)
      const a=report.stages.analysis;a.status='RUNNING'
      const analyses=analysisSelection(snapshot,state,now());a.reused=analyses.reused.length;a.skipped=analyses.blocked.length+analyses.cooldown.length
      for(const target of analyses.ready.slice(0,options.analysisLimit)){
        check()
        try{
          const ocr=await runtime.repository.ocrResult(target.ocr.id)
          const analysis=analyzeStoredProgram({...target,ocr})
          const analysisId=await runtime.repository.analysis.save(analysis)
          const candidates=await runtime.repository.candidates(analysisId)
          // Existing analysis IDs are reused, never counted as new rows.
          if(!snapshot.analyses.some(x=>x.id===analysisId)){
            report.review.new_candidates+=candidates.length
            report.review.new_linked_candidates+=candidates.filter(x=>x.track_id).length
            report.review.priority.push(...candidates.filter(x=>x.track_id&&x.review_status==='REVIEW_REQUIRED').map(x=>({candidate_id:x.id,kopis_id:target.concert.kopis_id,
              concert:target.concert.title,date_from:target.concert.start_date,date_to:target.concert.end_date,
              track_id:x.track_id,track:getTrackTarget(x.track_id)?.title||'Registered track',
              show:`npm run program:analyze -- show ${x.id}`})))
          }else a.reused++
          a.succeeded++;completedItem(state,target.key,now())
        }catch(e){a.failed++;failedItem(state,target.key,now());problem('analysis',e,target.ocr.id,target.key)}
        await checkpoint()
      }
      a.limit_reached=analyses.ready.length>=options.analysisLimit
      a.remaining={known_ready_not_attempted:Math.max(0,analyses.ready.length-options.analysisLimit),blocked:analyses.blocked.length,cooldown:analyses.cooldown.length}
      a.status=a.failed?'PARTIAL':'SUCCEEDED'
      report.status=Object.values(report.stages).some(x=>x.failed)?'PARTIAL':'SUCCESS'
    }
    const reviews=await runtime.repository.reviewSummary(options.dbPages)
    const pendingReviews=reviews.filter(x=>x.matcher_version===MATCHER_VERSION&&x.catalog_hash===CATALOG_HASH&&!x.stale_reason)
    report.review.total_review_required=pendingReviews.length
    for(const x of pendingReviews.filter(x=>x.track_id)){
      const concert=snapshot.concerts.find(c=>c.kopis_id===x.kopis_id)
      if(concert&&!report.review.priority.some(y=>y.candidate_id===x.id))report.review.priority.push({candidate_id:x.id,kopis_id:x.kopis_id,concert:x.concert_title,
        date_from:concert.start_date,date_to:concert.end_date,track_id:x.track_id,track:getTrackTarget(x.track_id)?.title||'Registered track',show:`npm run program:analyze -- show ${x.id}`})
    }
    report.review.priority=report.review.priority.slice(0,20)
    report.coverage={kopis_listing_cycle_completed:report.stages.collection.listing_cycle_completed||false,
      limited_by_caps:Object.values(report.stages).some(s=>s.limit_reached||s.page_limit_reached),
      unseen_kopis_or_changed_remote_images:'UNKNOWN',known_ocr_remaining:report.stages.ocr.remaining,known_analysis_remaining:report.stages.analysis.remaining}
    report.retry_targets=Object.entries(state.retries).map(([key,value])=>({key,failures:value.failures,retry_at:koreanTime(value.until)}))
    report.exit_code=report.status==='PARTIAL'?1:0
  }catch(error){
    const code=safeCode(error)
    report.errors.push({stage:preflightDone?'execution':'preflight',code})
    report.status=code==='BATCH_INTERRUPTED'?'PARTIAL':!preflightDone||fatalCode(code)?'FATAL':'PARTIAL';report.exit_code=report.status==='FATAL'?2:1
    for(const s of Object.values(report.stages))if(s.status==='RUNNING'){s.status=code==='BATCH_INTERRUPTED'?'INTERRUPTED':'FAILED';if(!s.failed)s.failed=1}
  }finally{
    await runtime.worker?.close()
    for(const s of Object.values(report.stages))if(s.status==='RUNNING')s.status='INTERRUPTED'
    report.finished_at=koreanTime(now());report.duration_ms=Math.max(0,now()-started)
    if(!plan)await persist()
  }
  return report
}
