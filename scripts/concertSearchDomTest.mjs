import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'

// 실제 브라우저 시각 검사를 대체하지 않습니다. React 상태·이벤트·API 호출을 검증합니다.
export async function verifyConcertSearchInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  let configured = false, listCalls = 0, programCalls = 0
  const queries = []
  globalThis.fetch = async (value) => {
    const url = new URL(value, 'http://localhost')
    const json = (body, ok = true) => ({ ok, json: async () => body })
    if (url.pathname.endsWith('/status')) return json({ configured, cacheTtlMs: 21600000 })
    if (url.pathname.endsWith('/program')) {
      programCalls += 1
      return json({ concert: { ...lastConcert, programStatus: 'unavailable', programEvidence: { text: '', imageUrls: [] } }, fetchedAt: new Date().toISOString(), cacheTtlMs: 21600000 })
    }
    listCalls += 1
    if (!configured) return json({ code: 'KOPIS_NOT_CONFIGURED', message: '공연 검색 연동 설정 필요' }, false)
    const query = { region: url.searchParams.get('region'), from: url.searchParams.get('from'), to: url.searchParams.get('to') }
    queries.push(query)
    lastConcert = { id: 'kopis-PF999002', kopisId: 'PF999002', title: '테스트 검색 공연', dateFrom: query.to, dateTo: query.to, venue: '테스트홀', region: query.region,
      programStatus: 'unavailable', programWorkIds: [], sourceUrl: 'https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=PF999002', sourceLabel: 'KOPIS 공연 정보', fetchedAt: new Date().toISOString() }
    return json({ query, concerts: [lastConcert], fetchedAt: new Date().toISOString(), cacheTtlMs: 21600000, fromCache: false })
  }
  let lastConcert, root
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 15)) })
  const click = async (button) => { assert.ok(button, '찾는 버튼이 있어야 합니다'); await flush(() => button.click()) }
  const findButton = (label) => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === label)
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    assert.equal(listCalls, 0)
    await click(findButton('공연 찾기'))
    assert.ok(dom.window.document.body.textContent.includes('공연 검색 연동 설정 필요'))
    assert.ok(!dom.window.document.body.textContent.includes('직접 등록한 공연'))
    assert.equal(listCalls, 0)
    await flush(() => dom.window.document.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(listCalls, 1)
    assert.ok(dom.window.document.querySelector('[role="alert"]').textContent.includes('공연 검색 연동 설정 필요'))
    assert.ok(!dom.window.document.body.textContent.includes('검색 결과가 0건'))
    await flush(() => root.unmount())
    configured = true; listCalls = 0
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    await click(findButton('공연 찾기'))
    assert.equal(listCalls, 0)
    const submit = () => dom.window.document.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await flush(submit)
    assert.equal(listCalls, 1)
    assert.ok(dom.window.document.body.textContent.includes('테스트 검색 공연'))
    assert.ok(dom.window.document.body.textContent.includes('마지막 조회'))
    await click(findButton('보관함 기반'))
    await click(findButton('선택한 감정 기반'))
    const soft = [...dom.window.document.querySelectorAll('[aria-label="공연 음악 느낌 선택"] button')].find((button) => button.textContent === '부드러운')
    await click(soft)
    assert.equal(listCalls, 1)
    assert.equal(programCalls, 0)
    await flush(submit)
    assert.equal(listCalls, 1)
    await click(findButton('최신 정보로 새로고침'))
    assert.equal(listCalls, 2)
    const inputs = [...dom.window.document.querySelectorAll('.concert-period input')]
    await flush(() => {
      for (const [index, value] of ['2026-12-01', '2026-12-31'].entries()) {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(inputs[index], value)
        inputs[index].dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      }
    })
    assert.equal(listCalls, 2)
    await flush(submit)
    assert.equal(listCalls, 3)
    assert.equal(queries.at(-1).from, '2026-12-01')
    assert.equal(queries.at(-1).to, '2026-12-31')
    await click(findButton('공연 상세·프로그램 자료 보기 →'))
    await click(findButton('상세·프로그램 자료 확인'))
    assert.equal(programCalls, 1)
    assert.equal(listCalls, 3)
    assert.ok(dom.window.document.body.textContent.includes('프로그램 미확보 · 일반 검색 결과'))
  } finally {
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
