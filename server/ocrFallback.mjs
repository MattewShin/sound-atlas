import {createHash} from 'node:crypto'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeStoredProgram,extractIdentity,CATALOG_HASH} from './programAnalysis.mjs'
import {matchNormalizedProgramWork} from './programMatchingNormalization.mjs'
import {canonicalIdentityJson} from './programWorkIdentity.mjs'
import {getTrackTarget} from '../src/data/workCatalog.js'
import {checkProgramContext} from './programContext.mjs'

export const OCR_FALLBACK_RULE='program-ocr-fallback-1'
export const OCR_FALLBACK_QUALITY=Object.freeze({minDimension:800,minLines:3,minCoverage:.8,minMedian:.9,minEvidence:.85,minIdentity:.9,minLaplacianVariance:100,maxBytes:6_000_000,maxPixels:12_000_000,maxDimension:20000})
export const fallbackHash=value=>createHash('sha256').update(canonicalIdentityJson(value),'utf8').digest('hex')
const absent=new Set(['OFFICIAL_TEXT_ABSENT','OFFICIAL_PROGRAM_ABSENT','OFFICIAL_PROGRAM_EMPTY'])
export function fallbackSource(concert){
  const route=routeProgramSource(concert)
  return {status:route.source_kind==='KOPIS_DETAIL_TEXT'?'OFFICIAL':absent.has(route.official_reason_code)?'OCR':'HOLD',reason:route.official_reason_code}
}
const bboxValid=(box,w,h)=>Array.isArray(box)&&box.length===4&&box.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=w&&p[1]<=h)
  &&Math.max(...box.map(p=>p[0]))>Math.min(...box.map(p=>p[0]))&&Math.max(...box.map(p=>p[1]))>Math.min(...box.map(p=>p[1]))
