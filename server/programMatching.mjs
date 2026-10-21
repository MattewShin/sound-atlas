import { composerPatterns, composerIdentityText, workTypePatterns, workCatalog, getTrackTarget, musicalKeysIn } from '../src/data/workCatalog.js'
import { checkProgramContext } from './programContext.mjs'

const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
const heading = /^\s*[\[【]?(?:(?:전체|일부|full|complete|partial)\s*)?(?:프로그램|연주\s*곡목|곡목|program(?:me)?|[12]\s*부\s*(?:연주\s*곡목)?|part\s*[12]|오늘\s*연주할\s*작품)(?:\s|[\]】:：]|$)/i
const stop = /^\s*[\[【]?(?:프로필|출연진|출연자\s*소개|연주자\s*(?:소개|프로필)|작곡가\s*소개|공연\s*소개|연주\s*경력|수상\s*이력|음반\s*소개|예매|티켓|작품\s*해설|program\s+notes?|profile|biograph\w*|discography|awards?|career|artists?|performers?)(?:\s|[\]】:：]|$)/i
const partial = /일부\s*(?:프로그램|곡목)|프로그램(?:의)?\s*일부|partial\s+program|추후|미정|\bTBA\b|to be announced|and more|etc\.|외\s*\d*\s*곡|등(?:\s|$)|\.\.\.|…/i
const arrangement = /편곡|재편곡|\barr\.|\barranged\b|\btrans\.|transcription|four\s+hands|two\s+pianos|두\s*대의\s*피아노|네\s*손|피아노\s*(?:독주)?판|(?:violin|cello|flute|바이올린|첼로|플루트)\s*(?:sonata|소나타)/i
const biography = /수상|콩쿠르|데뷔|과거|지난\s*\d|연주한\s*경력|연주했|performed\s+(?:in|at)|previously/i
const namedComposer = /(?:[A-Z1]\.\s*)+(?:(?:de|van|von)\s+)?\p{Lu}[\p{L}-]+|^[가-힣]{2,6}\s*\(?\d{4}/u
const types = Object.entries(workTypePatterns)
const individuallyNumberedTypes = new Set(['etude', 'prelude', 'elegy', 'gymnopedie', 'liebestraum', 'impromptu', 'polonaise', 'nocturne', 'rhapsody', 'capriccio', 'intermezzo', 'romance', 'variations', 'seasons', 'kinderszenen', 'fantasiestucke', 'kreisleriana', 'annees-de-pelerinage', 'venezia-e-napoli', 'legend', 'consolation'])

export const extractProgram = (rawText) => {
  const text = normalize(rawText).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
  const lines = text.split(/\r?\n/)
  const sections = []
  let section = null
  for (const line of lines) {
    if (stop.test(line)) { section = null; continue }
    if (heading.test(line)) { section = { lines: [], explicitComplete: /전체|full|complete/i.test(line), title: line }; sections.push(section); continue }
    if (section) section.lines.push(line)
  }
  const entries = []
  const unparsedLines = []
  for (const source of sections) {
    let composer = null, composerLine = '', current = null
    for (const line of source.lines) {
      const composerText = composerIdentityText(line)
      const foundComposer = Object.entries(composerPatterns).find(([, pattern]) => pattern.test(composerText))?.[0]
      const typeMatch = types.find(([, pattern]) => pattern.test(line))
      const type = typeMatch?.[0]
      const prefix = typeMatch ? line.slice(0, line.search(typeMatch[1])).replace(/^\s*\d+[.)]?\s*/, '').trim() : line.trim()
      const otherName = !foundComposer && /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}|[가-힣]{2,8})(?:\s*\(\d{4}[^)]*\))?\s*$/.test(prefix) && !/^(?:piano|피아노)$/i.test(prefix)
        && (Boolean(typeMatch) || /\(\d{4}|^[A-Z][a-z]+\s+[A-Z][a-z]+|^(?:Schubert|Mozart|Schumann|Bach|Debussy|Prokofiev|Haydn|Handel|슈베르트|모차르트|슈만|바흐|드뷔시|프로코피예프|하이든|헨델)$/i.test(prefix))
      if (foundComposer) { composer = foundComposer; composerLine = line; current = null }
      else if (namedComposer.test(line) || otherName) { composer = null; composerLine = line; current = null }
      if (type) {
        // 한/영 반복 표기는 별도 근거로 유지하되 동일 작품 ID는 나중에 중복 제거합니다.
        current = { composer, type, signature: line, lines: composerLine && composerLine !== line ? [composerLine, line] : [line], biography: biography.test(line),
          conflictingComposers: Object.values(composerPatterns).filter((pattern) => pattern.test(composerText)).length > 1 }
        entries.push(current)
      } else if (current) {
        if (/^\s*(?:op\.?|s\.)\s*\d/i.test(line)) current.signature += ' ' + line
        else if (line.trim() && !numbersIn(line).length && !/^\s*(?:(?:IV|III|II|I)\s*[.)]|제?\s*\d+\s*악장|(?:movement|mov\.)\s*\d+|전곡|전\s*악장|발췌|intermission|휴식|인터미션|allegro|adagio|andante|largo|presto|moderato|lento|vivace|scherzo|rondo|in\s+[a-g]\s|[a-g]\s*(?:major|minor)|\d+\s*(?:min|분))/i.test(line)) unparsedLines.push(line)
        current.lines.push(line)
      } else if (line.trim() && !foundComposer && !namedComposer.test(line) && !/^(?:intermission|휴식|인터미션)\s*$/i.test(line.trim())) unparsedLines.push(line)
    }
  }
  const expandedEntries = entries.flatMap((entry) => {
    if (!individuallyNumberedTypes.has(entry.type) || numbersIn(entry.signature).length) return [entry]
    const numberedLines = entry.lines.filter((line) => numbersIn(line).length)
    if (!numberedLines.length) return [entry]
    const sharedLines = entry.lines.filter((line) => !numberedLines.includes(line))
    return numberedLines.map((line) => ({ ...entry, signature: `${entry.signature} ${line.trim()}`, lines: [...sharedLines, line] }))
  })
  const programText = sections.map((section) => section.lines.join('\n')).join('\n')
  return { version: 'program-text-1', programText, sectionFound: sections.length > 0,
    complete: sections.length > 0 && Boolean(programText.trim()) && !partial.test(sections.map((section) => section.title + '\n' + section.lines.join('\n')).join('\n')),
    explicitComplete: sections.some((section) => section.explicitComplete), entries: expandedEntries, unparsedLines }
}

