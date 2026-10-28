import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {PROGRAM_SOURCE_VERSIONS,isSupportedProgramSourceVersion,getProgramRollout,getProgramWriteVersion} from './programRollout.mjs'
import {CATALOG_JSON,CATALOG_HASH,analyzeStoredProgram} from './programAnalysis.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {planIdentityBackfill} from './programIdentityBackfill.mjs'
import {buildRematchCandidate,rematchProgramCandidates} from './programRematch.mjs'
import {createProgramAnalysisStore} from './supabaseProgramAnalysis.mjs'

const versions=['stored-program-2','stored-program-3','stored-program-4']
const invalid=['stored-program-1','stored-program-99','',undefined,null,3,{},' stored-program-3 ']
const now=()=>Date.parse('2026-10-21T00:00:00Z')
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private'}
const work='chopin-ballade-op52-no4'
const backfillFixture=version=>{
  const catalog=JSON.parse(CATALOG_JSON)
  const row={id:randomUUID(),work_id:work,track_id:work,analysis_id:randomUUID(),kopis_id:'PF295548',catalog_hash:CATALOG_HASH,
    review_status:'CONFIRMED',relation:'EXACT',outcome:'MATCHED',matcher_version:version,review_note:'checked',analysis_is_current:true,stale_reason:null,
    concert:{end_date:'2099-01-01'},source_catalog:catalog,
    ocr:{id:'fixture-ocr',content_sha256:'bytes',pipeline_version:EASYOCR_PIPELINE_VERSION,raw_text:'x'},
    attempt:{result_id:'fixture-ocr',content_sha256:'bytes'},reviews:[{id:randomUUID(),status:'CONFIRMED',note:'checked',reviewed_at:'2026-10-20T00:00:00Z'}],
    candidate_key:'a'.repeat(64),identity:{},evidence:[{quote:'x',start:0,end:1}],section_index:0}
  row.analysis={snapshot:{candidates:[Object.fromEntries(['candidate_key','track_id','work_id','relation','outcome','section_index','identity','evidence'].map(k=>[k,structuredClone(row[k])]))]}}
  return {row,git:{commit:'a'.repeat(40),hash:CATALOG_HASH,catalog}}
}
const sourceFixture=version=>{
  const analysis=analyzeStoredProgram({concert:{id:randomUUID(),title:'Fixture',venue:'Hall',start_date:'2099-01-01',end_date:'2099-01-01'},
    image:{id:randomUUID(),evidence_revision:0},ocr:{id:randomUUID(),raw_text:'PROGRAM\nF Chopin\nBallade No.4 in F Minor Op.52',detections:[],width:800},attempt:{id:randomUUID()}})
  // Synthetic historical read row, never an analysis payload sent to old RPCs.
  return {...analysis.candidates[0],id:randomUUID(),generation_version:version,matcher_version:version,track_id:null,work_id:null,outcome:'UNREGISTERED',
    kopis_id:'PF900500',analysis_is_current:true,evidence_stale_reason:null,analysis:{id:randomUUID(),is_current:true,catalog_hash:'old',ocr_result_id:analysis.ocr_result_id},
    concert:{end_date:'2099-01-01'},review_history:[],existing_rematches:[]}
}

test('stored source versions are explicit, immutable and independent of rollout write/review/search/schedule defaults',()=>{
  assert.deepEqual(PROGRAM_SOURCE_VERSIONS,versions);assert.ok(Object.isFrozen(PROGRAM_SOURCE_VERSIONS))
  assert.deepEqual(getProgramRollout({}),{writeVersion:'stored-program-4',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:false})
  for(const version of versions)assert.equal(isSupportedProgramSourceVersion(version),true)
  for(const version of invalid)assert.equal(isSupportedProgramSourceVersion(version),false)
  for(const version of versions.slice(0,2))assert.throws(()=>getProgramWriteVersion({PROGRAM_ANALYSIS_WRITE_VERSION:version}),/INVALID/)
})

