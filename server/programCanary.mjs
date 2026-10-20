import { hashJson } from './programAnalysis.mjs'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const validateProgramManifest = manifest => {
  const pinned=manifest?.schema_version==='program-ocr-manifest-2'
  if(!['program-ocr-canary-1','program-ocr-manifest-2'].includes(manifest?.schema_version)||!pinned&&!uuid.test(manifest.source_run_id)||!Array.isArray(manifest.targets)
    ||manifest.targets.length!==manifest.expected_count||manifest.expected_count<1||manifest.expected_count>100
    ||manifest.targets.some(t=>!uuid.test(t.ocr_result_id)||!/^PF\d{1,12}$/.test(t.kopis_id)||
      (pinned? !uuid.test(t.image_id)||!uuid.test(t.source_attempt_id)||!Number.isSafeInteger(t.image_revision)||t.image_revision<0||!Number.isSafeInteger(t.concert_revision)||t.concert_revision<0:!uuid.test(t.source_analysis_id)))
    ||new Set(manifest.targets.map(t=>t.ocr_result_id)).size!==manifest.expected_count
    ||!pinned&&new Set(manifest.targets.map(t=>t.source_analysis_id)).size!==manifest.expected_count)throw new Error('OCR_MANIFEST_INVALID')
  return {...manifest,target_set_hash:hashJson(manifest.targets.map(t=>t.ocr_result_id).sort())}
}

export const programAnalysisCounts = analyses => {
  const candidates=analyses.flatMap(a=>a.candidates||[])
  const linked=candidates.filter(c=>c.catalog_id||c.track_id)
  return {analyses:analyses.length,physical_work_rows:analyses.every(a=>a.grouping)?analyses.reduce((n,a)=>n+a.grouping.physical_work_rows,0):'UNKNOWN',
    logical_candidates:analyses.every(a=>a.logical_works)?analyses.reduce((n,a)=>n+a.logical_works.length,0):'UNKNOWN',
    candidate_records:candidates.length,catalog_linked_candidates:linked.length,unique_catalog_ids:new Set(linked.map(c=>c.catalog_id||c.track_id)).size,
    review_required:candidates.filter(c=>c.review_status==='REVIEW_REQUIRED').length,zero_candidate_ocr:analyses.filter(a=>!a.candidates?.length).length}
}
