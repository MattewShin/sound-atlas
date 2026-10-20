import { open, readFile, rename, unlink, mkdir, stat, link } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipelineError, serializePipelineReport, koreanTime } from './pipelineConfig.mjs'
import { inspectProcess, ownerLiveness } from './pipelineIdentity.mjs'

export const initialPipelineState = () => ({ version:1, collection:{state:0,page:1,cycle:0,pending:[],dates:{},lastSignature:null},
  retries:{}, touched:{}, lanes:{collect:0,ocr:0} })
export const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path,'utf8')) }
  catch(e) { if(e.code==='ENOENT')return fallback; throw pipelineError('LOCAL_STATE_UNREADABLE') }
}
export const atomicJson = async (path, value, env) => {
  const temporary=path+'.'+randomUUID()+'.tmp'
  try { await writeExclusive(temporary,serializePipelineReport(value,env)); await rename(temporary,path) }
  finally { await unlink(temporary).catch(()=>{}) }
}
const writeExclusive = async(path,contents)=>{
  const file=await open(path,'wx')
  try { await file.writeFile(contents,'utf8'); await file.sync() } finally { await file.close() }
}
const publishExclusive = async(path,value)=>{
  const temporary=path+'.'+randomUUID()+'.tmp'
  try{await writeExclusive(temporary,JSON.stringify(value));await link(temporary,path)}
  finally{await unlink(temporary).catch(()=>{})}
}
export const processAlive = pid => {
  if(!Number.isInteger(pid)||pid<1)throw pipelineError('LOCK_OWNER_UNVERIFIABLE')
  try { process.kill(pid,0);return true } catch(e) { if(e.code==='ESRCH')return false;return true }
}
export const acquirePipelineLock = async(directory,{pid=process.pid,inspect=inspectProcess,alive,runId=randomUUID(),now=Date.now}={})=>{
  const identity=await inspect(pid)
  if(identity.state!=='ALIVE'||!identity.start_key)throw pipelineError('PROCESS_IDENTITY_UNVERIFIABLE')
  await mkdir(directory,{recursive:true})
  const path=join(directory,'lock.json'),recovery=join(directory,'lock-recovery.json')
  const owner={version:2,pid,token:randomUUID(),run_id:runId,process:identity,created_at:new Date(now()).toISOString(),heartbeat_at:new Date(now()).toISOString()}
  const liveness=async old=>alive&&!old?.process?(alive(old?.pid)?'ALIVE':'DEAD'):ownerLiveness(old,inspect)
  const claim=()=>publishExclusive(path,owner)
  let previousOwner=null
  try {await claim()}
  catch(e){
    if(e.code!=='EEXIST')throw e
    let guarded=false
    try {await publishExclusive(recovery,owner);guarded=true}
    catch(e){
      if(e.code!=='EEXIST')throw e
      const old=await readJson(recovery,null),status=await liveness(old)
      if(!['DEAD','REUSED_PID'].includes(status))return null
      if((await readJson(recovery,null))?.token!==old?.token)return null
      await unlink(recovery).catch(e=>{if(e.code!=='ENOENT')throw e})
      try{await publishExclusive(recovery,owner);guarded=true}catch(e){if(e.code==='EEXIST')return null;throw e}
    }
    try{
      const old=await readJson(path,null)
      if(old){
        const status=await liveness(old)
        if(status==='ALIVE')return null
        if(!['DEAD','REUSED_PID'].includes(status))throw pipelineError('LOCK_OWNER_UNVERIFIABLE')
        if((await readJson(path,null))?.token!==old.token)return null
        previousOwner=old
        await unlink(path)
      }
      try{await claim()}catch(e){if(e.code==='EEXIST')return null;throw e}
    }finally{if(guarded&&(await readJson(recovery,null))?.token===owner.token)await unlink(recovery)}
  }
  let queue=Promise.resolve(),released=false
  const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next}
  return {owner,previousOwner,
    heartbeat(){return serial(async()=>{if(released)return;if((await readJson(path,null))?.token!==owner.token)throw pipelineError('LOCK_OWNERSHIP_LOST');owner.heartbeat_at=new Date(now()).toISOString();await atomicJson(path,owner)})},
    release(){released=true;return serial(async()=>{if((await readJson(path,null))?.token===owner.token)await unlink(path)})}}
}

const completedStage = report => Object.entries(report.stages||{}).filter(([,s])=>['SUCCEEDED','PARTIAL'].includes(s.status)&&s.finished_at)
  .sort((a,b)=>Date.parse(b[1].finished_at)-Date.parse(a[1].finished_at))[0]?.[0]||null
