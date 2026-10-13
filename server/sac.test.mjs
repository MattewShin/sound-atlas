import test from 'node:test'
import assert from 'node:assert/strict'
import { createSacService, normalizeSacConcert, extractSacProgramText } from './sac.mjs'

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

test('공식 상세 HTML에서 프로그램 구역만 읽고 스크립트·할인 문구를 제외한다', async () => {
  const html = '<head><script>[프로그램]<br>Chopin Ballade No.1 Op.23</script></head>' +
    '<section><p>[프로그램]</p><p>베토벤 / 피아노 협주곡 제5번 황제<br>L. v. Beethoven / Piano Concerto No.5 Emperor</p><p>※ C석은 할인 제외</p></section>'
  const text = extractSacProgramText(html)
  assert.ok(text.startsWith('[PROGRAM]'))
  assert.ok(text.includes('피아노 협주곡 제5번'))
  assert.ok(!text.includes('Chopin Ballade') && !text.includes('할인'))
  let calls = 0
  const service = createSacService({ fetchImpl: async (url) => {
    calls++
    assert.equal(url, 'https://www.sac.or.kr/site/main/show/show_view?SN=81233')
    return { ok: true, headers: { get: () => 'text/html;charset=UTF-8' }, text: async () => html }
  } })
  assert.equal(await service.program('81233'), text)
  assert.equal(await service.program('81233'), text)
  assert.equal(calls, 1)
  await assert.rejects(service.program('../bad'))
})
