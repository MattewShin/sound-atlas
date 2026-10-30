import test from 'node:test'
import assert from 'node:assert/strict'
import {createKopisService} from './kopis.mjs'
import {parseKopisXml,normalizeKopisDetail} from './kopisData.mjs'
import {createConcertSearchService} from './concertSearchService.mjs'
import {createConcertApiHandler} from './api.mjs'
import {createVercelConcertHandler} from './vercel.mjs'
import {validateConcertQuery,getInitialConcertPeriod} from '../src/data/concertSearchConfig.js'
const now=()=>Date.parse('2026-10-29T03:00:00Z'),query={region:'서울',from:'2026-10-29',to:'2026-11-28'},row=(id,extra={})=>({mt20id:'PF'+id,prfnm:'클래식 '+id,prfpdfrom:'2026.10.30',prfpdto:'2026.11.01',fcltynm:'테스트홀',area:'서울특별시',genrenm:'서양음악(클래식)',prfstate:'공연예정',poster:'https://example.com/poster.jpg',...extra})
const xml=rows=>'<dbs>'+rows.map(r=>'<db>'+Object.entries(r).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</db>').join('')+'</dbs>',response=rows=>({ok:true,text:async()=>xml(rows)})
const mockResponse=()=>({writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.data=JSON.parse(body);this.writableEnded=true}})

