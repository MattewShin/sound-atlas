import test from 'node:test'
import assert from 'node:assert/strict'
import {createKopisService} from './kopis.mjs'
import {createSupabaseBrowserCache,listCacheKey,publicCachePayload,FRESH_MS,STALE_MS} from './concertCache.mjs'
import {createConcertSearchClient} from '../src/data/concertSearch.js'
import {createConcertApiHandler} from './api.mjs'

const initial=Date.parse('2026-10-30T00:00:00Z'),query={region:'서울',from:'2026-10-30',to:'2026-11-29'}
const row=n=>({mt20id:'PF'+n,prfnm:'클래식 '+n,prfpdfrom:'2026.11.01',prfpdto:'2026.11.20',fcltynm:'테스트홀',area:'서울특별시',genrenm:'서양음악(클래식)',prfstate:'공연예정'})
const xml=rows=>'<dbs>'+rows.map(r=>'<db>'+Object.entries(r).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</db>').join('')+'</dbs>'
const response=rows=>({ok:true,status:200,text:async()=>xml(rows)})
const fixture=()=>{
 let time=initial,mode='ok',gets=0,writes=0,reads=0
 const records=new Map(),logs=[],all=Array.from({length:125},(_,i)=>row(1000+i))
 const store={async read(k){reads++;return structuredClone(records.get(k)||null)},async write(k,kind,value){writes++;records.set(k,structuredClone(value))}}
 const fetchImpl=async url=>{
  gets++;const page=Number(url.searchParams.get('cpage')||1)
  if(mode==='timeout')throw Object.assign(Error('SECRET URL QUERY'),{name:'TimeoutError'})
  if(mode==='network')throw Error('SECRET URL QUERY')
  if(mode==='http'||(mode==='partial'&&page===2))return {ok:false,status:503}
  if(mode==='xml')return {ok:true,status:200,text:async()=>'<dbs><broken>'}
  if(/\/PF\d+$/.test(url.pathname))return response([row(1000)])
  return response(url.searchParams.get('prfstate')==='01'?all.slice((page-1)*100,page*100):[all[0]])
 }
 const service=()=>createKopisService({env:{KOPIS_SERVICE_KEY:'SECRET'},fetchImpl,store,now:()=>time,delay:async()=>{},logger:r=>logs.push(r)})
 return {service,records,logs,set time(v){time=v},get time(){return time},set mode(v){mode=v},get gets(){return gets},get writes(){return writes},get reads(){return reads}}
}

test('complete list is stored once, pagination/dedup/filter share full snapshot and detail stays separate',async()=>{
 const f=fixture(),s=f.service(),first=await s.search(query),more=await s.search({...query,page:2})
 assert.equal(first.stale,false);assert.equal(first.source,'kopis');assert.equal(first.total,125);assert.equal(first.concerts.length,20)
 assert.equal(more.concerts.length,20);assert.equal(new Set([...first.concerts,...more.concerts].map(c=>c.kopisId)).size,40)
 assert.equal(f.gets,3);assert.equal(f.writes,1);assert.equal(f.records.get(listCacheKey(query)).concerts.length,125)
 assert.equal((await s.search({...query,q:'없는 공연'})).total,0);assert.equal(f.writes,1)
 const detail=await s.detail('PF1000');assert.equal(detail.stale,false);assert.equal(detail.concert.kopisId,'PF1000');assert.equal(f.writes,2);assert.equal(f.records.size,2)
})

test('cold start uses durable list/detail while fresh and performs no upstream GET',async()=>{
 const f=fixture(),old=f.service();await old.search(query);await old.detail('PF1000');old.close();const gets=f.gets
 f.time+=FRESH_MS-1;f.mode='http';const cold=f.service()
 for(const result of [await cold.search(query),await cold.detail('PF1000')]){assert.equal(result.source,'supabase-cache');assert.equal(result.stale,false)}
 assert.equal(f.gets,gets);assert.equal(f.writes,2)
})

for(const [mode,code,type,status]of [['timeout','KOPIS_TIMEOUT','TIMEOUT',null],['http','KOPIS_HTTP_ERROR','HTTP',503],['xml','KOPIS_XML_INVALID','XML',200],['network','KOPIS_CONNECT_FAILED','NETWORK',null]])test(mode+' failure returns original durable timestamp at 7h, never writes failure, logs only bounded metadata',async()=>{
 const f=fixture();const original=await f.service().search(query),snapshot=structuredClone([...f.records]);f.time+=7*3600000;f.mode=mode
 const result=await f.service().search(query,false,{requestId:'fixture-request'})
 assert.equal(result.stale,true);assert.equal(result.source,'supabase-cache');assert.equal(result.fetchedAt,original.fetchedAt);assert.deepEqual([...f.records],snapshot);assert.equal(f.writes,1)
 const log=f.logs.find(r=>r.stage===code);assert.equal(log.page,1);assert.equal(log.upstreamType,type);assert.equal(log.httpStatus,status);assert.equal(log.requestId,'fixture-request')
 for(const r of f.logs)assert.deepEqual(Object.keys(r).sort(),['durationMs','httpStatus','page','requestId','stage','upstreamType'])
 assert.ok(!JSON.stringify(f.logs).includes('SECRET'))
})

test('partial pagination never overwrites last complete snapshot and records failing page',async()=>{
 const f=fixture();await f.service().search(query);const before=structuredClone([...f.records]);f.time+=FRESH_MS;f.mode='partial'
 const result=await f.service().search(query);assert.equal(result.stale,true);assert.equal(result.total,125);assert.deepEqual([...f.records],before);assert.equal(f.writes,1)
 assert.ok(f.logs.some(r=>r.stage==='KOPIS_HTTP_ERROR'&&r.page===2&&r.httpStatus===503));assert.ok(f.logs.some(r=>r.stage==='KOPIS_PAGE_INCOMPLETE'&&r.page===2))
})

test('6h exact refreshes; 24h exact can fall back; 24h+1 and future stamps cannot be served',async()=>{
 const f=fixture();await f.service().search(query);f.mode='timeout'
 f.time=initial+FRESH_MS;assert.equal((await f.service().search(query)).stale,true);assert.equal(f.gets,4)
 f.time=initial+STALE_MS;assert.equal((await f.service().search(query)).stale,true)
 f.time++;await assert.rejects(f.service().search(query),e=>e.code==='KOPIS_TIMEOUT')
 f.time=initial-1;await assert.rejects(f.service().search(query),e=>e.code==='KOPIS_TIMEOUT');assert.equal(f.writes,1)
})

test('upstream recovery atomically replaces old list/detail and resets fresh timestamp',async()=>{
 const f=fixture(),s=f.service();await s.search(query);await s.detail('PF1000');f.time+=FRESH_MS;f.mode='http'
 assert.equal((await s.detail('PF1000')).stale,true);f.mode='ok'
 const list=await s.search(query),detail=await s.detail('PF1000');for(const v of [list,detail]){assert.equal(v.stale,false);assert.equal(v.source,'kopis');assert.equal(v.fetchedAt,new Date(f.time).toISOString())}
 assert.equal(f.writes,4)
})

test('no previous snapshot means real error, no empty success or cache write; concurrent calls coalesce',async()=>{
 const f=fixture();f.mode='http';await assert.rejects(f.service().search(query));assert.equal(f.records.size,0);assert.equal(f.writes,0)
 f.mode='ok';const s=f.service();const [a,b]=await Promise.all([s.search(query),s.search({...query,page:2})]);assert.equal(a.total,b.total);assert.equal(f.writes,1);assert.equal(f.gets,4)
})

test('REST adapter uses exact table/filters and one atomic POST; payload projection strips raw metadata',async()=>{
 const f=fixture();await f.service().search(query);const value=f.records.get(listCacheKey(query)),calls=[];let saved
 const adapter=createSupabaseBrowserCache({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE'},now:()=>initial,fetchImpl:async(url,init)=>{
  calls.push(init.method);assert.equal(url.pathname,'/rest/v1/concert_browser_cache');assert.equal(init.headers.Authorization,'Bearer PRIVATE')
  if(init.method==='POST'){assert.equal(url.searchParams.get('on_conflict'),'cache_key');assert.equal(init.headers.Prefer,'resolution=merge-duplicates,return=minimal');saved=JSON.parse(init.body);return {ok:true,status:201}}
  assert.equal(url.searchParams.get('cache_key'),'eq.'+listCacheKey(query));assert.equal(url.searchParams.get('cache_kind'),'eq.list');return {ok:true,json:async()=>[{payload:saved.payload,fetched_at:saved.fetched_at}]}
 }})
 await adapter.write(listCacheKey(query),'list',{...value,rawXml:'SECRET',apiKey:'PRIVATE',concerts:value.concerts.map(c=>({...c,raw_text:'SECRET'}))})
 assert.deepEqual(await adapter.read(listCacheKey(query),'list'),value);assert.deepEqual(calls,['POST','GET']);assert.ok(!/PRIVATE|SECRET/.test(JSON.stringify(saved)))
 assert.equal(publicCachePayload('list',{...value,upstreamQuery:'SECRET'}).upstreamQuery,undefined)
})

