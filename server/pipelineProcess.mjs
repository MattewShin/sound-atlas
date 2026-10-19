import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { pipelineError } from './pipelineConfig.mjs'

const stopping=new WeakMap()
// Accept only the ChildProcess created by this runtime, never a user-supplied PID.
export const terminateOwnedProcess = child => {
  if(!child || !Number.isInteger(child.pid) || child.pid<1 || child.exitCode!==null || child.signalCode!==null)return Promise.resolve()
  if(stopping.has(child))return stopping.get(child)
  if(process.platform!=='win32'){child.kill();const done=Promise.resolve();stopping.set(child,done);return done}
  const systemRoot=process.env.SystemRoot||'C:\\Windows'
  const done=new Promise((resolve,reject)=>execFile(join(systemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],
    {windowsHide:true,timeout:5000,env:{SystemRoot:systemRoot},maxBuffer:100000},error=>{
      if(!error || child.exitCode!==null || child.signalCode!==null)resolve()
      else {child.kill();reject(pipelineError('PROCESS_TREE_STOP_FAILED'))}
    }))
  stopping.set(child,done)
  return done
}
