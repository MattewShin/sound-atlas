import { createHash } from 'node:crypto'
import { composerPatterns, workTypePatterns, workCatalog, musicalKeysIn, getTrackTarget } from '../src/data/workCatalog.js'
import { checkProgramContext } from './programContext.mjs'
import { numberedTitle, nearbyNumberLabel, splitUnparentedItems } from './programItemBoundaries.mjs'
import { composerWorkGeometry, performerLine, intervalLine, sameWorkRow } from './programComposerBlocks.mjs'
import { groupLogicalWorks } from './programLogicalWorks.mjs'
import { matchNormalizedProgramWork } from './programMatchingNormalization.mjs'
import { PROGRAM_IMPLEMENTATION_VERSION } from './programRollout.mjs'

// One version covers extraction, logical grouping and matching semantics.
export const MATCHER_VERSION = PROGRAM_IMPLEMENTATION_VERSION
export const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
// Include every field consumed by identification, including keys derived from track details.
export const CATALOG_JSON = JSON.stringify({ works: workCatalog,
  targets: Object.values(workCatalog).flatMap((w) => w.trackIds.map((id) => {
    const { work, ...target } = getTrackTarget(id); return target
  })),
  composers: Object.entries(composerPatterns).map(([k, v]) => [k, v.source, v.flags]),
  types: Object.entries(workTypePatterns).map(([k, v]) => [k, v.source, v.flags]) })
export const CATALOG_HASH = createHash('sha256').update(CATALOG_JSON).digest('hex')
export const concertContext = ({ title, venue, start_date, end_date }) => ({ title, venue, start_date, end_date })
export const programAnalysisCacheKey = ({ocr,attempt,image,concert},{version=MATCHER_VERSION,catalogHash=CATALOG_HASH}={}) =>
  'analysis:'+hashJson([ocr.id,attempt.id,image.evidence_revision,concert.program_context_revision,concertContext(concert),version,catalogHash])
const normalized = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').normalize('NFKC')
const heading = /^(?:program(?:me)?|프로그램|연주곡(?:목)?|곡목)$/i
// Compare a standalone header label only. Do not normalize source lines, work
// identities or evidence: their exact quotations, offsets and bbox stay intact.
// Extra words, names and dates remain in the label and cannot open a section.
const isProgramHeading = (s) => heading.test(s.replace(/[\s.\[\]【】()「」『』〈〉《》:：·•\-–—]/gu, ''))
const stop = /^\s*(?:profile|biograph\w*|artists?|performers?|program\s+notes?|프로필|출연진|연주자\s*소개|작품\s*해설|관람\s*안내|visitor\s+information|예매|후원|문의|ticket|location|admission)(?=\s|[:：]|$)/i
const biography = /졸업|학사|석사|박사|학위|입학|수상|역임|출강|교수|음반|과거\s*공연|지난\s*공연|경력|취득|연주했|연주하였|협연했|영감|previously|graduat|university|conservatory|awards?|performed|recorded|recording|inspired|discography/i
const tempo = /^(?:[IVXIl1]+[.)]?\s+)?(?:molto|allegro|adagio|andante|largo|presto|moderato|lento|vivace|scherzo|rondo|quasi|tempo)\b/i
const performer = /orchestra|피아노\s*:|piano\s*:|intermission|인터미션|휴식/i
const numberToken = /\b(?:(?:op|bwv|kv|hob)\.?\s*|[kds](?:\.\s*|\s+))(?:\d|[IlO](?=\d|\s|$))/i
const typeIn = (s) => Object.entries(workTypePatterns).find(([, re]) => re.test(s))?.[0] || null
const knownComposers = (s) => Object.entries(composerPatterns).filter(([name, re]) =>
  new RegExp(`(^|[^가-힣])${name}(?:의|가|를|을)?(?=$|[^가-힣])`).test(s) || re.test(s.replace(/[가-힣]+/g, ' '))).map(([name]) => name)
