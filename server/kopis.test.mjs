import test from 'node:test'
import assert from 'node:assert/strict'
import { createKopisService, parseKopisXml } from './kopis.mjs'
import { createAppServer } from './index.mjs'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const query = { region: '서울', from: '2026-12-01', to: '2026-12-31' }
const fixture = (id = 'PF999001', extra = '') => `<db><mt20id>${id}</mt20id><prfnm>테스트 클래식</prfnm><prfpdfrom>2026.12.24</prfpdfrom><prfpdto>2026.12.24</prfpdto><fcltynm>테스트홀</fcltynm><area>서울특별시</area><genrenm>서양음악(클래식)</genrenm>${extra}</db>`
const xmlResponse = (xml) => ({ ok: true, text: async () => xml })
const instant = async () => {}

test('KOPIS 키가 없어도 예술의전당 공연은 검색하고 KOPIS 요청은 하지 않는다', async () => {
  let calls = 0
  const service = createKopisService({ sacService: { search: async () => [] }, env: {}, fetchImpl: async () => { calls += 1 }, delay: instant })
  assert.equal(service.config().configured, false)
  assert.equal(service.config().sacAvailable, true)
  assert.equal(service.config().cacheTtlMs, 21600000)
  const result = await service.search(query)
  assert.deepEqual(result.concerts, [])
  assert.equal(result.sourceWarnings.length, 1)
  assert.equal(calls, 0)
})

test('키가 없고 SAC도 실패하면 빈 공연 목록 대신 오류를 반환한다', async () => {
  const service = createKopisService({ env: {}, delay: instant,
    sacService: { search: async () => { throw new Error('SAC unavailable') } } })
  await assert.rejects(service.search(query), (error) => error.code === 'CONCERT_SOURCES_UNAVAILABLE' && error.status === 503)
})

test('지역·기간·클래식 코드·페이지를 서버에서 지정하고 목록 조회는 상세 프로그램을 호출하지 않는다', async () => {
  const urls = []
  const service = createKopisService({ sacService: { search: async () => [] }, env: { KOPIS_SERVICE_KEY: 'test-secret' }, delay: instant,
    fetchImpl: async (url) => { urls.push(url); return xmlResponse(`<dbs>${fixture()}</dbs>`) } })
  const result = await service.search(query)
  assert.equal(urls.length, 1)
  assert.equal(urls[0].pathname, '/openApi/restful/pblprfr')
  assert.equal(urls[0].searchParams.get('shcate'), 'CCCA')
  assert.equal(urls[0].searchParams.get('signgucode'), '11')
  assert.equal(urls[0].searchParams.get('stdate'), '20261201')
  assert.equal(urls[0].searchParams.get('rows'), '100')
  assert.equal(result.concerts[0].programStatus, 'unavailable')
  assert.deepEqual(result.concerts[0].programWorkIds, [])
  assert.equal(JSON.stringify(result).includes('test-secret'), false)
  await assert.rejects(service.search({ ...query, to: '2027-01-01' }), (error) => error.status === 400)
  await assert.rejects(service.search({ ...query, from: '2026-02-30' }), (error) => error.status === 400)
})

test('예술의전당 공연을 KOPIS 결과와 함께 보여주고 출처 오류는 부분 결과로 알린다', async () => {
  const sacConcert = { id: 'sac-81233', sacId: '81233', title: 'KBS교향악단 송년음악회',
    dateFrom: '2026-12-24', dateTo: '2026-12-24', region: '서울', venue: '예술의전당 콘서트홀',
    saleState: '예정', sourceUrl: 'https://www.sac.or.kr/site/main/show/show_view?SN=81233',
    sourceLabel: '예술의전당 공식 공연 정보', programStatus: 'unavailable', programWorkIds: [] }
  const service = createKopisService({ env: { KOPIS_SERVICE_KEY: 'test-key' }, delay: instant,
    fetchImpl: async () => xmlResponse(`<dbs>${fixture()}</dbs>`),
    sacService: { search: async () => [sacConcert] } })
  const result = await service.search(query)
  assert.equal(result.concerts.length, 2)
  assert.equal(result.concerts.find((item) => item.sacId === '81233')?.saleState, '예정')
  assert.deepEqual(result.sourceWarnings, [])
  const failing = createKopisService({ env: { KOPIS_SERVICE_KEY: 'test-key' }, delay: instant,
    fetchImpl: async () => xmlResponse(`<dbs>${fixture()}</dbs>`),
    sacService: { search: async () => { throw new Error('upstream private detail') } } })
  const partial = await failing.search(query)
  assert.equal(partial.concerts.length, 1)
  assert.equal(partial.sourceWarnings.length, 1)
  assert.ok(!JSON.stringify(partial).includes('upstream private detail'))
})

