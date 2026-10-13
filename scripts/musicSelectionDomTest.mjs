import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { feelingOptions, getSuggestedEmotions } from '../src/data/feelingSuggestions.js'
import { tracks } from '../src/data/musicData.js'
import { getRecommendationResult, getFeelingRecommendationCandidates } from '../src/data/recommendations.js'

export async function verifyMusicSelectionInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const originalRandom = Math.random
  let root
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.fetch = async () => { throw new Error('Music selection must not request concert data') }
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 10)) })
  const button = (label) => [...dom.window.document.querySelectorAll('button')].find((node) => node.textContent.trim() === label)
  const pressed = (label) => button(label).getAttribute('aria-pressed') === 'true'
  const featured = () => {
    const title = dom.window.document.querySelector('.featured-track h2')?.cloneNode(true)
    title?.querySelector('.track-alias')?.remove()
    return title?.textContent
  }
  const click = async (label, draw = 0) => {
    Math.random = () => draw
    try { await flush(() => button(label).click()) } finally { Math.random = originalRandom }
  }
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))

    for (const { label } of emotions) {
      await click(label)
      assert.equal(pressed(label), true)
      assert.ok(featured())
      await click(label)
      assert.equal(pressed(label), false, `${label}: 두 번째 탭으로 선택 해제`)
      assert.equal(featured(), undefined)
    }
    for (const label of ['감동적인', '평안한', '부드러운']) await click(label)
    assert.equal(button('힘찬').disabled, true, '최대 세 느낌 선택')
    await click('감동적인')
    assert.equal(button('힘찬').disabled, false, '세 개 선택 후에도 선택된 느낌은 해제 가능')
    assert.equal(pressed('평안한'), true)
    assert.equal(pressed('부드러운'), true)
    await click('선택 초기화')
    assert.equal(pressed('느낌으로 시작하기'), true)
    assert.ok(emotions.every(({ label }) => !pressed(label)))

    await click('감동적인')
    await click('기분에서 시작하기')
    await click('차분한')
    await click('선택 초기화')
    assert.equal(pressed('기분에서 시작하기'), true, '기분 탭을 유지하며 초기화')
    assert.ok(feelingOptions.every((label) => !pressed(label)))
    assert.equal(featured(), undefined)
    await click('느낌으로 시작하기')
    assert.equal(pressed('감동적인'), true, '기분 초기화는 느낌 선택에 영향을 주지 않음')
    await click('기분에서 시작하기')
    await click('울적한')
    await click('느낌으로 시작하기')
    await click('선택 초기화')
    await click('기분에서 시작하기')
    assert.equal(pressed('울적한'), true, '느낌 초기화는 기분 선택에 영향을 주지 않음')
    await click('선택 초기화')

    await flush(() => root.unmount())
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    await click('기분에서 시작하기')
    for (const feeling of feelingOptions) {
      const keys = getSuggestedEmotions(feeling)
      const result = getRecommendationResult(tracks, keys)
      const candidates = getFeelingRecommendationCandidates(result, keys)
      await click(feeling, 0)
      assert.equal(pressed(feeling), true)
      assert.equal(featured(), formatTrackTitle(candidates[0]), `${feeling}: 기분별 후보에서 추첨`)
      const related = dom.window.document.querySelector('.similar-section .mini-track')
      if (related) await flush(() => related.click())
      const previous = featured()
      await click(feeling)
      assert.equal(pressed(feeling), false)
      assert.equal(featured(), undefined, '해제 시 이전 추천도 제거')
      await click(feeling, 0.999999)
      const available = candidates.filter((track) => formatTrackTitle(track) !== previous)
      assert.equal(featured(), formatTrackTitle(available.at(-1)), `${feeling}: 직전 표시곡 제외 및 수동 선택 해제`)
      const reselected = featured()
      await click(feeling)
      await click(feeling, 0.999999)
      assert.notEqual(featured(), reselected, `${feeling}: 같은 난수여도 직전 추천곡 제외`)
      assert.ok(candidates.some((track) => formatTrackTitle(track) === featured()))
      const stable = featured()
      await flush(() => dom.window.document.querySelector('.featured-track .track-card-top button').click())
      assert.equal(featured(), stable, '보관 상태 변경은 기분 대표곡을 재추첨하지 않음')
      await click('선택 초기화')
      assert.equal(pressed('기분에서 시작하기'), true)
      await click(feeling, 0.999999)
      assert.notEqual(featured(), stable, '초기화 후 재선택에도 직전 추천 기억')
      await click('선택 초기화')
    }
  } finally {
    Math.random = originalRandom
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