const unknownHeading = (s) => /^(?:[A-Z]\.\s*|[A-Z]\s+)+(?:[A-Z][a-zA-Z-]+\s*){1,3}$/.test(s.split('(')[0].trim())
  || (/^(?:[A-Z][a-zA-Z-]{2,}|[가-힣]{2,6})(?:\s*\([^)]*)?$/.test(s.trim()) && !tempo.test(s) && !/^(?:song|program|programme|piano|guitar|concert|artist|intermission)$/i.test(s.trim()))
  || /^(?:Prokofiev|Mendelssohn|Saint-Saens|Franck|Mozart|Bach|Haydn|Debussy|Ravel|Villa-Lobos|Pujol|Spanish Folk)$/i.test(s.trim())
const isComposerHeading = (s) => !typeIn(s) && !numberToken.test(s) && !biography.test(s)
  && !numberedTitle(s)
  && (knownComposers(s).length > 0 || unknownHeading(s))
const workLine = (s, hasComposer) => Boolean(typeIn(s) || numberToken.test(s)
  || (hasComposer && /[a-z]{3}/i.test(s) && !tempo.test(s) && !performer.test(s)
    && !isComposerHeading(s) && !/^\s*(?:\d+|[IVX]+[.)]?|song)\s*$/i.test(s)))

export const sourceLines = (ocr) => {
  let offset = 0
  return ocr.raw_text.split('\n').map((text, index) => {
    const detection = ocr.detections?.[index]
    const exact = detection?.text === text
    const length = [...text].length
    const line = { text, start: offset, end: offset + length, line_index: index,
      bbox: exact ? detection.bbox : null, confidence: exact ? detection.confidence : null }
    offset += length + 1
    return line
  })
}
const column = (line, width) => line.bbox && Math.max(...line.bbox.map(([x]) => x)) - Math.min(...line.bbox.map(([x]) => x)) < width * .65
  ? (Math.min(...line.bbox.map(([x]) => x)) > width * .5 ? 'right' : 'left') : 'full'
const evidence = (line, role) => ({ role, quote: line.text, start: line.start, end: line.end,
  line_index: line.line_index, bbox: line.bbox, confidence: line.confidence })

