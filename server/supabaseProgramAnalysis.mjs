import { createSupabaseRest } from './supabaseRest.mjs'
import { analyzeStoredProgram, CATALOG_HASH, CATALOG_JSON, MATCHER_VERSION } from './programAnalysis.mjs'
import { validateProgramManifest, programAnalysisCounts } from './programCanary.mjs'
import {getProgramWriteVersion,getProgramReviewVersion} from './programRollout.mjs'

export const evidenceIssue = ({ image, ocr, attempts, results }) => {
  if (!image.is_active || image.image_type !== 'DETAIL') return 'IMAGE_INACTIVE_OR_NOT_DETAIL'
  const latest = [...attempts].sort(latestAttemptFirst)[0]
  if (!latest || latest.status !== 'SUCCEEDED') return 'LATEST_OCR_NOT_SUCCESSFUL'
  if (latest.result_id !== ocr.id) return 'OCR_REPLACED'
  if (results.some((r) => r.created_at > latest.created_at)) return 'NEWER_OCR_RESULT'
  if (attempts.some((a) => a.id !== latest.id && a.created_at === latest.created_at && a.finished_at === latest.finished_at && a.result_id !== latest.result_id)) return 'OCR_ORDER_AMBIGUOUS'
  return null
}
// Prefer DB ingestion time to a local PC's potentially skewed finished_at clock.
const latestAttemptFirst = (a,b) => b.created_at.localeCompare(a.created_at) || b.finished_at.localeCompare(a.finished_at) || b.id.localeCompare(a.id)

