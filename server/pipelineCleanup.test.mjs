import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackCleanupPlan, pruneExpiredPipelineState, emptyCleanupCounts, validCleanupDates, CLEANUP_TABLES, CLEANUP_SCHEMA_VERSION } from './pipelineCleanup.mjs'
import { initialPipelineState } from './pipelineLocal.mjs'
import { createPipelineRepository } from './pipelineRepository.mjs'
import { parsePipelineArgs, PIPELINE_DEFAULTS } from './pipelineConfig.mjs'

test('cleanup preview uses end date with deterministic caps and excludes malformed dates',()=>{
  const concerts=[{id:'b',kopis_id:'PF2',start_date:'2026-10-10',end_date:'2026-10-14'},
    {id:'a',kopis_id:'PF1',start_date:'2026-10-10',end_date:'2026-10-14'},
    {id:'c',start_date:'2026-10-10',end_date:'2026-10-16'},
    {id:'d',start_date:'2026-03-01',end_date:'2026-12-01'},
    {id:'e',start_date:'2026-10-10',end_date:null},
    {id:'f',start_date:'2026-10-10',end_date:'2026-02-30'}]
  const data=Object.fromEntries(CLEANUP_TABLES.map(t=>[t,[]]));data.concerts=concerts
  const plan=fallbackCleanupPlan(data,'2026-10-16',1)
  assert.equal(plan.total,2);assert.equal(plan.targets[0].id,'a');assert.equal(plan.excluded_invalid_dates,2)
  assert.equal(plan.counts.concerts,1);assert.equal(plan.migration_required,true)
  assert.equal(validCleanupDates({start_date:'2026-10-10',end_date:'infinity'}),false)
  assert.equal(PIPELINE_DEFAULTS.cleanupLimit,100)
  assert.equal(parsePipelineArgs(['run','--cleanup-limit','5']).options.cleanupLimit,5)
  assert.throws(()=>parsePipelineArgs(['run','--cleanup-limit','0']))
  assert.throws(()=>parsePipelineArgs(['run','--cleanup-limit','1001']))
})

test('expired local retries and pending items are pruned without resetting healthy cursor or unknown ownership',()=>{
  const state=initialPipelineState();state.collection.page=8;state.collection.cycle=2;state.collection.lastSignature='keep'
  state.collection.pending=['PF1','PF2','PF3'];state.collection.dates={PF1:{from:'2026-10-01',to:'2026-10-15'},PF2:{from:'2026-10-16',to:'2026-10-16'},PF3:{from:'2026-10-18',to:'2026-10-19'}}
  state.retries={'collect:PF1':{},'ocr:old-image':{},'analysis:owned':{},'analysis:legacy-unknown':{},'collect:PF2':{}}
  state.touched={'collect:PF1':1,'ocr:old-image':1,'analysis:owned':1,'collect:PF2':2}
  state.owners={'analysis:owned':'PF1'}
  const result=pruneExpiredPipelineState(state,'2026-10-16',[{kopis_id:'PF1',image_ids:['old-image']}])
  assert.equal(result.pending_removed,1);assert.deepEqual(state.collection.pending,['PF2','PF3'])
  assert.equal(state.collection.page,8);assert.equal(state.collection.cycle,2);assert.equal(state.collection.lastSignature,'keep')
  assert.deepEqual(Object.keys(state.retries).sort(),['analysis:legacy-unknown','collect:PF2'])
  assert.deepEqual(state.owners,{})
})

test('repository cleanup plan is GET only; missing migration fails run but preserves read-only plan',async()=>{
  const calls=[],env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-secret'}
  const paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis'].map(n=>['/rpc/'+n,{}]))
  const repo=createPipelineRepository({env,fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method,select:url.searchParams.get('select')})
    assert.equal(url.origin,env.SUPABASE_URL)
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:[]))
  }})
  await repo.preflight({plan:true})
  const plan=await repo.cleanupPlan(100,'2026-10-16',20)
  assert.equal(plan.migration_required,true);assert.equal(plan.total,0);assert.ok(calls.every(c=>c.method==='GET'))
  assert.ok(calls.every(c=>!c.select||!c.select.includes('raw_text')))
  await assert.rejects(repo.preflight(),{code:'CLEANUP_MIGRATION_REQUIRED'})
  assert.throws(()=>repo.cleanupDelete('id','operation','run'),{code:'CLEANUP_MIGRATION_REQUIRED'})
})

test('installed cleanup uses private GET plan and only the transactional deletion RPC for writes',async()=>{
  const calls=[],env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-secret'}
  const paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis','plan_expired_concert_cleanup','delete_expired_concert'].map(n=>['/rpc/'+n,{}]))
  const repo=createPipelineRepository({env,fetchImpl:async(url,init)=>{
    calls.push({path:url.pathname,method:init.method,body:init.body&&JSON.parse(init.body)})
    const value=url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{total:0,schema_version:CLEANUP_SCHEMA_VERSION}:url.pathname.endsWith('/delete_expired_concert')?{status:'DELETED',counts:emptyCleanupCounts()}:[]
    return new Response(JSON.stringify(value))
  }})
  await repo.preflight();await repo.cleanupPlan(100,'2026-10-16',20);await repo.cleanupDelete('concert','op','run')
  assert.deepEqual(calls.filter(c=>c.method!=='GET'),[{path:'/rest/v1/rpc/delete_expired_concert',method:'POST',body:{p_concert_id:'concert',p_operation_id:'op',p_run_id:'run'}}])
})

test('draft cleanup functions without the completed schema version cannot start deletion',async()=>{
  const calls=[],paths=Object.fromEntries(['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis','plan_expired_concert_cleanup','delete_expired_concert'].map(n=>['/rpc/'+n,{}]))
  const repo=createPipelineRepository({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-secret'},fetchImpl:async(url,init)=>{
    calls.push(init.method)
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths}:url.pathname.endsWith('/plan_expired_concert_cleanup')?{reference_date:'2026-10-16',total:0,targets:[],counts:emptyCleanupCounts()}:[]))
  }})
  assert.deepEqual(await repo.preflight({plan:true}),{cleanup_schema_ready:false})
  assert.equal((await repo.cleanupPlan(100,'2026-10-16',20)).migration_required,true)
  await assert.rejects(repo.preflight(),{code:'CLEANUP_MIGRATION_REQUIRED'})
  assert.throws(()=>repo.cleanupDelete('id','op','run'),{code:'CLEANUP_MIGRATION_REQUIRED'})
  assert.ok(calls.every(method=>method==='GET'))
})
