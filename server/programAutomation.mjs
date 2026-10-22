import {analyzeStoredProgram, CATALOG_HASH} from './programAnalysis.mjs'
import {matchNormalizedProgramWork} from './programMatchingNormalization.mjs'
import {checkProgramContext} from './programContext.mjs'
import {getTrackTarget} from '../src/data/workCatalog.js'
import {canonicalIdentityJson} from './programWorkIdentity.mjs'

export const AUTOMATION_RULE = 'program-auto-1'
// A reparse is a consistency check, never another independent observation.
export const automaticDecision = (candidate, analysis, target) => {
  const reasons = []
  const {concert,image,ocr} = target
  const section = analysis.sections[candidate.section_index]
  const context = checkProgramContext({...concert,dateFrom:concert.start_date,dateTo:concert.end_date},ocr.raw_text)
  if (!image.is_active || image.image_type !== 'DETAIL') reasons.push('PROGRAM_EVIDENCE_MISSING')
  if (!context.verified) reasons.push('CONTEXT_' + context.conflict.toUpperCase())
  // Validate calendar components before comparing dates: 19.30 is a time.
  const dates = [...ocr.raw_text.matchAll(/(?:^|\s)(\d{1,2})\s*[.월/]\s*(\d{1,2})\s*(?:일|[.\s]|$)/g)]
    .map(m=>[Number(m[1]),Number(m[2])]).filter(([m,d])=>m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(Number(concert.start_date.slice(0,4)),m,0)).getUTCDate())
  if(concert.start_date!==concert.end_date || dates.some(([m,d])=>`${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`!==concert.start_date.slice(5))
    || /series\s+overview|시리즈\s*전체|매월|총\s*\d+회|Session\s*[12]/i.test(ocr.raw_text)) reasons.push('PROGRAM_DATE_SCOPE_AMBIGUOUS')
  if(section?.reason!=='EXPLICIT_PROGRAM_HEADING') reasons.push('PROGRAM_EVIDENCE_MISSING')
  const chars=[...ocr.raw_text]
  if(!candidate.evidence?.length || candidate.evidence.some(e=>!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||chars.slice(e.start,e.end).join('')!==e.quote
    ||e.start<section?.start||e.end>section?.end)) reasons.push('SOURCE_QUOTE_MISMATCH')
  const {decision,matching}=matchNormalizedProgramWork(candidate.identity,candidate.identity.composer)
  if(decision.track_id!==candidate.track_id||decision.work_id!==candidate.work_id||decision.relation!==candidate.relation||decision.outcome!==candidate.outcome) reasons.push('IDENTITY_MISMATCH')
  const t=getTrackTarget(decision.track_id)
  if(decision.outcome==='UNREGISTERED') reasons.push('CATALOG_TARGET_MISSING')
  else if(decision.outcome!=='MATCHED') reasons.push(...decision.reasons)
  if(decision.relation!=='EXACT'||!t) reasons.push(decision.relation==='WHOLE_WORK_REFERENCE'?'WHOLE_WORK_WITHOUT_EXPLICIT_MOVEMENT':'MOVEMENT_OR_ARRANGEMENT_UNRESOLVED')
  // Even a catalog with just one registered movement cannot prove whole-work performance.
  if(t?.movementNumber!=null && !matching.movement_numbers.includes(t.movementNumber)) reasons.push('EXPLICIT_MOVEMENT_REQUIRED')
  if(t?.movementNumber==null && matching.movement_numbers.length) reasons.push('MOVEMENT_CANNOT_EXPAND_TO_WHOLE_WORK')
  if(candidate.identity.arrangement_or_excerpt || matching.variants.some(v=>v.arrangement.arranged)
    || t?.arrangement || t?.excerpt || t?.work?.arrangement || t?.work?.excerpt) reasons.push('ARRANGEMENT_IDENTITY_UNRESOLVED')
  const allowed = new Set([...decision.reasons,'MULTIPLE_DATES_OR_SERIES_SCOPE','UNCERTAIN_PROGRAM_SECTION'])
  reasons.push(...(candidate.review_reasons||[]).filter(r=>!allowed.has(r)&&!r.startsWith('LOGICAL_SEPARATE_')))
  // OCR confidence alone neither confirms nor overrides an identifying conflict.
  return {status:reasons.length?'REJECTED':'CONFIRMED',reasons:[...new Set(reasons.length?reasons:['SOURCE_AND_UNIQUE_IDENTITY_VERIFIED'])],
    verification:{catalog_hash:CATALOG_HASH,rule:AUTOMATION_RULE,source_reparse:true,independent_observations:1}}
}

export const automaticSummary = () => ({confirmed:0,duplicate_maintained:0,unlinked:0,retry_pending:0,failed:0,unchanged:0,reasons:{},items:[]})
export const addAutomaticResult = (summary,result) => {
  const key={AUTO_CONFIRMED:'confirmed',DUPLICATE_EFFECTIVE_CONFIRMATION:'duplicate_maintained',AUTO_UNLINKED:'unlinked',RETRY_PENDING:'retry_pending',FAILED:'failed',UNCHANGED:'unchanged'}[result.outcome]
  if(key)summary[key]++
  for(const r of result.reasons||[])summary.reasons[r]=(summary.reasons[r]||0)+1
  summary.items.push(result)
}