export const createProgramAnalysisStore = (options = {}) => {
  const request = createSupabaseRest(options)
  const all = async (table, params = {}) => {
    const rows = []
    let lastId
    for (;;) {
      const page = await request(table, { params: { select: '*', order: 'id.asc', ...params, limit: '100', ...(lastId ? { id: `gt.${lastId}` } : {}) } })
      if (!Array.isArray(page)) throw new Error('DB_ROWS_INVALID')
      rows.push(...page)
      if (page.length < 100) return rows
      const nextId = page.at(-1)?.id
      if (typeof nextId !== 'string' || (lastId && nextId <= lastId) || params.id) throw new Error('DB_PAGINATION_STALLED')
      lastId = nextId
    }
  }
  return {
    async preflightSave(){
      getProgramWriteVersion(options.env||process.env)
      const schema=await request('')
      if(!schema.paths?.['/rpc/save_concert_program_analysis_v3'])throw new Error('PROGRAM_ANALYSIS_V3_MIGRATION_REQUIRED')
      const policy=await request('concert_program_version_policy',{params:{select:'enabled',matcher_version:'eq.stored-program-3',limit:'1'}})
      if(!Array.isArray(policy))throw new Error('DB_ROWS_INVALID')
      if(policy[0]?.enabled===false)throw new Error('PROGRAM_ANALYSIS_VERSION_DISABLED')
      return {rpc_ready:true,matcher_version:'stored-program-3'}
    },
    async targets(kopisId) {
      const concerts = await all('concerts', kopisId ? { kopis_id: `eq.${kopisId}` } : {})
      const targets = [], skipped = [], coverage = { concerts: concerts.length, detail_images: 0, results: 0 }
      for (const concert of concerts) {
        const images = await all('concert_program_images', { concert_id: `eq.${concert.id}`, image_type: 'eq.DETAIL' })
        for (const image of images) {
          coverage.detail_images++
          const results = await all('concert_image_ocr_results', { image_id: `eq.${image.id}` })
          coverage.results += results.length
          const attempts = await all('concert_image_ocr_attempts', { image_id: `eq.${image.id}` })
          const ordered = [...attempts].sort(latestAttemptFirst)
          const ocr = results.find((r) => r.id === ordered[0]?.result_id)
          const issue = ocr ? evidenceIssue({ image, ocr, attempts, results }) : image.is_active ? 'NO_CURRENT_SUCCESSFUL_OCR' : 'IMAGE_INACTIVE_OR_NOT_DETAIL'
          if (issue) skipped.push({ kopis_id: concert.kopis_id, image_id: image.id, reason: issue })
          else targets.push({ concert, image, ocr, attempt: ordered[0] })
        }
      }
      return { targets, skipped, coverage }
    },
    async manifestTargets(input) {
      const manifest=validateProgramManifest(input),inIds=values=>`in.(${[...new Set(values)].join(',')})`
      const sourceAnalyses=manifest.schema_version==='program-ocr-canary-1'?await all('concert_program_analyses',{id:inIds(manifest.targets.map(t=>t.source_analysis_id)),select:'id,ocr_result_id,matcher_version'}):[]
      const ocrs=await all('concert_image_ocr_results',{id:inIds(manifest.targets.map(t=>t.ocr_result_id))})
      const images=ocrs.length?await all('concert_program_images',{id:inIds(ocrs.map(o=>o.image_id))}):[]
      const concerts=images.length?await all('concerts',{id:inIds(images.map(i=>i.concert_id))}):[]
      const attempts=images.length?await all('concert_image_ocr_attempts',{image_id:inIds(images.map(i=>i.id))}):[]
      const results=images.length?await all('concert_image_ocr_results',{image_id:inIds(images.map(i=>i.id)),select:'id,image_id,created_at'}):[]
      const targets=[],skipped=[]
      for(const item of manifest.targets){
        const ocr=ocrs.find(o=>o.id===item.ocr_result_id),image=images.find(i=>i.id===ocr?.image_id),concert=concerts.find(c=>c.id===image?.concert_id)
        const ownAttempts=attempts.filter(a=>a.image_id===image?.id),attempt=[...ownAttempts].sort(latestAttemptFirst)[0]
        const source=sourceAnalyses.find(a=>a.id===item.source_analysis_id)
        const pinned=manifest.schema_version==='program-ocr-manifest-2'
        const reason=!pinned&&(!source||source.ocr_result_id!==item.ocr_result_id||source.matcher_version!=='stored-program-2')?'MANIFEST_SOURCE_ANALYSIS_MISMATCH':
          !ocr||!image||!concert?'MANIFEST_EVIDENCE_MISSING':concert.kopis_id!==item.kopis_id?'MANIFEST_CONCERT_MISMATCH':
          pinned&&(image.id!==item.image_id||attempt?.id!==item.source_attempt_id||image.evidence_revision!==item.image_revision||concert.program_context_revision!==item.concert_revision)?'MANIFEST_EVIDENCE_CHANGED':
          evidenceIssue({image,ocr,attempts:ownAttempts,results:results.filter(r=>r.image_id===image.id)})
        if(reason)skipped.push({...item,image_id:image?.id,reason})
        else targets.push({concert,image,ocr,attempt})
      }
      return {targets,skipped,manifest,coverage:{requested_ocr:manifest.expected_count,eligible_ocr:targets.length,source_run_id:manifest.source_run_id,target_set_hash:manifest.target_set_hash}}
    },
    async snapshots(input,{version=MATCHER_VERSION}={}) {
      const manifest=validateProgramManifest(input)
      const analyses=await all('concert_program_analyses',{ocr_result_id:`in.(${manifest.targets.map(t=>t.ocr_result_id).join(',')})`,matcher_version:`eq.${version}`})
      const candidates=analyses.length?await all('concert_program_candidate_status',{analysis_id:`in.(${analyses.map(a=>a.id).join(',')})`}):[]
      return {matcher_version:version,requested_ocr:manifest.expected_count,target_set_hash:manifest.target_set_hash,
        analysis_records:analyses.length,candidate_records:candidates.length,
        summary:programAnalysisCounts(analyses.map(a=>({...a.snapshot,candidates:candidates.filter(c=>c.analysis_id===a.id).map(c=>({
          ...a.snapshot?.candidates?.find(item=>item.candidate_key===c.candidate_key),...c}))}))),
        analyses:analyses.map(a=>({analysis_id:a.id,ocr_result_id:a.ocr_result_id,matcher_version:a.matcher_version,payload_hash:a.payload_hash,
          stored_is_current:a.is_current,effective_is_current:candidates.find(c=>c.analysis_id===a.id)?.analysis_is_current??null,
          snapshot_available:Boolean(a.snapshot),grouping:a.snapshot?.grouping||null,candidates:candidates.filter(c=>c.analysis_id===a.id).map(c=>({candidate_id:c.id,candidate_key:c.candidate_key,
            logical_work_id:a.snapshot?.candidates?.find(item=>item.candidate_key===c.candidate_key)?.logical_work_id||null,
            catalog_id:a.snapshot?.candidates?.find(item=>item.candidate_key===c.candidate_key)?.catalog_id||c.track_id||null,
            track_id:c.track_id,work_id:c.work_id,review_status:c.review_status,effective_status:c.effective_status,stale_reason:c.stale_reason}))}))}
    },
    async save(analysis) {
      if(analysis.matcher_version!==getProgramWriteVersion(options.env||process.env))throw new Error('SAVE_VERSION_MISMATCH')
      // No fallback: the legacy RPC drops logical/normalization data and changes v2 current flags.
      return request('rpc/save_concert_program_analysis_v3', { body: { p_analysis: analysis, p_catalog_json: CATALOG_JSON } })
    },
    async candidates(kopisId,{version=getProgramReviewVersion(options.env||process.env),includeInactive=false}={}) {
      version=getProgramReviewVersion({PROGRAM_REVIEW_VERSION:version})
      return all('concert_program_candidate_status', { matcher_version: `eq.${version}`, catalog_hash: `eq.${CATALOG_HASH}`,
        ...(!includeInactive?{analysis_is_current:'eq.true'}:{}),
        effective_status: 'eq.REVIEW_REQUIRED', ...(kopisId ? { kopis_id: `eq.${kopisId}` } : {}) })
    },
    async detail(id) {
      const reviewVersion=getProgramReviewVersion(options.env||process.env)
      const rows = await all('concert_program_candidate_status', { id: `eq.${id}` })
      if (!rows.length) throw new Error('CANDIDATE_NOT_FOUND')
      const candidate = rows[0]
      const [analysis] = await all('concert_program_analyses', { id: `eq.${candidate.analysis_id}` })
      const [ocr] = await all('concert_image_ocr_results', { id: `eq.${analysis.ocr_result_id}`, select: 'id,content_sha256,pipeline_version,processed_at' })
      const reviews = await all('concert_program_reviews', { candidate_id: `eq.${id}` })
      const stored=analysis.snapshot?.candidates?.find(c=>c.candidate_key===candidate.candidate_key)
      return { ...stored,...candidate, analysis, ocr, reviews,review_version:reviewVersion, local_version_current: candidate.matcher_version === reviewVersion && candidate.catalog_hash === CATALOG_HASH }
    },
    async review(id, status, note, expectedAnalysisId) {
      return request('rpc/review_concert_program_candidate', { body: { p_candidate_id: id, p_status: status, p_note: note,
        p_analysis_id: expectedAnalysisId, p_matcher_version: getProgramReviewVersion(options.env||process.env), p_catalog_hash: CATALOG_HASH } })
    },
  }
}

