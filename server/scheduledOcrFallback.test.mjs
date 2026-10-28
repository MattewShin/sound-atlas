import test from 'node:test'
import assert from 'node:assert/strict'
import {createScheduledOfficialWithOcr,getOcrFallbackScheduleEnabled} from './scheduledOcrFallback.mjs'
const conditions={region:'서울',from:'2026-10-28',to:'2026-11-27'}
const forbidden=()=>assert.fail('unexpected OCR operation')
test('official priority and default OFF preserve exactly the official outcome; no OCR initialized',async()=>{
 for(const [enabled,first]of [['true',{status:'CONFIRMED',selected:1}],['true',{status:'SKIPPED',selected:1}],['true',{status:'FAILED',selected:0}],['false',{status:'SKIPPED',selected:0}]]){
  const runner=createScheduledOfficialWithOcr({env:{PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED:enabled},official:{run:async()=>first},store:{concerts:forbidden},workerFactory:forbidden})
  assert.deepEqual(await runner.run({conditions}),first)
 }
 assert.equal(getOcrFallbackScheduleEnabled({}),false);assert.throws(()=>getOcrFallbackScheduleEnabled({PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED:'1'}))
})
test('bounded fallback plans only one absent-source concert and first active image, never downloads in plan',async()=>{
 let reads=0;const concert={id:'c',region:'서울',start_date:conditions.from,end_date:conditions.to,performance_status:'공연예정'}
 const runner=createScheduledOfficialWithOcr({env:{PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED:'true'},official:{run:async()=>({status:'SKIPPED',selected:0})},store:{concerts:async(c,limit)=>{reads++;assert.equal(limit,10);return [concert]},images:async id=>{assert.equal(id,'c');return [{id:'i'}]}},download:forbidden,workerFactory:forbidden})
 const result=await runner.run({conditions,plan:true});assert.equal(reads,1);assert.equal(result.ocr_fallback.selected,1);assert.equal(result.ocr_fallback.downloads,0);assert.equal(result.ocr_fallback.confirmation_posts,0)
})
