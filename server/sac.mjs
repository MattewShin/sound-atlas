import { CONCERT_CACHE_TTL_MS } from '../src/data/concertSearchConfig.js'

const endpoint = 'https://www.sac.or.kr/site/main/program/getProgramCalList'
const date = (value) => {
  const formatted = String(value || '').trim().replaceAll('.', '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted)
    && new Date(formatted + 'T00:00:00Z').toISOString().slice(0, 10) === formatted ? formatted : null
}
const monthsIn = (from, to) => {
  const months = []
  let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7))
  while (year < Number(to.slice(0, 4)) || (year === Number(to.slice(0, 4)) && month <= Number(to.slice(5, 7)))) {
    months.push({ year, month })
    if (++month === 13) { year++; month = 1 }
  }
  return months
}
const collect = (value, rows) => {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach((item) => collect(item, rows)); return }
  if (Object.hasOwn(value, 'SN') && Object.hasOwn(value, 'PROGRAM_SUBJECT')) rows.push(value)
  Object.values(value).forEach((item) => collect(item, rows))
}

export const normalizeSacConcert = (row, fetchedAt) => {
  const sacId = String(row.SN || '')
  const dateFrom = date(row.BEGIN_DATE), dateTo = date(row.END_DATE)
  if (!/^\d{1,12}$/.test(sacId) || !String(row.PROGRAM_SUBJECT || '').trim() || !dateFrom || !dateTo || dateFrom > dateTo) return null
  return {
    id: `sac-${sacId}`, sacId, title: String(row.PROGRAM_SUBJECT).trim(), dateFrom, dateTo,
    venue: `예술의전당 ${String(row.PLACE_NAME || '음악당').trim()}`, region: '서울',
    genre: '서양음악(클래식)', performanceStatus: String(row.SALE_STATE_CODE_NAME || '').trim(),
    saleState: String(row.SALE_STATE_CODE_NAME || '').trim(),
    sourceUrl: `https://www.sac.or.kr/site/main/show/show_view?SN=${sacId}`,
    sourceLabel: '예술의전당 공식 공연 정보', fetchedAt,
    programStatus: 'unavailable', programWorkIds: [],
  }
}

export const createSacService = ({ fetchImpl = fetch, now = Date.now, ttl = CONCERT_CACHE_TTL_MS } = {}) => {
  const cache = new Map(), pending = new Map()
  const month = async (year, monthNumber) => {
    const key = `${year}-${monthNumber}`, entry = cache.get(key)
    if (entry && now() - entry.at < ttl) return entry.concerts
    if (pending.has(key)) return pending.get(key)
    const request = (async () => {
      const body = new URLSearchParams({
        searchYear: String(year), searchMonth: String(monthNumber), searchFirstDay: '1',
        searchLastDay: String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()), CATEGORY_PRIMARY: '2',
      })
      const response = await fetchImpl(endpoint, { method: 'POST', headers: {
        Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      }, body, redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok || !/json/i.test(response.headers?.get?.('content-type') || '')) throw new Error('SAC calendar unavailable')
      const raw = await response.text()
      if (raw.length > 3_000_000) throw new Error('SAC calendar response too large')
      const data = JSON.parse(raw), rows = []
      collect(data, rows)
      // A valid empty month can have no rows, but a changed response structure should never masquerade as an empty calendar.
      if (!Array.isArray(data) && !rows.length && !JSON.stringify(data).includes('[]')) throw new Error('SAC calendar response changed')
      const concerts = [...new Map(rows.map((row) => normalizeSacConcert(row, new Date(now()).toISOString()))
        .filter(Boolean).map((concert) => [concert.id, concert])).values()]
      cache.set(key, { at: now(), concerts })
      return concerts
    })()
    pending.set(key, request)
    try { return await request } finally { if (pending.get(key) === request) pending.delete(key) }
  }
  const search = async ({ region, from, to }) => {
    if (region !== '서울' && region !== '전국') return []
    const results = await Promise.all(monthsIn(from, to).map(({ year, month: number }) => month(year, number)))
    return [...new Map(results.flat().filter((item) => item.dateFrom <= to && item.dateTo >= from)
      .map((item) => [item.id, item])).values()]
  }
  return { search }
}
