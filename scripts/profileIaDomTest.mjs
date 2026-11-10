import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { profileFixture } from './profileIaFixture.mjs'
import { STORAGE_KEY } from '../src/data/storage.js'
import { LIBRARY_OWNER_KEY } from '../src/data/userLibrary.js'
import { tracks } from '../src/data/musicData.js'
import { DISCOVERY_SESSION_KEY } from '../src/data/homeDiscovery.js'

async function withApp(components, fixture, hash, check) {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://atlas.example/#'+hash,pretendToBeVisual:true})
  const names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'], original=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  for(const k of names) Object.defineProperty(globalThis,k,{value:k==='window'?dom.window:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k],configurable:true,writable:true})
  dom.window.scrollTo=()=>{}; dom.window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'}
  const doc=dom.window.document
  const flush=async fn=>React.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,35))})
  const button=name=>[...doc.querySelectorAll('button,a')].find(b=>(b.getAttribute('aria-label')||b.textContent.trim())===name)
  const click=async name=>{assert(button(name),'missing '+name+'; buttons: '+[...doc.querySelectorAll('button')].map(b=>b.textContent).join('|'));await flush(()=>button(name).click());await flush()}
  const go=async hash=>{await flush(()=>{window.location.hash=hash});await flush()}
  const input=async(el,value)=>flush(()=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})
  const submit=async selector=>flush(()=>doc.querySelector(selector).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
  let root
  try { const{createRoot}=await import('react-dom/client');root=createRoot(doc.getElementById('root'));await flush(()=>root.render(React.createElement(components.default,{authClient:fixture.db,socialApi:fixture.api})));await flush();await check({doc,flush,click,go,input,submit,button,dom,root}) }
  finally {if(root)await React.act(async()=>root.unmount());dom.window.close();for(const[k,v]of original){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
}

export async function verifyProfileIa(components) {
  const fixture=profileFixture(),{state}=fixture
  state.shares.push({id:'44444444-4444-4444-8444-444444444444',source_record_id:'record-1',visibility:'private'},{id:'55555555-5555-4555-8555-555555555555',source_record_id:'record-10',visibility:'followers'})
  await withApp(components,fixture,'music',async({doc,click,go,input,submit,flush,button})=>{
    assert.equal(doc.querySelector('h1').textContent,'음악 이야기');assert.equal(doc.querySelector('.social-tabs'),null)
    assert.equal(doc.querySelector('.account-panel'),null);assert(!doc.querySelector('.social-screen').textContent.includes('합성 GOOGLE'))
    const nav=[...doc.querySelectorAll('.bottom-nav button')]
    assert.deepEqual(nav.map(b=>b.getAttribute('aria-label')),['음악 탐색','공연 찾기','보관함','내 프로필','음악 이야기'])
    assert(nav.every(b=>b.title===b.getAttribute('aria-label')&&b.textContent===''&&b.querySelector('svg[aria-hidden="true"]')))
    const feedsBeforeProfile=state.calls.filter(c=>c.name==='social_feed').length
    await click('내 프로필');assert.equal(doc.querySelector('h1').textContent,'내 프로필')
    assert.equal(doc.querySelectorAll('.profile-recent li').length,3);assert.equal(doc.querySelector('.all-music-records'),null);assert.equal(doc.querySelector('.social-form'),null);assert.equal(doc.querySelector('.account-panel'),null)
    assert.deepEqual([...doc.querySelectorAll('.profile-social-counts span')].map(el=>el.textContent),['팔로워 2','팔로잉 3'])
    assert.equal(doc.querySelector('.profile-social-counts a,.profile-social-counts button,.profile-social-counts [role="link"],.profile-social-counts [tabindex]'),null)
    assert.equal(doc.querySelector('.profile-preview-link').getAttribute('href'),'#profile/preview')
    assert.equal(state.channels.size,0);assert.equal(state.calls.filter(c=>c.name==='social_feed').length,feedsBeforeProfile)
    assert.deepEqual([...doc.querySelectorAll('.profile-menu-row strong')].map(el=>el.textContent),['내 기록','나의 취향','설정'])
    assert.deepEqual([...doc.querySelectorAll('.profile-record-counts dd')].map(el=>el.textContent),['11','9','2'])
    const reads=state.calls.filter(c=>c.name==='journal_range');assert(reads.every(c=>c.start===0&&c.end===2));assert(!state.calls.some(c=>c.table==='music_social_blocks'))
    await click('전체 기록 보기');assert.equal(doc.activeElement.id,'my-records-title');assert.equal(doc.querySelectorAll('.music-journal-entry').length,10)
    await click('공개 중');assert.equal(doc.querySelectorAll('.music-journal-entry').length,2);assert(doc.querySelector('.music-journal-list').textContent.includes('기록 10'),'publication beyond the first page is returned')
    const publicRows=[...doc.querySelectorAll('.music-journal-entry-body')].map(el=>el.textContent)
    await click('나만 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,9)
    const privateRows=[...doc.querySelectorAll('.music-journal-entry-body')].map(el=>el.textContent)
    assert(privateRows.every(v=>!publicRows.includes(v)));assert.equal(new Set([...privateRows,...publicRows]).size,11)
    assert(doc.querySelector('.music-shared-status p').textContent.startsWith('나만 보기'))
    await click('전체');await click('기록 더 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,11)
    assert(!doc.querySelector('.record-filters').textContent.includes('불러온 기록'))
    const snapshot=state.posts[0].body
    await click('수정');await input(doc.querySelector('.music-journal-form textarea'),'변경한 합성 개인 기록');await submit('.music-journal-form')
    assert.equal(state.posts[0].body,snapshot)
    await click('공유 내용 수정');await input(doc.querySelector('.music-share-editor textarea'),'변경한 합성 공유본');await click('변경 전 확인');await click('모든 사람으로 변경 확정')
    assert.equal(state.posts[0].body,'변경한 합성 공유본');assert.equal(state.records.find(r=>r.id==='record-0').body,'변경한 합성 개인 기록')
    await click('공개 범위 변경');await input(doc.querySelector('.music-share-editor select'),'followers');await click('변경 전 확인');await click('내 팔로워로 변경 확정');assert.equal(state.posts[0].visibility,'followers')
    await click('공개 범위 변경');await input(doc.querySelector('.music-share-editor select'),'private');await click('변경 전 확인');await click('나만 보기로 변경 확정');assert.equal(state.posts[0].visibility,'private')
    await click('공개 중');assert.equal(doc.querySelectorAll('.music-journal-entry').length,1)
    await click('나만 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,10)
    await click('전체');assert(doc.querySelector('.music-shared-status a'));assert(button('링크 복사'))
    await click('공유 취소');await click('공유 취소 확정');assert.equal(state.posts.length,0);assert(state.records.some(r=>r.id==='record-0'))
    await click('기록 남기기');await input(doc.querySelector('.music-journal-form textarea'),'합성 새 기록');await submit('.music-journal-form');assert.equal(state.calls.filter(c=>c.name==='save_private_music_record').length,1)
    await input(doc.querySelector('.music-journal-form select'),tracks[0].id);state.failSave=true;await submit('.music-journal-form');assert.equal(doc.querySelector('.music-journal-form textarea').value,'합성 새 기록')
    state.failSave=false;await submit('.music-journal-form');assert.equal(state.records.length,12)
    await click('삭제');await click('영구 삭제');assert.equal(state.records.length,11)
    await go('profile/posts');assert.equal(window.location.hash,'#profile/records/public');assert.equal(doc.querySelector('.record-filters button[aria-pressed="true"]').textContent,'공개 중');assert.equal(doc.querySelector('.profile-own-post'),null)
    await go('profile/blocked');await click('차단 해제');assert.equal(state.blocks.length,0);assert(doc.body.textContent.includes('차단한 사용자가 없어요.'))
    await go('profile/taste');assert(doc.body.textContent.includes('나의 음악 취향'));assert.equal(doc.querySelector('.account-panel'),null)
    await go('profile/privacy');assert(doc.querySelector('.privacy-summary'))
    await go('library');assert.equal(doc.querySelector('.library-content-switch'),null);assert.equal(doc.querySelector('.all-music-records'),null)
    await go('music/profile/'+fixture.otherId);assert(doc.querySelector('.social-profile'));await go('music/profile/'+fixture.ownId);assert.equal(window.location.hash,'#profile')
    await go('music/track/'+tracks[0].id);assert.equal(doc.querySelector('h1').textContent,'음악 이야기')
    await go('profile/preview');assert(doc.querySelector('.public-profile-preview'));assert(!doc.querySelector('.public-profile-preview').textContent.includes('GOOGLE'))
    await go('profile/settings');assert.equal(doc.querySelector('.account-panel').lastElementChild.className,'account-danger');assert(button('다른 Google 계정으로 전환'));assert(button('로그아웃'))
    await click('계정과 데이터 삭제');assert(doc.querySelector('.account-delete-confirm'));await click('취소');assert(!state.calls.some(c=>c.name==='delete_current_user_account'))
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify({[tracks[0].id]:{listenAgain:true}}));window.localStorage.setItem(LIBRARY_OWNER_KEY,'AUTH-A')
    await click('다른 Google 계정으로 전환');assert.equal(window.localStorage.getItem(STORAGE_KEY),null);assert.equal(window.localStorage.getItem(LIBRARY_OWNER_KEY),null)
    assert.deepEqual(state.calls.filter(c=>['signOut','oauth'].includes(c.name)).map(c=>c.name),['signOut','oauth']);assert.equal(state.calls.at(-1).options.options.queryParams.prompt,'select_account')
    assert(!doc.body.textContent.includes('변경한 합성 개인 기록'));assert.equal(state.channels.size,0)
    await flush(()=>fixture.setUser('B'));await click('로그아웃');assert(button('Google로 계속하기'));assert(!doc.body.textContent.includes('합성 GOOGLE'))
    assert([...Array(window.sessionStorage.length)].every((_,i)=>window.sessionStorage.key(i)===DISCOVERY_SESSION_KEY))
  })
}

export async function verifyProfileSetup(components) {
  const fixture=profileFixture({needsSetup:true})
  await withApp(components,fixture,'music',async({doc,click,input,submit})=>{
    assert(doc.body.textContent.includes('음악 이야기에 참여하려면 내 프로필을 먼저 만들어주세요.'));assert.equal(doc.querySelector('.social-screen .social-form'),null)
    await click('내 프로필 만들기');assert.equal(doc.querySelector('.social-form'),null);await click('공개 프로필 만들기')
    const fields=doc.querySelectorAll('.social-form input');assert.equal(fields[1].value,'피아노산책');assert(fields[1].disabled)
    await input(fields[0],'new_piano');await submit('.social-form');await new Promise(r=>setTimeout(r,50));assert.equal(fixture.state.needsSetup,false);assert(doc.querySelector('.profile-identity').textContent.includes('new_piano'))
    await click('프로필 수정');assert(doc.querySelectorAll('.social-form input')[1].disabled);assert.equal(fixture.state.channels.size,0)
  })
}

export async function verifySwitchFailure(components) {
  const fixture=profileFixture();let release
  await withApp(components,fixture,'profile/settings',async({doc,button,flush})=>{
    window.localStorage.setItem(STORAGE_KEY,'synthetic-account-copy');window.localStorage.setItem(LIBRARY_OWNER_KEY,'AUTH-A')
    fixture.state.waitLogout=new Promise(resolve=>{release=resolve});fixture.state.failLogout=true
    await flush(()=>{button('다른 Google 계정으로 전환').click();button('다른 Google 계정으로 전환')?.click()})
    assert.equal(window.localStorage.getItem(STORAGE_KEY),null);assert.equal(fixture.state.calls.filter(c=>c.name==='signOut').length,1);assert(!fixture.state.calls.some(c=>c.name==='oauth'))
    await flush(release);assert(!fixture.state.calls.some(c=>c.name==='oauth'));await flush(()=>fixture.emitAuth('TOKEN_REFRESHED',{user:{id:'AUTH-A'}}))
    assert(!doc.body.textContent.includes('합성 비공개 기록'));assert(doc.querySelector('[role="alert"]'))
  })
}

export async function verifyDashboardStates(components) {
  for(const count of [0,1,3,23]) {
    const fixture=profileFixture({recordCount:count});fixture.state.shares=[]
    await withApp(components,fixture,'profile',async({doc,go,click,flush})=>{
      assert.equal(doc.querySelectorAll('.profile-recent li').length,Math.min(count,3));assert.deepEqual([...doc.querySelectorAll('.profile-record-counts dd')].map(el=>Number(el.textContent)),[count,count,0])
      assert(doc.body.textContent.includes('마음에 드는 곡을 보관하며 취향을 알아보세요.'));await go('profile/records/public');assert.equal(doc.querySelectorAll('.music-journal-entry').length,0)
      await go('profile/records/private');assert.equal(doc.querySelectorAll('.music-journal-entry').length,Math.min(count,10))
      if(count>10){await click('기록 더 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,20);await click('기록 더 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,23)}
      fixture.state.failShares=true;await go('profile/records/public');assert(doc.querySelector('[role="alert"]'));assert.equal(doc.querySelectorAll('.music-journal-entry').length,0)
      fixture.state.failShares=false;await click('공유 상태 다시 확인');assert.equal(doc.querySelector('[role="alert"]'),null)
      await go('profile');fixture.state.failRecords=true;await flush(()=>window.dispatchEvent(new window.Event('focus')));assert(doc.querySelector('[role="alert"]'));fixture.state.failRecords=false;await click('다시 시도');assert(doc.querySelector('.profile-record-counts'))
    })
  }
  const guest=profileFixture({signedIn:false});await withApp(components,guest,'profile/records',async({doc,click})=>{assert(doc.querySelector('.profile-login'));assert.equal(doc.querySelector('.profile-menu'),null);assert(!guest.state.calls.some(c=>c.name==='journal_range'));await click('Google로 계속하기');assert(guest.state.calls.some(c=>c.name==='oauth'))})
  const saved=profileFixture();saved.state.libraryRows=[{track_id:tracks[0].id,listen_again:true,updated_at:'2026-11-10T00:00:00Z'}]
  await withApp(components,saved,'profile',async({doc,go,click,flush})=>{
    assert(doc.querySelector('.profile-menu').textContent.includes('많이 보관한 작곡가: '+tracks[0].composer));assert.equal(doc.querySelector('.preference-chart'),null)
    await go('profile/taste');assert.equal(doc.querySelectorAll('.preference-chart meter').length,9);assert(doc.body.textContent.includes('보관한 곡 1곡 기준'));await click('내 취향 추천 보기');assert.equal(doc.querySelector('.my-profile'),null)
    await flush(()=>saved.setUser('B'));await go('profile');assert(!doc.querySelector('.profile-menu').textContent.includes('많이 보관한 작곡가:'))
  })
}

export async function verifyDashboardHistoryAndIsolation(components) {
  const fixture=profileFixture()
  await withApp(components,fixture,'profile',async({doc,go,flush,click})=>{
    for(const child of ['edit','preview','blocked','privacy']) {
      await go('profile/'+child)
      const back=doc.querySelector('.profile-back');assert.equal(back.textContent,'← 설정');assert.equal(back.getAttribute('href'),'#profile/settings')
      await click('← 설정');assert.equal(window.location.hash,'#profile/settings');assert.equal(doc.querySelector('h1').textContent,'설정')
      await flush(()=>window.history.back());await flush();assert.equal(window.location.hash,'#profile/'+child,'native back retains the actual previous child')
      await flush(()=>window.history.forward());await flush();assert.equal(window.location.hash,'#profile/settings')
    }
    await go('profile/taste');await go('profile/settings');await flush(()=>window.history.back());await flush();assert.equal(doc.querySelector('h1').textContent,'나의 음악 취향')
    await flush(()=>window.history.forward());await flush();assert.equal(doc.querySelector('h1').textContent,'설정')
    await go('profile/records');await click('수정');assert(doc.querySelector('.music-journal-form'));await flush(()=>fixture.setUser('B'));assert.equal(doc.querySelector('.music-journal-form'),null);assert(!doc.body.textContent.includes('합성 비공개 기록'))
    await go('profile');let release;fixture.state.waitRecords=new Promise(resolve=>{release=resolve});await flush(()=>window.dispatchEvent(new window.Event('focus')));assert(doc.querySelector('[role="status"]').textContent.includes('불러오는 중'))
    await flush(()=>fixture.setUser('A'));await flush(()=>fixture.setUser('B'));await flush(release);fixture.state.waitRecords=null;assert(!doc.body.textContent.includes('합성 비공개 기록'));assert.equal(doc.querySelectorAll('.profile-recent li').length,0)
    assert.equal(fixture.state.channels.size,0)
  })
  // Initial render from a child URL is also the refresh contract.
  await withApp(components,profileFixture(),'profile/records/private',async({doc})=>{assert.equal(doc.querySelector('.record-filters [aria-pressed="true"]').textContent,'나만 보기');assert.equal(doc.querySelectorAll('.music-journal-entry').length,10)})
}
