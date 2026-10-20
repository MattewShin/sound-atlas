import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {analyzeStoredProgram,CATALOG_JSON,CATALOG_HASH,hashJson} from './programAnalysis.mjs'
import {createSupabaseConcertSearch} from './supabaseConcertSearch.mjs'

const rehash=value=>{const {payload_hash,...body}=value;return {...body,payload_hash:hashJson(body)}}

test('v3 SQL draft preserves v2 rows and reviews, stores complete logical evidence, retries atomically and supports exclusion',async()=>{
  const db=new PGlite()
  try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;')
    for(const name of ['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql'])
      await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
    await db.exec('set role service_role')
    const concert={kopis_id:'PF900004',title:'Local v3 SQL fixture',venue:'Local hall',region:'서울',start_date:'2026-10-19',end_date:'2026-10-19',performance_status:'공연예정',synced_at:'2026-10-19T00:00:00Z'}
    const images=['a','b','c'].map((n,sort_order)=>({source_url:`https://kopis.or.kr/upload/v3-fixture-${n}.png`,image_type:'DETAIL',sort_order}))
    await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(concert),JSON.stringify(images)])
    const rows=async table=>(await db.query('select * from public.'+table)).rows
    const storedConcert=(await rows('concerts'))[0],analyses=[]
    for(const image of (await rows('concert_program_images')).sort((a,b)=>a.sort_order-b.sort_order)){
      const text=image.sort_order===2?'PROGRAM':'PROGRAM\nF Chopin\nBallade No.4 in F minor Op:52'
      const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,pipeline_version:'local-test',content_sha256:'a'.repeat(64),status:'SUCCEEDED',
        started_at:'2026-10-19T00:00:00Z',finished_at:'2026-10-19T00:00:01Z',duration_ms:1000}
      await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text:text,detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:100})])
      const ocr=(await rows('concert_image_ocr_results')).find(o=>o.image_id===image.id)
      analyses.push(analyzeStoredProgram({concert:{...storedConcert,start_date:concert.start_date,end_date:concert.end_date},image,ocr,attempt}))
    }
    const saveLegacy=async a=>(await db.query('select public.save_concert_program_analysis($1,$2) id',[JSON.stringify(a),CATALOG_JSON])).rows[0].id
    const old=rehash({...analyses[0],matcher_version:'stored-program-2'})
    const oldId=await saveLegacy(old),oldCandidate=(await rows('concert_program_candidates'))[0]
    await db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[oldCandidate.id,'CONFIRMED','Local original evidence check',oldId,'stored-program-2',CATALOG_HASH])
    const originalV2=(await rows('concert_program_analyses')).find(a=>a.id===oldId)
    const originalCandidates=await rows('concert_program_candidates'),originalReviews=await rows('concert_program_reviews')
    // Existing v2 storage cannot retain the new logical/normalization fields.
    assert.equal(originalV2.snapshot,undefined)
    await db.exec('reset role')
    await db.exec(await readFile(new URL('../supabase/drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql',import.meta.url),'utf8'))
    await db.exec('set role service_role')
    const save=async a=>(await db.query('select public.save_concert_program_analysis_v3($1,$2) id',[JSON.stringify(a),CATALOG_JSON])).rows[0].id
    const nextId=await save(analyses[0])
    assert.notEqual(nextId,oldId)
    assert.equal(await save(structuredClone(analyses[0])),nextId)
    assert.equal((await rows('concert_program_analyses')).length,2)
    assert.equal((await rows('concert_program_candidates')).length,2)
    const next=(await rows('concert_program_analyses')).find(a=>a.id===nextId)
    assert.deepEqual(next.snapshot,analyses[0])
    assert.equal(next.snapshot.candidates[0].generation_version,'stored-program-3')
    assert.equal(next.snapshot.candidates[0].matching.variants[0].lines[0].source.quote,'Ballade No.4 in F minor Op:52')
    assert.ok(next.snapshot.logical_works.every(w=>w.catalog_matches.length<=1))
    const {snapshot,...preservedV2}=(await rows('concert_program_analyses')).find(a=>a.id===oldId)
    assert.equal(snapshot,null);assert.deepEqual(preservedV2,originalV2)
    assert.deepEqual((await rows('concert_program_candidates')).filter(c=>c.analysis_id===oldId),originalCandidates)
    assert.deepEqual(await rows('concert_program_reviews'),originalReviews)
    assert.equal((await rows('concert_program_candidate_status')).find(c=>c.id===oldCandidate.id).is_effectively_confirmed,true,'v3 canary cannot hide v2 confirmed evidence')
    const publicSearch=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},now:()=>Date.parse('2026-10-19T00:00:00Z'),fetchImpl:async(url,init)=>{
      assert.equal(init.method,'GET');assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-2')
      return new Response(JSON.stringify((await rows('concert_program_candidate_status')).map(c=>({...c,concerts:concert})).sort((a,b)=>a.id.localeCompare(b.id))))
    }})
    assert.equal((await publicSearch.search({region:'서울',from:'2026-10-19',to:'2026-10-20',targetTrackId:'chopin-ballade-op52-no4'})).concerts.length,1)
    assert.equal(await saveLegacy(old),oldId)
    assert.equal((await rows('concert_program_candidate_status')).find(c=>c.id===oldCandidate.id).stale_reason,null,'each version retains its own current snapshot')
    await assert.rejects(db.query('select public.review_concert_program_candidate($1,$2,$3,$4,$5,$6)',[oldCandidate.id,'CONFIRMED','Retry old decision',oldId,'stored-program-3',CATALOG_HASH]),/no longer current/)
    const changed=structuredClone(analyses[0]);changed.candidates[0].matching.variants[0].normalized_text+=' changed'
    await assert.rejects(save(changed),/increment matcher/,'same hash cannot hide changed complete JSON')
    await assert.rejects(save(rehash(changed)),/increment matcher/,'changed hash cannot replace same version key')
    await assert.rejects(save({...analyses[0],catalog_hash:'b'.repeat(64)}),/Catalog hash/)
    const fanout=structuredClone(analyses[0]);fanout.logical_works[0].catalog_matches.push(fanout.logical_works[0].catalog_matches[0])
    await assert.rejects(save(rehash(fanout)),/at most one/)
    const invalid=structuredClone(analyses[1]);invalid.candidates[0].evidence[0].quote='BADTEXT'
    await assert.rejects(save(rehash(invalid)),/quote/)
    assert.equal((await rows('concert_program_analyses')).length,2,'failed second OCR rolls back independently')
    const retryId=await save(analyses[1]);assert.equal(await save(analyses[1]),retryId)
    assert.equal((await rows('concert_program_analyses')).length,3)
    assert.equal((await rows('concert_program_candidates')).length,3)
    assert.equal(analyses[2].candidates.length,0)
    const emptyId=await save(analyses[2]);assert.equal(await save(analyses[2]),emptyId)
    assert.equal((await rows('concert_program_analyses')).length,4,'zero candidates still has a reusable analysis record')
    assert.equal((await rows('concert_program_candidates')).length,3)
    assert.equal((await rows('concert_program_candidates')).filter(c=>c.analysis_id!==oldId).every(c=>c.review_status==='REVIEW_REQUIRED'),true)
    await db.query('insert into public.concert_program_version_policy values ($1,false,$2)',['stored-program-3','Local rollback test'])
    const fallback=(await rows('concert_program_candidate_status')).find(c=>c.id===oldCandidate.id)
    assert.equal(fallback.analysis_is_current,true);assert.equal(fallback.is_effectively_confirmed,true)
    assert.equal((await rows('concert_program_candidate_status')).find(c=>c.analysis_id===nextId).analysis_is_current,false)
    await assert.rejects(save(analyses[0]),/disabled/)
    await db.query('update public.concert_program_version_policy set enabled=true where matcher_version=$1',['stored-program-3'])
    assert.equal((await rows('concert_program_candidate_status')).find(c=>c.analysis_id===nextId).analysis_is_current,true)
    assert.deepEqual((await rows('concert_program_analyses')).find(a=>a.id===oldId),{...originalV2,snapshot:null})
    assert.deepEqual(await rows('concert_program_reviews'),originalReviews)
    await db.exec('reset role;set role anon')
    await assert.rejects(rows('concert_program_version_policy'),/permission denied/)
    await assert.rejects(save(analyses[0]),/permission denied/)
  }finally{await db.close()}
})
