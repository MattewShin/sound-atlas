import {createSupabaseRest} from './supabaseRest.mjs'
import {CATALOG_JSON,CATALOG_HASH} from './programAnalysis.mjs'
import {createProgramAnalysisStore,effectiveEvidenceAttempt,evidenceIssue} from './supabaseProgramAnalysis.mjs'
import {createSupabaseOcr} from './supabaseOcr.mjs'
import {OCR_FALLBACK_RULE,fallbackHash,fallbackSource,planOcrFallback} from './ocrFallback.mjs'

export const OCR_FALLBACK_CONFIRM_RPC='confirm_concert_ocr_fallback_v1'
export function fallbackExpected(target,analysis,candidate,quality){
  return {rule:OCR_FALLBACK_RULE,candidate_id:candidate.id,analysis_id:candidate.analysis_id,analysis_payload_hash:analysis.payload_hash,catalog_hash:CATALOG_HASH,
    official_text_hash:target.concert.kopis_detail_text_hash??null,official_reason:fallbackSource(target.concert).reason,
    image_id:target.image.id,image_revision:Number(target.image.evidence_revision),concert_revision:Number(target.concert.program_context_revision),
    ocr_id:target.ocr.id,attempt_id:target.attempt.id,content_hash:target.ocr.content_sha256,quality:quality.snapshot,quality_hash:quality.hash}
}
export function createOcrFallbackStore(options={}){
  // No confirmation retries, including a retry hidden in shared REST transport.
  let confirmationPosts=0
  const request=createSupabaseRest({...options,fetchImpl:async(url,init)=>{
    if(init.method==='POST'&&new URL(url).pathname.endsWith('/'+OCR_FALLBACK_CONFIRM_RPC)){
      if(confirmationPosts++)throw Object.assign(new Error('OCR_FALLBACK_CONFIRM_LIMIT'),{code:'OCR_FALLBACK_CONFIRM_LIMIT'})
      try{const response=await (options.fetchImpl||fetch)(url,init);if(!response.ok)throw Error();return response}catch{throw Object.assign(new Error('OCR_FALLBACK_CONFIRM_FAILED'),{code:'OCR_FALLBACK_CONFIRM_FAILED'})}
    }
    return (options.fetchImpl||fetch)(url,init)
  }})
  const read=async(table,params={})=>{const rows=await request(table,{params:{select:'*',limit:'101',...params}});if(!Array.isArray(rows)||rows.length>=101)throw Error('OCR_FALLBACK_READ_LIMIT');return rows}
  const analysisStore=createProgramAnalysisStore(options),ocrStore=createSupabaseOcr(options)
  return {
    async preflight(){const schema=await request(''),p=await read('concert_program_version_policy',{matcher_version:'eq.'+OCR_FALLBACK_RULE});if(!schema.paths?.['/rpc/'+OCR_FALLBACK_CONFIRM_RPC]||p.length!==1||p[0].enabled!==true)throw Error('OCR_FALLBACK_DISABLED_OR_MIGRATION_MISSING')},
    async concerts(conditions,limit=10){if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('OCR_FALLBACK_SCOPE_LIMIT');return read('concerts',{region:'eq.'+conditions.region,start_date:'lte.'+conditions.to,end_date:'gte.'+conditions.from,performance_status:'in.(공연예정,공연중)',order:'start_date.asc,kopis_id.asc',limit:String(limit)})},
    async images(concertId){return (await read('concert_program_images',{concert_id:'eq.'+concertId,is_active:'eq.true',image_type:'eq.DETAIL',order:'sort_order.asc,id.asc'}))},
    async refresh(concertId,imageId){const k=await read('concerts',{id:'eq.'+concertId,limit:'2'}),i=await read('concert_program_images',{id:'eq.'+imageId,limit:'2'});if(k.length!==1||i.length!==1||i[0].concert_id!==k[0].id)throw Error('OCR_FALLBACK_SOURCE_MISSING');return {concert:k[0],image:i[0]}},
    saveOcr:(attempt,result)=>ocrStore.saveAttempt(attempt,result),
    async current(concertId,imageId){const base=await this.refresh(concertId,imageId),attempts=await read('concert_image_ocr_attempts',{image_id:'eq.'+imageId}),results=await read('concert_image_ocr_results',{image_id:'eq.'+imageId}),attempt=effectiveEvidenceAttempt(attempts),ocr=results.find(r=>r.id===attempt?.result_id);
      if(!ocr||evidenceIssue({image:base.image,ocr,attempts,results})||attempt.status!=='SUCCEEDED'||attempt.content_sha256!==ocr.content_sha256)throw Error('OCR_FALLBACK_SOURCE_NOT_CURRENT');return {...base,ocr,attempt}},
    saveAnalysis:a=>analysisStore.save(a),
    candidates:id=>read('concert_program_candidates',{analysis_id:'eq.'+id,order:'candidate_key.asc'}),
    async existing(concertId){const legacy=await read('concert_program_candidate_status',{concert_id:'eq.'+concertId,is_effectively_confirmed:'eq.true'}),official=await read('concert_program_text_confirmation_status',{concert_id:'eq.'+concertId,is_effectively_confirmed:'eq.true'});return [...legacy,...official]},
    confirm:expected=>request('rpc/'+OCR_FALLBACK_CONFIRM_RPC,{body:{p_expected:expected,p_catalog_json:CATALOG_JSON}}),
  }
}

// The persisted candidate must still agree with a fresh deterministic analysis.
export async function confirmFallbackCandidate({store,target,candidate}){
  const fresh=await store.current(target.concert.id,target.image.id),plan=planOcrFallback(fresh)
  const eligible=plan.eligible.find(d=>d.candidate.candidate_key===candidate.candidate_key)
  if(!eligible)return {status:'SKIPPED',reason:'SKIPPED_NOT_CURRENT_OR_ELIGIBLE'}
  for(const field of ['track_id','work_id','evidence','identity','relation','outcome','section_index'])if(fallbackHash(candidate[field])!==fallbackHash(eligible.candidate[field]))return {status:'SKIPPED',reason:'SKIPPED_SNAPSHOT_MISMATCH'}
  const expected=fallbackExpected(fresh,plan.analysis,candidate,plan.quality)
  return {status:'CONFIRMED',receipt_id:await store.confirm(expected),expected}
}
