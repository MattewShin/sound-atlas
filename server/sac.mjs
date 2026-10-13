import { CONCERT_CACHE_TTL_MS } from '../src/data/concertSearchConfig.js'

const endpoint = 'https://www.sac.or.kr/site/main/program/getProgramCalList'
const date = (value) => {
  const formatted = String(value || '').trim().replaceAll('.', '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted)
    && Number.isFinite(Date.parse(formatted + 'T00:00:00Z'))
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

export const extractSacProgramText = (html) => {
  if (typeof html !== 'string') return ''
  const plain = html.replace(/<(?:script|style|head|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6]|section|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  const lines = plain.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const start = lines.findIndex((line) => /^[\[【]\s*프로그램\s*[\]】]$/.test(line))
  if (start < 0) return ''
  const selected = []
  for (const line of lines.slice(start + 1, start + 41)) {
    if (/^(?:\[?할인정보|\[?예매통계|\[?장소안내|\[?관람평|※\s*(?:C석|할인|출연진)|티켓예매)/.test(line)) break
    selected.push(line)
  }
  return selected.length ? '[PROGRAM]\n' + selected.join('\n') : ''
}

export const createSacService = ({ fetchImpl = fetch, now = Date.now, ttl = CONCERT_CACHE_TTL_MS } = {}) => {
  const cache = new Map(), pending = new Map(), detailCache = new Map(), detailPending = new Map()
  const month = async (year, monthNumber, refresh = false) => {
    const key = `${year}-${monthNumber}`, entry = cache.get(key)
    if (!refresh && entry && now() - entry.at < ttl) return entry.concerts
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
      if (!data || typeof data !== 'object') throw new Error('SAC calendar response changed')
      const concerts = [...new Map(rows.map((row) => normalizeSacConcert(row, new Date(now()).toISOString()))
        .filter(Boolean).map((concert) => [concert.id, concert])).values()]
      cache.set(key, { at: now(), concerts })
      return concerts
    })()
    pending.set(key, request)
    try { return await request } finally { if (pending.get(key) === request) pending.delete(key) }
  }
  const search = async ({ region, from, to }, refresh = false) => {
    if (region !== '서울' && region !== '전국') return []
    const results = await Promise.all(monthsIn(from, to).map(({ year, month: number }) => month(year, number, refresh)))
    return [...new Map(results.flat().filter((item) => item.dateFrom <= to && item.dateTo >= from)
      .map((item) => [item.id, item])).values()]
  }
  const program = async (sacId, refresh = false) => {
    if (!/^\d{1,12}$/.test(sacId)) throw new Error('Invalid SAC concert ID')
    const entry = detailCache.get(sacId)
    if (!refresh && entry && now() - entry.at < ttl) return entry.text
    if (!refresh && detailPending.has(sacId)) return detailPending.get(sacId)
    const request = (async () => {
      const url = `https://www.sac.or.kr/site/main/show/show_view?SN=${sacId}`
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok || !/html/i.test(response.headers?.get?.('content-type') || '')) throw new Error('SAC detail unavailable')
      const html = await response.text()
      if (html.length > 2_000_000) throw new Error('SAC detail response too large')
      const text = extractSacProgramText(html)
      detailCache.set(sacId, { at: now(), text })
      return text
    })()
    detailPending.set(sacId, request)
    try { return await request } finally { if (detailPending.get(sacId) === request) detailPending.delete(sacId) }
  }
  return { search, program }
}
