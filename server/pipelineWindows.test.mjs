import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { terminateOwnedProcess } from './pipelineProcess.mjs'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, readdir } from 'node:fs/promises'
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
    const profiled=execute(['-File',join(scripts,'Invoke-ConcertPipeline.ps1'),'-Mode','plan','-NodePath',process.execPath,'-Profile','initial'])
    assert.equal(profiled.status,3,profiled.stderr)
    const args=JSON.parse(profiled.stdout).args
    for(const [name,value] of [['collect-limit','20'],['ocr-limit','20'],['analysis-limit','20'],['image-checks','40'],['max-seconds','1800']])assert.equal(args[args.indexOf('--'+name)+1],value)
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

test('daily preview budgets 32 minutes and Status exposes actual registered arguments without any task mutations', {skip:process.platform!=='win32'},()=>{
  const script=resolve('scripts/Manage-ConcertPipelineTask.ps1').replaceAll("'","''")
  const mocks=`function Get-ScheduledTask { [pscustomobject]@{TaskName='ClassicAtlas-LocalPipeline';State='Ready';Actions=@([pscustomobject]@{Execute='powershell.exe';Arguments='-Mode run -CollectLimit 10 -OcrLimit 3 -AnalysisLimit 10 -ImageChecks 10 -MaxSeconds 900';WorkingDirectory='fixture'});Triggers=@([pscustomobject]@{StartBoundary='2026-10-16T09:00:00+09:00';DaysInterval=1;Enabled=$true});Settings=[pscustomobject]@{ExecutionTimeLimit='PT17M'}} }; function Get-ScheduledTaskInfo { [pscustomobject]@{LastRunTime=(Get-Date '2026-10-16T09:00:00');NextRunTime=(Get-Date '2026-10-17T09:00:00');LastTaskResult=1} }; function Register-ScheduledTask {throw 'No mutations'}; function Unregister-ScheduledTask {throw 'No mutations'};`
  const preview=execute(['-Command',mocks+` & '${script}' -Action Preview -Profile daily -PowerPolicy allow-battery -NodePath '${process.execPath.replaceAll("'","''")}'`])
  assert.equal(preview.status,0,preview.stderr)
  const p=JSON.parse(preview.stdout)
  assert.equal(p.BatchMaxSeconds,1800);assert.equal(p.ExecutionTimeLimitSeconds,1920);assert.equal(p.ExecutionTimeLimit,'PT32M')
  assert.ok(p.Arguments.includes('-OcrLimit 20'));assert.equal(p.Registered.BatchMaxSeconds,900)
  assert.equal(p.Registered.ExecutionTimeLimit,'PT17M');assert.equal(p.Registered.TimeoutCompatible,true)
  assert.equal(p.RuntimeVerified,false)
  assert.equal(p.StopIfGoingOnBatteries,false);assert.equal(p.DisallowStartIfOnBatteries,false)
  assert.equal(p.RunOnlyIfIdle,false);assert.equal(p.StopOnIdleEnd,false);assert.equal(p.AllowHardTerminate,true)
  const status=execute(['-Command',mocks+` & '${script}' -Action Status`])
  assert.equal(status.status,0,status.stderr)
  const actual=JSON.parse(status.stdout)
  assert.ok(actual.Actions[0].Arguments.includes('-OcrLimit 3'));assert.equal(actual.ExecutionTimeLimitSeconds,1020)
})

test('Windows deadline cleanup terminates the owned launcher and its child process', {skip:process.platform!=='win32'},async()=>{
  const source='const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{windowsHide:true,stdio:"ignore"});console.log(child.pid);setInterval(()=>{},1000)'
  const child=spawn(process.execPath,['-e',source],{windowsHide:true,stdio:['ignore','pipe','ignore']})
  const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'})
  let descendant
  try{
    descendant=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('fixture startup timeout')),5000);child.stdout.once('data',part=>{clearTimeout(timeout);resolve(Number(part.toString().trim()))});child.once('error',reject)})
    assert.ok(Number.isInteger(descendant)&&descendant>0)
    const exited=new Promise(resolve=>child.once('exit',resolve))
    await Promise.all([terminateOwnedProcess(child),terminateOwnedProcess(child)]);await exited
    let alive=true
    for(let i=0;i<30;i++){try{process.kill(descendant,0)}catch(e){if(e.code==='ESRCH'){alive=false;break}}await new Promise(resolve=>setTimeout(resolve,50))}
    assert.equal(alive,false,'no orphaned child after stopping the owned process tree')
    assert.doesNotThrow(()=>process.kill(unrelated.pid,0),'unrelated Node process is untouched')
  }finally{await terminateOwnedProcess(child);await terminateOwnedProcess(unrelated)}
})

