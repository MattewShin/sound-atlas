import test from 'node:test'
import assert from 'node:assert/strict'
import {CATALOG_HASH,CATALOG_JSON} from './programAnalysis.mjs'
import {createProgramTextConfirmationStore,programTextConfirmationExpected,PROGRAM_TEXT_CONFIRM_RPC,PROGRAM_TEXT_CONFIRM_VERSION} from './supabaseProgramTextConfirmation.mjs'

const input={candidate_id:'00000000-0000-4000-8000-000000000001',analysis_id:'00000000-0000-4000-8000-000000000002',
  source_hash:'a'.repeat(64),payload_hash:'b'.repeat(64),catalog_hash:CATALOG_HASH,matcher_version:'stored-program-4',decision_version:PROGRAM_TEXT_CONFIRM_VERSION}
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'}
const schema={paths:{['/rpc/'+PROGRAM_TEXT_CONFIRM_RPC]:{}}},policy=[{matcher_version:'stored-program-4',enabled:true}]

test('confirmation adapter accepts expected identities only and rejects invalid or client-decision fields before any transport',async()=>{
  const calls=[],store=createProgramTextConfirmationStore({env,fetchImpl:()=>{calls.push(1);throw Error('MUST_NOT_FETCH')}})
  const before=structuredClone(input);assert.deepEqual(programTextConfirmationExpected(input),input);assert.deepEqual(input,before)
  for(const invalid of [null,[],{}, {...input,track_id:'caller-track'},{...input,outcome:'MATCHED'},{...input,planning_ready:true},
    {...input,candidate_id:'bad'},{...input,analysis_id:null},{...input,source_hash:'A'.repeat(64)},{...input,payload_hash:123},
    {...input,catalog_hash:'c'.repeat(64)},{...input,matcher_version:'stored-program-3'},{...input,decision_version:'unbounded'}])await assert.rejects(store.confirm(invalid),/EXPECTED_REQUIRED|IDENTITY_INVALID/)
  assert.deepEqual(calls,[])
})

test('dedicated RPC and exactly enabled v4 policy are required on every attempt before POST',async()=>{
  for(const [paths,rows] of [[{},policy],[schema.paths,[]],[schema.paths,[{matcher_version:'stored-program-4',enabled:false}]],
    [schema.paths,[{matcher_version:'stored-program-4',enabled:'true'}]],[schema.paths,[{matcher_version:'stored-program-3',enabled:true}]],
    [schema.paths,[...policy,...policy]],[schema.paths,{}]]){
    const calls=[],store=createProgramTextConfirmationStore({env,fetchImpl:async(url,init)=>{
      calls.push(init.method);assert.equal(init.method,'GET');assert.equal(init.body,undefined)
      if(url.pathname==='/rest/v1/')return new Response(JSON.stringify({paths}))
      assert.equal(url.pathname,'/rest/v1/concert_program_version_policy');assert.equal(url.searchParams.get('matcher_version'),'eq.stored-program-4')
      return new Response(JSON.stringify(rows))
    }})
    await assert.rejects(store.confirm(input),/MIGRATION_REQUIRED|POLICY_REQUIRED/);assert.ok(calls.every(m=>m==='GET'))
  }
})

test('enabled adapter posts one candidate to only the dedicated confirmation RPC and never OCR/v3 fallback on 404 or ineligibility',async()=>{
  let status=200;const calls=[],store=createProgramTextConfirmationStore({env,fetchImpl:async(url,init)=>{
    calls.push({method:init.method,path:url.pathname})
    if(init.method==='GET')return new Response(JSON.stringify(url.pathname==='/rest/v1/'?schema:policy))
    assert.equal(init.method,'POST');assert.equal(url.pathname,'/rest/v1/rpc/'+PROGRAM_TEXT_CONFIRM_RPC)
    const body=JSON.parse(init.body);assert.deepEqual(body,{p_expected:input,p_catalog_json:CATALOG_JSON})
    return new Response(JSON.stringify(status===200?'receipt-fixture':{code:status===404?'PGRST202':'P0001',message:'ineligible'}),{status})
  }})
  assert.equal(await store.confirm(input),'receipt-fixture')
  for(const code of [404,400]){status=code;await assert.rejects(store.confirm(input))}
  assert.equal(calls.filter(c=>c.method==='POST').length,3)
  assert.equal(calls.filter(c=>c.method==='GET'&&c.path.endsWith('concert_program_version_policy')).length,3)
  assert.ok(calls.filter(c=>c.method==='POST').every(c=>c.path==='/rest/v1/rpc/'+PROGRAM_TEXT_CONFIRM_RPC))
})

test('a later disabled preflight blocks another POST, including retry of the same expected snapshot',async()=>{
  let enabled=true,posts=0;const store=createProgramTextConfirmationStore({env,fetchImpl:async(url,init)=>{
    if(init.method==='POST'){posts++;return new Response(JSON.stringify('same-receipt'))}
    return new Response(JSON.stringify(url.pathname==='/rest/v1/'?schema:[{matcher_version:'stored-program-4',enabled}]))
  }})
  assert.equal(await store.confirm(input),'same-receipt');enabled=false
  await assert.rejects(store.confirm(input),/POLICY_REQUIRED/);assert.equal(posts,1)
})
