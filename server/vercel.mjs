import {createConcertSearchService} from './concertSearchService.mjs'
import {createConcertApiHandler} from './api.mjs'
export const createVercelConcertHandler=({env=process.env,service=createConcertSearchService({env})}={})=>{
 const api=createConcertApiHandler(service)
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.searchParams.get('__concertPath')
  if(path!==null){url.pathname='/api/'+path;url.searchParams.delete('__concertPath');req.url=url.pathname+url.search}
  return api(req,res,()=>{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'NOT_FOUND',message:'요청 경로를 찾지 못했습니다.'}))})
 }
}
