import { randomUUID } from 'node:crypto'
import { collectionConditions, normalizeCollectionDetail } from './concertCollector.mjs'
import { normalizeKopisConcert } from './kopisData.mjs'
import { analyzeStoredProgram, CATALOG_HASH, MATCHER_VERSION, hashJson } from './programAnalysis.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { runEasyOcrBatch } from './easyOcrBatch.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { safeCode, fatalCode, koreanTime, pipelineError } from './pipelineConfig.mjs'
import { analysisSelection, ocrSelection, collectionSelection, retryDue, failedItem, completedItem, latestAttempt, imageLimitHold, imageLimitHolds } from './pipelineSelection.mjs'
import { cleanupPlanForReport, emptyCleanupCounts, pruneExpiredPipelineState } from './pipelineCleanup.mjs'
import { commitPriority, priorityPreview, bucketCounts } from './pipelinePriority.mjs'
import {getProgramRollout} from './programRollout.mjs'

const stage = () => ({status:'NOT_RUN',succeeded:0,failed:0,reused:0,skipped:0,limit_reached:false,remaining:null,duration_ms:0})
export const runConcertPipeline = async ({runtime,local,state,options,plan=false,signal,now=Date.now,onProgress=()=>{},runId=randomUUID(),execution}) => {
  const started=now();let conditions=collectionConditions(started)
  const report={run_id:runId,execution,mode:plan?'PLAN':'RUN',started_at:koreanTime(started),finished_at:null,duration_ms:0,
    status:'RUNNING',exit_code:null,last_progress_at:koreanTime(started),last_completed_stage:null,conditions,limits:options,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,
    stages:{preflight:stage(),cleanup:stage(),collection:stage(),ocr:stage(),analysis:stage()},errors:[],review:{new_candidates:0,new_linked_candidates:0,priority:[]},
    coverage:'LIMITED_SAMPLE',time_limit_reached:false,priority_selection:{collection:[],ocr:[],analysis:[]},
    retry:'Rerun the same run command after retry_at; use plan and latest to inspect.'}
  let activeStage,stageStarted
  const completedAnalyses=new Set()
  const finishStage=()=>{if(activeStage){Object.assign(report.stages[activeStage],{started_at:koreanTime(stageStarted),finished_at:koreanTime(now()),duration_ms:Math.max(0,now()-stageStarted)});if(['SUCCEEDED','PARTIAL'].includes(report.stages[activeStage].status))report.last_completed_stage=activeStage;activeStage=null}}
  const startStage=name=>{finishStage();activeStage=name;stageStarted=now();report.stages[name].started_at=koreanTime(stageStarted)}
  const workload=()=>{
    if(!snapshot)return
    const c=collectionSelection(snapshot,state,now(),options.recheckHours),o=ocrSelection(snapshot,state,now(),options.recheckHours,runtime.imageValidationKey),a=analysisSelection(snapshot,state,now(),runtime.imageValidationKey)
    const imageItems=items=>items.map(i=>i.concerts?i:{...i,concerts:snapshot.concerts.find(c=>c.id===i.concert_id)})
    report.known_backlog={basis:'LAST_DB_SNAPSHOT_AND_CHECKPOINT',collection:{unit:'concerts',new:bucketCounts(c.new,now()),recheck:bucketCounts(c.recheck,now()),cooldown:bucketCounts(c.cooldown,now()),unseen_kopis:'UNKNOWN'},
      ocr:{unit:'images',new:bucketCounts(o.new,now()),recheck:bucketCounts(o.recheck,now()),cooldown:bucketCounts(imageItems(o.cooldown),now()),held:bucketCounts(imageItems(o.held),now()),new_ocr_after_hash:'UNKNOWN'},
      analysis:{unit:'images',ready:bucketCounts(a.ready.filter(t=>!completedAnalyses.has(t.key)),now()),blocked:bucketCounts(a.blocked.map(i=>({concerts:snapshot.concerts.find(c=>c.id===snapshot.images.find(x=>x.id===i.image_id)?.concert_id)})),now()),completed:a.reused.length+completedAnalyses.size}}
  }
  const refreshHolds=()=>{if(snapshot){const items=imageLimitHolds(snapshot,state,runtime.imageValidationKey,now());report.ocr_holds={count:items.length,items}}}
  const persist=async()=>{refreshHolds();report.last_progress_at=koreanTime(now());report.duration_ms=Math.max(0,now()-started);if(activeStage)report.stages[activeStage].duration_ms=Math.max(0,now()-stageStarted);if(!plan){await local.saveState(state);await local.saveReport(report)}}
  const checkpoint=async()=>{await persist();onProgress({event:'checkpoint',stages:report.stages})}
  const check=()=>{if(now()-started>=options.maxSeconds*1000||signal?.reason==='TIME_LIMIT')report.time_limit_reached=true
    if(signal?.aborted||report.time_limit_reached)throw pipelineError('BATCH_INTERRUPTED')}
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
    const rollout=runtime.rollout||getProgramRollout()
    report.rollout=rollout
    if(!plan&&!rollout.scheduleEnabled){
      report.status='SKIPPED_ROLLOUT_GATE';report.exit_code=0;report.termination_reason='PROGRAM_ANALYSIS_SCHEDULE_DISABLED'
      report.stages.analysis.status='SKIPPED_ROLLOUT_GATE'
      report.retry='No automatic failure retry. Enable PROGRAM_ANALYSIS_SCHEDULE_ENABLED only after rollout verification.'
      return report
    }
    startStage('preflight')
    report.stages.preflight.status='RUNNING'
    report.environment=await runtime.preflight({plan});check()
    snapshot=await runtime.repository.snapshot(conditions,options.dbPages);check()
    report.stages.preflight={...stage(),status:'SUCCEEDED',succeeded:1};preflightDone=true
    if(plan){
      startStage('cleanup')
      const cleanup=await runtime.repository.cleanupPlan(options.cleanupLimit,conditions.from,options.dbPages);check()
      report.stages.cleanup={...stage(),status:'PLANNED',plan:cleanupPlanForReport(cleanup,options.cleanupLimit),remaining:cleanup.total,
        limit_reached:cleanup.total>cleanup.targets.length}
      const ocr=ocrSelection(snapshot,state,now(),options.recheckHours,runtime.imageValidationKey),analysis=analysisSelection(snapshot,state,now(),runtime.imageValidationKey)
      const collection=collectionSelection(snapshot,state,now(),options.recheckHours)
      report.priority_selection={collection:collection.ready.slice(0,options.collectLimit).map(priorityPreview),
        ocr:ocr.ready.slice(0,options.imageChecks).map(priorityPreview),analysis:analysis.ready.slice(0,options.analysisLimit).map(priorityPreview)}
      report.plan={known_concerts:snapshot.concerts.length,active_detail_images:snapshot.images.length,
        collection_api_candidates:'UNKNOWN_UNTIL_KOPIS_LIST',new_or_changed_images_after_collection:'UNKNOWN',
        images_due_for_download_check:ocr.ready.length,new_ocr_attempts:'UNKNOWN_UNTIL_IMAGE_HASH_CHECK',
        ocr_cooldown:ocr.cooldown.length,ocr_recent:ocr.recent.length,ocr_held:ocr.held.length,analysis_ready:analysis.ready.length,
        analysis_reused:analysis.reused.length,analysis_blocked:analysis.blocked,analysis_cooldown:analysis.cooldown.length,
        collection_cursor:state.collection,checkpoint_changed:false,kopis_calls:0,image_downloads:0,ocr_calls:0,db_writes:0,
        read_capacity:{list_max_raw_rows:options.listPages*100,db_rows_per_table_or_relation_batch:options.dbPages*100,db_scan_overflow:'EXPLICIT_DB_SCAN_LIMIT_ERROR'},
        ocr_selection_semantics:'Ordered download-check candidates; stop at imageChecks or new OCR attempt cap. Cache/change outcomes are UNKNOWN until download.',
        selected_analysis_ocr_ids:analysis.ready.slice(0,options.analysisLimit).map(t=>t.ocr.id)}
      report.status='PLAN_READY'
      finishStage()
    } else {
      await persist()
      startStage('cleanup')
      const cleanup=report.stages.cleanup;cleanup.status='RUNNING';cleanup.deleted_counts=emptyCleanupCounts();cleanup.deleted=[]
      cleanup.attempted=0;cleanup.remaining='UNKNOWN'
      const deletedTargets=[]
      try{
        const selection=await runtime.repository.cleanupPlan(options.cleanupLimit,conditions.from,options.dbPages);check()
        if(selection.migration_required)throw pipelineError('CLEANUP_MIGRATION_REQUIRED')
        cleanup.reference_date=selection.reference_date;cleanup.total_before=selection.total
        cleanup.excluded_invalid_dates=selection.excluded_invalid_dates;cleanup.limit_reached=selection.total>selection.targets.length
        for(const target of selection.targets){
          check();cleanup.attempted++
          try{
            const result=await runtime.repository.cleanupDelete(target.id,randomUUID(),report.run_id)
            if(result.status==='DELETED'){
              cleanup.succeeded++;deletedTargets.push(target)
              for(const table of Object.keys(cleanup.deleted_counts))cleanup.deleted_counts[table]+=result.counts[table]
              cleanup.deleted.push({kopis_id:result.kopis_id,deleted_at:result.deleted_at,counts:result.counts})
            }else if(['NOT_FOUND','NOT_EXPIRED'].includes(result.status)){
              cleanup.skipped++
              if(result.status==='NOT_EXPIRED'&&result.start_date&&result.end_date)
                state.collection.dates[target.kopis_id]={from:result.start_date,to:result.end_date}
            }else throw pipelineError(result.status==='BLOCKED_SHARED_DEPENDENCY'?'CLEANUP_SHARED_DEPENDENCY':
              result.status==='BLOCKED_UNEXPECTED_FOREIGN_KEY'?'CLEANUP_UNEXPECTED_FOREIGN_KEY':'CLEANUP_RESPONSE_INVALID')
          }catch(e){cleanup.failed++;problem('cleanup',e,target.kopis_id)}
          await checkpoint()
        }
        const after=await runtime.repository.cleanupPlan(1,conditions.from,options.dbPages);check()
        cleanup.remaining=after.total
      }catch(e){if(fatalCode(safeCode(e)))throw e;cleanup.failed++;problem('cleanup',e);if(safeCode(e)==='BATCH_INTERRUPTED')throw e}
      // Keep refreshed legitimate dates, and remove only expired local entries.
      for(const concert of snapshot.concerts)if(state.collection.dates[concert.kopis_id])
        state.collection.dates[concert.kopis_id]={from:concert.start_date,to:concert.end_date}
      conditions=collectionConditions(now());report.conditions=conditions
      cleanup.local_state=pruneExpiredPipelineState(state,conditions.from,deletedTargets)
      cleanup.status=cleanup.failed?'PARTIAL':'SUCCEEDED';await persist();check()
      const removedInRun=new Set(deletedTargets.map(c=>c.kopis_id))
      // Collection authentication is independent of successful cleanup.
      startStage('collection')
      const c=report.stages.collection;c.status='RUNNING';c.pages=0;c.attempted=0;c.listing_cycle_completed=false
      let first,firstError
      if(!retryDue(state,'listing',now())){firstError=pipelineError('LISTING_RETRY_WAIT');c.failed++;problem('collection',firstError,undefined,'listing')}
      else try {first=await runtime.client.list({conditions,state:conditions.states[state.collection.state],page:state.collection.page});c.pages++;completedItem(state,'listing',now())}
      catch(e){if(safeCode(e)==='BATCH_INTERRUPTED')throw e;c.pages++;firstError=e;failedItem(state,'listing',now());c.failed++;problem('collection',e,undefined,'listing')}
      const cutoff=now()-options.recheckHours*3600000
      const known=new Map(snapshot.concerts.map(x=>[x.kopis_id,x]))
      const prune=()=>{state.collection.pending=[...new Set(state.collection.pending)].filter(id=>{
        const date=state.collection.dates[id]
        return (!date||(date.from<=conditions.to&&date.to>=conditions.from))&&(!known.has(id)||Date.parse(known.get(id).synced_at)<=cutoff)
      });const pending=new Set(state.collection.pending);for(const id of Object.keys(state.collection.dates))if(!pending.has(id))delete state.collection.dates[id]}
      prune()
      let usedFirst=false,completedCycle=false
      while(!firstError && !completedCycle){
        check()
        if(usedFirst && c.pages>=options.listPages)break
        const cursor=state.collection
        let rows
        try {rows=usedFirst?await runtime.client.list({conditions,state:conditions.states[cursor.state],page:cursor.page}):first;if(usedFirst)c.pages++;usedFirst=true}
        catch(e){if(safeCode(e)==='BATCH_INTERRUPTED')throw e;c.pages++;failedItem(state,'listing',now());c.failed++;problem('collection',e,undefined,'listing');break}
        const signature=hashJson(rows.map(r=>r?.mt20id))
        if(rows.length===100 && signature===cursor.lastSignature){failedItem(state,'listing',now());c.failed++;problem('collection',pipelineError('PAGINATION_STALLED'),undefined,'listing');break}
        for(const row of rows){
          try {const x=normalizeKopisConcert(row,new Date(now()).toISOString());if(!/^PF\d{1,12}$/.test(x.kopisId))throw pipelineError('INVALID_ID')
            if(!removedInRun.has(x.kopisId)&&x.dateFrom<=conditions.to&&x.dateTo>=collectionConditions(now()).from){cursor.pending.push(x.kopisId);cursor.dates[x.kopisId]={from:x.dateFrom,to:x.dateTo}}
          }catch(e){c.failed++;problem('collection',e)}
        }
        if(rows.length<100){cursor.state++;cursor.page=1;cursor.lastSignature=null;if(cursor.state>=conditions.states.length){cursor.state=0;cursor.cycle++;completedCycle=true}}
        else{cursor.page++;cursor.lastSignature=signature}
        prune();await checkpoint()
      }
      c.listing_cycle_completed=completedCycle
      const collection=collectionSelection(snapshot,state,now(),options.recheckHours)
      const selection=collection.ready.filter(item=>!removedInRun.has(item.id))
      c.cooldown=collection.cooldown.length;c.new_processed=0;c.rechecked=0
      for(const item of selection.slice(0,options.collectLimit)){
        const id=item.id
        check();c.attempted++;const key='collect:'+id
        report.priority_selection.collection.push(priorityPreview(item))
        try{
          const row=await runtime.client.detail(id);check()
          const normalized=normalizeCollectionDetail(row,id,{...conditions,from:collectionConditions(now()).from},new Date(now()).toISOString())
          await runtime.repository.collector.save(normalized);c.succeeded++;c[item.work_kind==='NEW'?'new_processed':'rechecked']++;completedItem(state,key,now())
          state.collection.pending=state.collection.pending.filter(x=>x!==id)
        }catch(e){if(safeCode(e)==='BATCH_INTERRUPTED')throw e;c.failed++;failedItem(state,key,now());if(/^OUT_OF_SCOPE_/.test(safeCode(e)))state.collection.pending=state.collection.pending.filter(x=>x!==id);problem('collection',e,id)}
        commitPriority(state,'collect',item)
        state.lanes.collect=1-state.lanes.collect;await checkpoint()
      }
      c.limit_reached=selection.length>=options.collectLimit
      c.page_limit_reached=c.pages>=options.listPages&&!completedCycle
      c.remaining={known_due_not_attempted:Math.max(0,selection.length-c.attempted),discovery_pending:state.collection.pending.length,unseen_kopis:'UNKNOWN'}
      c.status=c.failed?'PARTIAL':'SUCCEEDED';await persist();check()
      // Read current DB independently of collection successes, including older valid OCR.
      startStage('ocr')
      snapshot=await runtime.repository.snapshot(conditions,options.dbPages)
      const o=report.stages.ocr;o.status='RUNNING';o.attempted=0;o.checked=0;o.cached_recovery_records=0
      const selected=ocrSelection(snapshot,state,now(),options.recheckHours,runtime.imageValidationKey)
      o.held_unchanged=0;o.new_limit_failures=0;o.new_processed=0;o.rechecked=0
      o.held_skipped=selected.held.filter(image=>!retryDue(state,'ocr:'+image.id,now())).length
      o.skipped=selected.cooldown.length+selected.recent.length
      for(const image of selected.ready){
        if(o.checked>=options.imageChecks||o.attempted>=options.ocrLimit)break
        check();o.checked++;(state.owners||={})[image.key]=image.concerts.kopis_id
        report.priority_selection.ocr.push(priorityPreview(image))
        const knownLimit=imageLimitHold(state,image,runtime.imageValidationKey)
        const repository={...runtime.repository.ocr,async *candidates(){yield image}}
        const result=await runEasyOcrBatch({repository,limit:1,signal,now,check,download:url=>runtime.download(url,{knownLimit}),
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
        if(result.held){
          // A byte-identical known rejection is neither success nor a new failure.
          state.retries[image.key]={...state.retries[image.key],until:now()+options.recheckHours*3600000,
            image_limit:{...knownLimit,checkedAt:now()}}
          delete state.retries[image.key].last_check_error
          state.touched[image.key]=now();o.held_unchanged++;o.held_skipped++;o.skipped++
        }else if(result.cancelled){
          // Interrupted work supplies no new source evidence. Keep any already
          // established hold rather than replacing it with generic backoff.
          o.failed++
        }else if(result.failed){
          failedItem(state,image.key,now());o.failed+=result.failed||1
          for(const e of result.failures){
            if(e.imageLimit && !e.persistenceError){
              state.retries[image.key].image_limit={...e.imageLimit,sourceUrl:image.source_url,checkedAt:now()}
              state.retries[image.key].until=now()+options.recheckHours*3600000;o.new_limit_failures++
            }else if(knownLimit && /^OCR_IMAGE_(HTTP_\d{3}|REQUEST_FAILED|TOO_LARGE|EMPTY)$/.test(e.code)){
              // A failed source check cannot establish new bytes. Retain the last
              // confirmed hold and its daily cadence; still report this new error.
              state.retries[image.key].image_limit=knownLimit
              state.retries[image.key].until=now()+options.recheckHours*3600000
              state.retries[image.key].last_check_error=e.persistenceError||e.code
            }
            problem('ocr',{code:e.persistenceError||e.code},image.id)
          }
        }
        else completedItem(state,image.key,now())
        if(!result.cancelled){commitPriority(state,'ocr',image);o[image.work_kind==='NEW'?'new_processed':'rechecked']++}
        state.lanes.ocr=1-state.lanes.ocr;await checkpoint()
      }
      o.limit_reached=o.attempted>=options.ocrLimit||o.checked>=options.imageChecks
      o.ocr_limit_reached=o.attempted>=options.ocrLimit;o.image_check_limit_reached=o.checked>=options.imageChecks
      o.remaining={known_due_not_checked:Math.max(0,selected.ready.length-o.checked),new_ocr_needed:'UNKNOWN_UNTIL_HASH_CHECK'}
      o.status=o.failed?'PARTIAL':'SUCCEEDED';check()
      startStage('analysis')
      snapshot=await runtime.repository.snapshot(conditions,options.dbPages)
      const a=report.stages.analysis;a.status='RUNNING'
      const analyses=analysisSelection(snapshot,state,now(),runtime.imageValidationKey);a.reused=analyses.reused.length;a.skipped=analyses.blocked.length+analyses.cooldown.length
      for(const target of analyses.ready.slice(0,options.analysisLimit)){
        check();(state.owners||={})[target.key]=target.concert.kopis_id
        report.priority_selection.analysis.push(priorityPreview(target))
        try{
          const ocr=await runtime.repository.ocrResult(target.ocr.id);check()
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
          a.succeeded++;completedAnalyses.add(target.key);completedItem(state,target.key,now())
        }catch(e){if(safeCode(e)==='BATCH_INTERRUPTED')throw e;a.failed++;failedItem(state,target.key,now());problem('analysis',e,target.ocr.id,target.key)}
        commitPriority(state,'analysis',target)
        await checkpoint()
      }
      a.limit_reached=analyses.ready.length>=options.analysisLimit
      a.remaining={known_ready_not_attempted:Math.max(0,analyses.ready.length-options.analysisLimit),blocked:analyses.blocked.length,cooldown:analyses.cooldown.length}
      a.status=a.failed?'PARTIAL':'SUCCEEDED'
      report.status=Object.values(report.stages).some(x=>x.failed)?'PARTIAL':'SUCCESS'
      finishStage()
    }
    const reviews=await runtime.repository.reviewSummary(options.dbPages)
    const pendingReviews=reviews.filter(x=>x.matcher_version===rollout.reviewVersion&&(x.matching_catalog_hash||x.catalog_hash)===CATALOG_HASH&&!x.stale_reason)
    report.review.total_review_required=pendingReviews.length
    for(const x of pendingReviews.filter(x=>x.track_id)){
      const concert=snapshot.concerts.find(c=>c.kopis_id===x.kopis_id)
      if(concert&&!report.review.priority.some(y=>y.candidate_id===x.id))report.review.priority.push({candidate_id:x.id,kopis_id:x.kopis_id,concert:x.concert_title,
        date_from:concert.start_date,date_to:concert.end_date,track_id:x.track_id,track:getTrackTarget(x.track_id)?.title||'Registered track',show:`npm run program:analyze -- show ${x.id}`})
    }
    report.review.priority=report.review.priority.slice(0,20)
    report.coverage={cleanup_remaining:report.stages.cleanup.remaining,kopis_listing_cycle_completed:report.stages.collection.listing_cycle_completed||false,
      limited_by_caps:Object.values(report.stages).some(s=>s.limit_reached||s.page_limit_reached),
      unseen_kopis_or_changed_remote_images:'UNKNOWN',known_ocr_remaining:report.stages.ocr.remaining,known_analysis_remaining:report.stages.analysis.remaining}
    report.retry_targets=Object.entries(state.retries).map(([key,value])=>({key,failures:value.failures,retry_at:koreanTime(value.until)}))
    report.exit_code=report.status==='PARTIAL'?1:0
  }catch(error){
    const code=safeCode(error)
    report.errors.push({stage:preflightDone?'execution':'preflight',code})
    report.status=code==='BATCH_INTERRUPTED'?'PARTIAL':!preflightDone||fatalCode(code)?'FATAL':'PARTIAL';report.exit_code=report.status==='FATAL'?2:1
    if(code==='BATCH_INTERRUPTED')report.termination_reason=report.time_limit_reached?'TIME_LIMIT':String(signal?.reason||'CANCELLED')
    for(const s of Object.values(report.stages))if(s.status==='RUNNING'){s.status=code==='BATCH_INTERRUPTED'?'INTERRUPTED':'FAILED';if(!s.failed)s.failed=1}
  }finally{
    finishStage()
    await runtime.worker?.close()
    for(const s of Object.values(report.stages))if(s.status==='RUNNING')s.status='INTERRUPTED'
    report.finished_at=koreanTime(now());report.duration_ms=Math.max(0,now()-started)
    report.time_limit_reached ||= now()-started>=options.maxSeconds*1000||signal?.reason==='TIME_LIMIT'
    workload()
    refreshHolds()
    if(!plan){if(report.status==='SKIPPED_ROLLOUT_GATE')await local.saveReport(report);else await persist()}
  }
  return report
}