test('Windows run wrapper waits for Node, drains stdout/stderr, writes atomic receipt and preserves native control exit code', {skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-pipeline-wrapper-'))
  try{
    const scripts=join(directory,'scripts'),launches=join(directory,'.cache','concert-pipeline','launches')
    await mkdir(scripts,{recursive:true});await copyFile('scripts/Invoke-ConcertPipeline.ps1',join(scripts,'Invoke-ConcertPipeline.ps1'))
    await copyFile('scripts/WindowsBatchPower.ps1',join(scripts,'WindowsBatchPower.ps1'))
    await writeFile(join(directory,'.env'),'PIPELINE_TEST_MARKER=fixture\n')
    await writeFile(join(scripts,'runConcertPipeline.mjs'),`console.log('O'.repeat(100000));console.error('E'.repeat(100000));setTimeout(()=>{console.log(JSON.stringify({launch:process.env.CLASSIC_ATLAS_LAUNCH_ID,marker:process.env.PIPELINE_TEST_MARKER}));process.exitCode=1},150)`)
    const result=execute(['-File',join(scripts,'Invoke-ConcertPipeline.ps1'),'-Mode','run','-NodePath',process.execPath])
    assert.equal(result.status,1,result.stderr.slice(-1000));assert.ok(result.stdout.includes('fixture'))
    let files=await readdir(launches);assert.equal(files.some(f=>f.endsWith('.tmp')),false)
    const receipt=JSON.parse(await readFile(join(launches,files.find(f=>f.endsWith('.json'))),'utf8'))
    assert.equal(receipt.status,'PARTIAL');assert.equal(receipt.node_exit_code,1)
    assert.equal(receipt.system_awake.activation_succeeded,true)
    assert.equal(receipt.system_awake.release_succeeded,true)
    assert.equal(receipt.system_awake.display_required,false)
    assert.ok(Date.parse(receipt.system_awake.activated_at)<=Date.parse(receipt.node_started_at))
    assert.ok(Date.parse(receipt.system_awake.released_at)>=Date.parse(receipt.node_finished_at))
    assert.ok(Date.parse(receipt.node_finished_at)>=Date.parse(receipt.node_started_at)+100)
    assert.ok((await readFile(receipt.stdout_path,'utf8')).includes(receipt.launch_id))
    assert.ok((await readFile(receipt.stderr_path,'utf8')).length>=100000)
    await writeFile(join(scripts,'runConcertPipeline.mjs'),'process.exitCode=-1073741510')
    const interrupted=execute(['-File',join(scripts,'Invoke-ConcertPipeline.ps1'),'-Mode','run','-NodePath',process.execPath])
    assert.equal(interrupted.status>>>0,3221225786,interrupted.stderr)
    files=await readdir(launches)
    const records=await Promise.all(files.filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(join(launches,f),'utf8'))))
    const external=records.find(r=>r.node_exit_code_unsigned===3221225786)
    assert.ok(external);assert.equal(external.status,'EXTERNAL_CONTROL_TERMINATION')
    assert.equal(external.system_awake.release_succeeded,true)
  }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true})}
})

