import {analyzeProgramText,analyzeStoredProgram,MATCHER_VERSION,CATALOG_HASH} from './programAnalysis.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'

const fail=code=>{throw Object.assign(new Error(code),{code})}
const sameSection=(a,b)=>['startLine','endLine','start_offset','end_offset','text'].every(k=>a?.[k]===b[k])
const officialLines=rawText=>{
  const parts=rawText.split(/(\r\n|\r|\n)/),lines=[]
  let offset=0
  for(let i=0;i<parts.length;i+=2){
    const text=parts[i]
    lines.push({text,start:offset,end:offset+text.length,line_index:i/2,bbox:null,confidence:null})
    offset+=text.length+(parts[i+1]?.length||0)
  }
  return lines
}

/**
 * Pure read-only envelope, NOT a save_concert_program_analysis_v4 payload.
 * source is the result of routeProgramSource. For OCR, current_ocr_target is
 * caller-validated {is_current:true,image,ocr,attempt}; no freshness I/O occurs.
 * Official offsets are UTF-16 units in the FULL untouched stored source.
 * OCR offsets/snapshot retain their original Unicode-code-point contract.
 */
export function analyzeSelectedProgramSource(input={}) {
  const {concert,source}=input
  if(!source||!['KOPIS_DETAIL_TEXT','OCR','NONE'].includes(source.source_kind))fail('PROGRAM_SOURCE_INVALID')
  const result={mode:'READ_ONLY',source_kind:source.source_kind,text_hash:source.text_hash,
    reason_code:source.reason_code,official_reason_code:source.official_reason_code,ocr_reason_code:source.ocr_reason_code,
    matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH,
    storage_compatible:false,storage_reason_code:source.source_kind==='KOPIS_DETAIL_TEXT'?'OFFICIAL_TEXT_REQUIRES_SOURCE_STORAGE_CONTRACT':'READ_ONLY_ENVELOPE',
    offset_unit:null,source_sections:[],sections:[],candidates:[],logical_works:[],ocr_analysis:null}
  if(source.source_kind==='NONE')return {...result,analysis_reason_code:'NO_USABLE_SOURCE'}
  if(!concert||typeof concert!=='object')fail('PROGRAM_CONCERT_REQUIRED')

  if(source.source_kind==='OCR'){
    const target=input.current_ocr_target
    if(target?.is_current!==true||!target.image||!target.ocr||!target.attempt)fail('CURRENT_OCR_TARGET_REQUIRED')
    const verified=routeProgramSource({current_ocr_evidence:{is_current:true,raw_text:target.ocr.raw_text,raw_text_hash:source.text_hash}})
    if(verified.source_kind!=='OCR'||source.raw_text!==target.ocr.raw_text||verified.text_hash!==source.text_hash)fail('CURRENT_OCR_TARGET_MISMATCH')
    const analysis=analyzeStoredProgram({concert,image:target.image,ocr:target.ocr,attempt:target.attempt})
    return {...result,analysis_reason_code:'ANALYZED',offset_unit:'UNICODE_CODE_POINT',
      sections:analysis.sections,candidates:analysis.candidates,logical_works:analysis.logical_works,ocr_analysis:analysis}
  }

  // Reject altered router boundaries/hash; analyze exact source slices rather
  // than the diagnostic LF-normalized section.text. Never consult OCR here.
  const verified=routeProgramSource({kopis_detail_text:source.raw_text,kopis_detail_text_hash:source.text_hash})
  if(verified.source_kind!=='KOPIS_DETAIL_TEXT'||!Array.isArray(source.official_sections)
    ||source.official_sections.length!==verified.official_sections.length
    ||!verified.official_sections.every((section,i)=>sameSection(source.official_sections[i],section)))fail('PROGRAM_SOURCE_INVALID')
  const lines=officialLines(source.raw_text)
  for(const [sourceIndex,span] of verified.official_sections.entries()){
    const selected=lines.filter(line=>line.line_index>=span.startLine&&line.line_index<=span.endLine)
    const analysis=analyzeProgramText({concert,lines:selected,
      rawText:source.raw_text.slice(span.start_offset,span.end_offset),width:0,
      sourceId:{kind:'KOPIS_DETAIL_TEXT',text_hash:source.text_hash,section_index:sourceIndex}})
    const sectionOffset=result.sections.length
    result.source_sections.push({source_section_index:sourceIndex,startLine:span.startLine,endLine:span.endLine,
      start_offset:span.start_offset,end_offset:span.end_offset})
    result.sections.push(...analysis.sections.map(s=>({...s,index:s.index+sectionOffset,source_section_index:sourceIndex})))
    result.candidates.push(...analysis.candidates.map(c=>({...c,section_index:c.section_index+sectionOffset,source_section_index:sourceIndex})))
    result.logical_works.push(...analysis.logical_works.map(w=>({...w,section_index:w.section_index+sectionOffset,source_section_index:sourceIndex})))
  }
  return {...result,analysis_reason_code:'ANALYZED',offset_unit:'UTF16_CODE_UNIT'}
}
