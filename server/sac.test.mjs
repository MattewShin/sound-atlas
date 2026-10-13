import test from 'node:test'
import assert from 'node:assert/strict'
import { createSacService, normalizeSacConcert } from './sac.mjs'

const query = { region: '서울', from: '2026-12-01', to: '2026-12-31' }
const sample = { SN: 81233, PROGRAM_SUBJECT: 'KBS교향악단 70주년 기념 송년음악회 <합창>',
  BEGIN_DATE: '2026.12.24', END_DATE: '2026.12.24', PLACE_NAME: '콘서트홀', SALE_STATE_CODE_NAME: '예정' }
test('예술의전당 달력 공연은 공식 URL과 날짜·예매 상태를 보존한다', async () => {
  let calls = 0
  const service = createSacService({ now: () => Date.parse('2026-10-13T00:00:00Z'), fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, 'https://www.sac.or.kr/site/main/program/getProgramCalList')
    assert.equal(options.method, 'POST')
    assert.equal(options.body.get('CATEGORY_PRIMARY'), '2')
    assert.equal(options.body.get('searchMonth'), '12')
    return { ok: true, headers: { get: () => 'application/json;charset=UTF-8' },
      text: async () => JSON.stringify({ calendar: [sample, sample] }) }
  } })
  const first = await service.search(query)
  assert.equal(first.length, 1)
  assert.equal(first[0].dateFrom, '2026-12-24')
  assert.equal(first[0].saleState, '예정')
  assert.equal(first[0].sourceUrl, 'https://www.sac.or.kr/site/main/show/show_view?SN=81233')
  assert.deepEqual(await service.search(query), first)
  assert.deepEqual(await service.search({ ...query, region: '부산' }), [])
  assert.equal(calls, 1)
})
test('잘못된 공연 날짜와 ID는 표시하지 않는다', () => {
  assert.equal(normalizeSacConcert({ ...sample, BEGIN_DATE: '2026.02.30' }, ''), null)
  assert.equal(normalizeSacConcert({ ...sample, SN: '../bad' }, ''), null)
})
