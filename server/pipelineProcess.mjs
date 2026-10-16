import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { pipelineError } from './pipelineConfig.mjs'

// Accept only the ChildProcess created by this runtime, never a user-supplied PID.
export const terminateOwnedProcess = async child => {
  if(!child || !Number.isInteger(child.pid) || child.pid<1 || child.exitCode!==null || child.signalCode!==null)return
  if(process.platform!=='win32'){child.kill();return}
  const systemRoot=process.env.SystemRoot||'C:\\Windows'
  await new Promise((resolve,reject)=>execFile(join(systemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],
    {windowsHide:true,timeout:5000,env:{SystemRoot:systemRoot},maxBuffer:100000},error=>{
      if(!error || child.exitCode!==null || child.signalCode!==null)resolve()
      else {child.kill();reject(pipelineError('PROCESS_TREE_STOP_FAILED'))}
    }))
}
