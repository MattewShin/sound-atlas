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

function ocrSource(evidence) {
  if(evidence==null)return {reason:'OCR_ABSENT'}
  if(typeof evidence!=='object'||Array.isArray(evidence))return {reason:'OCR_EVIDENCE_INVALID'}
  // The caller must have validated freshness, success and source identity.
  // This assertion is a contract, not a DB/source check performed by the router.
  if(evidence.is_current!==true)return {reason:'OCR_NOT_CURRENT'}
  if(evidence.status!==undefined&&evidence.status!=='SUCCEEDED')return {reason:'OCR_NOT_SUCCEEDED'}
  const text=evidence.raw_text
  if(!validText(text))return {reason:'OCR_TEXT_INVALID'}
  if(!text.trim())return {reason:'OCR_TEXT_EMPTY'}
  const hash=textHash(text)
  // Optional text hash is distinct from the image's content_sha256.
  if(present(evidence.raw_text_hash)){
    if(!validHash(evidence.raw_text_hash))return {reason:'OCR_HASH_INVALID'}
    if(evidence.raw_text_hash!==hash)return {reason:'OCR_HASH_MISMATCH'}
  }
  return {reason:'CURRENT_OCR_AVAILABLE',text,hash}
}

/**
 * Pure selection; no analysis, synthetic image/OCR IDs or persistence.
 * Input: stored text/hash and optional caller-validated current_ocr_evidence
 * {is_current:true, raw_text, status?:'SUCCEEDED', raw_text_hash?:sha256}.
 * raw_text/text_hash always describe the selected source's exact UTF-8 text.
 * Official sections are empty on OCR/NONE, so rejected source text is not leaked.
 */
export function routeProgramSource(input={}) {
  const text=input?.kopis_detail_text,hash=input?.kopis_detail_text_hash
  const official=officialSource(text,hash)
  if(official.sections)return {source_kind:'KOPIS_DETAIL_TEXT',reason_code:'OFFICIAL_PROGRAM_SELECTED',
    official_reason_code:official.reason,ocr_reason_code:'NOT_CONSIDERED',official_sections:official.sections,raw_text:text,text_hash:hash}
  const ocr=ocrSource(input?.current_ocr_evidence)
  return {source_kind:ocr.text!==undefined?'OCR':'NONE',reason_code:ocr.text!==undefined?'OCR_FALLBACK':'NO_USABLE_SOURCE',
    official_reason_code:official.reason,ocr_reason_code:ocr.reason,official_sections:[],raw_text:ocr.text??null,text_hash:ocr.hash??null}
}
