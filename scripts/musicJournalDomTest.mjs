import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'

export async function verifyMusicJournal(MusicJournal) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
  const original = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true, writable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const doc = dom.window.document
  const button = (label) => [...doc.querySelectorAll('button')].find((element) => element.textContent.trim() === label)
  const flush = async (action) => React.act(async () => { action?.(); await new Promise((resolve) => setTimeout(resolve, 0)) })
  const rows = Array.from({ length: 11 }, (_, i) => ({ id: `id-${i}`, track_id: 'track-a', kind: 'practice', body: `비공개 기록 ${i}`, recorded_on: '2026-11-02', revision: 1 }))
  let requests = 0, writes = 0, fail = false, pending, hold = false, root
  const client = {
    from() {
      requests += 1
      const filters = {}
      const query = {
        select() { return query }, eq(key, value) { filters[key] = value; return query }, order() { return query },
        async range(start, end) {
          if (hold) return new Promise((resolve) => { pending = resolve })
          return filters.user_id === 'user-a' && filters.track_id === 'track-a' ? { data: rows.slice(start, end + 1), count: rows.length } : { data: [], count: 0 }
        },
      }
      return query
    },
    async rpc(name, args) {
      if (name === 'list_my_music_shares') return { data: [] }
      writes += 1
      if (fail) return { error: { code: 'NETWORK' } }
      if (name === 'delete_private_music_record') { rows.splice(rows.findIndex((row) => row.id === args.p_id), 1); return { data: true } }
      const row = { id: args.p_id, track_id: args.p_track_id, kind: args.p_kind, body: args.p_body, recorded_on: args.p_recorded_on, revision: args.p_revision + 1 }
      const index = rows.findIndex(({ id }) => id === row.id)
      if (index < 0) rows.unshift(row); else rows[index] = row
      return { data: [row] }
    },
  }
  const render = (user = 'user-a', trackId = 'track-a') => root.render(React.createElement(MusicJournal, { auth: { user: user ? { id: user } : null }, trackId, client }))
  try {
    const { createRoot } = await import('react-dom/client')
    root = createRoot(doc.getElementById('root'))
    await flush(() => render(null))
    assert.equal(requests, 0)
    assert.ok(doc.body.textContent.includes('Google로 로그인'))
    await flush(() => render())
    assert.equal(doc.querySelectorAll('.music-journal-entry').length, 10)
    await flush(() => button('기록 더 보기').click())
    assert.equal(doc.querySelectorAll('.music-journal-entry').length, 11)
    await flush(() => button('수정').click())
    assert.equal(doc.querySelector('textarea').value, '비공개 기록 0')
    fail = true
    const submit = () => doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await flush(submit)
    assert.equal(doc.querySelector('textarea').value, '비공개 기록 0', 'failed save retains draft')
    assert.ok(doc.querySelector('[role="alert"]'))
    fail = false
    await flush(submit)
    assert.ok(doc.body.textContent.includes('비공개 기록을 저장했어요'))
    assert.equal(rows[0].revision, 2)
    await flush(() => button('삭제').click())
    const before = writes
    await flush(() => button('취소').click())
    assert.equal(writes, before, 'delete is not sent before confirmation')
    await flush(() => button('삭제').click())
    await flush(() => button('영구 삭제').click())
    assert.equal(rows.length, 10)
    await flush(() => button('기록 남기기').click())
    await flush(submit)
    assert.ok(doc.body.textContent.includes('기록 내용을 입력'))
    await flush(() => {
      const textarea = doc.querySelector('textarea')
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, '<script>private</script> 오늘의 생각')
      textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      textarea.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    await flush(submit)
    assert.ok(rows.some(({ body }) => body.includes('오늘의 생각')), 'new typed record is saved')
    assert.equal(doc.querySelector('.music-journal-entry script'), null, 'record text is escaped, never HTML')
    await flush(() => render('user-b'))
    assert.equal(doc.querySelector('textarea'), null)
    assert.ok(!doc.body.textContent.includes('비공개 기록 1'))
    hold = true
    await flush(() => render('user-a', 'track-b'))
    await flush(() => render(null))
    await flush(() => pending({ data: rows, count: rows.length }))
    assert.ok(!doc.body.textContent.includes('비공개 기록 1'), 'late response after logout stays hidden')
    assert.equal(dom.window.localStorage.length, 0, 'journal never writes to localStorage')
  } finally {
    if (root) await flush(() => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
}
