import {createScheduledProgramText} from './scheduledProgramText.mjs'
import {createOcrFallbackStore} from './supabaseOcrFallback.mjs'
import {fallbackSource} from './ocrFallback.mjs'
import {runOcrFallbackOne} from './ocrFallbackRunner.mjs'
import {downloadFallbackImage} from './ocrFallbackImage.mjs'
import {createEasyOcrWorker} from './easyOcrWorker.mjs'
import {getEasyOcrConfig} from './easyOcrConfig.mjs'
import {terminateOwnedProcess} from './pipelineProcess.mjs'

export function getOcrFallbackScheduleEnabled(env=process.env){
 const value=env.PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED??'false'
 if(!['true','false'].includes(value))throw Error('PROGRAM_OCR_FALLBACK_SCHEDULE_FLAG_INVALID')
 return value==='true'
}
// Official selection consumes the single-concert budget, even if it confirms nothing.
// Fallback can be independently disabled without touching the official runner.
export function createScheduledOfficialWithOcr({env=process.env,fetchImpl=fetch,signal,official,store,download,workerFactory}={}){
 const officialRunner=official||createScheduledProgramText({env,fetchImpl,signal})
 return {async run({conditions,plan=false}){
  const first=await officialRunner.run({conditions,plan})
  if(!getOcrFallbackScheduleEnabled(env)||first.selected!==0||first.status==='FAILED')return first
  const fallback=store||createOcrFallbackStore({env,fetchImpl,signal}),concerts=await fallback.concerts(conditions,10)
  const selected=concerts.find(k=>k.region===conditions.region&&k.start_date<=conditions.to&&k.end_date>=conditions.from&&['공연예정','공연중'].includes(k.performance_status)&&fallbackSource(k).status==='OCR')
  if(!selected)return {...first,ocr_fallback:{status:'SKIPPED',reason:'NO_ABSENT_OFFICIAL_SOURCE_IN_BOUNDED_SELECTION'}}
  const images=await fallback.images(selected.id),image=images[0]
  if(plan)return {...first,ocr_fallback:{status:'PLAN_ONLY',selected:1,image_selected:image?1:0,downloads:0,ocr_calls:0,confirmation_posts:0}}
  let worker
  const lazyWorker={recognize:async(...args)=>{worker??=workerFactory?workerFactory():createEasyOcrWorker({config:getEasyOcrConfig(env),terminateImpl:terminateOwnedProcess});return worker.recognize(...args)}}
  try{return {selected:1,official:first,ocr_fallback:await runOcrFallbackOne({store:fallback,concert:selected,image,download:download||((url,opt)=>downloadFallbackImage(url,{...opt,fetchImpl})),worker:lazyWorker,save:true,signal})}}
  finally{await worker?.close()}
 }}
}
