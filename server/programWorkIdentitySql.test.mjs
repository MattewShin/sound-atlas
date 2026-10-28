import {legacyAnalysisFixture,legacyRematchFixture} from './testSupport/legacyProgramFixture.mjs'
import {searchFixture} from './testSupport/searchFixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {CATALOG_JSON,CATALOG_HASH,analyzeStoredProgram,hashJson} from './programAnalysis.mjs'
import {workIdentity,confirmationValidity} from './programWorkIdentity.mjs'
import {buildRematchCandidate} from './programRematch.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {createSupabaseConcertSearch} from './supabaseConcertSearch.mjs'

test('work identity SQL: immutable receipts, safe legacy backfill, rematch history, freshness, cache coexistence and least privilege',async()=>{
 const db=new PGlite(),migration=new URL('../supabase/migrations/202610210001_program_work_identity.sql',import.meta.url)
 const rows=async(table)=>(await db.query('select * from public.'+table)).rows
 const rehash=a=>{const {payload_hash,...body}=a;return {...body,payload_hash:hashJson(body)}}
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
  for(const file of ['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
  await db.exec(await readFile(new URL('../supabase/drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql',import.meta.url),'utf8'))
  await db.exec('set role service_role')
  const concert={kopis_id:'PF900777',title:'Identity fixture',venue:'Fixture hall',region:'서울',start_date:'2099-01-01',end_date:'2099-01-01',performance_status:'공연예정',synced_at:'2026-10-21T00:00:00Z'}
  await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(concert),JSON.stringify(['a','b','c'].map((n,sort_order)=>({source_url:`https://kopis.or.kr/upload/identity-${n}.jpg`,image_type:'DETAIL',sort_order})))])
  const storedConcert=(await rows('concerts'))[0],images=(await rows('concert_program_images')).sort((a,b)=>a.sort_order-b.sort_order),payloads=[]
  const current=JSON.parse(CATALOG_JSON),old=structuredClone(current),newTrack='brahms-intermezzo-op118-no2'
  assert(old.works[newTrack]);delete old.works[newTrack];old.targets=old.targets.filter(t=>t.workId!==newTrack)
  const oldJson=JSON.stringify(old),oldHash=hashJson(old)
  for(const [i,text]of ['PROGRAM\nF Chopin\nBallade No.4 in F Minor Op.52','PROGRAM\nF Liszt\nLiebestraum No.3 S.541','PROGRAM\nJ Brahms\nIntermezzo in A Major Op.118 No.2'].entries()){
   const image=images[i],attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,content_sha256:String(i+1).repeat(64),pipeline_version:EASYOCR_PIPELINE_VERSION,status:'SUCCEEDED',started_at:'2026-10-21T00:00:00Z',finished_at:'2026-10-21T00:00:01Z',duration_ms:1000}
   await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text:text,detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:300})])
   const ocr=(await rows('concert_image_ocr_results')).find(o=>o.image_id===image.id)
   let a=legacyAnalysisFixture(analyzeStoredProgram({concert:{...storedConcert,...concert},image,ocr,attempt}));assert.equal(a.candidates.length,1)
   if(i===2){const c=a.candidates[0],d=legacyRematchFixture(buildRematchCandidate({...c,id:randomUUID()},{catalog:old,catalogHash:oldHash}));a.candidates=[{...d,logical_work_id:c.logical_work_id}];a.logical_works[0].catalog_matches=[d];assert.equal(d.track_id,null)}
   a=rehash({...a,catalog_hash:oldHash});const aid=(await db.query('select public.save_concert_program_analysis_v3($1,$2) id',[JSON.stringify(a),oldJson])).rows[0].id
   const c=(await rows('concert_program_candidates')).find(c=>c.analysis_id===aid);payloads.push({payload:a,aid,candidate:c,ocr})
  }
  const first=payloads[0],second=payloads[1],third=payloads[2]
  await db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[first.candidate.id,'CONFIRMED','Checked original',first.aid,'stored-program-3',oldHash])
  const original=(await rows('concert_program_reviews'))[0],beforeCandidate=(await rows('concert_program_candidates')).find(c=>c.id===first.candidate.id)
  await db.exec('reset role');await db.exec(await readFile(migration,'utf8'));await db.exec('set role service_role')
  assert.equal((await rows('concert_program_reviews')).length,1)
  let status=(await rows('concert_program_candidate_status')).find(c=>c.id===first.candidate.id)
  assert.equal(status.stale_reason,'CONFIRMATION_IDENTITY_MISSING');assert.equal(status.is_effectively_confirmed,false)
  const allHashes=await db.query('select key,public.program_work_identity_hash($1::jsonb,key) hash from jsonb_object_keys(($1::jsonb)->\'works\') key',[CATALOG_JSON])
  for(const r of allHashes.rows)assert.equal(r.hash,workIdentity(current,r.key).hash,'JS/SQL canonical identity: '+r.key)
  const nullable=structuredClone(current);nullable.works[first.candidate.work_id].aliases=null;nullable.works[first.candidate.work_id].title='\ufeff  Title\t with — spacing  \ufeff'
  assert.equal((await db.query('select public.program_work_identity_hash($1,$2) hash',[JSON.stringify(nullable),first.candidate.work_id])).rows[0].hash,workIdentity(nullable,first.candidate.work_id).hash)
  const expected=workIdentity(current,first.candidate.work_id).hash
  const backfillArgs=[first.candidate.id,original.id,CATALOG_JSON,expected,'a'.repeat(40),oldHash]
  const backfill=async args=>(await db.query('select public.backfill_concert_program_review_identity($1,$2,$3,$4,$5,$6) id',args)).rows[0].id
  await db.exec('reset role;begin')
  try{
   await db.query("update public.concert_program_candidates set identity=identity||'{\"unproven\":true}'::jsonb where id=$1",[first.candidate.id])
   await assert.rejects(backfill(backfillArgs),/Historical evidence unproven/i)
  }finally{await db.exec('rollback;set role service_role')}
  assert.equal(await backfill(backfillArgs),original.id);assert.equal(await backfill(backfillArgs),original.id)
  const receipt=(await rows('concert_program_reviews'))[0]
  for(const k of ['id','candidate_id','status','note','reviewed_at','reviewer_kind'])assert.deepEqual(receipt[k],original[k])
  assert.equal(receipt.work_identity_hash,expected);assert.equal((await rows('concert_program_reviews')).length,1)
  const afterCandidate=(await rows('concert_program_candidates')).find(c=>c.id===first.candidate.id)
  for(const key of Object.keys(beforeCandidate))assert.deepEqual(afterCandidate[key],beforeCandidate[key])
  status=(await rows('concert_program_candidate_status')).find(c=>c.id===first.candidate.id);assert.equal(status.is_effectively_confirmed,true)
  // Different full catalog, identical selected work: search works without a global hash predicate.
  const service=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',PROGRAM_SEARCH_VERSION:'stored-program-3'},now:()=>Date.parse('2099-01-01T00:00:00Z'),fetchImpl:searchFixture({
   ocrRows:()=>rows('concert_program_candidate_status'),concerts:()=>[{...storedConcert,...concert}],
   onRequest:url=>{assert(!url.searchParams.has('catalog_hash'));if(url.pathname.endsWith('/concert_program_candidate_status'))assert.equal(url.searchParams.get('confirmed_work_identity_hash'),'eq.'+expected)}
  })})
  assert.equal((await service.search({region:'서울',from:'2099-01-01',to:'2099-01-01',targetTrackId:'chopin-ballade-op52-no4'})).concerts.length,1)
  const changed=structuredClone(current);changed.works[first.candidate.work_id].opus=999
  assert.equal(confirmationValidity(status,{...changed,catalog_hash:'changed'},{version:'stored-program-3'}).stale_reason,'WORK_IDENTITY_CHANGED')
  await assert.rejects(backfill([...backfillArgs.slice(0,2),JSON.stringify(changed),expected,...backfillArgs.slice(4)]),/identity changed/i)
  await assert.rejects(db.query('update public.concert_program_reviews set note=$1 where id=$2',['bad',original.id]),/permission denied/i)
  await db.exec('reset role');await assert.rejects(db.query('update public.concert_program_reviews set note=$1 where id=$2',['bad',original.id]),/immutable/i);await db.exec('set role service_role')
  const checkMutation=async(sql,args,reason)=>{
   await db.exec('reset role;begin')
   try{await db.query(sql,args);const s=(await rows('concert_program_candidate_status')).find(c=>c.id===first.candidate.id);assert.equal(s.stale_reason,reason);assert.equal(s.is_effectively_confirmed,false)}finally{await db.exec('rollback;set role service_role')}
  }
  await checkMutation('update public.concert_image_ocr_results set content_sha256=$1 where id=$2',['f'.repeat(64),first.ocr.id],'EVIDENCE_CHANGED')
  await checkMutation('update public.concert_image_ocr_results set raw_text=raw_text||$1 where id=$2',[' changed',first.ocr.id],'EVIDENCE_CHANGED')
  await checkMutation('update public.concert_program_images set is_active=false where id=$1',[images[0].id],'EVIDENCE_CHANGED')
  await checkMutation('update public.concert_program_analyses set matcher_version=$1 where id=$2',['incompatible',first.aid],'MATCHER_VERSION_CHANGED')
  await checkMutation('update public.concert_program_candidates set relation=$1 where id=$2',['WHOLE_WORK_REFERENCE',first.candidate.id],'NOT_EXACT')
  // New manual reviews attest identity immediately; retries do not append events.
  const reviewArgs=[second.candidate.id,'CONFIRMED','Checked Liszt',second.aid,'stored-program-3',CATALOG_JSON]
  await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',reviewArgs)
  await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',reviewArgs)
  assert.equal((await rows('concert_program_reviews')).length,2)
  assert((await rows('concert_program_reviews')).every(r=>r.work_identity_hash))
  const rematch=legacyRematchFixture(buildRematchCandidate({...third.candidate,matcher_version:'stored-program-3'}))
  assert.equal(rematch.track_id,newTrack)
  const args=[third.candidate.id,CATALOG_JSON,JSON.stringify(rematch)]
  const rematchId=(await db.query('select public.save_concert_program_rematch($1,$2,$3) id',args)).rows[0].id
  assert.equal((await db.query('select public.save_concert_program_rematch($1,$2,$3) id',args)).rows[0].id,rematchId)
  assert.equal((await rows('concert_program_candidates')).filter(c=>c.rematch_source_candidate_id===third.candidate.id).length,1)
  assert.equal((await rows('concert_program_candidates')).find(c=>c.id===rematchId).review_status,'REVIEW_REQUIRED')
  assert.equal((await rows('concert_program_reviews')).length,2)
  await assert.rejects(db.query('select public.save_concert_program_rematch($1,$2,$3)',[...args.slice(0,2),JSON.stringify({...rematch,confidence:'LOW'})]),/increment matcher/i)
  await assert.rejects(db.query('select public.save_concert_program_rematch($1,$2,$3)',[first.candidate.id,CATALOG_JSON,JSON.stringify(rematch)]),/Reviewed/i)
  // A new catalog analysis can supersede the analysis cache without hiding the
  // old immutable, still-current OCR-backed manual confirmation.
  const expanded=rehash({...first.payload,catalog_hash:CATALOG_HASH})
  await db.query('select public.save_concert_program_analysis_v3($1,$2)',[JSON.stringify(expanded),CATALOG_JSON])
  assert.equal((await rows('concert_program_analyses')).find(a=>a.id===first.aid).is_current,false)
  assert.equal((await rows('concert_program_candidate_status')).find(c=>c.id===first.candidate.id).is_effectively_confirmed,true)
  assert.equal((await rows('concert_program_reviews')).length,2)
  await db.exec('reset role')
  for(const role of ['anon','authenticated']){
   for(const table of ['concert_program_reviews','concert_program_candidates','concert_program_analyses','concert_program_catalogs','concert_program_candidate_status'])assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT\') ok',[role,'public.'+table])).rows[0].ok,false)
   for(const fn of ['program_identity_canonical(jsonb)','program_identity_normalize(jsonb)','program_work_identity(jsonb,text)','program_work_identity_hash(jsonb,text)','program_candidate_snapshot_valid(uuid)','protect_program_review_identity()','program_confirmation_evidence_hash(uuid)','review_concert_program_candidate_identity(uuid,text,text,uuid,text,text)','backfill_concert_program_review_identity(uuid,uuid,text,text,text,text)','save_concert_program_rematch(uuid,text,jsonb)'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,'public.'+fn])).rows[0].ok,false)
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.concert_program_reviews'::regclass")).rows[0].relrowsecurity,true)
  assert.equal((await db.query("select has_function_privilege('service_role','public.review_concert_program_candidate(uuid,text,text,uuid,text,text)','EXECUTE') ok")).rows[0].ok,false)
 }finally{await db.close()}
})
