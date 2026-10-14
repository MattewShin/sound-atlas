import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createProgramOcrService, assessOcrReadings } from './programOcr.mjs'
import { combineOcrProgram, matchAnalyzedConcert } from './ocrProgramEvidence.mjs'
import { extractProgram } from './programMatching.mjs'
import { getMatchProgress } from '../src/data/concertMatchStates.js'
import { getRegisteredTargetConcerts, getSimilarTargetConcerts, getTargetConcertRelevance, isSimilarTargetConcert, prioritizeRegisteredTargetConcerts } from '../src/data/concertTargetSearch.js'
import { createKopisService } from './kopis.mjs'
import { createAppServer } from './index.mjs'
import { getOcrConfig } from './ocrConfig.mjs'
const id = 'chopin-ballade-op23-no1'
const schubert3 = 'schubert-impromptu-d899-op90-no3'
const raw = '[PROGRAM]\nF. Chopin Ballade No.1 Op.23'
const reading = (text, confidence = 96) => ({ text, confidence, extraction: extractProgram(text),
  words: text.split(/\s+/).map((text) => ({ text, confidence, x: 100, y: 100, width: 20, height: 20 })) })
const imageRecord = (text, second = text, confidence = 96) => {
  const original = reading(text, confidence), preprocessed = reading(second, confidence)
  return { sourceUrl: 'https://kopis.or.kr/upload/test.jpg', status: 'completed', original, preprocessed, ...assessOcrReadings(original, preprocessed) }
}
const concert = { kopisId: 'PF999400', title: '테스트 연주자 피아노 리사이틀', performers: '테스트 연주자', venue: '테스트 음악홀', dateFrom: '2026-10-17', dateTo: '2026-10-17', programEvidence: { text: '', imageUrls: ['a', 'b'] } }
const poster = imageRecord('테스트 연주자 2026.10.17 테스트 음악홀')

