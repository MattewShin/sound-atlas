import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs'
import {build} from 'esbuild'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {JSDOM} from 'jsdom'
mkdirSync('.cache',{recursive:true});const compiled=new URL('../.cache/concert-browser-ui.mjs',import.meta.url)
let components;try{const built=await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});writeFileSync(compiled,built.outputFiles[0].text);components=await import(compiled.href)}finally{try{unlinkSync(compiled)}catch{}}
const concert=n=>({id:'kopis-PF'+n,kopisId:'PF'+n,title:'클래식 공연 '+n,dateFrom:'2099-10-29',dateTo:'2099-11-01',venue:'테스트홀',region:'서울',performanceStatus:'공연예정',posterUrl:'https://example.com/poster.jpg',sourceUrl:'https://example.com/kopis',bookingLinks:[{name:'예매처',url:'https://example.com/ticket'}],introductionImages:['https://example.com/intro1.jpg','https://example.com/intro2.jpg']})
test('browser UI enters without selected song, paginates/deduplicates, filters and loads only selected detail; failures are explicit',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT','fetch'],original=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));for(const n of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,n,{value:n==='window'?dom.window:dom.window[n],configurable:true,writable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.scrollTo=()=>{};dom.window.requestAnimationFrame=cb=>dom.window.setTimeout(cb,0);dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
 const calls=[];let mode='success',root
 globalThis.fetch=async(value,init)=>{const url=new URL(value,'http://localhost');calls.push(url);assert.equal(init.method,'GET');assert.ok(!url.searchParams.has('targetTrackId'));assert.ok(!/program|match|ocr|rpc/i.test(url.pathname));if(mode==='error')return {ok:false,json:async()=>({message:'KOPIS 조회 실패'})};if(url.pathname==='/api/concerts'){
  const page=Number(url.searchParams.get('page')),query=Object.fromEntries(url.searchParams);query.page=page;const list=mode==='empty'?[]:page===1?Array.from({length:20},(_,i)=>concert(i+1)):[concert(20),...Array.from({length:20},(_,i)=>concert(i+21))];return {ok:true,json:async()=>({query,concerts:list.slice(0,20),total:mode==='empty'?0:41,page,pageSize:20,hasMore:mode==='empty'?false:page<3,fetchedAt:new Date().toISOString()})}
 }return {ok:true,json:async()=>({concert:concert(1),fetchedAt:new Date().toISOString()})}}
 const flush=async fn=>React.act(async()=>{fn?.();await new Promise(r=>setTimeout(r,25))}),button=label=>[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label),doc=dom.window.document
 try{
  const {createRoot}=await import('react-dom/client');root=createRoot(doc.getElementById('root'));await flush(()=>root.render(React.createElement(components.default)));assert.equal(calls.length,0)
  await flush(()=>button('공연 찾기').click());assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('region'),'서울');assert.equal((Date.parse(calls[0].searchParams.get('to'))-Date.parse(calls[0].searchParams.get('from')))/86400000,30);assert.equal(doc.querySelectorAll('.concert-browser-card').length,20);assert.ok(!doc.body.textContent.includes('이 곡의 공연 찾기'));assert.equal(doc.querySelectorAll('img[loading="lazy"]').length,20)
  await flush(()=>button('더 불러오기').click());assert.equal(doc.querySelectorAll('.concert-browser-card').length,39);assert.equal(calls[1].searchParams.get('page'),'2');assert.ok(doc.body.textContent.includes('전체 41건 중 39건 표시'));assert.ok(calls.every(u=>u.pathname==='/api/concerts'))
  await flush(()=>doc.querySelector('.concert-browser-card button').click());assert.equal(calls.at(-1).pathname,'/api/concerts/PF1');assert.equal(doc.querySelectorAll('.concert-introduction-image').length,2);const link=doc.querySelector('.concert-booking-link');assert.equal(link.textContent.trim(),'예매처 ↗');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer')
  await flush(()=>button('← 공연 목록으로').click());assert.equal(doc.querySelectorAll('.concert-browser-card').length,39);assert.equal(calls.length,3)
  await flush(()=>doc.querySelector('.concert-location-control').click());await flush(()=>[...doc.querySelectorAll('.region-choice-list button')].find(b=>b.textContent==='부산').click());assert.equal(dom.window.localStorage.getItem('classic-atlas-concert-region-v1'),'부산')
  const submit=()=>doc.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));mode='error';await flush(submit);assert.ok(doc.querySelector('[role="alert"]').textContent.includes('KOPIS 조회 실패'));assert.ok(!doc.body.textContent.includes('조건에 맞는 공연이 없어요'))
  mode='empty';await flush(()=>button('다시 시도').click());assert.ok(doc.body.textContent.includes('조건에 맞는 공연이 없어요'));assert.equal(calls.at(-1).searchParams.get('region'),'부산')
  await flush(()=>button('보관함').click());assert.ok(!doc.body.textContent.includes('이 곡의 공연 찾기'));await flush(()=>button('나의 취향').click());assert.ok(doc.body.textContent.includes('아직 취향이 형성되지'))
 }finally{if(root)await React.act(async()=>root.unmount());dom.window.close();for(const [n,d]of original){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}}
})
test('independent detail supports missing booking/images and safe mobile image attributes',()=>{
 const render=c=>renderToStaticMarkup(React.createElement(components.ConcertDetailScreen,{detail:{status:'success',data:c},onBack(){}}));const html=render(concert(1));assert.ok(html.includes('loading="lazy"'));assert.ok(html.includes('noopener noreferrer'));assert.ok(html.includes('공연예술통합전산망(KOPIS)'));const empty=render({...concert(1),posterUrl:null,introductionImages:[],bookingLinks:[]});assert.ok(empty.includes('등록된 예매 링크가 없어요.'));assert.ok(empty.includes('등록된 소개 이미지가 없어요.'));assert.ok(!empty.includes('<img'));assert.ok(!/CONFIRMED|REJECTED|OCR|작품 매칭/.test(empty))
})

test('stale notice shows exact message and original update time only for stale list/detail',()=>{
 const fetchedAt='2026-10-30T00:00:00.000Z',message='KOPIS 연결이 지연되어 마지막으로 확인된 정보를 표시합니다'
 for(const stale of [false,true]){
  const detail=renderToStaticMarkup(React.createElement(components.ConcertDetailScreen,{detail:{status:'success',data:concert(1),stale,fetchedAt},onBack(){}}))
  const list=renderToStaticMarkup(React.createElement(components.ConcertScreen,{search:{status:'success',data:{query:{region:'서울',from:'2099-10-29',to:'2099-11-28',q:''},concerts:[concert(1)],total:1,hasMore:false,stale,fetchedAt}},region:'서울',period:{from:'2099-10-29',to:'2099-11-28'},keyword:'',onSelectRegion(){},onChangePeriod(){},onChangeKeyword(){},onSearch(){}}))
  for(const html of [list,detail]){assert.equal(html.includes(message),stale);assert.equal(html.includes('갱신 시각:'),stale);if(stale)assert.ok(html.includes('dateTime="'+fetchedAt+'"'))}
 }
})
