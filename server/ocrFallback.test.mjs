import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {randomUUID,createHash} from 'node:crypto'
import {planOcrFallback,fallbackSource,OCR_FALLBACK_RULE,OCR_FALLBACK_QUALITY} from './ocrFallback.mjs'
import {runOcrFallbackOne} from './ocrFallbackRunner.mjs'
import {downloadFallbackImage} from './ocrFallbackImage.mjs'
import {createOcrFallbackStore} from './supabaseOcrFallback.mjs'

export function fallbackFixture(lines=['PROGRAM','F. Chopin - Ballade No.4 Op.52','F. Liszt - Liebestraum No.3 S.541','J. Brahms - Intermezzo Op.118 No.2']){
 const k=randomUUID(),i=randomUUID(),hash='b'.repeat(64)
 return {concert:{id:k,kopis_id:'PF900099',title:'Isolated recital',venue:'Local hall',region:'서울',start_date:'2099-10-28',end_date:'2099-10-28',performance_status:'공연예정',program_context_revision:0},
  image:{id:i,concert_id:k,source_url:'https://kopis.or.kr/upload/isolated.png',is_active:true,image_type:'DETAIL',evidence_revision:0,sort_order:0},attempt:{id:randomUUID()},
  ocr:{id:randomUUID(),image_id:i,content_sha256:hash,pipeline_version:'fixture',raw_text:lines.join('\n'),width:1200,height:1600,
   settings:{ocr_fallback_quality:{schema:OCR_FALLBACK_RULE,decoded:true,content_hash:hash,mime:'image/png',bytes:10000,original_width:1200,original_height:1600,laplacian_variance:500}},
   detections:lines.map((text,n)=>({text,confidence:.99,bbox:[[0,50*n],[1000,50*n],[1000,50*n+30],[0,50*n+30]]}))}}
}
const official=text=>({kopis_detail_text:text,kopis_detail_text_hash:createHash('sha256').update(text).digest('hex')})
test('fallback official routing is strict without changing existing source router',()=>{
 for(const [input,status]of [[{},'OCR'],[official('Unlabelled introduction'),'OCR'],[official('[Program]\n'),'OCR'],[official('[Program]\nF. Chopin Op.52'),'OFFICIAL'],[{kopis_detail_text:'broken'},'HOLD'],[official(' '),'HOLD'],[{...official('intro'),kopis_detail_text_hash:'a'.repeat(64)},'HOLD'],[official('<p>[Program]</p>'),'HOLD']])assert.equal(fallbackSource(input).status,status)
})
test('explicit inline high quality catalogue candidates are eligible; constants cannot be loosened',()=>{
 const p=planOcrFallback(fallbackFixture());assert.equal(p.quality.eligible,true);assert.equal(p.eligible.length,3);assert.equal(p.skipped.length,0);assert.ok(Object.isFrozen(OCR_FALLBACK_QUALITY));assert.equal(OCR_FALLBACK_QUALITY.minMedian,.9)
})
test('missing/malformed/low quality has no eligible output',()=>{
 const variants=[t=>delete t.ocr.settings.ocr_fallback_quality,t=>t.ocr.settings.ocr_fallback_quality.original_width=799,t=>t.ocr.settings.ocr_fallback_quality.laplacian_variance=0,
  t=>t.ocr.settings.ocr_fallback_quality.decoded=false,t=>t.ocr.settings.ocr_fallback_quality.bytes=6000001,t=>t.ocr.settings.ocr_fallback_quality.content_hash='x',
  t=>t.ocr.detections[1].bbox=null,t=>t.ocr.detections[1].confidence='0.99',t=>t.ocr.detections.forEach(d=>d.confidence=.899),
  t=>t.ocr.raw_text+='\nmore\nmore\nmore\nmore',t=>t.ocr.detections=t.ocr.detections.slice(0,2)]
 for(const change of variants){const t=fallbackFixture();change(t);const p=planOcrFallback(t);assert.equal(p.eligible.length,0);assert.equal(p.quality.eligible,false)}
})
test('inferred composer, catalogue missing, movement scope, arrangement, duplicate and unknown reason never qualify',()=>{
 const cases=[['PROGRAM','F. Chopin','Ballade No.4 Op.52'],['PROGRAM','F. Chopin - Ballade No.4'],['PROGRAM','L. Beethoven - Sonata No.8 Op.13'],['PROGRAM','F. Chopin - Ballade No.4 Op.52 arr. for four hands'],['PROGRAM','F. Chopin - Ballade No.4 Op.52','Intermission','F. Chopin - Ballade No.4 Op.52']]
 for(const lines of cases){const t=fallbackFixture([...lines,'Information','Notes']);assert.equal(planOcrFallback(t).eligible.length,0)}
 const t=fallbackFixture();t.ocr.detections[1].confidence=.849;assert.ok(!planOcrFallback(t).eligible.some(d=>d.candidate.track_id==='chopin-ballade-op52-no4'))
 t.ocr.detections[1].confidence=.89;assert.ok(!planOcrFallback(t).eligible.some(d=>d.candidate.track_id==='chopin-ballade-op52-no4'))
})
test('official and HOLD short circuit all image/OCR/confirmation operations',async()=>{
 for(const source of [official('[Program]\nF. Chopin Op.52'),{kopis_detail_text:'bad'}]){
  const t=fallbackFixture();Object.assign(t.concert,source);const forbidden=()=>assert.fail('operation on non OCR source')
  const r=await runOcrFallbackOne({concert:t.concert,image:t.image,store:{preflight:forbidden,refresh:forbidden},download:forbidden,worker:{recognize:forbidden},save:true});assert.equal(r.downloads,0);assert.equal(r.ocr_calls,0);assert.equal(r.confirmation_posts,0)
 }
})
test('SKIPPED never calls persistence/review/confirmation; dry-run has hard one-image and one-OCR bounds',async()=>{
 for(const lowQuality of [true,false]){
  const t=fallbackFixture(),forbidden=()=>assert.fail('SKIPPED invoked write'),store={preflight:async()=>{},refresh:async()=>({concert:t.concert,image:t.image}),saveOcr:forbidden,saveAnalysis:forbidden,confirm:forbidden,decide:forbidden,review:forbidden}
  let downloads=0,ocr=0
  const r=await runOcrFallbackOne({store,concert:t.concert,image:t.image,now:()=>Date.parse('2099-10-28T00:00:00+09:00'),download:async()=>{downloads++;return {quality:t.ocr.settings.ocr_fallback_quality,contentHash:t.ocr.content_sha256}},worker:{recognize:async()=>{ocr++;return {...t.ocr,detections:t.ocr.detections.map(d=>({...d,confidence:.2}))}}},save:!lowQuality})
  assert.equal(downloads,1);assert.equal(ocr,1);assert.equal(r.confirmation_posts,0);assert.equal(r.rejected,0)
 }
})
test('one image GET rejects decode/MIME/blur, has no HTTP retry and enforces safe original dimensions',async()=>{
 const raw=await sharp({create:{width:900,height:900,channels:3,background:'white'}}).png().toBuffer();let calls=0
 const result=await downloadFallbackImage('https://kopis.or.kr/upload/image.png',{fetchImpl:async()=>{calls++;return new Response(raw,{headers:{'content-type':'image/png'}})}})
 assert.equal(calls,1);assert.equal(result.quality.original_width,900);assert.equal(result.quality.laplacian_variance,0)
 for(const [bytes,mime]of [[Buffer.from('bad'),'image/png'],[raw,'text/html']])await assert.rejects(downloadFallbackImage('https://kopis.or.kr/upload/image.png',{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':mime}})}))
 calls=0;await assert.rejects(downloadFallbackImage('https://kopis.or.kr/upload/image.png',{fetchImpl:async()=>{calls++;return new Response('',{status:503})}}));assert.equal(calls,1)
})
test('confirmation adapter makes at most one POST on an uncertain failure; never invokes old decision RPC',async()=>{
 let posts=0;const store=createOcrFallbackStore({env:{SUPABASE_URL:'https://isolated.example',SUPABASE_SERVICE_ROLE_KEY:'fake'},fetchImpl:async(url,init)=>{assert.ok(String(url).includes('/rpc/confirm_concert_ocr_fallback_v1'));assert.equal(init.method,'POST');posts++;throw Error('uncertain')},delay:async()=>{}})
 await assert.rejects(store.confirm({}));await assert.rejects(store.confirm({}));assert.equal(posts,1)
})
test('positive bounded runner revalidates persisted evidence and confirms only one among multiple eligible candidates',async()=>{
 const t=fallbackFixture(),id=randomUUID();let saved,posts=0,ocr=0,downloaded=0,refresh=0,current=0
 const store={preflight:async()=>{},refresh:async()=>{refresh++;return {concert:t.concert,image:t.image}},saveOcr:async()=>{},current:async()=>{current++;return t},saveAnalysis:async a=>{saved=a;return id},candidates:async()=>saved.candidates.map(c=>({...c,id:randomUUID(),analysis_id:id})),existing:async()=>[],confirm:async expected=>{posts++;assert.equal(expected.rule,OCR_FALLBACK_RULE);assert.equal(expected.analysis_id,id);return randomUUID()}}
 const result=await runOcrFallbackOne({store,concert:t.concert,image:t.image,now:()=>Date.parse('2099-10-28T00:00:00+09:00'),download:async()=>{downloaded++;return {quality:t.ocr.settings.ocr_fallback_quality,contentHash:t.ocr.content_sha256}},worker:{recognize:async()=>{ocr++;return t.ocr}},save:true})
 assert.equal(result.status,'CONFIRMED');assert.equal(posts,1);assert.equal(ocr,1);assert.equal(downloaded,1);assert.equal(current,2);assert.equal(refresh,2);assert.equal(result.rejected,0)
})
