import { extractProgram, matchConcertToTrack, identifyEntry } from './programMatching.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { checkProgramContext } from './programContext.mjs'
const compact = (text) => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const dateValues = (text) => [...String(text).matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)]
  .map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`)
const roman = (text) => ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 })[text.toUpperCase()]
const series = (text) => [...String(text || '').normalize('NFKC').matchAll(/(?:piano\s*)?(spectrum|스펙트럼|series|시리즈)\s*([IVX]+|\d+)(?=[.\s:;]|$)/gi)]
  .map((match) => ({ family: /spectrum|스펙트럼/i.test(match[1]) ? 'spectrum' : 'series', number: Number(match[2]) || roman(match[2]) }))

export const checkImageContext = (concert, records) => {
  const dateFrom = concert.dateFrom || concert.startsAt?.slice(0, 10)
  const dateTo = concert.dateTo || dateFrom
  const expectedSeries = series(concert.title)
  const titleStem = compact(concert.title.split(/피아노|리사이틀|독주회|음악회|콘서트|recital|concert/i)[0].replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/의\s*$/, ''))
  const names = [titleStem, ...(concert.performers || '').split(/[,·/]/).map(compact)].filter((name) => name.length >= 3)
  const venue = compact(concert.venue?.split('(')[0])
  let posterConfirmed = false
  const roles = []
  for (const record of records) {
    if (concert.kopisDetailVerified && (record.concertId !== concert.kopisId || !concert.programEvidence?.imageUrls?.includes(record.sourceUrl))) {
      return { verified: false, reason: 'KOPIS 상세의 공연 ID와 소개 이미지 출처가 일치하지 않아 추가 확인이 필요해요.', roles, conflict: 'source' }
    }
    if (record.status !== 'completed') return { verified: false, reason: '읽지 못한 이미지가 남아 있어 연결 확인이 필요해요.', roles }
    const text = record.original.text
    if (record.role === 'program') {
      const programContext = checkProgramContext(concert, text)
      if (!programContext.verified) return { ...programContext, roles }
    }
    const dates = dateValues(text)
    const sourceId = record.sourceUrl.match(/PF[_-](PF\d+)/i)?.[1]
    if (sourceId && sourceId !== concert.kopisId) return { verified: false, reason: '이미지 출처의 공연 식별 정보가 다르게 표시돼 확인이 필요해요.', roles }
    const otherSeries = series(text)
    if (otherSeries.some((item) => expectedSeries.some((expected) => item.family === expected.family && item.number !== expected.number))) return { verified: false, reason: '공연명과 이미지의 시리즈 번호가 달라 연결 확인이 필요해요.', roles, conflict: 'series' }
    if (record.role === 'program' && dates.some((date) => date < dateFrom || date > dateTo)) return { verified: false, reason: '다른 날짜의 프로그램이 포함돼 현재 공연과의 연결 확인이 필요해요.', roles, conflict: 'date' }
    const identity = dates.some((date) => date >= dateFrom && date <= dateTo) && names.some((name) => compact(text).includes(name)) && venue.length >= 3 && compact(text).includes(venue)
    if (identity && record.original.confidence >= 70) posterConfirmed = true
    const biography = !record.original.extraction.sectionFound && (text.match(/수상|졸업|음악원|대학교|음반|교수|페스티벌|biography|graduate|university/gi) || []).length >= 2
    roles.push(record.role === 'program' ? 'program' : record.role === 'biography' || biography ? 'biography' : identity ? 'identity' : 'unknown')
  }
  if (!posterConfirmed) return { verified: false, reason: '이미지의 공연명·날짜·장소가 현재 공연에 해당하는지 연결 확인이 필요해요.', roles }
  if (roles.includes('unknown') || records.some((record) => record.reviewRequired)) return { verified: false, reason: '이미지 일부의 문맥이나 읽기 품질이 부족해 연결 확인이 필요해요.', roles }
  return { verified: true, roles, reason: 'KOPIS 자료 묶음의 공연명·날짜·장소와 프로그램 문맥을 확인했어요.' }
}

export const combineOcrProgram = (concert, records, { totalImages = records.length } = {}) => {
  const complete = records.length === totalImages && records.every((record) => record.status === 'completed')
  const context = checkImageContext(concert, records)
  const textExtraction = concert.programExtraction || extractProgram(concert.programEvidence?.text)
  const accepted = complete && context.verified ? records.flatMap((record) => record.verifiedEntries.map((entry) => ({ ...entry, evidenceSourceUrl: record.sourceUrl, evidenceKind: 'ocr' }))) : []
  const programRecords = records.filter((record) => record.role === 'program')
  const extraction = { ...textExtraction, entries: [...textExtraction.entries, ...accepted],
    sectionFound: textExtraction.sectionFound || accepted.length > 0,
    programText: [textExtraction.programText, ...programRecords.map((record) => record.original.extraction.programText)].filter(Boolean).join('\n'),
    complete: complete && context.verified && programRecords.length > 0 && programRecords.every((record) => record.original.extraction.complete && !record.original.extraction.unparsedLines.length && !record.reviewRequired),
    explicitComplete: false }
  return { ...concert, programExtraction: extraction,
    programOcr: { version: 'program-ocr-5', records, totalImages, processedImages: records.filter(({ status }) => status === 'completed').length, allProcessed: complete, context,
      coverageComplete: extraction.complete, acceptedEntries: accepted.length },
  }
}
export const matchAnalyzedConcert = (concert, trackId) => {
  const result = matchConcertToTrack(concert, trackId)
  if (concert.programOcr && !concert.programOcr.context.verified) {
    const failed = concert.programOcr.records.some(({ status }) => status === 'failed')
    return { ...result, status: failed ? 'failed' : 'needs-review', reason: concert.programOcr.context.reason,
      completed: concert.programOcr.allProcessed, retryable: failed, diagnostic: 'ocr-context-unconfirmed' }
  }
  if (result.status === 'matched') return { ...result, completed: true, reason: result.evidenceKind === 'ocr'
    ? '프로그램 이미지에서 작곡가·곡번호·작품번호와 공연 정보를 확인해 대상 작품을 연결했어요.' + (result.scope?.kind === 'work' && /-m\d+$/.test(trackId) ? ' 작품 단위 안내이며 선택한 악장 연주 확정은 아니에요.' : '') : result.reason }
  if (concert.programOcr) {
    const target = getTrackTarget(trackId)
    const uncertain = concert.programOcr.records.some((record) => record.original?.extraction.entries.some((entry) => identifyEntry(entry, target.work).state === 'ambiguous'))
    if (uncertain) return { ...result, status: 'needs-review', completed: concert.programOcr.allProcessed, reason: 'OCR 원문의 작품번호·곡번호 또는 연주 범위가 모호해 연결 확인이 필요해요.' }
    if (!concert.programOcr.allProcessed) return { ...result, status: 'needs-review', completed: false, reason: '모든 관련 이미지를 읽지 못해 연결 확인이 필요해요.' }
    if (concert.programOcr.coverageComplete && !['ambiguous'].includes(result.status)) return { ...result, status: 'not-found', completed: true, reason: '확인한 프로그램 자료 범위에서 대상 작품을 찾지 못했어요.' }
    if (!concert.programOcr.records.some(({ role }) => role === 'program') && !concert.programEvidence?.text) return { ...result, status: 'no-material', completed: true, reason: '소개 자료를 읽었지만 연주 프로그램 구역을 확보하지 못했어요.' }
    return { ...result, status: 'needs-review', completed: true, reason: '프로그램의 식별 정보나 읽지 못한 곡목 때문에 연결 확인이 필요해요.', diagnostic: result.status }
  }
  return { ...result, completed: true, status: ['ambiguous', 'image-required'].includes(result.status) ? 'needs-review' : result.status, diagnostic: result.status }
}
