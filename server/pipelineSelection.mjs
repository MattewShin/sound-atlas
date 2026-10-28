import { concertContext, MATCHER_VERSION, CATALOG_HASH,programAnalysisCacheKey } from './programAnalysis.mjs'
import { evidenceIssue,effectiveEvidenceAttempt } from './supabaseProgramAnalysis.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { koreanTime } from './pipelineConfig.mjs'
import { prioritize, concertPriority } from './pipelinePriority.mjs'

export const collectionSelection = (snapshot,state,now,recheckHours) => {
  const known=new Map(snapshot.concerts.map(c=>[c.kopis_id,c])),items=[],cooldown=[]
  const ids=new Set([...state.collection.pending,...snapshot.concerts.filter(c=>Date.parse(c.synced_at)<=now-recheckHours*3600000).map(c=>c.kopis_id)])
  for(const id of ids){
    const stored=known.get(id),concert=stored||{kopis_id:id,...state.collection.dates[id]}
    if(!concertPriority(concert,now))continue
    if(stored&&Date.parse(stored.synced_at)>now-recheckHours*3600000)continue
    const item={id,kopis_id:id,key:'collect:'+id,concerts:concert,work_kind:stored?'RECHECK':'NEW',touched:state.touched['collect:'+id]||0}
    ;(retryDue(state,item.key,now)?items:cooldown).push(item)
  }
  return {ready:prioritize(items,state,'collect',now),cooldown,new:items.filter(i=>i.work_kind==='NEW'),recheck:items.filter(i=>i.work_kind==='RECHECK')}
}

export const imageLimitHold = (state,image,validationKey) => {
  const hold=state.retries['ocr:'+image.id]?.image_limit
  return hold && typeof validationKey==='string' && hold.validationKey===validationKey && hold.sourceUrl===image.source_url
    && /^[a-f0-9]{64}$/.test(hold.contentHash) && ['PIXEL_LIMIT','DIMENSION_LIMIT'].includes(hold.reason)
    && Number.isFinite(hold.checkedAt) ? hold : null
}
export const imageLimitHolds = (snapshot,state,validationKey,now) => snapshot.images.flatMap(image=>{
  const hold=imageLimitHold(state,image,validationKey)
  if(!hold)return []
  const retry=state.retries['ocr:'+image.id]
  return [{image_id:image.id,kopis_id:snapshot.concerts.find(c=>c.id===image.concert_id)?.kopis_id,
    code:'OCR_IMAGE_LIMIT_EXCEEDED',reason:hold.reason,content_sha256:hold.contentHash,
    width:hold.width,height:hold.height,max_pixels:hold.maxPixels,max_dimension:hold.maxDimension,
    checked_at:koreanTime(hold.checkedAt),next_check_at:koreanTime(retry.until),failed_attempt_id:hold.attemptId,
    status:retry.until>now?'WAITING_SOURCE_RECHECK':'SOURCE_RECHECK_DUE',last_check_error:retry.last_check_error||null}]
})

export const retryDue = (state,key,now) => !(state.retries[key]?.until>now)
export const failedItem = (state,key,now) => {
  const failures=Math.min(20,(state.retries[key]?.failures||0)+1)
  state.retries[key]={failures,until:now+Math.min(24,2**(failures-1))*3600000}
  state.touched[key]=now
}
export const completedItem = (state,key,now) => {delete state.retries[key];state.touched[key]=now}
export const latestAttempt = (snapshot,imageId) => snapshot.attempts.filter(a=>a.image_id===imageId)
  .sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.finished_at.localeCompare(a.finished_at)||b.id.localeCompare(a.id))[0]
export const sameAnalysis = (a,t) => a.ocr_result_id===t.ocr.id && a.source_attempt_id===t.attempt.id
  && a.matcher_version===MATCHER_VERSION && a.catalog_hash===CATALOG_HASH
  && a.image_revision===(t.image.evidence_revision||0) && a.concert_revision===(t.concert.program_context_revision||0)
  && Object.entries(concertContext(t.concert)).every(([key,value])=>a.concert_context?.[key]===value)