test('OCR 근거는 해당 KOPIS 상세에 연결된 공연 ID·이미지 URL·공연장과 일치해야 한다', () => {
  const ownedPoster = { ...poster, concertId: concert.kopisId, sourceUrl: 'https://kopis.or.kr/upload/poster.png' }
  const ownedProgram = { ...imageRecord(raw), concertId: concert.kopisId, sourceUrl: 'https://kopis.or.kr/upload/program.png' }
  const detail = { ...concert, kopisDetailVerified: true, programEvidence: { text: '', imageUrls: [ownedPoster.sourceUrl, ownedProgram.sourceUrl] } }
  assert.equal(matchAnalyzedConcert(combineOcrProgram(detail, [ownedPoster, ownedProgram]), id).status, 'matched')
  for (const record of [{ ...ownedProgram, concertId: 'PF999401' }, { ...ownedProgram, sourceUrl: 'https://kopis.or.kr/upload/other.png' }]) {
    const mixed = combineOcrProgram(detail, [ownedPoster, record])
    assert.equal(mixed.programOcr.context.conflict, 'source')
    assert.equal(matchAnalyzedConcert(mixed, id).status, 'needs-review')
  }
  const otherVenue = { ...imageRecord(raw + '\n공연장: 다른 음악홀'), concertId: concert.kopisId, sourceUrl: ownedProgram.sourceUrl }
  const mixed = combineOcrProgram(detail, [ownedPoster, otherVenue])
  assert.equal(mixed.programOcr.context.conflict, 'venue')
  assert.equal(matchAnalyzedConcert(mixed, id).status, 'needs-review')
})
test('OCR의 원본·전처리 문맥과 식별 단어·번호를 함께 검증하며 오인식을 교정하지 않는다', () => {
  const program = imageRecord(raw)
  assert.deepEqual(program.links.map(({ workId }) => workId), [id])
  const good = combineOcrProgram(concert, [poster, program])
  assert.equal(matchAnalyzedConcert(good, id).status, 'matched')
  assert.equal(matchAnalyzedConcert(good, id).evidenceKind, 'ocr')
  assert.equal(imageRecord(raw, raw.replace('23', '28')).reviewRequired, true)
  assert.equal(imageRecord(raw, raw, 65).reviewRequired, true)
  const blurry = reading(raw)
  blurry.words.find(({ text }) => text.includes('23')).confidence = 20
  blurry.words.push({ text: '23', confidence: 99, x: 100, y: 1000, width: 20, height: 20 })
  assert.equal(assessOcrReadings(blurry, reading(raw)).reviewRequired, true)
  const wrongNumber = combineOcrProgram(concert, [poster, imageRecord(raw.replace('23', '28'))])
  assert.equal(matchAnalyzedConcert(wrongNumber, id).status, 'needs-review')
  assert.equal(wrongNumber.programOcr.acceptedEntries, 0)
  const partial = combineOcrProgram(concert, [poster, program], { totalImages: 3 })
  assert.equal(matchAnalyzedConcert(partial, id).status, 'needs-review')
  assert.equal(matchAnalyzedConcert(partial, id).completed, false)
})
test('OCR 프로그램의 작품집 제목 다음 줄에 있는 슈베르트 개별 곡번호를 연결한다', () => {
  const text = '[PROGRAM]\nF. Schubert Two Impromptus, Op. 90\n(1797-1828) No. 3 in G flat major\nNo. 2 in E flat major'
  const program = imageRecord(text)
  assert.ok(program.links.some(({ workId }) => workId === schubert3))
  const result = matchAnalyzedConcert(combineOcrProgram(concert, [poster, program]), schubert3)
  assert.equal(result.status, 'matched')
  assert.equal(result.evidenceKind, 'ocr')
  const original = reading(text), preprocessed = reading(text)
  original.words.find(({ text: word }) => word === '3').confidence = 25
  preprocessed.words.find(({ text: word }) => word === '3').confidence = 70
  assert.ok(assessOcrReadings(original, preprocessed).links.some(({ workId }) => workId === schubert3), '일치하는 조성의 고신뢰도 판독으로 한 자리 곡번호를 보완')
  assert.ok(!imageRecord(text.replace('G flat major', 'C major')).links.some(({ workId }) => workId === schubert3))
})
test('사계 OCR은 영문 월명까지 판독해야 월별 작품으로 확정한다', () => {
  const text = '[PROGRAM]\nP. Tchaikovsky The Seasons October: Autumn Song, Op.37a'
  assert.deepEqual(imageRecord(text).links.map(({ workId }) => workId), ['tchaikovsky-seasons-op37a-no10'])
  const blurry = reading(text)
  blurry.words.find(({ text: word }) => word.includes('October')).confidence = 30
  assert.deepEqual(assessOcrReadings(blurry, reading(text)).links, [])
  assert.equal(imageRecord(text, text.replace('October', 'November')).reviewRequired, true)
})
test('소개·경력, 날짜가 다른 프로그램, 시리즈 불일치는 OCR 일치로 승격하지 않는다', () => {
  const biography = imageRecord('PROFILE\n대학교 교수 수상 경력\nF. Chopin Ballade No.1 Op.23')
  assert.deepEqual(biography.links, [])
  assert.deepEqual(imageRecord('PROFILE\nPROGRAM\nF. Chopin Ballade No.1 Op.23').links, [])
  assert.notEqual(matchAnalyzedConcert(combineOcrProgram(concert, [poster, biography]), id).status, 'matched')
  const otherDate = imageRecord(raw + '\n2026.10.18')
  assert.equal(matchAnalyzedConcert(combineOcrProgram(concert, [poster, otherDate]), id).status, 'needs-review')
  const seriesConcert = { ...concert, title: '테스트 연주자 피아노 스펙트럼 Ⅲ' }
  const otherSeries = imageRecord(raw + '\nPiano Spectrum 2')
  const mixed = combineOcrProgram(seriesConcert, [poster, otherSeries])
  assert.equal(mixed.programOcr.context.conflict, 'series')
  assert.equal(matchAnalyzedConcert(mixed, id).status, 'needs-review')
})

