import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'
import { tracks } from '../src/data/musicData.js'
import useGoogleAuth from '../src/components/useGoogleAuth.js'

export async function verifyMusicSocial(MusicSocial) {
 const dom=new JSDOM('<div id="root"></div>',{url:'https://atlas.example/#music',pretendToBeVisual:true})
 const names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],before=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 for(const k of names)Object.defineProperty(globalThis,k,{value:k==='window'?dom.window:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k],configurable:true,writable:true})
 const doc=dom.window.document,ids={A:'public-a',B:'public-b',C:'public-c'},author={id:ids.A,handle:'existing_piano',nickname:'기존닉네임',avatar_url:null}
 let sdkUser=null,listener,finishInitial,invalidated,status,root,following=true,blocked=false,scope='followers',comments=[],liked=false,likeCalls=0,failComment=true,resolveLike,rejectLike,delayedFeed,logoutCalls=0,deleteCalls=0,saveCalls=0
 const privateRows=[]
 const signedUser=name=>({id:'AUTH-'+name,email:'private-google@example.invalid',user_metadata:{full_name:'PRIVATE GOOGLE NAME'}})
 const userName=()=>sdkUser?.id?.slice(-1)
 const allowed=()=>!blocked&&(userName()==='A'||scope==='public'||(scope==='followers'&&userName()==='B'&&following))
 const post=()=>({id:'legacy-publication',track_id:tracks[0].id,body:'기존 공유본 첫 줄\n'+'긴 감상 '.repeat(90),created_at:'2026-11-06T00:00:00Z',profile:author,visibility:scope,like_count:liked?1:0,liked,comment_count:comments.length,own:userName()==='A'})
 const db={auth:{
  getSession:()=>new Promise(resolve=>{finishInitial=resolve}),
  onAuthStateChange:fn=>{listener=fn;return{data:{subscription:{unsubscribe(){}}}}},
  signOut:async options=>{assert.equal(options.scope,'local');logoutCalls++;sdkUser=null;listener('SIGNED_OUT',null);return{error:null}},
  signInWithOAuth:async()=>({error:null}),
 },rpc:async(name,args)=>{
  if(name==='list_my_music_shares')return{data:[]}
  if(name==='save_private_music_record'){saveCalls++;const row={id:args.p_id,track_id:args.p_track_id,kind:args.p_kind,body:args.p_body,recorded_on:args.p_recorded_on,revision:1};privateRows.push(row);return{data:[row]}}
  assert.equal(name,'delete_current_user_account');deleteCalls++;return{data:true,error:null}},
 from(){const query={select(){return query},eq(){return query},order(){return query},range:async()=>({data:privateRows,count:privateRows.length})};return query}}
 const api={db,
  subscribe(onEvent,onStatus){invalidated=onEvent;status=onStatus;onStatus('SUBSCRIBED');return()=>{}},
  feed:async()=>delayedFeed??(allowed()?[post()]:[]),
  me:async()=>sdkUser?{...author,id:ids[userName()],handle:'listener_'+userName()?.toLowerCase()}:null,
  profile:async id=>{assert.ok(Object.values(ids).includes(id),'profiles use public IDs, not Auth UUID');return blocked?null:{...author,following,follower_count:following?1:0,following_count:0}},
  blocks:async()=>[],comments:async()=>structuredClone(comments),
  comment:async(_post,body,id)=>{if(failComment)throw Error('댓글 전송 실패');if(!comments.some(c=>c.id===id))comments.push({id,post_id:'legacy-publication',profile_id:ids[userName()],profile:{handle:'listener_b'},body,created_at:new Date().toISOString()})},
  deleteComment:async id=>{comments=comments.filter(c=>c.id!==id)},
  like:async()=>{likeCalls++;await new Promise((resolve,reject)=>{resolveLike=()=>{liked=!liked;resolve()};rejectLike=()=>reject(Error('좋아요 실패'))})},
  follow:async(_person,desired)=>{following=desired},block:async()=>{blocked=true;following=false},
 }
 function Harness(){const auth=useGoogleAuth(db);return React.createElement(React.Fragment,null,
  React.createElement('button',{onClick:auth.signOut},'테스트 로그아웃'),
  React.createElement('button',{id:'delete-account',onClick:auth.deleteAccount},'계정 삭제'),
  React.createElement(MusicSocial,{key:`${auth.user?.id??'anon'}:${auth.sessionVersion}`,auth,api}))}
 const flush=async fn=>React.act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,25))})
 const button=text=>[...doc.querySelectorAll('button')].find(el=>el.textContent.trim()===text)
 const click=async text=>{assert.ok(button(text),text);await flush(()=>button(text).click())}
 const event=async(name,user)=>flush(()=>{sdkUser=user? signedUser(user):null;listener(name,sdkUser?{user:sdkUser}:null)})
 try{
  const {createRoot}=await import('react-dom/client');root=createRoot(doc.getElementById('root'))
  await flush(()=>root.render(React.createElement(Harness)))
  await event('SIGNED_IN','B');assert.ok(doc.querySelector('.social-post'))
  await flush(()=>finishInitial({data:{session:{user:signedUser('A')}},error:null}))
  assert.ok(!button('공유 내용 수정'),'late initial A session cannot replace signed-in B')
  assert.ok(!doc.body.textContent.includes('AUTH-'));assert.ok(!doc.body.textContent.includes('PRIVATE GOOGLE'));assert.ok(!doc.body.textContent.includes('private-google@'))
  assert.equal(doc.querySelector('.social-avatar').tagName,'SPAN');assert.ok(doc.querySelector('time').title.includes('KST'))
  await click('더 보기');assert.match(doc.querySelector('.social-post-copy p').textContent,/첫 줄\n/)
  await flush(()=>doc.querySelector('[aria-label="댓글 0개"]').click())
  await flush(()=>{const area=doc.querySelector('.social-comments textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(area,'실패해도 보존할 초안');area.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
  const send=()=>doc.querySelector('.social-comments form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))
  await flush(send);assert.equal(doc.querySelector('.social-comments textarea').value,'실패해도 보존할 초안')
  failComment=false;await flush(send);assert.equal(doc.querySelector('.social-comments textarea').value,'');assert.ok(doc.querySelector('[aria-label="댓글 1개"]'))
  await click('댓글 삭제');assert.ok(doc.querySelector('[aria-label="댓글 0개"]'))
  const heart=()=>doc.querySelector('[aria-label^="좋아요"]')
  await flush(()=>{heart().click();heart().click()});assert.equal(likeCalls,1)
  await flush(rejectLike);assert.equal(heart().textContent,'0');assert.equal(heart().getAttribute('aria-pressed'),'false')
  await flush(()=>heart().click());await flush(resolveLike);assert.equal(heart().textContent,'1')
  await flush(()=>doc.querySelector('.social-person').click());assert.match(doc.querySelector('.social-profile').textContent,/팔로워 1/)
  await click('팔로우 취소');assert.equal(doc.querySelector('.social-post'),null)
  await flush(()=>{window.location.hash='music/post/legacy-publication'});assert.match(doc.body.textContent,/게시물을 볼 수 없어요/)
  scope='public';await flush(invalidated);assert.ok(doc.querySelector('.social-post'))
  let finishOld;delayedFeed=new Promise(resolve=>{finishOld=resolve});await flush(invalidated);assert.equal(doc.querySelector('.social-post'),null)
  delayedFeed=null;scope='private';await flush(invalidated);await flush(()=>finishOld([post()]));assert.equal(doc.querySelector('.social-post'),null)
  scope='public';await flush(invalidated);await flush(()=>status('CHANNEL_ERROR'));assert.equal(doc.querySelector('.social-post'),null)
  await flush(()=>status('SUBSCRIBED'));assert.ok(doc.querySelector('.social-post'))
  await flush(()=>window.dispatchEvent(new dom.window.Event('offline')));assert.equal(doc.querySelector('.social-post'),null)
  await flush(()=>window.dispatchEvent(new dom.window.Event('online')));assert.ok(doc.querySelector('.social-post'))
  scope='followers';following=true;await flush(invalidated)
  await click('테스트 로그아웃');assert.equal(logoutCalls,1);assert.equal(doc.querySelector('.social-post'),null)
  await flush(()=>listener('TOKEN_REFRESHED',{user:signedUser('B')}));assert.equal(doc.querySelector('.social-post'),null,'old refresh cannot restore logged-out identity')
  await event('SIGNED_IN','C');assert.equal(doc.querySelector('.social-post'),null)
  await event('SIGNED_IN','B');assert.ok(doc.querySelector('.social-post'))
  await flush(()=>doc.getElementById('delete-account').click());assert.equal(deleteCalls,1);assert.equal(doc.querySelector('.social-post'),null)
  await event('SIGNED_IN','B');await click('사용자 차단');await click('확인');assert.equal(doc.querySelector('.social-post'),null)
  assert.equal(doc.querySelector('.social-tabs'),null);assert.equal(doc.querySelector('.all-music-records'),null);assert.equal(doc.querySelector('.social-form input'),null)
  assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0)
 }finally{if(root)await React.act(async()=>root.unmount());dom.window.close();for(const[k,v]of before){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
}
