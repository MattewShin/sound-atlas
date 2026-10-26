import {createHash} from 'node:crypto'
import {routeProgramSource} from './programSourceRouter.mjs'
import {CATALOG_HASH,MATCHER_VERSION} from './programAnalysis.mjs'
import {createSupabaseRest} from './supabaseRest.mjs'
import {getTrackTarget} from '../src/data/workCatalog.js'

const hash=text=>createHash('sha256').update(text,'utf8').digest('hex')
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const benign=new Set(['COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','COMPOSER_AND_EXPLICIT_ITEM_IDENTITY',
  'TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'])
const unresolved=c=>!Array.isArray(c.review_reasons)||c.review_reasons.some(r=>!benign.has(r))
  ||c.identity?.arrangement_or_excerpt!==false||c.scope?.kind!=='EXACT'
  ||(c.matching?.issues?.length??0)>0||(c.matching?.arrangement_features?.length??0)>0

// Pure GET-result planner. It does not reparse, decide reviews or produce writes.
// OCR identity/freshness attestation is the same caller contract as the router;
// the adapter additionally verifies the real result ID, text and status rows.
export function planProgramSource({concert,current_ocr_evidence,analyses=[],statuses=[],policy_enabled=false}){
  const source=routeProgramSource({...concert,current_ocr_evidence})
  const output={mode:'READ_ONLY',selected_source:source.source_kind,source_hash:source.text_hash,
    matcher_version:MATCHER_VERSION,reason_code:source.reason_code,
    official_reason_code:source.official_reason_code,ocr_reason_code:source.ocr_reason_code,
    total_candidates:0,ready_count:0,excluded_reasons:{},candidates:[]}
  if(source.source_kind==='NONE')return output
  let selected
  if(source.source_kind==='KOPIS_DETAIL_TEXT'){
    const fresh=analyses.filter(a=>a.concert_id===concert.id&&a.source_kind==='KOPIS_DETAIL_TEXT'
      &&a.source_hash===source.text_hash&&a.matcher_version===MATCHER_VERSION&&a.catalog_hash===CATALOG_HASH
      &&a.analysis_is_current===true&&a.is_fresh===true)
    if(fresh.length!==1)return {...output,reason_code:'OFFICIAL_ANALYSIS_PENDING'}
    const a=fresh[0]
    selected=statuses.filter(c=>c.analysis_id===a.id&&c.concert_id===concert.id&&c.source_kind==='KOPIS_DETAIL_TEXT'
      &&c.source_hash===source.text_hash&&c.matcher_version===MATCHER_VERSION)
    policy_enabled=a.policy_enabled===true
  }else{
    if(!uuid(current_ocr_evidence?.ocr_result_id))throw Error('CURRENT_OCR_RESULT_ID_REQUIRED')
    selected=statuses.filter(c=>c.concert_id===concert.id&&c.matcher_version===MATCHER_VERSION
      &&c.ocr_result_id===current_ocr_evidence.ocr_result_id)
  }
  const tracks=new Map(),works=new Map()
  for(const c of selected){if(c.track_id)tracks.set(c.track_id,(tracks.get(c.track_id)||0)+1);if(c.work_id)works.set(c.work_id,(works.get(c.work_id)||0)+1)}
  output.candidates=selected.map(c=>{
    const official=source.source_kind==='KOPIS_DETAIL_TEXT',snapshot=official?c.candidate_snapshot:
      {...c,scope:{kind:c.relation}} // old status exposes identity/reasons, not a scope object
    const reasons=[...(official?c.exclusion_reasons||[]:[])];const add=r=>reasons.push(r)
    if(c.analysis_is_current!==true)add('ANALYSIS_NOT_CURRENT')
    if(c.stale_reason)add(c.stale_reason)
    if(official&&(c.is_fresh!==true||c.is_effective_current!==true))add('OFFICIAL_NOT_EFFECTIVE_CURRENT')
    if(!policy_enabled)add('VERSION_POLICY_DISABLED_OR_MISSING')
    if((c.matching_catalog_hash||c.catalog_hash)!==CATALOG_HASH)add('CATALOG_VERSION_CHANGED')
    if(c.outcome!=='MATCHED'||c.relation!=='EXACT')add('NOT_MATCHED_EXACT')
    if(!c.track_id||!c.work_id)add('CATALOG_TARGET_MISSING')
    const target=getTrackTarget(c.track_id)
    if(!target||target.workId!==c.work_id)add('CATALOG_TARGET_MISSING')
    if(target?.arrangement||target?.excerpt||target?.work?.arrangement||target?.work?.excerpt)add('UNRESOLVED_REVIEW_OR_SCOPE')
    if(unresolved(snapshot))add('UNRESOLVED_REVIEW_OR_SCOPE')
    if((tracks.get(c.track_id)||0)>1||(works.get(c.work_id)||0)>1)add('DUPLICATE_TRACK_OR_WORK')
    // The old OCR view has no scope/matching fields. Use stored candidate fields
    // conservatively; never call a matcher or elevate an existing review state.
    if(!official&&c.review_status!=='REVIEW_REQUIRED')add('ALREADY_REVIEWED')
    if(official&&c.automatic_ready!==true)add('OFFICIAL_NOT_READY')
    const exclusion_reasons=[...new Set(reasons)]
    for(const r of exclusion_reasons)output.excluded_reasons[r]=(output.excluded_reasons[r]||0)+1
    return {...c,planning_ready:exclusion_reasons.length===0,exclusion_reasons}
  })
  output.total_candidates=output.candidates.length
  output.ready_count=output.candidates.filter(c=>c.planning_ready).length
  return output
}

