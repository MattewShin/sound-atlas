import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createProgramTextCoordinator} from './programTextCoordinator.mjs'

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const hash=s=>createHash('sha256').update(s).digest('hex')
const saveRpc='save_concert_program_text_analysis_v4',confirmRpc='confirm_concert_program_text_candidate_v4'
const readRpc='read_concert_program_text_candidate_status_v4'
const analysisView='concert_program_text_analysis_status',candidateView='concert_program_text_candidate_status',receiptView='concert_program_text_confirmation_status'
const endpoints=[analysisView,candidateView,receiptView,'rpc/'+saveRpc,'rpc/'+confirmRpc,'rpc/'+readRpc]
const single='PRIVATE \u{1f3b9} e\u0301\r\n[Program]\r\nF. Chopin\r\nScherzo No.4 in E Major, Op.54'
const multiple=single+'\r\nBiography\r\nPRIVATE history\r\n[Program]\r\nJ. Brahms\r\nIntermezzo Op.118 No.2'
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE-fixture-key'}

function fixture(text=single,options={}){
  const state={concert:{id:id(1),title:'Local coordinator',venue:'Local hall',start_date:'2099-10-26',end_date:'2099-10-26',program_context_revision:0,
    kopis_detail_text:text,kopis_detail_text_hash:text===null?null:hash(text)},paths:Object.fromEntries(endpoints.map(e=>['/'+e,{}])),enabled:true,
    receipts:[],calls:[],saved:null,delays:0,...options}
  const candidateId=index=>id(100-index*10)
  const receipt=expected=>({id:id(500+state.receipts.length),candidate_id:expected.candidate_id,analysis_id:expected.analysis_id,concert_id:id(1),
    source_kind:'KOPIS_DETAIL_TEXT',status:'CONFIRMED',source_hash:expected.source_hash,payload_hash:expected.payload_hash,catalog_hash:expected.catalog_hash,
    matcher_version:expected.matcher_version,decision_version:expected.decision_version,is_effectively_confirmed:true,stale_reason:null})
  const coordinator=createProgramTextCoordinator({env:{...env,PROGRAM_TEXT_MAX_CONFIRMATIONS:'99'},delay:async()=>{state.delays++},fetchImpl:async(url,init)=>{
    url=new URL(url);const name=url.pathname.replace('/rest/v1/',''),body=init.body===undefined?null:JSON.parse(init.body)
    state.calls.push({name,method:init.method,params:Object.fromEntries(url.searchParams),body})
    assert.ok(['','concerts','concert_program_version_policy','concert_program_text_analyses',...endpoints].includes(name),name)
    const intercepted=await state.hook?.({name,init,url,body,state})
    if(intercepted!==undefined)return intercepted
    if(init.method==='POST'){
      if(name==='rpc/'+saveRpc){state.saved=body.p_analysis;await state.afterSave?.(state);return new Response(JSON.stringify(id(20)))}
      assert.equal(name,'rpc/'+confirmRpc)
      const expected=body.p_expected,old=state.receipts.find(r=>r.candidate_id===expected.candidate_id)
      if(old)return new Response(JSON.stringify(old.id))
      const r=receipt(expected);state.receipts.push(r);return new Response(JSON.stringify(r.id))
    }
    assert.equal(init.method,'GET');assert.equal(init.headers.Prefer,'count=exact')
    if(name==='')return new Response(JSON.stringify({paths:state.paths}))
    if(name==='concert_program_version_policy')return new Response(JSON.stringify(state.policy??[{matcher_version:'stored-program-4',enabled:state.enabled}]))
    const p=state.saved
    let data=[]
    if(name==='concerts')data=[state.concert]
    if(name==='concert_program_text_analyses'&&p)data=[{id:id(20),concert_id:id(1),source_kind:'KOPIS_DETAIL_TEXT',matcher_version:p.matcher_version,
      source_hash:p.source_hash,catalog_hash:p.catalog_hash,payload_hash:p.payload_hash,is_current:true}]
    if(name===analysisView&&p&&!state.pending)data=[{id:id(20),concert_id:id(1),source_kind:'KOPIS_DETAIL_TEXT',source_hash:p.source_hash,
      matcher_version:p.matcher_version,catalog_hash:p.catalog_hash,analysis_is_current:true,is_fresh:!state.stale,policy_enabled:state.enabled,is_effective_current:state.enabled&&!state.stale}]
    if((name===candidateView||name==='rpc/'+readRpc)&&p)data=p.candidates.map((c,i)=>({id:candidateId(i),analysis_id:id(20),concert_id:id(1),candidate_key:c.candidate_key,
      source_kind:'KOPIS_DETAIL_TEXT',source_hash:p.source_hash,matcher_version:p.matcher_version,catalog_hash:p.catalog_hash,
      analysis_is_current:true,is_fresh:!state.stale,is_effective_current:state.enabled&&!state.stale,policy_enabled:state.enabled,stale_reason:state.stale?'CONCERT_CONTEXT_CHANGED':null,
      outcome:c.outcome,relation:c.relation,track_id:c.track_id,work_id:c.work_id,review_reasons:c.review_reasons,candidate_snapshot:c,
      automatic_ready:!state.notReady,exclusion_reasons:state.notReady?['UNRESOLVED_REVIEW_OR_SCOPE']:[]}))
    if(name===receiptView)data=state.receipts
    for(const [key,value]of url.searchParams){
      if(value.startsWith('eq.'))data=data.filter(r=>String(r[key])===value.slice(3))
      if(key==='id'&&value.startsWith('gt.'))data=data.filter(r=>r.id>value.slice(3))
    }
    data=[...data].sort((a,b)=>a.id.localeCompare(b.id))
    const total=data.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100)
    data=data.slice(offset,offset+Math.min(limit,state.cap??100))
    const range=data.length?`0-${data.length-1}/${total}`:'*/0'
    return new Response(JSON.stringify(data),{headers:{'content-range':range}})
  }})
  return {state,coordinator,run:mode=>coordinator.run({concert_id:id(1),mode}),candidateId}
}
const posts=f=>f.state.calls.filter(c=>c.method==='POST')
const confirmations=f=>posts(f).filter(c=>c.name==='rpc/'+confirmRpc)

