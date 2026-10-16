import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { terminateOwnedProcess } from './pipelineProcess.mjs'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, basename } from 'node:path'
const powershell='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const execute=args=>spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive',...args],{windowsHide:true,encoding:'utf8',timeout:15000})

test('Windows wrapper handles spaces, project-relative env/cwd, caps and native exit code without profiles', {skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-pipeline-windows-'))
  try{
    const root=join(directory,'project with spaces'),scripts=join(root,'scripts')
    await mkdir(scripts,{recursive:true})
    await copyFile('scripts/Invoke-ConcertPipeline.ps1',join(scripts,'Invoke-ConcertPipeline.ps1'))
    await writeFile(join(root,'.env'),'PIPELINE_TEST_MARKER=loaded-from-project\n')
    await writeFile(join(scripts,'runConcertPipeline.mjs'),'console.log(JSON.stringify({cwd:process.cwd(),marker:process.env.PIPELINE_TEST_MARKER,args:process.argv.slice(2)}));process.exitCode=3')
    const result=execute(['-File',join(scripts,'Invoke-ConcertPipeline.ps1'),'-Mode','plan','-NodePath',process.execPath,'-CollectLimit','7','-OcrLimit','2','-AnalysisLimit','5','-ListPages','2','-MaxSeconds','120','-CleanupLimit','12'])
    assert.equal(result.status,3,result.stderr)
    const output=JSON.parse(result.stdout)
    assert.equal(resolve(output.cwd),resolve(root));assert.equal(output.marker,'loaded-from-project')
    assert.deepEqual(output.args.slice(0,5),['plan','--collect-limit','7','--ocr-limit','2'])
    assert.ok(output.args.includes('--max-seconds'));assert.ok(output.args.includes('120'))
    assert.equal(output.args[output.args.indexOf('--cleanup-limit')+1],'12')
  }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)&&basename(directory).startsWith('atlas-pipeline-'));await rm(directory,{recursive:true,force:true})}
})

test('scheduler preview is read only, quotes Node paths, and prepares Interactive Limited at 09:00', {skip:process.platform!=='win32'},()=>{
  const result=execute(['-File',resolve('scripts/Manage-ConcertPipelineTask.ps1'),'-Action','Preview','-NodePath',process.execPath])
  assert.equal(result.status,0,result.stderr)
  const output=JSON.parse(result.stdout)
  assert.equal(output.Time,'09:00');assert.equal(output.LogonType,'Interactive');assert.equal(output.RunLevel,'Limited')
  assert.equal(output.StartWhenAvailable,true);assert.equal(output.MultipleInstances,'IgnoreNew')
  assert.ok(output.Arguments.includes(`-NodePath "${process.execPath}"`))
  assert.ok(output.Arguments.includes('-NoProfile'));assert.ok(!output.Arguments.includes('-ExecutionPolicy'))
  assert.ok(!/SUPABASE|KOPIS|service_role|Bearer/.test(output.Arguments))
  assert.equal(resolve(output.WorkingDirectory),resolve('.'))
})

test('Windows deadline cleanup terminates the owned launcher and its child process', {skip:process.platform!=='win32'},async()=>{
  const source='const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{windowsHide:true,stdio:"ignore"});console.log(child.pid);setInterval(()=>{},1000)'
  const child=spawn(process.execPath,['-e',source],{windowsHide:true,stdio:['ignore','pipe','ignore']})
  let descendant
  try{
    descendant=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('fixture startup timeout')),5000);child.stdout.once('data',part=>{clearTimeout(timeout);resolve(Number(part.toString().trim()))});child.once('error',reject)})
    assert.ok(Number.isInteger(descendant)&&descendant>0)
    const exited=new Promise(resolve=>child.once('exit',resolve))
    await terminateOwnedProcess(child);await exited
    let alive=true
    for(let i=0;i<30;i++){try{process.kill(descendant,0)}catch(e){if(e.code==='ESRCH'){alive=false;break}}await new Promise(resolve=>setTimeout(resolve,50))}
    assert.equal(alive,false,'no orphaned child after stopping the owned process tree')
  }finally{await terminateOwnedProcess(child)}
})
