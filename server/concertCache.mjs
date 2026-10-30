import {createHash} from 'node:crypto'
import {safeUrl,apiDate} from './kopisData.mjs'

export const FRESH_MS=6*60*60*1000,STALE_MS=24*60*60*1000
export const listCacheKey=({region,from,to})=>'list:v1:'+createHash('sha256').update(JSON.stringify({region,from,to,genre:'CCCA',states:['01','02']})).digest('hex')
const strings=['id','kopisId','title','dateFrom','dateTo','venue','region','genre','performanceStatus','sourceLabel','fetchedAt']
const detailStrings=['scheduleText','runtime','age','ticketPrice','performers']
const cleanConcert=(c,detail)=>{
 if(!c||!/^PF\d{1,12}$/.test(c.kopisId)||!c.title||!apiDate(c.dateFrom)||!apiDate(c.dateTo)||c.dateFrom>c.dateTo||c.genre!=='서양음악(클래식)')throw Error('CACHE_PAYLOAD_INVALID')
 const value=Object.fromEntries([...strings,...(detail?detailStrings:[])].map(k=>[k,typeof c[k]==='string'?c[k]:'']))
 value.posterUrl=safeUrl(c.posterUrl);value.sourceUrl=safeUrl(c.sourceUrl)
 if(detail){
  if(!Array.isArray(c.organizations)||!Array.isArray(c.introductionImages)||!Array.isArray(c.bookingLinks))throw Error('CACHE_PAYLOAD_INVALID')
  value.organizations=c.organizations.map(o=>({label:String(o.label||''),name:String(o.name||'')}))
  value.introductionImages=c.introductionImages.map(safeUrl).filter(Boolean)
  value.bookingLinks=c.bookingLinks.map(o=>({name:String(o.name||''),url:safeUrl(o.url)})).filter(o=>o.name&&o.url)
 }
 return value
}
// Positive field projection: raw XML, upstream URLs/queries and credentials have no storage path.
export const publicCachePayload=(kind,payload)=>{
 if(kind==='list'&&Array.isArray(payload?.concerts))return {concerts:payload.concerts.map(c=>cleanConcert(c,false))}
 if(kind==='detail'&&payload?.concert)return {concert:cleanConcert(payload.concert,true)}
 throw Error('CACHE_PAYLOAD_INVALID')
}
export const createSupabaseBrowserCache=({env=process.env,fetchImpl=fetch,now=Date.now}={})=>{
 const endpoint=env.SUPABASE_URL?.trim(),key=env.SUPABASE_SERVICE_ROLE_KEY?.trim()
 if(!endpoint||!key)return null
 const request=async(params,init={})=>{
  const url=new URL('/rest/v1/concert_browser_cache',endpoint);url.search=new URLSearchParams(params).toString()
  const response=await fetchImpl(url,{method:'GET',...init,redirect:'error',signal:AbortSignal.timeout(4000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers}})
  if(!response.ok)throw Object.assign(Error('CACHE_UNAVAILABLE'),{httpStatus:response.status})
  return response
 }
 return {
  async read(cacheKey,kind){
   const response=await request({cache_key:'eq.'+cacheKey,cache_kind:'eq.'+kind,select:'payload,fetched_at',limit:'1'})
   const rows=await response.json();if(!Array.isArray(rows)||rows.length>1)throw Error('CACHE_PAYLOAD_INVALID')
   if(!rows.length)return null
   const stamp=Date.parse(rows[0].fetched_at),age=now()-stamp
   if(!Number.isFinite(stamp)||age<0||age>STALE_MS)return null
   return {...publicCachePayload(kind,rows[0].payload),fetchedAt:new Date(stamp).toISOString()}
  },
  async write(cacheKey,kind,value){
   await request({on_conflict:'cache_key'},{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({cache_key:cacheKey,cache_kind:kind,payload:publicCachePayload(kind,value),fetched_at:value.fetchedAt,updated_at:new Date(now()).toISOString()})})
  },
 }
}
