import test from 'node:test'
import assert from 'node:assert/strict'
import { createMonotonicDeadline, ocrTimeWindow } from './pipelineDeadline.mjs'

test('monotonic global/stage boundaries reserve 180 seconds plus a 5 second worker stopping window',()=>{
  let clock=1000,wake
  const b=createMonotonicDeadline({durationMs:1800000,clock:()=>clock,setTimer:fn=>(wake=fn),clearTimer:()=>{}})
  const w=ocrTimeWindow(b)
  assert.equal(w.stageDeadline-b.started,1620000);assert.equal(w.cancelDeadline-b.started,1615000)
  clock+=123000;assert.equal(ocrTimeWindow(b).remainingMs,1492000)
  const stage=createMonotonicDeadline({deadline:w.cancelDeadline,clock:()=>clock,parentSignal:b.signal,reason:'OCR_STAGE_BUDGET_EXHAUSTED',setTimer:()=>0,clearTimer:()=>{}})
  clock=w.cancelDeadline-1;assert.equal(stage.expire(),false)
  clock++;assert.equal(stage.expire(),true);assert.equal(stage.signal.reason,'OCR_STAGE_BUDGET_EXHAUSTED');assert.equal(b.signal.aborted,false)
  assert.equal(b.remainingMs(),185000)
  clock=b.deadline-1;wake();assert.equal(b.signal.aborted,false)
  clock++;wake();assert.equal(b.signal.reason,'TIME_LIMIT')
  stage.dispose();b.dispose()
})
test('empty and short OCR windows clamp to zero; external abort reasons remain distinct',()=>{
  let time=0;const parent=new AbortController()
  const b=createMonotonicDeadline({durationMs:180000,clock:()=>time,parentSignal:parent.signal,setTimer:()=>0,clearTimer:()=>{}})
  assert.equal(ocrTimeWindow(b).remainingMs,0);time=179999;assert.equal(b.expire(),false)
  parent.abort('SIGINT');assert.equal(b.signal.reason,'SIGINT');b.dispose()
})
test('wall clock changes and early timer wakeups cannot spend or extend monotonic time',()=>{
  let mono=0,wall=Date.now(),wake,scheduled
  const d=createMonotonicDeadline({durationMs:1000,clock:()=>mono,setTimer:(fn,ms)=>{wake=fn;scheduled=ms;return 0},clearTimer:()=>{}})
  wall+=86400000;wake();assert.equal(d.signal.aborted,false);assert.equal(scheduled,1000)
  wall-=2*86400000;mono=999;wake();assert.equal(d.remainingMs(),1);assert.equal(scheduled,1)
  mono=1000;wake();assert.equal(d.signal.reason,'TIME_LIMIT');d.dispose()
})
