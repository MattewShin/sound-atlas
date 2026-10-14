import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProgram, getExtractedWorkLinks, matchConcertToTrack } from './programMatching.mjs'
import { createKopisService } from './kopis.mjs'
import { createAppServer } from './index.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'

const chopin = 'chopin-ballade-op23-no1'
const emperor2 = 'beethoven-piano-concerto-op73-no5-m2'
const january = 'tchaikovsky-seasons-op37a-no1'
const september = 'tchaikovsky-seasons-op37a-no9'
const schubert2 = 'schubert-impromptu-d899-op90-no2'
const schubert3 = 'schubert-impromptu-d899-op90-no3'
const appassionata1 = 'beethoven-sonata-op57-no23-m1'
const concert = (text, images = []) => ({ programEvidence: { text, imageUrls: images } })
const state = (text, id = chopin, images = []) => matchConcertToTrack(concert(text, images), id)
test('실제 곡 ID와 부모 작품을 보존하고 프로그램 구역의 작곡가·작품번호·곡번호로 연결한다', () => {
  assert.equal(getTrackTarget(chopin).work.opus, 23)
  assert.equal(getTrackTarget(emperor2).work.trackIds.length, 3)
  assert.equal(getTrackTarget(emperor2).workId, 'beethoven-piano-concerto-op73-no5')
  assert.equal(state('[PROGRAM]\nF. Chopin\nBallade No.1 in G minor, Op.23').status, 'matched')
  assert.equal(state('프로그램\n쇼팽 발라드 제1번 Op.23').status, 'matched')
  assert.equal(state('[PROGRAM]\nChopin Ballade No.2 Op.38').status, 'not-found')
  assert.equal(state('[PROGRAM]\nChopin Ballade No.2 Op.23').status, 'ambiguous')
  assert.equal(state('[PROGRAM]\nChopin Ballade No.1').status, 'ambiguous')
  assert.equal(state('[PROGRAM]\nBallade No.1 Op.23').status, 'ambiguous')
  assert.equal(state('[PROGRAM]\nChopin\nEtude Op.10 No.3\nSchubert Ballade No.1 Op.23').status, 'not-found')
  assert.equal(state('[PROGRAM]\nChopin\nBallade No.1 Op.23').status, 'matched')
  assert.equal(state('[Program]\nL.v. Beethoven\nPiano Sonata No. 23 in f minor, Op. 57', appassionata1).status, 'matched')
})
test('차이콥스키 사계의 영문 월명·한글 월명·검증된 별칭을 개별 곡에만 연결한다', () => {
  assert.equal(getTrackTarget(january).work.opusSuffix, 'a')
  assert.equal(state('[PROGRAM]\nP. Tchaikovsky Four Seasons January: At the Fireside, Op.37a', january).status, 'matched')
  assert.equal(state('프로그램\n차이콥스키 사계 Op.37a 1월 난롯가에서', january).status, 'matched')
  assert.equal(state('[PROGRAM]\nTchaikovsky The Seasons September: Hunting, Op.37a', september).status, 'matched')
  assert.notEqual(state('[PROGRAM]\nTchaikovsky The Seasons February: Carnival, Op.37a', january).status, 'matched')
  assert.notEqual(state('[PROGRAM]\nTchaikovsky The Seasons January: At the Fireside, Op.37b', january).status, 'matched')
  assert.equal(state('[PROGRAM]\nTchaikovsky The Seasons Op.37a', january).status, 'ambiguous')
  assert.equal(state('[PROFILE]\nTchaikovsky The Seasons January: At the Fireside Op.37a', january).status, 'ambiguous')
  assert.equal(getExtractedWorkLinks(extractProgram('[Full Program]\nTchaikovsky Complete The Seasons, Op.37a')).length, 12)
})
test('슈베르트 즉흥곡은 D.899 또는 Op.90과 곡번호를 확인해 개별 곡에 연결한다', () => {
  const target = getTrackTarget(schubert3)
  assert.equal(target.work.catalogue, 'D')
  assert.equal(target.work.catalogueNumber, 899)
  assert.equal(state('[PROGRAM]\nFranz Schubert\nImpromptu D.899 Op.90 No.3', schubert3).status, 'matched')
  assert.equal(state('프로그램\n슈베르트 즉흥곡 D.899 Op.90 제3번', schubert3).status, 'matched')
  assert.equal(state('[PROGRAM]\nSchubert Impromptu D.899 Op.90 No.2', schubert3).status, 'not-found')
  assert.equal(state('[PROGRAM]\nSchubert Impromptu D.935 Op.142 No.3', schubert3).status, 'not-found')
  assert.equal(state('[PROGRAM]\nSchubert Impromptu D.899 Op.90', schubert3).status, 'ambiguous')
  const recital = extractProgram('[PROGRAM]\nF. Schubert                  Two Impromptus, Op. 90\n(1797-1828)                    No. 3 in G flat major\nNo. 2 in E flat major')
  assert.equal(matchConcertToTrack({ programEvidence: { text: recital.programText, imageUrls: [] }, programExtraction: recital }, schubert3).status, 'matched')
  assert.deepEqual(getExtractedWorkLinks(recital).map(({ workId }) => workId).sort(), [schubert2, schubert3])
  assert.equal(getExtractedWorkLinks(extractProgram('[Full Program]\nSchubert Complete 4 Impromptus D.899 Op.90')).length, 4)
})
test('소개·경력 언급과 편곡을 자동 확정하지 않고 자료 없음·이미지·부분 자료를 구분한다', () => {
  assert.equal(state('지난 공연에서 Chopin Ballade No.1 Op.23을 연주했다.').status, 'ambiguous')
  assert.equal(state('[PROGRAM NOTES]\nChopin Ballade No.1 Op.23').status, 'ambiguous')
  assert.equal(state('[PROFILE]\n[REPERTOIRE]\nChopin Ballade No.1 Op.23').status, 'ambiguous')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Sonata No.8 Op.13\n[PROFILE]\nChopin Ballade No.1 Op.23').status, 'not-found')
  assert.equal(state('[PROGRAM]\nChopin Ballade No.1 Op.23, arranged for violin').status, 'ambiguous')
  assert.equal(state('[일부 프로그램]\nChopin Ballade No.2 Op.38').status, 'ambiguous')
  assert.equal(state('', chopin, ['https://example.org/program.jpg']).status, 'image-required')
  assert.equal(state('[PROGRAM]\nChopin Ballade No.2 Op.38', chopin, ['https://example.org/program.jpg']).status, 'image-required')
  assert.equal(state('[Full Program]\nChopin Ballade No.2 Op.38', chopin, ['https://example.org/poster.jpg']).status, 'not-found')
  assert.equal(state('').status, 'no-material')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Sonata No.8 Op.13\n식별하지 못한 곡목').status, 'ambiguous')
  assert.equal(state('[PROGRAM]\n식별하지 못한 곡목\nBeethoven Piano Sonata No.8 Op.13').status, 'ambiguous')
})
test('작품 안내·전곡·악장 발췌 범위를 구분하고 같은 작품은 한 번만 연결한다', () => {
  const text = '[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73\n베토벤 피아노 협주곡 제5번 Op.73'
  assert.equal(getExtractedWorkLinks(extractProgram(text)).length, 1)
  const work = state(text, emperor2)
  assert.equal(work.status, 'matched')
  assert.equal(work.scope.kind, 'work')
  assert.ok(work.reason.includes('선택한 악장 연주 확정 안내는 아니'))
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73 전곡', emperor2).scope.kind, 'complete-work')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Emperor', emperor2).status, 'ambiguous')
  assert.ok(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Emperor', emperor2).reason.includes('별칭'))
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73\n2악장 발췌', emperor2).status, 'matched')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73\n1악장 발췌', emperor2).status, 'not-found')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73\n발췌', emperor2).status, 'ambiguous')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73 1~3악장 발췌', emperor2).status, 'matched')
  assert.equal(state('[PROGRAM]\nBeethoven Piano Concerto No.5 Op.73 2nd movement only', emperor2).status, 'ambiguous')
  const manual = { programStatus: 'verified', programVerification: 'manual', programWorkIds: ['beethoven-piano-concerto-op73-no5'], sourceUrl: 'https://example.com/concert' }
  assert.equal(matchConcertToTrack(manual, emperor2).status, 'matched')
  assert.ok(matchConcertToTrack(manual, emperor2).evidence.includes('example.com/concert'))
})

