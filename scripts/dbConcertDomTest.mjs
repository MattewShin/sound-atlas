import assert from 'node:assert/strict'
import React from 'react'
import { JSDOM } from 'jsdom'

export async function verifyDbConcertInteractions(App) {
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT','fetch']
  const original=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
  for(const n of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,n,{value:n==='window'?dom.window:dom.window[n],configurable:true,writable:true})
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.scrollTo=()=>{}
  dom.window.requestAnimationFrame=f=>dom.window.setTimeout(f,0)
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
  const targetTrackId='beethoven-sonata-op27-2-no14-m2',workId='beethoven-sonata-op27-2-no14'
  dom.window.localStorage.setItem('classic-atlas-music-data-version','manual-catalog-6')
  dom.window.localStorage.setItem('classic-atlas-track-reactions-v1',JSON.stringify({[targetTrackId]:{listenAgain:true}}))
  let root,mode='empty',searchCalls=0
  const requests=[]
  globalThis.fetch=async(value,options={})=>{
    const url=new URL(value,'http://localhost');requests.push([url.pathname,options.method||'GET'])
    assert.equal(options.method||'GET','GET')
    if(url.pathname==='/api/concerts/status')return {ok:true,json:async()=>({backend:'supabase',configured:true,cacheTtlMs:0})}
    assert.equal(url.pathname,'/api/concerts','DB UI never calls OCR/program/analysis endpoints')
    searchCalls++
    if(mode==='error')return {ok:false,json:async()=>({code:'DB_SEARCH_UNAVAILABLE',message:'확인된 공연을 조회하지 못했어요. 잠시 후 다시 시도해주세요.'})}
    const query=Object.fromEntries(['region','from','to'].map(k=>[k,url.searchParams.get(k)]))
    const concert={id:'kopis-PF999901',kopisId:'PF999901',title:'Local DB preview fixture',venue:'Fixture hall',region:query.region,
      dateFrom:query.from,dateTo:query.to,performanceStatus:'공연중',fetchedAt:new Date().toISOString(),
      sourceUrl:'https://kopis.or.kr/',sourceLabel:'저장된 프로그램 수동 검토 결과',searchBackend:'supabase',programVerification:'reviewed-db',programStatus:'verified',programWorkIds:[workId],programTrackIds:[targetTrackId],
      targetMatch:{targetTrackId,workId,status:'matched',relation:'EXACT',reviewStatus:'CONFIRMED',evidenceKind:'reviewed-db',evidenceSourceUrl:'https://kopis.or.kr/upload/source.png'}}
    return {ok:true,json:async()=>({backend:'supabase',query,targetTrackId,concerts:mode==='success'?[concert,concert]:[],fetchedAt:new Date().toISOString(),cacheTtlMs:0})}
  }
  const flush=async action=>React.act(async()=>{action?.();await new Promise(r=>setTimeout(r,30))})
  const click=async text=>{const button=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(button,text);await flush(()=>button.click())}
  const submit=()=>dom.window.document.querySelector('.concert-search-panel form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))
  try {
    const {createRoot}=await import('react-dom/client');root=createRoot(dom.window.document.getElementById('root'))
    await flush(()=>root.render(React.createElement(App)))
    await click('보관함');await click('이 곡의 공연 찾기')
    assert.match(dom.window.document.body.textContent,/확인된 공연 미리보기/)
    await flush(submit)
    assert.match(dom.window.document.body.textContent,/선택한 조건에서 확인된 공연이 아직 없어요/)
    assert.equal(searchCalls,1)
    mode='success';await flush(submit)
    assert.equal(dom.window.document.querySelectorAll('.concert-card').length,1)
    assert.ok(!dom.window.document.body.textContent.includes('더 찾아보기'))
    assert.ok(!dom.window.document.body.textContent.includes('비슷한 공연'))
    assert.match(dom.window.document.body.textContent,/정확한 회차는 공식 안내/)
    const open=dom.window.document.querySelector('.concert-card .concert-detail-button');await flush(()=>open.click())
    assert.ok(dom.window.document.querySelector('.concert-detail-main'))
    assert.equal(dom.window.document.querySelectorAll('.concert-movements > li').length,1,'exact movement does not imply other movements')
    assert.ok(!dom.window.document.querySelector('.concert-program-request'))
    assert.match(dom.window.document.body.textContent,/공연의 전체 프로그램을 뜻하지 않아요/)
    await click('← 공연 목록으로')
    mode='error';await flush(submit)
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/확인된 공연을 조회하지 못했어요/)
    assert.ok(!dom.window.document.body.textContent.includes('선택한 조건에서 확인된 공연이 아직 없어요'))
    assert.equal(dom.window.document.querySelectorAll('.concert-card').length,0)
    assert.equal(searchCalls,3)
    assert.ok(requests.every(([path,method])=>method==='GET'&&['/api/concerts','/api/concerts/status'].includes(path)))
  } finally {
    if(root)await React.act(async()=>root.unmount());dom.window.close()
    for(const[n,d]of original){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}
  }
}
