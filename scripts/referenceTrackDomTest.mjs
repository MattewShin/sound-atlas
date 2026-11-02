import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { tracks } from '../src/data/musicData.js'
import { formatTrackTitle } from '../src/data/emotions.js'

export async function verifyReferenceTrackInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Reference search must stay local') }
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  const doc = dom.window.document
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 10)) })
  const button = (label) => [...doc.querySelectorAll('button')].find((node) => node.textContent.trim() === label)
  const click = async (node) => { assert.ok(node, '버튼 존재'); await flush(() => node.click()) }
  const chooseLevel = (index) => click(doc.querySelectorAll('.exploration-level-switch button')[index])
  const search = async (value) => flush(() => {
    const input = doc.querySelector('#reference-search')
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  let root
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(doc.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    assert.ok(doc.querySelector('.mood-section'))
    assert.equal(doc.querySelector('.exploration-level-switch strong').textContent, '초보자')
    await click(button('평안한'))
    await chooseLevel(1)
    assert.equal(doc.querySelector('.mood-section'), null)
    assert.ok(doc.querySelector('#reference-search'))
    await search('Chopin')
    assert.equal(doc.querySelectorAll('[data-search-track-id]').length, 20)
    await click(button('검색 결과 더 보기'))
    assert.equal(doc.querySelectorAll('[data-search-track-id]').length, 40)
    assert.equal(doc.querySelector('[data-reference-track-id]'), null, '검색은 기준곡을 자동 선택하지 않음')
    await search('없는곡')
    assert.equal(doc.querySelectorAll('[data-search-track-id]').length, 0)
    assert.ok(doc.querySelector('.reference-search-results').textContent.includes('등록된 곡을 찾지 못했어요'))
    await search('쇼팽 발라드 4번')
    assert.equal(doc.querySelectorAll('[data-search-track-id]').length, 1)
    await click(button('이 곡으로 추천'))
    assert.equal(doc.querySelector('[data-reference-track-id]').dataset.referenceTrackId, 'chopin-ballade-op52-no4')
    assert.ok(doc.querySelectorAll('[data-recommended-track-id]').length > 0)
    assert.equal(doc.querySelector('[data-recommended-track-id="chopin-ballade-op52-no4"]'), null)
    const reference = doc.querySelector('.reference-selected').outerHTML
    const recommended = doc.querySelector('[data-recommended-track-id]').dataset.recommendedTrackId
    await click(doc.querySelector('.reference-save'))
    assert.equal(doc.querySelector('.reference-save').getAttribute('aria-pressed'), 'true')
    assert.equal(doc.querySelector('.reference-selected').outerHTML, reference, '보관은 기준곡을 바꾸지 않음')
    await click(doc.querySelector('.reference-track-link'))
    assert.ok(doc.querySelector('[role="dialog"]'), '기존 곡 상세 연결')
    assert.ok(doc.querySelector('.music-journal'), '기존 비공개 기록 연결')
    await click(doc.querySelector('button[aria-label="곡 상세 닫기"]'))
    await chooseLevel(0)
    assert.equal(button('평안한').getAttribute('aria-pressed'), 'true', '초보자 선택 유지')
    await chooseLevel(1)
    assert.equal(doc.querySelector('[data-reference-track-id]').dataset.referenceTrackId, 'chopin-ballade-op52-no4', '모드 전환 시 기준곡 유지')
    await click(button('기준곡 변경'))
    assert.equal(doc.querySelector('[data-reference-track-id]'), null)
    assert.equal(doc.activeElement.id, 'reference-search')
    await search('Chopin Sonata No.2')
    assert.equal(doc.querySelectorAll('[data-search-track-id]').length, 4)
    await click(button('이 곡으로 추천'))
    assert.ok([...doc.querySelectorAll('[data-recommended-track-id]')].every((node) => !node.dataset.recommendedTrackId.startsWith('chopin-sonata-op35-no2-')))
    await click(button('보관함'))
    assert.ok([...doc.querySelectorAll('.saved-track-copy strong')].some((node) => node.textContent.startsWith(formatTrackTitle(tracks.find(({ id }) => id === recommended)))), '보관함에 숙련자 추천곡 반영')
    assert.equal(requests, 0, '검색·기준곡 선택·로컬 보관에 외부 호출 없음')
  } finally {
    if (root) await flush(() => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
