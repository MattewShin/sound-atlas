import { collectionConditions } from './concertCollectionConfig.mjs'
export { COLLECTION_GENRE, COLLECTION_STATES, collectionConditions } from './concertCollectionConfig.mjs'
import { apiDate, asArray, ConcertApiError, normalizeKopisConcert, parseKopisXml, safeUrl, text } from './kopisData.mjs'
import { CollectionError, pause, requestWithRetry } from './collectionHttp.mjs'

const states = new Set(['공연예정', '공연중'])
const validId = (value) => /^PF\d{1,12}$/.test(text(value))
const fail = (code, message) => { throw new CollectionError(code, message) }

export const parseCollectionArgs = (args) => {
  let limit = 10, dryRun = false, help = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true
    else if (args[i] === '--help') help = true
    else if (args[i] === '--limit' || args[i].startsWith('--limit=')) {
      const raw = args[i] === '--limit' ? args[++i] : args[i].slice(8)
      if (!/^[1-9]\d*$/.test(raw || '') || !Number.isSafeInteger(Number(raw))) fail('INVALID_LIMIT', '--limit must be a positive safe integer')
      limit = Number(raw)
    } else fail('INVALID_ARGUMENT', 'Use --dry-run, --limit N or --help')
  }
  return { limit, dryRun, help }
}

const updatedTimestamp = (value) => {
  if (value == null || value === '') return null
  const input = text(value)
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/.exec(input)
  if (!match || !apiDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    fail('INVALID_UPDATED_AT', 'updatedate must be a valid KOPIS date/time')
  }
  // KOPIS provides a Korean wall-clock timestamp without an offset.
  // Live responses also include microseconds; keep that precision for PostgreSQL.
  return input.replace(' ', 'T') + '+09:00'
}

export const normalizeCollectionDetail = (row, expectedId, conditions, fetchedAt) => {
  if (!validId(row?.mt20id)) fail('INVALID_ID', 'Missing or invalid mt20id')
  if (text(row.mt20id) !== expectedId) fail('DETAIL_ID_MISMATCH', 'Detail mt20id differs from requested ID')
  if (!text(row.prfnm)) fail('INVALID_TITLE', 'Missing prfnm')
  if (!text(row.fcltynm)) fail('INVALID_VENUE', 'Missing fcltynm')
  // Shared parser/normalizer validates real calendar dates without inventing defaults.
  const normalized = normalizeKopisConcert(row, fetchedAt)
  if (!states.has(normalized.performanceStatus)) fail('OUT_OF_SCOPE_STATUS', 'Detail is not 예정/공연중')
  if (normalized.region !== conditions.region || normalized.genre !== '서양음악(클래식)') fail('OUT_OF_SCOPE_CATEGORY', 'Detail region or genre differs from collection conditions')
  // Inclusive overlap; deliberately no start_date >= today condition.
  if (normalized.dateFrom > conditions.to || normalized.dateTo < conditions.from) fail('OUT_OF_SCOPE_DATE', 'Detail does not overlap the collection period')
  const imageUrl = (value) => {
    const url = safeUrl(value)
    if (!url) fail('INVALID_IMAGE_URL', 'Image URL must be absolute HTTP(S) without credentials')
    // Preserve the original URL, including query order, for stable source identity.
    return text(value)
  }
  const poster = text(row.poster) ? imageUrl(row.poster) : null
  if (row.poster != null && typeof row.poster !== 'string') fail('INVALID_IMAGE_URL', 'Invalid poster value')
  const images = new Map()
  if (poster) images.set(poster, { source_url: poster, image_type: 'POSTER', sort_order: 0 })
  if (row.styurls && (typeof row.styurls !== 'object' || Array.isArray(row.styurls)
    || Object.keys(row.styurls).some((key) => key !== 'styurl'))) fail('INVALID_IMAGES', 'Invalid styurls container')
  asArray(row.styurls?.styurl).forEach((value, index) => {
    const sourceUrl = imageUrl(value)
    // URL uniqueness means POSTER wins if it also occurs in styurls.
    if (!images.has(sourceUrl)) images.set(sourceUrl, { source_url: sourceUrl, image_type: 'DETAIL', sort_order: index })
  })
  return { concert: {
    kopis_id: normalized.kopisId, title: normalized.title, venue: normalized.venue, region: normalized.region,
    start_date: normalized.dateFrom, end_date: normalized.dateTo, performance_status: normalized.performanceStatus,
    poster_url: poster, kopis_updated_at: updatedTimestamp(row.updatedate), synced_at: fetchedAt,
  }, images: [...images.values()] }
}