export const analyzeProgramTargets = async (store, { kopisId, save = false,manifest,version,env=process.env } = {}) => {
  const writeVersion=getProgramWriteVersion(env)
  if(version&&version!==writeVersion)throw new Error('WRITE_VERSION_NOT_IMPLEMENTED')
  if(save){
    if(!manifest)throw new Error('V3_SAVE_REQUIRES_OCR_MANIFEST')
    manifest=validateProgramManifest(manifest)
    if(version!==writeVersion)throw new Error('V3_SAVE_REQUIRES_EXPLICIT_VERSION')
    await store.preflightSave()
  }
  const scope = manifest?await store.manifestTargets(manifest):await store.targets(kopisId)
  const analyses = [], failures = []
  for (const target of scope.targets) {
    try {
      const analysis = analyzeStoredProgram(target)
      const id = save ? await store.save(analysis) : null
      analyses.push({ ...analysis, analysis_id: id, kopis_id: target.concert.kopis_id, title: target.concert.title,
        source_url: target.image.source_url })
    } catch (error) { failures.push({ kopis_id: target.concert.kopis_id, image_id: target.image.id,ocr_result_id:target.ocr.id, reason: error.code || (/^[A-Z0-9_]+$/.test(error.message)?error.message:'ANALYSIS_FAILED') }) }
  }
  const candidates = analyses.flatMap((a) => a.candidates)
  const sections = analyses.flatMap((a) => a.sections)
  return { mode: save ? 'SAVE' : 'DRY_RUN',matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH, limited_sample: true, coverage: scope.coverage,
    summary:programAnalysisCounts(analyses),expected_new_records:{analyses:analyses.length,candidates:candidates.length,condition:'ASSUMING_NO_EXISTING_IDENTICAL_VERSION_KEY_AND_UNCHANGED_EVIDENCE'},
    save_receipt:{successful_calls:save?analyses.length:0,meaning:'SAVED_OR_REUSED_ANALYSIS_ID; NOT_NEW_ROW_COUNT'},
    candidate_counts: { total: candidates.length, linked: candidates.filter((c) => c.track_id).length,
      ...Object.fromEntries(['MATCHED','UNREGISTERED','AMBIGUOUS','CONFLICT'].map((k)=>[k,candidates.filter((c)=>c.outcome===k).length])) },
    section_counts: Object.fromEntries(['PROGRAM','NON_PROGRAM','UNCERTAIN'].map((k)=>[k,sections.filter((s)=>s.classification===k).length])),
    analyzed_images: analyses.length, saved: save ? analyses.length : 0, skipped: scope.skipped, failures, analyses }
}