const fixture = (id, text = '[PROGRAM]\nChopin Ballade No.1 Op.23') => `<dbs><db><mt20id>${id}</mt20id><prfnm>프로그램 테스트</prfnm><prfpdfrom>2026.12.24</prfpdfrom><prfpdto>2026.12.24</prfpdto><area>서울특별시</area><genrenm>서양음악(클래식)</genrenm><prfstate>공연예정</prfstate><sty><![CDATA[${text}]]></sty></db></dbs>`
test('5건 제한·대상 ID 검증·원문과 추출 캐시 재사용 및 강제 갱신을 검증한다', async () => {
  let calls = 0
  const service = createKopisService({ persistAnalyses: false, env: { KOPIS_SERVICE_KEY: 'fixture-key' }, delay: async () => {}, fetchImpl: async (url) => {
    calls += 1
    return { ok: true, text: async () => fixture(url.pathname.split('/').at(-1)) }
  } })
  const first = await service.matchBatch({ targetTrackId: chopin, kopisIds: ['PF999001', 'PF999001'] })
  assert.equal(first.targetTrackId, chopin)
  assert.equal(first.results.length, 1)
  assert.equal(first.results[0].concert.targetMatch.status, 'matched')
  assert.deepEqual(first.results[0].concert.programWorkIds, [chopin])
  const other = await service.matchBatch({ targetTrackId: emperor2, kopisIds: ['PF999001'] })
  assert.equal(other.results[0].fromCache, true)
  assert.equal(other.results[0].concert.targetMatch.status, 'not-found')
  assert.equal(calls, 1)
  assert.equal(other.results[0].concert.programExtraction, first.results[0].concert.programExtraction)
  await service.matchBatch({ targetTrackId: chopin, kopisIds: ['PF999001'], refresh: true })
  assert.equal(calls, 2)
  await assert.rejects(service.matchBatch({ targetTrackId: 'fake-title', kopisIds: [] }), (error) => error.code === 'INVALID_TARGET')
  await assert.rejects(service.matchBatch({ targetTrackId: chopin, kopisIds: Array(6).fill('PF999001') }), (error) => error.code === 'INVALID_BATCH')
})
test('실제 HTTP 요청의 곡 ID가 서버까지 도달하며 조회 실패는 불일치와 구분한다', async () => {
  const service = createKopisService({ persistAnalyses: false, env: { KOPIS_SERVICE_KEY: 'fixture-key' }, delay: async () => {}, fetchImpl: async (url) => {
    const id = url.pathname.split('/').at(-1)
    if (id === 'pblprfr') return { ok: true, text: async () => fixture('PF999001').replace('</dbs>', fixture('PF999002').replace('<dbs>', '')) }
    if (id === 'PF999002') throw new Error('failure')
    return { ok: true, text: async () => fixture(id) }
  } })
  const server = createAppServer({ service })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/concerts/match-batch`
    const response = await fetch(url, { method: 'POST', body: JSON.stringify({ targetTrackId: chopin, kopisIds: ['PF999001', 'PF999002'], query: { region: '서울', from: '2026-12-01', to: '2026-12-31' } }) })
    const data = await response.json()
    assert.equal(response.status, 200)
    assert.equal(data.targetTrackId, chopin)
    assert.equal(data.results[0].concert.targetMatch.targetTrackId, chopin)
    assert.equal(data.results[1].targetMatch.status, 'failed')
    assert.equal(data.results[1].targetMatch.retryable, true)
    assert.equal((await fetch(url, { method: 'POST', body: 'null' })).status, 400)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