test('exact one-concert/mode input; extra limits, arrays, implicit mode and multiple concerts fail before reads',async()=>{
  const f=fixture()
  for(const input of [null,[],{}, {concert_id:[id(1)],mode:'SAVE'}, {concert_id:'PF900057',mode:'SAVE'}, {concert_id:id(1)},
    {concert_id:id(1),mode:'save'},{concert_id:id(1),mode:'SAVE',limit:5},{concert_id:id(1),mode:'SAVE',concert_ids:[id(1),id(2)]}]){
    await assert.rejects(f.coordinator.run(input),e=>e.code==='PROGRAM_TEXT_COORDINATOR_INPUT_INVALID')
  }
  assert.deepEqual(f.state.calls,[])
})

test('DRY_RUN uses existing official analysis/payload only, returns aggregates/hashes with no POST or policy/view dependency',async()=>{
  const f=fixture(multiple,{paths:{},enabled:false}),out=await f.run('DRY_RUN')
  assert.equal(out.status,'DRY_RUN');assert.equal(out.source,'KOPIS_DETAIL_TEXT');assert.equal(out.counts.total,2);assert.equal(out.outcomes.MATCHED,2)
  assert.match(out.source_hash,/^[a-f0-9]{64}$/);assert.match(out.payload_hash,/^[a-f0-9]{64}$/)
  assert.equal(out.analysis_id,null);assert.equal(out.receipt_id,null);assert.equal(out.counts.ready,0);assert.equal(out.counts.pending,2)
  assert.deepEqual(f.state.calls.map(c=>c.name),['concerts']);assert.equal(posts(f).length,0)
  for(const s of ['PRIVATE','evidence','quote','snapshot','raw_text','kopis_detail_text'])assert.ok(!JSON.stringify(out).includes(s))
})