export const extractIdentity = (raw) => {
  const text = normalized(raw)
  const catalogues = [...text.matchAll(/\b(Op|BWV|KV|K|D|S|Hob)[.:]?\s*(\d+)([a-z]?)(?:\s*[-/]\s*(\d+))?/gi)]
    .map((m) => ({ system: m[1].toUpperCase().replace('KV', 'K'), number: Number(m[2]), suffix: m[3].toLowerCase(), part: m[4] ? Number(m[4]) : null, raw: m[0] }))
  const opus = catalogues.find((c) => c.system === 'OP')
  const nums = [...text.matchAll(/\b(?:nos?|nr)\.?\s*(\d+)|제?\s*(\d+)\s*번/gi)].map((m) => ({ number: Number(m[1] || m[2]), index: m.index, raw: m[0] }))
  const beforeOp = opus ? text.search(/\bop[.:]?\s*\d/i) : -1
  const workNumbers = nums.filter((n) => beforeOp < 0 || n.index < beforeOp).map((n) => n.number)
  const afterOp = nums.filter((n) => beforeOp >= 0 && n.index > beforeOp).map((n) => n.number)
  const movements = [...text.matchAll(/제?\s*(\d+)\s*악장|\b(?:movement|mov\.)\s*(\d+)|(?:^|\n|[;:])\s*(VIII|VII|VI|IV|III|II|IX|V|I)\s*[.)]/gim)]
    .map((m) => Number(m[1] || m[2]) || ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 })[m[3]?.toUpperCase()])
  const reasons = []
  if (/(?:\d+|[IVX]+)\s*[-~–,·&]\s*(?:\d+|[IVX]+)\s*(?:악장|movements?)|movements?\s+\d+\s*[-~–,&]|\b[IVX]+\.?\s*[-~–]\s*[IVX]+[.)]/i.test(text)) reasons.push('UNCERTAIN_MOVEMENT_RANGE')
  if (/\b(?:op|no|nr|bwv|k|d|s)\.?\s*[IlO](?=\d|\s|in\b|[.,;]|$)|\b\d+[IlO](?=\s|[.,;]|$)|\bIlI\b/i.test(text)) reasons.push('OCR_NUMBER_UNCERTAIN')
  if (new Set(catalogues.filter((c) => c.system === 'OP').map((c) => `${c.number}${c.suffix}/${c.part}`)).size > 1) reasons.push('CONFLICTING_CATALOGUE_NUMBERS')
  if ((new Set(workNumbers).size>1||new Set(afterOp).size>1) && !opus?.part && typeIn(text) !== 'sonata') reasons.push('CHECK_MULTIPLE_WORK_NUMBERS')
  return { original: raw, normalized: text, composers: knownComposers(text), type: typeIn(text),
    title: text.split('\n').find((s) => typeIn(s) || numberToken.test(s)) || text.split('\n').at(-1),
    catalogues, work_numbers: [...new Set(workNumbers)], opus_part: opus?.part || null,
    opus_following_numbers: [...new Set(afterOp)], keys: musicalKeysIn(text.replace(/\b([A-G])\s*[-–]\s*(flat|sharp)\b/gi,'$1 $2')),
    movement_numbers: [...new Set(movements)], movement_names: text.split('\n').filter((s) => tempo.test(s)),
    arrangement_or_excerpt: /편곡|발췌|\barr\.|arranged|arrangement|transcription|\btrans\.|excerpt|(?:four|4)[\s-]+hands|two\s+pianos|네\s*손|두\s*대/i.test(text), reasons }
}

export const matchIdentity = (identity, composer) => {
  const {decision,matching}=matchNormalizedProgramWork(identity,composer)
  return [{...decision,matching}]
}

