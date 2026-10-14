import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { STORAGE_KEY } from '../src/data/storage.js'

export async function verifyWeeklySelectionInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const originalNow = Date.now
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  Date.now = () => Date.parse('2026-10-14T03:00:00Z')
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false }) })
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 30)) })
  const click = async (selector) => { const button = dom.window.document.querySelector(selector); assert.ok(button, selector); await flush(() => button.click()) }
  const songId = 'chopin-etude-op25-no1'
  let root
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    const feature = () => dom.window.document.querySelector('.weekly-feature')
    assert.ok(feature().textContent.includes('익숙한 쇼팽에서 한 걸음 더'))
    assert.equal(feature().querySelector('button, a'), null, '소개 버튼 안에 클릭 영역을 중첩하지 않음')
    await click('.keyword-choice-list button')
    assert.ok(feature().textContent.includes('익숙한 쇼팽에서 한 걸음 더'), '감정 선택과 무관한 운영자 선정')
    await click('.weekly-feature')
    assert.equal(dom.window.document.activeElement.tagName, 'H1')
    assert.equal(dom.window.document.querySelector('iframe'), null, '미리듣기 열기 전에는 영상도 로드하지 않음')
    await click('.weekly-preview-button')
    const src = new URL(dom.window.document.querySelector('.weekly-video iframe').src)
    assert.equal(src.searchParams.get('autoplay'), '0')
    assert.equal(src.searchParams.get('start'), '0')
    assert.equal(src.searchParams.get('end'), '130')
    await click('.weekly-actions .library-save-button')
    assert.equal(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY))[songId].listenAgain, true)
    await click('.weekly-detail-button')
    assert.equal(dom.window.document.querySelector('.weekly-video'), null, '상세로 이동할 때 영상 정지')
    assert.ok(dom.window.document.querySelector('#track-detail-title').textContent.includes('에올리안 하프'))
    assert.equal(dom.window.document.querySelector('.track-detail-sheet .library-save-button').getAttribute('aria-pressed'), 'true')
    await click('.track-detail-sheet .library-save-button')
    assert.equal(dom.window.document.querySelector('.weekly-actions .library-save-button').getAttribute('aria-pressed'), 'false')
    await click('.track-detail-close')
    await click('.weekly-actions .library-save-button')
    await click('.bottom-nav button:nth-child(3)')
    assert.equal(dom.window.document.querySelectorAll('.saved-track-card').length, 1)
    assert.ok(dom.window.document.querySelector('.saved-track-card').textContent.includes('에올리안 하프'))
    await click('.saved-track-remove')
    assert.equal(dom.window.document.querySelectorAll('.saved-track-card').length, 0)
    await click('.bottom-nav button:first-child')
    await click('.weekly-feature')
    assert.equal(dom.window.document.querySelector('.weekly-actions .library-save-button').getAttribute('aria-pressed'), 'false')
    await click('.weekly-back'); await click('.weekly-footer .weekly-link')
    assert.ok(dom.window.document.querySelector('.weekly-empty'))
    await click('.weekly-back')
    Date.now = () => Date.parse('2026-11-01T03:00:00Z')
    await flush(() => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(dom.window.document.querySelector('.weekly-section'), null)
    await click('.weekly-archive-entry button')
    assert.equal(dom.window.document.querySelectorAll('.weekly-archive-list li').length, 1)
    await click('.weekly-feature')
    assert.ok(dom.window.document.querySelector('.weekly-story-part').textContent.includes('천사들의 하프소리'))
    await click('.weekly-back')
    assert.ok(dom.window.document.querySelector('.weekly-archive-list'))
    await click('.weekly-back')
    Date.now = () => Date.parse('2026-10-13T03:00:00Z')
    await flush(() => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')))
    assert.equal(dom.window.document.querySelector('.weekly-section'), null)
    assert.ok(dom.window.document.querySelector('.mood-section'))
    await click('.keyword-choice-list button')
    assert.ok(dom.window.document.querySelector('.track-section'))
  } finally {
    if (root) await flush(() => root.unmount())
    Date.now = originalNow
    dom.window.close()
    for (const name of names) { const descriptor = original.get(name); if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
