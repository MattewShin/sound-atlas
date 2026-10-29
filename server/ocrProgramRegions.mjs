import {sourceLines,extractIdentity,analyzeProgramText,analyzeStoredProgram,hashJson} from './programAnalysis.mjs'
import {bounds,performerLine} from './programComposerBlocks.mjs'

export const OCR_REGION_VERSION='ocr-program-regions-1'
export const OCR_REGION_REASONS=Object.freeze(['EXPLICIT_PROGRAM_HEADING','OCR_EXPLICIT_PROGRAM_HEADING','OCR_SPATIAL_PROGRAM_BLOCK'])
export const ocrProgramHeading=text=>/^(?:program(?:me)?|프로그램|곡목|연주곡(?:목)?|repertoire|레퍼토리)$/i.test(String(text).normalize('NFKC').replace(/[\s.\[\]【】()「」『』〈〉《》:：·•\-–—]/gu,''))
export const explicitOcrCatalogue=text=>/\b(?:Op|BWV|KV|K|D|S|R|Hob)[.:]?\s*\d/i.test(text)
export const ocrProgramMetadata=text=>performerLine(text)||/티켓|예매|입장|관람|문의|후원|주최|주관|협찬|프로필|출연진|연주자|공연장|공연명|일시|장소|졸업|학사|석사|박사|수상|경력|\b(?:tickets?|admission|booking|venue|location|sponsor|profile|biography|information|intermission|graduat\w*|university|conservatory)\b|program\s+notes?|https?:|www\.|\b\d{2,3}[-.]\d{3,4}[-.]\d{4}\b/i.test(text)
  ||/리사이틀|연주회|독주회|음악회|마스터클래스|피아니스트|바이올리니스트|\b(?:recital|concert|performers?|artists?|pianist|violinist|masterclass|workshop)\b/i.test(text)
  ||/20\d{2}\s*[.\-/년]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\b\d{1,2}:\d{2}\b|\d[,.]?\d*\s*(?:원|won|KRW)|^\s*(?:날짜|date|time)\s*[:：]/i.test(text)

export function adjacentOcrBoxes(first,second){
 const a=bounds(first),b=bounds(second);if(!a||!b)return false
 const ah=a.bottom-a.top,bh=b.bottom-b.top,h=Math.max(ah,bh),x=Math.min(a.right,b.right)-Math.max(a.left,b.left),y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
 const row=y>=Math.min(ah,bh)*.5&&Math.max(a.left-b.right,b.left-a.right,0)<=h*2
 const column=x>=Math.min(a.right-a.left,b.right-b.left)*.3&&Math.max(a.top-b.bottom,b.top-a.bottom,0)<=h*1.8
 return row||column
}
const explicitPair=(composer,catalogue)=>composer.line_index===catalogue.line_index||adjacentOcrBoxes(composer,catalogue)
export function ocrCandidateExplicitPair(candidate,regionLines){
 const permitted=new Set(regionLines.map(l=>l.line_index)),ev=(candidate.evidence||[]).filter(e=>permitted.has(e.line_index)&&!ocrProgramMetadata(e.quote))
 const names=ev.filter(e=>extractIdentity(e.quote).composers.includes(candidate.identity?.composer)),numbers=ev.filter(e=>e.role!=='COMPOSER'&&explicitOcrCatalogue(e.quote))
 return names.some(name=>{const visited=new Set([name.line_index]),queue=[name];while(queue.length){const line=queue.shift();if(numbers.some(n=>n.line_index===line.line_index))return true;for(const other of ev)if(!visited.has(other.line_index)&&explicitPair(line,other)){visited.add(other.line_index);queue.push(other)}}return false})
}

