import { open, readFile, rename, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipelineError, serializePipelineReport } from './pipelineConfig.mjs'

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
export const processAlive = pid => {
  if(!Number.isInteger(pid)||pid<1)throw pipelineError('LOCK_OWNER_UNVERIFIABLE')
  try { process.kill(pid,0);return true } catch(e) { if(e.code==='ESRCH')return false;return true }
}
export const acquirePipelineLock = async(directory,{pid=process.pid,alive=processAlive}={})=>{
  await mkdir(directory,{recursive:true})
  const path=join(directory,'lock.json'), recovery=join(directory,'lock-recovery.json'), token=randomUUID()
  const owner={pid,token,created_at:new Date().toISOString()}
  const claim=()=>writeExclusive(path,JSON.stringify(owner))
  try { await claim() }
  catch(e) {
    if(e.code!=='EEXIST')throw e
    // Serialize stale takeovers and re-read the owner INSIDE this guard. Never
    // reclaim by age: even an old live process retains its lock.
    let guarded=false
    try { await writeExclusive(recovery,JSON.stringify(owner));guarded=true }
    catch(e) { if(e.code==='EEXIST')return null;throw e }
    try {
      const old=await readJson(path,null)
      if(old && (!old.token || !Number.isInteger(old.pid)))throw pipelineError('LOCK_OWNER_UNVERIFIABLE')
      if(old && alive(old.pid))return null
      if(old)await unlink(path)
      try { await claim() } catch(e) { if(e.code==='EEXIST')return null;throw e }
    } finally { if(guarded)await unlink(recovery) }
  }
  return {owner,async release(){const current=await readJson(path,null);if(current?.token===token)await unlink(path)} }
}
export const createPipelineLocal = (directory,namespace,env)=>({
  directory,
  async readState(){
    const state=await readJson(join(directory,`state-${namespace}.json`),initialPipelineState())
    if(state.version!==1 || ![0,1].includes(state.collection?.state) || !Number.isInteger(state.collection?.page) || state.collection.page<1
      || !Array.isArray(state.collection.pending) || state.collection.pending.some(id=>!/^PF\d{1,12}$/.test(id))
      || !state.collection.dates || !state.retries || !state.touched || !state.lanes)throw pipelineError('LOCAL_STATE_INVALID')
    return state
  },
  saveState(state){return atomicJson(join(directory,`state-${namespace}.json`),state,env)},
  async saveReport(report){
    await mkdir(join(directory,'runs'),{recursive:true})
    await atomicJson(join(directory,'runs',report.run_id+'.json'),report,env)
    await atomicJson(join(directory,'latest.json'),report,env)
  },
  latest(){return readJson(join(directory,'latest.json'),{status:'NO_RUNS'})},
})