test('query enforces 31 inclusive days, page bounds and today+30 KST defaults',()=>{
 assert.deepEqual(getInitialConcertPeriod(now()),{from:query.from,to:query.to});assert.equal(validateConcertQuery(query).page,1)
 for(const input of [{...query,to:'2026-11-29'},{...query,from:'2026-02-30'},{...query,region:'unknown'},{...query,page:0},{...query,page:501},{...query,page:'1.5'},{...query,q:'a'.repeat(101)}])assert.throws(()=>validateConcertQuery(input))
 assert.equal(validateConcertQuery({...query,q:' hall ',page:'2'}).q,'hall')
})
test('KOPIS pagination, CCCA/two states, exact total, dedup, start-date order and 20-row pages need no detail calls',async()=>{
 const calls=[],all=Array.from({length:125},(_,i)=>row(1000+i,{prfpdfrom:i%2?'2026.11.01':'2026.10.30'}))
 const service=createKopisService({env:{KOPIS_SERVICE_KEY:'synthetic'},now,delay:async()=>{},fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');calls.push(url);assert.equal(url.pathname,'/openApi/restful/pblprfr');assert.equal(url.searchParams.get('shcate'),'CCCA');assert.equal(url.searchParams.get('signgucode'),'11');assert.equal(url.searchParams.get('stdate'),'20261029');assert.equal(url.searchParams.get('eddate'),'20261128');assert.equal(url.searchParams.get('rows'),'100');const page=Number(url.searchParams.get('cpage'));return response(url.searchParams.get('prfstate')==='01'?all.slice((page-1)*100,page*100):[all[0],row(5000,{prfpdto:'2026.10.28',prfpdfrom:'2026.10.01'}),row(5001,{area:'부산광역시'}),row(5002,{genrenm:'연극'}),row(5003,{prfstate:'공연완료'})])}})
 const a=await service.search(query),b=await service.search({...query,page:2});assert.equal(a.total,125);assert.equal(a.concerts.length,20);assert.equal(b.concerts.length,20);assert.equal(new Set([...a.concerts,...b.concerts].map(c=>c.kopisId)).size,40);assert.equal(a.hasMore,true);assert.equal(calls.length,3);assert.equal(b.fromCache,true);assert.ok(a.concerts.every(c=>c.dateFrom==='2026-10-30'))
 const filtered=await service.search({...query,q:'테스트홀'});assert.equal(filtered.total,125);assert.equal(calls.length,3);assert.equal((await service.search({...query,q:'없는 이름'})).total,0)
})
test('detail normalizes only provided KOPIS fields, images in source order and safe named booking links',async()=>{
 const detail=normalizeKopisDetail({...row(1),prfage:'8세 이상',pcseguidance:'전석 2만원',prfcast:'출연진',dtguidance:'토요일 19:00',prfruntime:'90분',entrpsnmH:'주최',entrpsnmA:'기획',styurls:{styurl:['https://example.com/first.jpg','https://example.com/second.jpg']},relates:{relate:[{relatenm:'예매처',relateurl:'https://example.com/ticket'},{relatenm:'unsafe',relateurl:'javascript:alert(1)'}]}},new Date(now()).toISOString())
 assert.equal(detail.age,'8세 이상');assert.equal(detail.ticketPrice,'전석 2만원');assert.equal(detail.organizations.length,2);assert.deepEqual(detail.introductionImages,['https://example.com/first.jpg','https://example.com/second.jpg']);assert.deepEqual(detail.bookingLinks,[{name:'예매처',url:'https://example.com/ticket'}]);assert.equal(detail.programEvidence,undefined)
 const empty=normalizeKopisDetail(row(2),new Date(now()).toISOString());assert.deepEqual(empty.bookingLinks,[]);assert.deepEqual(empty.introductionImages,[])
 let calls=0;const service=createKopisService({env:{KOPIS_SERVICE_KEY:'synthetic'},now,delay:async()=>{},fetchImpl:async url=>{calls++;assert.equal(url.pathname,'/openApi/restful/pblprfr/PF1');return response([row(1)])}});assert.equal((await service.detail('PF1')).concert.kopisId,'PF1');await service.detail('PF1');assert.equal(calls,1);await assert.rejects(service.detail('../invalid'));assert.equal(calls,1)
})
test('upstream error/invalid XML is an error without cache; refresh fallback is explicitly stale',async()=>{
 for(const body of ['<html>error</html>','<dbs><db><returncode>02</returncode><errmsg>AUTH</errmsg></db></dbs>','<!DOCTYPE dbs><dbs/>','<dbs><db><mt20id>bad</mt20id></db></dbs>'])assert.throws(()=>parseKopisXml(body))
 let failing=false,calls=0;const service=createKopisService({env:{KOPIS_SERVICE_KEY:'synthetic-secret'},now,delay:async()=>{},logger(){},fetchImpl:async()=>{calls++;if(failing)throw Error('sensitive internal URL');return response([])}});const good=await service.search(query);failing=true;const fallback=await service.search(query,true);assert.equal(fallback.stale,true);assert.equal(fallback.fetchedAt,good.fetchedAt);assert.equal(calls,3)
 await assert.rejects(createKopisService({env:{},now}).search(query),e=>e.code==='KOPIS_NOT_CONFIGURED')
})
test('API is GET-only, retires song/program/match routes and preserves real error status',async()=>{
 let searches=0,details=0;const api=createConcertApiHandler({config:()=>({configured:true}),search:async q=>{searches++;assert.equal(q.page,'2');return {ok:true}},detail:async id=>{details++;return {id}}})
 for(const [method,url,status]of [['POST','/api/concerts/match-batch',405],['GET','/api/concerts/PF1/program',404],['GET','/api/concerts?targetTrackId=old',400],['GET','/api/concerts?region=서울&from=2026-10-29&to=2026-11-28&page=2',200],['GET','/api/concerts/PF1',200]]){const res=mockResponse();await api({method,url},res);assert.equal(res.status,status)}assert.equal(searches,1);assert.equal(details,1)
 const service=createConcertSearchService({env:{CONCERT_SEARCH_BACKEND:'supabase'}});assert.equal(service.backend,'kopis');assert.equal(service.config().configured,false);assert.equal(service.matchBatch,undefined)
})
test('Vercel rewrites list and selected detail routes without temporary OCR configuration',async()=>{
 const handler=createVercelConcertHandler({service:{config:()=>({configured:true,genre:'CCCA'}),detail:async id=>({id})}})
 for(const [url,field,value]of [['/api/index?__concertPath=concerts/status','genre','CCCA'],['/api/index?__concertPath=concerts/PF1','id','PF1']]){const res=mockResponse();await handler({method:'GET',url},res);assert.equal(res.status,200);assert.equal(res.data[field],value)}
})