export const analyzeStoredProgram = ({ concert, image, ocr, attempt }) => {
  const lines = sourceLines(ocr)
  const geometry = composerWorkGeometry(lines,{normalize:normalized,knownComposers,isComposerHeading,typeIn,isHeader:isProgramHeading,isStop:s=>stop.test(s)||biography.test(s),tempo})
  const sections = [], entries = []
  let mode = 'UNCERTAIN', reason = 'NO_PROGRAM_HEADING', section, composers = {}, currents = {}
  const context = checkProgramContext({ ...concert, dateFrom: concert.start_date, dateTo: concert.end_date }, ocr.raw_text)
  const partialDates = [...ocr.raw_text.matchAll(/(?:^|\s)(\d{1,2})\s*[.월/]\s*(\d{1,2})\s*(?:일|[.\s]|$)/g)].map((m) => `${m[1]}-${m[2]}`)
  const multiDate = new Set(partialDates).size > 1 || /series\s+overview|시리즈\s*전체|매월|총\s*\d+회|Session\s*[12]/i.test(ocr.raw_text)
  for (const line of lines) {
    const s = normalized(line.text).trim(), col = column(line, ocr.width)
    if (isProgramHeading(s)) { mode = 'PROGRAM'; reason = 'EXPLICIT_PROGRAM_HEADING'; composers = {}; currents = {}; section = null }
    else if (stop.test(s) || biography.test(s)) { mode = 'NON_PROGRAM'; reason = 'PROFILE_HISTORY_OR_ADMIN'; composers = {}; currents = {} }
    const found = knownComposers(s)
    // A Roman-looking single initial can still introduce a composer. Use the following
    // structured work/birth-date context instead of carrying the previous composer across it.
    const nextText = normalized(lines[line.line_index+1]?.text || '')
    const composerBoundary = !typeIn(s) && !tempo.test(s) && /^[IVX]\.\s*[A-Z][a-zA-Z-]+(?:\s*\([^)]*\))?\s*$/.test(s)
      && (/\(\d{4}/.test(s) || typeIn(nextText) || numberToken.test(nextText))
    if (mode === 'UNCERTAIN' && (isComposerHeading(s) || (found.length && workLine(s, true)))) reason = 'HEADINGLESS_WORK_LIST_REQUIRES_REVIEW'
    if (!section || section.classification !== mode || section.reason !== reason) {
      section = { index: sections.length, classification: mode, reason, start: line.start, end: line.end, preview: line.text.slice(0, 180) }
      sections.push(section)
    }
    section.end = line.end
    if (mode === 'NON_PROGRAM' || !s) continue
    if (isProgramHeading(s)) continue
    if (performerLine(s)||intervalLine(s)) {
      currents={}
      if(intervalLine(s))composers={}
      continue
    }
    if (geometry.events.has(line.line_index)) {
      for(const entry of geometry.events.get(line.line_index)) {
        const workColumn=column(entry.workLine,ocr.width)
        entries.push({...entry,section_index:section.index,col:workColumn})
        // A physically paired name replaces the inherited relationship even if
        // its identity is unresolved; it never falls back to the previous author.
        composers[workColumn]={name:entry.composer,line:entry.composer_line,strong:Boolean(entry.composer),relation:entry.composer_relation}
        currents[workColumn]=entry
      }
    }
    if (geometry.claimed.has(line.line_index)) continue
    if (currents[col] && !composerBoundary && !found.length && !typeIn(s) && (
      sameWorkRow(currents[col].workLine,line) || tempo.test(s) || /^(?:제?\s*\d+\s*악장|\d+\s*[-~–,·&]\s*\d+\s*악장|movements?\b|[IVX]+[.)])/i.test(s) || /^(?:in\s+)?[A-G]\s*(?:[#b♯♭]|flat|sharp)?\s*(?:major|minor)\s*$/i.test(s)
      || /^\s*(?:no|nr)\.?\s*\d+\s*$/i.test(s)
      || (/^(?:Aria|아리아)\s*$/i.test(s)&&/variations?|변주곡/i.test(currents[col].workLine.text))
      || /^(?:편곡|발췌|arr\.|arranged|(?:jazz\s+)?arrangement\b|transcription|excerpt|four\s+hands|two\s+pianos)/i.test(s)
    )) { currents[col].lines.push(line); continue }
    const parent = composers[col] || (col === 'full' ? null : composers.full)
    const detachedTitle = (parent || mode==='PROGRAM') && !found.length && !/^(?:[A-Z]\.\s*|[A-Z]\s+)+[A-Z]|\(\d{4}/.test(s)
      && nearbyNumberLabel(line,lines,l=>column(l,ocr.width))
    if ((isComposerHeading(s) || composerBoundary) && !detachedTitle) {
      // A bare unknown name resets inheritance, but is insufficient to treat arbitrary following prose as a work list.
      composers[col] = { name: found[0] || s.split('(')[0].trim(), line,
        strong: Boolean(found.length || /^(?:[A-Z]\.\s*|[A-Z]\s+)+[A-Z][a-z]|\(\d{4}|^Spanish Folk$/i.test(s)) }
      currents[col] = null; continue
    }
    if ((workLine(s, Boolean(parent?.strong)) || detachedTitle || (numberedTitle(s) && (parent || mode==='PROGRAM'))) && !isProgramHeading(s)) {
      // Standalone opus/key/movement rows extend the preceding work in the SAME column only.
      if (/^\s*(?:(?:op|bwv|k|kv|s|d)\.?\s*\d|in\s+[a-g]\b|제?\s*\d+\s*악장)/i.test(s) && currents[col]) {
        currents[col].lines.push(line); continue
      }
      const composer=found[0]||parent?.name||null
      const composerSources=found.length?[line]:parent?.line?[parent.line]:[]
      const composerRelation=parent?.relation&&!found.length?parent.relation:{name:composer,status:composer?'SOURCE_IDENTIFIED':'UNRESOLVED',association:found.length?'INLINE':'SCOPED_HEADING',block_key:`text:${composerSources[0]?.start??line.start}`,source_line_indices:composerSources.map(l=>l.line_index)}
      const entry = { section_index: section.index, composer,
        lines: parent && !found.length ? [parent.line, line] : [line], composer_line: !found.length ? parent?.line : null, workLine: line, col }
      entry.composer_relation=composerRelation
      entry.composer_lines=composerSources
      entries.push(entry); currents[col] = entry
    } else if (currents[col] && (tempo.test(s) || /^\s*(?:[IVX]+[.)]|제?\s*\d+\s*악장)/i.test(s))) currents[col].lines.push(line)
  }
  const scopeUncertain = multiDate || concert.start_date !== concert.end_date
  for (const section of sections) if (section.classification === 'PROGRAM' && (!context.verified || scopeUncertain)) {
    section.classification = 'UNCERTAIN'
    section.context_reasons = [...(!context.verified ? [`CONTEXT_${context.conflict.toUpperCase()}`] : []), ...(scopeUncertain ? ['MULTIPLE_DATES_OR_SERIES_SCOPE'] : [])]
  }
  const boundedEntries = entries.flatMap(entry=>splitUnparentedItems(entry,lines,{
    columnFor: line=>column(line,ocr.width),
    explicitParent: text=>Boolean(typeIn(text)||numberToken.test(text)||/\b(?:suite|sonata|concerto|variations)\b|모음곡|소나타|협주곡|변주곡/i.test(text)),
  }))
  const physicalEntries = boundedEntries.map((entry) => {
    const identity = { ...extractIdentity(entry.lines.map((l) => l.text).join('\n')), title: normalized(entry.work_title||entry.workLine.text) }
    if (entry.boundary) {
      const {number_line,reasons,preserve_movements,...boundary}=entry.boundary
      Object.assign(identity,boundary,{title:normalized(boundary.title),movement_numbers:preserve_movements?identity.movement_numbers:[],
        reasons:[...new Set([...identity.reasons,...reasons])]})
    }
    const section = sections[entry.section_index]
    const composerRelation=entry.composer_relation
    identity.composer_relation=composerRelation
    identity.work={title:identity.title,catalogues:identity.catalogues,work_numbers:identity.work_numbers,opus_following_numbers:identity.opus_following_numbers,keys:identity.keys,movement_numbers:identity.movement_numbers,
      scope_source_lines:[...new Set([...(entry.scope_lines||[]),...entry.lines.filter(l=>!entry.composer_lines?.includes(l)&&/(?:^|\s|[-–])(?:VIII|VII|VI|IV|III|II|IX|V|I)[.)]?\s|\bAria\b|아리아|발췌|excerpt/i.test(l.text))])].map(l=>l.line_index),
      arrangement_source_lines:entry.lines.filter(l=>/편곡|arr\.|arranged|arrangement|transcription|(?:four|4)[\s-]+hands/i.test(l.text)).map(l=>l.line_index),
      source_line_indices:entry.lines.filter(l=>!entry.composer_lines?.includes(l)||l===entry.workLine).map(l=>l.line_index),
      block_key:entry.work_block_key||`text:${entry.workLine.start}`,layout_block_key:entry.layout_block_key||null}
    const evidenceItems = entry.lines.map((l) => evidence(l, l === entry.workLine ? 'WORK' : l===entry.boundary?.number_line ? 'NUMBER' : entry.composer_lines?.includes(l) || l===entry.composer_line ? 'COMPOSER' : 'SCOPE'))
    return {entry,identity,evidence:evidenceItems}
  })
  const logicalGroups=groupLogicalWorks(physicalEntries,{lines,hash:hashJson,source_id:ocr.id})
  const logicalWorks=[]
  const candidates = logicalGroups.flatMap((group) => {
    const {identity,evidence:evidenceItems}=group
    const entry=group.primary.entry,section=sections[entry.section_index]
    const contextReasons = [...(!context.verified ? [`CONTEXT_${context.conflict.toUpperCase()}`] : []), ...(scopeUncertain ? ['MULTIPLE_DATES_OR_SERIES_SCOPE'] : []),
      ...(section.classification === 'UNCERTAIN' ? ['UNCERTAIN_PROGRAM_SECTION'] : [])]
    const matches=matchIdentity(identity, entry.composer)
    const matching=matches[0].matching
    const decisions=matches.map(({matching:_,...decision})=>decision)
    const confidences=evidenceItems.map(e=>e.confidence).filter(Number.isFinite)
    logicalWorks.push({logical_work_id:group.id,composer:entry.composer,title:identity.work.title,
      section_index:entry.section_index,work:identity.work,source_lines:evidenceItems,
      confidence:{minimum:confidences.length?Math.min(...confidences):null},
      physical_work_line_indices:group.members.map(m=>m.entry.workLine.line_index),
      matching_variant_line_index:group.primary.entry.workLine.line_index,merge_reasons:group.merge_reasons,
      bilingual_merges:group.bilingual_merges,parent_child_merges:group.parent_child_merges,
      separations:group.separations,
      matching,catalog_matches:decisions,review_status:'REVIEW_REQUIRED',review_flags:[...group.review_flags,...contextReasons,...identity.reasons,...decisions.flatMap(m=>m.reasons)]})
    return matches.map((m) => {
      const value = { ...m, logical_work_id:group.id,generation_version:MATCHER_VERSION, identity: { ...identity, composer: entry.composer }, section_index: entry.section_index,
        evidence: evidenceItems, review_status: 'REVIEW_REQUIRED', review_reasons: [...m.reasons, ...contextReasons,...group.review_flags,...identity.reasons],
        generation_reasons: [section.reason, ...m.reasons,...group.merge_reasons] }
      return { ...value, candidate_key: hashJson({ logical_work_id:group.id,composer:identity.composer_relation,catalog:m.catalog_id, track: m.track_id, evidence: evidenceItems.map((e) => [e.start, e.end]), relation: m.relation }) }
    })
  })
  if (!entries.length) for (const section of sections) {
    if (section.classification === 'UNCERTAIN') { section.classification = 'NON_PROGRAM'; section.reason = 'NO_IDENTIFIABLE_WORK_LIST'; }
  }
  const result = { ocr_result_id: ocr.id, image_id: image.id, concert_id: concert.id, image_revision: image.evidence_revision || 0,
    concert_revision: concert.program_context_revision || 0,
    source_attempt_id: attempt?.id,
    concert_context: concertContext(concert), matcher_version: MATCHER_VERSION, catalog_hash: CATALOG_HASH,
    sections, candidates, logical_works:logicalWorks,
    grouping:{physical_work_rows:physicalEntries.length,logical_work_count:logicalWorks.length,
      bilingual_merges:logicalGroups.reduce((n,g)=>n+g.bilingual_merges,0),
      parent_child_merges:logicalGroups.reduce((n,g)=>n+g.parent_child_merges,0),
      parent_scope_works:logicalWorks.filter(w=>w.work.parent_title!==null).length,
      catalog_linked_work_count:logicalWorks.filter(w=>w.catalog_matches.some(m=>m.catalog_id)).length,
      catalog_link_rows:candidates.filter(c=>c.catalog_id).length,unique_catalog_ids:new Set(candidates.map(c=>c.catalog_id).filter(Boolean)).size},
    limitations: ['Stored OCR snapshot only; current URL bytes have not been checked.',
      ...(scopeUncertain ? ['Multiple sessions/dates: work-to-session association requires manual review.'] : [])] }
  return { ...result, payload_hash: hashJson(result) }
}
