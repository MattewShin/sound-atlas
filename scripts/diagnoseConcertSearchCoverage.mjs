// GET-only operational inspection; private source graph stays in ignored .cache.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {tracks} from '../src/data/musicData.js'
import {getTrackTarget,workCatalog} from '../src/data/workCatalog.js'
import {extractIdentity,analyzeStoredProgram,CATALOG_HASH,CATALOG_JSON,MATCHER_VERSION} from '../server/programAnalysis.mjs'
import {matchNormalizedProgramWork} from '../server/programMatchingNormalization.mjs'
import {workIdentity} from '../server/programWorkIdentity.mjs'
import {createSupabaseRest} from '../server/supabaseRest.mjs'
import {createSupabaseConcertSearch} from '../server/supabaseConcertSearch.mjs'
import {createConcertSearchService} from '../server/concertSearchService.mjs'
import {effectiveEvidenceAttempt,evidenceIssue} from '../server/supabaseProgramAnalysis.mjs'
import {automaticDecision} from '../server/programAutomation.mjs'
import {EASYOCR_PIPELINE_VERSION} from '../server/easyOcrConfig.mjs'
import {koreaDate} from '../src/data/concertSearchConfig.js'

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)]}))
const codeRef=args['--code-ref']||'UNPUBLISHED',offline=args['--offline']==='true'
const generatedAt=new Date().toISOString(),today=koreaDate(Date.now()),region='서울'
const to=new Date(Date.parse(today+'T00:00:00Z')+30*86400000).toISOString().slice(0,10)
const query={region,from:today,to},catalog={...JSON.parse(CATALOG_JSON),catalog_hash:CATALOG_HASH}
const base='.cache/search-coverage',output='docs/CONCERT_SEARCH_COVERAGE_2026-10-22.json'
await mkdir(base,{recursive:true})
const counts=values=>Object.fromEntries([...new Set(values)].sort().map(k=>[k,values.filter(v=>v===k).length]))
const safeError=e=>({code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'READ_FAILED',http:e.http_status||e.status||null})
let dbRequests=0,productionRequests=0
const remoteFetch=async(url,init={})=>{assert.equal(init.method||'GET','GET');dbRequests++;return fetch(url,{...init,signal:AbortSignal.timeout(25000)})}
const meta={taskId:'CA-SEARCH-20261022-001',generatedAt,timeZone:'Asia/Seoul',codeRef,catalog:{hash:CATALOG_HASH,version:MATCHER_VERSION,pipelineVersion:EASYOCR_PIPELINE_VERSION,activeSource:'src/data/musicData.js:tracks'},
 observation:{backend:'supabase',query,scope:'Stored concerts overlapping query; no KOPIS collection or OCR execution',snapshotConsistency:'multiple GETs; no cross-request transaction; races possible',dbStatus:'UNKNOWN',errors:[],tables:{}},environment:{},requests:{dbGet:0,productionGet:0,remoteWrites:0}}
const expected={save_concert_program_analysis_v3:['p_analysis','p_catalog_json'],review_concert_program_candidate_identity:['p_candidate_id','p_status','p_note','p_analysis_id','p_matcher_version','p_catalog_json'],save_concert_program_rematch:['p_candidate','p_catalog_json','p_source_candidate_id'],
 decide_automatic_program_candidate:['p_candidate_id','p_analysis_id','p_input_hash','p_rule','p_status','p_reasons','p_verified','p_catalog_json'],
 queue_automatic_programs:['p_limit','p_catalog_hash','p_rule'],program_auto_input_hash:['p_analysis_id','p_catalog_hash','p_rule'],
 finish_automatic_program:['p_analysis_id','p_input_hash','p_catalog_hash','p_rule'],defer_automatic_program:['p_analysis_id','p_input_hash','p_catalog_hash','p_rule']}
