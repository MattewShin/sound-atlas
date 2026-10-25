import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload,programTextCodePointMap,programTextPayloadHash,createProgramTextAnalysisStore,PROGRAM_TEXT_SAVE_RPC} from './supabaseProgramTextAnalysis.mjs'

const hash=text=>createHash('sha256').update(text).digest('hex')
const input=()=>{
  const text='🎹 e\u0301 안내\r\n[Program]\r\nF. Chopin (e\u0301 🎹)\r\nScherzo No.4 in E Major, Op.54'
  const concert={id:'00000000-0000-4000-8000-000000000001',title:'Text adapter fixture',venue:'Local hall',start_date:'2099-10-23',end_date:'2099-10-23',program_context_revision:0,kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
  const source=routeProgramSource(concert),analysis=analyzeSelectedProgramSource({concert,source})
  return {concert,analysis}
}
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'}

test('official adapter converts every quote/section to code points without normalizing CRLF, combining characters or emoji',()=>{
  const data=input(),before=structuredClone(data),p=buildProgramTextAnalysisPayload(data),text=data.concert.kopis_detail_text
  assert.deepEqual(data,before);assert.equal(p.offset_unit,'UNICODE_CODE_POINT');assert.equal(p.source_kind,'KOPIS_DETAIL_TEXT')
  assert.equal(p.source_hash,hash(text));assert.equal(p.matcher_version,'stored-program-4')
  let quotes=0
  const visit=v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){
    if(Object.hasOwn(v,'quote')){quotes++;assert.equal([...text].slice(v.start,v.end).join(''),v.quote);assert.equal(text.slice(v.diagnostic_utf16.start,v.diagnostic_utf16.end),v.quote)}
    Object.values(v).forEach(visit)
  }}
  visit(p);assert.ok(quotes>3)
  assert.ok(p.source_sections[0].start<p.source_sections[0].diagnostic_utf16.start)
  assert.ok(!Object.hasOwn(p,'image_id'));assert.ok(!Object.hasOwn(p,'ocr_result_id'))
  const {payload_hash,...body}=p;assert.equal(payload_hash,programTextPayloadHash(body))
  assert.deepEqual(buildProgramTextAnalysisPayload(data),p)
  const map=programTextCodePointMap('a🎹e\u0301');assert.equal(map.get(3),2);assert.equal(map.has(2),false)
  for(const text of ['\ud800','\udc00','\0'])assert.throws(()=>programTextCodePointMap(text),/INVALID_UNICODE/)
})

test('non-official, stale hash, bad UTF-16 boundaries, altered quotes and fake OCR IDs are rejected before transport',async()=>{
  const mutations=[
    d=>{d.analysis.source_kind='OCR'},d=>{d.analysis.offset_unit='UNICODE_CODE_POINT'},
    d=>{d.concert.kopis_detail_text_hash='f'.repeat(64)},d=>{d.analysis.text_hash='f'.repeat(64)},
    d=>{d.analysis.source_sections[0].start_offset++},d=>{d.analysis.image_id='fake'},
    d=>{d.analysis.candidates[0].evidence[0].quote='changed'},
    d=>{d.analysis.candidates[0].evidence[0].start=1},
  ]
  const calls=[],store=createProgramTextAnalysisStore({env,fetchImpl:()=>{calls.push('fetch');throw Error('MUST_NOT_FETCH')}})
  for(const change of mutations){const d=input();change(d);await assert.rejects(store.save(d))}
  assert.deepEqual(calls,[])
})

test('text save preflight rejects absent RPC and non-enabled policy with no POST or OCR-RPC fallback',async()=>{
  for(const [paths,policy] of [[{},[{enabled:true}]],[{['/rpc/'+PROGRAM_TEXT_SAVE_RPC]:{}},[]],
    [{['/rpc/'+PROGRAM_TEXT_SAVE_RPC]:{}},[{enabled:false}]],[{['/rpc/'+PROGRAM_TEXT_SAVE_RPC]:{}},[{enabled:'true'}]]]){
    const calls=[],store=createProgramTextAnalysisStore({env,fetchImpl:async(url,init)=>{
      calls.push(init.method);assert.equal(init.method,'GET')
      if(url.pathname.endsWith('concert_program_version_policy'))assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
      return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:policy))
    }})
    await assert.rejects(store.save(input()),/MIGRATION_REQUIRED|VERSION_DISABLED|VERSION_POLICY_REQUIRED/)
    assert.ok(calls.every(m=>m==='GET'))
  }
})

test('enabled text adapter sends only the dedicated RPC and never falls back after its 404',async()=>{
  const calls=[];let missing=false
  const store=createProgramTextAnalysisStore({env,fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method})
    if(init.method==='POST'){
      assert.equal(url.pathname,'/rest/v1/rpc/'+PROGRAM_TEXT_SAVE_RPC)
      const p=JSON.parse(init.body).p_analysis;assert.equal(p.offset_unit,'UNICODE_CODE_POINT');assert.equal(p.source_kind,'KOPIS_DETAIL_TEXT')
      return new Response(JSON.stringify(missing?{code:'PGRST202'}:'mock-analysis-id'),{status:missing?404:200})
    }
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths:{['/rpc/'+PROGRAM_TEXT_SAVE_RPC]:{}}}:[{enabled:true}]))
  }})
  assert.equal(await store.save(input()),'mock-analysis-id');missing=true;await assert.rejects(store.save(input()))
  assert.equal(calls.filter(c=>c.method==='POST').length,2)
})
