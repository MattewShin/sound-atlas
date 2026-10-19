import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createPipelineLocal, acquirePipelineLock, atomicJson, resolveRunningReport } from './pipelineLocal.mjs'
import { ownerLiveness } from './pipelineIdentity.mjs'
import { spawn } from 'node:child_process'

const instant=Date.parse('2026-10-19T01:00:00Z')
const identity=(pid,key='start-1')=>({state:'ALIVE',pid,start_key:key,started_at:'2026-10-19T00:00:00Z'})
const owner={pid:42,token:'old-token',run_id:'old-run',process:identity(42),created_at:'2026-10-19T00:00:00Z',heartbeat_at:'2026-10-19T00:01:00Z'}
const running=()=>({run_id:'old-run',execution:structuredClone(owner),status:'RUNNING',exit_code:0,started_at:'2026-10-19T00:00:00Z',finished_at:null,
  last_progress_at:'2026-10-19T00:02:00Z',stages:{preflight:{status:'SUCCEEDED',finished_at:'2026-10-19T00:01:00Z'},collection:{status:'PARTIAL',finished_at:'2026-10-19T00:02:00Z',succeeded:10,failed:1},ocr:{status:'RUNNING',succeeded:2,started_at:'2026-10-19T00:02:00Z',duration_ms:0}},errors:[{code:'KOPIS_HTTP_400'}]})
const fixture=async()=>mkdtemp(join(tmpdir(),'atlas-recovery-'))
const clean=async dir=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true})}

test('only matching run, lock token and process creation identity report RUNNING; age is irrelevant',async()=>{
  const report=running(),before=JSON.stringify(report)
  const alive=await resolveRunningReport(report,{lock:owner,inspect:async()=>identity(42),now:()=>instant+365*86400000})
  assert.equal(alive.status,'RUNNING');assert.equal(alive.exit_code,null)
  for(const lock of [null,{...owner,token:'new-token'},{...owner,run_id:'different-run'}]){
    const view=await resolveRunningReport(report,{lock,inspect:async()=>identity(42),now:()=>instant})
    assert.equal(view.status,'RUNNING_UNVERIFIED');assert.equal(view.finished_at,null)
  }
  const unknown=await resolveRunningReport(report,{lock:owner,inspect:async()=>({state:'UNKNOWN'}),now:()=>instant})
  assert.equal(unknown.status,'RUNNING_UNVERIFIED');assert.equal(JSON.stringify(report),before)
})

test('missing process and reused PID become INTERRUPTED without changing completed results or hiding upstream errors',async()=>{
  for(const inspect of [async()=>({state:'DEAD'}),async()=>identity(42,'new-process-start')]){
    const report=running(),view=await resolveRunningReport(report,{lock:owner,inspect,now:()=>instant})
    assert.equal(view.status,'INTERRUPTED');assert.equal(view.exit_code,1)
    assert.equal(view.finished_at_source,'LIVENESS_CHECK_OBSERVATION');assert.equal(view.termination.actual_exit_at,null)
    assert.equal(view.last_completed_stage,'collection');assert.deepEqual(view.stages.collection,report.stages.collection)
    assert.equal(view.stages.ocr.status,'INTERRUPTED');assert.equal(view.stages.ocr.succeeded,2)
    assert.deepEqual(view.errors,report.errors);assert.equal(report.status,'RUNNING')
  }
  assert.equal(await ownerLiveness(owner,async()=>identity(42,'reused')),'REUSED_PID')
})

test('latest is a read-only recovery projection and handles legacy PID-only locks conservatively',async()=>{
  const dir=await fixture()
  try{
    const report=running();delete report.execution
    await atomicJson(join(dir,'latest.json'),report);await atomicJson(join(dir,'lock.json'),{pid:42,token:'legacy'})
    const before=await readFile(join(dir,'latest.json'),'utf8'),lockBefore=await readFile(join(dir,'lock.json'),'utf8')
    const dead=createPipelineLocal(dir,'fixture',{}, {inspect:async()=>({state:'DEAD'}),now:()=>instant})
    assert.equal((await dead.latest()).status,'INTERRUPTED')
    const live=createPipelineLocal(dir,'fixture',{}, {inspect:async()=>identity(42),now:()=>instant})
    assert.equal((await live.latest()).status,'RUNNING_UNVERIFIED')
    assert.equal(await readFile(join(dir,'latest.json'),'utf8'),before);assert.equal(await readFile(join(dir,'lock.json'),'utf8'),lockBefore)
    assert.deepEqual((await readdir(dir)).sort(),['latest.json','lock.json'])
  }finally{await clean(dir)}
})

test('next owner reclaims absent/reused locks, persists previous interruption and preserves the checkpoint',async()=>{
  const dir=await fixture()
  try{
    const local=createPipelineLocal(dir,'fixture',{}, {inspect:async pid=>pid===99?identity(99,'new'):({state:'DEAD'}),now:()=>instant})
    const report=running();delete report.execution
    await local.saveReport(report);await atomicJson(join(dir,'lock.json'),{pid:42,token:'legacy'})
    const checkpoint='{"version":1,"private_fixture":"unchanged"}'
    await writeFile(join(dir,'state-fixture.json'),checkpoint)
    const lock=await acquirePipelineLock(dir,{pid:99,runId:'next-run',inspect:async pid=>pid===99?identity(99,'new'):({state:'DEAD'}),now:()=>instant})
    assert.ok(lock);assert.equal(lock.previousOwner.pid,42)
    await local.recoverPrevious(lock.owner,lock.previousOwner)
    const recovered=JSON.parse(await readFile(join(dir,'runs','old-run.json'),'utf8'))
    assert.equal(recovered.status,'INTERRUPTED');assert.equal(recovered.stages.collection.succeeded,10)
    assert.equal(await readFile(join(dir,'state-fixture.json'),'utf8'),checkpoint)
    await lock.heartbeat();assert.equal(JSON.parse(await readFile(join(dir,'lock.json'),'utf8')).run_id,'next-run')
    await lock.release();assert.equal((await readdir(dir)).includes('lock.json'),false)
    const reused={...owner,process:identity(42,'old-start')};await atomicJson(join(dir,'lock.json'),reused)
    const fresh=await acquirePipelineLock(dir,{pid:99,inspect:async pid=>identity(pid,'new-start')})
    assert.ok(fresh);await fresh.release()
  }finally{await clean(dir)}
})

