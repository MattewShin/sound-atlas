export const CONCERT_PROGRAM_BATCH_SIZE = 5
export const INITIAL_CONCERT_CHECK_LIMIT = 10
export const matchLabels = {
  pending: '상세정보 조회 대기', processing: '프로그램 분석 중', 'image-required': '이미지 OCR 필요', matched: '작품 포함 확인',
  'needs-review': '추가 확인이 필요한 공연', 'no-material': '프로그램 자료 없음',
  failed: '분석 실패', 'not-found': '확인 범위 내 작품 불일치',
}
export const getMatchStatus = (match) => Object.hasOwn(matchLabels, match?.status) ? match.status
  : match?.status === 'ambiguous' ? 'needs-review' : 'pending'
export const getMatchProgress = (concerts = []) => {
  concerts = [...new Map(concerts.map((concert, index) => [concert.kopisId || concert.id || index, concert])).values()]
  const counts = Object.fromEntries(Object.keys(matchLabels).map((key) => [key, 0]))
  for (const concert of concerts) counts[getMatchStatus(concert.targetMatch)] += 1
  const attempted = concerts.filter((concert) => concert.targetMatch?.attempted).length
  const completed = concerts.filter(({ targetMatch }) => targetMatch?.completed === true || (targetMatch?.completed === undefined && ['matched', 'not-found', 'no-material'].includes(getMatchStatus(targetMatch)))).length
  return { total: concerts.length, ...counts, attempted, checked: attempted, completed,
    unconfirmed: counts.pending + counts.processing + counts['image-required'],
    needsReview: counts['needs-review'] + counts['no-material'] + counts.failed,
    unresolved: counts.pending + counts.processing + counts['image-required'] + counts['needs-review'] + counts['no-material'] + counts.failed }
}