const uuid=/^[0-9a-f-]{36}$/i
export const resolveRunningReport = async(report,{lock,inspect=inspectProcess,now=Date.now,modifiedAt,receipt}={})=>{
  if(report.status!=='RUNNING')return report
  const view=structuredClone(report),execution=report.execution
  const observedAt=koreanTime(now()),owner=execution||lock
  const liveness=owner?await ownerLiveness(owner,inspect):'UNKNOWN'
  const sameLock=execution&&lock&&execution.token===lock.token&&execution.run_id===report.run_id&&lock.run_id===report.run_id
    &&execution.pid===lock.pid&&execution.process?.start_key===lock.process?.start_key
  view.exit_code=null;view.observed_at=observedAt;view.last_completed_stage=report.last_completed_stage||completedStage(report)
  view.last_progress_at=report.last_progress_at||modifiedAt||null
  view.liveness={state:liveness,lock_matches:!!sameLock,heartbeat_at:sameLock?lock.heartbeat_at:null}
  if(liveness==='ALIVE'&&sameLock)return view
  if(!['DEAD','REUSED_PID'].includes(liveness)){
    view.status='RUNNING_UNVERIFIED';view.termination_reason=execution?'EXECUTION_OR_LOCK_UNVERIFIABLE':'LEGACY_EXECUTION_UNVERIFIABLE'
    return view
  }
  const exactReceipt=receipt?.launch_id===execution?.launch_id&&receipt?.node_pid===execution?.pid&&receipt?.node_finished_at&&Number.isInteger(receipt.node_exit_code)
  view.status='INTERRUPTED';view.exit_code=1
  view.finished_at=exactReceipt?receipt.node_finished_at:observedAt
  view.finished_at_source=exactReceipt?'NODE_EXIT_RECEIPT':'LIVENESS_CHECK_OBSERVATION'
  view.duration_ms=Math.max(0,Date.parse(view.finished_at)-Date.parse(report.started_at))
  view.duration_ms_basis=exactReceipt?'PROCESS_EXIT_RECEIPT':'UNTIL_RECOVERY_OBSERVATION_NOT_ACTUAL_RUNTIME'
  view.termination_reason=liveness==='REUSED_PID'?'PROCESS_IDENTITY_CHANGED':'PROCESS_NOT_FOUND'
  view.termination={detected_at:observedAt,actual_exit_at:exactReceipt?receipt.node_finished_at:null,
    node_exit_code:exactReceipt?receipt.node_exit_code:null,last_progress_at:view.last_progress_at,original_status:'RUNNING',source:'LOCAL_PROCESS_AND_LOCK_CHECK'}
  for(const s of Object.values(view.stages||{}))if(s.status==='RUNNING'){s.status='INTERRUPTED';s.finished_at=view.finished_at;s.finished_at_source=view.finished_at_source;s.last_checkpoint_duration_ms=s.duration_ms;s.duration_ms=exactReceipt&&s.started_at?Math.max(0,Date.parse(view.finished_at)-Date.parse(s.started_at)):null}
  return view
}

export const createPipelineLocal = (directory,namespace,env,{inspect=inspectProcess,now=Date.now}={})=>{
  const readView=async(path,previousLock)=>{
    let report=await readJson(path,{status:'NO_RUNS'})
    if(report.status!=='RUNNING')return report
    // saveReport writes the per-run file first. A kill between the two atomic
    // replacements must not discard a newer completed run or its stage results.
    if(/^[A-Za-z0-9_-]{1,100}$/.test(report.run_id||'')){
      const record=await readJson(join(directory,'runs',report.run_id+'.json'),null)
      if(record?.run_id===report.run_id&&record.execution?.token===report.execution?.token){
        report=record
        if(report.status!=='RUNNING')return report
      }
    }
    const lock=previousLock&&!report.execution?previousLock:await readJson(join(directory,'lock.json'),null)
    const modifiedAt=koreanTime((await stat(path)).mtimeMs)
    const receipt=uuid.test(report.execution?.launch_id||'')?await readJson(join(directory,'launches',report.execution.launch_id+'.json'),null):null
    return resolveRunningReport(report,{lock,inspect,now,modifiedAt,receipt})
  }
  return {
    directory,
    async readState(){
      const state=await readJson(join(directory,`state-${namespace}.json`),initialPipelineState())
      if(state.version!==1||![0,1].includes(state.collection?.state)||!Number.isInteger(state.collection?.page)||state.collection.page<1
        ||!Array.isArray(state.collection.pending)||state.collection.pending.some(id=>!/^PF\d{1,12}$/.test(id))
        ||!state.collection.dates||!state.retries||!state.touched||!state.lanes)throw pipelineError('LOCAL_STATE_INVALID')
      return state
    },
    saveState(state){return atomicJson(join(directory,`state-${namespace}.json`),state,env)},
    async saveReport(report){
      await mkdir(join(directory,'runs'),{recursive:true})
      await atomicJson(join(directory,'runs',report.run_id+'.json'),report,env)
      await atomicJson(join(directory,'latest.json'),report,env)
    },
    latest(){return readView(join(directory,'latest.json'))},
    async recoverPrevious(owner,previousLock){
      if((await readJson(join(directory,'lock.json'),null))?.token!==owner.token)throw pipelineError('LOCK_OWNERSHIP_LOST')
      const original=await readJson(join(directory,'latest.json'),{status:'NO_RUNS'})
      if(original.status!=='RUNNING')return original
      const view=await readView(join(directory,'latest.json'),previousLock)
      if(view.status==='INTERRUPTED'&&view.termination?.original_status==='RUNNING'){
        await atomicJson(join(directory,'runs',view.run_id+'.json'),view,env)
        await atomicJson(join(directory,'latest.json'),view,env)
      }else if(['SUCCESS','PARTIAL','FATAL','SKIPPED_ROLLOUT_GATE'].includes(view.status)){
        await atomicJson(join(directory,'latest.json'),view,env)
      }
      return view
    },
  }
}
