import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {CATALOG_HASH} from './programAnalysis.mjs'
import {planProgramSource,createProgramSourceReader} from './programSourcePlan.mjs'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const sha=s=>createHash('sha256').update(s).digest('hex')
const version='stored-program-4',text='[Program]\nF. Chopin\nScherzo No.4 Op.54'
const concert={id:id(1),kopis_detail_text:text,kopis_detail_text_hash:sha(text)}
const evidence={is_current:true,status:'SUCCEEDED',raw_text:'PROGRAM\nF. Chopin\nBallade No.4 Op.52',ocr_result_id:id(4)}
const analysis={id:id(2),concert_id:id(1),source_kind:'KOPIS_DETAIL_TEXT',source_hash:sha(text),matcher_version:version,
  catalog_hash:CATALOG_HASH,analysis_is_current:true,is_fresh:true,policy_enabled:true}
const candidate={id:id(3),analysis_id:id(2),concert_id:id(1),source_kind:'KOPIS_DETAIL_TEXT',source_hash:sha(text),matcher_version:version,
  catalog_hash:CATALOG_HASH,analysis_is_current:true,is_fresh:true,is_effective_current:true,automatic_ready:true,stale_reason:null,
  exclusion_reasons:[],track_id:'chopin-scherzo-op54-no4',work_id:'chopin-scherzo-op54-no4',outcome:'MATCHED',relation:'EXACT',
  candidate_snapshot:{review_reasons:['COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY'],identity:{arrangement_or_excerpt:false},scope:{kind:'EXACT'}}}
const ocrCandidate={...candidate,id:id(5),ocr_result_id:id(4),source_kind:undefined,source_hash:undefined,
  review_status:'REVIEW_REQUIRED',identity:{arrangement_or_excerpt:false},review_reasons:[],candidate_snapshot:undefined}
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'}

function mock(tables,{cap=200,change}={}){
  const calls=[],reader=createProgramSourceReader({env,fetchImpl:async(url,init)=>{
    assert.equal(init.method,'GET');assert.equal(init.body,undefined)
    const endpoint=url.pathname.split('/').pop(),name=endpoint==='read_concert_program_text_candidate_status_v4'?'concert_program_text_candidate_status':endpoint,params=Object.fromEntries(url.searchParams)
    if(endpoint!==name){assert.equal(params.p_analysis_id,id(2));assert.ok(url.pathname.includes('/rpc/'))}
    calls.push({name,params});change?.(name,params,tables,calls)
    if(!(name in tables))throw Error('UNEXPECTED_READ '+name)
    let data=tables[name]
    for(const [key,v] of Object.entries(params))if(v.startsWith('eq.'))data=data.filter(r=>String(r[key])===v.slice(3))
    data=data.slice(Number(params.offset||0),Number(params.offset||0)+Math.min(Number(params.limit||200),cap))
    return new Response(JSON.stringify(data))
  }})
  return {calls,reader}
}

test('official priority selects one hash/version/catalog, excludes OCR, stays pending for missing/stale analysis, and supports fresh zero candidates',()=>{
  const input={concert,current_ocr_evidence:evidence,analyses:[analysis],statuses:[candidate,ocrCandidate,{...candidate,id:id(6),source_hash:'f'.repeat(64)}]}
  const before=structuredClone(input),out=planProgramSource(input)
  assert.equal(out.selected_source,'KOPIS_DETAIL_TEXT');assert.equal(out.total_candidates,1);assert.equal(out.ready_count,1)
  assert.equal(out.source_hash,sha(text));assert.equal(out.matcher_version,version);assert.deepEqual(input,before)
  for(const analyses of [[],[{...analysis,is_fresh:false}],[{...analysis,analysis_is_current:false}],[{...analysis,catalog_hash:'f'.repeat(64)}]]){
    const pending=planProgramSource({...input,analyses});assert.equal(pending.reason_code,'OFFICIAL_ANALYSIS_PENDING');assert.equal(pending.total_candidates,0)
  }
  assert.equal(planProgramSource({...input,statuses:[]}).reason_code,'OFFICIAL_PROGRAM_SELECTED')
  const disabled=planProgramSource({...input,analyses:[{...analysis,policy_enabled:false}]})
  assert.equal(disabled.ready_count,0);assert.equal(disabled.excluded_reasons.VERSION_POLICY_DISABLED_OR_MISSING,1)
})

test('same-source duplicate track OR work excludes every occurrence without merging; conflicts, unknown reasons and non-EXACT stay excluded',()=>{
  const input={concert,analyses:[analysis],statuses:[candidate,{...candidate,id:id(6),track_id:'another-track'}]}
  const out=planProgramSource(input);assert.equal(out.total_candidates,2);assert.equal(out.ready_count,0)
  assert.ok(out.candidates.every(c=>c.exclusion_reasons.includes('DUPLICATE_TRACK_OR_WORK')))
  for(const reason of ['COMPOSER_CONFLICT','ARRANGEMENT_IDENTITY_UNRESOLVED','EXCERPT_SCOPE_REQUIRES_REVIEW','NEW_UNKNOWN_REASON']){
    const c={...candidate,candidate_snapshot:{...candidate.candidate_snapshot,review_reasons:[reason]}}
    assert.equal(planProgramSource({...input,statuses:[c]}).ready_count,0)
  }
  for(const c of [{...candidate,relation:'ARRANGEMENT_OR_EXCERPT'},{...candidate,outcome:'CONFLICT'},
    {...candidate,track_id:null},{...candidate,automatic_ready:false}])assert.equal(planProgramSource({...input,statuses:[c]}).ready_count,0)
})

