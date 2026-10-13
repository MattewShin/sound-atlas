import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { DATA_VERSION } from '../src/data/emotions.js'
import { SELECTION_KEY, STORAGE_KEY, VERSION_KEY } from '../src/data/storage.js'

// 합성 응답을 통한 곡 선택 전 네트워크 차단과 설정 오류 검증.
export async function verifyConcertSearchInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  let listCalls = 0, detailCalls = 0, ocrCalls = 0, root
  globalThis.fetch = async (value) => {
    const url = new URL(value, 'http://localhost')
    if (url.pathname.endsWith('/status')) return { ok: true, json: async () => ({ configured: false, cacheTtlMs: 21600000 }) }
    if (url.pathname.endsWith('/program')) detailCalls += 1
    else if (url.pathname.endsWith('/match-batch')) ocrCalls += 1
    else { listCalls += 1; assert.equal(url.searchParams.get('targetTrackId'), 'chopin-ballade-op23-no1') }
    return { ok: false, json: async () => ({ code: 'KOPIS_NOT_CONFIGURED', message: '공연 검색 연동 설정 필요' }) }
  }
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 15)) })
  const findButton = (label) => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === label)
  try {
    const saved = { 'chopin-ballade-op23-no1': { listenAgain: true, liked: true } }
    dom.window.localStorage.setItem(VERSION_KEY, DATA_VERSION)
    dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    dom.window.localStorage.setItem(SELECTION_KEY, JSON.stringify(['wonder', 'peacefulness']))
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    assert.equal(findButton('감동적인').getAttribute('aria-pressed'), 'false', '이전 저장 키워드를 복원하지 않음')
    assert.equal(findButton('평안한').getAttribute('aria-pressed'), 'false')
    assert.equal(dom.window.localStorage.getItem(SELECTION_KEY), null)
    await flush(() => findButton('감동적인').click())
    assert.equal(findButton('감동적인').getAttribute('aria-pressed'), 'true')
    assert.equal(dom.window.localStorage.getItem(SELECTION_KEY), null, '새 선택도 영구 저장하지 않음')
    await flush(() => root.unmount())
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    assert.equal(findButton('감동적인').getAttribute('aria-pressed'), 'false', '새로 시작하면 키워드 초기화')
    assert.equal(dom.window.document.querySelector('.featured-track'), null, '이전 키워드의 추천도 복원하지 않음')
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)), saved, '보관·좋아요 기록 유지')
    await flush(() => findButton('감동적인').click())
    const featuredBefore = dom.window.document.querySelector('.featured-track h2').textContent
    const relatedChoice = dom.window.document.querySelector('.similar-section .mini-track')
    const relatedTitle = relatedChoice.querySelector('strong').textContent
    assert.notEqual(relatedTitle, featuredBefore)
    await flush(() => relatedChoice.click())
    assert.equal(dom.window.document.querySelector('.featured-track h2').textContent, relatedTitle)
    assert.ok(dom.window.document.querySelector('.featured-track').textContent.includes('선택한 추천 곡'))
    assert.ok(!dom.window.document.querySelector('.track-detail-backdrop.is-open'))
    assert.ok(![...dom.window.document.querySelectorAll('.similar-section .mini-track strong')].some((node) => node.textContent === relatedTitle))
    await flush(() => findButton('평안한').click())
    assert.ok(!dom.window.document.querySelector('.featured-track').textContent.includes('선택한 추천 곡'), '감정 변경 시 선택을 초기화')
    await flush(() => findButton('공연 찾기').click())
    assert.ok(dom.window.document.body.textContent.includes('어떤 곡의 공연을 찾으시나요?'))
    assert.ok(!dom.window.document.querySelector('.concert-search-panel'))
    assert.ok(!dom.window.document.querySelector('.concert-search-results'))
    assert.ok(!dom.window.document.body.textContent.includes('선택한 감정 기반'))
    assert.equal(listCalls + detailCalls + ocrCalls, 0, '대상 곡이 없으면 공연 API·OCR 요청 없음')

    const input = dom.window.document.querySelector('#concert-track-query')
    await flush(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'Chopin Ballade Op.23')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    const choice = dom.window.document.querySelector('.concert-catalog-options [data-track-id="chopin-ballade-op23-no1"]')
    assert.ok(choice, '영문 작곡가·곡명·작품번호 검색')
    await flush(() => choice.click())
    assert.equal(dom.window.document.querySelector('.concert-target').dataset.targetTrackId, 'chopin-ballade-op23-no1')
    assert.ok(dom.window.document.body.textContent.includes('공연 검색 연동 설정 필요'))
    assert.equal(listCalls + detailCalls + ocrCalls, 0, '곡 선택만으로는 목록 조회하지 않음')
    await flush(() => dom.window.document.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(listCalls, 1)
    assert.ok(dom.window.document.querySelector('[role="alert"]').textContent.includes('공연 검색 연동 설정 필요'))
    assert.ok(!dom.window.document.body.textContent.includes('검색 결과가 0건'))
    assert.equal(detailCalls + ocrCalls, 0)
  } finally {
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