const detectionValid=(d,w,h)=>d&&typeof d.text==='string'&&Number.isFinite(d.confidence)&&d.confidence>=0&&d.confidence<=1&&bboxValid(d.bbox,w,h)
const fail=reason=>({eligible:false,reason:'SKIPPED_'+reason})
export function fallbackQuality(target,analysis){
  const {ocr}=target,q=ocr?.settings?.ocr_fallback_quality,t=OCR_FALLBACK_QUALITY
  if(!q||q.schema!==OCR_FALLBACK_RULE||q.decoded!==true||q.content_hash!==ocr.content_sha256||!['image/jpeg','image/png','image/webp'].includes(q.mime)
    ||![q.original_width,q.original_height,ocr.width,ocr.height,q.bytes].every(n=>Number.isSafeInteger(n)&&n>0)
    ||q.original_width>t.maxDimension||q.original_height>t.maxDimension||q.original_width*q.original_height>t.maxPixels||q.bytes>t.maxBytes
    ||!Number.isFinite(q.laplacian_variance)||q.laplacian_variance>1040400
    ||!((ocr.width===q.original_width&&ocr.height===q.original_height)||(ocr.width===q.original_height&&ocr.height===q.original_width)))return fail('QUALITY_SNAPSHOT_INVALID')
  if(q.original_width<t.minDimension||q.original_height<t.minDimension)return fail('LOW_RESOLUTION')
  if(q.laplacian_variance<t.minLaplacianVariance)return fail('BLURRED_IMAGE')
  const lines=ocr.raw_text.split('\n'),program=new Set()
  let offset=0
  for(let i=0;i<lines.length;i++){const end=offset+[...lines[i]].length;if(lines[i].trim()&&!/^(program(me)?|프로그램|연주곡목?|곡목)$/i.test(lines[i].replace(/[\s.\[\]【】()「」『』〈〉《》:：·•\-–—]/gu,''))&&analysis.sections.some(s=>s.classification==='PROGRAM'&&s.reason==='EXPLICIT_PROGRAM_HEADING'&&offset>=s.start&&end<=s.end))program.add(i);offset=end+1}
  if(!Array.isArray(ocr.detections)||ocr.detections.some(d=>!detectionValid(d,ocr.width,ocr.height)))return fail('DETECTION_INVALID')
  const detections=[...program].map(i=>ocr.detections[i]).filter((d,j)=>detectionValid(d,ocr.width,ocr.height)&&d.text===lines[[...program][j]])
  const coverage=program.size?detections.length/program.size:0
  if(detections.length<t.minLines)return fail('PROGRAM_DETECTIONS_INSUFFICIENT')
  if(coverage<t.minCoverage)return fail('PROGRAM_COVERAGE_LOW')
  const confidence=detections.map(d=>d.confidence).sort((a,b)=>a-b),m=Math.floor(confidence.length/2),median=confidence.length%2?confidence[m]:(confidence[m-1]+confidence[m])/2
  if(median<t.minMedian)return fail('PROGRAM_CONFIDENCE_LOW')
  const snapshot={rule:OCR_FALLBACK_RULE,image_quality:q,width:ocr.width,height:ocr.height,detections_hash:fallbackHash(ocr.detections),program_lines:[...program],coverage,median}
  return {eligible:true,reason:'QUALITY_PASS',snapshot,hash:fallbackHash(snapshot)}
}
const safeReasons=new Set(['COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'])
export function fallbackCandidate(candidate,analysis,target,quality=fallbackQuality(target,analysis)){
  if(!quality.eligible)return quality
  const section=analysis.sections[candidate.section_index],evidence=candidate.evidence||[],t=OCR_FALLBACK_QUALITY
  if(section?.classification!=='PROGRAM'||section.reason!=='EXPLICIT_PROGRAM_HEADING')return fail('PROGRAM_SECTION_UNPROVEN')
  if(candidate.outcome!=='MATCHED'||candidate.relation!=='EXACT')return fail('NOT_MATCHED_EXACT')
  if(!Array.isArray(candidate.review_reasons)||candidate.review_reasons.some(r=>!safeReasons.has(r)))return fail('UNRESOLVED_REVIEW_REASON')
  const chars=[...target.ocr.raw_text],lines=target.ocr.raw_text.split('\n')
  if(!evidence.length||evidence.some(e=>!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<section.start||e.end>section.end||e.end<=e.start||chars.slice(e.start,e.end).join('')!==e.quote
    ||!Number.isInteger(e.line_index)||lines[e.line_index]!==e.quote||!detectionValid(target.ocr.detections[e.line_index],target.ocr.width,target.ocr.height)
    ||canonicalIdentityJson(e.bbox)!==canonicalIdentityJson(target.ocr.detections[e.line_index].bbox)||e.confidence!==target.ocr.detections[e.line_index].confidence||e.confidence<t.minEvidence))return fail('EVIDENCE_INVALID_OR_LOW_CONFIDENCE')
  // Only explicit evidence within THIS work block; inherited headings are never accepted.
  const relation=candidate.identity?.composer_relation
  if(!relation||relation.status!=='SOURCE_IDENTIFIED'||!['INLINE','BBOX_PAIRED_ROW','BBOX_BILINGUAL_BLOCK'].includes(relation.association))return fail('EXPLICIT_BLOCK_COMPOSER_REQUIRED')
  const composer=evidence.filter(e=>extractIdentity(e.quote).composers.includes(candidate.identity.composer))
  const catalogue=evidence.filter(e=>e.role!=='COMPOSER'&&extractIdentity(e.quote).catalogues.length)
  if(!composer.length||composer.some(e=>e.confidence<t.minIdentity))return fail('COMPOSER_CONFIDENCE_OR_EXPLICIT_EVIDENCE')
  if(!catalogue.length||catalogue.some(e=>e.confidence<t.minIdentity))return fail('CATALOGUE_CONFIDENCE_OR_EXPLICIT_EVIDENCE')
  if(composer.some(e=>!relation.source_line_indices.includes(e.line_index)))return fail('COMPOSER_OUTSIDE_LOGICAL_BLOCK')
  const {decision,matching}=matchNormalizedProgramWork(candidate.identity,candidate.identity.composer),track=getTrackTarget(candidate.track_id)
  if(!track||decision.track_id!==candidate.track_id||decision.work_id!==candidate.work_id||decision.outcome!=='MATCHED'||decision.relation!=='EXACT'||!matching.catalogues.length)return fail('IDENTITY_MISMATCH')
  if(analysis.candidates.filter(c=>c.track_id===candidate.track_id||c.work_id===candidate.work_id).length!==1)return fail('DUPLICATE_TARGET')
  if(candidate.identity.arrangement_or_excerpt||matching.arrangement_features.some(s=>/hands:|pianos:2|style:|method:|arranger:|ensemble:(?!solo)/.test(s))||matching.variants.some(v=>v.arrangement.arranged||v.excerpts.length)||track.arrangement||track.excerpt||track.work.arrangement||track.work.excerpt)return fail('ARRANGEMENT_OR_EXCERPT')
  if(track.movementNumber!=null&&!evidence.some(e=>e.role!=='COMPOSER'&&extractIdentity(e.quote).movement_numbers.includes(track.movementNumber)))return fail('EXPLICIT_MOVEMENT_REQUIRED')
  const k=target.concert,context=checkProgramContext({...k,dateFrom:k.start_date,dateTo:k.end_date},target.ocr.raw_text)
  if(!context.verified||k.start_date!==k.end_date||/시리즈\s*전체|매월|총\s*\d+회|Session\s*[12]/i.test(target.ocr.raw_text))return fail('CONTEXT_OR_SCOPE_CONFLICT')
  const partial=[...target.ocr.raw_text.matchAll(/(?:^|\s)(\d{1,2})\s*[.월/]\s*(\d{1,2})(?:일|[.\s]|$)/g)].map(m=>[+m[1],+m[2]]).filter(([m,d])=>m>=1&&m<=12&&d>=1&&d<=31)
  if(partial.some(([m,d])=>`${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`!==k.start_date.slice(5)))return fail('DATE_SCOPE_CONFLICT')
  return {eligible:true,reason:'ELIGIBLE',quality_hash:quality.hash}
}
export function planOcrFallback(target){
  const source=fallbackSource(target.concert)
  if(source.status!=='OCR')return {status:source.status,reason:source.reason,eligible:[],skipped:[]}
  const analysis=analyzeStoredProgram(target),quality=fallbackQuality(target,analysis)
  const decisions=analysis.candidates.map(candidate=>({candidate,...fallbackCandidate(candidate,analysis,target,quality)}))
  return {status:'PLANNED',reason:quality.reason,analysis,quality,eligible:decisions.filter(d=>d.eligible),skipped:decisions.filter(d=>!d.eligible),catalog_hash:CATALOG_HASH}
}
