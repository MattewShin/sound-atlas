import {execFileSync} from 'node:child_process'
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {resolve,dirname,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {workIdentity,canonicalIdentityJson} from './programWorkIdentity.mjs'
import {CATALOG_JSON,CATALOG_HASH,MATCHER_VERSION} from './programAnalysis.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {koreaDate} from '../src/data/concertSearchConfig.js'

// Read a pinned, local Git commit only. No fetch, checkout, ref mutation or OCR.
export const loadGitIdentityCatalog=async(commit)=>{
  if(!/^[a-f0-9]{40}$/.test(commit||''))throw new Error('VERIFIED_FULL_GIT_COMMIT_REQUIRED')
  const git=(...args)=>execFileSync('git',args,{windowsHide:true,maxBuffer:30000000,stdio:['pipe','pipe','pipe']})
  if(git('rev-parse',commit+'^{commit}').toString().trim()!==commit)throw new Error('GIT_COMMIT_MISSING')
  const cache=resolve('.cache');await mkdir(cache,{recursive:true});const dir=await mkdtemp(resolve(cache,'identity-git-'))
  try{
    const paths=git('ls-tree','-r','--name-only','-z',commit,'--','src/data').toString().split('\0').filter(p=>/^src\/data\/[a-zA-Z0-9_./-]+\.js$/.test(p))
    for(const path of paths){const target=resolve(dir,path);if(!target.startsWith(dir+sep))throw new Error('UNSAFE_GIT_PATH');await mkdir(dirname(target),{recursive:true});await writeFile(target,git('show',commit+':'+path))}
    await writeFile(resolve(dir,'package.json'),' {"type":"module"}')
    const mod=await import(pathToFileURL(resolve(dir,'src/data/workCatalog.js')).href)
    const json=JSON.stringify({works:mod.workCatalog,targets:Object.values(mod.workCatalog).flatMap(w=>w.trackIds.map(id=>{const {work,...target}=mod.getTrackTarget(id);return target})),
      composers:Object.entries(mod.composerPatterns).map(([k,v])=>[k,v.source,v.flags]),types:Object.entries(mod.workTypePatterns).map(([k,v])=>[k,v.source,v.flags])})
    return {commit,catalog:JSON.parse(json),hash:createHash('sha256').update(json).digest('hex')}
  }finally{if(!dir.startsWith(cache+sep+'identity-git-'))throw new Error('UNSAFE_TEMP_CLEANUP');await rm(dir,{recursive:true,force:true})}
}
export const planIdentityBackfill=(rows,git,{now=Date.now,currentCatalog=JSON.parse(CATALOG_JSON),currentCatalogHash=CATALOG_HASH}={})=>{
  const results=rows.map(c=>{
    const review=[...c.reviews].sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)||b.id.localeCompare(a.id))[0]
    const stored=workIdentity(c.source_catalog,c.work_id),historical=workIdentity(git.catalog,c.work_id),current=workIdentity(currentCatalog,c.work_id)
    const sourceHash=c.matching_catalog_hash||c.catalog_hash
    const snapshot=c.rematch_snapshot||c.analysis?.snapshot?.candidates?.find(s=>s.candidate_key===c.candidate_key)
    const sourceProven=Boolean(snapshot&&['track_id','work_id','relation','outcome','section_index','identity','evidence'].every(k=>canonicalIdentityJson(snapshot[k]??null)===canonicalIdentityJson(c[k]??null))&&Array.isArray(c.evidence)&&c.evidence.length&&c.evidence.every(e=>Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=0&&e.end>e.start&&e.end<=Array.from(c.ocr?.raw_text||'').length&&Array.from(c.ocr?.raw_text||'').slice(e.start,e.end).join('')===e.quote))
    const reason=c.review_status!=='CONFIRMED'||c.relation!=='EXACT'||c.outcome!=='MATCHED'?'NOT_EXACT':
      !review||review.status!=='CONFIRMED'||review.note!==c.review_note?'REVIEW_EVENT_MISMATCH':
      c.concert.end_date<koreaDate(now())?'CONCERT_ENDED':!['stored-program-2',MATCHER_VERSION].includes(c.matcher_version)?'MATCHER_VERSION_CHANGED':
      !c.analysis_is_current||(c.evidence_stale_reason??(c.stale_reason==='CONFIRMATION_IDENTITY_MISSING'?null:c.stale_reason))?'EVIDENCE_CHANGED':
      !c.ocr||c.ocr.pipeline_version!==EASYOCR_PIPELINE_VERSION?'PIPELINE_VERSION_CHANGED':
      c.attempt?.content_sha256!==c.ocr.content_sha256||c.attempt?.result_id!==c.ocr.id?'EVIDENCE_CHANGED':
      !sourceProven?'HISTORICAL_EVIDENCE_UNPROVEN':
      sourceHash!==git.hash?'GIT_CATALOG_SNAPSHOT_MISMATCH':!current?'WORK_REMOVED':
      !stored||!historical||stored.hash!==historical.hash||stored.hash!==current.hash?'WORK_IDENTITY_CHANGED':null
    return {candidate_id:c.id,review_id:review?.id,kopis_id:c.kopis_id,work_id:c.work_id,track_id:c.track_id,analysis_id:c.analysis_id,
      source_catalog_hash:sourceHash,current_catalog_hash:currentCatalogHash,work_identity_hash:current?.hash??null,
      historical_identity_hash:historical?.hash??null,stored_identity_hash:stored?.hash??null,eligible:reason===null,reason,
      already_attested:Boolean(review?.work_identity_hash),evidence_scope:'Stored OCR/attempt/revision checked; current remote image bytes not downloaded'}
  })
  const manifest={schema_version:'program-identity-backfill-1',git_commit:git.commit,source_catalog_hash:git.hash,current_catalog_hash:currentCatalogHash,targets:results.filter(r=>r.eligible)}
  return {mode:'DRY_RUN',db_writes:0,eligible:manifest.targets.length,results,manifest,downloads:0,ocr_runs:0}
}
export const backfillProgramIdentities=async(store,{kopisId,gitRef,save=false,identityManifest,now=Date.now,loadGit=loadGitIdentityCatalog}={})=>{
  const input=identityManifest?.manifest||identityManifest,commit=gitRef||input?.git_commit
  const historical=await loadGit(commit),rows=await store.backfillScope(kopisId),plan=planIdentityBackfill(rows,historical,{now})
  if(!save)return plan
  if(input?.schema_version!=='program-identity-backfill-1'||input.git_commit!==historical.commit||input.source_catalog_hash!==historical.hash||input.current_catalog_hash!==CATALOG_HASH||!Array.isArray(input.targets)||input.targets.length<1||input.targets.length>100||new Set(input.targets.map(t=>t.candidate_id)).size!==input.targets.length)throw new Error('EXACT_IDENTITY_MANIFEST_REQUIRED')
  const selected=input.targets.map(t=>{const fresh=plan.results.find(x=>x.candidate_id===t.candidate_id);if(!fresh?.eligible||fresh.review_id!==t.review_id||fresh.work_identity_hash!==t.work_identity_hash)throw new Error('IDENTITY_MANIFEST_EVIDENCE_CHANGED');return fresh})
  await store.preflightSave()
  const receipts=[]
  for(const target of selected)receipts.push({candidate_id:target.candidate_id,review_id:await store.backfillIdentity(target,input)})
  return {...plan,mode:'SAVE',receipts,db_writes:receipts.filter(r=>!plan.results.find(t=>t.candidate_id===r.candidate_id).already_attested).length}
}
