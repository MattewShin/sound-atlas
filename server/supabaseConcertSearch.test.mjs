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
import {createHash} from 'node:crypto'

const SEARCH_VERSION='stored-program-2'
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-fixture-key', CONCERT_SEARCH_BACKEND: 'supabase' }
const now = () => Date.parse('2026-10-15T01:00:00Z')
const query = { region: '서울', from: '2026-10-15', to: '2026-11-14', targetTrackId: 'beethoven-sonata-op27-2-no14-m2' }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const fixture = (n, changes = {}) => {
 const row={
  id: id(n), concert_id: id(900+n), track_id: query.targetTrackId, work_id: 'beethoven-sonata-op27-2-no14',
  relation: 'EXACT', outcome: 'MATCHED', review_status: 'CONFIRMED', effective_status: 'CONFIRMED',
  is_effectively_confirmed: true, analysis_is_current: true, stale_reason: null, matcher_version: SEARCH_VERSION, catalog_hash: CATALOG_HASH,
  source_url: 'https://kopis.or.kr/upload/source.png',
  confirmed_work_identity_hash:workIdentity(JSON.parse(CATALOG_JSON),'beethoven-sonata-op27-2-no14').hash,
  confirmation_matcher_version:SEARCH_VERSION,confirmation_pipeline_version:EASYOCR_PIPELINE_VERSION,
  concerts: { kopis_id: 'PF999900', title: 'Local confirmed concert', venue: 'Local hall', region: '서울',
    start_date: '2026-10-17', end_date: '2026-10-17', performance_status: '공연예정', synced_at: '2026-10-15T00:00:00Z' },
  // Even unexpected extra fields from an upstream response cannot enter the DTO.
  raw_text: 'PRIVATE OCR', evidence: [{ bbox: [1,2,3,4] }], review_note: 'PRIVATE NOTE', ...changes,
 }
 row.concerts={...row.concerts,id:row.concert_id}
 return row
}
const create = (rows, calls = [], {official=[],sources=[],cap=100,hook}={}) => createSupabaseConcertSearch({ env, now, delay: async()=>{}, fetchImpl: async(url,options)=>{
  url=new URL(url)
  calls.push({ url, method: options.method })
  assert.equal(options.method, 'GET')
  assert.equal(options.body,undefined);assert.equal(options.headers.Prefer,'count=exact')
  assert.equal(url.origin, env.SUPABASE_URL)
  const name=url.pathname.split('/').pop()
  const concerts=new Map([...rows,...official].map(r=>[r.concert_id,{...r.concerts,program_context_revision:0,kopis_detail_text:null,kopis_detail_text_hash:null}]))
  for(const c of sources)concerts.set(c.id,c)
  let data=name==='concert_program_candidate_status'?rows:name==='concert_program_text_confirmation_status'?official:name==='concerts'?[...concerts.values()]:null
  assert.ok(data,'unexpected endpoint')
  const filter=url.searchParams.get('id')
  if(filter?.startsWith('in.(')){const ids=filter.slice(4,-1).split(',');data=data.filter(r=>ids.includes(r.id))}
  const cursor=filter?.startsWith('gt.')?filter.slice(3):/^\(id.gt.(.*)\)$/.exec(url.searchParams.get('and')||'')?.[1]
  if(cursor)data=data.filter(r=>r.id>cursor)
  data=[...data].sort((a,b)=>a.id.localeCompare(b.id));const total=data.length,page=data.slice(0,cap)
  const range=page.length?`0-${page.length-1}/${total}`:'*/0'
  const overridden=hook?.({name,url,options,calls,data:page,range})
  return overridden??new Response(JSON.stringify(page),{headers:{'content-range':range}})
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
  assert.equal(calls.length,6,'status/source GETs and rechecks only; no operational HTTP or write')
})

test('DB search preserves overlapping periods, nationwide search, KST expiry and candidate pagination',async()=>{
  const calls=[]
  const service=create([...Array.from({length:100},(_,i)=>fixture(i+1)),fixture(101,{concerts:{...fixture(1).concerts,kopis_id:'PF999901',region:'부산',start_date:'2026-10-01',end_date:'2026-10-15'}})],calls)
  const result=await service.search({...query,region:'전국',from:'2026-10-01',to:'2026-10-31'})
  assert.equal(result.concerts.length,2)
  assert.equal(calls.length,10)
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
  assert.equal(calls.length,4)
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
  assert.equal(calls.length,4)
})

const sha=text=>createHash('sha256').update(text).digest('hex')
const officialFixture=(n,changes={})=>{
  const ocr=fixture(n),text='PRIVATE Program source\r\n[Program]\r\nL. van Beethoven\r\nPiano Sonata No.14 Op.27 No.2\r\nII. Allegretto'
  const source={...ocr.concerts,program_context_revision:0,kopis_detail_text:text,kopis_detail_text_hash:sha(text)}
  const row={id:id(n),candidate_id:id(200+n),analysis_id:id(400+n),concert_id:ocr.concert_id,track_id:ocr.track_id,work_id:ocr.work_id,
    source_kind:'KOPIS_DETAIL_TEXT',status:'CONFIRMED',source_hash:sha(text),payload_hash:'a'.repeat(64),catalog_hash:CATALOG_HASH,
    matcher_version:'stored-program-4',decision_version:'program-text-confirm-1',evidence_hash:'b'.repeat(64),candidate_snapshot_hash:'c'.repeat(64),
    work_identity_hash:ocr.confirmed_work_identity_hash,verification_hash:'d'.repeat(64),analysis_is_current:true,policy_enabled:true,
    relation:'EXACT',outcome:'MATCHED',stale_reason:null,is_effectively_confirmed:true,concerts:ocr.concerts,...changes}
  return {row,source}
}

test('valid official receipt wins over OCR for same KOPIS/track with unchanged public DTO keys and no private source leakage',async()=>{
  const {row,source}=officialFixture(1),calls=[],service=create([fixture(1)],calls,{official:[row],sources:[source]})
  const out=await service.search(query),concert=out.concerts[0]
  assert.equal(out.concerts.length,1);assert.equal(out.analysisVersion,SEARCH_VERSION);assert.equal(concert.programAnalysisVersion,'stored-program-4')
  const legacy=(await create([fixture(1)]).search(query)).concerts[0]
  assert.deepEqual(Object.keys(concert).sort(),Object.keys(legacy).sort());assert.deepEqual(Object.keys(concert.targetMatch).sort(),Object.keys(legacy.targetMatch).sort())
  assert.equal(concert.targetMatch.evidenceSourceUrl,concert.sourceUrl)
  for(const s of ['PRIVATE','kopis_detail_text','work_identity_hash','verification_hash','candidate_id','raw_text','identity_snapshot'])assert.ok(!JSON.stringify(out).includes(s),s)
  const params=calls.find(c=>c.url.pathname.endsWith('text_confirmation_status')).url.searchParams
  assert.equal(params.get('matcher_version'),'eq.stored-program-4');assert.equal(params.get('decision_version'),'eq.program-text-confirm-1')
  assert.equal(params.get('work_identity_hash'),'eq.'+row.work_identity_hash)
  assert.ok(!params.get('select').includes('kopis_detail_text'));assert.ok(calls.every(c=>c.method==='GET'))
})

test('official source suppresses OCR even without any receipt, with stale receipt, or with wrong identity/hash/policy/version',async()=>{
  const {row,source}=officialFixture(1)
  for(const official of [[],[{...row,is_effectively_confirmed:false,stale_reason:'SOURCE_HASH_CHANGED_OR_INVALID'}],
    [{...row,work_identity_hash:'e'.repeat(64)}],[{...row,source_hash:'e'.repeat(64)}],[{...row,policy_enabled:false}],
    [{...row,matcher_version:SEARCH_VERSION}],[{...row,decision_version:'unknown'}],[{...row,track_id:'wrong-track'}]]){
    const out=await create([fixture(1)],[],{official,sources:[source]}).search(query);assert.deepEqual(out.concerts,[])
  }
})

test('router-equivalent OCR fallback for absent Program, biography, unsupported markup and mismatched official hash',async()=>{
  const {row,source}=officialFixture(1)
  for(const c of [{...source,kopis_detail_text:null,kopis_detail_text_hash:null},
    {...source,kopis_detail_text:'Biography\nPrevious repertoire',kopis_detail_text_hash:sha('Biography\nPrevious repertoire')},
    {...source,kopis_detail_text:'<div>Program: Beethoven</div>',kopis_detail_text_hash:sha('<div>Program: Beethoven</div>')},
    {...source,kopis_detail_text_hash:'f'.repeat(64)}]){
    const out=await create([fixture(1)],[],{official:[row],sources:[c]}).search(query)
    assert.equal(out.concerts.length,1);assert.equal(out.concerts[0].programAnalysisVersion,SEARCH_VERSION)
  }
})

test('official date/region/status/track/work boundaries and stable sorting remain server-checked',async()=>{
  const {row,source}=officialFixture(1)
  for(const change of [{region:'부산'},{start_date:'2026-11-15',end_date:'2026-11-15'},{start_date:'2026-10-14',end_date:'2026-10-14'},
    {performance_status:'취소'},{performance_status:'공연완료'}]){
    const c={...source,...change},r={...row,concerts:{...row.concerts,...change}}
    assert.equal((await create([],[],{official:[r],sources:[c]}).search(query)).concerts.length,0)
  }
  const other=fixture(2,{concerts:{...fixture(2).concerts,kopis_id:'PF999901',start_date:'2026-10-16',end_date:'2026-10-16'}})
  const out=await create([other,fixture(1)],[],{official:[row],sources:[source]}).search(query)
  assert.deepEqual(out.concerts.map(c=>c.kopisId),['PF999901','PF999900'])
})

test('exact ranges continue through smaller server caps; missing view, malformed or partial pages and limit exhaustion fail closed',async()=>{
  const data=Array.from({length:3},(_,i)=>fixture(i+1)),calls=[]
  assert.equal((await create(data,calls,{cap:1}).search(query)).concerts.length,1)
  assert.equal(calls.filter(c=>c.url.pathname.endsWith('candidate_status')).length,6)
  for(const hook of [
    ({name})=>name==='concert_program_text_confirmation_status'?new Response(JSON.stringify({code:'PGRST205'}),{status:404}):undefined,
    ({name})=>name==='concert_program_text_confirmation_status'?new Response('{}',{headers:{'content-range':'*/0'}}):undefined,
    ({name,data})=>name==='concert_program_candidate_status'?new Response(JSON.stringify(data)):undefined,
    ({name,data})=>name==='concert_program_candidate_status'?new Response(JSON.stringify(data),{headers:{'content-range':'0-99/100'}}):undefined,
    ({name,data})=>name==='concert_program_candidate_status'?new Response(JSON.stringify(data),{headers:{'content-range':'0-0/*'}}):undefined,
  ])await assert.rejects(create([fixture(1)],[],{hook}).search(query),e=>e.code==='DB_SEARCH_UNAVAILABLE')
  const many=Array.from({length:51},(_,i)=>fixture(i+1))
  await assert.rejects(create(many,[],{cap:1}).search(query),e=>e.code==='DB_SEARCH_UNAVAILABLE')
  const {row,source}=officialFixture(1)
  for(const malformed of [{...row,candidate_id:undefined},{...row,policy_enabled:'true'},{...row,evidence_hash:'invalid'}]){
    await assert.rejects(create([fixture(1)],[],{official:[malformed],sources:[source]}).search(query),e=>e.code==='DB_SEARCH_UNAVAILABLE')
  }
})

test('status, concert source/context or count changes across GETs invalidate entire result without fallback or leaked diagnostics',async()=>{
  const {row,source}=officialFixture(1)
  for(const mode of ['source','context','status','count']){
    let sourceReads=0,statusReads=0
    const service=create([fixture(1)],[],{official:[row],sources:[source],hook:({name,data,range})=>{
      if(name==='concert_program_text_confirmation_status'&&++statusReads>1&&mode==='status')return new Response('[]',{headers:{'content-range':'*/0'}})
      if(name==='concerts'&&++sourceReads>1){
        const changed=structuredClone(data)
        if(mode==='source')changed[0].kopis_detail_text+=' PRIVATE changed source'
        if(mode==='context')changed[0].program_context_revision++
        if(['source','context'].includes(mode))return new Response(JSON.stringify(changed),{headers:{'content-range':range}})
      }
      if(mode==='count'&&name==='concert_program_candidate_status')return new Response(JSON.stringify(data),{headers:{'content-range':'0-0/2'}})
    }})
    await assert.rejects(service.search(query),e=>{assert.ok(!JSON.stringify(e).includes('PRIVATE'));return e.code==='DB_SEARCH_UNAVAILABLE'})
  }
})
