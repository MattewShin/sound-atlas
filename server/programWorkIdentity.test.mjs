import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {CATALOG_JSON,CATALOG_HASH,analyzeStoredProgram} from './programAnalysis.mjs'
import {workIdentity,confirmationValidity} from './programWorkIdentity.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'
import {buildRematchCandidate,rematchProgramCandidates} from './programRematch.mjs'
import {planIdentityBackfill} from './programIdentityBackfill.mjs'
import {parseProgramArgs} from '../scripts/analyzeConcertPrograms.mjs'
const base=()=>({...JSON.parse(CATALOG_JSON),catalog_hash:CATALOG_HASH}),id='chopin-ballade-op52-no4'
const valid=()=>({work_id:id,track_id:id,review_status:'CONFIRMED',relation:'EXACT',outcome:'MATCHED',matcher_version:'stored-program-3',confirmation_matcher_version:'stored-program-3',confirmation_pipeline_version:EASYOCR_PIPELINE_VERSION,
  catalog_hash:'old-global-hash',confirmed_work_identity_hash:workIdentity(base(),id).hash,analysis_is_current:true,is_effectively_confirmed:true,stale_reason:null,concerts:{end_date:'2026-10-27'}})
test('work identity is deterministic across property order, normalized whitespace and set order',()=>{
 const a=base(),b=base();b.works[id]=Object.fromEntries(Object.entries(b.works[id]).reverse());b.targets.reverse();b.works[id].aliases.reverse();b.works[id].musicalKeys.reverse();
 b.works[id].title='  '+a.works[id].title.replaceAll(' ','\n  ')+'  '
 assert.equal(workIdentity(a,id).hash,workIdentity(b,id).hash)
})
test('unrelated additions, other composers with identical opus/number, and alias collisions preserve a manual work identity',()=>{
 const a=base(),h=workIdentity(a,id).hash
 a.works.other={...a.works[id],id:'other',composer:'다른 작곡가'};a.targets.push({...a.targets.find(t=>t.trackId===id),trackId:'other',workId:'other'})
 assert.equal(workIdentity(a,id).hash,h)
 a.works.same={...a.works[id],id:'same'};a.targets.push({...a.targets.find(t=>t.trackId===id),trackId:'same',workId:'same'})
 assert.equal(workIdentity(a,id).hash,h);assert.equal(confirmationValidity(valid(),a,{version:'stored-program-3'}).is_effectively_confirmed,true)
})
test('ratings, energy, prose, listening points, YouTube/segment/image and UI ordering are excluded',()=>{
 const a=base(),h=workIdentity(a,id).hash
 Object.assign(a.works[id],{emotionScores:{tenderness:5},energy:1,summary:'changed',background:'changed',about:'unrelated prose',listeningTip:'changed',youtubeUrl:'https://example.com/new',startSeconds:9,image:'new',displayOrder:99})
 Object.assign(a.targets.find(t=>t.trackId===id),{energy:5,summary:'other',youtubeUrl:'https://example.com/other'})
 assert.equal(workIdentity(a,id).hash,h)
})
for(const field of ['composer','title','titleEn','opus','number','bookNumber','catalogue','catalogueNumber','musicalKeys','aliases','arrangement','instrumentation','excerpt'])test('identifying work field invalidates: '+field,()=>{
 const a=base(),v=valid();a.works[id][field]=Array.isArray(a.works[id][field])?['changed']:typeof a.works[id][field]==='number'?999:'changed'
 assert.equal(confirmationValidity(v,a,{version:'stored-program-3'}).stale_reason,'WORK_IDENTITY_CHANGED')
})
test('movement fields and removal fail closed; global hash alone never invalidates',()=>{
 const c=base(),v=valid();c.catalog_hash='different';assert.equal(confirmationValidity(v,c,{version:'stored-program-3'}).is_effectively_confirmed,true)
 c.targets.find(t=>t.trackId===id).movementNumber=2;assert.equal(confirmationValidity(v,c,{version:'stored-program-3'}).stale_reason,'WORK_IDENTITY_CHANGED')
 delete c.works[id];assert.equal(confirmationValidity(v,c,{version:'stored-program-3'}).stale_reason,'WORK_REMOVED')
})
for(const [change,reason]of [[{stale_reason:'EVIDENCE_CHANGED'},'EVIDENCE_CHANGED'],[{matcher_version:'stored-program-99'},'MATCHER_VERSION_CHANGED'],[{confirmation_pipeline_version:'incompatible'},'PIPELINE_VERSION_CHANGED'],[{relation:'WHOLE_WORK_REFERENCE'},'NOT_EXACT'],[{confirmed_work_identity_hash:null},'CONFIRMATION_IDENTITY_MISSING']])test('confirmation safety: '+reason,()=>{
 assert.equal(confirmationValidity({...valid(),...change},base(),{version:'stored-program-3'}).stale_reason,reason)
})
test('expired PF300523 cannot be recovered by any hash compatibility',()=>{
 assert.equal(confirmationValidity({...valid(),concerts:{end_date:'2026-10-20'}},base(),{version:'stored-program-3',today:'2026-10-21'}).stale_reason,'CONCERT_ENDED')
})
const source=()=>{
 const a=analyzeStoredProgram({concert:{id:randomUUID(),title:'fixture',venue:'hall',start_date:'2099-01-01',end_date:'2099-01-01'},image:{id:randomUUID(),evidence_revision:0},ocr:{id:randomUUID(),raw_text:'PROGRAM\nF Chopin\nBallade No.4 in F Minor Op.52',detections:[],width:800},attempt:{id:randomUUID()}})
 return {...a.candidates[0],id:randomUUID(),track_id:null,work_id:null,outcome:'UNREGISTERED',matcher_version:'stored-program-3',kopis_id:'PF900500',analysis_is_current:true,evidence_stale_reason:null,analysis:{is_current:true,catalog_hash:'old',ocr_result_id:a.ocr_result_id},concert:{end_date:'2099-01-01'},review_history:[],existing_rematches:[]}
}
test('stored identity rematches after catalog expansion, preserves source and requires review',()=>{
 const s=source(),before=structuredClone(s),empty=base();delete empty.works[id];empty.targets=empty.targets.filter(t=>t.workId!==id)
 assert.equal(buildRematchCandidate(s,{catalog:empty}).track_id,null)
 const a=buildRematchCandidate(s),b=buildRematchCandidate(s);assert.deepEqual(a,b);assert.equal(a.track_id,id);assert.equal(a.review_status,'REVIEW_REQUIRED');assert.deepEqual(a.evidence,s.evidence);assert.deepEqual(s,before)
})
test('rematch retries reuse one record; reviewed and ended sources are skipped while other work continues',async()=>{
 const s=source(),reviewed={...source(),review_history:[{id:randomUUID()}]},ended={...source(),concert:{end_date:'2026-10-20'}},records=[]
 const store={preflightSave:async()=>{},manifestTargets:async()=>({targets:[{ocr:{id:s.analysis.ocr_result_id}}]}),rematchSources:async()=>[s,reviewed,ended],saveRematch:async(sourceId,c)=>{const row={id:randomUUID(),matching_catalog_hash:CATALOG_HASH};records.push(row);s.existing_rematches.push(row);return row.id}}
 const options={save:true,manifest:{targets:[s,reviewed,ended].map(c=>({ocr_result_id:c.analysis.ocr_result_id}))},now:()=>Date.parse('2026-10-21T00:00:00Z')}
 const a=await rematchProgramCandidates(store,options),b=await rematchProgramCandidates(store,options)
 assert.equal(a.new_links,1);assert.equal(a.rematched,1);assert.equal(a.results[0].review_status,'REVIEW_REQUIRED');assert.equal(b.rematched,0);assert.equal(b.reused,1);assert.equal(records.length,1);assert.equal(a.skipped.length,2)
})
test('legacy PF295548 Chopin/Liszt are eligible only with exact Git/snapshot identity; expired concert remains excluded',()=>{
 const cat=base(),rows=[id,'liszt-liebestraum-s541-no3'].map(work=>({id:randomUUID(),work_id:work,track_id:work,analysis_id:randomUUID(),kopis_id:'PF295548',catalog_hash:'a'.repeat(64),review_status:'CONFIRMED',relation:'EXACT',outcome:'MATCHED',matcher_version:'stored-program-3',review_note:'checked',analysis_is_current:true,stale_reason:null,
  concert:{end_date:'2026-10-27'},source_catalog:cat,ocr:{id:'ocr',content_sha256:'bytes',pipeline_version:EASYOCR_PIPELINE_VERSION},attempt:{result_id:'ocr',content_sha256:'bytes'},reviews:[{id:randomUUID(),status:'CONFIRMED',note:'checked',reviewed_at:'2026-10-20T00:00:00Z'}]}))
 rows.push({...rows[0],id:randomUUID(),kopis_id:'PF300523',concert:{end_date:'2026-10-20'}})
 for(const c of rows){c.candidate_key='a'.repeat(64);c.identity={};c.evidence=[{quote:'x',start:0,end:1}];c.section_index=0;c.ocr={...c.ocr,raw_text:'x'};c.analysis={snapshot:{candidates:[Object.fromEntries(['candidate_key','track_id','work_id','relation','outcome','section_index','identity','evidence'].map(k=>[k,structuredClone(c[k])]))]}}}
 const git={commit:'a'.repeat(40),hash:'a'.repeat(64),catalog:cat},opts={now:()=>Date.parse('2026-10-21T00:00:00Z')}
 assert.equal(planIdentityBackfill(rows,git,opts).eligible,2)
 const unproven=structuredClone(rows);unproven[0].analysis.snapshot=null
 assert.equal(planIdentityBackfill(unproven,git,opts).results[0].reason,'HISTORICAL_EVIDENCE_UNPROVEN')
 git.catalog=structuredClone(cat);git.catalog.works[id].opus=999
 assert.equal(planIdentityBackfill(rows,git,opts).eligible,1)
 assert.equal(planIdentityBackfill(rows,{...git,hash:'b'.repeat(64)},opts).eligible,0)
})
test('CLI exposes read-only rematch and explicit, pinned writes only',()=>{
 assert.equal(parseProgramArgs(['rematch','--dry-run']).command,'rematch')
 assert.throws(()=>parseProgramArgs(['rematch','--save']),/REQUIRES/)
 assert.throws(()=>parseProgramArgs(['identity-backfill','--save']),/MANIFEST/)
 assert.throws(()=>parseProgramArgs(['identity-backfill','--git-ref','main']),/FULL_GIT/)
})
