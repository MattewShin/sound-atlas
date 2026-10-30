import {CONCERT_CACHE_TTL_MS,concertQueryKey,koreaDate} from './concertSearchConfig.js'
const MAX_STALE_MS=24*60*60*1000
export const uniqueConcerts=concerts=>[...new Map(concerts.filter(c=>/^PF\d+$/.test(c.kopisId)).map(c=>[c.kopisId,c])).values()]
export const createConcertSearchClient=({fetchImpl=(...args)=>fetch(...args),now=Date.now}={})=>{
 const cache=new Map()
 const request=async(url,{signal}={})=>{
  let response,data
  try{response=await fetchImpl(url,{method:'GET',cache:'no-store',signal});data=await response.json()}
  catch{if(signal?.aborted)throw Object.assign(Error('조회가 취소됐어요.'),{code:'ABORTED'});throw Error('공연 서버에 연결할 수 없어요. 다시 시도해주세요.')}
  if(!response.ok)throw Error(data.message||'공연 정보를 불러오지 못했어요.')
  return data
 }
 const cached=async(key,refresh,load)=>{
  const entry=cache.get(key),age=now()-Date.parse(entry?.fetchedAt),ttl=entry?.cacheTtlMs??CONCERT_CACHE_TTL_MS
  if(!refresh&&entry&&!entry.stale&&age>=0&&age<Math.min(ttl,CONCERT_CACHE_TTL_MS))return {...entry,fromCache:true}
  try{
   const data=await load(),dataAge=now()-Date.parse(data.fetchedAt)
   if(dataAge<0||dataAge>MAX_STALE_MS)throw Error('공연 정보가 만료됐어요. 다시 조회해주세요.')
   // Keep the server's original timestamp, including for a stale response.
   cache.delete(key);cache.set(key,data);if(cache.size>100)cache.delete(cache.keys().next().value);return data
  }catch(e){const fallbackAge=now()-Date.parse(entry?.fetchedAt);if(e.code!=='ABORTED'&&entry&&fallbackAge>=0&&fallbackAge<=MAX_STALE_MS)return {...entry,stale:true,source:'browser-cache',fromCache:true};throw e}
 }
 return {
  status:()=>request('/api/concerts/status'),
  search(query,{refresh=false,signal}={}){
   const key=concertQueryKey(query)
   return cached('list:'+koreaDate(now())+':'+key,refresh,async()=>{
    const data=await request('/api/concerts?'+new URLSearchParams({...JSON.parse(key),...(refresh?{refresh:'1'}:{})}),{signal})
    if(!Array.isArray(data.concerts)||!data.query||concertQueryKey(data.query)!==key||!Number.isSafeInteger(data.total)||data.total<0||data.pageSize!==20||typeof data.hasMore!=='boolean'||data.concerts.length>20||!Number.isFinite(Date.parse(data.fetchedAt)))throw Error('공연 목록 응답을 확인할 수 없어요.')
    return {...data,concerts:uniqueConcerts(data.concerts)}
   })
  },
  detail(id,{refresh=false,signal}={}){
   if(!/^PF\d{1,12}$/.test(id))throw Error('공연 ID가 올바르지 않아요.')
   return cached('detail:'+id,refresh,async()=>{const data=await request('/api/concerts/'+id+(refresh?'?refresh=1':''),{signal});if(data.concert?.kopisId!==id||!Number.isFinite(Date.parse(data.fetchedAt)))throw Error('공연 상세 응답을 확인할 수 없어요.');return data})
  },
 }
}
