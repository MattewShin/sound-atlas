import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { analyzeStoredProgram, CATALOG_JSON, CATALOG_HASH, MATCHER_VERSION, hashJson } from './programAnalysis.mjs'

test('program SQL enforces atomic snapshots, manual history, scoped versioning, staleness and private access', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;')
    for (const name of ['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
    await db.exec('set role service_role')
    const concert = { kopis_id:'PF900001',title:'Local SQL fixture',venue:'Local fixture hall',region:'서울',start_date:'2026-10-15',end_date:'2026-10-15',performance_status:'공연예정',synced_at:'2026-10-15T00:00:00Z' }
    const images = ['a','b'].map((name,sort_order)=>({source_url:`https://kopis.or.kr/upload/local-fixture-${name}.png`,image_type:'DETAIL',sort_order}))
    const collect = (list=images)=>db.query('select public.sync_kopis_concert($1::jsonb,$2::jsonb)',[JSON.stringify(concert),JSON.stringify(list)])
    await collect()
    let clock = 0
    const record = async (image, { failure=false, hash='a'.repeat(64), text='PROGRAM\nChopin Ballade No.1 Op.23' }={}) => {
      const attempt = {id:randomUUID(),image_id:image.id,source_url:image.source_url,pipeline_version:'local-test-v1',content_sha256:failure?null:hash,
        status:failure?'FAILED':'SUCCEEDED',error_code:failure?'EASYOCR_TIMEOUT':null,
        started_at:`2026-10-15T00:${String(clock).padStart(2,'0')}:00Z`,finished_at:`2026-10-15T00:${String(clock++).padStart(2,'0')}:01Z`,duration_ms:1000}
      const result = failure?null:{engine_version:'local-test',torch_version:'local-test',settings:{},raw_text:text,detections:[],mean_confidence:null,width:800,height:100}
      await db.query('select public.record_concert_image_ocr($1::jsonb,$2::jsonb)',[JSON.stringify(attempt),result?JSON.stringify(result):null])
      return attempt
    }
    const rows = async(table)=> (await db.query(`select * from public.${table}`)).rows
    const storedImages = (await rows('concert_program_images')).sort((a,b)=>a.sort_order-b.sort_order)
    const makeAnalysis = async (image, version) => {
      const attempts=(await rows('concert_image_ocr_attempts')).filter(a=>a.image_id===image.id).sort((a,b)=>b.finished_at-a.finished_at)
      const attempt=attempts[0]
      const ocr=(await rows('concert_image_ocr_results')).find(r=>r.id===attempt.result_id)
      const actualImage=(await rows('concert_program_images')).find(i=>i.id===image.id)
      const actualConcert=(await rows('concerts'))[0]
      // PostgREST returns DATE strings; PGlite may decode DATE into a JS Date.
      for (const key of ['start_date','end_date']) if (actualConcert[key] instanceof Date) actualConcert[key]=actualConcert[key].toISOString().slice(0,10)
      const a=analyzeStoredProgram({concert:actualConcert,image:actualImage,ocr,attempt})
      return version?{...a,matcher_version:version,payload_hash:version.padEnd(64,'0').slice(0,64).replace(/[^a-f0-9]/g,'a')}:a
    }
    const save=(a)=>db.query('select public.save_concert_program_analysis($1::jsonb,$2) as id',[JSON.stringify(a),CATALOG_JSON])
    const review=(c,status='CONFIRMED',note='Checked local fixture evidence')=>db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[c.id,status,note,c.analysis_id,c.matcher_version,c.catalog_hash])
    const status=async(id)=>(await rows('concert_program_candidate_status')).find(c=>c.id===id)
    await record(storedImages[0])
    await record(storedImages[1],{text:'PROGRAM\nChopin Ballade No.1 Op.999'})
    const a=await makeAnalysis(storedImages[0]), b=await makeAnalysis(storedImages[1])
    assert.equal(a.candidates[0].track_id,'chopin-ballade-op23-no1')
    const analysisId=(await save(a)).rows[0].id
    await save(b)
    const c=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===analysisId)
    const unresolved=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id!==analysisId)
    await assert.rejects(review(unresolved),/unresolved/)
    await review(c)
    await review(c) // identical retry: one event
    assert.equal((await rows('concert_program_reviews')).length,1)
    assert.equal((await save(a)).rows[0].id,analysisId)
    assert.equal((await status(c.id)).review_status,'CONFIRMED')
    assert.equal((await status(c.id)).is_effectively_confirmed,true)
    await review(c,'REJECTED','Incorrect local fixture interpretation')
    await save(a)
    assert.equal((await status(c.id)).review_status,'REJECTED')
    assert.equal((await rows('concert_program_reviews')).length,2)
    await review(c)
    // Failure after the first candidate insert rolls back the whole new snapshot.
    const invalid={...a,matcher_version:'invalid-v2',payload_hash:'b'.repeat(64),candidates:[a.candidates[0],{...a.candidates[0],candidate_key:'b'.repeat(64),evidence:[{start:0,end:7,quote:'BADTEXT'}]}]}
    await assert.rejects(save(invalid),/quote/)
    assert.equal((await rows('concert_program_analyses')).length,2)
    assert.equal((await status(c.id)).is_effectively_confirmed,true)
    await assert.rejects(save({...a,payload_hash:'c'.repeat(64)}),/increment matcher/)
    await assert.rejects(save({...a,catalog_hash:'c'.repeat(64)}),/Catalog hash/)
    // New version with no candidates supersedes ONLY the analyzed image.
    await save({...a,matcher_version:'empty-v2',payload_hash:'d'.repeat(64),candidates:[]})
    assert.equal((await status(c.id)).stale_reason,'ANALYSIS_SUPERSEDED')
    assert.equal((await status(unresolved.id)).stale_reason,null)
    await save(a) // old version retry cannot reactivate
    assert.equal((await status(c.id)).stale_reason,'ANALYSIS_SUPERSEDED')
    await assert.rejects(review(c),/no longer current/)
    const next=(await save({...a,matcher_version:'current-v3',payload_hash:'e'.repeat(64)})).rows[0].id
    const current=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===next)
    await review(current)
    await collect() // normal recollection preserves image revision and review
    assert.equal((await status(current.id)).is_effectively_confirmed,true)
    await record(storedImages[0],{failure:true})
    assert.equal((await status(current.id)).review_status,'CONFIRMED')
    assert.equal((await status(current.id)).effective_status,'REVIEW_REQUIRED')
    assert.equal((await status(current.id)).is_effectively_confirmed,false)
    await assert.rejects(review(current),/Stale program evidence/)
    await record(storedImages[0]) // same old artifact recovers: still requires a NEW analysis/review
    assert.equal((await status(current.id)).stale_reason,'OCR_ATTEMPT_CHANGED')
    const renewed=await makeAnalysis(storedImages[0])
    const renewedId=(await save(renewed)).rows[0].id
    const renewedCandidate=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===renewedId)
    assert.equal(renewedCandidate.review_status,'REVIEW_REQUIRED')
    await review(renewedCandidate)
    await record(storedImages[0],{hash:'b'.repeat(64)})
    assert.equal((await status(renewedCandidate.id)).is_effectively_confirmed,false)
    const changedId=(await save(await makeAnalysis(storedImages[0]))).rows[0].id
    const changedCandidate=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===changedId)
    await review(changedCandidate)
    // Reverting remote bytes to an older artifact can be reanalyzed after a NEW success,
    // while all previous manual decisions remain stale until reviewed again.
    await record(storedImages[0],{hash:'a'.repeat(64)})
    const revertedId=(await save(await makeAnalysis(storedImages[0]))).rows[0].id
    assert.notEqual(revertedId,renewedId)
    assert.equal((await status(changedCandidate.id)).is_effectively_confirmed,false)
    const reverted=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===revertedId)
    assert.equal(reverted.review_status,'REVIEW_REQUIRED')
    await review(reverted)
    await collect([images[1]])
    assert.equal((await status(reverted.id)).stale_reason,'IMAGE_INACTIVE_OR_NOT_DETAIL')
    await collect()
    assert.equal((await status(reverted.id)).stale_reason,'IMAGE_REVISION_CHANGED')
    const revisedId=(await save(await makeAnalysis(storedImages[0]))).rows[0].id
    const revised=(await rows('concert_program_candidate_status')).find(c=>c.analysis_id===revisedId)
    await review(revised)
    await db.query('update public.concerts set title=$1',['Changed concert identity'])
    assert.equal((await status(revised.id)).stale_reason,'CONCERT_CONTEXT_CHANGED')
    await db.query('update public.concerts set title=$1',[concert.title])
    assert.equal((await status(revised.id)).stale_reason,'CONCERT_CONTEXT_CHANGED')
    const restoredId=(await save(await makeAnalysis(storedImages[0]))).rows[0].id
    assert.notEqual(restoredId,revisedId)
    assert.ok((await rows('concert_program_reviews')).length>=5)
    await db.exec('reset role')
    for(const table of ['concert_program_catalogs','concert_program_analyses','concert_program_candidates','concert_program_reviews']) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true)
      assert.equal((await db.query('select count(*)::int n from pg_policies where tablename=$1',[table])).rows[0].n,0)
    }
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      for(const table of ['concert_program_catalogs','concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_candidate_status'])
        await assert.rejects(rows(table),/permission denied/)
      await assert.rejects(save(a),/permission denied/)
      await assert.rejects(review(revised),/permission denied/)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})

