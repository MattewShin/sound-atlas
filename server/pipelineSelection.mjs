import { hashJson, concertContext, MATCHER_VERSION, CATALOG_HASH } from './programAnalysis.mjs'
import { evidenceIssue } from './supabaseProgramAnalysis.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'

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

export const analysisSelection = (snapshot,state,now) => {
  const ready=[],reused=[],blocked=[],cooldown=[]
  for(const image of snapshot.images){
    const concert=snapshot.concerts.find(c=>c.id===image.concert_id)
    const attempt=latestAttempt(snapshot,image.id),results=snapshot.results.filter(r=>r.image_id===image.id)
    const ocr=results.find(r=>r.id===attempt?.result_id)
    const issue=ocr?evidenceIssue({image,ocr,attempts:snapshot.attempts.filter(a=>a.image_id===image.id),results}):'NO_CURRENT_SUCCESSFUL_OCR'
    if(issue){blocked.push({image_id:image.id,reason:issue});continue}
    const target={concert,image,attempt,ocr}
    target.key='analysis:'+hashJson([ocr.id,attempt.id,image.evidence_revision,concert.program_context_revision,concertContext(concert),MATCHER_VERSION,CATALOG_HASH])
    const existing=snapshot.analyses.find(a=>sameAnalysis(a,target))
    if(existing?.is_current){reused.push(existing);continue}
    if(existing){blocked.push({image_id:image.id,reason:'SUPERSEDED_SAME_KEY_REQUIRES_NEW_EVIDENCE_OR_VERSION'});continue}
    if(!retryDue(state,target.key,now)){cooldown.push(target);continue}
    ready.push(target)
  }
  ready.sort((a,b)=>(state.touched[a.key]||0)-(state.touched[b.key]||0)||a.ocr.created_at.localeCompare(b.ocr.created_at)||a.ocr.id.localeCompare(b.ocr.id))
  return {ready,reused,blocked,cooldown}
}
export const interleave = (a,b,start=0) => {
  const result=[];let i=0,j=0,lane=start
  while(i<a.length||j<b.length){if((lane%2===0&&i<a.length)||j>=b.length)result.push(a[i++]);else result.push(b[j++]);lane++}
  return result
}
export const ocrSelection = (snapshot,state,now,recheckHours) => {
  const fresh=[],recheck=[],cooldown=[],recent=[]
  for(const image of snapshot.images){
    const key='ocr:'+image.id,attempt=latestAttempt(snapshot,image.id)
    const failures=snapshot.attempts.filter(a=>a.image_id===image.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
    const consecutive=failures.findIndex(a=>a.status==='SUCCEEDED')
    const count=consecutive<0?failures.length:consecutive
    const dbWait=attempt?.status==='FAILED'?Date.parse(attempt.created_at)+Math.min(24,2**Math.min(20,Math.max(0,count-1)))*3600000:0
    if(!retryDue(state,key,now)||dbWait>now){cooldown.push(image);continue}
    const successful=snapshot.results.some(r=>r.image_id===image.id&&r.pipeline_version===EASYOCR_PIPELINE_VERSION)
    const touched=state.touched[key]||(!successful?0:Date.parse(attempt?.created_at||0))
    if(successful && attempt?.status==='SUCCEEDED' && now-touched<recheckHours*3600000){recent.push(image);continue}
    ;(successful&&attempt?.status==='SUCCEEDED'?recheck:fresh).push({...image,key,touched,
      concerts:snapshot.concerts.find(c=>c.id===image.concert_id)})
  }
  const sort=(a,b)=>a.touched-b.touched||a.id.localeCompare(b.id)
  return {ready:interleave(fresh.sort(sort),recheck.sort(sort),state.lanes.ocr),cooldown,recent}
}