export const analysisSelection = (snapshot,state,now,validationKey) => {
  const ready=[],reused=[],blocked=[],cooldown=[]
  for(const image of snapshot.images){
    if(!concertPriority(snapshot.concerts.find(c=>c.id===image.concert_id),now))continue
    if(imageLimitHold(state,image,validationKey)){blocked.push({image_id:image.id,reason:'OCR_IMAGE_LIMIT_EXCEEDED'});continue}
    const concert=snapshot.concerts.find(c=>c.id===image.concert_id)
    const attempt=effectiveEvidenceAttempt(snapshot.attempts.filter(a=>a.image_id===image.id)),results=snapshot.results.filter(r=>r.image_id===image.id)
    const ocr=results.find(r=>r.id===attempt?.result_id)
    const issue=ocr?evidenceIssue({image,ocr,attempts:snapshot.attempts.filter(a=>a.image_id===image.id),results}):'NO_CURRENT_SUCCESSFUL_OCR'
    if(issue){blocked.push({image_id:image.id,reason:issue});continue}
    const target={concert,image,attempt,ocr,work_kind:'NEW'}
    target.key=programAnalysisCacheKey(target)
    const existing=snapshot.analyses.find(a=>sameAnalysis(a,target))
    if(existing?.is_current){reused.push(existing);continue}
    if(existing){blocked.push({image_id:image.id,reason:'SUPERSEDED_SAME_KEY_REQUIRES_NEW_EVIDENCE_OR_VERSION'});continue}
    if(!retryDue(state,target.key,now)){cooldown.push(target);continue}
    ready.push(target)
  }
  return {ready:prioritize(ready,state,'analysis',now),reused,blocked,cooldown}
}
export const ocrSelection = (snapshot,state,now,recheckHours,validationKey) => {
  const fresh=[],recheck=[],cooldown=[],recent=[],held=[]
  for(const image of snapshot.images){
    const concert=snapshot.concerts.find(c=>c.id===image.concert_id)
    if(!concertPriority(concert,now))continue
    const key='ocr:'+image.id,attempt=latestAttempt(snapshot,image.id)
    const hold=imageLimitHold(state,image,validationKey),storedHold=state.retries[key]?.image_limit
    if(hold){
      held.push(image)
      if(!retryDue(state,key,now)){cooldown.push(image);continue}
      recheck.push({...image,key,touched:state.touched[key]||0,concerts:concert,work_kind:'HOLD_RECHECK'})
      continue
    }
    const failures=snapshot.attempts.filter(a=>a.image_id===image.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
    const consecutive=failures.findIndex(a=>a.status==='SUCCEEDED')
    const count=consecutive<0?failures.length:consecutive
    const dbWait=attempt?.status==='FAILED'?Date.parse(attempt.created_at)+Math.min(24,2**Math.min(20,Math.max(0,count-1)))*3600000:0
    // A changed URL or validation fingerprint must not inherit the old hold or
    // its backoff. Historical generic INVALID failures never become holds here.
    if(!storedHold && (!retryDue(state,key,now)||dbWait>now)){cooldown.push(image);continue}
    const successful=snapshot.results.some(r=>r.image_id===image.id&&r.pipeline_version===EASYOCR_PIPELINE_VERSION)
    const touched=state.touched[key]||(!successful?0:Date.parse(attempt?.created_at||0))
    const sourceRecheck=image.evidence_changed_at&&Date.parse(attempt?.created_at||0)<Date.parse(image.evidence_changed_at)
    if(!storedHold && !sourceRecheck && successful && attempt?.status==='SUCCEEDED' && now-touched<recheckHours*3600000){recent.push(image);continue}
    ;(successful&&attempt?.status==='SUCCEEDED'?recheck:fresh).push({...image,key,touched,
      concerts:concert,work_kind:successful&&attempt?.status==='SUCCEEDED'?'RECHECK':'NEW'})
  }
  return {ready:prioritize([...fresh,...recheck],state,'ocr',now),cooldown,recent,held,new:fresh,recheck}
}