// DB checkpoints survive local state loss. Never mark unfinished work complete.
export const runAutomaticPrograms = async ({store,limit=20,candidateLimit=100,imageIds,save=true,check=()=>{},onCheckpoint=async()=>{}}) => {
  const report=automaticSummary()
  let attempted=0
  try{
  const queue=await store.queue(limit,{imageIds})
  report.images_selected=queue.length;report.images_completed=0;report.deferred_images=queue.length
  report.limit_reached=queue.length===limit
  for(const item of queue){
    check()
    try{
      const target=await store.target(item);check()
      if(!target){
        const result=save?await store.unavailable(item):{outcome:'RETRY_PENDING',reasons:['CURRENT_OCR_UNAVAILABLE']}
        addAutomaticResult(report,{analysis_id:item.id,...result})
        if(result.outcome==='AUTO_UNLINKED'){report.images_completed++;report.deferred_images--}
        await onCheckpoint(report)
        continue
      }
      const fresh=analyzeStoredProgram(target)
      const analysisId=save?await store.saveAnalysis(fresh):item.id
      check()
      const scope=save?await store.scope(analysisId):item.input_hash
      const candidates=save?await store.candidates(analysisId):fresh.candidates
      if(candidates.length>=1000)throw Object.assign(new Error('AUTOMATION_SCAN_LIMIT'),{code:'AUTOMATION_SCAN_LIMIT'})
      const existingLinks=!save&&store.existingLinks?await store.existingLinks(target.concert.id):[]
      let complete=true
      for(const c of candidates){
        check()
        if(save&&c.auto_input_hash===scope){addAutomaticResult(report,{candidate_id:c.id,outcome:'UNCHANGED',reasons:[]});continue}
        if(attempted>=candidateLimit){report.limit_reached=true;report.deferred_reason='CANDIDATE_LIMIT';return report}
        attempted++
        try{
          const agrees=n=>n.track_id===c.track_id&&n.work_id===c.work_id&&n.relation===c.relation&&n.outcome===c.outcome&&n.section_index===c.section_index
            &&canonicalIdentityJson(n.evidence)===canonicalIdentityJson(c.evidence)&&canonicalIdentityJson(n.identity)===canonicalIdentityJson(c.identity)
          const source=fresh.candidates.find(n=>n.candidate_key===c.candidate_key&&agrees(n))||fresh.candidates.find(agrees)
          const verified=source?{...source,candidate_key:c.candidate_key}:c
          const decision=source?automaticDecision(verified,fresh,target):{status:'REJECTED',reasons:['SNAPSHOT_IDENTITY_MISMATCH']}
          const duplicate=decision.status==='CONFIRMED'&&existingLinks.some(x=>x.track_id===c.track_id&&x.work_id===c.work_id)
          const result=save?await store.decide({analysisId,candidate:c,scope,decision,verified}):{outcome:decision.status==='CONFIRMED'?(duplicate?'DUPLICATE_EFFECTIVE_CONFIRMATION':'AUTO_CONFIRMED'):'AUTO_UNLINKED',reasons:decision.reasons}
          if(['RETRY_PENDING','FAILED'].includes(result.outcome))complete=false
          addAutomaticResult(report,{candidate_id:c.id||c.candidate_key,track_id:c.track_id,...result})
        }catch(e){
          if(e.code==='BATCH_INTERRUPTED')throw e
          complete=false;addAutomaticResult(report,{candidate_id:c.id,outcome:e.retryable?'RETRY_PENDING':'FAILED',reasons:[e.code||'AUTOMATIC_SAVE_FAILED']})
        }
        await onCheckpoint(report)
      }
      if(!candidates.length)addAutomaticResult(report,{analysis_id:analysisId,outcome:'AUTO_UNLINKED',reasons:['PROGRAM_EVIDENCE_MISSING']})
      if(complete){
        check()
        const finished=!save||await store.finish(analysisId,scope)
        if(finished!==false){report.images_completed++;report.deferred_images--}
        else addAutomaticResult(report,{analysis_id:analysisId,outcome:'RETRY_PENDING',reasons:['EVIDENCE_CHANGED_DURING_FINALIZATION']})
      }
    }catch(e){
      if(e.code==='BATCH_INTERRUPTED')throw e
      addAutomaticResult(report,{analysis_id:item.id,outcome:e.retryable?'RETRY_PENDING':'FAILED',reasons:[e.code||'AUTOMATIC_ANALYSIS_FAILED']})
    }
    await onCheckpoint(report)
  }
  return report
  }catch(error){
    if(error.code==='BATCH_INTERRUPTED'){report.deferred_reason='TIME_LIMIT_OR_INTERRUPTION';error.automationReport=report}
    throw error
  }
}
