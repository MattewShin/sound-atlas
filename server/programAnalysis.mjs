import { createHash } from 'node:crypto'
import { composerPatterns, workTypePatterns, workCatalog, musicalKeysIn, getTrackTarget } from '../src/data/workCatalog.js'
import { identifyEntry } from './programMatching.mjs'
import { checkProgramContext } from './programContext.mjs'
import { numberedTitle, nearbyNumberLabel, splitUnparentedItems } from './programItemBoundaries.mjs'

export const MATCHER_VERSION = 'stored-program-2'
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
const normalized = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').normalize('NFKC')
const heading = /^\s*[\[【(]?(?:program(?:me)?|프로그램|연주\s*곡(?:목)?|곡목)\s*[\]】):：]?\s*$/i
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
  const catalogues = [...text.matchAll(/\b(Op|BWV|KV|K|D|S|Hob)\.?\s*(\d+)([a-z]?)(?:\s*[-/]\s*(\d+))?/gi)]
    .map((m) => ({ system: m[1].toUpperCase().replace('KV', 'K'), number: Number(m[2]), suffix: m[3].toLowerCase(), part: m[4] ? Number(m[4]) : null, raw: m[0] }))
  const opus = catalogues.find((c) => c.system === 'OP')
  const nums = [...text.matchAll(/\b(?:nos?|nr)\.?\s*(\d+)|제?\s*(\d+)\s*번/gi)].map((m) => ({ number: Number(m[1] || m[2]), index: m.index, raw: m[0] }))
  const beforeOp = opus ? text.search(/\bop\.?\s*\d/i) : -1
  const workNumbers = nums.filter((n) => beforeOp < 0 || n.index < beforeOp).map((n) => n.number)
  const afterOp = nums.filter((n) => beforeOp >= 0 && n.index > beforeOp).map((n) => n.number)
  const movements = [...text.matchAll(/제?\s*(\d+)\s*악장|\b(?:movement|mov\.)\s*(\d+)|(?:^|\n|[;:])\s*(VIII|VII|VI|IV|III|II|IX|V|I)\s*[.)]/gim)]
    .map((m) => Number(m[1] || m[2]) || ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 })[m[3]?.toUpperCase()])
  const reasons = []
  if (/(?:\d+|[IVX]+)\s*[-~–,·&]\s*(?:\d+|[IVX]+)\s*(?:악장|movements?)|movements?\s+\d+\s*[-~–,&]|\b[IVX]+\.?\s*[-~–]\s*[IVX]+[.)]/i.test(text)) reasons.push('UNCERTAIN_MOVEMENT_RANGE')
  if (/\b(?:op|no|nr|bwv|k|d|s)\.?\s*[IlO](?=\d|\s|in\b|[.,;]|$)|\b\d+[IlO](?=\s|[.,;]|$)|\bIlI\b/i.test(text)) reasons.push('OCR_NUMBER_UNCERTAIN')
  if (new Set(catalogues.filter((c) => c.system === 'OP').map((c) => `${c.number}${c.suffix}/${c.part}`)).size > 1) reasons.push('CONFLICTING_CATALOGUE_NUMBERS')
  if (new Set(nums.map((n) => n.number)).size > 1 && !opus?.part && typeIn(text) !== 'sonata') reasons.push('CHECK_MULTIPLE_WORK_NUMBERS')
  return { original: raw, normalized: text, composers: knownComposers(text), type: typeIn(text),
    title: text.split('\n').find((s) => typeIn(s) || numberToken.test(s)) || text.split('\n').at(-1),
    catalogues, work_numbers: [...new Set(workNumbers)], opus_part: opus?.part || null,
    opus_following_numbers: [...new Set(afterOp)], keys: musicalKeysIn(text),
    movement_numbers: [...new Set(movements)], movement_names: text.split('\n').filter((s) => tempo.test(s)),
    arrangement_or_excerpt: /편곡|발췌|\barr\.|arranged|transcription|\btrans\.|excerpt|four\s+hands|two\s+pianos|네\s*손|두\s*대/i.test(text), reasons }
}

