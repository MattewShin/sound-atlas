import {ConcertApiError,parseKopisXml,normalizeKopisConcert,normalizeKopisDetail,text} from './kopisData.mjs'
import {CONCERT_CACHE_TTL_MS,KOPIS_REGION_CODES,MAX_CONCERT_SEARCH_DAYS,validateConcertQuery,koreaDate} from '../src/data/concertSearchConfig.js'
export {ConcertApiError,parseKopisXml,normalizeKopisConcert} from './kopisData.mjs'

// Read-only KOPIS proxy. No database client, OCR worker or registered-song dependency.
export const createKopisService=({env=process.env,fetchImpl=fetch,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms))}={})=>{
 const key=env.KOPIS_SERVICE_KEY?.trim(),ttl=env.CONCERT_CACHE_TTL_MS===undefined?CONCERT_CACHE_TTL_MS:Number(env.CONCERT_CACHE_TTL_MS)
 if(!Number.isSafeInteger(ttl)||ttl<0)throw Error('CONCERT_CACHE_TTL_MS must be a non-negative integer')
 const cache=new Map(),pending=new Map();let queue=Promise.resolve()
 const requireKey=()=>{if(!key)throw new ConcertApiError('KOPIS_NOT_CONFIGURED','공연 정보 연동 설정을 확인해주세요.',503)}
 const requestXml=(path,params={})=>{
  requireKey()
  const result=queue.then(async()=>{
   const url=new URL('https://kopis.or.kr/openApi/restful/'+path);url.search=new URLSearchParams({service:key,...params}).toString()
   try{const response=await fetchImpl(url,{method:'GET',signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error();const xml=await response.text();if(xml.length>3_000_000)throw Error();return parseKopisXml(xml)}
   catch(e){if(e instanceof ConcertApiError)throw e;throw new ConcertApiError('KOPIS_UNAVAILABLE','공연 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')}
  });queue=result.then(()=>delay(150),()=>delay(150));return result
 }
 const cached=async(cacheKey,refresh,loader)=>{
  requireKey();const entry=cache.get(cacheKey),age=now()-Date.parse(entry?.fetchedAt)
  if(!refresh&&entry&&age>=0&&age<ttl)return {...entry,fromCache:true,cacheTtlMs:ttl}
  if(!refresh&&pending.has(cacheKey))return pending.get(cacheKey)
  const request=(async()=>{const value={...await loader(),fetchedAt:new Date(now()).toISOString()};cache.delete(cacheKey);cache.set(cacheKey,value);if(cache.size>100)cache.delete(cache.keys().next().value);return {...value,fromCache:false,cacheTtlMs:ttl}})()
  pending.set(cacheKey,request);try{return await request}finally{if(pending.get(cacheKey)===request)pending.delete(cacheKey)}
 }
 const search=async(input,refresh=false)=>{
  let query;try{query=validateConcertQuery(input)}catch(e){throw new ConcertApiError('INVALID_QUERY',e.message,400)}
  const {region,from,to,q,page}=query
  const result=await cached('list:'+JSON.stringify({region,from,to}),refresh,async()=>{
   const unique=new Map()
   for(const state of ['01','02']){
    let finished=false
    for(let cpage=1;cpage<=50;cpage++){
     const rows=await requestXml('pblprfr',{stdate:from.replaceAll('-',''),eddate:to.replaceAll('-',''),cpage:String(cpage),rows:'100',shcate:'CCCA',prfstate:state,...(region==='전국'?{}:{signgucode:KOPIS_REGION_CODES[region]})})
     for(const row of rows){if(text(row.genrenm)!=='서양음악(클래식)')continue;const c=normalizeKopisConcert({...row,prfstate:row.prfstate||(state==='01'?'공연예정':'공연중')},new Date(now()).toISOString());if((region==='전국'||c.region===region)&&c.dateFrom<=to&&c.dateTo>=from&&['공연예정','공연중'].includes(c.performanceStatus))unique.set(c.kopisId,c)}
     if(rows.length<100){finished=true;break}
    }
    if(!finished)throw new ConcertApiError('SEARCH_TOO_LARGE','공연이 많아요. 지역이나 기간을 좁혀 다시 조회해주세요.')
   }
   return {concerts:[...unique.values()].sort((a,b)=>a.dateFrom.localeCompare(b.dateFrom)||a.kopisId.localeCompare(b.kopisId))}
  })
  const current=result.concerts.filter(c=>c.dateTo>=koreaDate(now())),needle=q.normalize('NFKC').toLocaleLowerCase('ko-KR'),filtered=current.filter(c=>!needle||[c.title,c.venue].some(v=>v.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(needle))),offset=(page-1)*20
  return {...result,query,genre:'CCCA',total:filtered.length,page,pageSize:20,hasMore:offset+20<filtered.length,concerts:filtered.slice(offset,offset+20)}
 }
 const detail=async(kopisId,refresh=false)=>{
  if(!/^PF\d{1,12}$/.test(kopisId))throw new ConcertApiError('INVALID_QUERY','공연 ID가 올바르지 않습니다.',400)
  return cached('detail:'+kopisId,refresh,async()=>{const rows=await requestXml('pblprfr/'+kopisId),row=rows.find(r=>text(r.mt20id)===kopisId);if(!row)throw new ConcertApiError('PERFORMANCE_NOT_FOUND','공연 상세 정보를 찾지 못했어요.',404);if(text(row.genrenm)!=='서양음악(클래식)')throw new ConcertApiError('PERFORMANCE_NOT_FOUND','클래식 공연 정보를 찾지 못했어요.',404);return {concert:normalizeKopisDetail(row,new Date(now()).toISOString())}})
 }
 return {backend:'kopis',config:()=>({configured:Boolean(key),backend:'kopis',genre:'CCCA',cacheTtlMs:ttl,maxSearchDays:MAX_CONCERT_SEARCH_DAYS,pageSize:20}),search,detail,close(){cache.clear();pending.clear()}}
}
