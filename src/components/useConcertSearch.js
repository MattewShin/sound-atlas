import { useEffect, useRef, useState } from 'react'
import { createConcertSearchClient, keepRecentSacPrograms, mergeSearchConcerts } from '../data/concertSearch.js'
import { getTrackTarget } from '../data/workCatalog.js'
import { concertFitsQuery, getRegisteredTargetConcerts } from '../data/concertTargetSearch.js'
import { getMatchStatus, INITIAL_CONCERT_CHECK_LIMIT } from '../data/concertMatchStates.js'

export default function useConcertSearch() {
  const [client] = useState(() => {
    let storage
    try { storage = window.localStorage } catch { /* 메모리 캐시 */ }
    return createConcertSearchClient({ storage })
  })
  const [connection, setConnection] = useState({ status: 'checking' })
  const [search, setSearch] = useState({ status: 'idle', data: null, error: null })
  const [programRequests, setProgramRequests] = useState({})
  const requestId = useRef(0), snapshot = useRef(null), controller = useRef(null), busy = useRef(false)
  const settings = useRef({ initialCheckLimit: INITIAL_CONCERT_CHECK_LIMIT, moreCheckLimit: 10, programBatchSize: 2 })
  const publish = (data, status = 'success') => { snapshot.current = data; setSearch({ status, error: null, data }) }
  const releaseProcessing = (data) => data && ({ ...data, concerts: data.concerts.map((concert) => getMatchStatus(concert.targetMatch) === 'processing'
    ? { ...concert, targetMatch: { ...concert.targetMatch, status: 'pending', completed: false, reason: '처리를 중단했어요. 다시 이어서 확인할 수 있어요.' } } : concert) })
  const stop = () => {
    requestId.current += 1; controller.current?.abort(); controller.current = null; busy.current = false
    publish(releaseProcessing(snapshot.current), 'stopped')
    setProgramRequests({})
  }
  const clear = () => { stop(); publish(null, 'idle') }
  useEffect(() => {
    let mounted = true
    client.status().then((config) => {
      if (!mounted) return
      settings.current = { initialCheckLimit: Math.min(10, Math.max(1, config.initialCheckLimit || 10)), moreCheckLimit: Math.min(10, Math.max(1, config.moreCheckLimit || 10)), programBatchSize: Math.min(5, Math.max(1, config.programBatchSize || 2)) }
      setConnection({ status: config.configured ? 'ready' : config.sacAvailable ? 'partial' : 'needs-setup', ...config })
    }).catch(() => { if (mounted) setConnection({ status: 'needs-setup' }) })
    return () => { mounted = false; requestId.current += 1; controller.current?.abort() }
  }, [client])
  const begin = () => { controller.current?.abort(); const id = ++requestId.current; const current = new AbortController(); controller.current = current; busy.current = true; return { id, current } }
  const fail = (error, id) => {
    if (id !== requestId.current || error.code === 'ABORTED') return
    if (['KOPIS_NOT_CONFIGURED', 'KOPIS_AUTH_ERROR', 'CONCERT_SERVER_UNAVAILABLE'].includes(error.code)) setConnection({ status: 'needs-setup' })
    const data = releaseProcessing(snapshot.current)
    snapshot.current = data
    setSearch({ status: 'error', data, error: error.message })
  }
  const applyBatch = (data, response) => {
    const byId = new Map(response.results.map((item) => [item.kopisId || item.sacId, item]))
    return { ...data, target: response.target, checkedAt: response.checkedAt, concerts: data.concerts.map((concert) => {
      const item = byId.get(concert.kopisId || concert.sacId)
      if (!item) return concert
      if (item.concert?.dateFrom && !concertFitsQuery(item.concert, data.query)) {
        if (item.fromCache) return { ...concert, needsFreshProgram: true, targetMatch: { status: 'pending', attempted: false, completed: false, reason: '목록과 저장된 상세 일정이 달라 다시 확인할 예정이에요.' } }
        return { ...concert, needsFreshProgram: false, targetMatch: { status: 'needs-review', attempted: true, completed: true, reason: '목록과 상세 일정 또는 지역이 달라 공연 정보를 다시 확인해야 해요.' } }
      }
      return { ...concert, ...item.concert, needsFreshProgram: false, targetMatch: item.concert?.targetMatch || item.targetMatch }
    }) }
  }
  const processGroup = async (limit, id, current, refresh = false) => {
    const processed = new Set()
    let remaining = limit
    while (remaining > 0 && id === requestId.current && !current.signal.aborted) {
      const data = snapshot.current
      const candidates = data.concerts.filter((concert) => concert.kopisId && !processed.has(concert.kopisId)
        && (getMatchStatus(concert.targetMatch) === 'pending' || (getMatchStatus(concert.targetMatch) === 'failed' && concert.targetMatch.retryable)))
        .sort((a, b) => Number(getMatchStatus(a.targetMatch) === 'failed') - Number(getMatchStatus(b.targetMatch) === 'failed'))
      const batch = candidates.slice(0, Math.min(remaining, settings.current.programBatchSize))
      if (!batch.length) break
      const ids = new Set(batch.map(({ kopisId }) => kopisId))
      publish({ ...data, concerts: data.concerts.map((concert) => ids.has(concert.kopisId) ? { ...concert, targetMatch: { ...concert.targetMatch, status: 'processing', attempted: true, completed: false, reason: '프로그램 자료를 확인하고 있어요.' } } : concert) }, 'checking')
      const response = await client.matchBatch(data.targetTrackId, [...ids], { refresh: refresh || batch.some((concert) => concert.needsFreshProgram), signal: current.signal })
      if (id !== requestId.current || current.signal.aborted) return
      for (const value of ids) processed.add(value)
      remaining -= batch.length
      publish({ ...applyBatch(snapshot.current, response), targetValidated: true }, 'checking')
    }
    if (id === requestId.current) publish(snapshot.current)
  }
  const checkNext = async () => {
    if (busy.current || !snapshot.current?.targetTrackId) return
    const { id, current } = begin()
    try { await processGroup(settings.current.moreCheckLimit, id, current) } catch (error) { fail(error, id) }
    finally { if (id === requestId.current) busy.current = false }
  }
  const runSearch = async (query, refresh = false) => {
    if (busy.current) return
    const target = query?.targetTrackId && getTrackTarget(query.targetTrackId)
    if (!target) {
      setSearch({ status: 'error', data: null, error: '먼저 등록된 곡을 선택해주세요.' })
      return
    }
    const previousSac = !refresh && snapshot.current?.targetTrackId === target.trackId ? snapshot.current.concerts : []
    const { id, current } = begin()
    setSearch((previous) => ({ ...previous, status: 'loading', error: null }))
    try {
      const registered = getRegisteredTargetConcerts(query)
      if (registered.length) publish({ query, concerts: registered, target, targetTrackId: target.trackId, apiTotal: null, localOnly: true }, 'loading')
      const data = await client.search(query, { refresh, signal: current.signal })
      if (id !== requestId.current || current.signal.aborted) return
      const unique = [...new Map(data.concerts.map((concert) => [concert.kopisId || concert.id, concert])).values()]
      const candidates = keepRecentSacPrograms(mergeSearchConcerts(unique.filter((concert) => concertFitsQuery(concert, query)), registered), previousSac, target.trackId)
      publish({ ...data, apiTotal: unique.length, targetTrackId: target.trackId, target, query: { ...data.query, targetTrackId: target.trackId },
        concerts: candidates.map((concert) => ({ ...concert, ...(!concert.targetMatch ? { targetMatch: concert.sacId
          ? { status: 'needs-review', targetTrackId: target.trackId, attempted: false, completed: false, reason: '예술의전당 일정에서 확인했어요. 선택한 작품의 연주 여부는 공식 프로그램에서 확인해주세요.' }
          : { status: 'pending', targetTrackId: target.trackId, attempted: false, completed: false, reason: '프로그램을 아직 확인하지 않았어요.' } } : {}) })),
      }, 'checking')
      const ids = candidates.filter(({ kopisId }) => kopisId).map(({ kopisId }) => kopisId)
      if (!refresh) for (let offset = 0; offset < ids.length; offset += 100) {
        const cached = await client.matchBatch(target.trackId, ids.slice(offset, offset + 100), { cacheOnly: true, signal: current.signal })
        if (id !== requestId.current || current.signal.aborted) return
        publish(applyBatch(snapshot.current, cached), 'checking')
      }
      if (!ids.length) {
        await client.matchBatch(target.trackId, [], { cacheOnly: true, signal: current.signal })
        if (id !== requestId.current) return
      }
      await processGroup(settings.current.initialCheckLimit, id, current, refresh)
    } catch (error) { fail(error, id) }
    finally { if (id === requestId.current) busy.current = false }
  }
  const loadProgram = async (concert, refresh = false) => {
    if (busy.current || !snapshot.current?.targetTrackId) return
    const { id, current } = begin()
    setProgramRequests((previous) => ({ ...previous, [concert.kopisId || concert.sacId]: { status: 'loading' } }))
    try {
      const response = await client.matchBatch(snapshot.current.targetTrackId, concert.kopisId ? [concert.kopisId] : [], { sacIds: concert.sacId ? [concert.sacId] : [], refresh, signal: current.signal })
      if (id === requestId.current) publish(applyBatch(snapshot.current, response))
      if (id === requestId.current) setProgramRequests((previous) => ({ ...previous, [concert.kopisId || concert.sacId]: { status: 'success' } }))
    } catch (error) { if (id === requestId.current) setProgramRequests((previous) => ({ ...previous, [concert.kopisId || concert.sacId]: { status: 'error', error: error.message } })) }
    finally { if (id === requestId.current) busy.current = false }
  }
  return { connection, search, runSearch, programRequests, loadProgram, checkNext, clear, stop }
}