export const matchIdentity = (identity, composer) => {
  const reasons = [...identity.reasons]
  if (identity.composers.length > 1) reasons.push('CONFLICTING_COMPOSERS')
  if (!composer || !composerPatterns[composer]) reasons.push(composer ? 'COMPOSER_OUTSIDE_CATALOG' : 'COMPOSER_MISSING')
  const entry = { composer, type: identity.type, signature: identity.normalized, lines: [identity.original], biography: false, conflictingComposers: identity.composers.length > 1 }
  const related = Object.values(workCatalog).filter((w) => w.composer === composer && w.type === identity.type)
  const matched = []
  for (const w of related) {
    const op = identity.catalogues.find((c) => c.system === 'OP')
    // Explicit contradictions always veto a link, even when the legacy matcher accepts an alias.
    if (op && (w.opus !== op.number || (w.opusSuffix || '') !== op.suffix || (op.part && w.opusPart !== op.part))) continue
    if (identity.catalogues.some((c) => c.system !== 'OP' && (w.catalogue?.toUpperCase() !== c.system || w.catalogueNumber !== c.number))) continue
    if (identity.work_numbers.length && identity.work_numbers.some((n) => n !== w.number)) continue
    if (identity.opus_following_numbers.length && identity.opus_following_numbers.some((n) => n !== (w.opusPart || w.number))) continue
    if (identity.keys.length && w.musicalKeys.length && identity.keys.some((key) => !w.musicalKeys.includes(key))) continue
    const verdict = identifyEntry(entry, w)
    // Legacy identification deliberately returns ambiguous for arrangements; test identity without that marker.
    const clean = identity.arrangement_or_excerpt ? identifyEntry({ ...entry, lines: [identity.normalized.replace(/편곡|발췌|\barr\.|arranged|transcription|\btrans\.|excerpt/gi, '')] }, w) : verdict
    if (clean.state === 'identified') matched.push(w)
  }
  if (reasons.some((r) => /UNCERTAIN|CONFLICTING|CHECK_MULTIPLE/.test(r))) return [{ track_id: null, work_id: null, relation: 'AMBIGUOUS', outcome: 'AMBIGUOUS', reasons }]
  if (matched.length !== 1) {
    const exactCatalogue = related.some((w) => identity.catalogues.some((c) => c.system === 'OP' ? c.number === w.opus : c.system === w.catalogue && c.number === w.catalogueNumber))
    const explicitDiscriminator = identity.work_numbers.length || identity.opus_following_numbers.length || identity.opus_part || identity.keys.length
    const outcome = matched.length > 1 || !composer ? 'AMBIGUOUS' : !composerPatterns[composer] ? 'UNREGISTERED'
      : (!identity.catalogues.length && !identity.work_numbers.length) ? 'AMBIGUOUS' : exactCatalogue ? explicitDiscriminator ? 'CONFLICT' : 'AMBIGUOUS' : 'UNREGISTERED'
    return [{ track_id: null, work_id: null, relation: 'AMBIGUOUS', outcome,
      reasons: [...reasons, matched.length > 1 ? 'MULTIPLE_CATALOG_WORKS' : outcome === 'CONFLICT' ? 'NUMERIC_KEY_OR_SCOPE_CONFLICT' : outcome === 'UNREGISTERED' ? 'WORK_NOT_REGISTERED' : 'INSUFFICIENT_IDENTITY'] }]
  }
  const w = matched[0]
  if (identity.movement_names.length && !identity.movement_numbers.length) return [{ track_id: null, work_id: w.id, relation: 'AMBIGUOUS', outcome: 'AMBIGUOUS', reasons: ['MOVEMENT_NAME_REQUIRES_REVIEW'] }]
  const ids = w.trackIds.filter((id) => !identity.movement_numbers.length || identity.movement_numbers.includes(getTrackTarget(id).movementNumber))
  if (!ids.length) return [{ track_id: null, work_id: w.id, relation: 'AMBIGUOUS', outcome: 'CONFLICT', reasons: ['MOVEMENT_NOT_IN_CATALOG'] }]
  return ids.map((id) => ({ track_id: id, work_id: w.id, outcome: 'MATCHED',
    relation: identity.arrangement_or_excerpt ? 'ARRANGEMENT_OR_EXCERPT' : getTrackTarget(id).movementNumber && !identity.movement_numbers.length ? 'WHOLE_WORK_REFERENCE' : 'EXACT',
    reasons: ['COMPOSER_AND_STRUCTURED_WORK_IDENTITY', ...(getTrackTarget(id).movementNumber && !identity.movement_numbers.length ? ['PARENT_WORK_ONLY_NOT_MOVEMENT_PERFORMANCE'] : [])] }))
}

