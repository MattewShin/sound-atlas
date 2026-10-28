import {createSupabaseRest} from './supabaseRest.mjs'
import {createProgramAnalysisStore,effectiveEvidenceAttempt,evidenceIssue} from './supabaseProgramAnalysis.mjs'
import {AUTOMATION_RULE} from './programAutomation.mjs'
import {CATALOG_HASH,CATALOG_JSON} from './programAnalysis.mjs'

export const createProgramAutomationStore = (options={}) => {
 const request=createSupabaseRest(options),analysis=createProgramAnalysisStore(options)
 const read=async(table,params)=>request(table,{params:{select:'*',limit:'1000',...params}})
 return {
  async preflight(){const schema=await request('');if(!schema.paths?.['/rpc/decide_automatic_program_candidate'])throw Object.assign(new Error('PROGRAM_AUTOMATION_MIGRATION_REQUIRED'),{code:'PROGRAM_AUTOMATION_MIGRATION_REQUIRED'})},
  queue:(limit,{imageIds}={})=>request('rpc/queue_automatic_programs',{params:{p_limit:String(limit),p_catalog_hash:CATALOG_HASH,p_rule:AUTOMATION_RULE,...(imageIds?{p_image_ids:'{'+imageIds.join(',')+'}'}:{})}}),
  scope:id=>request('rpc/program_auto_input_hash',{params:{p_analysis_id:id,p_catalog_hash:CATALOG_HASH,p_rule:AUTOMATION_RULE}}),
  async target(item){
   const [concerts,images,attempts,results]=await Promise.all([
    read('concerts',{id:'eq.'+item.concert_id}),read('concert_program_images',{id:'eq.'+item.image_id}),
    read('concert_image_ocr_attempts',{image_id:'eq.'+item.image_id,order:'created_at.desc,finished_at.desc,id.desc'}),
    read('concert_image_ocr_results',{image_id:'eq.'+item.image_id})])
   if(attempts.length===1000||results.length===1000)throw Object.assign(new Error('AUTOMATION_SCAN_LIMIT'),{code:'AUTOMATION_SCAN_LIMIT'})
   const attempt=effectiveEvidenceAttempt(attempts),ocr=results.find(o=>o.id===attempt?.result_id)
   if(!concerts[0]||!images[0]||!ocr||evidenceIssue({image:images[0],ocr,attempts,results}))return null
   return {concert:concerts[0],image:images[0],attempt,ocr}
  },
  saveAnalysis:a=>analysis.save(a),
  candidates:id=>read('concert_program_candidates',{analysis_id:'eq.'+id}),
  decide:({analysisId,candidate,scope,decision,verified})=>request('rpc/decide_automatic_program_candidate',{body:{p_candidate_id:candidate.id,p_analysis_id:analysisId,p_input_hash:scope,p_rule:AUTOMATION_RULE,p_status:decision.status,p_reasons:decision.reasons,p_verified:verified,p_catalog_json:CATALOG_JSON}}),
  finish:(id,scope)=>request('rpc/finish_automatic_program',{body:{p_analysis_id:id,p_input_hash:scope,p_catalog_hash:CATALOG_HASH,p_rule:AUTOMATION_RULE}}),
  unavailable:item=>request('rpc/defer_automatic_program',{body:{p_analysis_id:item.id,p_input_hash:item.input_hash,p_catalog_hash:CATALOG_HASH,p_rule:AUTOMATION_RULE}}),
 }
}