export const createCollectionKopisClient = ({ env = process.env, fetchImpl = fetch, delay = pause, signal } = {}) => {
  const key = env.KOPIS_SERVICE_KEY?.trim()
  if (!key) fail('KOPIS_NOT_CONFIGURED', 'KOPIS_SERVICE_KEY is required (including dry-run)')
  const request = async (path, params = {}) => {
    const url = new URL(`https://kopis.or.kr/openApi/restful/${path}`)
    url.search = new URLSearchParams({ service: key, ...params }).toString()
    try {
      return await requestWithRetry(url, { fetchImpl, delay, signal, label: 'KOPIS', decode: async (response) => {
        const xml = await response.text()
        if (xml.length > 3_000_000) fail('KOPIS_RESPONSE_TOO_LARGE', 'KOPIS response exceeds size limit')
        try { return parseKopisXml(xml, { validateRows: false }) }
        catch (error) {
          if (error instanceof ConcertApiError) throw new CollectionError(error.code, error.message, error.code === 'KOPIS_UPSTREAM_ERROR')
          throw error
        }
      } })
    } finally { await delay(150) }
  }
  return {
    list: ({ conditions, state, page }) => request('pblprfr', {
      stdate: conditions.from.replaceAll('-', ''), eddate: conditions.to.replaceAll('-', ''),
      signgucode: conditions.regionCode, shcate: conditions.genreCode, prfstate: state, cpage: String(page), rows: '100',
    }),
    detail: async (id) => {
      if (!validId(id)) fail('INVALID_ID', 'Invalid detail ID')
      const rows = await request(`pblprfr/${id}`)
      if (rows.length !== 1) fail('DETAIL_MISSING', 'Expected exactly one detail row')
      return rows[0]
    },
  }
}

export const collectConcerts = async ({ client, repository, limit = 10, dryRun = false, now = Date.now, onProgress = () => {} }) => {
  if (!Number.isSafeInteger(limit) || limit < 1) fail('INVALID_LIMIT', 'limit must be a positive safe integer')
  if (!dryRun && !repository) fail('SUPABASE_NOT_CONFIGURED', 'A repository is required for writes')
  const conditions = collectionConditions(now())
  const report = { conditions, dryRun, limit, limitedSample: true, listRows: 0, uniqueConcerts: 0,
    pages: 0, normalized: 0, saved: 0, imageCount: 0, skipped: 0, failures: [], pageFailures: [],
    limitReached: false, allPagesExhausted: false, preview: [] }
  const seen = new Set()
  outer: for (const state of conditions.states) {
    let previousPage = null
    for (let page = 1; ; page++) {
      let rows
      try {
        rows = await client.list({ conditions, state, page })
        report.pages++
        // Detect a server ignoring cpage; report incompleteness instead of looping forever.
        const signature = JSON.stringify(rows)
        if (rows.length === 100 && signature === previousPage) fail('PAGINATION_STALLED', 'KOPIS repeated a full page')
        previousPage = signature
      } catch (error) {
        report.pageFailures.push({ state, page, ...safeFailure(error) })
        break // still try the other performance state
      }
      report.listRows += rows.length
      onProgress({ state, page, rows: rows.length, saved: report.saved, normalized: report.normalized })
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index], id = text(row?.mt20id)
        if (validId(id) && seen.has(id)) continue
        if (validId(id)) { seen.add(id); report.uniqueConcerts++ }
        try {
          if (!validId(id)) fail('INVALID_ID', 'Missing or invalid list mt20id')
          // Validate list dates too; never silently repair an invalid list record from detail.
          const listed = normalizeKopisConcert(row, new Date(now()).toISOString())
          if (listed.dateFrom > conditions.to || listed.dateTo < conditions.from) { report.skipped++; continue }
          const detail = await client.detail(id)
          const snapshot = normalizeCollectionDetail(detail, id, conditions, new Date(now()).toISOString())
          if (!dryRun) await repository.save(snapshot)
          report.normalized++
          if (!dryRun) report.saved++
          report.imageCount += snapshot.images.length
          if (report.preview.length < 3) report.preview.push(snapshot)
          if ((dryRun ? report.normalized : report.saved) >= limit) { report.limitReached = true; break outer }
        } catch (error) {
          report.failures.push({ kopisId: validId(id) ? id : null, state, page, row: index + 1, ...safeFailure(error) })
        }
      }
      if (rows.length < 100) break
    }
  }
  report.allPagesExhausted = !report.limitReached && report.pageFailures.length === 0
  report.failedConcerts = report.failures.length
  report.failedPages = report.pageFailures.length
  report.failed = report.failedConcerts + report.failedPages
  return report
}

const safeFailure = (error) => error instanceof CollectionError || error instanceof ConcertApiError
  ? { code: error.code, reason: error.message }
  : { code: 'COLLECTION_FAILED', reason: 'Unexpected collection failure (raw error suppressed)' }
