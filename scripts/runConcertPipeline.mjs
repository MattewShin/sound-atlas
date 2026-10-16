import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parsePipelineArgs, serializePipelineReport, safeCode, koreanTime } from '../server/pipelineConfig.mjs'
import { acquirePipelineLock, createPipelineLocal } from '../server/pipelineLocal.mjs'
import { createPipelineRuntime } from '../server/pipelineRuntime.mjs'
import { runConcertPipeline } from '../server/concertPipeline.mjs'
import { collectionConditions } from '../server/concertCollectionConfig.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
process.chdir(root)
const directory=join(root,'.cache','concert-pipeline')
let lock,timer,local,report,selectedOptions
const cliStarted=Date.now()
const controller=new AbortController()
const interrupt=()=>controller.abort()
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
try {
  const {command,options}=parsePipelineArgs(process.argv.slice(2))
  selectedOptions=options
  if(command==='help') console.log('npm run pipeline -- plan|run|latest [--cleanup-limit 100 --collect-limit 10 --ocr-limit 3 --analysis-limit 10 --list-pages 4 --db-pages 20 --image-checks 10 --max-seconds 900 --recheck-hours 24]\nplan: DB/local reads only; unlike OCR dry-run, no OCR or collection. run: permanently deletes expired concerts after preflight. Exit: 0 success, 1 partial/interrupted, 2 fatal, 3 duplicate skipped.')
  else if(command==='latest') console.log(serializePipelineReport(await createPipelineLocal(directory,'',process.env).latest()))
  else {
    if(command==='run'){
      lock=await acquirePipelineLock(directory)
      if(!lock){console.log(serializePipelineReport({run_id:randomUUID(),status:'DUPLICATE_SKIPPED',exit_code:3,
        started_at:koreanTime(cliStarted),finished_at:koreanTime(Date.now()),duration_ms:Date.now()-cliStarted,limits:options}));process.exitCode=3}
    }
    if(command==='plan'||lock){
      timer=setTimeout(interrupt,options.maxSeconds*1000)
      const runtime=createPipelineRuntime({signal:controller.signal})
      local=createPipelineLocal(directory,runtime.namespace,process.env)
      const state=await local.readState()
      report=await runConcertPipeline({runtime,local,state,options,plan:command==='plan',signal:controller.signal,
        onProgress:({stages})=>console.log(JSON.stringify({event:'progress',...Object.fromEntries(['cleanup','collection','ocr','analysis'].map(k=>[k,{succeeded:stages[k].succeeded,failed:stages[k].failed,reused:stages[k].reused}]))}))})
      console.log(serializePipelineReport(report));process.exitCode=report.exit_code
    }
  }
}catch(error){
  report={run_id:randomUUID(),status:'FATAL',exit_code:2,started_at:koreanTime(cliStarted),finished_at:koreanTime(Date.now()),duration_ms:Date.now()-cliStarted,
    conditions:collectionConditions(cliStarted),limits:selectedOptions||null,errors:[{code:safeCode(error)}],
    action:'Check required server variables, local Python/models, DB migrations, filesystem permissions and docs/LOCAL_PIPELINE.md.'}
  console.error(serializePipelineReport(report));process.exitCode=2
  if(lock){try{await mkdir(directory,{recursive:true});await (local||createPipelineLocal(directory,'',process.env)).saveReport(report)}catch{/* console remains available */}}
}finally{
  clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt)
  if(lock)await lock.release()
}