test('boundary matcher version saves separate items atomically without deleting legacy candidates or manual history', async()=>{
  const db=new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;')
    for(const name of ['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'))
    await db.exec('set role service_role')
    const concert={kopis_id:'PF900002',title:'Local boundary SQL fixture',venue:'Local hall',region:'서울',start_date:'2026-10-15',end_date:'2026-10-15',performance_status:'공연예정',synced_at:'2026-10-15T00:00:00Z'}
    const images=[{source_url:'https://kopis.or.kr/upload/local-boundary-fixture.png',image_type:'DETAIL',sort_order:0}]
    await db.query('select public.sync_kopis_concert($1::jsonb,$2::jsonb)',[JSON.stringify(concert),JSON.stringify(images)])
    const image=(await db.query('select * from public.concert_program_images')).rows[0]
    const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,pipeline_version:'local-fixture',content_sha256:'a'.repeat(64),status:'SUCCEEDED',error_code:null,
      started_at:'2026-10-15T00:00:00Z',finished_at:'2026-10-15T00:00:01Z',duration_ms:1000}
    const text='PROGRAM\nA. Example\nI. Dawn Song\nII. Night Song\nIII. River Song'
    await db.query('select public.record_concert_image_ocr($1::jsonb,$2::jsonb)',[JSON.stringify(attempt),JSON.stringify({engine_version:'fixture',torch_version:'fixture',settings:{},raw_text:text,detections:[],width:800,height:400})])
    const ocr=(await db.query('select * from public.concert_image_ocr_results')).rows[0]
    const storedConcert=(await db.query('select * from public.concerts')).rows[0]
    const next=analyzeStoredProgram({concert:{...storedConcert,start_date:concert.start_date,end_date:concert.end_date},image,ocr,attempt})
    assert.equal(next.matcher_version,MATCHER_VERSION)
    assert.notEqual(MATCHER_VERSION,'stored-program-1')
    assert.equal(next.candidates.length,3)
    // A local representation of the old combined-parent output, never inserted in the remote DB.
    const evidence=[...new Map(next.candidates.flatMap(c=>c.evidence).map(e=>[e.start,e])).values()].sort((a,b)=>a.start-b.start)
    const legacy={...next,matcher_version:'stored-program-1',candidates:[{...next.candidates[0],candidate_key:'a'.repeat(64),outcome:'UNREGISTERED',evidence,
      identity:{title:'I. Dawn Song',composer:'A. Example',movement_numbers:[1,2,3]},review_reasons:['COMPOSER_OUTSIDE_CATALOG','WORK_NOT_REGISTERED']}]}
    legacy.payload_hash=hashJson(legacy)
    const save=async(a)=>(await db.query('select public.save_concert_program_analysis($1::jsonb,$2) id',[JSON.stringify(a),CATALOG_JSON])).rows[0].id
    const rows=async(table)=>(await db.query(`select * from public.${table}`)).rows
    const oldId=await save(legacy)
    const oldCandidate=(await rows('concert_program_candidates'))[0]
    await db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[oldCandidate.id,'REJECTED','Local evidence review: parent title unsupported',oldId,legacy.matcher_version,CATALOG_HASH])
    assert.equal(await save(legacy),oldId)
    assert.equal((await rows('concert_program_candidates'))[0].review_status,'REJECTED')
    const nextId=await save(next)
    assert.notEqual(nextId,oldId)
    assert.equal(await save(next),nextId)
    assert.equal((await rows('concert_program_analyses')).length,2)
    assert.equal((await rows('concert_program_candidates')).length,4)
    const status=await rows('concert_program_candidate_status')
    const old=status.find(c=>c.id===oldCandidate.id)
    assert.equal(old.review_status,'REJECTED')
    assert.equal(old.stale_reason,'ANALYSIS_SUPERSEDED')
    assert.equal(old.is_effectively_confirmed,false)
    const current=status.filter(c=>c.analysis_id===nextId)
    assert.equal(current.length,3)
    for(const c of current){assert.equal(c.review_status,'REVIEW_REQUIRED');assert.equal(c.stale_reason,null);assert.equal(c.track_id,null);assert.equal(c.identity.parent_title,null);assert.deepEqual(c.identity.movement_numbers,[])}
    await save(legacy)
    assert.equal((await rows('concert_program_analyses')).find(a=>a.id===oldId).is_current,false)
    assert.equal((await rows('concert_program_reviews')).length,1)
    const invalid={...next,matcher_version:'boundary-invalid-local',payload_hash:'b'.repeat(64),candidates:[next.candidates[0],{...next.candidates[1],evidence:[{start:0,end:7,quote:'INVALID'}]}]}
    await assert.rejects(save(invalid),/quote/)
    assert.equal((await rows('concert_program_analyses')).length,2)
    assert.equal((await rows('concert_program_candidates')).length,4)
    assert.equal((await rows('concert_program_analyses')).find(a=>a.id===nextId).is_current,true)
  } finally { await db.close() }
})
