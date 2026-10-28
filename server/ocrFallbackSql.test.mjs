import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {programTextConfirmationFixture,confirmationMigration,rows} from './testSupport/programTextConfirmationFixture.mjs'
import {CATALOG_JSON,analyzeStoredProgram} from './programAnalysis.mjs'
import {planOcrFallback,fallbackHash} from './ocrFallback.mjs'
import {fallbackExpected} from './supabaseOcrFallback.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

// Independent fixture: imports production helpers, never another test suite.
const sql=await readFile(new URL('../supabase/migrations/202610280001_ocr_fallback.sql',import.meta.url),'utf8')
async function setup(){
 const db=new PGlite();await programTextConfirmationFixture(db);await db.exec(confirmationMigration)
 for(const file of ['202610260004_program_text_confirmation_status.sql','202610270001_program_text_analysis_acl.sql','202610270002_program_text_candidate_status_read.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 await db.exec(sql)
 const today=new Date(Date.now()+5*86400000).toISOString().slice(0,10),data={kopis_id:'PF900098',title:'OCR isolated recital',venue:'Local hall',region:'서울',start_date:today,end_date:today,performance_status:'공연예정',synced_at:new Date().toISOString()}
 await db.exec('set role service_role')
 await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(data),JSON.stringify([{source_url:'https://kopis.or.kr/upload/ocr-isolated.png',image_type:'DETAIL',sort_order:0}])])
 const concert={...(await rows(db,'concerts')).find(k=>k.kopis_id===data.kopis_id),...data},image=(await rows(db,'concert_program_images')).find(i=>i.concert_id===concert.id)
 const lines=['PROGRAM','F. Chopin - Ballade No.4 Op.52','F. Liszt - Liebestraum No.3 S.541','J. Brahms - Intermezzo Op.118 No.2'],hash='b'.repeat(64),attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,status:'SUCCEEDED',content_sha256:hash,pipeline_version:EASYOCR_PIPELINE_VERSION,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),duration_ms:0}
 const result={raw_text:lines.join('\n'),width:1200,height:1600,detections:lines.map((text,n)=>({text,confidence:.99,bbox:[[0,n*50],[1000,n*50],[1000,n*50+30],[0,n*50+30]]})),engine_version:'fixture',torch_version:'fixture',settings:{ocr_fallback_quality:{schema:'program-ocr-fallback-1',decoded:true,content_hash:hash,mime:'image/png',bytes:10000,original_width:1200,original_height:1600,laplacian_variance:500}}}
 await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify(result)])
 const ocr=(await rows(db,'concert_image_ocr_results')).find(o=>o.image_id===image.id),target={concert,image,attempt,ocr},plan=planOcrFallback(target)
 assert.equal(plan.eligible.length,3)
 const id=(await db.query('select public.save_concert_program_analysis_v4($1,$2) id',[JSON.stringify(plan.analysis),CATALOG_JSON])).rows[0].id,candidate=(await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===id&&c.track_id==='chopin-ballade-op52-no4')
 const input=fallbackExpected(target,plan.analysis,candidate,plan.quality)
 return {db,target,plan,candidate,input}
}
const confirm=async(f,input=f.input)=>(await f.db.query('select public.confirm_concert_ocr_fallback_v1($1,$2) id',[JSON.stringify(input),CATALOG_JSON])).rows[0].id
test('isolated full migration chain: disabled default, JS/SQL quality equality, confirmed-only receipt, exact replay and legacy preservation',async()=>{
 const f=await setup(),{db}=f
 try{
  const legacyBefore=await db.query("select to_jsonb(r) row from public.concert_program_reviews r order by id"),officialBefore=await rows(db,'concert_program_text_analyses')
  assert.equal((await db.query("select enabled from public.concert_program_version_policy where matcher_version='program-ocr-fallback-1'")).rows[0].enabled,false)
  const q=(await db.query('select public.ocr_fallback_quality($1,$2) q',[f.target.ocr.id,JSON.stringify(f.plan.analysis.sections)])).rows[0].q
  assert.deepEqual(q,f.plan.quality.snapshot);assert.equal(fallbackHash(q),f.plan.quality.hash)
  await assert.rejects(confirm(f),/OCR_FALLBACK_DISABLED/)
  await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='program-ocr-fallback-1'")
  const id=await confirm(f),count=(await rows(db,'concert_program_reviews')).length,proof=await rows(db,'concert_program_ocr_fallback_receipts')
  assert.equal(proof.length,1);assert.equal(proof[0].id,id);assert.equal(await confirm(f),id);assert.equal((await rows(db,'concert_program_reviews')).length,count)
  assert.ok((await rows(db,'concert_program_candidate_status')).find(c=>c.id===f.candidate.id).is_effectively_confirmed)
  for(const old of legacyBefore.rows)assert.deepEqual((await db.query('select to_jsonb(r) row from public.concert_program_reviews r where id=$1',[old.row.id])).rows[0],old)
  assert.deepEqual(await rows(db,'concert_program_text_analyses'),officialBefore)
  assert.equal((await rows(db,'concert_program_reviews')).filter(r=>r.status==='REJECTED').length,legacyBefore.rows.filter(r=>r.row.status==='REJECTED').length)
  await assert.rejects(confirm(f,{...f.input,content_hash:'c'.repeat(64)}),/OCR_FALLBACK_EXPECTED_CHANGED/)
  await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='program-ocr-fallback-1'")
  await assert.rejects(confirm(f),/OCR_FALLBACK_DISABLED/)
  assert.ok((await rows(db,'concert_program_candidate_status')).find(c=>c.id===f.candidate.id).is_effectively_confirmed)
 }finally{await db.close()}
})
test('isolated authoritative RPC: stale expected/quality/source/identity never create reviews; RLS and narrow ACL',async()=>{
 const f=await setup(),{db}=f
 try{
  await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='program-ocr-fallback-1'")
  const baseline=(await rows(db,'concert_program_reviews')).length
  for(const change of [i=>i.quality.median=.8,i=>i.quality.image_quality.decoded=false,i=>i.quality_hash='x',i=>i.image_revision++,i=>i.analysis_payload_hash='0'.repeat(64),i=>i.catalog_hash='1'.repeat(64),i=>i.official_reason='HOLD']){
   const input=structuredClone(f.input);change(input);await assert.rejects(confirm(f,input),/OCR_FALLBACK_/)
  }
  await db.exec('reset role')
  const savedOcr=structuredClone(f.target.ocr)
  for(const change of [o=>delete o.settings.ocr_fallback_quality,o=>o.settings.ocr_fallback_quality.original_width=799,o=>o.settings.ocr_fallback_quality.laplacian_variance=0,o=>o.detections.forEach(d=>d.confidence=.2),o=>o.detections[1].bbox=[]]){
   const o=structuredClone(savedOcr);change(o);await db.query('update public.concert_image_ocr_results set settings=$1,detections=$2 where id=$3',[JSON.stringify(o.settings),JSON.stringify(o.detections),o.id]);assert.equal((await db.query('select public.ocr_fallback_quality($1,$2) q',[o.id,JSON.stringify(f.plan.analysis.sections)])).rows[0].q,null)
  }
  await db.query('update public.concert_image_ocr_results set settings=$1,detections=$2 where id=$3',[JSON.stringify(savedOcr.settings),JSON.stringify(savedOcr.detections),savedOcr.id])
  for(const [text,hash]of [['[Program]\nF. Chopin Op.52','a'.repeat(64)],['incomplete',null]]){
   await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[text,hash,f.target.concert.id]);await assert.rejects(confirm(f),/OCR_FALLBACK_OFFICIAL_HOLD/)
  }
  await db.query('update public.concerts set kopis_detail_text=null,kopis_detail_text_hash=null where id=$1',[f.target.concert.id])
  await db.query("update public.concert_program_candidates set review_reasons='[\"UNKNOWN_REASON\"]' where id=$1",[f.candidate.id]);await assert.rejects(confirm(f),/OCR_FALLBACK_IDENTITY_AMBIGUOUS/)
  assert.equal((await rows(db,'concert_program_reviews')).length,baseline);assert.equal((await rows(db,'concert_program_ocr_fallback_receipts')).length,0)
  const acl=(await db.query("select has_function_privilege('anon','public.confirm_concert_ocr_fallback_v1(jsonb,text)','EXECUTE') anon,has_function_privilege('authenticated','public.confirm_concert_ocr_fallback_v1(jsonb,text)','EXECUTE') auth,has_function_privilege('service_role','public.confirm_concert_ocr_fallback_v1(jsonb,text)','EXECUTE') service,has_table_privilege('service_role','public.concert_program_ocr_fallback_receipts','UPDATE,DELETE,TRUNCATE') excessive")).rows[0]
  assert.deepEqual(acl,{anon:false,auth:false,service:true,excessive:false})
  await db.exec('set role anon');await assert.rejects(confirm(f),/permission denied/)
 }finally{await db.close()}
})
