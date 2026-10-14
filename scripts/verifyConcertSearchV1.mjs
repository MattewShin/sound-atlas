import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, cp, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createKopisService } from '../server/kopis.mjs'
import { createProgramOcrService } from '../server/programOcr.mjs'
import { createAppServer } from '../server/index.mjs'
import { createConcertSearchClient } from '../src/data/concertSearch.js'

// 검증용 지정 ID는 앱의 후보·순서·매칭 처리에서는 사용하지 않습니다.
const targetTrackId = 'chopin-ballade-op23-no1', validationId = 'PF302595'
const query = { targetTrackId, region: '서울', from: process.argv[2] || '2026-10-14', to: process.argv[3] || '2026-10-31' }
let service, server, restarted
try {
  await mkdir('.cache', { recursive: true })
  const directory = await mkdtemp(resolve('.cache/kopis-v1-live-'))
  // 언어 모델만 재사용합니다. 공연·이미지 분석 결과는 새 디렉터리에서 다시 생성합니다.
  try { await access('.cache/ocr/languages'); await cp('.cache/ocr/languages', join(directory, 'languages'), { recursive: true }) } catch { /* 최초 모델 다운로드 */ }
  const env = { ...process.env, CONCERT_OCR_CACHE_DIR: directory }
  let imageDownloads = 0, apiCalls = 0
  const listRequests = []
  const ocr = createProgramOcrService({ env, fetchImpl: (...args) => { imageDownloads++; return fetch(...args) } })
  service = createKopisService({ env, ocrService: ocr, fetchImpl: (url, options) => {
    apiCalls++
    if (url.pathname.endsWith('/pblprfr')) listRequests.push(Object.fromEntries(['stdate', 'eddate', 'signgucode', 'shcate', 'prfstate', 'cpage'].map((key) => [key, url.searchParams.get(key)])))
    return fetch(url, options)
  } })
  assert.equal(service.config().configured, true, 'KOPIS key missing')
  server = createAppServer({ service })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const client = createConcertSearchClient({ fetchImpl: (url, options) => fetch(base + url, options) })
  const list = await client.search(query, { refresh: true })
  const ids = list.concerts.map(({ kopisId }) => kopisId)
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(ids.includes(validationId), 'Validation ID not found in the actual filtered KOPIS list')
  const venues = ['예술의전당', '롯데콘서트홀'].map((name) => ({ name, candidates: list.concerts.filter(({ venue }) => venue.includes(name)).length }))
  const venueDetails = []
  for (const { name } of venues) {
    const candidate = list.concerts.find(({ venue }) => venue.includes(name))
    if (!candidate) continue
    const detail = await service.program(candidate.kopisId, true)
    venueDetails.push({ venue: name, kopisId: detail.concert.kopisId, title: detail.concert.title, dateFrom: detail.concert.dateFrom, dateTo: detail.concert.dateTo, textCharacters: detail.concert.programEvidence.text.length, images: detail.concert.programEvidence.imageUrls.length })
  }
  console.log(JSON.stringify({ stage: 'fresh-ocr-started', candidateCount: ids.length, venues, validationIdIncluded: true }))
  const first = await client.matchBatch(targetTrackId, [validationId], { query, refresh: true })
  const concert = first.results[0]?.concert
  assert.ok(concert)
  const beforeReuse = { apiCalls, imageDownloads }
  const reused = await service.cachedMatches({ targetTrackId, kopisIds: [validationId], query })
  const other = await service.matchBatch({ targetTrackId: 'rachmaninoff-prelude-op3-no2', kopisIds: [validationId], query })
  restarted = createKopisService({ env })
  const disk = await restarted.cachedMatches({ targetTrackId, kopisIds: [validationId], query })
  const summary = {
    verifiedAt: new Date().toISOString(), query, candidateCount: ids.length, venues, venueDetails, listRequests,
    fresh: { kopisId: concert.kopisId, title: concert.title, status: concert.targetMatch.status, evidenceKind: concert.targetMatch.evidenceKind,
      evidence: concert.targetMatch.evidence?.slice(0, 320), context: concert.programOcr?.context, images: concert.programOcr?.records.map(({ status, role, fromCache, elapsedMs, failureCode }) => ({ status, role, fromCache, elapsedMs, failureCode })),
      sourceUrl: concert.sourceUrl, detailVerified: concert.kopisDetailVerified, apiCalls: beforeReuse.apiCalls, imageDownloads: beforeReuse.imageDownloads },
    cache: { sameTarget: reused.results[0]?.concert.targetMatch.status, otherTarget: other.results[0]?.concert?.targetMatch.status,
      restart: disk.results[0]?.concert.targetMatch.status, extraApiCalls: apiCalls - beforeReuse.apiCalls, extraImageDownloads: imageDownloads - beforeReuse.imageDownloads },
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
  assert.equal(concert.targetMatch.status, 'matched')
  assert.equal(concert.targetMatch.evidenceKind, 'ocr')
  assert.equal(disk.results[0]?.concert.targetMatch.status, 'matched')
  assert.notEqual(other.results[0]?.concert?.targetMatch.status, 'matched')
} catch (error) { console.log(JSON.stringify({ success: false, code: error.code || 'LIVE_VALIDATION_FAILED' })); process.exitCode = 1 }
finally {
  if (server) await new Promise((done) => server.close(done))
  await service?.close(); await restarted?.close()
}
