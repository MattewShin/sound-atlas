import { performance } from 'node:perf_hooks'

export const PIPELINE_TIME_POLICY=Object.freeze({analysisAndFinalizeReserveSeconds:180,workerShutdownGraceMs:5000,finalizeGraceMs:10000})
export const monotonicNow=()=>performance.now()

// Timers only wake the checker. A monotonic comparison decides expiration;
// an early wake or a wall-clock adjustment cannot extend the budget.
export const createMonotonicDeadline=({durationMs,deadline,clock=monotonicNow,parentSignal,reason='TIME_LIMIT',setTimer=setTimeout,clearTimer=clearTimeout})=>{
  const started=clock(),at=deadline??started+durationMs,controller=new AbortController()
  if(!Number.isFinite(at)||at<0)throw new Error('INVALID_MONOTONIC_DEADLINE')
  let timer,disposed=false
  const expire=()=>{if(!controller.signal.aborted&&clock()>=at)controller.abort(reason);return controller.signal.aborted}
  const remainingMs=()=>Math.max(0,at-clock())
  const arm=()=>{if(disposed||expire())return;timer=setTimer(arm,Math.max(1,Math.ceil(remainingMs())))}
  const relay=()=>controller.abort(parentSignal.reason)
  parentSignal?.addEventListener('abort',relay,{once:true})
  if(parentSignal?.aborted)relay()
  arm()
  return {started,deadline:at,clock,signal:controller.signal,expire,remainingMs,elapsedMs:()=>Math.max(0,clock()-started),
    dispose(){disposed=true;clearTimer(timer);parentSignal?.removeEventListener('abort',relay)}}
}

export const ocrTimeWindow=(budget,policy=PIPELINE_TIME_POLICY)=>{
  const stageDeadline=budget.deadline-policy.analysisAndFinalizeReserveSeconds*1000
  const cancelDeadline=stageDeadline-policy.workerShutdownGraceMs
  return {stageDeadline,cancelDeadline,remainingMs:Math.max(0,cancelDeadline-budget.clock()),
    reserveSeconds:policy.analysisAndFinalizeReserveSeconds,workerShutdownGraceMs:policy.workerShutdownGraceMs}
}
