import { CONCERT_CACHE_TTL_MS, concertQueryKey } from './concertSearchConfig.js'

export const createConcertSearchClient = ({ fetchImpl = (...args) => fetch(...args), storage, now = Date.now } = {}) => {
  let cacheTtlMs = CONCERT_CACHE_TTL_MS
  const memory = new Map(), pending = new Map()
  const request = async (url, options = {}) => {
    let response, data
    try { response = await fetchImpl(url, { cache: 'no-store', ...options }); data = await response.json() }
    catch { if (options.signal?.aborted) throw Object.assign(new Error('검색을 중단했어요.'), { code: 'ABORTED' }); throw Object.assign(new Error('공연 검색 서버에 연결할 수 없습니다. 서버 설정과 네트워크를 확인해주세요.'), { code: 'CONCERT_SERVER_UNAVAILABLE' }) }
    if (!response.ok) throw Object.assign(new Error(data.message || '공연 검색에 실패했습니다.'), { code: data.code || 'CONCERT_SEARCH_ERROR' })
    return data
  }
  const read = (key) => {
    if (memory.has(key)) return memory.get(key)
    try { const entry = JSON.parse(storage?.getItem(`classic-atlas-concert-cache-v1:${key}`) || 'null'); if (entry) memory.set(key, entry); return entry } catch { return null }
  }
  const write = (key, entry) => {
    memory.set(key, entry)
    try { storage?.setItem(`classic-atlas-concert-cache-v1:${key}`, JSON.stringify(entry)) } catch { /* 저장 차단 시 메모리 캐시 유지 */ }
  }
  const cached = async (key, refresh, loader) => {
    const entry = read(key)
    if (!refresh && entry && now() - Date.parse(entry.fetchedAt) >= 0 && now() - Date.parse(entry.fetchedAt) < cacheTtlMs) return { ...entry, fromCache: true }
    if (!refresh && pending.has(key)) { try { return await pending.get(key) } catch { /* 이전 중단 요청의 새 조회 */ } }
    const result = (async () => {
      const data = await loader()
      if (Number.isSafeInteger(data.cacheTtlMs) && data.cacheTtlMs >= 0) cacheTtlMs = data.cacheTtlMs
      write(key, data)
      return data
    })()
    pending.set(key, result)
    try { return await result } finally { if (pending.get(key) === result) pending.delete(key) }
  }
  return {
    async status() {
      const data = await request('/api/concerts/status')
      if (typeof data.configured !== 'boolean') throw Object.assign(new Error('공연 검색 연동 설정 필요'), { code: 'CONCERT_SERVER_UNAVAILABLE' })
      if (Number.isSafeInteger(data.cacheTtlMs) && data.cacheTtlMs >= 0) cacheTtlMs = data.cacheTtlMs
      return data
    },
    search(query, { refresh = false, signal } = {}) {
      const key = concertQueryKey(query)
      return cached(`list:${key}`, refresh, async () => {
        const data = await request(`/api/concerts?${new URLSearchParams({ ...query, ...(refresh ? { refresh: '1' } : {}) })}`, { signal })
        if (!Array.isArray(data.concerts) || !data.query || concertQueryKey(data.query) !== key || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('공연 검색 결과 형식을 확인할 수 없습니다.')
        return data
      })
    },
    program(kopisId, { refresh = false, signal } = {}) {
      if (!/^PF\d{1,12}$/.test(kopisId)) throw new Error('공연 ID가 올바르지 않습니다.')
      return cached(`program:${kopisId}`, refresh, async () => {
        const data = await request(`/api/concerts/${kopisId}/program${refresh ? '?refresh=1' : ''}`, { signal })
        if (data.concert?.kopisId !== kopisId || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('공연 상세 응답을 확인할 수 없습니다.')
        return data
      })
    },
    async matchBatch(targetTrackId, kopisIds, { sacIds = [], refresh = false, cacheOnly = false, signal } = {}) {
      const data = await request('/api/concerts/match-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTrackId, kopisIds, sacIds, refresh, cacheOnly }), signal })
      if (data.targetTrackId !== targetTrackId || !Array.isArray(data.results) || !data.target) throw new Error('대상 곡의 프로그램 확인 응답을 확인할 수 없습니다.')
      return data
    },
  }
}

const sacEventIdentity = (url) => {
  try {
    const parsed = new URL(url)
    return ['www.sac.or.kr', 'sac.or.kr'].includes(parsed.hostname) && parsed.pathname === '/site/main/show/show_view'
      ? parsed.searchParams.get('SN') : null
  } catch { return null }
}
export const isSameConfirmedConcert = (known, incoming) => {
  if (known.kopisId && known.kopisId === incoming.kopisId) return true
  const eventId = sacEventIdentity(known.sourceUrl)
  const officialDate = known.startsAt?.slice(0, 10)
  return Boolean(eventId && incoming.relatedUrls?.some((url) => sacEventIdentity(url) === eventId)
    && incoming.dateFrom === officialDate && incoming.dateTo === officialDate
    && known.kopisHallId && incoming.kopisHallId === known.kopisHallId)
}

// 기존 공식 출처·시간·확인된 프로그램은 API 빈 값이나 소개 자료로 덮어쓰지 않습니다.
export const mergeSearchConcerts = (incomingList, knownList) => {
  const result = new Map(knownList.map((concert) => [concert.id, concert]))
  for (const incoming of incomingList) {
    const known = knownList.find((concert) => isSameConfirmedConcert(concert, incoming))
    if (known) {
      const merged = { ...incoming, ...known, kopisId: incoming.kopisId || known.kopisId, fetchedAt: incoming.fetchedAt || known.fetchedAt }
      if (incoming.programEvidence?.text || incoming.programEvidence?.imageUrls?.length) merged.programEvidence = incoming.programEvidence
      if (incoming.relatedUrls?.length) merged.relatedUrls = incoming.relatedUrls
      if (incoming.scheduleText) merged.scheduleText = incoming.scheduleText
      if (incoming.programFetchedAt) merged.programFetchedAt = incoming.programFetchedAt
      result.set(known.id, merged)
    } else result.set(incoming.id, incoming)
  }
  return [...result.values()]
}

export const keepRecentSacPrograms = (concerts, previous, targetTrackId, now = Date.now()) => {
  const recent = new Map(previous.filter((item) => {
    const checkedAt = Date.parse(item.programFetchedAt)
    return item.sacId && item.targetMatch?.targetTrackId === targetTrackId
      && Number.isFinite(checkedAt) && now - checkedAt >= 0 && now - checkedAt < CONCERT_CACHE_TTL_MS
  }).map((item) => [item.sacId, item]))
  return concerts.map((concert) => {
    const known = concert.sacId && recent.get(concert.sacId)
    if (!known || concert.dateFrom !== known.dateFrom || concert.dateTo !== known.dateTo) return concert
    return { ...concert, programEvidence: known.programEvidence, programExtraction: known.programExtraction,
      programFetchedAt: known.programFetchedAt, programWorkIds: known.programWorkIds, programScopes: known.programScopes,
      programStatus: known.programStatus, programVerification: known.programVerification, programCoverage: known.programCoverage,
      targetMatch: known.targetMatch }
  })
}