for(const version of versions)test(version+' backfill keeps provenance and every evidence/identity/Git/currentness guard',()=>{
  const f=backfillFixture(version),before=structuredClone(f)
  const plan=planIdentityBackfill([f.row],f.git,{now})
  assert.equal(plan.eligible,1);assert.equal(plan.db_writes,0);assert.equal(plan.results[0].reason,null);assert.deepEqual(f,before)
  const cases=[
    ['NOT_EXACT',x=>{x.row.review_status='REJECTED'}],
    ['REVIEW_EVENT_MISMATCH',x=>{x.row.reviews[0].note='changed'}],
    ['CONCERT_ENDED',x=>{x.row.concert.end_date='2026-10-20'}],
    ['EVIDENCE_CHANGED',x=>{x.row.analysis_is_current=false}],
    ['EVIDENCE_CHANGED',x=>{x.row.evidence_stale_reason='EVIDENCE_CHANGED'}],
    ['PIPELINE_VERSION_CHANGED',x=>{x.row.ocr.pipeline_version='old'}],
    ['EVIDENCE_CHANGED',x=>{x.row.attempt.content_sha256='changed'}],
    ['EVIDENCE_CHANGED',x=>{x.row.attempt.result_id='changed'}],
    ['HISTORICAL_EVIDENCE_UNPROVEN',x=>{x.row.analysis.snapshot=null}],
    ['HISTORICAL_EVIDENCE_UNPROVEN',x=>{x.row.ocr.raw_text='changed'}],
    ['GIT_CATALOG_SNAPSHOT_MISMATCH',x=>{x.git.hash='b'.repeat(64)}],
    ['WORK_REMOVED',x=>{x.currentCatalog=structuredClone(x.git.catalog);delete x.currentCatalog.works[work]}],
    ['WORK_IDENTITY_CHANGED',x=>{x.currentCatalog=structuredClone(x.git.catalog);x.currentCatalog.works[work].opus=999}],
  ]
  for(const [reason,change]of cases){const x=structuredClone(f);change(x);const result=planIdentityBackfill([x.row],x.git,{now,...(x.currentCatalog?{currentCatalog:x.currentCatalog}:{})});assert.equal(result.eligible,0,reason);assert.equal(result.results[0].reason,reason)}
})

test('unknown and missing source versions fail closed in backfill and rematch with no save or source mutation',async()=>{
  for(const version of invalid){
    const f=backfillFixture(version),s=sourceFixture(version),before=structuredClone(s)
    assert.equal(planIdentityBackfill([f.row],f.git,{now}).results[0].reason,'MATCHER_VERSION_CHANGED')
    const result=await rematchProgramCandidates({rematchSources:async()=>[s],saveRematch:()=>assert.fail('Invalid source save')},{now})
    assert.equal(result.rematched,0);assert.equal(result.skipped[0].reason,'MATCHER_VERSION_CHANGED');assert.equal(result.db_writes,0);assert.deepEqual(s,before)
  }
})

for(const version of versions)test(version+' source rematches to v4 only and retains manual/currentness/manifest safeguards',async()=>{
  const s=sourceFixture(version),before=structuredClone(s)
  const result=await rematchProgramCandidates({rematchSources:async()=>[s]},{now})
  assert.equal(result.matcher_version,'stored-program-4');assert.equal(result.results[0].source_matcher_version,version)
  assert.equal(result.results[0].candidate.generation_version,'stored-program-4');assert.equal(result.results[0].candidate.review_status,'REVIEW_REQUIRED')
  assert.deepEqual(result.results[0].candidate.evidence,s.evidence);assert.equal(result.db_writes,0);assert.deepEqual(s,before)
  for(const [change,reason]of [
    [x=>{x.review_status='CONFIRMED'},'MANUAL_REVIEW_PRESERVED'],
    [x=>{x.review_history=[{id:randomUUID()}]},'MANUAL_REVIEW_PRESERVED'],
    [x=>{x.protected_equivalent_review=true},'MANUAL_REVIEW_PRESERVED'],
    [x=>{x.concert.end_date='2026-10-20'},'CONCERT_ENDED'],
    [x=>{x.analysis.is_current=false},'EVIDENCE_CHANGED'],
    [x=>{x.evidence_stale_reason='EVIDENCE_CHANGED'},'EVIDENCE_CHANGED'],
    [x=>{x.analysis_is_current=false},'EVIDENCE_CHANGED'],
  ]){const x=structuredClone(s);change(x);const r=await rematchProgramCandidates({rematchSources:async()=>[x]},{now});assert.equal(r.rematched,0);assert.equal(r.skipped[0].reason,reason)}
  const outside=await rematchProgramCandidates({rematchSources:async()=>[s],manifestTargets:async()=>({targets:[]})},{now,manifest:{targets:[{ocr_result_id:s.analysis.ocr_result_id}]}})
  assert.equal(outside.skipped[0].reason,'OUTSIDE_ELIGIBLE_MANIFEST')
})

test('v2/v3 output requests are rejected before builder, source read, preflight or save',async()=>{
  const s=sourceFixture('stored-program-3'),before=structuredClone(s)
  const fail=()=>assert.fail('Old output version reached store')
  for(const version of [...versions.slice(0,2),...invalid]){
    if(version===undefined)continue // Omitted output uses the current implementation.
    assert.throws(()=>buildRematchCandidate(s,{version}),/WRITE_VERSION_NOT_IMPLEMENTED/)
    await assert.rejects(rematchProgramCandidates({preflightSave:fail,rematchSources:fail,saveRematch:fail},{save:true,manifest:{},version}),/WRITE_VERSION_NOT_IMPLEMENTED/)
  }
  assert.deepEqual(s,before)
})

