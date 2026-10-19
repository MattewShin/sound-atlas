import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// OS creation identity, never process age. No process is terminated here.
const inspect = async pid => {
  if(!Number.isInteger(pid)||pid<1)return {state:'UNKNOWN'}
  if(process.platform==='win32'){
    const command=`$ErrorActionPreference='Stop';try {$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if($null -eq $p){@{state='DEAD'}|ConvertTo-Json -Compress}else{@{state='ALIVE';pid=$p.Id;start_key=$p.StartTime.ToUniversalTime().Ticks.ToString();started_at=$p.StartTime.ToUniversalTime().ToString('o');executable=$p.Path}|ConvertTo-Json -Compress}}catch{@{state='UNKNOWN'}|ConvertTo-Json -Compress}`
    return new Promise(resolve=>execFile(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
      ['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,maxBuffer:10000},(error,stdout)=>{
        try {resolve(error?{state:'UNKNOWN'}:JSON.parse(stdout.replace(/^\uFEFF/,'')))}catch{resolve({state:'UNKNOWN'})}
      }))
  }
  if(process.platform==='linux'){
    try{
      const [stat,boot]=await Promise.all([readFile(`/proc/${pid}/stat`,'utf8'),readFile('/proc/sys/kernel/random/boot_id','utf8')])
      const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ')
      if(['Z','X'].includes(fields[0]))return {state:'DEAD'}
      return {state:'ALIVE',pid,start_key:boot.trim()+':'+fields[19]}
    }catch(e){return {state:e.code==='ENOENT'?'DEAD':'UNKNOWN'}}
  }
  return {state:'UNKNOWN'}
}
let selfIdentity
export const inspectProcess = pid => pid===process.pid?(selfIdentity||=inspect(pid)):inspect(pid)
export const ownerLiveness = async (owner,inspect=inspectProcess) => {
  if(!owner||!Number.isInteger(owner.pid)||typeof owner.token!=='string')return 'UNKNOWN'
  const process=await inspect(owner.pid)
  if(process.state==='DEAD')return 'DEAD'
  if(process.state!=='ALIVE')return 'UNKNOWN'
  if(!owner.process?.start_key)return 'UNKNOWN'
  return process.start_key===owner.process.start_key?'ALIVE':'REUSED_PID'
}
