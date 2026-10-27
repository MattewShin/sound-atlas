import {createHash} from 'node:crypto'
import {matchNormalizedProgramWork} from './programMatchingNormalization.mjs'
import {canonicalIdentityJson} from './programWorkIdentity.mjs'
import {CATALOG_JSON,CATALOG_HASH,MATCHER_VERSION} from './programAnalysis.mjs'
import {isSupportedProgramSourceVersion} from './programRollout.mjs'
import {koreaDate} from '../src/data/concertSearchConfig.js'
const hash=v=>createHash('sha256').update(canonicalIdentityJson(v)).digest('hex')
export const buildRematchCandidate=(source,{catalog=JSON.parse(CATALOG_JSON),catalogHash=CATALOG_HASH,version=MATCHER_VERSION}={})=>{
  if(version!==MATCHER_VERSION)throw new Error('WRITE_VERSION_NOT_IMPLEMENTED')
  const identity=structuredClone(source.identity)
  const result=matchNormalizedProgramWork(identity,identity.composer||identity.composer_relation?.name,{catalog:catalog.works,targetFor:id=>{
    const t=catalog.targets.find(t=>t.trackId===id);return t?{...t,work:catalog.works[t.workId]}:null
  }})
  return {...result.decision,matching:result.matching,identity,evidence:structuredClone(source.evidence),section_index:source.section_index,
    generation_version:version,review_status:'REVIEW_REQUIRED',generation_reasons:['CATALOG_REMATCH_FROM_STORED_IDENTITY'],
    review_reasons:[...new Set([...(source.review_reasons||[]),...result.decision.reasons,'CATALOG_REMATCH_REVIEW_REQUIRED'])],
    candidate_key:hash({schema:'catalog-rematch-1',source_candidate_id:source.id,catalog_hash:catalogHash,matcher_version:version})}
}
export const rematchProgramCandidates=async(store,{kopisId,save=false,manifest,version=MATCHER_VERSION,now=Date.now}={})=>{
  if(version!==MATCHER_VERSION)throw new Error('WRITE_VERSION_NOT_IMPLEMENTED')
  if(save){if(!manifest)throw new Error('V3_SAVE_REQUIRES_OCR_MANIFEST');await store.preflightSave({rematch:true})}
  const sources=await store.rematchSources(kopisId),results=[],skipped=[],failures=[]
  const allowed=manifest?new Set(manifest.targets.map(t=>t.ocr_result_id)):null
  // Pinning is enforced again by the RPC's same current-evidence transaction.
  const pinned=manifest?await store.manifestTargets(manifest):null
  const eligibleOcr=pinned?new Set(pinned.targets.map(t=>t.ocr.id)):allowed
  for(const s of sources){
    if(allowed&&!allowed.has(s.analysis.ocr_result_id))continue
    let reason=!isSupportedProgramSourceVersion(s.matcher_version)?'MATCHER_VERSION_CHANGED':s.review_status!=='REVIEW_REQUIRED'||s.review_history.length||s.protected_equivalent_review?'MANUAL_REVIEW_PRESERVED':
      s.concert.end_date<koreaDate(now())?'CONCERT_ENDED':!s.analysis.is_current||s.evidence_stale_reason||(!s.analysis_is_current&&!s.existing_rematches.length)?'EVIDENCE_CHANGED':
      eligibleOcr&&!eligibleOcr.has(s.analysis.ocr_result_id)?'OUTSIDE_ELIGIBLE_MANIFEST':null
    if(reason){skipped.push({candidate_id:s.id,reason});continue}
    try{
      const candidate=buildRematchCandidate(s),previous=s.existing_rematches.find(c=>c.matching_catalog_hash===CATALOG_HASH
        &&(c.rematch_snapshot?.generation_version??c.generation_version??c.matcher_version)===version)
      if((s.matching_catalog_hash||s.analysis.catalog_hash)===CATALOG_HASH){skipped.push({candidate_id:s.id,reason:'ALREADY_CURRENT_CATALOG'});continue}
      const id=previous?.id||(save?await store.saveRematch(s.id,candidate):null)
      results.push({source_candidate_id:s.id,source_matcher_version:s.matcher_version,candidate_id:id,kopis_id:s.kopis_id,reused:Boolean(previous),new_link:!previous&&!s.track_id&&Boolean(candidate.track_id),previous_track_id:s.track_id,
        track_id:candidate.track_id,work_id:candidate.work_id,outcome:candidate.outcome,review_status:'REVIEW_REQUIRED',catalog_hash:CATALOG_HASH,candidate})
    }catch(e){failures.push({candidate_id:s.id,reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'REMATCH_FAILED'})}
  }
  return {mode:save?'SAVE':'DRY_RUN',matcher_version:version,catalog_hash:CATALOG_HASH,db_writes:save?results.filter(r=>!r.reused).length:0,
    rematched:results.filter(r=>!r.reused).length,reused:results.filter(r=>r.reused).length,new_links:results.filter(r=>r.new_link).length,results,skipped,failures,ocr_runs:0,downloads:0}
}
