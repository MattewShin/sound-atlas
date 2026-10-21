import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createSupabaseConcertSearch } from './supabaseConcertSearch.mjs'
import { createConcertSearchService } from './concertSearchService.mjs'
import { createConcertApiHandler } from './api.mjs'
import { createVercelConcertHandler } from './vercel.mjs'
import { CATALOG_HASH,CATALOG_JSON } from './programAnalysis.mjs'
import {workIdentity} from './programWorkIdentity.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

const SEARCH_VERSION='stored-program-2'
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-fixture-key', CONCERT_SEARCH_BACKEND: 'supabase' }
const now = () => Date.parse('2026-10-15T01:00:00Z')
const query = { region: '서울', from: '2026-10-15', to: '2026-11-14', targetTrackId: 'beethoven-sonata-op27-2-no14-m2' }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const fixture = (n, changes = {}) => ({
  id: id(n), concert_id: id(900), track_id: query.targetTrackId, work_id: 'beethoven-sonata-op27-2-no14',
  relation: 'EXACT', outcome: 'MATCHED', review_status: 'CONFIRMED', effective_status: 'CONFIRMED',
  is_effectively_confirmed: true, analysis_is_current: true, stale_reason: null, matcher_version: SEARCH_VERSION, catalog_hash: CATALOG_HASH,
  source_url: 'https://kopis.or.kr/upload/source.png',
  confirmed_work_identity_hash:workIdentity(JSON.parse(CATALOG_JSON),'beethoven-sonata-op27-2-no14').hash,
  confirmation_matcher_version:SEARCH_VERSION,confirmation_pipeline_version:EASYOCR_PIPELINE_VERSION,
  concerts: { kopis_id: 'PF999900', title: 'Local confirmed concert', venue: 'Local hall', region: '서울',
    start_date: '2026-10-17', end_date: '2026-10-17', performance_status: '공연예정', synced_at: '2026-10-15T00:00:00Z' },
  // Even unexpected extra fields from an upstream response cannot enter the DTO.
  raw_text: 'PRIVATE OCR', evidence: [{ bbox: [1,2,3,4] }], review_note: 'PRIVATE NOTE', ...changes,
})
const create = (rows, calls = []) => createSupabaseConcertSearch({ env, now, delay: async()=>{}, fetchImpl: async(url,options)=>{
  calls.push({ url: new URL(url), method: options.method })
  assert.equal(options.method, 'GET')
  assert.equal(new URL(url).origin, env.SUPABASE_URL)
  assert.equal(new URL(url).pathname, '/rest/v1/concert_program_candidate_status')
  return { ok:true,json:async()=>typeof rows==='function'?rows(new URL(url)):rows }
} })
const serve = async(t,handler)=>{
  const server=createServer((req,res)=>void handler(req,res))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('DB search requires current compatible CONFIRMED EXACT evidence and projects only public fields', async()=>{
  const calls=[]
  const excluded=[
    {review_status:'REVIEW_REQUIRED'}, {review_status:'REJECTED'}, {effective_status:'REVIEW_REQUIRED'},
    {stale_reason:'LATEST_OCR_NOT_SUCCESSFUL',is_effectively_confirmed:false},
    {stale_reason:'IMAGE_INACTIVE_OR_NOT_DETAIL',is_effectively_confirmed:false},
    {analysis_is_current:false}, {is_effectively_confirmed:false}, {matcher_version:'stored-program-1'}, {confirmed_work_identity_hash:'b'.repeat(64)},
    {confirmed_work_identity_hash:null},{confirmation_pipeline_version:'incompatible'},
    {track_id:'beethoven-sonata-op27-2-no14-m1'}, {work_id:'another-work'},
    {relation:'WHOLE_WORK_REFERENCE'}, {relation:'ARRANGEMENT_OR_EXCERPT'}, {outcome:'CONFLICT'},
    {concerts:{...fixture(1).concerts,region:'부산'}},
    {concerts:{...fixture(1).concerts,performance_status:'공연완료'}},
    {concerts:{...fixture(1).concerts,performance_status:'취소'}},
    {concerts:{...fixture(1).concerts,start_date:'2026-11-15',end_date:'2026-11-15'}},
    {concerts:{...fixture(1).concerts,start_date:'2026-10-14',end_date:'2026-10-14'}},
  ]
  const service=create([fixture(1),...excluded.map((x,i)=>fixture(i+2,x)),fixture(90)],calls)
  const result=await service.search(query)
  assert.equal(result.concerts.length,1)
  const c=result.concerts[0]
  assert.deepEqual(c.programTrackIds,[query.targetTrackId])
  assert.equal(c.targetMatch.relation,'EXACT')
  assert.equal(c.targetMatch.reviewStatus,'CONFIRMED')
  assert.equal(c.startsAt,undefined)
  assert.equal(c.searchBackend,'supabase')
  for(const privateValue of ['PRIVATE','bbox','raw_text','review_note','candidate_key','catalog_hash','private-fixture-key']) assert.ok(!JSON.stringify(result).includes(privateValue),privateValue)
  const params=calls[0].url.searchParams
  for(const [key,value]of Object.entries({track_id:`eq.${query.targetTrackId}`,relation:'eq.EXACT',review_status:'eq.CONFIRMED',is_effectively_confirmed:'eq.true',stale_reason:'is.null',matcher_version:`eq.${SEARCH_VERSION}`,confirmed_work_identity_hash:`eq.${fixture(1).confirmed_work_identity_hash}`,'concerts.region':'eq.서울','concerts.end_date':'gte.2026-10-15'}))assert.equal(params.get(key),value,key)
  assert.equal(params.has('catalog_hash'),false)
  assert.ok(!params.get('select').includes('*'))
  assert.ok(!/(?:^|,)identity(?:,|$)|(?:^|,)evidence(?:,|$)|review_note|raw_text/.test(params.get('select')))
  assert.ok(!JSON.stringify(result).includes('confirmed_work_identity_hash'))
  assert.equal(calls.length,1,'one DB GET; no KOPIS, image, OCR, analysis RPC or write')
})

test('DB search preserves overlapping periods, nationwide search, KST expiry and candidate pagination',async()=>{
  const calls=[]
  const service=create(url=>url.searchParams.has('id')?[fixture(101,{concerts:{...fixture(1).concerts,kopis_id:'PF999901',region:'부산',start_date:'2026-10-01',end_date:'2026-10-15'}})]:Array.from({length:100},(_,i)=>fixture(i+1)),calls)
  const result=await service.search({...query,region:'전국',from:'2026-10-01',to:'2026-10-31'})
  assert.equal(result.concerts.length,2)
  assert.equal(calls.length,2)
  assert.equal(calls[1].url.searchParams.get('id'),`gt.${id(100)}`)
  assert.equal(calls[0].url.searchParams.has('concerts.region'),false)
  assert.equal(calls[0].url.searchParams.get('concerts.end_date'),'gte.2026-10-15')
  const earlier=create([],[])
  assert.deepEqual((await earlier.search({...query,from:'2026-09-01',to:'2026-09-30'})).concerts,[])
})

test('DB API distinguishes empty results, sanitized DB errors, bad input and disabled OCR routes',async(t)=>{
  const calls=[],service=create([],calls),base=await serve(t,createConcertApiHandler(service))
  const result=await fetch(base+'/api/concerts?'+new URLSearchParams(query))
  assert.equal(result.status,200);assert.deepEqual((await result.json()).concerts,[])
  for(const bad of [{targetTrackId:'not-a-track'},{targetTrackId:''},{region:'(or,true)'},{from:'2026-02-30'},{to:'2026-12-31'}]){
    const response=await fetch(base+'/api/concerts?'+new URLSearchParams({...query,...bad}));assert.equal(response.status,400)
  }
  for(const [path,method]of [['/api/concerts/match-batch','POST'],['/api/concerts/PF999900/program','GET'],['/api/concerts','POST']]){
    const response=await fetch(base+path,{method});assert.equal(response.status,405)
  }
  assert.equal(calls.length,1)
  const broken=createSupabaseConcertSearch({env,now,fetchImpl:async()=>{throw Error('SQL private-fixture-key INTERNAL_TABLE')},delay:async()=>{}})
  const failed=await serve(t,createConcertApiHandler(broken))
  const response=await fetch(failed+'/api/concerts?'+new URLSearchParams(query)),body=await response.json()
  assert.equal(response.status,503);assert.equal(body.code,'DB_SEARCH_UNAVAILABLE')
  assert.ok(!JSON.stringify(body).includes('SQL'));assert.ok(!JSON.stringify(body).includes('private-fixture-key'))
  await assert.rejects(createSupabaseConcertSearch({env:{},now}).search(query),e=>e.code==='DB_SEARCH_NOT_CONFIGURED')
})

test('one backend switch defaults to legacy; invalid values fail visibly; Vercel preview stays read only',async(t)=>{
  const legacy=createConcertSearchService({env:{}})
  assert.equal(legacy.backend,'kopis');assert.equal(legacy.config().backend,'kopis');await legacy.close()
  for(const value of ['','SUPABASE','unknown']){
    const invalid=createConcertSearchService({env:{CONCERT_SEARCH_BACKEND:value}})
    assert.throws(()=>invalid.config(),e=>e.code==='INVALID_SEARCH_BACKEND')
    const base=await serve(t,createConcertApiHandler(invalid))
    assert.equal((await fetch(base+'/api/concerts/status')).status,503)
  }
  const calls=[],service=create([],calls),base=await serve(t,createVercelConcertHandler({service}))
  const response=await fetch(base+'/api/index?'+new URLSearchParams({...query,__concertPath:'concerts'}))
  assert.equal(response.status,200);assert.equal((await response.json()).backend,'supabase')
  assert.equal(calls.length,1)
})