test('서버 검색 캐시는 같은 조건을 6시간 재사용하고 만료·강제 새로고침·다른 지역은 재조회한다', async () => {
  let now = Date.parse('2026-10-12T00:00:00Z'), calls = 0
  const service = createKopisService({ sacService: { search: async () => [] }, env: { KOPIS_SERVICE_KEY: 'test-key' }, now: () => now, delay: instant,
    fetchImpl: async () => { calls += 1; return xmlResponse('<dbs/>') } })
  const first = await service.search(query)
  now += 21600000 - 1
  const cached = await service.search(query)
  assert.equal(cached.fromCache, true)
  assert.equal(cached.fetchedAt, first.fetchedAt)
  assert.equal(calls, 1)
  now += 1
  await service.search(query)
  assert.equal(calls, 2)
  await service.search(query, true)
  assert.equal(calls, 3)
  await service.search({ ...query, region: '부산' })
  assert.equal(calls, 4)
})

test('정상 0건과 잘못된 XML·인증 오류·네트워크 오류를 구별하고 오류는 캐시하지 않는다', async () => {
  assert.deepEqual(parseKopisXml('<?xml version="1.0"?><dbs/>'), [])
  assert.throws(() => parseKopisXml('<dbs><db><returncode>02</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR</errmsg></db></dbs>'),
    (error) => error.code === 'KOPIS_AUTH_ERROR')
  for (const bad of ['<error>invalid key</error>', '<dbs><error>invalid key</error></dbs>', '<dbs><db>', '<!DOCTYPE dbs><dbs/>']) assert.throws(() => parseKopisXml(bad))
  let calls = 0
  const service = createKopisService({ sacService: { search: async () => [] }, env: { KOPIS_SERVICE_KEY: 'never-return-key' }, delay: instant,
    fetchImpl: async () => { calls += 1; if (calls === 1) throw new Error('https://kopis.or.kr/?service=never-return-key'); return xmlResponse('<dbs/>') } })
  await assert.rejects(service.search(query), (error) => error.code === 'KOPIS_UNAVAILABLE' && !error.message.includes('never-return-key'))
  assert.deepEqual((await service.search(query)).concerts, [])
  assert.equal(calls, 2)
})

test('100건 페이지 뒤의 결과도 가져오고 중복 ID는 한 번만 표시한다', async () => {
  let calls = 0
  const service = createKopisService({ sacService: { search: async () => [] }, env: { KOPIS_SERVICE_KEY: 'test-key' }, delay: instant,
    fetchImpl: async () => { calls += 1; return xmlResponse(`<dbs>${calls === 1 ? Array.from({ length: 100 }, (_, i) => fixture(`PF${900000 + i}`)).join('') : fixture('PF900000') + fixture('PF900100')}</dbs>`) } })
  assert.equal((await service.search(query)).concerts.length, 101)
  assert.equal(calls, 2)
})

test('상세·프로그램 자료 조회는 별도 요청이며 텍스트·이미지가 있어도 추천용 확정 작품을 만들지 않는다', async () => {
  const service = createKopisService({ sacService: { search: async () => [] }, env: { KOPIS_SERVICE_KEY: 'test-key' }, delay: instant,
    fetchImpl: async (url) => {
      assert.equal(url.pathname, '/openApi/restful/pblprfr/PF999001')
      return xmlResponse(`<dbs>${fixture('PF999001', '<mt13id>TEST-HALL</mt13id><sty><![CDATA[베토벤 황제 프로그램 소개]]></sty><styurls><styurl>https://kopis.or.kr/upload/example.jpg</styurl><styurl>javascript:bad</styurl></styurls><relates><relate><relateurl>https://example.com/concert</relateurl></relate></relates>')}</dbs>`)
    } })
  const { concert } = await service.program('PF999001')
  assert.equal(concert.programStatus, 'needs-review')
  assert.deepEqual(concert.programWorkIds, [])
  assert.equal(concert.programEvidence.text, '베토벤 황제 프로그램 소개')
  assert.equal(concert.programEvidence.imageUrls.length, 1)
  assert.equal(concert.relatedUrls.length, 1)
  await assert.rejects(service.program('../secrets'), (error) => error.status === 400)
})

test('운영 서버는 같은 출처 API·정적 앱을 제공하며 키 없이 SAC 검색을 허용한다', async () => {
  const testDist = await mkdtemp(join(tmpdir(), 'sound-atlas-api-test-'))
  await writeFile(join(testDist, 'index.html'), '<html>test-app</html>')
  await writeFile(join(testDist, '.env'), 'SERVER_SECRET=test-only')
  const server = createAppServer({ service: createKopisService({ sacService: { search: async () => [] }, env: {} }), distDirectory: testDist })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const status = await fetch(`${base}/api/concerts/status`)
    assert.equal((await status.json()).configured, false)
    const response = await fetch(`${base}/api/concerts?${new URLSearchParams(query)}`)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(result.concerts, [])
    assert.equal(result.sourceWarnings.length, 1)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const missing = await fetch(`${base}/.env`)
    assert.equal(missing.status, 404)
    const app = await fetch(base)
    assert.equal(app.status, 200)
    assert.equal(await app.text(), '<html>test-app</html>')
    const fallback = await fetch(`${base}/concert`)
    assert.equal(fallback.status, 200)
    const method = await fetch(`${base}/api/concerts/status`, { method: 'POST' })
    assert.equal(method.status, 405)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await unlink(join(testDist, 'index.html')); await unlink(join(testDist, '.env')); await rmdir(testDist)
  }
})
