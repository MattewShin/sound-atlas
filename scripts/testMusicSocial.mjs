import '../server/musicSocialSql.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import React from 'react'
import { JSDOM } from 'jsdom'
import { tracks } from '../src/data/musicData.js'
import { createEphemeralAuthStorage, createInvalidationSubscriber, relativeTime, exactTime, socialRoute } from '../src/data/socialClient.js'

test('social sessions never persist tokens or content; only one-time OAuth verifier persists', () => {
  const disk = new Map(), redirect = { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v), removeItem: k => disk.delete(k) }
  const first = createEphemeralAuthStorage(redirect)
  first.setItem('sb-fixture-auth-token', 'PRIVATE TOKEN'); first.setItem('sb-fixture-auth-token-code-verifier', 'ONE TIME')
  assert.equal(first.getItem('sb-fixture-auth-token'), 'PRIVATE TOKEN'); assert.equal(disk.size, 1)
  const reload = createEphemeralAuthStorage(redirect)
  assert.equal(reload.getItem('sb-fixture-auth-token'), null); assert.equal(reload.getItem('sb-fixture-auth-token-code-verifier'), 'ONE TIME')
  reload.removeItem('sb-fixture-auth-token-code-verifier'); assert.equal(disk.size, 0)
  const tabA = createEphemeralAuthStorage(redirect, 'runtime-a'), tabB = createEphemeralAuthStorage(redirect, 'runtime-b')
  tabA.setItem('runtime-a', 'TOKEN A'); tabA.setItem('runtime-a-code-verifier', 'REDIRECT SECRET')
  assert.equal(tabB.getItem('runtime-b'), null, 'a different tab cannot borrow another identity')
  assert.equal(tabB.getItem('runtime-b-code-verifier'), 'REDIRECT SECRET', 'same-tab OAuth redirect can restore its verifier')
  tabB.removeItem('runtime-b-code-verifier'); assert.equal(disk.size, 0)
  assert.equal(relativeTime('2026-11-06T00:00:00Z', Date.parse('2026-11-06T00:10:00Z')), '10분 전')
  assert.match(exactTime('2026-11-06T00:00:00Z'), /9:00:00.*KST/)
  assert.deepEqual(socialRoute('#music/post/fixture'), { post: 'fixture' }); assert.deepEqual(socialRoute('#music/track/%E0'), {})
})

test('realtime channel replacement waits for teardown and ignores old account callbacks', async () => {
  let channel, removals = 0, oldStatus, finishRemoval, activeStatus = '', invalidations = 0
  const db = { channel() {
    assert.equal(channel, undefined, 'must not reuse a channel still being removed')
    channel = { on() { return this }, subscribe(status) { oldStatus = status; status('SUBSCRIBED'); return this } }
    return channel
  }, removeChannel: async () => { removals++; await new Promise(resolve => { finishRemoval = () => { channel = undefined; resolve() } }) } }
  const subscribe = createInvalidationSubscriber(db)
  const stopA = subscribe(() => { invalidations++ }, () => {})
  await new Promise(resolve => setTimeout(resolve, 0)); const notifyA = oldStatus
  stopA(); const stopB = subscribe(() => { invalidations++ }, status => { activeStatus = status })
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(activeStatus, ''); assert.equal(removals, 1)
  notifyA('CLOSED'); finishRemoval(); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(activeStatus, 'SUBSCRIBED'); assert.equal(invalidations, 0)
  stopB(); await new Promise(resolve => setTimeout(resolve, 0)); finishRemoval()
})