test('old or unversioned rematch records cannot masquerade as current output; explicit v4 snapshot can be reused',async()=>{
  const s=sourceFixture('stored-program-3')
  for(const oldVersion of ['stored-program-2','stored-program-3',undefined]){
    s.existing_rematches=[{id:randomUUID(),matching_catalog_hash:CATALOG_HASH,generation_version:oldVersion}]
    const r=await rematchProgramCandidates({rematchSources:async()=>[s]},{now})
    assert.equal(r.reused,0);assert.equal(r.results[0].candidate_id,null);assert.equal(r.results[0].candidate.generation_version,'stored-program-4')
  }
  const existing={id:randomUUID(),matching_catalog_hash:CATALOG_HASH,matcher_version:'stored-program-3',rematch_snapshot:{generation_version:'stored-program-4'}}
  s.existing_rematches=[existing]
  const r=await rematchProgramCandidates({rematchSources:async()=>[s]},{now})
  assert.equal(r.reused,1);assert.equal(r.results[0].candidate_id,existing.id);assert.equal(r.db_writes,0)
})

test('adapter reads all supported legacy/current source versions with GET and retains source and review records',async()=>{
  const sources=[...versions,...invalid].map(sourceFixture),before=structuredClone(sources),calls=[]
  for(const s of sources){s.analysis.concert_id=randomUUID();s.concert={...s.concert,id:s.analysis.concert_id}}
  const stored=structuredClone(sources)
  const store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET');calls.push(url)
    const table=url.pathname.split('/').at(-1)
    const rows={concert_program_candidate_status:sources.map(s=>({...s,analysis_id:s.analysis.id})),concert_program_analyses:sources.map(s=>s.analysis),concerts:sources.map(s=>s.concert),concert_program_reviews:[]}
    assert.ok(Object.hasOwn(rows,table));return new Response(JSON.stringify(rows[table]))
  }})
  const rows=await store.rematchSources('PF900500')
  assert.deepEqual(rows.map(s=>s.matcher_version),versions)
  assert.equal(calls[0].searchParams.get('matcher_version'),'in.(stored-program-2,stored-program-3,stored-program-4)')
  assert.equal(calls[0].searchParams.get('kopis_id'),'eq.PF900500');assert.equal(calls.length,4)
  assert.deepEqual(sources,stored);assert.equal(before.length,stored.length)
})

for(const version of versions)test(version+' legacy/current save uses v4 RPC and enabled policy, without changing source or receipt',async()=>{
  const s=sourceFixture(version),before=structuredClone(s),calls=[]
  const paths=Object.fromEntries(['save_concert_program_analysis_v4','review_concert_program_candidate_identity','save_concert_program_rematch','save_concert_program_rematch_v4'].map(n=>['/rpc/'+n,{}]))
  const savedId=randomUUID(),store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method})
    if(init.method==='POST'){
      assert.equal(url.pathname,'/rest/v1/rpc/save_concert_program_rematch_v4')
      const body=JSON.parse(init.body);assert.equal(body.p_source_candidate_id,s.id)
      assert.equal(body.p_candidate.generation_version,'stored-program-4');assert.equal(body.p_candidate.review_status,'REVIEW_REQUIRED')
      return new Response(JSON.stringify(savedId))
    }
    assert.equal(init.method,'GET')
    if(url.pathname==='/rest/v1/')return new Response(JSON.stringify({paths}))
    assert.equal(url.pathname,'/rest/v1/concert_program_version_policy');assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
    return new Response(JSON.stringify([{enabled:true}]))
  }})
  store.rematchSources=async()=>[s];store.manifestTargets=async()=>({targets:[{ocr:{id:s.analysis.ocr_result_id}}]})
  const result=await rematchProgramCandidates(store,{now,save:true,manifest:{targets:[{ocr_result_id:s.analysis.ocr_result_id}]}})
  assert.equal(result.failures.length,0);assert.equal(result.results[0].candidate_id,savedId);assert.equal(result.results[0].source_matcher_version,version)
  assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(calls.filter(c=>c.path.endsWith('/concert_program_version_policy')).length,2)
  assert.deepEqual(s,before)
})

test('missing v4 rematch RPC or disabled policy blocks orchestrated save before source reads and POST',async()=>{
  for(const missing of [true,false]){
    const paths=Object.fromEntries(['save_concert_program_analysis_v4','review_concert_program_candidate_identity','save_concert_program_rematch',...(missing?[]:['save_concert_program_rematch_v4'])].map(n=>['/rpc/'+n,{}]))
    const calls=[],store=createProgramAnalysisStore({env,fetchImpl:async(url,init)=>{
      assert.equal(init.method,'GET');calls.push(init.method)
      return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:[{enabled:false}]))
    }})
    store.rematchSources=()=>assert.fail('Failed readiness read source')
    await assert.rejects(rematchProgramCandidates(store,{save:true,manifest:{targets:[]}}),missing?/PROGRAM_REMATCH_V4_MIGRATION_REQUIRED/:/VERSION_DISABLED/)
    assert.ok(calls.length>0)
  }
})