let graph={},schema=null,statusRows=[],request
const all=async(table,params={})=>{
 const result=[];let last
 for(let page=0;page<50;page++){
  const rows=await request(table,{params:{select:'*',...params,order:'id.asc',limit:'200',...(last?{id:'gt.'+last}:{})}})
  assert(Array.isArray(rows));result.push(...rows)
  if(rows.length<200)return result
  if(rows.at(-1).id===last)throw Object.assign(new Error(),{code:'CURSOR_NOT_ADVANCING'})
  last=rows.at(-1).id
 }
 throw Object.assign(new Error(),{code:'INSPECTION_PAGE_LIMIT'})
}
const related=async(table,key,ids)=>{
 const rows=[];for(let i=0;i<ids.length;i+=40)rows.push(...await all(table,{[key]:'in.('+ids.slice(i,i+40).join(',')+')'}))
 return rows
}
try{
 meta.environment.local=createConcertSearchService({env:process.env}).config()
}catch(e){meta.environment.local={status:'UNKNOWN',...safeError(e)}}
if(offline){
 try{const prior=JSON.parse(await readFile(output,'utf8'));meta.environment.production=prior.environment.production;meta.observation.sourceRequests=prior.observation.sourceRequests||prior.requests}catch{/* no previous public inspection */}
 try{graph=JSON.parse(await readFile(base+'/private-graph.json','utf8'));statusRows=graph.statusRows||[];meta.observation.dbStatus='CACHED_SNAPSHOT';meta.observation.snapshotGeneratedAt=graph.snapshotGeneratedAt||null;schema=JSON.parse(await readFile(base+'/private-schema.json','utf8'))}catch(e){meta.observation.errors.push(safeError(e))}
}else{
 try{
  request=createSupabaseRest({fetchImpl:remoteFetch})
  try{schema=await request('');await writeFile(base+'/private-schema.json',JSON.stringify(schema))}catch(e){meta.observation.errors.push({stage:'openapi',...safeError(e)})}
  graph.concerts=await all('concerts',{region:'eq.'+region,start_date:'lte.'+to,end_date:'gte.'+today})
  graph.concert_program_images=await related('concert_program_images','concert_id',graph.concerts.map(c=>c.id))
  graph.concert_image_ocr_results=await related('concert_image_ocr_results','image_id',graph.concert_program_images.map(i=>i.id))
  graph.concert_image_ocr_attempts=await related('concert_image_ocr_attempts','image_id',graph.concert_program_images.map(i=>i.id))
  graph.concert_program_analyses=await related('concert_program_analyses','concert_id',graph.concerts.map(c=>c.id))
  graph.concert_program_candidates=await related('concert_program_candidates','analysis_id',graph.concert_program_analyses.map(a=>a.id))
  graph.concert_program_reviews=await related('concert_program_reviews','candidate_id',graph.concert_program_candidates.map(c=>c.id))
  graph.concert_program_catalogs=await request('concert_program_catalogs',{params:{select:'*',limit:'999'}})
  graph.concert_program_version_policy=await request('concert_program_version_policy',{params:{select:'*',limit:'999'}})
  assert(graph.concert_program_catalogs.length<999&&graph.concert_program_version_policy.length<999)
  for(const concertIds of Array.from({length:Math.ceil(graph.concerts.length/40)},(_,i)=>graph.concerts.slice(i*40,i*40+40).map(c=>c.id)))statusRows.push(...await all('concert_program_candidate_status',{select:'*,concerts!inner(*)',concert_id:'in.('+concertIds.join(',')+')'}))
  graph.statusRows=statusRows;graph.snapshotGeneratedAt=generatedAt
  meta.observation.dbStatus='READ_SUCCEEDED'
  await writeFile(base+'/private-graph.json',JSON.stringify(graph))
 }catch(e){meta.observation.errors.push({stage:'stored_graph',...safeError(e)});meta.observation.dbStatus='PARTIAL_OR_UNAVAILABLE'}
 const production={origin:'https://sound-atlas.vercel.app',observedAt:new Date().toISOString(),searches:[]}
 for(const trackId of [null,'brahms-intermezzo-op118-no2','chopin-ballade-op52-no4','liszt-liebestraum-s541-no3']){
  try{
   const url=new URL(trackId?'/api/concerts':'/api/concerts/status',production.origin)
   if(trackId)url.search=new URLSearchParams({...query,targetTrackId:trackId})
   productionRequests++;const res=await fetch(url,{signal:AbortSignal.timeout(25000)}),body=await res.json()
   if(!trackId)production.status={http:res.status,backend:body.backend||'UNKNOWN',analysisVersion:body.analysisVersion||null,configured:body.configured??null}
   else production.searches.push({trackId,http:res.status,backend:body.backend||'UNKNOWN',analysisVersion:body.analysisVersion||null,kopisIds:body.concerts?.map(c=>c.kopisId)||[],error:body.code||null})
  }catch(e){if(!trackId)production.status={status:'UNKNOWN',...safeError(e)};else production.searches.push({trackId,status:'UNKNOWN',...safeError(e)})}
 }
 meta.environment.production=production
}
meta.environment.rpcInspection=Object.entries(expected).map(([name,required])=>{
 const entry=schema?.paths?.['/rpc/'+name],op=entry?.post||entry?.get
 const params=op?.parameters||[],body=params.find(p=>p.in==='body')?.schema
 const props=body?.properties||schema?.definitions?.[body?.$ref?.split('/').at(-1)]?.properties||{}
 const names=Object.keys(props).length?Object.keys(props):params.filter(p=>p.in==='query').map(p=>p.name)
 return {name,visibility:!schema?'UNKNOWN':entry?'EXPOSED_TO_SERVICE_ROLE':'NOT_EXPOSED_TO_SERVICE_ROLE',methods:entry?Object.keys(entry):[],parameters:names,
  types:Object.fromEntries(Object.entries(props).map(([k,v])=>[k,{type:v.type,format:v.format||null}])),requiredParameters:required,missingRequired:entry?required.filter(p=>!names.includes(p)):required,
  responseSchema:op?.responses?.['200']?.schema||null,permissionScope:'OpenAPI exposed to configured service role; SQL grants/owner not independently queried'}
})
meta.environment.automationPreflight=schema?(schema.paths?.['/rpc/decide_automatic_program_candidate']?'PASS_PATH_ONLY':'PROGRAM_AUTOMATION_MIGRATION_REQUIRED'):'UNKNOWN'
meta.environment.viewInspection={name:'concert_program_candidate_status',scope:'OpenAPI fields plus real GET projection; SQL grants not queried',fields:Object.keys(schema?.definitions?.concert_program_candidate_status?.properties||{}),required:['confirmed_work_identity_hash','confirmation_matcher_version','confirmation_pipeline_version','is_effectively_confirmed','analysis_is_current','stale_reason']}
meta.environment.viewInspection.missing=meta.environment.viewInspection.required.filter(k=>!meta.environment.viewInspection.fields.includes(k))
meta.environment.automationColumns=Object.fromEntries(Object.entries({concert_program_images:['evidence_changed_at'],concert_program_analyses:['auto_input_hash','auto_retry_at','auto_retry_hash'],concert_program_candidates:['auto_input_hash','auto_outcome','auto_reasons']}).map(([t,fields])=>[t,{required:fields,missing:fields.filter(f=>!schema?.definitions?.[t]?.properties?.[f])}]))
meta.environment.versionPolicy=(graph.concert_program_version_policy||[]).map(p=>({matcher_version:p.matcher_version,enabled:p.enabled}))
for(const [table,rows]of Object.entries(graph))if(Array.isArray(rows))meta.observation.tables[table]=rows.length

