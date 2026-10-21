import {createHash} from 'node:crypto'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

export const WORK_IDENTITY_SCHEMA='work-identity-1'
// Deliberately independent of ratings, prose, media and global matcher dictionaries.
export const WORK_IDENTITY_FIELDS=['id','composer','title','titleEn','alias','aliases','type','cycleId','monthEn','opus','opusPart','opusSuffix','number','bookNumber','catalogue','catalogueNumber','musicalKeys','arrangement','instrumentation','excerpt']
export const TARGET_IDENTITY_FIELDS=['trackId','workId','title','alias','movement','movementNumber','arrangement','instrumentation','excerpt']
const order=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))
export const canonicalIdentityJson=value=>{
  if(Array.isArray(value))return '['+value.map(canonicalIdentityJson).join(',')+']'
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort(order).map(k=>JSON.stringify(k)+':'+canonicalIdentityJson(value[k])).join(',')+'}'
  return JSON.stringify(value)
}
export const normalizeIdentity=value=>{
  if(value===undefined||value===null)return null
  if(typeof value==='string')return value.normalize('NFKC').replace(/[‐‑‒–—−]/g,'-').replace(/[ \t\r\n\f\v]+/g,' ').replace(/^ +| +$/g,'')
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('WORK_IDENTITY_INVALID');return value}
  if(typeof value==='boolean')return value
  if(Array.isArray(value))return [...new Map(value.map(normalizeIdentity).map(v=>[canonicalIdentityJson(v),v])).entries()].sort(([a],[b])=>order(a,b)).map(([,v])=>v)
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeIdentity(v)]))
  throw new Error('WORK_IDENTITY_INVALID')
}
const project=(value,fields)=>Object.fromEntries(fields.map(k=>[k,value?.[k]??(k==='aliases'||k==='musicalKeys'?[]:null)]))
export const workIdentity=(catalog,workId)=>{
  const work=catalog?.works?.[workId]
  if(!work||work.id!==workId)return null
  if(!Array.isArray(catalog.targets))return null
  const targets=catalog.targets.filter(t=>t.workId===workId)
  if(!targets.length||targets.some(t=>!t.trackId)||new Set(targets.map(t=>t.trackId)).size!==targets.length)return null
  const snapshot=normalizeIdentity({schema:WORK_IDENTITY_SCHEMA,work:project(work,WORK_IDENTITY_FIELDS),targets:targets.map(t=>project(t,TARGET_IDENTITY_FIELDS))})
  return {schema:WORK_IDENTITY_SCHEMA,snapshot,hash:createHash('sha256').update(canonicalIdentityJson(snapshot)).digest('hex')}
}
export const confirmationValidity=(candidate,catalog,{version,pipelineVersion=EASYOCR_PIPELINE_VERSION,today}={})=>{
  const current=workIdentity(catalog,candidate.work_id)
  const confirmed=candidate.confirmed_work_identity_hash??null
  let reason=null
  if(candidate.review_status!=='CONFIRMED')reason='NOT_CONFIRMED'
  else if(candidate.relation!=='EXACT'||candidate.outcome!=='MATCHED')reason='NOT_EXACT'
  else if(candidate.matcher_version!==version||candidate.confirmation_matcher_version&&candidate.confirmation_matcher_version!==version)reason='MATCHER_VERSION_CHANGED'
  else if(!current||!catalog.targets.some(t=>t.trackId===candidate.track_id&&t.workId===candidate.work_id))reason='WORK_REMOVED'
  else if(candidate.stale_reason&&candidate.stale_reason!=='CONFIRMATION_IDENTITY_MISSING')reason=candidate.stale_reason
  else if(!candidate.analysis_is_current)reason='ANALYSIS_SUPERSEDED'
  else if(!confirmed)reason='CONFIRMATION_IDENTITY_MISSING'
  else if(candidate.confirmation_pipeline_version!==pipelineVersion)reason='PIPELINE_VERSION_CHANGED'
  else if(current.hash!==confirmed)reason='WORK_IDENTITY_CHANGED'
  else if(candidate.is_effectively_confirmed!==true)reason='EVIDENCE_CHANGED'
  else if(today&&candidate.concerts?.end_date<today)reason='CONCERT_ENDED'
  return {confirmation_work_identity_hash:confirmed,current_work_identity_hash:current?.hash??null,work_identity_matches:Boolean(confirmed&&confirmed===current?.hash),
    catalog_hash_changed:candidate.catalog_hash!==catalog.catalog_hash,global_catalog_hash_is_exclusion_reason:false,
    is_effectively_confirmed:reason===null,stale_reason:reason}
}
