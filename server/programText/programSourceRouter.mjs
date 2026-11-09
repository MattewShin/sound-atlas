import {createHash} from 'node:crypto'
import {extractOfficialProgramText} from './officialProgramText.mjs'

const textHash=text=>createHash('sha256').update(text,'utf8').digest('hex')
const validText=text=>typeof text==='string'&&!text.includes('\0')
  &&![...text].some(c=>c.codePointAt(0)>=0xd800&&c.codePointAt(0)<=0xdfff)
const validHash=hash=>typeof hash==='string'&&hash.length===64&&/^[0-9a-f]{64}$/.test(hash)
const present=value=>value!==null&&value!==undefined

function officialSource(text,hash) {
  if(!present(text)&&!present(hash))return {reason:'OFFICIAL_TEXT_ABSENT'}
  if(!present(text)||!present(hash))return {reason:'OFFICIAL_PAIR_INCOMPLETE'}
  if(!validText(text))return {reason:'OFFICIAL_TEXT_INVALID'}
  if(!text.trim())return {reason:'OFFICIAL_TEXT_EMPTY'}
  if(!validHash(hash))return {reason:'OFFICIAL_HASH_INVALID'}
  if(textHash(text)!==hash)return {reason:'OFFICIAL_HASH_MISMATCH'}
  const extraction=extractOfficialProgramText(text)
  if(extraction.reason==='MARKUP_NOT_SUPPORTED')return {reason:'OFFICIAL_MARKUP_UNSUPPORTED'}
  if(!extraction.sections.length)return {reason:'OFFICIAL_PROGRAM_ABSENT'}
  const sections=extraction.sections.filter(s=>s.text.split('\n').slice(1).some(line=>line.trim()))
  if(!sections.length)return {reason:'OFFICIAL_PROGRAM_EMPTY'}
  return {reason:'OFFICIAL_PROGRAM_AVAILABLE',sections}
}

// Official source only. Missing/invalid official text never selects an alternate source.
export function routeProgramSource(input={}) {
 const text=input?.kopis_detail_text,hash=input?.kopis_detail_text_hash,official=officialSource(text,hash);
 if(official.sections)return {source_kind:'KOPIS_DETAIL_TEXT',reason_code:'OFFICIAL_PROGRAM_SELECTED',official_reason_code:official.reason,official_sections:official.sections,raw_text:text,text_hash:hash};
 return {source_kind:'NONE',reason_code:'NO_USABLE_SOURCE',official_reason_code:official.reason,official_sections:[],raw_text:null,text_hash:null};
}
