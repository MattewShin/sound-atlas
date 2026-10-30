import {ConcertApiError} from './kopisData.mjs'
import {randomUUID} from 'node:crypto'
export const createConcertApiHandler=(service,{logger=record=>console.info(JSON.stringify(record)),now=Date.now}={})=>async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost')
 if(!url.pathname.startsWith('/api/'))return next?.()
 const requestId=randomUUID(),started=now(),context={requestId}
 const respond=(status,data)=>{try{logger({httpStatus:status,stage:status>=400?'API_ERROR':null,page:null,upstreamType:'API_JSON',durationMs:Math.max(0,now()-started),requestId})}catch{};res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Request-ID':requestId});res.end(JSON.stringify(data))}
 try{
  if(req.method!=='GET')return respond(405,{code:'METHOD_NOT_ALLOWED',message:'공연 정보는 조회만 지원합니다.'})
  if(url.pathname==='/api/concerts/status')return respond(200,service.config())
  const refresh=url.searchParams.get('refresh')==='1'
  if(url.pathname==='/api/concerts'){
   if(url.searchParams.has('targetTrackId'))return respond(400,{code:'SONG_SEARCH_RETIRED',message:'지역과 날짜로 공연을 찾아주세요.'})
   return respond(200,await service.search({region:url.searchParams.get('region'),from:url.searchParams.get('from'),to:url.searchParams.get('to'),q:url.searchParams.get('q')||'',page:url.searchParams.get('page')||'1'},refresh,context))
  }
  const match=url.pathname.match(/^\/api\/concerts\/(PF\d+)$/)
  if(match)return respond(200,await service.detail(match[1],refresh,context))
  return respond(404,{code:'NOT_FOUND',message:'요청 경로를 찾지 못했습니다.'})
 }catch(e){if(res.destroyed||res.writableEnded)return;respond(e instanceof ConcertApiError?e.status:500,{code:e instanceof ConcertApiError?e.code:'INTERNAL_ERROR',message:e instanceof ConcertApiError?e.message:'공연 정보를 불러오지 못했어요.'})}
}
