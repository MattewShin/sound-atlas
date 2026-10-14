const roman = (value) => ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 })[value.toUpperCase()]
export const programDates = (text) => [...String(text || '').matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)]
  .map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`)
export const programSeries = (text) => [...String(text || '').normalize('NFKC').matchAll(/(?:piano\s*)?(spectrum|스펙트럼|series|시리즈)\s*([IVX]+|\d+)(?=[.\s:;]|$)/gi)]
  .map((match) => ({ family: /spectrum|스펙트럼/i.test(match[1]) ? 'spectrum' : 'series', number: Number(match[2]) || roman(match[2]) }))
export const checkProgramContext = (concert, text) => {
  const from = concert.dateFrom || concert.startsAt?.slice(0, 10), to = concert.dateTo || from
  const expected = programSeries(concert.title)
  if (programSeries(text).some((item) => expected.some((other) => item.family === other.family && item.number !== other.number))) {
    return { verified: false, conflict: 'series', reason: '공연명과 프로그램의 시리즈 번호가 달라 추가 확인이 필요해요.' }
  }
  if (from && to && programDates(text).some((date) => date < from || date > to)) {
    return { verified: false, conflict: 'date', reason: '다른 날짜의 프로그램 표기가 있어 현재 공연의 자료인지 추가 확인이 필요해요.' }
  }
  const venue = String(text || '').match(/^\s*(?:장소|공연장|venue)\s*[:：]\s*(.+)$/mi)?.[1]
  const compact = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const expectedVenue = compact(concert.venue?.split('(')[0])
  if (venue && expectedVenue && !compact(venue).includes(expectedVenue) && !expectedVenue.includes(compact(venue))) {
    return { verified: false, conflict: 'venue', reason: '자료의 공연장 표기가 KOPIS 상세와 달라 추가 확인이 필요해요.' }
  }
  if (/시리즈\s*전체|예시\s*(?:프로그램|레퍼토리)|sample\s*(?:program|repertoire)|series\s*(?:overview|repertoire)/i.test(text)) {
    return { verified: false, conflict: 'repertoire', reason: '시리즈 전체 또는 예시 레퍼토리는 이번 공연의 연주 근거로 사용할 수 없어요.' }
  }
  return { verified: true }
}
