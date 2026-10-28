import {createHash} from 'node:crypto'
import {createSupabaseRest} from './supabaseRest.mjs'
import {CATALOG_HASH,CATALOG_JSON,MATCHER_VERSION,concertContext} from './programAnalysis.mjs'
import {canonicalIdentityJson} from './programWorkIdentity.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'

export const PROGRAM_TEXT_SAVE_RPC='save_concert_program_text_analysis_v4'
const fail=code=>{throw Object.assign(new Error(code),{code})}
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex')
export const programTextPayloadHash=body=>hash(canonicalIdentityJson(body))

// No normalization. Only Unicode scalar boundaries are valid conversion points.
export function programTextCodePointMap(text){
  const map=new Map([[0,0]])
  let utf16=0,points=0
  for(const character of text){
    const cp=character.codePointAt(0)
    if(cp===0||cp>=0xd800&&cp<=0xdfff)fail('PROGRAM_TEXT_INVALID_UNICODE')
    utf16+=character.length;map.set(utf16,++points)
  }
  return map
}

export function buildProgramTextAnalysisPayload({concert,analysis}={}){
  const source=routeProgramSource({kopis_detail_text:concert?.kopis_detail_text,kopis_detail_text_hash:concert?.kopis_detail_text_hash})
  if(source.source_kind!=='KOPIS_DETAIL_TEXT')fail('OFFICIAL_PROGRAM_SOURCE_REQUIRED')
  if(analysis?.source_kind!=='KOPIS_DETAIL_TEXT'||analysis.matcher_version!==MATCHER_VERSION
    ||analysis.catalog_hash!==CATALOG_HASH||analysis.text_hash!==source.text_hash
    ||analysis.offset_unit!=='UTF16_CODE_UNIT'||analysis.ocr_analysis!==null)fail('OFFICIAL_PROGRAM_ANALYSIS_REQUIRED')
  for(const key of ['image_id','ocr_result_id','source_attempt_id','attempt_id'])if(Object.hasOwn(analysis,key))fail('OCR_IDS_NOT_ALLOWED')
  if(!Array.isArray(analysis.source_sections)||analysis.source_sections.length!==source.official_sections.length
    ||!source.official_sections.every((s,i)=>{
      const a=analysis.source_sections[i]
      return a?.source_section_index===i&&a.start_offset===s.start_offset&&a.end_offset===s.end_offset&&a.startLine===s.startLine&&a.endLine===s.endLine
    }))fail('OFFICIAL_SECTION_MISMATCH')
  const text=source.raw_text,map=programTextCodePointMap(text)
  const point=value=>{if(!Number.isSafeInteger(value)||!map.has(value))fail('INVALID_UTF16_SOURCE_BOUNDARY');return map.get(value)}
  const convert=value=>{
    if(Array.isArray(value))return value.map(convert)
    if(!value||typeof value!=='object')return value
    const result=Object.fromEntries(Object.entries(value).map(([key,child])=>[key,convert(child)]))
    const offsets=Object.hasOwn(value,'start_offset')||Object.hasOwn(value,'end_offset')
    const bounds=Object.hasOwn(value,'start')||Object.hasOwn(value,'end')
    if(offsets||bounds){
      const start=offsets?value.start_offset:value.start,end=offsets?value.end_offset:value.end
      const a=point(start),b=point(end)
      if(b<a)fail('INVALID_UTF16_SOURCE_BOUNDARY')
      if(Object.hasOwn(value,'quote')&&text.slice(start,end)!==value.quote)fail('PROGRAM_TEXT_QUOTE_MISMATCH')
      if(offsets){delete result.start_offset;delete result.end_offset}
      result.start=a;result.end=b;result.diagnostic_utf16={start,end}
    }
    return result
  }
  // Materialize JSON once, removing only values that JSON cannot represent.
  const selected=JSON.parse(JSON.stringify({source_sections:analysis.source_sections,sections:analysis.sections,
    candidates:analysis.candidates,logical_works:analysis.logical_works}))
  const body={schema_version:'official-program-text-analysis-1',source_kind:'KOPIS_DETAIL_TEXT',
    matcher_version:MATCHER_VERSION,concert_id:concert.id,concert_revision:concert.program_context_revision,
    concert_context:concertContext(concert),source_hash:source.text_hash,catalog_hash:CATALOG_HASH,
    offset_unit:'UNICODE_CODE_POINT',...convert(selected),diagnostic_metadata:{input_offset_unit:'UTF16_CODE_UNIT'}}
  if(!Number.isSafeInteger(body.concert_revision)||body.concert_revision<0)fail('CONCERT_REVISION_REQUIRED')
  return {...body,payload_hash:programTextPayloadHash(body)}
}

export function createProgramTextAnalysisStore(options={}){
  const request=createSupabaseRest(options)
  const preflightSave=async()=>{
    const schema=await request('')
    if(!schema.paths?.['/rpc/'+PROGRAM_TEXT_SAVE_RPC])fail('PROGRAM_TEXT_V4_MIGRATION_REQUIRED')
    const policy=await request('concert_program_version_policy',{params:{select:'enabled',matcher_version:'eq.stored-program-4',limit:'2'}})
    if(Array.isArray(policy)&&policy[0]?.enabled===false)fail('PROGRAM_ANALYSIS_VERSION_DISABLED')
    if(!Array.isArray(policy)||policy.length!==1||policy[0]?.enabled!==true)fail('PROGRAM_ANALYSIS_VERSION_POLICY_REQUIRED')
    return {rpc_ready:true,matcher_version:MATCHER_VERSION,source_kind:'KOPIS_DETAIL_TEXT'}
  }
  return {preflightSave,async save(input){
    const payload=buildProgramTextAnalysisPayload(input)
    await preflightSave()
    return request('rpc/'+PROGRAM_TEXT_SAVE_RPC,{body:{p_analysis:payload,p_catalog_json:CATALOG_JSON}})
  }}
}
