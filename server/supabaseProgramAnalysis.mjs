import { createSupabaseRest } from './supabaseRest.mjs'
import { analyzeStoredProgram, CATALOG_HASH, CATALOG_JSON, MATCHER_VERSION } from './programAnalysis.mjs'

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
    async save(analysis) { return request('rpc/save_concert_program_analysis', { body: { p_analysis: analysis, p_catalog_json: CATALOG_JSON } }) },
    async candidates(kopisId) {
      return all('concert_program_candidate_status', { matcher_version: `eq.${MATCHER_VERSION}`, catalog_hash: `eq.${CATALOG_HASH}`,
        analysis_is_current: 'eq.true',
        effective_status: 'eq.REVIEW_REQUIRED', ...(kopisId ? { kopis_id: `eq.${kopisId}` } : {}) })
    },
    async detail(id) {
      const rows = await all('concert_program_candidate_status', { id: `eq.${id}` })
      if (!rows.length) throw new Error('CANDIDATE_NOT_FOUND')
      const candidate = rows[0]
      const [analysis] = await all('concert_program_analyses', { id: `eq.${candidate.analysis_id}` })
      const [ocr] = await all('concert_image_ocr_results', { id: `eq.${analysis.ocr_result_id}`, select: 'id,content_sha256,pipeline_version,processed_at' })
      const reviews = await all('concert_program_reviews', { candidate_id: `eq.${id}` })
      return { ...candidate, analysis, ocr, reviews, local_version_current: candidate.matcher_version === MATCHER_VERSION && candidate.catalog_hash === CATALOG_HASH }
    },
    async review(id, status, note, expectedAnalysisId) {
      return request('rpc/review_concert_program_candidate', { body: { p_candidate_id: id, p_status: status, p_note: note,
        p_analysis_id: expectedAnalysisId, p_matcher_version: MATCHER_VERSION, p_catalog_hash: CATALOG_HASH } })
    },
  }
}

export const analyzeProgramTargets = async (store, { kopisId, save = false } = {}) => {
  const scope = await store.targets(kopisId)
  const analyses = [], failures = []
  for (const target of scope.targets) {
    try {
      const analysis = analyzeStoredProgram(target)
      const id = save ? await store.save(analysis) : null
      analyses.push({ ...analysis, analysis_id: id, kopis_id: target.concert.kopis_id, title: target.concert.title,
        source_url: target.image.source_url })
    } catch (error) { failures.push({ kopis_id: target.concert.kopis_id, image_id: target.image.id, reason: error.code || 'ANALYSIS_FAILED' }) }
  }
  const candidates = analyses.flatMap((a) => a.candidates)
  const sections = analyses.flatMap((a) => a.sections)
  return { mode: save ? 'SAVE' : 'DRY_RUN', limited_sample: true, coverage: scope.coverage,
    candidate_counts: { total: candidates.length, linked: candidates.filter((c) => c.track_id).length,
      ...Object.fromEntries(['MATCHED','UNREGISTERED','AMBIGUOUS','CONFLICT'].map((k)=>[k,candidates.filter((c)=>c.outcome===k).length])) },
    section_counts: Object.fromEntries(['PROGRAM','NON_PROGRAM','UNCERTAIN'].map((k)=>[k,sections.filter((s)=>s.classification===k).length])),
    analyzed_images: analyses.length, saved: save ? analyses.length : 0, skipped: scope.skipped, failures, analyses }
}
