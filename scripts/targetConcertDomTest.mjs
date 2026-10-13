import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { getTrackTarget } from '../src/data/workCatalog.js'

// 합성 API 응답을 사용한 React 이벤트·요청 수·취소 검증. 실제 OCR 검증과 분리합니다.
export async function verifyTargetConcertInteractions(App) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = (callback) => dom.window.setTimeout(callback, 0)
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const songId = 'chopin-ballade-op23-no1', emperorId = 'beethoven-piano-concerto-op73-no5-m2'
  dom.window.localStorage.setItem('classic-atlas-music-data-version', 'manual-catalog-5')
  dom.window.localStorage.setItem('classic-atlas-track-reactions-v1', JSON.stringify({ [songId]: { listenAgain: true }, [emperorId]: { listenAgain: true } }))
  let listCalls = 0, detailCalls = 0, root, candidates = [], hold = true, release, lastSignal
  const batches = [], cache = new Map()
  const makeResult = (candidate) => {
    const index = Number(candidate.kopisId.slice(2)) - 999100
    const status = index === 2 ? 'not-found' : [3, 10].includes(index) ? 'no-material' : [4, 8].includes(index) ? 'needs-review' : index === 5 ? 'failed' : 'matched'
    return { kopisId: candidate.kopisId, concert: { ...candidate, programStatus: status === 'matched' ? 'verified' : 'needs-review', programVerification: 'ocr', programWorkIds: status === 'matched' ? [songId] : [],
      targetMatch: { targetTrackId: songId, status, attempted: true, completed: status !== 'failed', retryable: status === 'failed', reason: '합성 테스트 프로그램 근거', evidence: 'F. Chopin Ballade No.1 Op.23', evidenceSourceUrl: 'https://kopis.or.kr/upload/test.png' } } }
  }
  globalThis.fetch = async (value, options) => {
    const url = new URL(value, 'http://localhost'), json = (body) => ({ ok: true, json: async () => body })
    if (url.pathname.endsWith('/status')) return json({ configured: true, cacheTtlMs: 21600000, initialCheckLimit: 10, moreCheckLimit: 10, programBatchSize: 2 })
    if (url.pathname.endsWith('/match-batch')) {
      const body = JSON.parse(options.body)
      const response = (results) => json({ targetTrackId: body.targetTrackId, target: getTrackTarget(body.targetTrackId), results })
      if (body.cacheOnly) return response(body.kopisIds.map((id) => cache.get(id)).filter(Boolean))
      batches.push(body); lastSignal = options.signal
      const results = body.kopisIds.map((id) => makeResult(candidates.find(({ kopisId }) => kopisId === id)))
      const finish = () => { results.forEach((record) => cache.set(record.kopisId, record)); return response(results) }
      if (hold) { hold = false; return new Promise((resolve) => { release = () => resolve(finish()) }) }
      return finish()
    }
    if (url.pathname.endsWith('/program')) { detailCalls += 1; throw new Error('검색 중 상세 방문 없이 표시해야 합니다') }
    listCalls += 1
    assert.equal(url.searchParams.get('targetTrackId'), songId)
    const query = { region: url.searchParams.get('region'), from: url.searchParams.get('from'), to: url.searchParams.get('to') }
    candidates = Array.from({ length: 13 }, (_, index) => ({ id: `kopis-PF${999100 + index}`, kopisId: `PF${999100 + index}`, title: `검색 후보 ${index + 1}`, dateFrom: query.to, dateTo: query.to, venue: '테스트홀', region: '서울',
      programStatus: 'unavailable', programWorkIds: [], sourceLabel: 'KOPIS 공연 정보', sourceUrl: 'https://kopis.or.kr/', fetchedAt: new Date().toISOString() }))
    cache.set(candidates[0].kopisId, makeResult(candidates[0]))
    const stale = makeResult(candidates[1])
    cache.set(candidates[1].kopisId, { ...stale, fromCache: true, concert: { ...stale.concert, dateFrom: '2000-01-01', dateTo: '2000-01-01' } })
    return json({ query, concerts: [...candidates, candidates[0]], fetchedAt: new Date().toISOString(), cacheTtlMs: 21600000 })
  }
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 30)) })
  const find = (text) => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
  const click = async (text) => { const button = find(text); assert.ok(button, text); await flush(() => button.click()) }
  const main = () => dom.window.document.querySelector('.concert-search-results')
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(dom.window.document.getElementById('root'))
    await flush(() => root.render(React.createElement(App)))
    await click('보관함'); await click('이 곡의 공연 찾기')
    assert.equal(dom.window.document.querySelector('.concert-target').dataset.targetTrackId, songId)
    const submit = () => dom.window.document.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await flush(submit)
    assert.equal(listCalls, 1)
    assert.equal(batches.length, 1)
    assert.equal(batches[0].targetTrackId, songId)
    assert.equal(batches[0].kopisIds.length, 2)
    assert.equal(batches[0].refresh, true, '목록과 날짜가 다른 저장 상세는 새로 조회')
    assert.equal(main().querySelectorAll('.concert-card').length, 1, '캐시된 일치 결과를 처리 전에 먼저 표시')
    assert.ok(main().textContent.includes('일치 공연 1개 발견 · 다른 후보 확인 중'))
    assert.ok(main().querySelector('[data-match-status="processing"]'))
    await flush(submit)
    assert.equal(batches.length, 1, '동일 검색을 중복 실행하지 않음')
    await flush(release)
    assert.equal(batches.length, 5)
    assert.equal(new Set(batches.flatMap(({ kopisIds }) => kopisIds)).size, 10)
    for (const status of ['pending', 'no-material', 'needs-review', 'not-found', 'failed']) assert.ok(main().querySelector(`[data-match-status="${status}"]`), status)
    assert.ok(main().textContent.includes('전체 검색 완료는 아니'))
    assert.ok(!dom.window.document.body.textContent.includes('직접 등록한 공연'), '곡 검색에 별도 등록 공연을 표시하지 않음')
    assert.equal([...main().querySelectorAll('.concert-status-counts dd')].reduce((sum, node) => sum + parseInt(node.textContent), 0), 13)
    assert.equal(detailCalls, 0)
    assert.ok(!dom.window.document.body.textContent.includes('선택한 감정 기반'))
    assert.equal(batches.length, 5); assert.equal(listCalls, 1)
    hold = true
    await click('더 찾아보기')
    assert.deepEqual(batches.at(-1).kopisIds, ['PF999111', 'PF999112'])
    await click('중단')
    assert.equal(lastSignal.aborted, true)
    const priorCount = main().querySelectorAll('.concert-card').length
    await flush(release)
    assert.equal(main().querySelectorAll('.concert-card').length, priorCount, '중단 후 늦은 응답 무시')
    await click('더 찾아보기')
    assert.ok(main().querySelectorAll('.concert-card').length > priorCount)
    assert.ok(!main().querySelector('[data-match-status="pending"]'))
    await flush(submit)
    assert.equal(listCalls, 1, '같은 지역·기간 목록 캐시 재사용')
    await flush(() => dom.window.document.querySelector('.concert-location-control').click())
    await flush(() => [...dom.window.document.querySelectorAll('.region-choice-list button')].find((button) => button.textContent === '부산').click())
    assert.ok(!main(), '지역 변경 시 이전 결과 제거')
    const input = dom.window.document.querySelector('.concert-period input')
    await flush(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, '2099-01-01')
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    assert.ok(!main(), '기간 변경 시 이전 결과 제거')
    await click('보관함')
    const emperorCard = [...dom.window.document.querySelectorAll('.saved-track-card')].find((node) => node.textContent.includes('황제'))
    await flush(() => emperorCard.querySelector('.saved-track-concert').click())
    assert.equal(dom.window.document.querySelector('.concert-target').dataset.targetTrackId, emperorId)
    assert.ok(!main(), '곡 변경 후 이전 결과와 섞이지 않음')
    await click('곡 변경')
    assert.ok(dom.window.document.querySelector('.concert-track-picker'))
    assert.ok(!dom.window.document.querySelector('.concert-search-panel'))
    assert.ok(!main())
    const savedEmperor = dom.window.document.querySelector(`.concert-track-options [data-track-id="${emperorId}"]`)
    assert.ok(savedEmperor, '공연 화면에서도 보관한 곡 선택')
    await flush(() => savedEmperor.click())
    assert.equal(dom.window.document.querySelector('.concert-target').dataset.targetTrackId, emperorId)
    assert.equal(listCalls, 1, '곡 변경·선택만으로 자동 재검색하지 않음')
  } finally {
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