const compiled = new URL('../.cache/music-social-test.mjs', import.meta.url)
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true })
const output = await build({ entryPoints: ['src/components/MusicSocial.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false })
await writeFile(compiled, output.outputFiles[0].text)
let MusicSocial
try { MusicSocial = (await import(compiled.href)).default } finally { await unlink(compiled) }

test('social DOM: retries, duplicate clicks, drafts, counts, scoped links, realtime invalidation and account switch', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://atlas.example/#music', pretendToBeVisual: true })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'location', 'IS_REACT_ACT_ENVIRONMENT']
  const before = new Map(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const k of names) Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k], configurable: true, writable: true })
  const doc = dom.window.document
  let root, invalidate, status, likeCalls = 0, failComment = true, rejectLike, resolveLike, delayedFeed
  const A = 'author', B = 'viewer', C = 'other'
  const profile = { id: A, handle: 'piano_author', nickname: '공개 별명', avatar_url: null, follower_count: 1, following_count: 0, following: true }
  let viewer = B, following = true, blocked = false, scope = 'followers', comments = [], count = 0, liked = false
  const post = () => ({ id: 'post-one', author_id: A, track_id: tracks[0].id, source_record_id: 'source-one', body: '첫 줄\n' + '긴 음악 이야기 '.repeat(80), visibility: scope, created_at: '2026-11-06T00:00:00Z', profile, like_count: count, comment_count: comments.length, liked })
  const accessible = () => !blocked && (viewer === A || scope === 'public' || (scope === 'followers' && viewer === B && following))
  const client = {
    feed: async filter => { if (delayedFeed) return delayedFeed; return accessible() && (!filter.post || filter.post === 'post-one') ? [post()] : [] },
    profile: async id => id === A ? { ...profile, following, follower_count: following ? 1 : 0 } : { ...profile, id, handle: id === B ? 'piano_viewer' : 'piano_other' },
    records: async () => [], blocks: async () => [],
    subscribe: (onInvalidate, onStatus) => { invalidate = onInvalidate; status = onStatus; onStatus('SUBSCRIBED'); return () => {} },
    comments: async () => structuredClone(comments),
    comment: async (_id, body, id) => { if (failComment) throw new Error('댓글 전송 실패'); if (!comments.some(c => c.id === id)) comments.push({ id, body, author_id: viewer, profile: { handle: 'piano_viewer' }, created_at: new Date().toISOString() }) },
    deleteComment: async id => { comments = comments.filter(c => c.id !== id) },
    like: async () => { likeCalls++; await new Promise((resolve, reject) => { resolveLike = () => { liked = !liked; count = liked ? 1 : 0; resolve() }; rejectLike = () => reject(new Error('좋아요 실패')) }) },
    follow: async (_id, desired) => { following = desired }, block: async () => { blocked = true; following = false },
  }
  const auth = () => ({ client, session: viewer ? { user: { id: viewer } } : null, logout: async () => {}, login: async () => {} })
  const flush = async action => React.act(async () => { action?.(); await new Promise(r => setTimeout(r, 25)) })
  const button = label => [...doc.querySelectorAll('button')].find(e => e.textContent.trim() === label)
  const click = async label => { const b = button(label); assert.ok(b, label); await flush(() => b.click()) }
  const render = () => root.render(React.createElement(MusicSocial, { key: viewer ?? 'anon', auth: auth() }))
  const input = async (el, value) => flush(() => { const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
  try {
    const { createRoot } = await import('react-dom/client'); root = createRoot(doc.getElementById('root'))
    await flush(render)
    assert.match(doc.querySelector('.social-feed').textContent, /@piano_author/)
    assert.equal(doc.querySelector('.social-avatar').tagName, 'SPAN'); assert.ok(doc.querySelector('time').title.includes('KST'))
    assert.ok(button('더 보기')); await click('더 보기'); assert.match(doc.querySelector('.social-post-copy').textContent, /첫 줄\n/)
    await flush(() => doc.querySelector('[aria-label="댓글 0개"]').click())
    await input(doc.querySelector('.social-comments textarea'), '전송 실패해도 남는 초안')
    await flush(() => doc.querySelector('.social-comments form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(doc.querySelector('.social-comments textarea').value, '전송 실패해도 남는 초안'); assert.match(doc.querySelector('[role=alert]').textContent, /댓글 전송 실패/)
    failComment = false
    await flush(() => doc.querySelector('.social-comments form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(doc.querySelector('.social-comments textarea').value, ''); assert.ok(doc.querySelector('[aria-label="댓글 1개"]'))
    await click('댓글 삭제'); assert.ok(doc.querySelector('[aria-label="댓글 0개"]'))
    const heart = () => doc.querySelector('[aria-label^="좋아요"]')
    await flush(() => { heart().click(); heart().click() }); assert.equal(likeCalls, 1)
    await flush(rejectLike); assert.equal(heart().getAttribute('aria-pressed'), 'false'); assert.equal(heart().textContent, '0')
    await flush(() => heart().click()); await flush(resolveLike)
    assert.equal(heart().getAttribute('aria-pressed'), 'true'); assert.equal(heart().textContent, '1')
    await flush(() => doc.querySelector('.social-person').click()); assert.match(doc.querySelector('.social-profile').textContent, /팔로워 1/)
    await click('팔로우 취소'); assert.equal(doc.querySelector('.social-post'), null)
    await flush(() => { location.hash = 'music/post/post-one' }); assert.match(doc.body.textContent, /게시물을 볼 수 없어요/)
    await click('개인 원본'); assert.ok(button('새 음악 기록'), 'direct link can return to private originals without a stale hash load')
    await click('피드')
    await flush(() => { location.hash = 'music/post/post-one' })
    scope = 'public'; await flush(invalidate); assert.ok(doc.querySelector('.social-post'))
    // A stale response started before a permission change must never restore content.
    let finishOld; delayedFeed = new Promise(resolve => { finishOld = resolve })
    await flush(invalidate); assert.equal(doc.querySelector('.social-post'), null)
    delayedFeed = null; scope = 'private'; await flush(invalidate)
    await flush(() => finishOld([post()])); assert.equal(doc.querySelector('.social-post'), null)
    scope = 'public'; await flush(invalidate); assert.ok(doc.querySelector('.social-post'))
    await flush(() => status('CHANNEL_ERROR')); assert.equal(doc.querySelector('.social-post'), null)
    await flush(() => status('SUBSCRIBED')); assert.ok(doc.querySelector('.social-post'))
    await flush(() => { scope = 'followers'; following = true; viewer = null; render() }); assert.equal(doc.querySelector('.social-post'), null)
    await flush(() => { viewer = C; render() }); assert.equal(doc.querySelector('.social-post'), null)
    await flush(() => { viewer = B; render() }); assert.ok(doc.querySelector('.social-post'))
    await click('사용자 차단'); await click('확인'); assert.equal(doc.querySelector('.social-post'), null)
    assert.equal(dom.window.localStorage.length, 0); assert.equal(dom.window.sessionStorage.length, 0)
  } finally {
    if (root) await React.act(async () => root.unmount())
    dom.window.close()
    for (const [k, descriptor] of before) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})

test('social DOM: explicit public profile, private default, share confirmation, independent edits and cancellation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://atlas.example/#music', pretendToBeVisual: true })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'location', 'IS_REACT_ACT_ENVIRONMENT']
  const before = new Map(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const k of names) Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k], configurable: true, writable: true })
  let root, profile = null, failProfile = true, records = [], posts = [], creates = 0, copies = 0
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => { copies++ } }, configurable: true })
  const client = {
    subscribe: (_event, status) => { status('SUBSCRIBED'); return () => {} },
    profile: async () => profile, feed: async () => posts.map(p => ({ ...p, profile, like_count: 0, comment_count: 0, liked: false })), records: async () => structuredClone(records), blocks: async () => [],
    saveProfile: async (id, values) => { if (failProfile) throw new Error('이미 사용 중인 아이디예요.'); profile = { ...values, id } },
    createRecord: async (r, scope, postId) => { creates++; records.push({ ...r, created_at: new Date().toISOString() }); if (scope !== 'private') posts.push({ ...r, id: postId, source_record_id: r.id, author_id: 'author', visibility: scope, created_at: new Date().toISOString() }) },
    saveRecord: async r => { records = records.map(old => old.id === r.id ? { ...old, body: r.body } : old) },
    share: async p => { posts.push({ ...p, author_id: 'author', created_at: new Date().toISOString() }) },
    editPost: async (id, values) => { posts = posts.map(p => p.id === id ? { ...p, ...values } : p) },
    unshare: async id => { posts = posts.filter(p => p.id !== id) },
  }
  const doc = dom.window.document
  const flush = async action => React.act(async () => { action?.(); await new Promise(r => setTimeout(r, 25)) })
  const button = label => [...doc.querySelectorAll('button')].find(e => e.textContent.trim() === label)
  const click = async label => { const b = button(label); assert.ok(b, label); await flush(() => b.click()) }
  const change = async (el, value) => flush(() => { const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
  try {
    const { createRoot } = await import('react-dom/client'); root = createRoot(doc.getElementById('root'))
    await flush(() => root.render(React.createElement(MusicSocial, { auth: { client, session: { user: { id: 'author', email: 'PRIVATE@example.com', user_metadata: { full_name: 'PRIVATE GOOGLE NAME' } } } } })))
    assert.ok(!doc.body.textContent.includes('PRIVATE GOOGLE')); assert.ok(!doc.body.textContent.includes('PRIVATE@example'))
    await change(doc.querySelector('input[pattern]'), 'my_piano'); await change(doc.querySelector('input[maxlength="40"]'), '직접 정한 닉네임')
    await click('프로필 저장'); assert.match(doc.querySelector('[role=alert]').textContent, /이미 사용 중/); assert.equal(doc.querySelector('input[pattern]').value, 'my_piano')
    failProfile = false; await click('프로필 저장'); assert.equal(profile.nickname, '직접 정한 닉네임')
    await click('개인 원본'); await click('새 음악 기록')
    assert.equal(doc.querySelector('.social-editor select').value, '')
    const selects = () => doc.querySelectorAll('.social-editor select')
    assert.equal(selects()[1].value, 'private'); assert.equal(button('나만 보기로 저장').disabled, true)
    await change(selects()[0], tracks[0].id); await change(doc.querySelector('.social-editor textarea'), '개인 원본과 공유본의 첫 내용')
    await change(selects()[1], 'public'); await click('공유 전 확인'); assert.equal(creates, 0)
    await click('모든 사람에게 공유 확정'); assert.equal(creates, 1); assert.equal(records.length, 1); assert.equal(posts.length, 1)
    await click('원본 수정'); await change(doc.querySelector('.social-editor textarea'), '개인 원본만 수정한 내용'); await click('원본 저장')
    assert.equal(records[0].body, '개인 원본만 수정한 내용'); assert.equal(posts[0].body, '개인 원본과 공유본의 첫 내용')
    await click('공유본 만들기'); assert.equal(doc.querySelector('.social-editor select').value, 'private')
    await click('공유 전 확인'); await click('나만 보기로 저장 확정'); assert.equal(posts.length, 2); assert.equal(posts[1].visibility, 'private')
    await click('피드'); await click('링크 복사'); assert.equal(copies, 1); assert.equal(posts[0].visibility, 'public')
    await click('공개 범위 변경'); await change(doc.querySelector('.social-editor select'), 'private'); await click('공유 전 확인'); await click('나만 보기로 저장 확정')
    assert.equal(posts[0].visibility, 'private'); assert.equal(records[0].body, '개인 원본만 수정한 내용')
    await click('공유 취소'); await click('확인'); assert.equal(posts.length, 1); assert.equal(records.length, 1)
  } finally {
    if (root) await React.act(async () => root.unmount()); dom.window.close()
    for (const [k, descriptor] of before) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k] }
  }
})
