import {legacyAnalysisFixture,legacyRematchFixture} from './testSupport/legacyProgramFixture.mjs'
import {searchFixture} from './testSupport/searchFixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {analyzeStoredProgram,CATALOG_JSON,CATALOG_HASH} from './programAnalysis.mjs'
import {AUTOMATION_RULE,automaticDecision} from './programAutomation.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {createSupabaseConcertSearch} from './supabaseConcertSearch.mjs'

test('automatic SQL receipts, deduplication, source races, reevaluation and actual search projection',async()=>{
 const db=new PGlite()
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
  for(const f of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql','migrations/202610150001_concert_program_analysis.sql',
   'drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql'])await db.exec(await readFile(new URL('../supabase/'+f,import.meta.url),'utf8'))
  await db.exec('set role service_role')
  const rows=async table=>(await db.query('select * from public.'+table)).rows
  const concert={kopis_id:'PF999777',title:'Automatic recital',venue:'Hall',region:'서울',start_date:'2099-10-27',end_date:'2099-10-27',performance_status:'공연예정',synced_at:'2026-10-22T00:00:00Z'}
  await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(concert),JSON.stringify(['a','b','c'].map((n,sort_order)=>({source_url:`https://kopis.or.kr/upload/auto-${n}.jpg`,image_type:'DETAIL',sort_order})))])
  const k=(await rows('concerts'))[0],images=(await rows('concert_program_images')).sort((a,b)=>a.sort_order-b.sort_order)
  const record=async(image,text,hash='a'.repeat(64),fail=false)=>{
   const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,content_sha256:hash,pipeline_version:EASYOCR_PIPELINE_VERSION,status:fail?'FAILED':'SUCCEEDED',error_code:fail?'OCR_IMAGE_REQUEST_FAILED':null,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),duration_ms:1}
   await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),fail?null:JSON.stringify({raw_text:text,detections:[],width:800,height:800,engine_version:'fixture',torch_version:'fixture',settings:{}})])
   return (await rows('concert_image_ocr_attempts')).find(x=>x.id===attempt.id)
  }
  const make=async(image,text,hash)=>{
   const attempt=await record(image,text,hash),ocr=(await rows('concert_image_ocr_results')).find(x=>x.id===attempt.result_id)
   const t={concert:{...k,...concert},image,attempt,ocr},a=legacyAnalysisFixture(analyzeStoredProgram(t))
   const id=(await db.query('select public.save_concert_program_analysis_v3($1,$2) id',[JSON.stringify(a),CATALOG_JSON])).rows[0].id
   return {a,id,t,c:(await rows('concert_program_candidates')).filter(c=>c.analysis_id===id)}
  }
  const input=async id=>(await db.query('select public.program_auto_input_hash($1,$2,$3) h',[id,CATALOG_HASH,AUTOMATION_RULE])).rows[0].h
  const decide=async (f,c=f.c[0],scope)=>{
   const verified=f.a.candidates.find(x=>x.candidate_key===c.candidate_key),d=automaticDecision(verified,f.a,f.t)
   return (await db.query('select public.decide_automatic_program_candidate($1,$2,$3,$4,$5,$6,$7,$8) r',
    [c.id,f.id,scope||await input(f.id),AUTOMATION_RULE,d.status,JSON.stringify(d.reasons),JSON.stringify(verified),CATALOG_JSON])).rows[0].r
  }
  const finish=async f=>db.query('select public.finish_automatic_program($1,$2,$3,$4) ok',[f.id,await input(f.id),CATALOG_HASH,AUTOMATION_RULE])
  const queue=async()=>(await db.query('select public.queue_automatic_programs($1,$2,$3) q',[20,CATALOG_HASH,AUTOMATION_RULE])).rows[0].q
  const f=await make(images[0],'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2')
  assert.equal((await decide(f)).outcome,'AUTO_CONFIRMED')
  assert.equal((await decide(f)).outcome,'UNCHANGED');assert.equal((await rows('concert_program_reviews')).length,1)
  assert.equal((await finish(f)).rows[0].ok,true);assert.equal((await queue()).length,0)
  await db.exec('begin')
  await db.query('update public.concert_program_candidates set identity=identity||$1::jsonb where id=$2',[JSON.stringify({composer:'wrong'}),f.c[0].id])
  assert((await queue()).some(x=>x.id===f.id),'candidate identity mismatch reopens a completed analysis')
  await db.exec('rollback')
  const second=await make(images[1],'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2')
  assert.equal((await decide(second)).outcome,'DUPLICATE_EFFECTIVE_CONFIRMATION')
  assert.equal((await rows('concert_program_candidate_status')).filter(c=>c.is_effectively_confirmed).length,1)
  const bad=await make(images[2],'PROGRAM\nJ Brahms\nIntermezzo Op.119 No.2')
  assert.equal((await decide(bad)).outcome,'AUTO_UNLINKED')
  assert.equal((await rows('concert_program_candidates')).find(c=>c.id===bad.c[0].id).review_status,'REJECTED')
  await finish(bad);assert(!(await queue()).some(x=>x.id===bad.id))
  const staleScope=await input(f.id)
  await record(images[2],'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2','b'.repeat(64))
  assert((await queue()).some(x=>x.id===bad.id),'new bytes automatically reopen unlinked work')
  assert.equal((await decide(f,f.c[0],staleScope)).outcome,'RETRY_PENDING','late stale write rejected')
  // Same source quote with a forged work identity is rejected inside the transaction.
  const verified={...f.a.candidates[0],work_id:'chopin-ballade-op52-no4'}
  await assert.rejects(db.query('select public.decide_automatic_program_candidate($1,$2,$3,$4,$5,$6,$7,$8)',[f.c[0].id,f.id,await input(f.id),AUTOMATION_RULE,'CONFIRMED','["SOURCE_AND_UNIQUE_IDENTITY_VERIFIED"]',JSON.stringify(verified),CATALOG_JSON]),/identity mismatch/i)
  // Failed download has no source-change evidence and must keep the public link.
  await record(images[0],null,null,true)
  assert.equal((await rows('concert_program_candidate_status')).find(c=>c.id===f.c[0].id).is_effectively_confirmed,true)
  const search=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',PROGRAM_SEARCH_VERSION:'stored-program-3'},now:()=>Date.parse('2099-10-27T00:00:00Z'),
   fetchImpl:searchFixture({ocrRows:()=>rows('concert_program_candidate_status'),concerts:()=>[{...k,...concert}]})})
  assert.equal((await search.search({region:'서울',from:'2099-10-27',to:'2099-10-27',targetTrackId:'brahms-intermezzo-op118-no2'})).concerts.length,1)
  await record(images[0],null,'c'.repeat(64),true)
  assert.equal((await rows('concert_program_candidate_status')).find(c=>c.id===f.c[0].id).is_effectively_confirmed,false,'known changed bytes invalidate old confirmation')
  assert.equal((await search.search({region:'서울',from:'2099-10-27',to:'2099-10-27',targetTrackId:'brahms-intermezzo-op118-no2'})).concerts.length,0)
  assert.equal((await decide(second)).outcome,'AUTO_CONFIRMED','valid duplicate automatically takes over when original source changes')
  const repaired=await make(images[2],'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2','b'.repeat(64))
  assert.equal((await decide(repaired)).outcome,'DUPLICATE_EFFECTIVE_CONFIRMATION','new evidence reevaluates the unlinked item')
  assert.equal((await decide(bad)).outcome,'RETRY_PENDING','superseded candidate cannot be confirmed late')
  assert.equal((await search.search({region:'서울',from:'2099-10-27',to:'2099-10-27',targetTrackId:'brahms-intermezzo-op118-no2'})).concerts.length,1)
  // Membership changes cannot reuse an OCR attempt made before reactivation.
  await db.query('update public.concert_program_images set is_active=false where id=$1',[images[1].id])
  await db.query('update public.concert_program_images set is_active=true where id=$1',[images[1].id])
  const issue=(await db.query('select public.concert_program_evidence_issue($1,$2,$3,$4,$5) issue',[second.t.ocr.id,2,JSON.stringify(second.a.concert_context),second.t.attempt.id,0])).rows[0].issue
  assert.equal(issue,'SOURCE_RECHECK_REQUIRED')
  assert((await rows('concert_program_reviews')).every(r=>r.reviewer_kind==='AUTOMATIC_PROGRAM_RULE'))
  await db.exec('reset role')
  for(const role of ['anon','authenticated'])for(const fn of ['queue_automatic_programs(integer,text,text,uuid[])','decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text)'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,'public.'+fn])).rows[0].ok,false)
 }finally{await db.close()}
})
