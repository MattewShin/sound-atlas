import {analyzeStoredProgram} from './programAnalysis.mjs'

export const AUTOMATIC_PROGRAM_LIMITS=Object.freeze({images:3,candidates:30})
const interrupted=()=>Object.assign(new Error('Automatic stage budget changed'),{code:'BATCH_INTERRUPTED'})
// Pack complete images into the decision budget. A candidate cap must not leave
// a partially decided image which immediately writes again on the next run.
// This adapter also protects the legacy pipeline entry point without changing
// collection, OCR or ordinary analysis limits.
export function boundAutomaticStore(store,{images,candidates}={}){
 const enabled=Number.isInteger(images)&&images>0&&images<=3&&Number.isInteger(candidates)&&candidates>0&&candidates<=30
 const state={enabled,image_limit:enabled?images:0,candidate_limit:enabled?candidates:0,decisions:0,skipped_images:[]}
 let reservation=new Map(),selected=new Set(),queued=false
 const guard=async callback=>{
  if(state.stopped_outcome)throw interrupted()
  try{return await callback()}catch(error){state.stopped_outcome='FAILED';state.error_code=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'AUTOMATIC_STAGE_FAILED';throw interrupted()}
 }
 return {state,store:{...store,
  target:item=>guard(()=>store.target(item)),
  scope:id=>guard(()=>store.scope(id)),
  async queue(_limit,{imageIds}={}){
   if(!enabled||queued)return []
   queued=true
   const rows=await store.queue(100,{imageIds});let remaining=candidates;const result=[]
   for(const row of rows){
    if(result.length>=images)break
    const target=await store.target(row)
    if(!target){state.skipped_images.push({image_id:row.image_id,reason:'CURRENT_OCR_UNAVAILABLE'});continue}
    const count=analyzeStoredProgram(target).candidates.length
    if(count>remaining){state.skipped_images.push({image_id:row.image_id,reason:'WHOLE_IMAGE_DECISION_BUDGET'});continue}
    remaining-=count;reservation.set(row.image_id,count);result.push(row)
   }
   selected=new Set(result.map(r=>r.image_id));state.images_selected=result.length
   return result
  },
  async saveAnalysis(analysis){
   if(!enabled||state.stopped_outcome||!selected.has(analysis.image_id)||analysis.candidates.length>reservation.get(analysis.image_id))throw interrupted()
   return guard(()=>store.saveAnalysis(analysis))
  },
  async candidates(id){
   const rows=await guard(()=>store.candidates(id))
   if(rows.length>candidates-state.decisions)throw interrupted()
   return rows
  },
  async decide(input){
   if(!enabled||state.stopped_outcome||state.decisions>=candidates)throw interrupted()
   state.decisions++
   const result=await guard(()=>store.decide(input))
   if(['FAILED','RETRY_PENDING'].includes(result.outcome)){state.stopped_outcome=result.outcome;throw interrupted()}
   return result
  },
  async finish(...args){const result=await guard(()=>store.finish(...args));if(result===false){state.stopped_outcome='RETRY_PENDING';throw interrupted()}return result},
  async unavailable(){throw interrupted()},
 }}
}
