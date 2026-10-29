import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {detectOcrProgramRegions,ocrProgramHeading} from './ocrProgramRegions.mjs'
import {planOcrFallback,OCR_FALLBACK_QUALITY} from './ocrFallback.mjs'
import {analyzeStoredProgram} from './programAnalysis.mjs'
import {runOcrFallbackOne} from './ocrFallbackRunner.mjs'

const works=['F. Chopin - Ballade No.4 Op.52','F. Liszt - Liebestraum No.3 S.541','J. Brahms - Intermezzo Op.118 No.2']
function target(lines){const id=randomUUID(),image=randomUUID(),hash='c'.repeat(64);return {concert:{id,kopis_id:'PF900089',title:'Isolated recital',venue:'Local hall',region:'서울',start_date:'2099-10-29',end_date:'2099-10-29',performance_status:'공연예정',program_context_revision:0},image:{id:image,concert_id:id,image_type:'DETAIL',is_active:true,evidence_revision:0,source_url:'https://kopis.or.kr/upload/fixture.png'},attempt:{id:randomUUID()},ocr:{id:randomUUID(),image_id:image,width:1200,height:1600,raw_text:lines.join('\n'),content_sha256:hash,settings:{ocr_fallback_quality:{schema:'program-ocr-fallback-1',decoded:true,content_hash:hash,mime:'image/png',bytes:10000,original_width:1200,original_height:1600,laplacian_variance:500}},detections:lines.map((text,index)=>({text,confidence:.99,bbox:[[20,index*45],[1000,index*45],[1000,index*45+30],[20,index*45+30]]}))}}}
test('OCR-only explicit heading variants keep exact source evidence and all safety constants',()=>{
 for(const h of ['PROGRAM','P R O G R A M','[프로그램]','곡목','연주곡','연주곡목','REPERTOIRE','Repertoire:','【레퍼토리】']){
  const t=target([h,...works]),before=JSON.stringify(t.ocr),plan=planOcrFallback(t);assert.ok(ocrProgramHeading(h));assert.equal(plan.eligible.length,3,h);assert.deepEqual(plan.quality.snapshot.program_lines,[1,2,3]);assert.equal(JSON.stringify(t.ocr),before)
  for(const c of plan.analysis.candidates)for(const e of c.evidence)assert.equal([...t.ocr.raw_text].slice(e.start,e.end).join(''),e.quote)
 }
 assert.equal(OCR_FALLBACK_QUALITY.minDimension,700);assert.equal(OCR_FALLBACK_QUALITY.minMedian,.9);assert.equal(OCR_FALLBACK_QUALITY.minCoverage,.8)
 for(const label of ['Program notes','연주자 프로그램 소개','sample program','PROGRAM TICKETS'])assert.equal(ocrProgramHeading(label),false)
})
test('headingless bbox work blocks require connected explicit composer and catalogue, including split title/catalogue',()=>{
 for(const lines of [works,['F. Chopin','Ballade No.4','Op.52']]){
  const t=target(lines),plan=planOcrFallback(t);assert.ok(plan.eligible.length>0);assert.equal(plan.analysis.sections[0].reason,'OCR_SPATIAL_PROGRAM_BLOCK');assert.deepEqual(plan.quality.snapshot.program_lines,[0,1,2])
 }
})
test('performance title, performer, venue, date, ticket and biography cannot supply work-block composer',()=>{
 for(const metadata of ['Chopin recital','피아노: 쇼팽','Venue: Chopin Hall','Date: 2099-10-29','Tickets: Chopin Op.52','Chopin graduated at university','Chopin masterclass Ballade No.4 Op.52','Pianist: Chopin','피아니스트 쇼팽']){
  const t=target([metadata,'Ballade No.4 Op.52','Ballade No.4 Op.52','Ballade No.4 Op.52']),plan=planOcrFallback(t);assert.equal(plan.eligible.length,0);assert.equal(plan.analysis.candidates.length,0,metadata)
 }
 const t=target(['PROGRAM',...works,'Venue: Local hall','Tickets: 30,000 won']),plan=planOcrFallback(t)
 assert.equal(plan.eligible.length,3);assert.deepEqual(plan.quality.snapshot.program_lines,[1,2,3]);assert.ok(detectOcrProgramRegions(t.ocr).metadata_line_indices.includes(5))
})
test('distant columns, metadata barriers, missing bbox and title-only cannot borrow composer evidence',()=>{
 const t=target(['F. Chopin','Ballade No.4 Op.52','Ballade No.4 Op.52']);t.ocr.detections[0].bbox=[[0,0],[200,0],[200,30],[0,30]];for(const d of t.ocr.detections.slice(1))d.bbox=d.bbox.map(([x,y])=>[x*.2+800,y+500]);assert.equal(planOcrFallback(t).eligible.length,0)
 const barrier=target(['F. Chopin','Tickets: 30000 won','Ballade No.4 Op.52']);assert.equal(planOcrFallback(barrier).analysis.candidates.length,0)
 const noBox=target(works);noBox.ocr.detections.forEach(d=>d.bbox=null);assert.equal(planOcrFallback(noBox).eligible.length,0)
 assert.equal(planOcrFallback(target(['F. Chopin - Ballade No.4','F. Chopin - Ballade No.4','F. Chopin - Ballade No.4'])).analysis.candidates.length,0)
})
test('ROI discovery does not erase full-source date/session conflicts or relax confidence/duplicates/arrangements',()=>{
 const t=target(['REPERTOIRE',...works,'Date: 2098-01-01']),plan=planOcrFallback(t);assert.equal(plan.quality.eligible,true);assert.equal(plan.eligible.length,0);assert.ok(plan.analysis.candidates.every(c=>c.review_reasons.includes('CONTEXT_DATE')))
 const multi=target(['REPERTOIRE',...works]);multi.concert.end_date='2099-10-30';assert.equal(planOcrFallback(multi).quality.eligible,true);assert.equal(planOcrFallback(multi).eligible.length,0)
 for(const mutate of [t=>t.ocr.detections.forEach(d=>d.confidence=.89),t=>t.ocr.detections[1].confidence=.84,t=>t.ocr.settings.ocr_fallback_quality.laplacian_variance=99]){const t=target(works);mutate(t);const p=planOcrFallback(t);assert.ok(p.eligible.length<3)}
 assert.equal(planOcrFallback(target(['F. Chopin - Ballade No.4 Op.52 arr. for four hands',...works.slice(1)])).eligible.some(c=>c.candidate.track_id==='chopin-ballade-op52-no4'),false)
 const duplicate=planOcrFallback(target([works[0],works[0],works[2]]));assert.ok(!duplicate.eligible.some(c=>c.candidate.track_id==='chopin-ballade-op52-no4'))
})
test('shared analyzer and official/legacy paths remain unchanged; skipped OCR performs no decision/review writes',async()=>{
 const t=target(['REPERTOIRE',...works]),baseline=analyzeStoredProgram(t);planOcrFallback(t);assert.deepEqual(analyzeStoredProgram(t),baseline)
 const low=target(works);low.ocr.detections.forEach(d=>d.confidence=.1);const forbidden=()=>assert.fail('SKIPPED called a persistence/decision endpoint')
 const result=await runOcrFallbackOne({concert:low.concert,image:low.image,now:()=>Date.parse('2099-10-29T00:00:00+09:00'),store:{preflight:async()=>{},refresh:async()=>({concert:low.concert,image:low.image}),saveOcr:forbidden,saveAnalysis:forbidden,confirm:forbidden,review:forbidden,decide:forbidden},download:async()=>({quality:low.ocr.settings.ocr_fallback_quality,contentHash:low.ocr.content_sha256}),worker:{recognize:async()=>low.ocr},save:true});assert.equal(result.confirmation_posts,0);assert.equal(result.rejected,0)
})