test('browser detail stale never becomes fresh or younger; server-function failure falls back only through 24h',async()=>{
 let time=initial+7*3600000,calls=0,fail=false,stale=true
 const data={concert:{kopisId:'PF1000'},fetchedAt:new Date(initial).toISOString()}
 const client=createConcertSearchClient({now:()=>time,fetchImpl:async()=>{calls++;if(fail)throw Error('server function 502');return {ok:true,json:async()=>({...data,stale,source:'supabase-cache'})}}})
 const a=await client.detail('PF1000'),b=await client.detail('PF1000');assert.equal(calls,2);assert.equal(a.fetchedAt,b.fetchedAt);assert.equal(b.stale,true)
 fail=true;const c=await client.detail('PF1000');assert.equal(c.source,'browser-cache');assert.equal(c.fetchedAt,data.fetchedAt)
 time=initial+STALE_MS;assert.equal((await client.detail('PF1000')).stale,true);time++;await assert.rejects(client.detail('PF1000'));assert.equal(calls,5)
})

test('API and upstream telemetry share generated request ID without logging query or body',async()=>{
 const f=fixture(),apiLogs=[],handler=createConcertApiHandler(f.service(),{logger:r=>apiLogs.push(r)})
 const res={writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.data=JSON.parse(body)}}
 await handler({method:'GET',url:'/api/concerts?'+new URLSearchParams(query)},res)
 assert.equal(res.status,200);assert.ok(f.logs.every(r=>r.requestId===res.headers['X-Request-ID']));assert.equal(apiLogs[0].requestId,f.logs[0].requestId)
 assert.deepEqual(Object.keys(apiLogs[0]).sort(),['durationMs','httpStatus','page','requestId','stage','upstreamType']);assert.ok(!JSON.stringify(apiLogs).includes('서울'))
})

test('browser rechecks 24h expiration after awaiting a failed server request',async()=>{
 let time=initial,fail=false
 const client=createConcertSearchClient({now:()=>time,fetchImpl:async()=>{if(fail){time=initial+STALE_MS+1;throw Error('timeout')}return {ok:true,json:async()=>({concert:{kopisId:'PF1000'},fetchedAt:new Date(initial).toISOString()})}}})
 await client.detail('PF1000');time=initial+STALE_MS-1;fail=true;await assert.rejects(client.detail('PF1000'))
})