test('OCR fallback uses only the selected real OCR v4 result; NONE produces no candidates',()=>{
  const input={concert:{id:id(1)},current_ocr_evidence:evidence,policy_enabled:true,
    statuses:[candidate,ocrCandidate,{...ocrCandidate,id:id(7),matcher_version:'stored-program-3'},{...ocrCandidate,id:id(8),ocr_result_id:id(9)}]}
  const out=planProgramSource(input);assert.equal(out.selected_source,'OCR');assert.equal(out.total_candidates,1);assert.equal(out.ready_count,1)
  assert.equal(out.source_hash,sha(evidence.raw_text));assert.equal(planProgramSource({...input,policy_enabled:false}).ready_count,0)
  const none=planProgramSource({concert:{id:id(1)},statuses:[candidate,ocrCandidate]})
  assert.equal(none.reason_code,'NO_USABLE_SOURCE');assert.equal(none.total_candidates,0)
  assert.throws(()=>planProgramSource({...input,current_ocr_evidence:{...evidence,ocr_result_id:undefined}}),/RESULT_ID_REQUIRED/)
})

test('GET adapter reads authoritative concert and official status only, paginates past server caps and preserves pending/empty analyses',async()=>{
  const tables={concerts:[concert],concert_program_text_analysis_status:[analysis],concert_program_text_candidate_status:[candidate]}
  const {reader,calls}=mock(tables,{cap:1})
  assert.equal((await reader.plan({concert_id:id(1),current_ocr_evidence:evidence})).ready_count,1)
  assert.ok(calls.every(c=>['concerts','concert_program_text_analysis_status','concert_program_text_candidate_status'].includes(c.name)))
  assert.ok(calls.filter(c=>c.name.includes('text_')).every(c=>c.params.source_hash==='eq.'+sha(text)&&c.params.matcher_version==='eq.'+version))
  tables.concert_program_text_analysis_status=[];calls.length=0
  assert.equal((await reader.plan({concert_id:id(1),current_ocr_evidence:evidence})).reason_code,'OFFICIAL_ANALYSIS_PENDING')
  assert.ok(!calls.some(c=>c.name.includes('candidate')))
  tables.concert_program_text_analysis_status=[analysis];tables.concert_program_text_candidate_status=[]
  assert.equal((await reader.plan({concert_id:id(1)})).reason_code,'OFFICIAL_PROGRAM_SELECTED')
  tables.concert_program_text_candidate_status=[candidate,{...candidate,id:id(10)}]
  const duplicate=await reader.plan({concert_id:id(1)});assert.equal(duplicate.total_candidates,2);assert.equal(duplicate.ready_count,0)
})

test('GET adapter OCR fallback verifies stored text/result ID, exact policy; NONE never reads candidate stores',async()=>{
  const tables={concerts:[{id:id(1)}],concert_image_ocr_results:[{id:id(4),raw_text:evidence.raw_text}],
    concert_program_candidate_status:[ocrCandidate],concert_program_version_policy:[{matcher_version:version,enabled:true}]}
  const {reader,calls}=mock(tables)
  assert.equal((await reader.plan({concert_id:id(1),current_ocr_evidence:evidence})).ready_count,1)
  assert.ok(!calls.some(c=>c.name.includes('text_')))
  tables.concert_program_version_policy=[]
  assert.equal((await reader.plan({concert_id:id(1),current_ocr_evidence:evidence})).ready_count,0)
  tables.concert_image_ocr_results[0].raw_text+=' changed'
  await assert.rejects(reader.plan({concert_id:id(1),current_ocr_evidence:evidence}),/OCR_TEXT_CHANGED/)
  calls.length=0;const none=await reader.plan({concert_id:id(1)})
  assert.equal(none.reason_code,'NO_USABLE_SOURCE');assert.ok(calls.every(c=>c.name==='concerts'))
  await assert.rejects(reader.plan({concert_id:'invalid'}),/CONCERT_ID_REQUIRED/)
})

test('changing metadata across GET pages fails closed without OCR fallback or persistence',async()=>{
  const tables={concerts:[concert],concert_program_text_analysis_status:[analysis],concert_program_text_candidate_status:[candidate]}
  let changed=false
  const {reader,calls}=mock(tables,{change:(name,params,t)=>{
    if(name==='concert_program_text_candidate_status'&&!changed){changed=true;t.concert_program_text_analysis_status=[{...analysis,is_fresh:false}]}
  }})
  const out=await reader.plan({concert_id:id(1),current_ocr_evidence:evidence})
  assert.equal(out.reason_code,'SOURCE_STATUS_CHANGED_RETRY');assert.equal(out.ready_count,0)
  assert.ok(!calls.some(c=>c.name==='concert_program_candidate_status'))
})
