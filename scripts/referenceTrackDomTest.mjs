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
  const chooseLevel = async (index) => {
    const toggle = doc.querySelector('.exploration-level-switch')
    if (toggle.getAttribute('aria-checked') !== String(index === 1)) await click(toggle)
  }
  const discoveryIds = () => [...doc.querySelectorAll('.reference-discovery .mini-track')].map((node) => node.dataset.trackId)
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
    assert.equal(doc.querySelector('.exploration-level-switch').getAttribute('role'), 'switch')
    assert.equal(doc.querySelector('.exploration-level-switch').getAttribute('aria-checked'), 'false')
    assert.equal(doc.querySelector('.exploration-level-switch').textContent.trim(), '초보자숙련자')
    await click(button('평안한'))
    await chooseLevel(1)
    assert.equal(doc.querySelector('.mood-section'), null)
    assert.ok(doc.querySelector('#reference-search'))
    assert.equal(doc.querySelector('#reference-search').getAttribute('placeholder'), null)
    assert.ok(!doc.querySelector('.reference-explorer').textContent.includes('예를 들어'))
    assert.equal(doc.querySelector('#reference-discovery-title').textContent, '오늘은 이런곡이 어떤가요?')
    const firstDiscovery = discoveryIds()
    assert.equal(firstDiscovery.length, 4)
    assert.equal(new Set(firstDiscovery).size, 4)
    assert.equal(doc.querySelector('.reference-explorer .recommendation-mode-control'), null, '랜덤 탐색은 추천 방식 선택 없음')
    await click(doc.querySelector('.reference-discovery .mini-track'))
    assert.deepEqual(discoveryIds(), firstDiscovery, '상세 열기로 랜덤 곡을 교체하지 않음')
    await click(doc.querySelector('button[aria-label="곡 상세 닫기"]'))
    await click(button('보관함'))
    await click(button('음악 탐색'))
    assert.ok(discoveryIds().every((id) => !firstDiscovery.includes(id)), '홈 재진입 시 랜덤 곡 교체')
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
    assert.equal(doc.querySelector('.reference-discovery'), null)
    assert.equal(doc.querySelector('.reference-featured-section .section-heading p').textContent, 'FOR YOU')
    assert.equal(doc.querySelector('.featured-track').dataset.featuredTrackId, 'chopin-ballade-op52-no4')
    assert.equal(button('검색 음악').getAttribute('aria-pressed'), 'true')
    assert.equal(button('내 취향').disabled, true, '보관곡 없는 취향 선택은 비활성')
    await click(doc.querySelector('.featured-track .track-card-top button'))
    assert.equal(doc.querySelector('.featured-track .track-card-top button').getAttribute('aria-pressed'), 'true')
    assert.equal(button('내 취향').disabled, false)
    await click(doc.querySelector('.featured-track .play-button'))
    assert.ok(doc.querySelector('.highlight-short-backdrop.is-open'), '대표 카드 미리듣기 연결')
    await click(doc.querySelector('.highlight-short-top button'))
    const recommended = doc.querySelector('[data-recommended-track-id]').dataset.recommendedTrackId
    await click(doc.querySelector('.reference-save'))
    assert.equal(doc.querySelector('.reference-save').getAttribute('aria-pressed'), 'true')
    assert.equal(doc.querySelector('.featured-track').dataset.featuredTrackId, 'chopin-ballade-op52-no4', '보관은 기준곡을 바꾸지 않음')
    await click(button('내 취향'))
    assert.equal(doc.querySelector('.exploration-level-switch').getAttribute('aria-checked'), 'true', '내 취향도 숙련자 경로 유지')
    assert.ok(doc.querySelector('.featured-track .library-recommendation-label'))
    assert.notEqual(doc.querySelector('.featured-track').dataset.featuredTrackId, 'chopin-ballade-op52-no4', '보관곡 자체는 취향 추천에서 제외')
    await chooseLevel(0)
    assert.equal(button('평안한').getAttribute('aria-pressed'), 'true')
    await chooseLevel(1)
    assert.equal(button('내 취향').getAttribute('aria-pressed'), 'true', '탐색 모드 왕복에도 숙련자 추천 방식 유지')
    await click(button('검색 음악'))
    assert.equal(doc.querySelector('.featured-track').dataset.featuredTrackId, 'chopin-ballade-op52-no4', '검색 음악으로 돌아오면 기준곡 복원')
    await click(doc.querySelector('.reference-save'))
    await click(doc.querySelector('.featured-track .track-card-top button'))
    assert.equal(button('내 취향').disabled, true, '마지막 보관곡 해제 시 취향 상태 정리')
    await click(doc.querySelector('.reference-save'))
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
