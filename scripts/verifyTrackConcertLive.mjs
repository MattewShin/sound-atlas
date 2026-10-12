// 사용자 요청 시에만 실행하는 실데이터 검증. 키·키가 담긴 URL은 기록하지 않습니다.
import { writeFile, mkdir } from 'node:fs/promises'
import { createKopisService } from '../server/kopis.mjs'
import { isUpcomingConcert } from '../src/data/concertRecommendations.js'

try {
  let upstreamCalls = 0
  const service = createKopisService({ fetchImpl: (...args) => { upstreamCalls += 1; return fetch(...args) } })
  if (!service.config().configured) { console.log(JSON.stringify({ configured: false, message: '공연 검색 연동 설정 필요' })); process.exitCode = 1 }
  else {
    const targetTrackId = 'chopin-ballade-op23-no1'
    const query = { region: '서울', from: '2026-10-12', to: '2026-10-31', targetTrackId }
    const list = await service.search(query)
    const candidates = list.concerts.filter((item) => isUpcomingConcert(item))
    const samples = []
    for (let offset = 0; offset < Math.min(10, candidates.length); offset += 5) {
      const batch = await service.matchBatch({ targetTrackId, kopisIds: candidates.slice(offset, offset + 5).map(({ kopisId }) => kopisId) })
      samples.push(...batch.results)
      console.log(JSON.stringify({ stage: 'batch', targetTrackId: batch.targetTrackId, checked: samples.length, remaining: candidates.length - samples.length,
        states: batch.results.map((item) => ({ id: item.kopisId, title: item.concert?.title, state: item.concert?.targetMatch.status || item.targetMatch.status })) }))
    }
    const review = await service.matchBatch({ targetTrackId, kopisIds: ['PF302595', 'PF300769', 'PF302629', 'PF302837'] })
    const beforeCache = upstreamCalls
    const anotherTarget = await service.matchBatch({ targetTrackId: 'rachmaninoff-prelude-op3-no2', kopisIds: ['PF302595', 'PF300769'] })
    const cacheRequests = upstreamCalls - beforeCache
    await mkdir('data/kopis-track-audit.local', { recursive: true })
    const daniel = review.results.find(({ kopisId }) => kopisId === 'PF302595')
    const images = daniel.concert?.programEvidence.imageUrls || []
    for (const [index, url] of images.entries()) {
      const response = await fetch(url)
      if (!response.ok) throw new Error('image-download-failed')
      await writeFile(`data/kopis-track-audit.local/PF302595-${index + 1}.jpg`, Buffer.from(await response.arrayBuffer()))
    }
    const report = { verifiedAt: new Date().toISOString(), query, total: list.concerts.length, upcoming: candidates.length, samples, review: review.results, anotherTarget: anotherTarget.results, cacheRequests }
    await writeFile('data/kopis-track-validation.local.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ stage: 'summary', configured: true, query, total: list.concerts.length, upcoming: candidates.length, cacheRequests,
      review: review.results.map((item) => ({ id: item.kopisId, title: item.concert?.title, date: item.concert?.dateFrom, state: item.concert?.targetMatch.status || item.targetMatch.status,
        textLength: item.concert?.programEvidence.text.length, imageCount: item.concert?.programEvidence.imageUrls.length, evidence: item.concert?.targetMatch.evidence })),
      alternateTarget: anotherTarget.results.map((item) => ({ id: item.kopisId, state: item.concert?.targetMatch.status || item.targetMatch.status, fromCache: item.fromCache })), downloadedImages: images.length }))
  }
} catch (error) {
  console.log(JSON.stringify({ success: false, code: error.code || 'LIVE_VALIDATION_FAILED', message: '실데이터 검증을 완료하지 못했습니다. 키나 요청 URL은 출력하지 않습니다.' }))
  process.exitCode = 1
}