const numbersIn = (text) => [...text.matchAll(/\b(?:nos?\.?|nr\.?)\s*(\d+)|제?\s*(\d+)\s*번/gi)].map((match) => Number(match[1] || match[2]))
const seasonMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const seasonNumbersIn = (text) => [
  ...[...text.matchAll(/(?:^|[^\d])(1[0-2]|[1-9])\s*월/g)].map((match) => Number(match[1])),
  ...seasonMonths.flatMap((month, index) => new RegExp(`\\b${month}\\b`, 'i').test(text) ? [index + 1] : []),
]
const aliasIn = (text, alias) => new RegExp(`(^|[^\\p{L}\\p{N}])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text)
const movementScope = (text) => {
  const numbers = [...text.matchAll(/제?\s*(\d+)\s*악장|(?:movement|mov\.)\s*(\d+)|\b(IV|III|II|I)\s*[.)]/gi)]
    .map((match) => Number(match[1] || match[2]) || ({ I: 1, II: 2, III: 3, IV: 4 })[match[3]?.toUpperCase()])
  const romanNumber = (value) => ({ I: 1, II: 2, III: 3, IV: 4 })[value.toUpperCase()]
  for (const match of text.matchAll(/(\d+)\s*[-~–]\s*(\d+)\s*악장|movements?\s+(\d+)\s*[-~–]\s*(\d+)|\b(IV|III|II|I)\s*\.?\s*[-~–]\s*(IV|III|II|I)\s*\./gi)) {
    const from = Number(match[1] || match[3]) || romanNumber(match[5])
    const to = Number(match[2] || match[4]) || romanNumber(match[6])
    if (from <= to && to <= 12) for (let number = from; number <= to; number += 1) numbers.push(number)
  }
  for (const match of text.matchAll(/(\d+(?:\s*[,·&]\s*\d+)+)\s*악장|movements?\s+(\d+(?:\s*(?:,|&|and)\s*\d+)+)/gi)) numbers.push(...(match[1] || match[2]).match(/\d+/g).map(Number))
  const complete = /전곡|전\s*악장|all\s+movements|complete\s+(?:work|sonata|concerto)/i.test(text)
  const excerpt = (numbers.length > 0 || /발췌|only|excerpt|악장|\bmovements?\b/i.test(text)) && !complete
  return { kind: complete ? 'complete-work' : excerpt ? 'movement-excerpt' : 'work', movementNumbers: [...new Set(numbers)] }
}

export const identifyEntry = (entry, work) => {
  if (entry.type !== work.type || entry.biography) return { state: 'different' }
  if (!entry.composer) return { state: 'ambiguous', reason: '작곡가 정보가 부족해 작품을 확정할 수 없어요.' }
  if (entry.composer !== work.composer) return { state: 'different' }
  if (entry.conflictingComposers) return { state: 'ambiguous', reason: '한 작품 표기에 여러 작곡가가 섞여 추가 확인이 필요해요.' }
  const text = entry.signature
  if (work.bookNumber != null) {
    const roman = { I: 1, II: 2 }
    const books = [...text.matchAll(/제?\s*(\d+)\s*권|\b(?:book|volume|vol\.|livre)\s*(\d+|II|I)\b/gi)]
      .map(m => Number(m[1] || m[2]) || roman[m[2]?.toUpperCase()])
    if (books.length !== 1 || books[0] !== work.bookNumber) return {
      state: books.length === 1 ? 'different' : 'ambiguous', reason: '개별 권 번호를 확인해야 작품을 확정할 수 있어요.',
    }
  }
  if (/\b(?:no|nr)\.?\s*[Il](?=$|[\s,.;])/iu.test(text)) return { state: 'ambiguous', reason: '곡번호의 I/l 표기는 다른 식별 근거와 함께 다시 확인해야 해요.' }
  const aliases = Object.values(workCatalog).filter((candidate) => candidate.composer === work.composer && candidate.type === work.type && candidate.aliases.some((alias) => aliasIn(text, alias)))
  const numbers = [...numbersIn(text), ...(work.type === 'seasons' ? seasonNumbersIn(text) : [])]
  const explicitMonths = work.type === 'seasons' ? seasonNumbersIn(text) : []
  if (explicitMonths.length && !explicitMonths.includes(work.number)) return {
    state: aliases.some(({ id }) => id === work.id) ? 'ambiguous' : 'different',
    reason: '월명과 곡의 별칭이 서로 다른 달을 가리켜 확인해야 해요.',
  }
  const allOpus = [...text.matchAll(/\bop\.?\s*(\d+)([a-z]?)(?:\s*[-/]\s*(\d+))?/gi)]
  if (new Set(allOpus.map((match) => `${match[1]}${match[2] || ''}/${match[3] || ''}`)).size > 1) return { state: 'ambiguous', reason: '한 작품 표기에 서로 다른 작품번호가 섞여 있어 추가 확인이 필요해요.' }
  const op = allOpus[0]
  if (aliases.length && !aliases.some(({ id }) => id === work.id)) return Number(op?.[1]) === work.opus
    ? { state: 'ambiguous', reason: '별칭과 작품번호가 서로 다른 작품을 가리켜 확인해야 해요.' } : { state: 'different' }
  const catalogue = work.catalogue && text.match(new RegExp(`\\b${work.catalogue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?\\s*(\\d+)([a-z]?)`, 'i'))
  if (catalogue?.[2]) return { state: 'ambiguous', reason: '작품목록 번호의 접미사를 확인해야 해요.' }
  if (work.opus !== null && work.opus !== undefined) {
    if (!op) return { state: 'ambiguous', reason: aliases.length ? '별칭은 연결되지만 작품번호를 확인하지 못해 확정하지 않았어요.' : '작품번호가 없어 작품을 확정할 수 없어요.' }
    if (Number(op[1]) !== work.opus || (op[2] || '').toLowerCase() !== (work.opusSuffix || '')) {
      return { state: aliases.length || (['sonata', 'ballade', 'piano-concerto'].includes(work.type) && numbers.includes(work.number)) ? 'ambiguous' : 'different', reason: '곡번호·별칭과 작품번호의 조합을 확인해야 해요.' }
    }
    if (work.opusPart) {
      const part = op[3] ? Number(op[3]) : text.slice((op.index || 0) + op[0].length).match(/^\s*no\.?\s*(\d+)/i)?.[1]
      if (part && Number(part) !== work.opusPart) return { state: 'different' }
      if (!part && !numbers.includes(work.number)) return { state: 'ambiguous', reason: '작품번호의 하위 번호를 확인해야 해요.' }
      const ordinal = numbersIn(text.slice(0, op.index || 0))
      if (ordinal.length && !ordinal.includes(work.number)) return { state: 'ambiguous', reason: '소나타 번호와 작품번호의 하위 번호가 일치하지 않아요.' }
    }
  }
  if (work.catalogue) {
    const exactOpusAndNumber = Number(op?.[1]) === work.opus && numbers.includes(work.number)
    if (!catalogue && !exactOpusAndNumber) return { state: 'ambiguous', reason: '작품목록 번호를 확인해야 해요.' }
    if (catalogue && Number(catalogue[1]) !== work.catalogueNumber) return { state: 'different' }
  }
  const needsNumber = individuallyNumberedTypes.has(work.type) && work.number != null
  const needsOpusNumber = ['sonata', 'ballade', 'piano-concerto'].includes(work.type) && work.number != null
  const allSet = /전곡|complete|all\s+(?:etudes|preludes|impromptus|seasons)|(?:all|four|4|twelve|12)\s+(?:the\s+)?(?:impromptus|months|pieces)|전\s*(?:4|12)곡/i.test(text)
  const uniqueAlias = work.type === 'seasons' && !explicitMonths.length && aliases.length === 1 && aliases[0].id === work.id
  if (needsNumber && !numbers.includes(work.number) && !allSet && !uniqueAlias) {
    return { state: numbers.length ? 'different' : 'ambiguous', reason: '작품집의 개별 곡번호를 확인해야 해요.' }
  }
  if (needsOpusNumber && !numbers.includes(work.number)) return { state: 'ambiguous', reason: '작품번호와 곡번호를 모두 확인해야 해요.' }
  if (!needsNumber && numbers.length && !numbers.includes(work.number) && !work.opusPart) return { state: 'ambiguous', reason: '작품번호와 곡번호의 조합을 확인해야 해요.' }
  const evidence = entry.lines.join('\n').trim()
  const keys = musicalKeysIn(text)
  if (keys.length && work.musicalKeys?.length && keys.some((key) => !work.musicalKeys.includes(key))) return { state: 'ambiguous', reason: '표기된 조성이 작품 정보와 달라 추가 확인이 필요해요.', evidence }
  if (biography.test(evidence)) return { state: 'ambiguous', reason: '연주 경력 설명이 섞여 있어 이번 프로그램인지 확인해야 해요.' }
  if (arrangement.test(evidence)) return { state: 'ambiguous', reason: '편곡·다른 연주 편성 안내가 있어 원곡과의 관계를 확인해야 해요.', evidence }
  return { state: 'identified', evidence, scope: movementScope(evidence) }
}

export const getExtractedWorkLinks = (extraction) => {
  const links = new Map()
  for (const entry of extraction.entries) for (const work of Object.values(workCatalog)) {
    const identity = identifyEntry(entry, work)
    if (identity.state === 'identified') {
      const previous = links.get(work.id)
      // 작품 단위 안내가 하나라도 있으면 악장 발췌로 축소하지 않습니다.
      const scope = previous && previous.scope.kind !== 'movement-excerpt' ? previous.scope : identity.scope
      const combined = previous?.scope.kind === 'movement-excerpt' && scope.kind === 'movement-excerpt'
        ? { ...scope, movementNumbers: [...new Set([...previous.scope.movementNumbers, ...scope.movementNumbers])] } : scope
      links.set(work.id, { workId: work.id, scope: combined })
    }
  }
  return [...links.values()]
}

export const matchConcertToTrack = (concert, trackId) => {
  const target = getTrackTarget(trackId)
  if (!target) throw new Error('등록된 곡 ID를 선택해주세요.')
  const result = (status, reason, extra = {}) => ({ targetTrackId: trackId, workId: target.workId, status, reason, attempted: true, ...extra })
  const context = checkProgramContext(concert, concert.programEvidence?.text || '')
  if (!context.verified) return result('ambiguous', context.reason, { contextConflict: context.conflict })
  // 기존에 공식 출처로 확인한 연결만 그대로 사용합니다.
  if (concert.programStatus === 'verified' && !['text', 'ocr'].includes(concert.programVerification) && concert.programWorkIds?.includes(target.workId)) {
    const scope = concert.programScopes?.[target.workId] || { kind: 'work', movementNumbers: [] }
    if (scope.kind !== 'movement-excerpt' || !target.movementNumber || scope.movementNumbers.includes(target.movementNumber)) {
      return result('matched', target.movementNumber && scope.kind === 'work' ? '해당 작품 포함 · 선택한 악장 연주 범위는 별도 확인이 필요해요.' : '확인된 프로그램에 대상 작품이 포함돼요.', { scope, evidence: concert.sourceUrl })
    }
  }
  const evidence = concert.programEvidence || { text: '', imageUrls: [] }
  const extraction = concert.programExtraction || extractProgram(evidence.text)
  const hasImages = Boolean(evidence.imageUrls?.length)
  if (!extraction.sectionFound || !extraction.programText.trim()) {
    if (hasImages) return result('image-required', '소개 이미지의 프로그램 분석이 필요해요. 텍스트로 일치 여부를 확정하지 않았어요.')
    if (evidence.text.trim()) return result('ambiguous', '작품명이 언급되어도 현재 연주 프로그램 구역인지 확인하지 못해 추가 확인이 필요해요.')
    return result('no-material', '연주 프로그램 구역을 확보하지 못했어요. 대상 작품 불일치로 판단하지 않았어요.')
  }
  const identities = extraction.entries.map((entry) => identifyEntry(entry, target.work))
  const found = identities.filter(({ state }) => state === 'identified')
  if (found.some(({ scope }) => scope.kind === 'movement-excerpt' && !scope.movementNumbers.length)) return result('ambiguous', '발췌 안내는 있지만 어떤 악장을 연주하는지 확인하지 못했어요.')
  const included = found.find(({ scope }) => scope.kind !== 'movement-excerpt' || !target.movementNumber || scope.movementNumbers.includes(target.movementNumber))
  if (included) return result('matched', target.movementNumber && included.scope.kind === 'work'
    ? '해당 작품 포함 · 프로그램은 작품 단위이며 선택한 악장 연주 확정 안내는 아니에요.'
    : included.scope.kind === 'movement-excerpt' ? '프로그램에 안내된 악장 발췌 범위에 포함돼요.' : '프로그램 구역의 작곡가·작품번호·곡번호로 대상 작품을 확인했어요.', { evidence: included.evidence, scope: included.scope,
      evidenceSourceUrl: extraction.entries.find((entry) => identifyEntry(entry, target.work).evidence === included.evidence)?.evidenceSourceUrl,
      evidenceKind: extraction.entries.find((entry) => identifyEntry(entry, target.work).evidence === included.evidence)?.evidenceKind || 'text' })
  const uncertain = identities.find(({ state }) => state === 'ambiguous')
  if (uncertain) return result('ambiguous', uncertain.reason, { evidence: uncertain.evidence })
  if (!extraction.complete || (hasImages && !extraction.explicitComplete)) return result(hasImages ? 'image-required' : 'ambiguous',
    hasImages ? '텍스트에서 대상을 확인하지 못했지만 이미지 자료가 남아 있어 분석이 필요해요.' : '프로그램 일부 또는 미정 안내가 있어 불일치를 확정하지 않았어요.')
  if (!extraction.entries.length) return result('ambiguous', '프로그램 구역은 있지만 작품 식별 정보가 부족해요.')
  if (extraction.unparsedLines?.length) return result('ambiguous', '프로그램에서 식별하지 못한 구역이 남아 있어 대상 작품 불일치를 확정하지 않았어요.')
  return result('not-found', found.length ? '작품의 다른 악장 발췌만 안내되어 선택한 악장을 확인하지 못했어요.' : '확인한 프로그램 구역에서 대상 작품을 찾지 못했어요.')
}
