import test from 'node:test'
import assert from 'node:assert/strict'
import {selectBoundedProgramItems,executeBoundedProgramItems} from './boundedProgramBatch.mjs'
test('whole image selection counts history and caps combined impact at3/30 before writes',async()=>{
 const items=[{analysis:{image_id:'oversize'},n:64},{analysis:{image_id:'a'},n:16},{analysis:{image_id:'b'},n:15},{analysis:{image_id:'c'},n:10},{analysis:{image_id:'d'},n:4},{analysis:{image_id:'e'},n:0}]
 const selection=await selectBoundedProgramItems({items,plan:async items=>({candidate_rows:items.reduce((n,i)=>n+i.n,0),batch_fits:items.reduce((n,i)=>n+i.n,0)<=30,run_fits:true})})
 assert.deepEqual(selection.items.map(i=>i.analysis.image_id),['a','c','d']);assert.equal(selection.plan.candidate_rows,30)
})
test('client issues no completion POST for over-cap or unchanged input',async()=>{
 let posts=0;const store={plan:async()=>({operation_required:true,batch_fits:false,run_fits:true,image_count:1,candidate_rows:64}),complete:async()=>{posts++}}
 await assert.rejects(executeBoundedProgramItems({store,items:[]}),{code:'BOUNDED_LIMIT_EXCEEDED'});assert.equal(posts,0)
 store.plan=async()=>({operation_required:false});assert.equal((await executeBoundedProgramItems({store,items:[]})).post_calls,0);assert.equal(posts,0)
})
