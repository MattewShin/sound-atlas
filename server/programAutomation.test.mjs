import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {analyzeStoredProgram} from './programAnalysis.mjs'
import {automaticDecision,runAutomaticPrograms} from './programAutomation.mjs'
import {effectiveEvidenceAttempt} from './supabaseProgramAnalysis.mjs'

const fixture=(text)=>({concert:{id:randomUUID(),title:'Piano recital',venue:'Hall',start_date:'2099-10-27',end_date:'2099-10-27',program_context_revision:0},
 image:{id:randomUUID(),is_active:true,image_type:'DETAIL',evidence_revision:0},
 ocr:{id:randomUUID(),raw_text:text,detections:[],width:800},attempt:{id:randomUUID()}})
const decide=text=>{const t=fixture(text),a=analyzeStoredProgram(t);assert(a.candidates.length);return a.candidates.map(c=>automaticDecision(c,a,t))}

test('automatic source validation confirms unique composer + catalog + item and reparses time as time',()=>{
 assert.equal(decide('2099.10.27 19.30\nPROGRAM\nJ Brahms\nIntermezzo in A Major Op.118 No.2')[0].status,'CONFIRMED')
})
test('similar title with wrong catalog, another composer, conflicting key and biography never confirm',()=>{
 for(const text of ['PROGRAM\nJ Brahms\nIntermezzo Op.119 No.2','PROGRAM\nF Chopin\nIntermezzo Op.118 No.2',
 'PROGRAM\nF Chopin\nBallade No.4 in C Major Op.52','F Chopin\nBallade No.4 Op.52'])assert(decide(text).every(d=>d.status==='REJECTED'),text)
 const t=fixture('PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2\nARTIST\nF Chopin performed Ballade No.4 Op.52'),a=analyzeStoredProgram(t)
 assert.equal(a.candidates.length,1)
})
test('whole-work, movements and arrangement retain exact scope',()=>{
 for(const text of ['PROGRAM\nL Beethoven\nPiano Sonata No.8 Op.13','PROGRAM\nF Liszt\nPiano Sonata in B Minor S.178','PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2 (arranged for four hands)',
 'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2\n1악장'])assert(decide(text).every(d=>d.status==='REJECTED'),text)
 assert.equal(decide('PROGRAM\nL Beethoven\nPiano Sonata No.8 Op.13\nII. Adagio cantabile')[0].status,'CONFIRMED')
})
test('conflicting date and source quotation cannot be repaired by EXACT or repeated parsing',()=>{
 assert.equal(decide('2099.10.26\nPROGRAM\nJ Brahms\nIntermezzo Op.118 No.2')[0].status,'REJECTED')
 const t=fixture('PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2'),a=analyzeStoredProgram(t)
 a.candidates[0].evidence[0].quote='wrong'
 assert(automaticDecision(a.candidates[0],a,t).reasons.includes('SOURCE_QUOTE_MISMATCH'))
})
test('transient failure preserves last byte evidence, changed bytes block it',()=>{
 const s={id:'a',status:'SUCCEEDED',content_sha256:'a',pipeline_version:'p',created_at:'1',finished_at:'1'},f={id:'b',status:'FAILED',content_sha256:null,pipeline_version:'p',created_at:'2',finished_at:'2'}
 assert.equal(effectiveEvidenceAttempt([s,f]),s)
 assert.equal(effectiveEvidenceAttempt([s,{...f,content_sha256:'b'}]).status,'FAILED')
})
test('interrupted candidate save resumes, isolates another error and finalizes only completed images',async()=>{
 const t=fixture('PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2\nF Chopin\nBallade No.4 Op.52'),a=analyzeStoredProgram(t)
 const cs=a.candidates.map(c=>({...c,id:randomUUID()})),saved=new Set();let finished=0,stop=true
 const store={queue:async()=>[{id:'a'}],target:async()=>t,saveAnalysis:async()=> 'a',scope:async()=> 'scope',candidates:async()=>cs,
  decide:async({candidate})=>{if(stop&&saved.size){throw Object.assign(new Error(),{code:'BATCH_INTERRUPTED'})}saved.add(candidate.id);candidate.auto_input_hash='scope';return {outcome:'AUTO_CONFIRMED',reasons:[]}},finish:async()=>{finished++}}
 await assert.rejects(runAutomaticPrograms({store}),{code:'BATCH_INTERRUPTED'})
 assert.equal(saved.size,1);assert.equal(finished,0)
 stop=false
 const report=await runAutomaticPrograms({store});assert.equal(report.unchanged,1);assert.equal(report.confirmed,1);assert.equal(finished,1)
 cs[0].auto_input_hash=null;store.decide=async()=>{throw Object.assign(new Error(),{code:'SUPABASE_HTTP_503',retryable:true})}
 const failure=await runAutomaticPrograms({store});assert.equal(failure.retry_pending,1);assert.equal(finished,1)
})
