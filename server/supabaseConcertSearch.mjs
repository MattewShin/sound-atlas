import { createSupabaseRest } from './supabaseRest.mjs'
import { ConcertApiError, apiDate, safeUrl } from './kopisData.mjs'
import { koreaDate, MAX_CONCERT_SEARCH_DAYS, validateConcertQuery } from '../src/data/concertSearchConfig.js'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { CATALOG_HASH, MATCHER_VERSION } from './programAnalysis.mjs'

// Existing private, invoker-security view supplies evidence freshness (including
// active DETAIL images). Never select OCR text, identity, bbox or review notes.
const selection = 'id,concert_id,track_id,work_id,relation,outcome,review_status,effective_status,is_effectively_confirmed,analysis_is_current,stale_reason,matcher_version,catalog_hash,source_url,concerts!inner(kopis_id,title,venue,region,start_date,end_date,performance_status,synced_at)'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = ['공연예정', '공연중']
const unavailable = () => new ConcertApiError('DB_SEARCH_UNAVAILABLE', '확인된 공연을 조회하지 못했어요. 잠시 후 다시 시도해주세요.', 503)

export const createSupabaseConcertSearch = ({ env = process.env, fetchImpl = fetch, delay, now = Date.now } = {}) => {
  let request
  try { request = createSupabaseRest({ env, fetchImpl, delay }) } catch { /* reported without exposing configuration values */ }
  const config = () => ({ backend: 'supabase', configured: Boolean(request), cacheTtlMs: 0, maxSearchDays: MAX_CONCERT_SEARCH_DAYS })
  const search = async (input) => {
    let query
    try { query = validateConcertQuery(input) } catch { throw new ConcertApiError('INVALID_QUERY', '지역과 관람 기간을 올바르게 선택해주세요. 최대 31일까지 조회할 수 있어요.', 400) }
    const target = typeof input.targetTrackId === 'string' && getTrackTarget(input.targetTrackId)
    if (!target) throw new ConcertApiError('INVALID_TARGET', '등록된 곡 ID를 선택해주세요.', 400)
    if (!request) throw new ConcertApiError('DB_SEARCH_NOT_CONFIGURED', '확인된 공연 검색의 서버 연결 설정이 필요해요.', 503)
    const timestamp = now(), today = koreaDate(timestamp), from = query.from > today ? query.from : today
    const concerts = new Map()
    if (query.to >= today) {
      try {
        let lastId
        for (let page = 0; ; page++) {
          if (page >= 50) throw unavailable() // fail explicitly rather than silently truncate
          const rows = await request('concert_program_candidate_status', { params: {
            select: selection, track_id: `eq.${target.trackId}`, work_id: `eq.${target.workId}`,
            review_status: 'eq.CONFIRMED', effective_status: 'eq.CONFIRMED', relation: 'eq.EXACT', outcome: 'eq.MATCHED',
            is_effectively_confirmed: 'eq.true', analysis_is_current: 'eq.true', stale_reason: 'is.null',
            matcher_version: `eq.${MATCHER_VERSION}`, catalog_hash: `eq.${CATALOG_HASH}`,
            'concerts.start_date': `lte.${query.to}`, 'concerts.end_date': `gte.${from}`,
            'concerts.performance_status': 'in.(공연예정,공연중)',
            ...(query.region === '전국' ? {} : { 'concerts.region': `eq.${query.region}` }),
            order: 'id.asc', limit: '100', ...(lastId ? { id: `gt.${lastId}` } : {}),
          } })
          if (!Array.isArray(rows)) throw unavailable()
          for (const row of rows) {
            if (!uuid.test(row?.id) || !row.concerts || (lastId && row.id <= lastId)) throw unavailable()
            lastId = row.id
            const c = row.concerts
            // Defense in depth: the projection is always constructed explicitly.
            if (row.track_id !== target.trackId || row.work_id !== target.workId || row.relation !== 'EXACT' || row.outcome !== 'MATCHED'
              || row.review_status !== 'CONFIRMED' || row.effective_status !== 'CONFIRMED' || row.is_effectively_confirmed !== true
              || row.analysis_is_current !== true || row.stale_reason !== null
              || row.matcher_version !== MATCHER_VERSION || row.catalog_hash !== CATALOG_HASH
              || !states.includes(c.performance_status) || !apiDate(c.start_date) || !apiDate(c.end_date)
              || c.start_date > c.end_date || c.start_date > query.to || c.end_date < from
              || (query.region !== '전국' && c.region !== query.region)) continue
            if (!/^PF\d{1,12}$/.test(c.kopis_id) || !c.title?.trim() || !c.venue?.trim() || !Number.isFinite(Date.parse(c.synced_at))) throw unavailable()
            if (concerts.has(c.kopis_id)) continue
            concerts.set(c.kopis_id, {
              id: `kopis-${c.kopis_id}`, kopisId: c.kopis_id, title: c.title, venue: c.venue, region: c.region,
              dateFrom: c.start_date, dateTo: c.end_date, performanceStatus: c.performance_status,
              sourceUrl: `https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=${c.kopis_id}`,
              sourceLabel: '저장된 프로그램 수동 검토 결과', fetchedAt: c.synced_at,
              searchBackend: 'supabase', programStatus: 'verified', programVerification: 'reviewed-db',
              programWorkIds: [target.workId], programTrackIds: [target.trackId],
              targetMatch: { targetTrackId: target.trackId, workId: target.workId, status: 'matched',
                evidenceKind: 'reviewed-db', relation: 'EXACT', reviewStatus: 'CONFIRMED', completed: true,
                reason: '원본 프로그램과 곡의 연결을 수동 검토한 결과예요.',
                evidenceSourceUrl: safeUrl(row.source_url),
              },
            })
          }
          if (rows.length < 100) break
        }
      } catch { throw unavailable() }
    }
    return { backend: 'supabase', query, targetTrackId: target.trackId,
      concerts: [...concerts.values()].sort((a,b) => a.dateFrom.localeCompare(b.dateFrom) || a.kopisId.localeCompare(b.kopisId)),
      fetchedAt: new Date(timestamp).toISOString(), fromCache: false, cacheTtlMs: 0 }
  }
  return { backend: 'supabase', config, search, close() {} }
}