test('official-only skips absent/biography/bad-hash source before any preflight, analysis write or OCR endpoint',async()=>{
  for(const mode of ['DRY_RUN','SAVE'])for(const text of [null,'Biography\nPRIVATE past repertoire','<div>Program</div>']){
    const f=fixture(text),out=await f.run(mode)
    assert.equal(out.status,'SKIPPED');assert.equal(out.payload_hash,null);assert.equal(out.counts.total,0)
    assert.deepEqual(f.state.calls.map(c=>c.name),['concerts'])
  }
  const f=fixture();f.state.concert.kopis_detail_text_hash='e'.repeat(64)
  assert.equal((await f.run('SAVE')).reason,'OFFICIAL_HASH_MISMATCH');assert.equal(posts(f).length,0)
  // If a source object ever includes caller-attested OCR, the router's OCR
  // selection is still skipped, never passed into analysis/storage by us.
  const ocr=fixture(null);ocr.state.concert.current_ocr_evidence={is_current:true,status:'SUCCEEDED',raw_text:'PRIVATE OCR program'}
  const out=await ocr.run('SAVE');assert.equal(out.source,'OCR');assert.equal(out.status,'SKIPPED');assert.equal(out.payload_hash,null)
  assert.deepEqual(ocr.state.calls.map(c=>c.name),['concerts'])
})

test('every RPC/view and explicit enabled v4 policy is preflighted before first POST; all missing/disabled/malformed cases write zero',async()=>{
  for(const name of endpoints){const f=fixture();delete f.state.paths['/'+name]
    const out=await f.run('SAVE');assert.equal(out.status,'FAILED',name);assert.equal(out.reason,'PREFLIGHT_FAILED');assert.equal(posts(f).length,0)}
  for(const policy of [[],[{matcher_version:'stored-program-4',enabled:false}],[{matcher_version:'stored-program-4',enabled:'true'}],
    [{matcher_version:'stored-program-3',enabled:true}],[{matcher_version:'stored-program-4',enabled:true},{matcher_version:'stored-program-4',enabled:true}]]){
    const f=fixture(single,{policy});assert.equal((await f.run('SAVE')).status,'FAILED');assert.equal(posts(f).length,0)
  }
  for(const name of [analysisView,candidateView,receiptView]){
    const f=fixture(single,{hook:({name:path})=>path===name?new Response('{}',{status:404}):undefined})
    assert.equal((await f.run('SAVE')).reason,'PREFLIGHT_FAILED');assert.equal(posts(f).length,0)
  }
})

test('SAVE order: all preflights, 3E save, 3F current plan, 3H receipt read, then at most one 3G confirmation in UUID order',async()=>{
  const f=fixture(multiple),out=await f.run('SAVE')
  assert.equal(out.status,'CONFIRMED');assert.equal(out.counts.total,2);assert.equal(out.counts.ready,2);assert.equal(out.counts.pending,1)
  assert.equal(confirmations(f).length,1);assert.equal(confirmations(f)[0].body.p_expected.candidate_id,f.candidateId(1))
  assert.deepEqual(posts(f).map(c=>c.name),['rpc/'+saveRpc,'rpc/'+confirmRpc]);assert.equal(f.state.receipts.length,1)
  const saveIndex=f.state.calls.findIndex(c=>c.name==='rpc/'+saveRpc)
  for(const name of [analysisView,candidateView,receiptView])assert.ok(f.state.calls.slice(0,saveIndex).some(c=>c.name===name))
  const after=f.state.calls.slice(saveIndex+1),confirmIndex=after.findIndex(c=>c.name==='rpc/'+confirmRpc)
  assert.ok(after.slice(0,confirmIndex).some(c=>c.name==='rpc/'+readRpc&&c.method==='GET'&&c.params.p_analysis_id===id(20)));assert.ok(after.slice(0,confirmIndex).some(c=>c.name===receiptView&&c.params.select!=='id'))
  assert.equal(confirmations(f)[0].body.p_expected.analysis_id,out.analysis_id)
  for(const forbidden of ['PRIVATE','evidence','quote','candidate_snapshot','identity','kopis_detail_text'])assert.ok(!JSON.stringify(out).includes(forbidden))
})

