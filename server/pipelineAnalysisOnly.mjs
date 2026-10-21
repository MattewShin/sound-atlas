import { createHash } from 'node:crypto'
import { createPipelineRepository } from './pipelineRepository.mjs'
import { getOcrImageConfig } from './ocrImageConfig.mjs'
import { imageValidationKey } from './kopisImageDownload.mjs'
import { collectionConditions } from './concertCollectionConfig.mjs'
import { analyzeStoredProgram, MATCHER_VERSION, CATALOG_HASH } from './programAnalysis.mjs'
import { validateProgramManifest } from './programCanary.mjs'
import { analysisSelection, completedItem, failedItem } from './pipelineSelection.mjs'
import { commitPriority, priorityPreview } from './pipelinePriority.mjs'
import { getProgramRollout } from './programRollout.mjs'
import { koreanTime, pipelineError, safeCode } from './pipelineConfig.mjs'
import { CollectionError } from './collectionHttp.mjs'

// No KOPIS client, downloader or Python worker is constructed on this path.
export const createAnalysisOnlyRuntime = ({ env=process.env, signal, manifest, fetchImpl=fetch }={}) => {
  const origin=new URL(env.SUPABASE_URL).origin
  const activity={db_reads:0,analysis_save_calls:0,kopis_calls:0,image_downloads:0,ocr_calls:0,python_processes:0,cleanup_deletions:0}
  const tables=new Set(['','concerts','concert_program_images','concert_image_ocr_results','concert_image_ocr_attempts',
    'concert_program_analyses','concert_program_candidates','concert_program_candidate_status','concert_program_version_policy'])
  const guardedFetch=(url,init)=>{
    const u=new URL(url),path=u.pathname.replace(/^\/rest\/v1\//,'')
    if(u.origin!==origin||!u.pathname.startsWith('/rest/v1/'))throw new CollectionError('ANALYSIS_ONLY_UPSTREAM_FORBIDDEN','Analysis-only upstream rejected')
    if(init.method==='GET'&&tables.has(path))activity.db_reads++
    else if(init.method==='POST'&&path==='rpc/save_concert_program_analysis_v3')activity.analysis_save_calls++
    else throw new CollectionError('ANALYSIS_ONLY_OPERATION_FORBIDDEN','Analysis-only operation rejected')
    return fetchImpl(url,init)
  }
  const source=createPipelineRepository({env,signal,fetchImpl:guardedFetch})
  return {analysisOnly:true,manifest,activity,rollout:getProgramRollout(env),
    namespace:createHash('sha256').update(origin).digest('hex').slice(0,16),imageValidationKey:imageValidationKey(getOcrImageConfig(env)),
    preflight:()=>source.analysis.preflightSave(),
    repository:{snapshot:source.snapshot,analysis:source.analysis,candidates:source.candidates,reviewSummary:source.reviewSummary}}
}

const stage=status=>({status,succeeded:0,failed:0,reused:0,skipped:0,limit_reached:false,duration_ms:0})
export const runStoredAnalysisOnly = async ({runtime,local,state,options,plan,signal,now,onProgress,runId,execution}) => {
  const started=now(),conditions=collectionConditions(started)
  const report={run_id:runId,execution,mode:plan?'PLAN':'RUN',execution_mode:'ANALYSIS_ONLY',conditions,limits:options,
    started_at:koreanTime(started),finished_at:null,last_progress_at:koreanTime(started),last_completed_stage:null,
    status:'RUNNING',exit_code:null,duration_ms:0,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,
    rollout:runtime.rollout,activity:runtime.activity,stages:{preflight:stage('NOT_RUN'),
      cleanup:stage('SKIPPED_ANALYSIS_ONLY'),collection:stage('SKIPPED_ANALYSIS_ONLY'),ocr:stage('SKIPPED_ANALYSIS_ONLY'),analysis:stage('NOT_RUN')},
    errors:[],review:{new_candidates:0,new_linked_candidates:0,priority:[]},priority_selection:{collection:[],ocr:[],analysis:[]},time_limit_reached:false}
  let active,stageStarted,snapshot,selection
  const finish=()=>{if(active){const s=report.stages[active];s.finished_at=koreanTime(now());s.duration_ms=now()-stageStarted;if(['SUCCEEDED','PARTIAL'].includes(s.status))report.last_completed_stage=active;active=null}}
  const start=name=>{finish();active=name;stageStarted=now();report.stages[name].started_at=koreanTime(stageStarted);report.stages[name].status='RUNNING'}
  const check=()=>{if(now()-started>=options.maxSeconds*1000||signal?.reason==='TIME_LIMIT')report.time_limit_reached=true;if(signal?.aborted||report.time_limit_reached)throw pipelineError('BATCH_INTERRUPTED')}
  const persist=async()=>{report.last_progress_at=koreanTime(now());report.duration_ms=now()-started;if(!plan){await local.saveState(state);await local.saveReport(report)}}
  try{
    if(!plan&&!runtime.rollout.scheduleEnabled){report.status='SKIPPED_ROLLOUT_GATE';report.exit_code=0;report.termination_reason='PROGRAM_ANALYSIS_SCHEDULE_DISABLED';return report}
    if(!runtime.analysisOnly)throw pipelineError('ANALYSIS_ONLY_RUNTIME_REQUIRED')
    const manifest=validateProgramManifest(runtime.manifest)
    if(manifest.schema_version!=='program-ocr-manifest-2'||manifest.expected_count>options.analysisLimit)throw pipelineError('ANALYSIS_ONLY_MANIFEST_LIMIT')
    start('preflight');report.environment=await runtime.preflight();check()
    snapshot=await runtime.repository.snapshot(conditions,options.dbPages);check()
    const pinned=await runtime.repository.analysis.manifestTargets(manifest);check()
    if(pinned.skipped.length||pinned.targets.length!==manifest.expected_count)throw pipelineError('ANALYSIS_ONLY_EVIDENCE_CHANGED')
    selection=analysisSelection(snapshot,state,now(),runtime.imageValidationKey)
    const ids=new Set(manifest.targets.map(t=>t.ocr_result_id))
    const ready=selection.ready.filter(t=>ids.has(t.ocr.id)),reused=selection.reused.filter(a=>ids.has(a.ocr_result_id))
    if(ready.length+reused.length!==manifest.expected_count)throw pipelineError('ANALYSIS_ONLY_TARGET_NOT_READY')
    report.target_set_hash=manifest.target_set_hash
    report.priority_selection.analysis=ready.map(priorityPreview)
    report.stages.preflight.status='SUCCEEDED';report.stages.preflight.succeeded=1
    report.plan={analysis_ready:selection.ready.length,selected_count:ready.length,analysis_reused:selection.reused.length,
      selected_reused:reused.length,analysis_blocked:selection.blocked,analysis_cooldown:selection.cooldown.length,
      selected_analysis_ocr_ids:ready.map(t=>t.ocr.id),target_set_hash:manifest.target_set_hash,
      db_writes:0,kopis_calls:0,image_downloads:0,ocr_calls:0,cleanup_deletions:0,checkpoint_changed:false}
    if(plan){report.stages.analysis.status='PLANNED';report.status='PLAN_READY';report.exit_code=0;return report}
    await persist();start('analysis')
    const a=report.stages.analysis;a.attempted=0;a.reused=reused.length;a.skipped=selection.blocked.length+selection.cooldown.length;a.scope_reused=selection.reused.length
    // Pinned raw OCR is read from Supabase; source revisions are checked again by the save RPC.
    for(const target of ready){
      check();a.attempted++
      try{
        const source=pinned.targets.find(t=>t.ocr.id===target.ocr.id)
        const payload=analyzeStoredProgram(source);check()
        const id=await runtime.repository.analysis.save(payload)
        const candidates=await runtime.repository.candidates(id)
        if(snapshot.analyses.some(x=>x.id===id))a.reused++
        else{
          report.review.new_candidates+=candidates.length
          report.review.new_linked_candidates+=candidates.filter(c=>c.track_id).length
          report.review.priority.push(...candidates.filter(c=>c.track_id).map(c=>({candidate_id:c.id,analysis_id:id,kopis_id:target.concert.kopis_id,track_id:c.track_id,work_id:c.work_id})))
        }
        a.succeeded++;completedItem(state,target.key,now());commitPriority(state,'analysis',target)
      }catch(error){
        if(signal?.aborted||safeCode(error)==='BATCH_INTERRUPTED')throw pipelineError('BATCH_INTERRUPTED')
        a.failed++;failedItem(state,target.key,now())
        report.errors.push({stage:'analysis',code:safeCode(error),id:target.ocr.id,retry_at:koreanTime(state.retries[target.key].until)})
      }
      await persist();onProgress({event:'checkpoint',stages:report.stages})
    }
    a.status=a.failed?'PARTIAL':'SUCCEEDED';finish()
    report.status=a.failed?'PARTIAL':'SUCCESS';report.exit_code=a.failed?1:0
    snapshot=await runtime.repository.snapshot(conditions,options.dbPages);check()
    const after=analysisSelection(snapshot,state,now(),runtime.imageValidationKey)
    a.remaining={known_ready_not_attempted:after.ready.length,blocked:after.blocked.length,cooldown:after.cooldown.length}
    const reviews=await runtime.repository.reviewSummary(options.dbPages)
    report.review.total_review_required=reviews.filter(c=>c.matcher_version===MATCHER_VERSION&&(c.matching_catalog_hash||c.catalog_hash)===CATALOG_HASH&&!c.stale_reason).length
  }catch(error){
    const code=safeCode(error);report.errors.push({stage:active||'preflight',code})
    report.status=code==='BATCH_INTERRUPTED'||report.stages.analysis.attempted?'PARTIAL':'FATAL';report.exit_code=report.status==='FATAL'?2:1
    if(code==='BATCH_INTERRUPTED')report.termination_reason=report.time_limit_reached?'TIME_LIMIT':String(signal?.reason||'CANCELLED')
    if(active)report.stages[active].status=code==='BATCH_INTERRUPTED'?'INTERRUPTED':'FAILED'
  }finally{
    finish();report.finished_at=koreanTime(now());report.duration_ms=now()-started
    report.time_limit_reached ||= now()-started>=options.maxSeconds*1000||signal?.reason==='TIME_LIMIT'
    if(!plan)await persist()
  }
  return report
}
