import { ConcertApiError } from './kopis.mjs'
export const createConcertApiHandler = (service) => async (req, res, next) => {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return next?.()
  const respond = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)) }
  try {
    if (req.method === 'POST' && url.pathname === '/api/concerts/match-batch') {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (Buffer.byteLength(body) > 8192) return respond(413, { code: 'BODY_TOO_LARGE', message: '확인 요청이 너무 큽니다.' })
      }
      let data
      try { data = JSON.parse(body) } catch { return respond(400, { code: 'INVALID_BATCH', message: '올바른 확인 요청을 보내주세요.' }) }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return respond(400, { code: 'INVALID_BATCH', message: '올바른 확인 요청을 보내주세요.' })
      if (!data.query || typeof data.query !== 'object' || Array.isArray(data.query)) return respond(400, { code: 'INVALID_QUERY', message: '선택한 지역과 기간을 함께 보내주세요.' })
      if (data.cacheOnly === true) return respond(200, await service.cachedMatches({ targetTrackId: data.targetTrackId, kopisIds: data.kopisIds, query: data.query }))
      const controller = new AbortController()
      const abort = () => { if (!res.writableEnded) controller.abort() }
      req.once('aborted', abort); res.once('close', abort)
      try {
        const result = await service.matchBatch({ targetTrackId: data.targetTrackId, kopisIds: data.kopisIds, query: data.query, refresh: data.refresh === true, signal: controller.signal })
        if (!controller.signal.aborted) return respond(200, result)
      } finally { req.removeListener('aborted', abort); res.removeListener('close', abort) }
      return
    }
    if (req.method !== 'GET') return respond(405, { code: 'METHOD_NOT_ALLOWED', message: '허용되지 않은 요청입니다.' })
    if (url.pathname === '/api/concerts/status') return respond(200, service.config())
    const refresh = url.searchParams.get('refresh') === '1'
    if (url.pathname === '/api/concerts') return respond(200, await service.search({
      region: url.searchParams.get('region'), from: url.searchParams.get('from'), to: url.searchParams.get('to'),
      targetTrackId: url.searchParams.get('targetTrackId') || undefined,
    }, refresh))
    const match = url.pathname.match(/^\/api\/concerts\/(PF\d+)\/program$/)
    if (match) return respond(200, await service.program(match[1], refresh))
    return respond(404, { code: 'NOT_FOUND', message: '요청 경로를 찾지 못했습니다.' })
  } catch (error) {
    if (res.destroyed || res.writableEnded) return
    return respond(error instanceof ConcertApiError ? error.status : 500, {
      code: error instanceof ConcertApiError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof ConcertApiError ? error.message : '공연 검색 요청을 처리하지 못했습니다.',
    })
  }
}