const reparsed=[];let extractionWithoutCandidates=0,unusableImages=0
for(const image of graph.concert_program_images||[]){
 const attempts=(graph.concert_image_ocr_attempts||[]).filter(a=>a.image_id===image.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.finished_at.localeCompare(a.finished_at)||b.id.localeCompare(a.id))
 const attempt=effectiveEvidenceAttempt(attempts),results=(graph.concert_image_ocr_results||[]).filter(o=>o.image_id===image.id),ocr=results.find(o=>o.id===attempt?.result_id),concert=graph.concerts?.find(c=>c.id===image.concert_id)
 if(!concert||!ocr||evidenceIssue({image,ocr,attempts,results})){unusableImages++;continue}
 try{const target={concert,image,attempt,ocr},a=analyzeStoredProgram(target);if(!a.candidates.length)extractionWithoutCandidates++
  for(const candidate of a.candidates)reparsed.push({candidate,decision:automaticDecision(candidate,a,target),kopisId:concert.kopis_id,imageId:image.id,analysisKey:a.cache_key})
 }catch(e){meta.observation.errors.push({stage:'reparse',imageId:image.id,...safeError(e)})}
}
const simulatedService=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',PROGRAM_SEARCH_VERSION:process.env.PROGRAM_SEARCH_VERSION||MATCHER_VERSION},
 now:()=>Date.parse(generatedAt),fetchImpl:async(url)=>{
  const q=url.searchParams;const rows=statusRows.filter(r=>r.track_id===q.get('track_id')?.slice(3)&&r.work_id===q.get('work_id')?.slice(3)&&(!q.has('id')||r.id>q.get('id').slice(3))).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,100)
  return new Response(JSON.stringify(rows))
 }})
