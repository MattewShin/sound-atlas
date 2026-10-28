import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync,spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const config=JSON.parse(fs.readFileSync(new URL('./release-config.json',import.meta.url),'utf8')),mode=process.argv[2]||'verify';
if(!['verify','run'].includes(mode))throw Error('INVALID_RELEASE_MODE');
assert.equal(process.versions.node.split('.')[0],'22');
const head=execFileSync(config.git,['-C',config.release,'rev-parse','HEAD'],{windowsHide:true,encoding:'utf8'}).trim();assert.equal(head,config.sha);
for(const file of config.files){const target=path.resolve(config.release,file.path);assert.ok(target.startsWith(path.resolve(config.release)+path.sep));assert.equal(createHash('sha256').update(fs.readFileSync(target)).digest('hex'),file.sha256);}
const overrides={PROGRAM_ANALYSIS_SCHEDULE_ENABLED:'true',PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED:'true',PIPELINE_COLLECTION_ENABLED:'true',PIPELINE_CLEANUP_ENABLED:'false',PIPELINE_OCR_ENABLED:'false',PIPELINE_ANALYSIS_ENABLED:'false'};
const effectiveEnv={...process.env,...overrides};delete effectiveEnv.CLASSIC_ATLAS_DATABASE_URL;
const {parsePipelineArgs}=await import(pathToFileURL(path.join(config.release,'server/pipelineConfig.mjs')));
const {createPipelineRuntime}=await import(pathToFileURL(path.join(config.release,'server/pipelineRuntime.mjs')));
const {options}=parsePipelineArgs(['run','--profile','daily','--collect-limit','1','--ocr-limit','1','--analysis-limit','1','--image-checks','1','--max-seconds','1800','--cleanup-limit','1'],effectiveEnv);
const runtime=createPipelineRuntime({env:effectiveEnv,fetchImpl:()=>{throw Error('VERIFY_NETWORK_FORBIDDEN')}});
assert.deepEqual(runtime.stageSettings,{cleanup:false,collection:true,ocr:false,analysis:false});assert.equal(runtime.rollout.scheduleEnabled,true);assert.ok(runtime.programText);assert.equal(runtime.worker,undefined);assert.equal(runtime.download,undefined);assert.equal(options.collectLimit,1);assert.equal(options.maxSeconds,1800);
if(mode==='verify')console.log(JSON.stringify({verified:true,sha:head,files:config.files.length,stageSettings:runtime.stageSettings,officialProgram:true,concertLimit:1,newConfirmationLimit:1,maxSeconds:1800,ocrInitialized:false,networkCalls:0,adminDatabaseUrlForwarded:false}));
else{
 const entry=path.join(config.release,'scripts/Invoke-ConcertPipeline.ps1');
 const args=['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',entry,'-Mode','run','-Profile','daily','-NodePath',config.node,'-CollectLimit','1','-OcrLimit','1','-AnalysisLimit','1','-ImageChecks','1','-CleanupLimit','1','-MaxSeconds','1800','-ListPages','4','-DbPages','20','-RecheckHours','24'];
 const child=spawn(config.powershell,args,{cwd:config.release,env:effectiveEnv,windowsHide:true,stdio:'inherit'});
 child.once('error',()=>{console.error('RELEASE_LAUNCH_FAILED');process.exitCode=2});child.once('close',code=>{process.exitCode=code??2});
}
