import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKopisService } from './kopis.mjs'
import { createVercelConcertHandler, getVercelConcertEnv } from './vercel.mjs'

const query = { region: '서울', from: '2026-12-01', to: '2026-12-31' }
const targetTrackId = 'chopin-ballade-op23-no1'
const fixture = '<dbs><db><mt20id>PF999001</mt20id><prfnm>프로그램 테스트</prfnm><prfpdfrom>2026.12.24</prfpdfrom><prfpdto>2026.12.24</prfpdto><area>서울특별시</area><genrenm>서양음악(클래식)</genrenm><prfstate>공연예정</prfstate><sty><![CDATA[[PROGRAM]\nChopin Ballade No.1 Op.23]]></sty></db></dbs>'
const rewritten = (path, params = {}) => `/api/index?${new URLSearchParams({ ...params, __concertPath: path })}`
const serve = async (t, handler) => {
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('Vercel OCR 저장 위치는 읽기 전용 배포 폴더 대신 임시 공간을 사용하며 키는 서버에 유지한다', () => {
  const env = { KOPIS_SERVICE_KEY: 'fixture-secret', CONCERT_OCR_CACHE_DIR: '.cache/ocr' }
  const effective = getVercelConcertEnv(env)
  assert.equal(effective.CONCERT_OCR_CACHE_DIR, join(tmpdir(), 'sound-atlas-ocr'))
  assert.equal(effective.KOPIS_SERVICE_KEY, env.KOPIS_SERVICE_KEY)
  assert.equal(env.CONCERT_OCR_CACHE_DIR, '.cache/ocr')
})

test('Vercel rewrite로 상태·검색 조건·상세·POST 작품 확인을 전달하고 인스턴스 캐시를 재사용한다', async (t) => {
  const urls = []
  const service = createKopisService({ persistAnalyses: false, env: getVercelConcertEnv({ KOPIS_SERVICE_KEY: 'fixture-secret' }),
    delay: async () => {}, fetchImpl: async (url) => { urls.push(url); return { ok: true, text: async () => fixture } } })
  t.after(() => service.close())
  const base = await serve(t, createVercelConcertHandler({ service }))
  const status = await fetch(base + rewritten('concerts/status'))
  const configuration = await status.json()
  assert.equal(status.status, 200)
  assert.equal(configuration.configured, true)
  assert.equal(JSON.stringify(configuration).includes('fixture-secret'), false)
  assert.equal(urls.length, 0)

  const response = await fetch(base + rewritten('concerts', query))
  assert.equal(response.status, 200)
  const list = await response.json()
  assert.deepEqual(list.query, query)
  assert.equal(list.concerts[0].kopisId, 'PF999001')
  assert.equal(urls[0].searchParams.get('signgucode'), '11')
  const cached = await fetch(base + `/api/concerts?${new URLSearchParams(query)}`)
  assert.equal((await cached.json()).fromCache, true)
  assert.equal(urls.length, 2)
  await fetch(base + rewritten('concerts', { ...query, refresh: '1' }))
  assert.equal(urls.length, 4)

  const detail = await fetch(base + rewritten('concerts/PF999001/program'))
  assert.equal((await detail.json()).concert.kopisId, 'PF999001')
  const batch = await fetch(base + rewritten('concerts/match-batch'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetTrackId, kopisIds: ['PF999001'], query }),
  })
  assert.equal(batch.status, 200)
  const result = await batch.json()
  assert.equal(result.results[0].concert.targetMatch.status, 'matched')
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false)
  const cachedMatches = await fetch(base + rewritten('concerts/match-batch'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetTrackId, kopisIds: ['PF999001'], query, cacheOnly: true }),
  })
  assert.equal((await cachedMatches.json()).results[0].fromCache, true)
})

test('키 없는 Vercel API와 잘못된 경로·메서드·POST 본문은 HTML 대신 JSON 오류를 응답한다', async (t) => {
  const base = await serve(t, createVercelConcertHandler({ env: {} }))
  const status = await fetch(base + '/api/concerts/status')
  assert.equal((await status.json()).configured, false)
  for (const [path, options, expectedStatus, code] of [
    [rewritten('concerts', query), {}, 503, 'KOPIS_NOT_CONFIGURED'],
    [rewritten('concerts/missing'), {}, 404, 'NOT_FOUND'],
    ['/api/index', {}, 404, 'NOT_FOUND'],
    ['/outside-api', {}, 404, 'NOT_FOUND'],
    [rewritten('concerts/status'), { method: 'DELETE' }, 405, 'METHOD_NOT_ALLOWED'],
    [rewritten('concerts/match-batch'), { method: 'POST', body: '{' }, 400, 'INVALID_BATCH'],
    [rewritten('concerts/match-batch'), { method: 'POST', body: 'x'.repeat(8193) }, 413, 'BODY_TOO_LARGE'],
  ]) {
    const response = await fetch(base + path, options)
    assert.equal(response.status, expectedStatus)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await response.json()).code, code)
  }
})