// Service-role credentials stay in createSupabaseRest's closure. Every request
// has params only (GET); no RPC, body, write method or runtime integration.
export function createProgramSourceReader(options={}){
  const request=createSupabaseRest(options)
  const readAll=async(path,params)=>{
    const all=[],ids=new Set()
    for(let page=0;page<1000;page++){
      const rows=await request(path,{params:{select:'*',...params,order:'id.asc',limit:200,offset:all.length}})
      if(!Array.isArray(rows))throw Error('STATUS_RESPONSE_INVALID')
      if(!rows.length)return all
      for(const row of rows){if(!row||!uuid(row.id)||ids.has(row.id))throw Error('STATUS_PAGE_INVALID');ids.add(row.id);all.push(row)}
    }
    throw Error('STATUS_READ_LIMIT_REACHED') // never plan a truncated candidate set
  }
  return {async plan({concert_id,current_ocr_evidence}={}){
    if(!uuid(concert_id))throw Error('CONCERT_ID_REQUIRED')
    const current=await readAll('concerts',{id:'eq.'+concert_id})
    if(current.length!==1||current[0].id!==concert_id)throw Error('CONCERT_NOT_FOUND')
    const concert=current[0]
    const source=routeProgramSource({...concert,current_ocr_evidence})
    if(source.source_kind==='NONE')return planProgramSource({concert,current_ocr_evidence})
    const params={concert_id:'eq.'+concert.id,matcher_version:'eq.'+MATCHER_VERSION}
    if(source.source_kind==='KOPIS_DETAIL_TEXT'){
      const filter={...params,source_hash:'eq.'+source.text_hash}
      const analyses=await readAll('concert_program_text_analysis_status',filter)
      const fresh=analyses.filter(a=>a.analysis_is_current===true&&a.is_fresh===true&&a.catalog_hash===CATALOG_HASH)
      if(fresh.length!==1)return planProgramSource({concert,current_ocr_evidence,analyses})
      const statuses=await readAll('concert_program_text_candidate_status',{...filter,analysis_id:'eq.'+fresh[0].id})
      // Separate GETs are not an atomic snapshot. Recheck metadata and fail
      // closed on changes; even a ready plan is not a write authorization.
      const after=await readAll('concert_program_text_analysis_status',filter)
      if(JSON.stringify(analyses)!==JSON.stringify(after))return {...planProgramSource({concert,current_ocr_evidence}),reason_code:'SOURCE_STATUS_CHANGED_RETRY'}
      return planProgramSource({concert,current_ocr_evidence,analyses:after,statuses})
    }
    if(!uuid(current_ocr_evidence?.ocr_result_id))throw Error('CURRENT_OCR_RESULT_ID_REQUIRED')
    const ocr=await readAll('concert_image_ocr_results',{id:'eq.'+current_ocr_evidence.ocr_result_id})
    if(ocr.length!==1||typeof ocr[0].raw_text!=='string'||hash(ocr[0].raw_text)!==source.text_hash)throw Error('CURRENT_OCR_TEXT_CHANGED')
    const statuses=await readAll('concert_program_candidate_status',{...params,ocr_result_id:'eq.'+current_ocr_evidence.ocr_result_id})
    const policy=await request('concert_program_version_policy',{params:{select:'matcher_version,enabled',matcher_version:'eq.'+MATCHER_VERSION}})
    const enabled=Array.isArray(policy)&&policy.length===1&&policy[0].matcher_version===MATCHER_VERSION&&policy[0].enabled===true
    return planProgramSource({concert,current_ocr_evidence,statuses,policy_enabled:enabled})
  }}
}
