import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createPipelineRepository } from './pipelineRepository.mjs'
import { createCollectionKopisClient } from './concertCollector.mjs'
import { getEasyOcrConfig, EASYOCR_ENGINE_VERSION } from './easyOcrConfig.mjs'
import { createEasyOcrWorker } from './easyOcrWorker.mjs'
import { downloadKopisImage, imageValidationKey } from './kopisImageDownload.mjs'
import { pipelineError, getPipelineStageSettings } from './pipelineConfig.mjs'
import { getOcrImageConfig } from './ocrImageConfig.mjs'
import { terminateOwnedProcess } from './pipelineProcess.mjs'
import {getProgramRollout} from './programRollout.mjs'

const probePython = (config,signal) => new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(pipelineError('BATCH_INTERRUPTED'));return}
  // Local dependencies/models only: no OCR, downloads, credentials or venv activation.
  const code='import sys, easyocr, torch, torchvision; from pathlib import Path; assert easyocr.__version__ == sys.argv[2]; easyocr.Reader(["ko","en"], gpu=False, model_storage_directory=sys.argv[1], user_network_directory=sys.argv[3], download_enabled=False, verbose=False)'
  const env={PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',OMP_NUM_THREADS:'2',MKL_NUM_THREADS:'2'}
  for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key]
  let child,timedOut=false
  try{child=spawn(config.python,['-c',code,join(config.cacheDirectory,'models'),EASYOCR_ENGINE_VERSION,join(config.cacheDirectory,'user_network')],{env,windowsHide:true,stdio:'ignore'})}
  catch{reject(pipelineError('EASYOCR_PYTHON_UNAVAILABLE'));return}
  let shutdown=Promise.resolve()
  const stop=()=>{shutdown=terminateOwnedProcess(child);shutdown.catch(()=>{})},timer=setTimeout(()=>{timedOut=true;stop()},60000)
  signal?.addEventListener('abort',stop,{once:true})
  child.once('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(pipelineError('EASYOCR_PYTHON_UNAVAILABLE'))})
  child.once('exit',async code=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);try{await shutdown}catch(e){reject(e);return}signal?.aborted?reject(pipelineError('BATCH_INTERRUPTED')):timedOut?reject(pipelineError('EASYOCR_PREFLIGHT_TIMEOUT')):code===0?resolve():reject(pipelineError('EASYOCR_DEPENDENCY_OR_MODEL_FAILED'))})
})
export const createPipelineRuntime = ({env=process.env,signal,fetchImpl=fetch}={})=>{
  const stageSettings=getPipelineStageSettings(env)
  const config=stageSettings.ocr?getEasyOcrConfig(env):stageSettings.analysis?getOcrImageConfig(env):null
  const options={env,signal,fetchImpl,stageSettings}
  const repository=createPipelineRepository(options)
  const client=stageSettings.collection?createCollectionKopisClient(options):undefined
  const worker=stageSettings.ocr?createEasyOcrWorker({config,terminateImpl:terminateOwnedProcess}):undefined
  return {
    rollout:getProgramRollout(env),
    stageSettings,repository,client,worker,imageValidationKey:config?imageValidationKey(config):undefined,
    namespace:createHash('sha256').update(new URL(env.SUPABASE_URL).origin).digest('hex').slice(0,16),
    async preflight({plan,deferPython=false,stageSettings:requested=stageSettings}){
      if(Object.keys(stageSettings).some(key=>requested[key]!==stageSettings[key]))throw pipelineError('PIPELINE_STAGE_SETTINGS_MISMATCH')
      if(Number(process.versions.node.split('.')[0])!==22)throw pipelineError('NODE_22_REQUIRED')
      if(stageSettings.ocr){
      try{await access(config.python);await access(join(config.cacheDirectory,'models','craft_mlt_25k.pth'));await access(join(config.cacheDirectory,'models','korean_g2.pth'))}
      catch{throw pipelineError('EASYOCR_PYTHON_OR_MODELS_MISSING')}
      }
      const schema=await repository.preflight({plan})
      if(stageSettings.ocr&&!plan&&!deferPython)await probePython(config,signal)
      return {...schema,stage_settings:stageSettings,node:process.versions.node,python_file_checked:stageSettings.ocr,model_files_checked:stageSettings.ocr,python_dependencies_checked:stageSettings.ocr&&!plan&&!deferPython,kopis_authentication:!stageSettings.collection?'SKIPPED_DISABLED':plan?'NOT_CHECKED_IN_PLAN':'CHECKED_ON_FIRST_LIST_REQUEST'}
    },
    ...(stageSettings.ocr?{
      prepareOcr:({signal:stageSignal})=>probePython(config,stageSignal),
      ocrStageRepository:stageSignal=>{const scoped=createPipelineRepository({...options,signal:stageSignal});return {ocr:scoped.ocr,ocrResult:scoped.ocrResult}},
      download:(url,options={})=>downloadKopisImage(url,{config,signal:options.signal||signal,fetchImpl,knownLimit:options.knownLimit}),
    }:{}),
  }
}
