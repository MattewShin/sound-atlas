import test from 'node:test'
import assert from 'node:assert/strict'
import {createInvalidationSubscriber,getSocialApi} from './socialClient.js'

test('한 Supabase client의 여러 화면이 구독을 공유하고 이전 세션 콜백은 재연결을 덮지 않는다',async()=>{
 let current,starts=0,removes=0,notifyOld,finishRemoval
 const callbacks=[]
 const db={channel(){assert.equal(current,undefined);starts++;current={on(_type,_event,fn){callbacks.push(fn);return current},subscribe(fn){notifyOld=fn;fn('SUBSCRIBED');return current}};return current},
  removeChannel:async()=>{removes++;await new Promise(resolve=>{finishRemoval=()=>{current=undefined;resolve()}})}}
 assert.equal(getSocialApi(db),getSocialApi(db))
 const subscribe=createInvalidationSubscriber(db),a=[],b=[]
 const stopA=subscribe(()=>a.push('event'),s=>a.push(s));await new Promise(r=>setTimeout(r,0))
 const stopB=subscribe(()=>b.push('event'),s=>b.push(s));assert.equal(starts,1)
 callbacks[0]();assert.deepEqual(a,['SUBSCRIBED','event']);assert.deepEqual(b,['SUBSCRIBED','event'])
 stopA();assert.equal(removes,0);const stale=notifyOld;stopB()
 const c=[];const stopC=subscribe(()=>{},s=>c.push(s));await new Promise(r=>setTimeout(r,0));assert.equal(removes,1);assert.deepEqual(c,[])
 stale('CLOSED');finishRemoval();await new Promise(r=>setTimeout(r,0));assert.deepEqual(c,['SUBSCRIBED']);assert.equal(starts,2)
 stopC();await new Promise(r=>setTimeout(r,0));finishRemoval()
})