test('system awake lifetime covers success, partial, fatal, native and wrapper errors; activation failure only warns', {skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-pipeline-power-'))
  try{
    const scripts=join(directory,'scripts'),launches=join(directory,'.cache','concert-pipeline','launches')
    await mkdir(scripts,{recursive:true})
    for(const name of ['Invoke-ConcertPipeline.ps1','WindowsBatchPower.ps1'])await copyFile(join('scripts',name),join(scripts,name))
    const run=node=>execute(['-File',join(scripts,'Invoke-ConcertPipeline.ps1'),'-Mode','run','-NodePath',node])
    const records=async()=>Promise.all((await readdir(launches)).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(join(launches,f),'utf8'))))
    for(const [code,status] of [[0,'SUCCESS'],[1,'PARTIAL'],[2,'FATAL'],[7,'NATIVE_EXIT_FAILURE']]){
      await writeFile(join(scripts,'runConcertPipeline.mjs'),`console.log('fixture');process.exitCode=${code}`)
      const result=run(process.execPath);assert.equal(result.status,code,result.stderr)
      const receipt=(await records()).find(r=>r.node_exit_code===code)
      assert.equal(receipt.status,status)
      assert.equal(receipt.system_awake.activation_succeeded,true)
      assert.equal(receipt.system_awake.release_succeeded,true)
      assert.equal(receipt.system_awake.display_required,false)
      assert.equal(receipt.system_awake.flags,'ES_CONTINUOUS | ES_SYSTEM_REQUIRED')
    }
    const invalid=join(directory,'not-executable.txt');await writeFile(invalid,'fixture')
    assert.equal(run(invalid).status,2)
    const wrapper=(await records()).find(r=>r.status==='WRAPPER_FAILED')
    assert.ok(wrapper);assert.equal(wrapper.system_awake.release_succeeded,true)
    // Replace the helper only inside the disposable fixture. Production has no
    // environment flag or parameter that bypasses the native power request.
    await writeFile(join(scripts,'WindowsBatchPower.ps1'),"function Start-BatchSystemAwake { throw 'fixture failure contains no credentials' }")
    await writeFile(join(scripts,'runConcertPipeline.mjs'),"console.log('continued fixture')")
    const warning=run(process.execPath);assert.equal(warning.status,0,warning.stderr)
    assert.match(warning.stderr,/SYSTEM_AWAKE_REQUEST_FAILED/)
    assert.doesNotMatch(warning.stderr,/fixture failure/)
    const failed=(await records()).find(r=>r.system_awake.activation_succeeded===false)
    assert.equal(failed.status,'SUCCESS');assert.ok(failed.system_awake.activation_error.type)
    assert.match(await readFile(failed.stderr_path,'utf8'),/SYSTEM_AWAKE_REQUEST_FAILED/)
    const source=await readFile('scripts/WindowsBatchPower.ps1','utf8')
    assert.doesNotMatch(source,/ES_DISPLAY_REQUIRED|0x00000002/)
    assert.match(source,/SetThreadExecutionState\(Continuous \| SystemRequired\)/)
    assert.match(source,/SetThreadExecutionState\(Continuous\)/)
    assert.match(source,/owner\.Join\(\)/)
  }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true})}
})