// No synthetic headings, corrected text or moved evidence coordinates. Missing
// bbox cannot create a spatial block; explicit headings retain missing lines so
// the existing coverage/bbox gates can reject them instead of inflating quality.
export function detectOcrProgramRegions(ocr){
 const lines=sourceLines(ocr),regions=[],claimed=new Set(),metadata=lines.filter(l=>ocrProgramMetadata(l.text)),headers=lines.filter(l=>ocrProgramHeading(l.text))
 let active=null
 const close=()=>{if(active?.lines.length){regions.push(active);for(const l of active.lines)claimed.add(l.line_index)}active=null}
 for(const line of lines){
  if(ocrProgramHeading(line.text)){close();active={reason:'OCR_EXPLICIT_PROGRAM_HEADING',heading_line_index:line.line_index,lines:[]};continue}
  if(ocrProgramMetadata(line.text)){close();continue}
  if(active&&line.text.trim())active.lines.push(line)
 }
 close()
 const candidates=lines.filter(l=>l.text.trim()&&!claimed.has(l.line_index)&&!ocrProgramHeading(l.text)&&!ocrProgramMetadata(l.text)&&bounds(l)),visited=new Set()
 const barrier=(a,b)=>metadata.some(m=>{const x=bounds(a),y=bounds(b),z=bounds(m);return z&&z.top>=Math.min(x.bottom,y.bottom)&&z.bottom<=Math.max(x.top,y.top)&&Math.min(x.right,y.right,z.right)>Math.max(x.left,y.left,z.left)})
 for(const start of candidates){
  if(visited.has(start.line_index))continue
  const group=[],queue=[start];visited.add(start.line_index)
  while(queue.length){const line=queue.shift();group.push(line);for(const other of candidates)if(!visited.has(other.line_index)&&adjacentOcrBoxes(line,other)&&!barrier(line,other)){visited.add(other.line_index);queue.push(other)}}
  const names=group.filter(l=>extractIdentity(l.text).composers.length),numbers=group.filter(l=>explicitOcrCatalogue(l.text))
  if(names.length&&numbers.length)regions.push({reason:'OCR_SPATIAL_PROGRAM_BLOCK',heading_line_index:null,lines:group.sort((a,b)=>a.line_index-b.line_index)})
 }
 return {version:OCR_REGION_VERSION,regions:regions.sort((a,b)=>a.lines[0].start-b.lines[0].start),metadata_line_indices:metadata.map(l=>l.line_index),heading_line_indices:headers.map(l=>l.line_index)}
}

// Reuse identification as a pure function. Only the verified OCR region
// classification replaces the headingless/UNCERTAIN marker. All context, date,
// scope, arrangement and matching conflicts remain in the candidate reasons.
export function analyzeOcrFallbackProgram(target){
 const detection=detectOcrProgramRegions(target.ocr),base=analyzeStoredProgram(target),sections=[],candidates=[],logical=[],grouping={physical_work_rows:0,logical_work_count:0,bilingual_merges:0,parent_child_merges:0,parent_scope_works:0,catalog_linked_work_count:0,catalog_link_rows:0,unique_catalog_ids:0}
 for(const region of detection.regions){
  const parsed=analyzeProgramText({concert:target.concert,lines:region.lines,rawText:target.ocr.raw_text,width:target.ocr.width,sourceId:target.ocr.id}),indices=region.lines.map(l=>l.line_index),sectionIndex=sections.length
  sections.push({index:sectionIndex,classification:'PROGRAM',reason:region.reason,start:Math.min(...region.lines.map(l=>l.start)),end:Math.max(...region.lines.map(l=>l.end)),line_indices:indices,heading_line_index:region.heading_line_index,region_version:OCR_REGION_VERSION})
  for(const candidate of parsed.candidates){
   if(!ocrCandidateExplicitPair(candidate,region.lines))continue
   const original=parsed.sections[candidate.section_index],identity=structuredClone(candidate.identity)
   if(identity.composer_relation?.association==='SCOPED_HEADING')identity.composer_relation={...identity.composer_relation,association:'OCR_SPATIAL_WORK_BLOCK'}
   const clean=values=>(values||[]).filter(r=>r!=='UNCERTAIN_PROGRAM_SECTION')
   const c={...candidate,identity,section_index:sectionIndex,review_reasons:clean(candidate.review_reasons),generation_reasons:[region.reason,...(candidate.generation_reasons||[]).filter(r=>r!==original.reason)],ocr_region_version:OCR_REGION_VERSION}
   c.candidate_key=hashJson({prior_key:candidate.candidate_key,region_version:OCR_REGION_VERSION,region_reason:region.reason,line_indices:indices,composer:identity.composer_relation})
   candidates.push(c)
   const w=parsed.logical_works.find(w=>w.logical_work_id===c.logical_work_id)
   logical.push({...w,section_index:sectionIndex,review_flags:clean(w.review_flags)})
  }
  for(const key of Object.keys(grouping))if(key!=='unique_catalog_ids')grouping[key]+=parsed.grouping[key]||0
 }
 grouping.logical_work_count=logical.length;grouping.catalog_link_rows=candidates.filter(c=>c.catalog_id).length;grouping.unique_catalog_ids=new Set(candidates.map(c=>c.catalog_id).filter(Boolean)).size
 const body={...base,sections,candidates,logical_works:logical,grouping,ocr_region_version:OCR_REGION_VERSION};delete body.payload_hash
 return {...body,payload_hash:hashJson(body)}
}