test('single-candidate retry is ALREADY_CONFIRMED with no additional confirmation; stale/invalid existing receipt is held',async()=>{
  const f=fixture();const first=await f.run('SAVE'),savedHash=f.state.saved.payload_hash
  assert.equal(first.status,'CONFIRMED');const second=await f.run('SAVE')
  assert.equal(second.reason,'ALREADY_CONFIRMED');assert.equal(second.counts.already,1);assert.equal(second.counts.ready,0);assert.equal(second.counts.pending,0)
  assert.equal(f.state.saved.payload_hash,savedHash);assert.equal(confirmations(f).length,1);assert.equal(f.state.receipts.length,1)
  assert.equal(posts(f).filter(c=>c.name==='rpc/'+saveRpc).length,1)
  for(const change of [{is_effectively_confirmed:false,stale_reason:'SOURCE_HASH_CHANGED_OR_INVALID'},{is_effectively_confirmed:'true',stale_reason:null},
    {is_effectively_confirmed:true,stale_reason:null,payload_hash:'e'.repeat(64)}]){
    Object.assign(f.state.receipts[0],change);const held=await f.run('SAVE')
    assert.equal(held.reason,'HOLD_EXISTING_RECEIPT');assert.equal(held.counts.hold,1);assert.equal(held.counts.ready,0)
    assert.equal(confirmations(f).length,1);assert.equal(f.state.receipts.length,1)
  }
})

test('changed source, pending/stale plan or disabled policy after analysis save prevents confirmation; no new eligibility rule',async()=>{
  for(const afterSave of [s=>{s.concert.kopis_detail_text=null;s.concert.kopis_detail_text_hash=null},s=>{s.pending=true},s=>{s.stale=true},s=>{s.enabled=false}]){
    const f=fixture(single,{afterSave}),out=await f.run('SAVE')
    assert.equal(out.reason,'PLAN_NOT_CURRENT');assert.equal(confirmations(f).length,0);assert.equal(posts(f).length,1)
  }
  const f=fixture(single,{notReady:true}),out=await f.run('SAVE')
  assert.equal(out.reason,'NO_READY_CANDIDATE');assert.equal(out.counts.pending,1);assert.equal(out.counts.ready,0);assert.equal(confirmations(f).length,0)
})

test('confirmation failure stops at candidate one, with no transport retry, other candidate or RPC fallback',async()=>{
  for(const failure of ['network','http','json']){
    const f=fixture(multiple,{hook:({name,init})=>{
      if(name!=='rpc/'+confirmRpc||init.method!=='POST')return
      if(failure==='network')throw Error('PRIVATE upstream error')
      return failure==='http'?new Response('PRIVATE error',{status:503}):new Response('PRIVATE invalid json')
    }})
    const out=await f.run('SAVE');assert.equal(out.status,'FAILED');assert.equal(out.reason,'CONFIRMATION_FAILED')
    assert.equal(confirmations(f).length,1);assert.equal(f.state.delays,0);assert.equal(posts(f).length,2);assert.equal(f.state.receipts.length,0)
    assert.equal(out.receipt_id,null);assert.ok(!JSON.stringify(out).includes('PRIVATE'))
  }
})

test('receipt pagination must be complete; malformed/partial receipts stop without confirmation, valid smaller caps still hold existing candidates',async()=>{
  const f=fixture(multiple,{cap:1});assert.equal((await f.run('SAVE')).status,'CONFIRMED')
  // Give both candidates existing receipts; cap1 must read both rather than
  // treating a short page as the end and confirming the unseen candidate.
  f.state.receipts.push({...f.state.receipts[0],id:id(501),candidate_id:f.candidateId(0)})
  assert.equal((await f.run('SAVE')).counts.already,2);assert.equal(confirmations(f).length,1)
  for(const failure of ['missing-range','partial','wrong-concert']){
    const g=fixture(single,{hook:({name,url})=>{
      if(name!==receiptView||url.searchParams.get('select')==='id')return
      if(failure==='missing-range')return new Response('[]')
      if(failure==='partial')return new Response('[]',{headers:{'content-range':'0-0/1'}})
      return new Response(JSON.stringify([{id:id(500),candidate_id:id(100),concert_id:id(2)}]),{headers:{'content-range':'0-0/1'}})
    }})
    assert.equal((await g.run('SAVE')).reason,'RECEIPT_READ_FAILED');assert.equal(confirmations(g).length,0)
  }
})
