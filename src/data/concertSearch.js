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
    try { const entry = JSON.parse(storage?.getItem(`classic-atlas-concert-cache-v2:${key}`) || 'null'); if (entry) memory.set(key, entry); return entry } catch { return null }
  }
  const write = (key, entry) => {
    memory.set(key, entry)
    try { storage?.setItem(`classic-atlas-concert-cache-v2:${key}`, JSON.stringify(entry)) } catch { /* 저장 차단 시 메모리 캐시 유지 */ }
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
    async matchBatch(targetTrackId, kopisIds, { refresh = false, cacheOnly = false, query, signal } = {}) {
      const data = await request('/api/concerts/match-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTrackId, kopisIds, query, refresh, cacheOnly }), signal })
      if (data.targetTrackId !== targetTrackId || !Array.isArray(data.results) || !data.target) throw new Error('대상 곡의 프로그램 확인 응답을 확인할 수 없습니다.')
      return data
    },
  }
}

export const isSameConfirmedConcert = (known, incoming) => {
  return Boolean(known.kopisId && known.kopisId === incoming.kopisId)
}

// KOPIS 기본정보·자동 매칭은 KOPIS 응답이 기준입니다. 직접 등록 정보는 보조 링크만 결합합니다.
export const mergeSearchConcerts = (incomingList, knownList) => {
  const result = new Map(knownList.map((concert) => [concert.kopisId || concert.id, concert]))
  for (const incoming of incomingList) {
    const known = knownList.find((concert) => isSameConfirmedConcert(concert, incoming))
    if (known) {
      const links = known.verifiedOn && /^https?:\/\//.test(known.sourceUrl || '') ? [known.sourceUrl] : []
      result.set(incoming.kopisId, { ...incoming, officialUrls: [...new Set([...(incoming.officialUrls || []), ...links])],
        referenceInfo: { title: known.title, sourceUrl: known.sourceUrl, verifiedOn: known.verifiedOn } })
    } else result.set(incoming.kopisId || incoming.id, incoming)
  }
  return [...result.values()]
}
