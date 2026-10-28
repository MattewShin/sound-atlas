import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {CATALOG_JSON} from '../programAnalysis.mjs'
import {executeBoundedProgramItems} from '../boundedProgramBatch.mjs'
import {cloneHistory} from './boundedProgramFixture.mjs'
import {readFile} from 'node:fs/promises'
export const boundedCases=[
 {name:'read-only plan/diagnostics and rejected isolation level leave every row unchanged',run:async f=>{
  const item=await f.make(0,1),run=await f.approve(),before=await f.snapshot()
  await f.db.exec('begin read only');const p=await f.plan(run,[item]);await f.db.exec('rollback')
  await f.db.exec(await readFile(new URL('../../supabase/diagnostics/20261023_program_automation_bounded.sql',import.meta.url),'utf8'))
  assert.equal(await f.snapshot(),before)
  await f.db.exec('begin isolation level repeatable read');await assert.rejects(f.complete(run,[item],p),/BOUNDED_READ_COMMITTED_REQUIRED/);await f.db.exec('rollback');assert.equal(await f.snapshot(),before)
 }},
 {name:'combined <=30 commits atomically, preserves manual receipt, repeat client POST0',run:async f=>{
  const manual=await f.make(2,1,true),c=(await f.db.query("select id from public.concert_program_candidates where analysis_id=$1 and track_id='brahms-intermezzo-op118-no2'",[manual.savedId])).rows[0]
  await f.db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',[c.id,'CONFIRMED','fixture manual note',manual.savedId,'stored-program-3',CATALOG_JSON])
  const receiptBefore=JSON.stringify((await f.db.query('select to_jsonb(r) data from public.concert_program_reviews r')).rows)
  const old=await f.make(0,1,true);await f.history(old.savedId,3)
  const item=await f.make(0,1),run=await f.approve();let posts=0
  const store={plan:items=>f.plan(run,items),complete:async(items,o)=>{posts++;return f.complete(run,items,{plan_hash:o.planHash},o.requestId)}}
  const r=await executeBoundedProgramItems({store,items:[item]});assert.equal(r.candidate_rows,5);assert.equal(r.historical_closed,3)
  assert.equal((await executeBoundedProgramItems({store,items:[item]})).post_calls,0);assert.equal(posts,1)
  const receiptAfter=JSON.stringify((await f.db.query("select to_jsonb(r) data from public.concert_program_reviews r where reviewer_kind='LOCAL_SERVICE_ROLE_OPERATOR'")).rows)
  assert.equal(receiptAfter,receiptBefore)
  assert.equal((await f.db.query('select is_effectively_confirmed ok from public.concert_program_candidate_status where id=$1',[c.id])).rows[0].ok,true)
 }},
 {name:'26 direct plus 38 history =64 is rejected by DB before writes',run:async f=>{
  const old=await f.make(0,1,true);await f.history(old.savedId,38)
  const item=await f.make(0,13),run=await f.approve(),p=await f.plan(run,[item]);assert.equal(p.direct_count,26);assert.equal(p.history_count,38);assert.equal(p.batch_fits,false)
  const before=await f.snapshot();await assert.rejects(f.complete(run,[item],p),/BOUNDED_LIMIT_EXCEEDED/);assert.equal(await f.snapshot(),before)
 }},
 {name:'approved history-only30/8 then complete26 progresses without partial checkpoints',run:async f=>{
  const old=await f.make(0,1,true),ids=await f.history(old.savedId,38),item=await f.make(0,13,true),run=await f.approve({history:true})
  assert.equal((await f.plan(run,[item])).candidate_rows,64)
  const first=ids.slice(0,30),p=await f.plan(run,[item],'HISTORY_ONLY',first),request=randomUUID()
  const r=await f.complete(run,[item],p,request,'HISTORY_ONLY',first);assert.equal(r.outcome,'HISTORY_RETIRED');assert.equal(r.direct_decisions,0);assert.equal(r.candidate_rows,30)
  assert.equal((await f.db.query('select auto_input_hash h from public.concert_program_analyses where id=$1',[item.savedId])).rows[0].h,null)
  assert.equal(Number((await f.db.query("select count(*) n from public.concert_program_candidates where analysis_id=$1 and review_status='REVIEW_REQUIRED'",[item.savedId])).rows[0].n),26)
  const beforeReplay=await f.snapshot();assert.equal((await f.complete(run,[item],p,request,'HISTORY_ONLY',first)).replayed,true);assert.equal(await f.snapshot(),beforeReplay)
  assert.equal((await f.plan(run,[item],'HISTORY_ONLY',first)).operation_required,false)
  assert.equal((await f.plan(run,[item])).batch_fits,false)
  const last=ids.slice(30),p2=await f.plan(run,[item],'HISTORY_ONLY',last);await f.complete(run,[item],p2,randomUUID(),'HISTORY_ONLY',last)
  const p3=await f.plan(run,[item]);assert.equal(p3.candidate_rows,26);await f.complete(run,[item],p3)
  assert.equal((await f.plan(run,[item])).operation_required,false)
  const debit=(await f.db.query('select candidate_rows_used,cardinality(image_ids) images from public.program_automation_bounded_runs where id=$1',[run])).rows[0]
  assert.equal(debit.candidate_rows_used,64);assert.equal(debit.images,1)
 }},
 {name:'history growth committed after preflight rejects manifest with zero writes',run:async f=>{
  const old=await f.make(0,1,true),item=await f.make(0,1),run=await f.approve(),p=await f.plan(run,[item]);
  const seed=(await f.db.query('select id from public.concert_program_candidates where analysis_id=$1 limit 1',[old.savedId])).rows[0].id;await cloneHistory(f.db,seed)
  const before=await f.snapshot();await assert.rejects(f.complete(run,[item],p),/BOUNDED_PLAN_CHANGED/);assert.equal(await f.snapshot(),before)
 }},
 {name:'second-image late failure rolls back first image, receipts, history and budget',run:async f=>{
  const first=await f.make(0,1),second=await f.make(1,1);for(const d of second.decisions)d.reasons=['FIXTURE_BAD_CONFIRMATION_PROOF']
  const run=await f.approve(),items=[first,second],p=await f.plan(run,items),before=await f.snapshot();assert.equal(p.candidate_rows,4)
  await assert.rejects(f.complete(run,items,p),/Automatic identity or program proof invalid/);assert.equal(await f.snapshot(),before)
 }},
 {name:'durable run budgets reject later individually valid batches',run:async f=>{
  const a=await f.make(0,1),b=await f.make(1,2),run=await f.approve({candidateLimit:5});await f.complete(run,[a],await f.plan(run,[a]))
  const p=await f.plan(run,[b]);assert.equal(p.batch_fits,true);assert.equal(p.run_fits,false);let before=await f.snapshot();await assert.rejects(f.complete(run,[b],p),/BOUNDED_LIMIT_EXCEEDED/);assert.equal(await f.snapshot(),before)
  const a2=await f.make(0,1),imageRun=await f.approve({imageLimit:1});await f.complete(imageRun,[a2],await f.plan(imageRun,[a2]));const p2=await f.plan(imageRun,[b]);assert.equal(p2.run_fits,false);before=await f.snapshot();await assert.rejects(f.complete(imageRun,[b],p2),/BOUNDED_LIMIT_EXCEEDED/);assert.equal(await f.snapshot(),before)
 }},
 {name:'unapproved history-only has zero writes and is not automatic fallback',run:async f=>{
  const old=await f.make(0,1,true),ids=await f.history(old.savedId,3),item=await f.make(0,1,true),run=await f.approve(),before=await f.snapshot()
  await assert.rejects(f.plan(run,[item],'HISTORY_ONLY',ids),/BOUNDED_HISTORY_NOT_APPROVED/);assert.equal(await f.snapshot(),before)
 }},
 {name:'bounded-only grants deny legacy writes and API run-budget tampering',run:async f=>{
  for(const role of ['anon','authenticated'])for(const sig of ['public.plan_automatic_program_batch_bounded(uuid,jsonb,text,text,text,uuid[])','public.complete_automatic_program_batch_bounded(uuid,uuid,jsonb,text,text,text,text,uuid[])'])assert.equal((await f.db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,sig])).rows[0].ok,false)
  for(const sig of ['public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text)','public.finish_automatic_program(uuid,text,text,text)','public.defer_automatic_program(uuid,text,text,text)'])assert.equal((await f.db.query('select has_function_privilege(\'service_role\',$1,\'execute\') ok',[sig])).rows[0].ok,false)
  const item=await f.make(0,1),run=await f.approve();await f.db.exec('set role service_role')
  try{await assert.rejects(f.db.query("insert into public.program_automation_bounded_runs(task_ref) values('not-approved')"),/permission denied/);const p=await f.plan(run,[item]);assert.equal((await f.complete(run,[item],p)).candidate_rows,2)}finally{await f.db.exec('reset role')}
 }},
]
