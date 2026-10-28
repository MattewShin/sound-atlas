import test from 'node:test'
import assert from 'node:assert/strict'
import {boundAutomaticStore} from './automaticProgramLimits.mjs'
import {runAutomaticPrograms} from './programAutomation.mjs'
import {parsePipelineArgs} from './pipelineConfig.mjs'
const target=(id,count)=>({concert:{id,title:'Recital',venue:'Hall',start_date:'2099-10-27',end_date:'2099-10-27',program_context_revision:0},image:{id,is_active:true,image_type:'DETAIL',evidence_revision:0},ocr:{id:'ocr'+id,raw_text:'PROGRAM\n'+Array.from({length:count},(_,i)=>`J Brahms\nIntermezzo Op.118 No.2\nF Chopin\nBallade Op.52 No.4`).join('\n'),detections:[]},attempt:{id:'attempt'+id}})
test('daily automation budgets are independent of collection and analysis',()=>{
 const {options:o}=parsePipelineArgs(['plan','--profile','daily','--analysis-limit','80'])
 assert.equal(o.analysisLimit,80);assert.equal(o.automaticImageLimit,3);assert.equal(o.automaticCandidateLimit,30)
})
test('unknown or excessive automatic settings disable only automatic queue',async()=>{
 for(const caps of [undefined,{images:20,candidates:100},{images:3,candidates:0}]){
  const b=boundAutomaticStore({queue:()=>assert.fail()},caps)
  assert.equal(b.state.enabled,false);assert.deepEqual(await b.store.queue(20),[])
 }
})
test('whole image packing respects 3 images and 30 decisions, including rejections',async()=>{
 const {analyzeStoredProgram}=await import('./programAnalysis.mjs')
 const ts=[target('large',16),target('a',5),target('b',5),target('c',5),target('d',5)]
 assert.equal(analyzeStoredProgram(ts[0]).candidates.length,32)
 let writes=0;const saved=new Map()
 const base={queue:async()=>ts.map(t=>({image_id:t.image.id})),target:async r=>ts.find(t=>t.image.id===r.image_id),saveAnalysis:async a=>{saved.set(a.image_id,a);return a.image_id},scope:async()=> 's',candidates:async id=>saved.get(id).candidates,decide:async()=>{writes++;return {outcome:'AUTO_UNLINKED',reasons:['TEST_REJECTION']}},finish:async()=>true}
 const b=boundAutomaticStore(base,{images:3,candidates:30,readImpact:async()=>0})
 const report=await runAutomaticPrograms({store:b.store,limit:20,candidateLimit:100})
 assert.equal(report.images_completed,3);assert.equal(writes,30);assert.equal(b.state.decisions,30)
 assert.equal(b.state.skipped_images[0].image_id,'large')
 await assert.rejects(b.store.decide({}),{code:'BATCH_INTERRUPTED'});assert.equal(writes,30)
})
test('automatic retry stops the adapter before another decision',async()=>{
 let calls=0
 const b=boundAutomaticStore({decide:async()=>{calls++;return {outcome:'RETRY_PENDING'}}},{images:3,candidates:30,readImpact:async()=>0})
 await assert.rejects(b.store.decide({}),{code:'BATCH_INTERRUPTED'})
 assert.equal(b.state.stopped_outcome,'RETRY_PENDING')
 await assert.rejects(b.store.decide({}),{code:'BATCH_INTERRUPTED'});assert.equal(calls,1)
})
test('unbounded legacy closeout is excluded before any analysis or candidate write',async()=>{
 const t=target('historical',13);let writes=0
 const b=boundAutomaticStore({queue:async()=>[{image_id:t.image.id}],target:async()=>t,saveAnalysis:async()=>{writes++}},
  {images:3,candidates:30,readImpact:async()=>38})
 const report=await runAutomaticPrograms({store:b.store})
 assert.equal(report.images_selected,0);assert.equal(writes,0)
 assert.equal(b.state.skipped_images[0].reason,'HISTORICAL_CLOSEOUT_REQUIRES_BOUNDED_RPC')
 assert.equal(b.state.skipped_images[0].candidate_rows,38)
})
test('newly observed historical closeout blocks finalization and all following writes',async()=>{
 const t=target('changed',1),saved=new Map();let reads=0,finished=0
 const {analyzeStoredProgram}=await import('./programAnalysis.mjs');const a=analyzeStoredProgram(t)
 const base={queue:async()=>[{id:'old',image_id:t.image.id}],target:async()=>t,saveAnalysis:async()=> 'new',scope:async()=> 'scope',candidates:async()=>a.candidates,decide:async()=>({outcome:'AUTO_UNLINKED'}),finish:async()=>{finished++;return true}}
 const b=boundAutomaticStore(base,{images:3,candidates:30,readImpact:async()=>++reads>2?1:0})
 await assert.rejects(runAutomaticPrograms({store:b.store}),{code:'BATCH_INTERRUPTED'})
 assert.equal(finished,0);assert.equal(b.state.stopped_outcome,'HISTORY_CLOSEOUT_BLOCKED')
 await assert.rejects(b.store.decide({}),{code:'BATCH_INTERRUPTED'})
})
