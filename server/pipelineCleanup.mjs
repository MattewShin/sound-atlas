// Server/local batch only. No OCR text, detections or review notes are needed.
export const CLEANUP_TABLES = ['concerts','concert_program_images','concert_image_ocr_results',
  'concert_image_ocr_attempts','concert_program_analyses','concert_program_candidates','concert_program_reviews']
export const CLEANUP_SCHEMA_VERSION = 'expired-concert-cleanup-1'
export const emptyCleanupCounts = () => Object.fromEntries(CLEANUP_TABLES.map(t=>[t,0]))
export const validCleanupDates = c => {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value >= '0001-01-01' && value <= '9999-12-31'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
  return valid(c.start_date) && valid(c.end_date) && c.end_date >= c.start_date
}
export const cleanupCounts = (data, concerts) => {
  const ids = new Set(concerts.map(c=>c.id))
  const images = new Set(data.concert_program_images.filter(i=>ids.has(i.concert_id)).map(i=>i.id))
  const analyses = new Set(data.concert_program_analyses.filter(a=>ids.has(a.concert_id)).map(a=>a.id))
  const candidates = new Set(data.concert_program_candidates.filter(c=>analyses.has(c.analysis_id)).map(c=>c.id))
  return {concerts:concerts.length,concert_program_images:images.size,
    concert_image_ocr_results:data.concert_image_ocr_results.filter(r=>images.has(r.image_id)).length,
    concert_image_ocr_attempts:data.concert_image_ocr_attempts.filter(a=>images.has(a.image_id)).length,
    concert_program_analyses:analyses.size,concert_program_candidates:candidates.size,
    concert_program_reviews:data.concert_program_reviews.filter(r=>candidates.has(r.candidate_id)).length}
}
// Only used by plan BEFORE the migration is installed. No deletion fallback.
export const fallbackCleanupPlan = (data, today, limit) => {
  const eligible=data.concerts.filter(c=>validCleanupDates(c)&&c.end_date<today)
    .sort((a,b)=>a.end_date.localeCompare(b.end_date)||a.id.localeCompare(b.id))
  const selected=eligible.slice(0,limit)
  return {reference_date:today,date_source:'CLIENT_ASIA_SEOUL_MIGRATION_REQUIRED',migration_required:true,snapshot_consistent:false,
    total:eligible.length,excluded_invalid_dates:data.concerts.filter(c=>!validCleanupDates(c)).length,
    targets:selected.map(c=>({...c,shared_dependency:cleanupSharedDependency(data,c.id),counts:cleanupCounts(data,[c]),image_ids:data.concert_program_images.filter(i=>i.concert_id===c.id).map(i=>i.id)})),
    counts:cleanupCounts(data,selected),foreign_keys:null}
}
export const cleanupSharedDependency = (data,id) => {
  const imageOwners=new Map(data.concert_program_images.map(i=>[i.id,i.concert_id]))
  const resultOwners=new Map(data.concert_image_ocr_results.map(r=>[r.id,imageOwners.get(r.image_id)]))
  const attemptOwners=new Map(data.concert_image_ocr_attempts.map(a=>[a.id,imageOwners.get(a.image_id)]))
  return data.concert_image_ocr_attempts.some(a=>{const owners=[imageOwners.get(a.image_id),resultOwners.get(a.result_id)]
    return a.result_id&&owners.includes(id)&&new Set(owners).size!==1})
    || data.concert_program_analyses.some(a=>{const owners=[a.concert_id,imageOwners.get(a.image_id),resultOwners.get(a.ocr_result_id),attemptOwners.get(a.source_attempt_id)]
      return owners.includes(id)&&new Set(owners).size!==1})
}
export const cleanupPlanForReport = (plan, limit) => ({reference_date:plan.reference_date,date_source:plan.date_source,
  schema_version:plan.schema_version||null,
  snapshot_consistent:plan.snapshot_consistent===true,
  migration_required:!!plan.migration_required,total:plan.total,limit,remaining:Math.max(0,plan.total-plan.targets.length),
  excluded_invalid_dates:plan.excluded_invalid_dates,counts:plan.counts,foreign_keys:plan.foreign_keys,
  targets:plan.targets.map(c=>({kopis_id:c.kopis_id,title:c.title,end_date:c.end_date,shared_dependency:c.shared_dependency??null,counts:c.counts}))})

export const pruneExpiredPipelineState = (state, today, deleted=[]) => {
  const expired=new Set(deleted.map(c=>c.kopis_id)),images=new Set(deleted.flatMap(c=>c.image_ids||[]))
  for(const [id,dates] of Object.entries(state.collection.dates)){
    if(validCleanupDates({start_date:dates.from,end_date:dates.to})&&dates.to<today)expired.add(id)
  }
  const before=state.collection.pending.length
  state.collection.pending=state.collection.pending.filter(id=>!expired.has(id))
  for(const id of expired)delete state.collection.dates[id]
  for(const stage of Object.values(state.priority||{}))for(const id of expired)if(stage.served)delete stage.served[id]
  let keys=0
  for(const key of new Set([...Object.keys(state.retries),...Object.keys(state.touched),...Object.keys(state.owners||{})])){
    if(expired.has(state.owners?.[key]) || (key.startsWith('collect:')&&expired.has(key.slice(8)))
      || (key.startsWith('ocr:')&&images.has(key.slice(4)))){
      delete state.retries[key];delete state.touched[key];if(state.owners)delete state.owners[key];keys++
    }
  }
  return {pending_removed:before-state.collection.pending.length,local_keys_removed:keys}
}
