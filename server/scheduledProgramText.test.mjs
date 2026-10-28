import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {createScheduledProgramText,getOfficialProgramScheduleEnabled} from './scheduledProgramText.mjs'
import {createPipelineRuntime} from './pipelineRuntime.mjs'
import {runConcertPipeline} from './concertPipeline.mjs'
import {PIPELINE_DEFAULTS} from './pipelineConfig.mjs'
import {initialPipelineState} from './pipelineLocal.mjs'
const conditions={region:'서울',from:'2099-01-01',to:'2099-01-31'}
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED:'true'}
const official=()=>{const text='[Program]\nF Chopin\nScherzo No.4 Op.54';return {id:randomUUID(),kopis_id:'PF900090',region:'서울',start_date:'2099-01-02',end_date:'2099-01-02',performance_status:'공연예정',kopis_detail_text:text,kopis_detail_text_hash:createHash('sha256').update(text).digest('hex')}}
test('official schedule defaults OFF and rejects malformed switches before any capability is used',async()=>{
  assert.equal(getOfficialProgramScheduleEnabled({}),false)
  const fail=()=>assert.fail('OFF capability used')
  assert.deepEqual(await createScheduledProgramText({env:{},fetchImpl:fail,coordinator:{run:fail}}).run({}),{status:'DISABLED',selected:0})
  for(const value of ['',true,'TRUE','0',null])assert.throws(()=>getOfficialProgramScheduleEnabled({PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED:value}),/INVALID/)
  for(const stage of ['PIPELINE_OCR_ENABLED','PIPELINE_ANALYSIS_ENABLED','PIPELINE_CLEANUP_ENABLED'])assert.throws(()=>createPipelineRuntime({env:{...env,PIPELINE_OCR_ENABLED:'false',PIPELINE_ANALYSIS_ENABLED:'false',PIPELINE_CLEANUP_ENABLED:'false',[stage]:'true'}}),/UNSAFE_STAGE_SETTINGS/)
})
test('official schedule selects one stored official source, calls coordinator once and never downloads or falls back to OCR',async()=>{
  const a=official(),b=official(),ocr={...official(),kopis_detail_text:null,kopis_detail_text_hash:null,current_ocr_evidence:{is_current:true,raw_text:'PROGRAM'}}
  for(const plan of [true,false]){
    const calls=[],runs=[],rows=[ocr,a,b]
    const schedule=createScheduledProgramText({env,fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.headers.Prefer,'count=exact');assert.equal(url.pathname,'/rest/v1/concerts');assert.equal(url.searchParams.get('limit'),'100');calls.push(url);return new Response(JSON.stringify(rows),{headers:{'content-range':'0-2/3'}})},
      coordinator:{run:async input=>{runs.push(input);return {status:plan?'DRY_RUN':'CONFIRMED',counts:{total:2}}}}})
    const r=await schedule.run({conditions,plan});assert.equal(r.selected,1);assert.equal(calls.length,1)
    assert.deepEqual(runs,[{concert_id:a.id,mode:plan?'DRY_RUN':'SAVE'}]);assert.ok(!JSON.stringify(r).includes(a.kopis_detail_text))
  }
})
test('no official source, invalid ranges or coordinator failure never cause a second concert to run',async()=>{
  for(const kind of ['none','range','failed']){
    let runs=0;const row={...official(),...(kind==='none'?{kopis_detail_text:null,kopis_detail_text_hash:null}:{})}
    const schedule=createScheduledProgramText({env,fetchImpl:async()=>new Response(JSON.stringify([row]),{headers:{'content-range':kind==='range'?'0-0/*':'0-0/1'}}),coordinator:{run:async()=>{runs++;return {status:'FAILED'}}}})
    if(kind==='none')assert.equal((await schedule.run({conditions})).selected,0)
    else await assert.rejects(schedule.run({conditions}),/RESPONSE_INVALID|SCHEDULE_FAILED/)
    assert.equal(runs,kind==='failed'?1:0)
  }
})
test('daily pipeline invokes the official stage once while cleanup/OCR/analysis/automation remain OFF; plan never SAVE',async()=>{
  for(const plan of [true,false]){
    let runs=0;const off=()=>assert.fail('OFF capability used'),settings={cleanup:false,collection:false,ocr:false,analysis:false}
    const runtime={stageSettings:settings,rollout:{scheduleEnabled:true},preflight:async()=>({}),repository:{snapshot:async()=>({concerts:[]})},
      programText:{run:async input=>{runs++;assert.equal(input.plan,plan);return {status:plan?'DRY_RUN':'CONFIRMED',selected:1}}}}
    for(const key of ['worker','download'])Object.defineProperty(runtime,key,{get:off})
    for(const key of ['analysis','automation','ocr','cleanupPlan'])Object.defineProperty(runtime.repository,key,{get:off})
    const result=await runConcertPipeline({runtime,state:initialPipelineState(),local:{saveState:async()=>{},saveReport:async()=>{}},options:{...PIPELINE_DEFAULTS,stageSettings:settings},plan})
    assert.equal(result.status,plan?'PLAN_READY':'SUCCESS');assert.equal(runs,1);assert.equal(result.official_program.selected,1)
  }
})
