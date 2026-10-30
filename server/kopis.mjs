import {randomUUID} from 'node:crypto'
import {ConcertApiError,parseKopisXml,normalizeKopisConcert,normalizeKopisDetail,text} from './kopisData.mjs'
import {createSupabaseBrowserCache,publicCachePayload,listCacheKey,FRESH_MS,STALE_MS} from './concertCache.mjs'
import {KOPIS_REGION_CODES,MAX_CONCERT_SEARCH_DAYS,validateConcertQuery,koreaDate} from '../src/data/concertSearchConfig.js'
export {ConcertApiError,parseKopisXml,normalizeKopisConcert} from './kopisData.mjs'

export const createKopisService=({env=process.env,fetchImpl=fetch,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms)),store=createSupabaseBrowserCache({env,fetchImpl,now}),logger=record=>console.info(JSON.stringify(record))}={})=>{
 const key=env.KOPIS_SERVICE_KEY?.trim(),cache=new Map(),pending=new Map();let queue=Promise.resolve()
 // Only bounded metadata reaches the logger; never raw exceptions, paths or payloads.
 const log=(ctx,stage,httpStatus,upstreamType,started,page=null)=>{try{logger({httpStatus,stage,page,upstreamType,durationMs:Math.max(0,now()-started),requestId:ctx.requestId})}catch{/* Logging must not fail a query. */}}
 const context=input=>({requestId:/^[a-zA-Z0-9_-]{1,80}$/.test(input?.requestId||'')?input.requestId:randomUUID()})
 const requestXml=(path,params,ctx)=>{
  if(!key)throw new ConcertApiError('KOPIS_NOT_CONFIGURED','공연 정보 연동 설정을 확인해주세요.',503)
  const result=queue.then(async()=>{
   const started=now(),page=params.cpage?Number(params.cpage):null,url=new URL('https://kopis.or.kr/openApi/restful/'+path)
   url.search=new URLSearchParams({service:key,...params}).toString()
   let status=null,type='NETWORK',stage='KOPIS_CONNECT_FAILED'
   try{
    const response=await fetchImpl(url,{method:'GET',signal:AbortSignal.timeout(15000),redirect:'error'});status=response.status||200
    if(!response.ok){type='HTTP';stage='KOPIS_HTTP_ERROR';throw Error()}
    type='XML';stage='KOPIS_XML_INVALID';const xml=await response.text()
    if(xml.length>3_000_000)throw Error()
    const rows=parseKopisXml(xml);log(ctx,null,status,type,started,page);return rows
   }catch(e){
    if(['TimeoutError','AbortError'].includes(e?.name)){stage='KOPIS_TIMEOUT';type='TIMEOUT'}
    log(ctx,stage,status,type,started,page)
    throw Object.assign(new ConcertApiError(stage,'공연 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'),{upstreamStatus:status,upstreamType:type})
   }
  });queue=result.then(()=>delay(150),()=>delay(150));return result
 }
 const remember=(k,v)=>{cache.delete(k);cache.set(k,v);if(cache.size>100)cache.delete(cache.keys().next().value)}
 const age=e=>now()-Date.parse(e?.fetchedAt),usable=e=>e&&age(e)>=0&&age(e)<=STALE_MS
 const cached=async(cacheKey,kind,refresh,ctx,loader)=>{
  let entry=cache.get(cacheKey),source='memory-cache'
  if(!refresh&&usable(entry)&&age(entry)<FRESH_MS)return {...entry,stale:false,source,fromCache:true,cacheTtlMs:FRESH_MS}
  if(pending.has(cacheKey))return pending.get(cacheKey)
  const request=(async()=>{
   if(store){const started=now();try{const stored=await store.read(cacheKey,kind);if(usable(stored)&&(!usable(entry)||Date.parse(stored.fetchedAt)>=Date.parse(entry.fetchedAt))){entry=stored;source='supabase-cache';remember(cacheKey,entry)}}catch(e){log(ctx,'CACHE_READ_FAILED',e.httpStatus||null,'SUPABASE_JSON',started)}}
   if(!refresh&&usable(entry)&&age(entry)<FRESH_MS)return {...entry,stale:false,source,fromCache:true,cacheTtlMs:FRESH_MS}
   try{
    const value={...publicCachePayload(kind,await loader()),fetchedAt:new Date(now()).toISOString()}
    if(store){const started=now();try{await store.write(cacheKey,kind,value)}catch(e){log(ctx,'CACHE_WRITE_FAILED',e.httpStatus||null,'SUPABASE_JSON',started)}}
    remember(cacheKey,value);return {...value,stale:false,source:'kopis',fromCache:false,cacheTtlMs:FRESH_MS}
   }catch(e){if(usable(entry))return {...entry,stale:true,source,fromCache:true,cacheTtlMs:FRESH_MS};throw e}
  })()
  pending.set(cacheKey,request);try{return await request}finally{if(pending.get(cacheKey)===request)pending.delete(cacheKey)}
 }
 const search=async(input,refresh=false,inputContext)=>{
  let query;try{query=validateConcertQuery(input)}catch(e){throw new ConcertApiError('INVALID_QUERY',e.message,400)}
  const ctx=context(inputContext),{region,from,to,q,page}=query
  const result=await cached(listCacheKey(query),'list',refresh,ctx,async()=>{
   const unique=new Map(),started=now();let completed=0,lastPage=1
   try{
    for(const state of ['01','02']){
     let finished=false
     for(let cpage=1;cpage<=50;cpage++){
      lastPage=cpage
      const rows=await requestXml('pblprfr',{stdate:from.replaceAll('-',''),eddate:to.replaceAll('-',''),cpage:String(cpage),rows:'100',shcate:'CCCA',prfstate:state,...(region==='전국'?{}:{signgucode:KOPIS_REGION_CODES[region]})},ctx)
      for(const row of rows){if(text(row.genrenm)!=='서양음악(클래식)')continue;const c=normalizeKopisConcert({...row,prfstate:row.prfstate||(state==='01'?'공연예정':'공연중')},new Date(now()).toISOString());if((region==='전국'||c.region===region)&&c.dateFrom<=to&&c.dateTo>=from&&['공연예정','공연중'].includes(c.performanceStatus))unique.set(c.kopisId,c)}
      completed++;if(rows.length<100){finished=true;break}
     }
     if(!finished)throw new ConcertApiError('KOPIS_PAGE_INCOMPLETE','공연이 많아요. 지역이나 기간을 좁혀 다시 조회해주세요.')
    }
   }catch(e){if(completed)log(ctx,'KOPIS_PAGE_INCOMPLETE',e.upstreamStatus||null,e.upstreamType||'XML',started,lastPage);throw e}
   return {concerts:[...unique.values()].sort((a,b)=>a.dateFrom.localeCompare(b.dateFrom)||a.kopisId.localeCompare(b.kopisId))}
  })
  const current=result.concerts.filter(c=>c.dateTo>=koreaDate(now())),needle=q.normalize('NFKC').toLocaleLowerCase('ko-KR'),filtered=current.filter(c=>!needle||[c.title,c.venue].some(v=>v.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(needle))),offset=(page-1)*20
  return {...result,query,genre:'CCCA',total:filtered.length,page,pageSize:20,hasMore:offset+20<filtered.length,concerts:filtered.slice(offset,offset+20)}
 }
 const detail=async(kopisId,refresh=false,inputContext)=>{
  if(!/^PF\d{1,12}$/.test(kopisId))throw new ConcertApiError('INVALID_QUERY','공연 ID가 올바르지 않습니다.',400)
  const ctx=context(inputContext)
  return cached('detail:v1:'+kopisId,'detail',refresh,ctx,async()=>{const rows=await requestXml('pblprfr/'+kopisId,{},ctx),row=rows.find(r=>text(r.mt20id)===kopisId);if(!row||text(row.genrenm)!=='서양음악(클래식)')throw new ConcertApiError('PERFORMANCE_NOT_FOUND','공연 상세 정보를 찾지 못했어요.',404);return {concert:normalizeKopisDetail(row,new Date(now()).toISOString())}})
 }
 return {backend:'kopis',config:()=>({configured:Boolean(key),backend:'kopis',genre:'CCCA',cacheTtlMs:FRESH_MS,staleMaxAgeMs:STALE_MS,persistentCacheConfigured:Boolean(store),maxSearchDays:MAX_CONCERT_SEARCH_DAYS,pageSize:20}),search,detail,close(){cache.clear();pending.clear()}}
}
