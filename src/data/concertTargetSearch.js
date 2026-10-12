import { concerts } from './concerts.js'
import { getTrackTarget } from './workCatalog.js'
import { isUpcomingConcert } from './concertRecommendations.js'
export const concertFitsQuery = (concert, query, now = Date.now()) => {
  const from = concert.dateFrom || concert.startsAt?.slice(0, 10)
  const to = concert.dateTo || concert.endsAt?.slice(0, 10) || from
  return isUpcomingConcert(concert, now) && (query.region === '전국' || concert.region === query.region) && from <= query.to && to >= query.from
}
export const getRegisteredTargetConcerts = (query, now = Date.now()) => {
  const target = getTrackTarget(query.targetTrackId)
  if (!target) return []
  return concerts.filter((concert) => concertFitsQuery(concert, query, now) && concert.programWorkIds.includes(target.workId)).filter((concert) => {
    const scope = concert.programScopes?.[target.workId]
    return scope?.kind !== 'movement-excerpt' || !target.movementNumber || scope.movementNumbers.includes(target.movementNumber)
  }).map((concert) => ({ ...concert, targetMatch: { status: 'matched', targetTrackId: target.trackId, workId: target.workId, attempted: true, completed: true,
    scope: concert.programScopes?.[target.workId] || { kind: 'work', movementNumbers: [] }, evidence: concert.sourceUrl,
    reason: target.movementNumber ? '공식 프로그램에 해당 작품 포함 · 선택한 악장의 연주 확정 안내는 아니에요.' : '공식 프로그램에 대상 작품이 포함돼요.' } }))
}
