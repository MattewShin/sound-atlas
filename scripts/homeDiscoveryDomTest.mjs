import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { DISCOVERY_SESSION_KEY } from '../src/data/homeDiscovery.js'
import { tracks } from '../src/data/musicData.js'
import { getRecommendationResult } from '../src/data/recommendations.js'
import { formatTrackTitle } from '../src/data/emotions.js'

export async function verifyHomeDiscoveryInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const originalRandom = Math.random, originalNow = Date.now
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false }) })
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  Math.random = () => 0.25
  Date.now = () => Date.parse('2026-10-14T03:00:00Z')
  const doc = dom.window.document
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 30)) })
  const click = async (selector) => { const node = doc.querySelector(selector); assert.ok(node, selector); await flush(() => node.click()) }
  const ids = () => [...doc.querySelectorAll('.starter-carousel .mini-track')].map((node) => node.dataset.trackId)
  const revision = () => Number(doc.querySelector('.starter-carousel').dataset.discoveryRevision)
  const render = (loggedIn = false) => root.render(React.createElement(React.StrictMode, null, React.createElement(App, { isLoggedIn: loggedIn })))
  const assertChanged = (before) => { assert.equal(ids().length, 4); assert.ok(ids().every((id) => !before.includes(id))); assert.equal(new Set(ids()).size, 4) }
  let root
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(doc.getElementById('root'))
    await flush(() => render())
    const initial = ids()
    assert.equal(initial.length, 4)
    assert.equal(revision(), 1, 'StrictMode에서도 최초 구성 하나만 확정')
    assert.equal(new Set(initial.map((id) => tracks.find((track) => track.id === id).composer)).size, 4)
    const weekly = doc.querySelector('.weekly-section')
    assert.equal(weekly.querySelector('.section-heading p').textContent, 'EDITOR’S PICK')
    assert.equal(weekly.querySelector('.section-heading h2').textContent, '이번 주의 한 곡')
    assert.ok(!weekly.querySelector('.weekly-feature').textContent.includes('이번 주의 한 곡'))
    assert.ok(weekly.querySelector('.section-heading').compareDocumentPosition(weekly.querySelector('.weekly-feature')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
    const weeklyTitle = weekly.querySelector('.weekly-title').textContent
    await flush(() => render())
    assert.deepEqual(ids(), initial)
    const carousel = doc.querySelector('.starter-carousel')
    carousel.scrollLeft = 120
    await flush(() => carousel.dispatchEvent(new dom.window.Event('scroll')))
    assert.deepEqual(ids(), initial)
    await click('.starter-carousel .mini-track')
    await click('.track-detail-sheet .library-save-button')
    assert.deepEqual(ids(), initial, '보관하기는 카드를 교체하지 않음')
    await click('.track-detail-sheet .library-save-button')
    assert.deepEqual(ids(), initial, '해제도 카드 유지')
    await click('.track-detail-sheet .highlight-short-cta button')
    assert.deepEqual(ids(), initial)
    await click('.highlight-short-top button')
    await click('.track-detail-close')
    assert.deepEqual(ids(), initial, '영상·상세 모달 닫기는 홈 진입이 아님')
    assert.equal(doc.querySelector('.starter-carousel').scrollLeft, 120)
    await click('.bottom-nav button:nth-child(3)')
    await click('.bottom-nav button:first-child')
    assertChanged(initial)
    assert.equal(revision(), 2)
    assert.equal(doc.querySelector('.starter-carousel').scrollLeft, 0)
    const reentered = ids()
    await click('.bottom-nav button:first-child')
    assert.deepEqual(ids(), reentered, '이미 홈인 상태에서 탐색 버튼은 재진입 아님')
    await flush(() => render(true))
    assertChanged(reentered)
    assert.equal(revision(), 3, '로그인 전환에 한 번만 교체')
    const loggedIn = ids()
    await flush(() => render(true))
    assert.deepEqual(ids(), loggedIn)
    await click('.bottom-nav button:nth-child(3)')
    await flush(() => render(false))
    await flush(() => { doc.querySelector('.bottom-nav button:first-child').click(); render(true) })
    assertChanged(loggedIn)
    assert.equal(revision(), 4, '로그인과 홈 진입이 동시에 발생해도 한 번만 교체')
    await click('.keyword-choice-list button')
    assert.equal(doc.querySelector('.starter-carousel'), null)
    const ranked = getRecommendationResult(tracks, ['wonder'])
    const featured = doc.querySelector('.featured-track h2').textContent
    assert.ok(ranked.topScoreTracks.some((track) => featured.startsWith(formatTrackTitle(track))), '기존 감정 최고 적합도 유지')
    await click('.featured-track .track-card-top button')
    const taste = [...doc.querySelectorAll('.recommendation-mode-control button')].find((node) => node.textContent === '내 취향')
    await flush(() => taste.click())
    assert.equal(doc.querySelector('.starter-carousel'), null)
    assert.ok(doc.querySelector('.library-recommendation-label'), '취향 모드에서 초기 탐색 카드가 남지 않음')
    const keyword = [...doc.querySelectorAll('.recommendation-mode-control button')].find((node) => node.textContent === '음악 키워드')
    await flush(() => keyword.click())
    const reset = [...doc.querySelectorAll('button')].find((node) => node.textContent === '선택 초기화')
    await flush(() => reset.click())
    assert.equal(ids().length, 4)
    assert.equal(doc.querySelector('.weekly-title').textContent, weeklyTitle)
    const beforeReload = ids()
    assert.deepEqual(JSON.parse(dom.window.sessionStorage.getItem(DISCOVERY_SESSION_KEY)), beforeReload)
    await flush(() => root.unmount())
    root = createRoot(doc.getElementById('root'))
    await flush(() => render(true))
    assertChanged(beforeReload)
    Date.now = () => Date.parse('2026-10-13T03:00:00Z')
    await flush(() => doc.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(doc.querySelector('.weekly-section'), null, '비노출 기간은 제목도 숨김')
  } finally {
    if (root) await flush(() => root.unmount())
    Math.random = originalRandom; Date.now = originalNow
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
