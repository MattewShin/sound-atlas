import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { profileFixture } from './profileIaFixture.mjs'
import { STORAGE_KEY } from '../src/data/storage.js'
import { LIBRARY_OWNER_KEY } from '../src/data/userLibrary.js'
import { tracks } from '../src/data/musicData.js'
import { DISCOVERY_SESSION_KEY } from '../src/data/homeDiscovery.js'

export async function verifyProfileIa(components) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://atlas.example/#music', pretendToBeVisual: true })
  const names = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'], original = new Map(names.map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  for (const k of names) Object.defineProperty(globalThis,k,{ value: k === 'window' ? dom.window : k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k], configurable: true, writable: true })
  dom.window.scrollTo = () => {}; dom.window.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolled = 'true' }
  const doc = dom.window.document, fixture = profileFixture(), {state, db, api} = fixture
  let root
  const flush = async action => React.act(async () => { action?.(); await new Promise(resolve => setTimeout(resolve,40)) })
  const button = name => [...doc.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === name)
  const click = async name => { assert(button(name),name); await flush(() => button(name).click()) }
  const input = async (el,value) => flush(() => { const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true})) })
  const go = async hash => { await flush(() => { dom.window.location.hash = hash }); await flush() }
  try {
    const {createRoot} = await import('react-dom/client'); root = createRoot(doc.getElementById('root'))
    await flush(() => root.render(React.createElement(components.default,{authClient:db,socialApi:api}))); await flush()
    assert.equal(doc.querySelector('h1').textContent,'음악 이야기'); assert.equal(doc.querySelector('.social-heading p').textContent,'MUSIC STORIES')
    assert.equal(doc.querySelector('.social-tabs'),null); assert.equal(doc.querySelector('.all-music-records'),null); assert.equal(doc.querySelector('.account-panel'),null)
    assert(!doc.querySelector('.social-screen').textContent.includes('합성 GOOGLE')); assert(!doc.querySelector('.social-screen').textContent.includes('synthetic@example'))
    const nav = [...doc.querySelectorAll('.bottom-nav button')]
    assert.deepEqual(nav.map(b => b.getAttribute('aria-label')),['음악 탐색','공연 찾기','보관함','내 프로필','음악 이야기'])
    assert(nav.every(b => b.title === b.getAttribute('aria-label') && b.textContent === '' && b.querySelector('svg[aria-hidden="true"]')))
    assert.equal(nav[4].getAttribute('aria-current'),'page')
    await click('기록 작성'); await flush()
    assert.equal(doc.querySelector('h1').textContent,'내 프로필'); assert.equal(doc.activeElement.id,'my-records-title'); assert.equal(doc.activeElement.dataset.scrolled,'true')
    assert.equal(state.channels.size,0,'visiting profile does not subscribe to the global feed')
    assert.deepEqual([...doc.querySelectorAll('.my-profile > section > h2')].map(h => h.textContent),['공개 프로필','내 기록','나의 음악 취향','활동 관리'])
    assert(button('다른 Google 계정으로 전환')); assert(button('로그아웃')); assert.equal(doc.querySelector('.account-panel').lastElementChild.className,'account-danger')
    assert.equal(doc.querySelectorAll('.music-journal-entry').length,10)
    await click('공유 중'); assert.equal(doc.querySelectorAll('.music-journal-entry').length,1)
    await click('나만 보기'); assert.equal(doc.querySelectorAll('.music-journal-entry').length,9)
    await click('전체'); await click('기록 더 보기'); assert.equal(doc.querySelectorAll('.music-journal-entry').length,11)
    const beforeShare = state.posts[0].body
    await click('수정'); await input(doc.querySelector('.music-journal-form textarea'),'변경한 합성 개인 기록')
    await flush(() => doc.querySelector('.music-journal-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(state.posts[0].body,beforeShare,'editing the private record does not change the snapshot')
    await click('공개 범위 변경'); await flush(); await input(doc.querySelector('form[aria-label="공개 범위 변경"] select'),'followers')
    await click('변경 전 확인'); await click('내 팔로워로 변경 확정'); assert.equal(state.posts[0].visibility,'followers')
    await click('공유 취소'); await click('공유 취소 확정'); assert.equal(state.posts.length,0); assert(state.records.some(r => r.id === 'record-0'))
    await click('기록 남기기'); await input(doc.querySelector('.music-journal-form textarea'),'합성 새 기록')
    await flush(() => doc.querySelector('.music-journal-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(state.calls.filter(c => c.name === 'save_private_music_record').length,1,'track is required before saving new record')
    await input(doc.querySelector('.music-journal-form select'),tracks[0].id)
    state.failSave = true; await flush(() => doc.querySelector('.music-journal-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))); assert.equal(doc.querySelector('.music-journal-form textarea').value,'합성 새 기록')
    state.failSave = false; await flush(() => doc.querySelector('.music-journal-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))); assert.equal(state.records.length,12)
    await click('차단 해제'); assert.equal(state.blocks.length,0)
    await click('삭제'); await click('영구 삭제'); assert.equal(state.records.length,11)
    await click('보관함'); assert.equal(doc.querySelector('.library-content-switch'),null); assert.equal(doc.querySelector('.all-music-records'),null)
    await go('music/profile/' + fixture.otherId); assert(doc.querySelector('.social-profile')); assert.equal(doc.querySelector('h1').textContent,'음악 이야기')
    await go('music/profile/' + fixture.ownId); assert.equal(doc.querySelector('h1').textContent,'내 프로필'); assert.equal(window.location.hash,'#profile')
    await go('music/track/' + tracks[0].id); assert.equal(doc.querySelector('h1').textContent,'음악 이야기')
    await click('내 프로필'); const feeds = state.calls.filter(c => c.name === 'social_feed').length
    await click('다른 사용자에게 보이는 내 프로필 확인'); assert(doc.querySelector('.public-profile-preview')); assert.equal(state.calls.filter(c => c.name === 'social_feed').length,feeds)
    const ownPost = {id:fixture.publicationId,track_id:tracks[0].id,body:'합성 내 게시물',visibility:'followers',profile:fixture.profile,created_at:'2026-11-10T00:00:00Z',like_count:0,comment_count:0}
    state.posts.push(ownPost)
    await go('profile/posts'); assert.equal(doc.activeElement.id,'my-posts-title'); assert(state.calls.filter(c => c.name === 'social_feed').slice(feeds).every(c => c.args.person === fixture.ownId))
    assert(doc.querySelector('.profile-own-post').textContent.includes('합성 내 게시물'))
    await flush(() => window.dispatchEvent(new dom.window.Event('offline'))); assert.equal(doc.querySelector('.profile-own-post'),null)
    await flush(() => window.dispatchEvent(new dom.window.Event('online'))); await flush(); assert(doc.querySelector('.profile-own-post'))
    state.posts = []; await flush(fixture.invalidate); assert.equal(doc.querySelector('.profile-own-post'),null)
    const oldFeed = api.feed; let finishOld; api.feed = () => new Promise(resolve => { finishOld = resolve }); await flush(fixture.invalidate)
    await go('profile'); await flush(() => finishOld([ownPost])); api.feed = oldFeed; assert.equal(doc.querySelector('.profile-own-post'),null,'late own posts cannot re-enter another screen')
    assert.equal(state.maxChannels,1,'only one invalidation channel is active across feed/profile transitions')
    await go('profile'); await click('계정과 데이터 삭제'); assert(doc.querySelector('.account-delete-confirm')); await click('취소'); assert(!state.calls.some(c => c.name === 'delete_current_user_account'))
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify({[tracks[0].id]:{listenAgain:true}})); window.localStorage.setItem(LIBRARY_OWNER_KEY,'AUTH-A')
    await click('다른 Google 계정으로 전환'); assert.equal(window.localStorage.getItem(STORAGE_KEY),null); assert.equal(window.localStorage.getItem(LIBRARY_OWNER_KEY),null)
    assert.deepEqual(state.calls.filter(c => ['signOut','oauth'].includes(c.name)).map(c => c.name),['signOut','oauth'])
    assert.equal(state.calls.at(-1).options.options.queryParams.prompt,'select_account'); assert(!doc.body.textContent.includes('변경한 합성 개인 기록')); assert.equal(state.channels.size,0)
    await flush(() => fixture.setUser('B')); await click('로그아웃'); assert(!doc.body.textContent.includes('합성 GOOGLE')); assert(button('Google로 계속하기'))
    await go('music'); assert(!doc.querySelector('.account-panel')); assert(!doc.querySelector('.social-tabs')); assert.equal(doc.querySelector('h1').textContent,'음악 이야기')
    assert([...Array(window.sessionStorage.length)].every((_,i) => window.sessionStorage.key(i) === DISCOVERY_SESSION_KEY),'only the existing public discovery IDs may persist')
  } finally { if (root) await React.act(async () => root.unmount()); dom.window.close(); for (const [k,v] of original) { if (v) Object.defineProperty(globalThis,k,v); else delete globalThis[k] } }
}

export async function verifyProfileSetup(components) {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://atlas.example/#music',pretendToBeVisual:true}), names = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'], old = new Map(names.map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  for (const k of names) Object.defineProperty(globalThis,k,{value:k === 'window' ? dom.window : k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k],configurable:true,writable:true})
  dom.window.scrollTo = () => {}
  const fixture = profileFixture({needsSetup:true}), doc = dom.window.document; let root
  const flush = async fn => React.act(async () => { fn?.(); await new Promise(r => setTimeout(r,40)) })
  const button = name => [...doc.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === name)
  try {
    const {createRoot} = await import('react-dom/client'); root = createRoot(doc.getElementById('root')); await flush(() => root.render(React.createElement(components.default,{authClient:fixture.db,socialApi:fixture.api}))); await flush()
    assert(doc.body.textContent.includes('음악 이야기에 참여하려면 내 프로필을 먼저 만들어주세요.')); assert.equal(doc.querySelector('.social-screen .social-form'),null)
    await flush(() => button('내 프로필 만들기').click()); await flush(); await flush(() => button('공개 프로필 만들기').click())
    const form = doc.querySelector('.social-form'), fields = form.querySelectorAll('input'); assert.equal(fields[1].value,'피아노산책'); assert.equal(fields[1].disabled,true)
    await flush(() => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(fields[0],'new_piano'); fields[0].dispatchEvent(new dom.window.Event('input',{bubbles:true})) })
    await flush(() => form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))); assert.equal(fixture.state.needsSetup,false); assert(doc.querySelector('.profile-identity').textContent.includes('new_piano')); assert.equal(fixture.state.channels.size,0)
    await flush(() => button('공개 프로필 수정').click()); assert.equal(doc.querySelectorAll('.social-form input')[1].disabled,true)
    assert(!doc.querySelector('.public-profile-preview')?.textContent.includes('GOOGLE'))
  } finally { if (root) await React.act(async () => root.unmount()); dom.window.close(); for (const [k,v] of old) { if (v) Object.defineProperty(globalThis,k,v); else delete globalThis[k] } }
}

export async function verifySwitchFailure(components) {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://atlas.example/#profile',pretendToBeVisual:true}), names = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'], old = new Map(names.map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  for (const k of names) Object.defineProperty(globalThis,k,{value:k === 'window' ? dom.window : k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k],configurable:true,writable:true})
  dom.window.scrollTo = () => {}; const fixture = profileFixture(), doc = dom.window.document; let root, release
  const flush = async fn => React.act(async () => { fn?.(); await new Promise(r => setTimeout(r,40)) })
  try {
    const {createRoot} = await import('react-dom/client'); root = createRoot(doc.getElementById('root')); await flush(() => root.render(React.createElement(components.default,{authClient:fixture.db,socialApi:fixture.api}))); await flush()
    window.localStorage.setItem(STORAGE_KEY,'synthetic-account-copy'); window.localStorage.setItem(LIBRARY_OWNER_KEY,'AUTH-A')
    fixture.state.waitLogout = new Promise(resolve => { release = resolve }); fixture.state.failLogout = true
    await flush(() => { const b = [...doc.querySelectorAll('button')].find(b => b.textContent === '다른 Google 계정으로 전환'); b.click(); b.click() })
    assert.equal(window.localStorage.getItem(STORAGE_KEY),null); assert.equal(fixture.state.calls.filter(c => c.name === 'signOut').length,1); assert.equal(fixture.state.calls.filter(c => c.name === 'oauth').length,0)
    assert(!doc.body.textContent.includes('합성 비공개 기록'))
    await flush(release); assert.equal(fixture.state.calls.filter(c => c.name === 'oauth').length,0,'failed logout must never start the OAuth redirect')
    await flush(() => fixture.emitAuth('TOKEN_REFRESHED',{user:{id:'AUTH-A'}})); assert(!doc.body.textContent.includes('합성 비공개 기록')); assert(doc.querySelector('.account-error'))
  } finally { if (root) await React.act(async () => root.unmount()); dom.window.close(); for (const [k,v] of old) { if (v) Object.defineProperty(globalThis,k,v); else delete globalThis[k] } }
}
