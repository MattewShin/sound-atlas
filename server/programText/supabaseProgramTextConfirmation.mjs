import {CATALOG_HASH,CATALOG_JSON,MATCHER_VERSION} from './programAnalysis.mjs'
import {createSupabaseRest} from './supabaseRest.mjs'

export const PROGRAM_TEXT_CONFIRM_RPC='confirm_concert_program_text_candidate_v4'
export const PROGRAM_TEXT_CONFIRM_VERSION='program-text-confirm-1'
const fields=['candidate_id','analysis_id','source_hash','payload_hash','catalog_hash','matcher_version','decision_version']
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const fail=code=>{throw Error(code)}

// Expected identities only: no caller track/work/outcome or planner readiness.
export function programTextConfirmationExpected(input){
  if(!input||Array.isArray(input)||Object.keys(input).length!==fields.length||fields.some(f=>!Object.hasOwn(input,f)))fail('OFFICIAL_CONFIRMATION_EXPECTED_REQUIRED')
  if(!uuid(input.candidate_id)||!uuid(input.analysis_id)||!hash(input.source_hash)||!hash(input.payload_hash)
    ||input.catalog_hash!==CATALOG_HASH||input.matcher_version!==MATCHER_VERSION||input.decision_version!==PROGRAM_TEXT_CONFIRM_VERSION)fail('OFFICIAL_CONFIRMATION_IDENTITY_INVALID')
  return Object.fromEntries(fields.map(f=>[f,input[f]]))
}

// Server/local use only. Not connected to any runner, batch, review or UI.
export function createProgramTextConfirmationStore(options={}){
  const request=createSupabaseRest(options)
  const preflightConfirm=async()=>{
    const schema=await request('')
    if(!schema.paths?.['/rpc/'+PROGRAM_TEXT_CONFIRM_RPC])fail('PROGRAM_TEXT_CONFIRMATION_MIGRATION_REQUIRED')
    const policy=await request('concert_program_version_policy',{params:{select:'matcher_version,enabled',matcher_version:'eq.'+MATCHER_VERSION,limit:'2'}})
    if(!Array.isArray(policy)||policy.length!==1||policy[0].matcher_version!==MATCHER_VERSION||policy[0].enabled!==true)fail('PROGRAM_TEXT_CONFIRMATION_POLICY_REQUIRED')
    return {rpc_ready:true,matcher_version:MATCHER_VERSION,decision_version:PROGRAM_TEXT_CONFIRM_VERSION}
  }
  return {preflightConfirm,async confirm(input){
    const expected=programTextConfirmationExpected(input)
    await preflightConfirm() // every attempt; database revalidates under locks
    return request('rpc/'+PROGRAM_TEXT_CONFIRM_RPC,{body:{p_expected:expected,p_catalog_json:CATALOG_JSON}})
  }}
}
