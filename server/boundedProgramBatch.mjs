// Design prototype only. No import from a production runner/store.
import {randomUUID} from 'node:crypto'
import {analyzeStoredProgram} from './programAnalysis.mjs'
import {automaticDecision} from './programAutomation.mjs'
export function boundedProgramItem(target){
 const analysis=analyzeStoredProgram(target)
 return {analysis,decisions:analysis.candidates.map(verified=>({candidate_key:verified.candidate_key,verified,...automaticDecision(verified,analysis,target)}))}
}
export async function selectBoundedProgramItems({items,plan}){
 const selected=[],excluded=[];let combined=null
 for(const item of items){
  if(selected.length===3){excluded.push({image_id:item.analysis.image_id,reason:'IMAGE_CAP'});continue}
  const next=await plan([...selected,item])
  if(!next.batch_fits||!next.run_fits||next.candidate_rows>30){excluded.push({image_id:item.analysis.image_id,reason:'TOTAL_IMPACT_CAP',candidate_rows:next.candidate_rows});continue}
  selected.push(item);combined=next
 }
 return {items:selected,plan:combined,excluded}
}
export async function executeBoundedProgramItems({store,items,requestId=randomUUID(),mode='COMPLETE',historyIds=null}){
 const plan=await store.plan(items,{mode,historyIds})
 if(!plan.operation_required)return {outcome:'UNCHANGED',post_calls:0,candidate_rows:0}
 if(!plan.batch_fits||!plan.run_fits||plan.image_count>3||plan.candidate_rows>30||!Number.isInteger(plan.candidate_rows)||plan.candidate_rows<0||!/^[a-f0-9]{64}$/.test(plan.plan_hash||''))
  throw Object.assign(new Error('BOUNDED_LIMIT_EXCEEDED'),{code:'BOUNDED_LIMIT_EXCEEDED'})
 // Exactly one write RPC. Never separate analysis/decision/finalization calls.
 return store.complete(items,{requestId,planHash:plan.plan_hash,mode,historyIds})
}
