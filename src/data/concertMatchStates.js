export const CONCERT_PROGRAM_BATCH_SIZE = 5
export const INITIAL_CONCERT_CHECK_LIMIT = 10
export const matchLabels = {
  pending: '아직 미확인', processing: '프로그램 확인 중', matched: '대상 작품 포함 확인',
  'needs-review': '추가 확인이 필요한 공연', 'no-material': '프로그램 자료 없음',
  failed: '자료 처리 실패', 'not-found': '확인 범위 내 불일치',
}
export const getMatchStatus = (match) => Object.hasOwn(matchLabels, match?.status) ? match.status
  : ['ambiguous', 'image-required'].includes(match?.status) ? 'needs-review' : 'pending'
export const getMatchProgress = (concerts = []) => {
  const counts = Object.fromEntries(Object.keys(matchLabels).map((key) => [key, 0]))
  for (const concert of concerts) counts[getMatchStatus(concert.targetMatch)] += 1
  const attempted = concerts.filter((concert) => concert.targetMatch?.attempted).length
  const completed = concerts.filter(({ targetMatch }) => targetMatch?.completed === true || (targetMatch?.completed === undefined && ['matched', 'not-found', 'no-material'].includes(getMatchStatus(targetMatch)))).length
  return { total: concerts.length, ...counts, attempted, checked: attempted, completed,
    unresolved: counts.pending + counts.processing + counts['needs-review'] + counts['no-material'] + counts.failed }
}
