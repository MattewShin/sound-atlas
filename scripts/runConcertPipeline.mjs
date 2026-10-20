import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parsePipelineArgs, serializePipelineReport, safeCode, koreanTime } from '../server/pipelineConfig.mjs'
import { acquirePipelineLock, createPipelineLocal } from '../server/pipelineLocal.mjs'
import { createPipelineRuntime } from '../server/pipelineRuntime.mjs'
import { runConcertPipeline } from '../server/concertPipeline.mjs'
import { collectionConditions } from '../server/concertCollectionConfig.mjs'
import { MATCHER_VERSION,CATALOG_HASH } from '../server/programAnalysis.mjs'
import {getProgramRollout} from '../server/programRollout.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
process.chdir(root)
const directory=join(root,'.cache','concert-pipeline')
let lock,timer,heartbeat,local,report,selectedOptions
const runId=randomUUID()
const cliStarted=Date.now()
const controller=new AbortController()
const interrupt=signal=>controller.abort(signal||'CANCELLED')
const onInt=()=>interrupt('SIGINT'),onTerm=()=>interrupt('SIGTERM'),onBreak=()=>interrupt('SIGBREAK')
process.once('SIGINT',onInt);process.once('SIGTERM',onTerm)
if(process.platform==='win32')process.once('SIGBREAK',onBreak)
try {
  const {command,options}=parsePipelineArgs(process.argv.slice(2))
  selectedOptions=options
  if(command==='help') console.log('npm run pipeline -- plan|run|latest [--profile initial|daily] [--cleanup-limit 100 --collect-limit 10 --ocr-limit 3 --analysis-limit 10 --list-pages 4 --db-pages 20 --image-checks 10 --max-seconds 900 --recheck-hours 24]\nProfiles: initial=20/20/20, daily=10/20/20; both imageChecks=40, maxSeconds=1800. Explicit caps override profiles. Runtime unverified. plan: DB/local reads only. run: permanently deletes expired concerts after preflight. Exit: 0 success, 1 partial/interrupted, 2 fatal, 3 duplicate skipped.')
  else if(command==='latest') console.log(serializePipelineReport(await createPipelineLocal(directory,'',process.env).latest()))
  else {
    const rollout=getProgramRollout()
    if(command==='run'){
      console.log(JSON.stringify({event:'analysis_version',matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,rollout}))
      lock=await acquirePipelineLock(directory,{runId})
      if(lock){
        if(/^[0-9a-f-]{36}$/i.test(process.env.CLASSIC_ATLAS_LAUNCH_ID||''))lock.owner.launch_id=process.env.CLASSIC_ATLAS_LAUNCH_ID
        heartbeat=setInterval(()=>{lock.heartbeat().catch(()=>controller.abort('LOCK_OWNERSHIP_LOST'))},15000);heartbeat.unref()
      }
      if(!lock){console.log(serializePipelineReport({run_id:randomUUID(),status:'DUPLICATE_SKIPPED',exit_code:3,
        started_at:koreanTime(cliStarted),finished_at:koreanTime(Date.now()),duration_ms:Date.now()-cliStarted,limits:options,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH}));process.exitCode=3}
    }
    if(command==='plan'||lock){
      timer=setTimeout(()=>controller.abort('TIME_LIMIT'),options.maxSeconds*1000)
      // Do not initialize credentials, KOPIS clients or Python for a gated run.
      const gated=command==='run'&&!rollout.scheduleEnabled
      const runtime=gated?{rollout}:createPipelineRuntime({signal:controller.signal})
      local=createPipelineLocal(directory,runtime.namespace||'',process.env)
      if(lock)await local.recoverPrevious(lock.owner,lock.previousOwner)
      const state=gated?undefined:await local.readState()
      report=await runConcertPipeline({runtime,local,state,options,plan:command==='plan',signal:controller.signal,runId,execution:lock?.owner,
        onProgress:({stages})=>console.log(JSON.stringify({event:'progress',matcher_version:MATCHER_VERSION,...Object.fromEntries(['cleanup','collection','ocr','analysis'].map(k=>[k,{succeeded:stages[k].succeeded,failed:stages[k].failed,reused:stages[k].reused}]))}))})
      console.log(serializePipelineReport(report));process.exitCode=report.exit_code
      console.log(JSON.stringify({event:'pipeline_result',status:report.status,run_id:report.run_id}))
    }
  }
}catch(error){
  report={run_id:runId,execution:lock?.owner,status:'FATAL',exit_code:2,started_at:koreanTime(cliStarted),finished_at:koreanTime(Date.now()),duration_ms:Date.now()-cliStarted,
    conditions:collectionConditions(cliStarted),limits:selectedOptions||null,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,errors:[{code:safeCode(error)}],
    action:'Check required server variables, local Python/models, DB migrations, filesystem permissions and docs/LOCAL_PIPELINE.md.'}
  console.error(serializePipelineReport(report));process.exitCode=2
  if(lock){try{await mkdir(directory,{recursive:true});await (local||createPipelineLocal(directory,'',process.env)).saveReport(report)}catch{/* console remains available */}}
}finally{
  clearTimeout(timer);clearInterval(heartbeat);process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);process.removeListener('SIGBREAK',onBreak)
  if(lock)await lock.release()
}
