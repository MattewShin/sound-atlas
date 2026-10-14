import test from 'node:test'
import assert from 'node:assert/strict'
import { createKopisService } from './kopis.mjs'
import { matchConcertToTrack } from './programMatching.mjs'
import { getMatchProgress, matchLabels } from '../src/data/concertMatchStates.js'

const targetTrackId = 'chopin-ballade-op23-no1'
const query = { region: '서울', from: '2026-12-01', to: '2026-12-31' }
const row = (id, { region = '서울특별시', from = '2026.12.24', state = '공연예정', genre = '서양음악(클래식)', text = '[PROGRAM]\nChopin Ballade No.1 Op.23', images = false } = {}) => `<db><mt20id>${id}</mt20id><prfnm>일반 KOPIS 공연</prfnm><prfpdfrom>${from}</prfpdfrom><prfpdto>${from}</prfpdto><fcltynm>일반 공연장</fcltynm><area>${region}</area><genrenm>${genre}</genrenm><prfstate>${state}</prfstate><sty><![CDATA[${text}]]></sty>${images ? '<styurls><styurl>https://kopis.or.kr/upload/test.png</styurl></styurls>' : ''}</db>`
const response = (content) => ({ ok: true, text: async () => `<dbs>${content}</dbs>` })
const fakeOcr = (counter) => ({ config: { cacheDirectory: '.cache/v1-test-unused', cacheTtlMs: 21600000, maxImages: 8 }, processImage: async () => { counter.calls++; throw new Error('Unexpected OCR') }, close: async () => {} })

test('예정·진행 상태를 실제 KOPIS 요청에 적용하고 ID·지역·기간·장르·종료 상태를 필터링한다', async () => {
  const requests = []
  const service = createKopisService({ persistAnalyses: false, env: { KOPIS_SERVICE_KEY: 'fixture-key' }, delay: async () => {}, fetchImpl: async (url) => {
    requests.push(url)
    return response(row('PF990001') + row('PF990001') + row('PF990002', { state: '공연중' }) + row('PF990003', { state: '공연완료' }) + row('PF990004', { region: '부산광역시' }) + row('PF990005', { from: '2027.01.02' }) + row('PF990006', { genre: '뮤지컬' }))
  } })
  const result = await service.search({ ...query, targetTrackId })
  assert.deepEqual(result.concerts.map(({ kopisId }) => kopisId), ['PF990001', 'PF990002'])
  assert.deepEqual(requests.map((url) => url.searchParams.get('prfstate')), ['01', '02'])
  for (const url of requests) {
    assert.equal(url.searchParams.get('stdate'), '20261201')
    assert.equal(url.searchParams.get('eddate'), '20261231')
    assert.equal(url.searchParams.get('signgucode'), '11')
    assert.equal(url.searchParams.get('shcate'), 'CCCA')
  }
})

test('목록 밖 ID는 상세 조회하지 않고 상세의 지역·기간·공연 상태가 다르면 OCR 전에 제외한다', async () => {
  const ids = ['PF990011', 'PF990012', 'PF990013']
  const details = [], counter = { calls: 0 }
  const service = createKopisService({ persistAnalyses: false, env: { KOPIS_SERVICE_KEY: 'fixture-key' }, ocrService: fakeOcr(counter), delay: async () => {}, fetchImpl: async (url) => {
    if (url.pathname.endsWith('/pblprfr')) return response(ids.map((id) => row(id)).join(''))
    const id = url.pathname.split('/').at(-1); details.push(id)
    return response(row(id, { images: true, ...(id === ids[0] ? { region: '부산광역시' } : id === ids[1] ? { from: '2027.01.02' } : { state: '공연완료' }) }))
  } })
  const result = await service.matchBatch({ targetTrackId, query, kopisIds: [...ids, 'PF990014'] })
  assert.deepEqual(details, ids)
  assert.equal(counter.calls, 0)
  assert.ok(result.results.every((item) => (item.targetMatch || item.concert.targetMatch).outOfScope))
  assert.equal(result.results.at(-1).targetMatch.attempted, false)
})

test('프로그램 텍스트로 확인하면 이미지 OCR을 생략하고 다른 곡·다른 조건에 캐시 일치를 섞지 않는다', async () => {
  const counter = { calls: 0 }
  const service = createKopisService({ persistAnalyses: false, env: { KOPIS_SERVICE_KEY: 'fixture-key' }, ocrService: fakeOcr(counter), delay: async () => {}, fetchImpl: async () => response(row('PF990021', { images: true })) })
  const result = await service.matchBatch({ targetTrackId, query, kopisIds: ['PF990021', 'PF990021'] })
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].concert.targetMatch.status, 'matched')
  assert.equal(result.results[0].concert.targetMatch.evidenceKind, 'text')
  assert.equal(counter.calls, 0)
  assert.equal((await service.cachedMatches({ targetTrackId, query: { ...query, region: '부산' }, kopisIds: ['PF990021'] })).results.length, 0)
  const other = await service.cachedMatches({ targetTrackId: 'beethoven-piano-concerto-op73-no5-m2', query, kopisIds: ['PF990021'] })
  assert.equal(other.results.length, 0, '이미지 분석이 필요한 다른 곡에는 텍스트 캐시 일치를 주입하지 않음')
})

test('같은 곡명·다른 작곡가/작품번호/조성, 다른 날짜·시리즈·홍보 언급을 자동 연결하지 않는다', () => {
  const base = { title: '피아노 시리즈 3', dateFrom: '2026-12-24', dateTo: '2026-12-24' }
  for (const text of [
    '[PROGRAM]\nLiszt Ballade No.1 Op.23', '[PROGRAM]\nChopin Ballade No.1 Op.28',
    '[PROGRAM]\nChopin Ballade No.1 in F minor Op.23', '[PROGRAM]\nChopin Ballade No.1 Op.23 Op.28', '[PROGRAM]\nChopin Ballade No.I Op.23',
    '[PROGRAM]\nChopin and Liszt Ballade No.1 Op.23', '[PROGRAM]\n2026.12.25\nChopin Ballade No.1 Op.23',
    '[PROGRAM]\nPiano Series 2\nChopin Ballade No.1 Op.23', '[PROGRAM]\n시리즈 전체 예시 레퍼토리\nChopin Ballade No.1 Op.23',
    '홍보 기사에서 Chopin Ballade No.1 Op.23 언급', '[PROFILE]\n지난 공연 경력 Chopin Ballade No.1 Op.23',
  ]) assert.notEqual(matchConcertToTrack({ ...base, programEvidence: { text, imageUrls: [] } }, targetTrackId).status, 'matched', text)
  assert.equal(matchConcertToTrack({ ...base, programEvidence: { text: '1부\nChopin Ballade No.1 in G minor Op.23', imageUrls: [] } }, targetTrackId).status, 'matched')
})

test('8개 대표 상태는 KOPIS ID별로 중복 없이 집계하고 시도·완료·미확인을 구분한다', () => {
  assert.equal(Object.keys(matchLabels).length, 8)
  const data = Object.keys(matchLabels).map((status, index) => ({ kopisId: `PF99003${index}`, targetMatch: { status, attempted: status !== 'pending', completed: ['matched', 'needs-review', 'no-material', 'not-found'].includes(status) } }))
  const progress = getMatchProgress([...data, data[0]])
  assert.equal(progress.total, 8)
  assert.equal(progress.attempted, 7)
  assert.equal(progress.completed, 4)
  assert.equal(progress.unconfirmed, 3)
  assert.equal(Object.keys(matchLabels).reduce((sum, key) => sum + progress[key], 0), progress.total)
})