test('daily WakeToRun proposal matches registered configuration, and registration prepares only a future trigger', {skip:process.platform!=='win32'},()=>{
  const script=resolve('scripts/Manage-ConcertPipelineTask.ps1').replaceAll("'","''")
  const args=` -Profile daily -PowerPolicy allow-battery -NodePath '${process.execPath.replaceAll("'","''")}'`
  const preview=execute(['-Command',`& '${script}' -Action Preview${args}`])
  assert.equal(preview.status,0,preview.stderr)
  const p=JSON.parse(preview.stdout)
  assert.equal(p.WakeToRun,true);assert.ok(Date.parse(p.FirstRunBoundary)>Date.now())
  const actual={TaskName:p.TaskName,State:'Ready',Actions:[{Execute:p.Executable,Arguments:p.Arguments,WorkingDirectory:p.WorkingDirectory}],Triggers:[{StartBoundary:p.FirstRunBoundary,DaysInterval:1,Enabled:true}],Principal:{UserId:p.User,LogonType:'Interactive',RunLevel:'Limited'},Settings:{ExecutionTimeLimit:'PT32M',StartWhenAvailable:true,MultipleInstances:'IgnoreNew',AllowHardTerminate:true,DisallowStartIfOnBatteries:false,StopIfGoingOnBatteries:false,RunOnlyIfIdle:false,IdleSettings:{StopOnIdleEnd:false},RunOnlyIfNetworkAvailable:false,WakeToRun:true,RestartCount:0}}
  const mock=value=>`$fixture='${JSON.stringify(value).replaceAll("'","''")}' | ConvertFrom-Json; function Get-ScheduledTask { $fixture }; function Get-ScheduledTaskInfo { [pscustomobject]@{LastRunTime=[datetime]::MinValue;NextRunTime=[datetime]$fixture.Triggers[0].StartBoundary;LastTaskResult=0} }; function Register-ScheduledTask {throw 'No mutations'}; function Unregister-ScheduledTask {throw 'No mutations'}; `
  const status=execute(['-Command',mock(actual)+`& '${script}' -Action Status${args}`])
  assert.equal(status.status,0,status.stderr)
  const verified=JSON.parse(status.stdout)
  assert.equal(verified.RuntimeVerified,true);assert.deepEqual(verified.ConfigurationDifferences,[])
  assert.equal(verified.RuntimeVerificationScope,'REGISTERED_CONFIGURATION');assert.equal(verified.BatchExecutionVerified,false)
  assert.equal(verified.TerminationSettings.WakeToRun,true);assert.equal(verified.ProposedWakeToRun,true)
  actual.Settings.WakeToRun=false
  const mismatch=execute(['-Command',mock(actual)+`& '${script}' -Action Preview${args}`])
  assert.equal(mismatch.status,0,mismatch.stderr)
  const different=JSON.parse(mismatch.stdout)
  assert.equal(different.RuntimeVerified,false);assert.equal(different.Registered.TerminationSettings.WakeToRun,false)
  assert.ok(different.ConfigurationDifferences.includes('WakeToRun'))
  actual.Settings.WakeToRun=true;actual.Principal.UserId=p.User.split('\\').at(-1);actual.Principal.LogonType=3;actual.Principal.RunLevel=0
  const nativePrincipal=execute(['-Command',mock(actual)+`& '${script}' -Action Status${args}`])
  assert.equal(nativePrincipal.status,0,nativePrincipal.stderr);assert.equal(JSON.parse(nativePrincipal.stdout).RuntimeVerified,true)
  const mutations=`function Get-ScheduledTask { $null }; function Get-ScheduledTaskInfo {throw 'absent'}; function New-ScheduledTaskAction {param($Execute,$Argument,$WorkingDirectory) @{} }; function New-ScheduledTaskTrigger {param([switch]$Daily,$At) $global:fixtureDailyTrigger=$At; @{} }; function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) @{} }; function New-ScheduledTaskSettingsSet { param([switch]$WakeToRun,[switch]$StartWhenAvailable,$MultipleInstances,[timespan]$ExecutionTimeLimit,[switch]$DontStopOnIdleEnd,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries) $global:fixturePowerSettings=@{WakeToRun=[bool]$WakeToRun;Seconds=$ExecutionTimeLimit.TotalSeconds;StartWhenAvailable=[bool]$StartWhenAvailable;MultipleInstances=$MultipleInstances;DontStopOnIdleEnd=[bool]$DontStopOnIdleEnd;AllowStartIfOnBatteries=[bool]$AllowStartIfOnBatteries;DontStopIfGoingOnBatteries=[bool]$DontStopIfGoingOnBatteries}; @{} }; function Register-ScheduledTask { [pscustomobject]@{Settings=$global:fixturePowerSettings;Boundary=$global:fixtureDailyTrigger.ToString('o')} | ConvertTo-Json }; `
  const register=execute(['-Command',mutations+`& '${script}' -Action Register${args} -Confirm:$false`])
  assert.equal(register.status,0,register.stderr)
  const registered=JSON.parse(register.stdout)
  assert.ok(Date.parse(registered.Boundary)>Date.now())
  assert.deepEqual(registered.Settings,{WakeToRun:true,Seconds:1920,StartWhenAvailable:true,MultipleInstances:'IgnoreNew',DontStopOnIdleEnd:true,AllowStartIfOnBatteries:true,DontStopIfGoingOnBatteries:true})
})
