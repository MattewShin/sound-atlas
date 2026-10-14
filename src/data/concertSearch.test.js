import test from 'node:test'
import assert from 'node:assert/strict'
import { createConcertSearchClient, mergeSearchConcerts, isSameConfirmedConcert } from './concertSearch.js'
import { analyzeConcert } from './concertRecommendations.js'
import { tracks } from './musicData.js'

const query = { region: '서울', from: '2026-12-01', to: '2026-12-31' }
const known = { id: 'known-test-concert', title: '테스트 등록 공연', startsAt: '2026-12-24T20:00:00+09:00',
  region: '서울', venue: '테스트홀', sourceUrl: 'https://www.sac.or.kr/site/main/show/show_view?SN=999999',
  kopisHallId: 'TEST-HALL', verifiedOn: '2026-10-12', programStatus: 'verified', programWorkIds: ['beethoven-piano-concerto-op73-no5'] }
const apiConcert = { id: 'kopis-PF999001', kopisId: 'PF999001', title: known.title,
  dateFrom: '2026-12-24', dateTo: '2026-12-24', region: '서울', venue: known.venue,
  fetchedAt: '2026-10-12T00:00:00Z', programStatus: 'unavailable', programWorkIds: [], sourceUrl: 'https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=PF999001' }

test('브라우저 캐시는 같은 조건·페이지 재진입에 재사용하고 만료·강제 새로고침만 API를 재호출한다', async () => {
  let now = Date.parse(apiConcert.fetchedAt), calls = 0
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  const fetchImpl = async (url) => {
    calls += 1
    if (url.includes('refresh')) assert.ok(url.includes('refresh=1'))
    return { ok: true, json: async () => ({ query, concerts: [apiConcert], fetchedAt: new Date(now).toISOString(), cacheTtlMs: 21600000 }) }
  }
  const first = createConcertSearchClient({ fetchImpl, storage, now: () => now })
  await first.search(query)
  for (const selectedKeys of [['power'], ['tenderness'], []]) analyzeConcert(known, tracks, { selectedKeys })
  analyzeConcert(known, tracks, { mode: 'library', savedTrackIds: [tracks[0].id] })
  assert.equal(calls, 1)
  const second = createConcertSearchClient({ fetchImpl, storage, now: () => now })
  assert.equal((await second.search(query)).fromCache, true)
  assert.equal(calls, 1)
  now += 21600000
  await second.search(query)
  assert.equal(calls, 2)
  await second.search(query, { refresh: true })
  assert.equal(calls, 3)
})

test('설정 상태와 조회 실패는 가짜 0건을 반환하지 않고 기존 성공 캐시를 보존한다', async () => {
  let fail = false
  const client = createConcertSearchClient({ fetchImpl: async (url) => ({ ok: !fail,
    json: async () => url.endsWith('/status') ? { configured: false, cacheTtlMs: 1000 } : fail
      ? { code: 'KOPIS_NOT_CONFIGURED', message: '공연 검색 연동 설정 필요' }
      : { query, concerts: [], fetchedAt: new Date().toISOString() },
  }) })
  assert.equal((await client.status()).configured, false)
  assert.deepEqual((await client.search(query)).concerts, [])
  fail = true
  await assert.rejects(client.search(query, { refresh: true }), (error) => error.code === 'KOPIS_NOT_CONFIGURED')
  assert.deepEqual((await client.search(query)).concerts, [])
})

test('같은 KOPIS ID만 보조 링크를 결합하며 KOPIS 기본정보·자동 매칭을 수동 정보로 덮어쓰지 않는다', () => {
  assert.equal(isSameConfirmedConcert(known, apiConcert), false)
  assert.equal(mergeSearchConcerts([apiConcert], [known]).length, 2)
  const proved = { ...apiConcert, relatedUrls: [known.sourceUrl], kopisHallId: known.kopisHallId }
  assert.equal(isSameConfirmedConcert(known, proved), false)
  const merged = mergeSearchConcerts([proved], [{ ...known, kopisId: apiConcert.kopisId }])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, apiConcert.id)
  assert.equal(merged[0].sourceUrl, apiConcert.sourceUrl)
  assert.equal(merged[0].referenceInfo.verifiedOn, known.verifiedOn)
  assert.equal(merged[0].startsAt, undefined)
  assert.deepEqual(merged[0].programWorkIds, [])
  assert.equal(merged[0].programStatus, 'unavailable')
  assert.deepEqual(merged[0].officialUrls, [known.sourceUrl])
  assert.equal(merged[0].kopisId, apiConcert.kopisId)
  assert.equal(isSameConfirmedConcert(known, { ...proved, dateTo: '2026-12-25' }), false)
  assert.equal(isSameConfirmedConcert(known, { ...proved, kopisHallId: 'FC000001-02' }), false)
  assert.equal(isSameConfirmedConcert({ ...known, kopisId: apiConcert.kopisId }, apiConcert), true)
})

test('프로그램 미확보·연결 미확인·소개 텍스트만 있는 공연의 감정과 보관함 적합도는 계산하지 않는다', () => {
  for (const programStatus of ['unavailable', 'needs-review']) {
    const unverified = { ...apiConcert, programStatus, programWorkIds: known.programWorkIds, programEvidence: { text: '베토벤 황제', imageUrls: [] } }
    for (const mode of ['keyword', 'library']) {
      const result = analyzeConcert(unverified, tracks, { mode, selectedKeys: ['power'], savedTrackIds: ['beethoven-piano-concerto-op73-no5-m2'] })
      assert.equal(result.isRecommended, false)
      assert.equal(result.score, null)
      assert.deepEqual(result.program, [])
      assert.match(result.scope, /일반 검색 결과/)
    }
  }
})