export const analyzeStoredProgram = ({ concert, image, ocr, attempt }) => {
  const lines = sourceLines(ocr)
  const sections = [], entries = []
  let mode = 'UNCERTAIN', reason = 'NO_PROGRAM_HEADING', section, composers = {}, currents = {}
  const context = checkProgramContext({ ...concert, dateFrom: concert.start_date, dateTo: concert.end_date }, ocr.raw_text)
  const partialDates = [...ocr.raw_text.matchAll(/(?:^|\s)(\d{1,2})\s*[.월/]\s*(\d{1,2})\s*(?:일|[.\s]|$)/g)].map((m) => `${m[1]}-${m[2]}`)
  const multiDate = new Set(partialDates).size > 1 || /series\s+overview|시리즈\s*전체|매월|총\s*\d+회|Session\s*[12]/i.test(ocr.raw_text)
  for (const line of lines) {
    const s = normalized(line.text).trim(), col = column(line, ocr.width)
    if (heading.test(s)) { mode = 'PROGRAM'; reason = 'EXPLICIT_PROGRAM_HEADING'; composers = {}; currents = {}; section = null }
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
    if (currents[col] && !composerBoundary && !found.length && !typeIn(s) && (
      tempo.test(s) || /악장|\bmovements?\b|^\s*[IVX]+[.)]/i.test(s) || musicalKeysIn(s).length
      || /^\s*(?:no|nr)\.?\s*\d+\s*$/i.test(s)
      || /편곡|발췌|\barr\.|arranged|transcription|excerpt|four\s+hands|two\s+pianos/i.test(s)
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
    if ((workLine(s, Boolean(parent?.strong)) || detachedTitle || (numberedTitle(s) && (parent || mode==='PROGRAM'))) && !heading.test(s)) {
      // Standalone opus/key/movement rows extend the preceding work in the SAME column only.
      if (/^\s*(?:(?:op|bwv|k|kv|s|d)\.?\s*\d|in\s+[a-g]\b|제?\s*\d+\s*악장)/i.test(s) && currents[col]) {
        currents[col].lines.push(line); continue
      }
      const entry = { section_index: section.index, composer: found[0] || parent?.name || null,
        lines: parent && !found.length ? [parent.line, line] : [line], composer_line: !found.length ? parent?.line : null, workLine: line, col }
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
  const candidates = boundedEntries.flatMap((entry) => {
    const identity = { ...extractIdentity(entry.lines.map((l) => l.text).join('\n')), title: normalized(entry.workLine.text) }
    if (entry.boundary) {
      const {number_line,reasons,preserve_movements,...boundary}=entry.boundary
      Object.assign(identity,boundary,{title:normalized(boundary.title),movement_numbers:preserve_movements?identity.movement_numbers:[],
        reasons:[...new Set([...identity.reasons,...reasons])]})
    }
    const section = sections[entry.section_index]
    const contextReasons = [...(!context.verified ? [`CONTEXT_${context.conflict.toUpperCase()}`] : []), ...(scopeUncertain ? ['MULTIPLE_DATES_OR_SERIES_SCOPE'] : []),
      ...(section.classification === 'UNCERTAIN' ? ['UNCERTAIN_PROGRAM_SECTION'] : [])]
    return matchIdentity(identity, entry.composer).map((m) => {
      const evidenceItems = entry.lines.map((l) => evidence(l, l === entry.workLine ? 'WORK' : l===entry.boundary?.number_line ? 'NUMBER' : l===entry.composer_line || isComposerHeading(normalized(l.text)) ? 'COMPOSER' : 'SCOPE'))
      const value = { ...m, identity: { ...identity, composer: entry.composer }, section_index: entry.section_index,
        evidence: evidenceItems, review_status: 'REVIEW_REQUIRED', review_reasons: [...m.reasons, ...contextReasons],
        generation_reasons: [section.reason, ...m.reasons] }
      return { ...value, candidate_key: hashJson({ track: m.track_id, evidence: evidenceItems.map((e) => [e.start, e.end]), relation: m.relation }) }
    })
  })
  if (!entries.length) for (const section of sections) {
    if (section.classification === 'UNCERTAIN') { section.classification = 'NON_PROGRAM'; section.reason = 'NO_IDENTIFIABLE_WORK_LIST'; }
  }
  const result = { ocr_result_id: ocr.id, image_id: image.id, concert_id: concert.id, image_revision: image.evidence_revision || 0,
    concert_revision: concert.program_context_revision || 0,
    source_attempt_id: attempt?.id,
    concert_context: concertContext(concert), matcher_version: MATCHER_VERSION, catalog_hash: CATALOG_HASH,
    sections, candidates, limitations: ['Stored OCR snapshot only; current URL bytes have not been checked.',
      ...(scopeUncertain ? ['Multiple sessions/dates: work-to-session association requires manual review.'] : [])] }
  return { ...result, payload_hash: hashJson(result) }
}