const localDirectory = async () => {
  await import('node:fs/promises').then((fs) => fs.mkdir('.cache', { recursive: true }))
  return mkdtemp(resolve('.cache') + sep + 'ocr-test-')
}
const cleanup = async (directory) => { assert.ok(directory.startsWith(resolve('.cache') + sep)); await rm(directory, { recursive: true, force: true }) }
const fakeData = (text) => ({ text, confidence: 96, tsv: 'level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext\n' + text.split(/\s+/).map((word) => `5\t1\t1\t1\t1\t1\t100\t100\t20\t20\t96\t${word}`).join('\n') })
test('이미지 URL·내용 해시 캐시를 재사용하고 서버 재시작·내용 변경을 구분한다', async () => {
  const directory = await localDirectory()
  const firstBuffer = await sharp({ create: { width: 500, height: 400, channels: 3, background: 'white' } }).png().toBuffer()
  const otherBuffer = await sharp({ create: { width: 500, height: 400, channels: 3, background: 'black' } }).png().toBuffer()
  let buffer = firstBuffer, downloads = 0, recognitions = 0
  const options = { env: { CONCERT_OCR_CACHE_DIR: directory }, fetchImpl: async () => { downloads += 1; return new Response(buffer) },
    recognizeImpl: async () => { recognitions += 1; return fakeData(raw) } }
  const url = 'https://kopis.or.kr/upload/test.png'
  try {
    const engine = createProgramOcrService(options)
    const first = await engine.processImage('PF999400', url)
    assert.equal(first.status, 'completed')
    assert.equal(recognitions, 2)
    assert.equal((await engine.processImage('PF999400', url)).fromCache, true)
    assert.equal(downloads, 1)
    const restarted = createProgramOcrService(options)
    assert.equal((await restarted.processImage('PF999400', url)).fromCache, true)
    await restarted.processImage('PF999400', url, { refresh: true })
    assert.equal(downloads, 2)
    assert.equal(recognitions, 2, '새 다운로드라도 내용 해시가 같으면 OCR 재사용')
    buffer = otherBuffer
    await restarted.processImage('PF999400', url, { refresh: true })
    assert.equal(recognitions, 4)
    const blocked = await restarted.processImage('PF999400', 'http://127.0.0.1/private')
    assert.equal(blocked.status, 'failed')
    assert.equal(blocked.failureCode, 'OCR_SOURCE_BLOCKED')
  } finally { await cleanup(directory) }
})
test('파일·픽셀·시간 상한, 중단, 한 이미지의 실패는 불일치로 바뀌지 않는다', async () => {
  const directory = await localDirectory()
  const buffer = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'white' } }).png().toBuffer()
  try {
    const engine = createProgramOcrService({ env: { CONCERT_OCR_CACHE_DIR: directory, OCR_MAX_IMAGE_PIXELS: '100000' }, fetchImpl: async () => new Response(buffer), recognizeImpl: async () => fakeData(raw) })
    const tooLarge = await engine.processImage('PF999400', 'https://kopis.or.kr/upload/large.png')
    assert.equal(tooLarge.status, 'failed')
    const timed = createProgramOcrService({ env: { CONCERT_OCR_CACHE_DIR: directory, OCR_TIMEOUT_MS: '100' }, fetchImpl: async () => new Response(buffer), recognizeImpl: async () => new Promise(() => {}) })
    const timeout = await timed.processImage('PF999400', 'https://kopis.or.kr/upload/slow.png')
    assert.equal(timeout.failureCode, 'OCR_TIMEOUT')
    const controller = new AbortController()
    const request = timed.processImage('PF999400', 'https://kopis.or.kr/upload/abort.png', { signal: controller.signal })
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(request, (error) => error.code === 'ABORTED')
    const failed = combineOcrProgram(concert, [poster, timeout])
    assert.equal(matchAnalyzedConcert(failed, id).status, 'failed')
  } finally { await cleanup(directory) }
})
test('캐시 동시 요청은 OCR을 중복 실행하지 않는다', async () => {
  const directory = await localDirectory()
  let calls = 0
  const buffer = await sharp({ create: { width: 500, height: 400, channels: 3, background: 'white' } }).png().toBuffer()
  try {
    const engine = createProgramOcrService({ env: { CONCERT_OCR_CACHE_DIR: directory }, fetchImpl: async () => new Response(buffer), recognizeImpl: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return fakeData(raw) } })
    const url = 'https://kopis.or.kr/upload/shared.png'
    await Promise.all([engine.processImage('PF999400', url), engine.processImage('PF999400', url)])
    assert.equal(calls, 2)
  } finally { await cleanup(directory) }
})
test('대표 상태의 합이 전체 후보 수와 같고 조회 시도·완료 수를 따로 계산한다', () => {
  const candidates = Array.from({ length: 245 }, () => ({ targetMatch: { status: 'pending', attempted: false, completed: false } }))
  candidates.push(...Array.from({ length: 15 }, () => ({ targetMatch: { status: 'needs-review', attempted: true, completed: false } })))
  for (const status of ['matched', 'matched', 'no-material', 'failed', 'not-found']) candidates.push({ targetMatch: { status, attempted: true, completed: status !== 'failed' } })
  const progress = getMatchProgress(candidates)
  assert.equal(progress.total, 265)
  assert.equal(progress.attempted, 20)
  assert.equal(progress.completed, 4)
  assert.equal(progress.pending + progress.processing + progress.matched + progress['needs-review'] + progress['no-material'] + progress.failed + progress['not-found'], 265)
})
test('공식 확인 공연도 곡·지역·기간이 검색 조건 밖이면 등록 결과를 만들지 않는다', () => {
  const query = { region: '서울', from: '2026-12-01', to: '2026-12-31', targetTrackId: id }, now = Date.parse('2026-10-12T00:00:00Z')
  assert.equal(getRegisteredTargetConcerts(query, now).length, 0)
  assert.equal(getRegisteredTargetConcerts({ ...query, targetTrackId: 'beethoven-piano-concerto-op73-no5-m2' }, now).length, 0)
  assert.equal(getRegisteredTargetConcerts({ ...query, targetTrackId: 'beethoven-piano-concerto-op73-no5-m2', region: '부산' }, now).length, 0)
  assert.equal(getRegisteredTargetConcerts({ ...query, targetTrackId: 'beethoven-piano-concerto-op73-no5-m2', to: '2026-12-23' }, now).length, 0)
})
test('공식 프로그램으로 확인한 PF302595는 슈베르트 즉흥곡 3번 검색에서 먼저 검증한다', () => {
  const query = { region: '서울', from: '2026-10-14', to: '2026-11-13', targetTrackId: schubert3 }
  const now = Date.parse('2026-10-14T00:00:00+09:00')
  assert.deepEqual(getRegisteredTargetConcerts(query, now).map(({ kopisId }) => kopisId), ['PF302595'])
  const candidates = [{ kopisId: 'PF303000' }, { kopisId: 'PF302595' }, { kopisId: 'PF302000' }]
  assert.deepEqual(prioritizeRegisteredTargetConcerts(candidates, query, now).map(({ kopisId }) => kopisId), ['PF302595', 'PF303000', 'PF302000'])
})
test('PF302451을 먼저 확인하고 비슷한 공연은 분석된 같은 작곡가·작품 형식으로 제한한다', () => {
  const targetTrackId = 'beethoven-sonata-op57-no23-m1'
  const query = { region: '서울', from: '2026-10-14', to: '2026-11-13', targetTrackId }
  const now = Date.parse('2026-10-14T00:00:00+09:00')
  assert.deepEqual(getRegisteredTargetConcerts(query, now).map(({ kopisId }) => kopisId), ['PF302451'])
  const candidates = [
    { kopisId: 'PF-VIOLIN', title: '김모씨 바이올린 독주회' },
    { kopisId: 'PF-PIANO', title: '새로운 피아노 리사이틀' },
    { kopisId: 'PF302451', title: '음악공방 피오레움, 윤피아노 클래스 초청 연주회: 장준호' },
    { kopisId: 'PF-FLUTE', title: '박모씨 플루트 리사이틀' },
    { kopisId: 'PF-UNKNOWN', title: '가을 실내악 음악회' },
  ]
  assert.deepEqual(prioritizeRegisteredTargetConcerts(candidates, query, now).map(({ kopisId }) => kopisId),
    ['PF302451', 'PF-PIANO', 'PF-UNKNOWN', 'PF-VIOLIN', 'PF-FLUTE'])
  assert.ok(getTargetConcertRelevance(candidates[1], query).score > getTargetConcertRelevance(candidates[0], query).score)
  const relatedSonata = { kopisId: 'PF-RELATED', title: '프로그램 확인 공연', kopisDetailVerified: true,
    targetMatch: { status: 'not-found' }, programExtraction: { entries: [{ composer: '베토벤', type: 'sonata', signature: 'Piano Sonata No. 8 Op. 13' }] } }
  const otherForm = { kopisId: 'PF-CONCERTO', title: '베토벤 프로그램', kopisDetailVerified: true,
    targetMatch: { status: 'not-found' }, programExtraction: { entries: [{ composer: '베토벤', type: 'piano-concerto', signature: 'Piano Concerto No. 5 Op. 73' }] } }
  assert.equal(isSimilarTargetConcert(relatedSonata, query), true)
  assert.equal(isSimilarTargetConcert(otherForm, query), false)
  assert.equal(isSimilarTargetConcert(candidates[1], query), false, '공연명만 피아노인 미확인 후보는 비슷한 공연이 아님')
  assert.deepEqual(getSimilarTargetConcerts([...candidates, otherForm, relatedSonata], query, now).map(({ kopisId }) => kopisId), ['PF-RELATED'])
})
test('서버 검색 단계의 OCR 연결·다른 곡 비교·재시작 캐시 조회는 동일 원문을 재사용한다', async () => {
  const directory = await localDirectory()
  const buffer = await sharp({ create: { width: 500, height: 400, channels: 3, background: 'white' } }).png().toBuffer()
  let downloads = 0, recognitions = 0, apiCalls = 0
  const env = { CONCERT_OCR_CACHE_DIR: directory, KOPIS_SERVICE_KEY: 'test-key' }
  const engine = createProgramOcrService({ env, fetchImpl: async () => { downloads += 1; return new Response(buffer) },
    recognizeImpl: async () => { recognitions += 1; return fakeData(recognitions <= 2 ? raw : '테스트 연주자 2026.10.17 테스트 음악홀') } })
  const response = `<dbs><db><mt20id>PF999400</mt20id><prfnm>테스트 연주자 피아노 리사이틀</prfnm><fcltynm>테스트 음악홀</fcltynm><prfpdfrom>2026.10.17</prfpdfrom><prfpdto>2026.10.17</prfpdto><area>서울특별시</area><genrenm>서양음악(클래식)</genrenm><styurls><styurl>https://kopis.or.kr/upload/program.png</styurl><styurl>https://kopis.or.kr/upload/poster.png</styurl></styurls></db></dbs>`
  const service = createKopisService({ env, ocrService: engine, delay: async () => {}, fetchImpl: async () => { apiCalls += 1; return { ok: true, text: async () => response } } })
  try {
    const first = await service.matchBatch({ targetTrackId: id, kopisIds: ['PF999400'] })
    assert.equal(first.results[0].concert.targetMatch.status, 'matched')
    assert.equal(first.results[0].concert.programVerification, 'ocr')
    assert.equal(downloads, 2)
    assert.equal(recognitions, 3)
    const other = await service.matchBatch({ targetTrackId: 'beethoven-piano-concerto-op73-no5-m2', kopisIds: ['PF999400'] })
    assert.notEqual(other.results[0].concert.targetMatch.status, 'matched')
    assert.equal(downloads, 2)
    assert.equal(recognitions, 3)
    assert.equal(apiCalls, 1)
    const restarted = createKopisService({ env, fetchImpl: async () => { throw new Error('캐시 확인은 API를 호출하면 안 됩니다') } })
    const cached = await restarted.cachedMatches({ targetTrackId: id, kopisIds: ['PF999400'] })
    assert.equal(cached.results[0].concert.targetMatch.status, 'matched')
    assert.equal(cached.results[0].fromCache, true)
  } finally { await cleanup(directory) }
})
test('중단한 HTTP 배치 요청은 서버의 AbortSignal로 전달된다', async () => {
  let started, observed
  const begin = new Promise((resolve) => { started = resolve })
  const stopped = new Promise((resolve) => { observed = resolve })
  const service = { matchBatch: ({ signal }) => new Promise((_, reject) => {
    started()
    signal.addEventListener('abort', () => { observed(); reject(new Error('중단')) }, { once: true })
  }) }
  const server = createAppServer({ service })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const controller = new AbortController()
    const request = fetch(`http://127.0.0.1:${server.address().port}/api/concerts/match-batch`, { method: 'POST', body: JSON.stringify({ targetTrackId: id, kopisIds: ['PF999400'], query: { region: '서울', from: '2026-10-14', to: '2026-10-31' } }), signal: controller.signal })
    await begin; controller.abort()
    await assert.rejects(request)
    await stopped
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
test('첫 자동 처리 한도는 설정 가능하며 10개를 초과할 수 없다', () => {
  assert.equal(getOcrConfig({}).initialCheckLimit, 10)
  assert.equal(getOcrConfig({ CONCERT_INITIAL_CHECK_LIMIT: '4' }).initialCheckLimit, 4)
  assert.throws(() => getOcrConfig({ CONCERT_INITIAL_CHECK_LIMIT: '11' }))
})