test('dead recovery guards are reclaimed, live/unknown owners are never removed and heartbeat cannot revive a released lock',async()=>{
  const dir=await fixture(),inspect=async pid=>pid===99?identity(99):({state:'DEAD'})
  try{
    await atomicJson(join(dir,'lock.json'),owner);await atomicJson(join(dir,'lock-recovery.json'),owner)
    const lock=await acquirePipelineLock(dir,{pid:99,inspect});assert.ok(lock)
    await Promise.all([lock.heartbeat(),lock.heartbeat()]);await lock.release();await lock.heartbeat()
    assert.equal((await readdir(dir)).includes('lock.json'),false)
    await atomicJson(join(dir,'lock.json'),owner)
    await assert.rejects(acquirePipelineLock(dir,{pid:99,inspect:async pid=>pid===99?identity(99):({state:'UNKNOWN'})}),{code:'LOCK_OWNER_UNVERIFIABLE'})
    assert.deepEqual(JSON.parse(await readFile(join(dir,'lock.json'),'utf8')),owner)
  }finally{await clean(dir)}
})

test('wrapper exit receipt supplies a measured exit time but cannot turn an unfinished run into success',async()=>{
  const report=running();report.execution.launch_id='fixture-launch'
  const view=await resolveRunningReport(report,{lock:owner,inspect:async()=>({state:'DEAD'}),now:()=>instant,
    receipt:{launch_id:'fixture-launch',node_pid:42,node_finished_at:'2026-10-19T00:05:00Z',node_exit_code:-1073741510}})
  assert.equal(view.status,'INTERRUPTED');assert.equal(view.finished_at,'2026-10-19T00:05:00Z')
  assert.equal(view.finished_at_source,'NODE_EXIT_RECEIPT');assert.equal(view.termination.node_exit_code,-1073741510)
  assert.equal(view.exit_code,1)
})

test('a finalized per-run file wins over stale latest after an interrupted two-file replacement',async()=>{
  const dir=await fixture()
  try{
    const local=createPipelineLocal(dir,'fixture',{}, {inspect:async()=>({state:'DEAD'}),now:()=>instant})
    const report=running();await local.saveReport(report)
    const final={...report,status:'PARTIAL',exit_code:1,finished_at:'2026-10-19T00:04:00Z',stages:{...report.stages,ocr:{status:'SUCCEEDED',succeeded:3}}}
    await atomicJson(join(dir,'runs','old-run.json'),final)
    assert.deepEqual(await local.latest(),final)
    const before=await readFile(join(dir,'runs','old-run.json'),'utf8')
    await atomicJson(join(dir,'lock.json'),owner)
    await local.recoverPrevious(owner)
    assert.equal(await readFile(join(dir,'runs','old-run.json'),'utf8'),before)
    assert.deepEqual(JSON.parse(await readFile(join(dir,'latest.json'),'utf8')),final)
  }finally{await clean(dir)}
})

test('Windows hard-killed fixture run is projected interrupted and its real OS lock can be reclaimed', {skip:process.platform!=='win32'},async()=>{
  const dir=await fixture()
  const moduleUrl=new URL('./pipelineLocal.mjs',import.meta.url).href
  const source=`import {acquirePipelineLock,createPipelineLocal} from ${JSON.stringify(moduleUrl)};const directory=${JSON.stringify(dir)};const lock=await acquirePipelineLock(directory,{runId:'killed-fixture'});const local=createPipelineLocal(directory,'fixture',{});await local.saveReport({run_id:'killed-fixture',execution:lock.owner,status:'RUNNING',exit_code:null,started_at:new Date().toISOString(),finished_at:null,stages:{collection:{status:'SUCCEEDED',succeeded:7,finished_at:new Date().toISOString()},ocr:{status:'RUNNING',reused:1}}});console.log('READY');setInterval(()=>{},1000)`
  const child=spawn(process.execPath,['--input-type=module','-e',source],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const exited=new Promise(resolve=>child.once('exit',resolve))
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture startup timeout')),30000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',e=>{clearTimeout(timer);reject(e)})})
    const original=await readFile(join(dir,'latest.json'),'utf8')
    child.kill();await exited
    const local=createPipelineLocal(dir,'fixture',{})
    const view=await local.latest()
    assert.equal(view.status,'INTERRUPTED');assert.equal(view.last_completed_stage,'collection')
    assert.equal(view.stages.collection.succeeded,7);assert.equal(view.stages.ocr.reused,1)
    assert.equal(await readFile(join(dir,'latest.json'),'utf8'),original)
    const lock=await acquirePipelineLock(dir);assert.ok(lock)
    await local.recoverPrevious(lock.owner,lock.previousOwner);await lock.release()
    assert.equal(JSON.parse(await readFile(join(dir,'runs','killed-fixture.json'),'utf8')).status,'INTERRUPTED')
  }finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited}await clean(dir)}
})