const rows=[]
for(const track of tracks){
 const target=getTrackTarget(track.id),w=target?.work
 const missing=[]
 if(!target||!w)missing.push('WORK_LINK_MISSING')
 if(w&&!w.composer)missing.push('COMPOSER_MISSING')
 if(target&&!workIdentity(catalog,target.workId))missing.push('IDENTITY_SNAPSHOT_MISSING')
 // Parent catalog titleEn can inherit the last sibling's roman movement label.
 // Use each track's unchanged Korean display title and an explicit Korean movement.
 const probe=w?`${track.title}${target.movementNumber?'\n'+target.movementNumber+'악장':''}`:''
 const matched=target?matchNormalizedProgramWork(extractIdentity(probe),w.composer):null
 const exact=matched?.decision.track_id===track.id&&matched.decision.relation==='EXACT'
 const identityStatus=missing.length?'MISSING_IDENTITY':exact?'READY':matched?.decision.outcome==='AMBIGUOUS'?'AMBIGUOUS_IDENTITY':'UNSUPPORTED_NOTATION'
 const candidates=(graph.concert_program_candidates||[]).filter(c=>c.track_id===track.id),parentOnly=(graph.concert_program_candidates||[]).filter(c=>!c.track_id&&c.work_id===target?.workId)
 const statuses=statusRows.filter(r=>r.track_id===track.id),fresh=reparsed.filter(r=>r.candidate.track_id===track.id),reasons=new Set(),evidenceRefs=[]
 let found=[]
 try{if(meta.observation.dbStatus==='READ_SUCCEEDED'||meta.observation.dbStatus==='CACHED_SNAPSHOT')found=(await simulatedService.search({...query,targetTrackId:track.id})).concerts.map(c=>c.kopisId)}catch(e){reasons.add('SEARCH_REPLAY_FAILED')}
 for(const c of candidates){
  const a=graph.concert_program_analyses?.find(a=>a.id===c.analysis_id),concert=graph.concerts?.find(k=>k.id===a?.concert_id)
  evidenceRefs.push({kind:'stored_candidate',candidateId:c.id,analysisId:c.analysis_id,kopisId:concert?.kopis_id||null,version:a?.matcher_version||null,relation:c.relation,outcome:c.outcome})
  if(c.review_status!=='CONFIRMED')reasons.add('UNCONFIRMED')
  if(c.outcome!=='MATCHED')reasons.add(c.outcome==='AMBIGUOUS'?'AMBIGUOUS':'MATCH_FAILED')
 }
 for(const c of parentOnly){const a=graph.concert_program_analyses?.find(a=>a.id===c.analysis_id),k=graph.concerts?.find(k=>k.id===a?.concert_id);evidenceRefs.push({kind:'parent_work_only',candidateId:c.id,workId:c.work_id,kopisId:k?.kopis_id||null});reasons.add('PARENT_WORK_ONLY_NOT_MOVEMENT_PERFORMANCE')}
 for(const r of statuses){if(r.stale_reason)reasons.add('STALE_OR_IDENTITY_MISMATCH');if(r.review_status==='CONFIRMED'&&!found.includes(r.concerts?.kopis_id))reasons.add('QUERY_FILTERED_OR_INVALID_CONFIRMATION')}
 for(const r of fresh){evidenceRefs.push({kind:'current_ocr_local_reparse',imageId:r.imageId,kopisId:r.kopisId,relation:r.candidate.relation,outcome:r.candidate.outcome,automaticStatus:r.decision.status,automaticReasons:r.decision.reasons});if(r.decision.status!=='CONFIRMED')r.decision.reasons.forEach(x=>reasons.add(x))}
 let observedStage
 if(meta.observation.dbStatus!=='READ_SUCCEEDED'&&meta.observation.dbStatus!=='CACHED_SNAPSHOT')observedStage='UNKNOWN'
 else if(found.length)observedStage='CONFIRMED_FOUND'
 else if(reasons.has('STALE_OR_IDENTITY_MISMATCH'))observedStage='STALE_OR_IDENTITY_MISMATCH'
 else if(statuses.some(c=>c.review_status==='CONFIRMED'))observedStage='QUERY_FILTERED'
 else if(candidates.length||fresh.length)observedStage='UNCONFIRMED'
 else if(parentOnly.length)observedStage='AMBIGUOUS'
 else observedStage='NO_EVIDENCE_IN_INSPECTED_DATA'
 if(observedStage==='NO_EVIDENCE_IN_INSPECTED_DATA')reasons.add('NO_ATTRIBUTABLE_TRACK_EVIDENCE_NOT_PROOF_OF_NO_PERFORMANCE')
 rows.push({trackId:track.id,workId:target?.workId||null,composer:track.composer,title:track.title,
  identityStatus,identityReasons:missing.length?missing:exact?['CANONICAL_LABEL_EXACT_SYNTHETIC_PROBE_ONLY']:matched.decision.reasons,
  identityFields:w?{opus:w.opus??null,opusPart:w.opusPart??null,opusSuffix:w.opusSuffix??null,catalogue:w.catalogue??null,catalogueNumber:w.catalogueNumber??null,number:w.number??null,bookNumber:w.bookNumber??null,movementNumber:target.movementNumber??null,aliases:w.aliases||[],arrangement:target.arrangement??null,excerpt:target.excerpt??null}:null,
  requiredIdentityRules:target?['composer and unique registered work identity',...(w.opus!=null||w.catalogue?['explicit opus/catalogue compatible with work']:['no opus required; explicit item number or registered alias']),...(target.movementNumber?['explicit movement number; parent work alone is insufficient']:[]),...(w.bookNumber?['book/collection number required']:[]),...(w.opusPart?['opus member required']:[]),...(w.number!=null?['ordinal/member when needed to distinguish sibling works']:[])]:[],
  canonicalProbe:{text:probe,outcome:matched?.decision.outcome||null,workId:matched?.decision.work_id||null,trackId:matched?.decision.track_id||null,rejections:matched?.matching.rejections.filter(r=>r.work_id===target?.workId)||[]},
  observedStage,reasons:[...reasons].sort(),evidenceRefs,foundKopisIds:[...new Set(found)],
  counts:{storedCandidates:candidates.length,currentReparseCandidates:fresh.length,parentOnlyCandidates:parentOnly.length,uniqueConcerts:new Set(evidenceRefs.map(r=>r.kopisId).filter(Boolean)).size,foundConcerts:new Set(found).size},
  recommendedAction:identityStatus!=='READY'?'Investigate canonical notation/identity without weakening conflicts':observedStage==='CONFIRMED_FOUND'?'Retain validity and regression coverage':observedStage==='NO_EVIDENCE_IN_INSPECTED_DATA'?'Expand evidence diagnosis; do not infer no performance':'Inspect candidate reasons and current evidence before confirmation',
  verificationScope:['STATIC_CATALOG','SYNTHETIC_CANONICAL_MATCHER_PROBE',meta.observation.dbStatus==='READ_SUCCEEDED'?'READ_ONLY_STORED_GRAPH_AND_LOCAL_SEARCH_REPLAY':meta.observation.dbStatus==='CACHED_SNAPSHOT'?'CACHED_STORED_GRAPH_AND_LOCAL_SEARCH_REPLAY':'OBSERVATION_UNKNOWN']})
}
assert.equal(new Set(rows.map(r=>r.trackId)).size,tracks.length)
meta.actualTrackCount=tracks.length;meta.uniqueWorkCount=new Set(rows.map(r=>r.workId).filter(Boolean)).size
meta.summary={identity:counts(rows.map(r=>r.identityStatus)),observed:counts(rows.map(r=>r.observedStage)),reasons:counts(rows.flatMap(r=>r.reasons)),composers:counts(rows.map(r=>r.composer)),
 storedGraphReparse:{candidateCount:reparsed.length,imageCount:new Set(reparsed.map(r=>r.imageId)).size,unusableImages,imagesWithoutCandidates:extractionWithoutCandidates,automaticStatus:counts(reparsed.map(r=>r.decision.status)),reasons:counts(reparsed.flatMap(r=>r.decision.reasons))},
 uniqueFoundConcerts:new Set(rows.flatMap(r=>r.foundKopisIds)).size,trackConcertLinks:rows.reduce((n,r)=>n+r.foundKopisIds.length,0)}
meta.requests={dbGet:dbRequests,productionGet:productionRequests,remoteWrites:0};meta.tracks=rows
await writeFile(output,JSON.stringify(meta,null,2)+'\n')
console.log(JSON.stringify({output,...meta,tracks:undefined},null,2))
