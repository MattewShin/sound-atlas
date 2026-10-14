import { concerts } from './concerts.js'
import { composerPatterns, getTrackTarget } from './workCatalog.js'
import { isUpcomingConcert } from './concertRecommendations.js'

const pianoPattern = /피아노|피아니스트|piano|pianist|건반|keyboard|klavier/i
const otherInstrumentRecitalPattern = /(?:바이올린|비올라|첼로|플루트|색소폰|클라리넷|오보에|바순|호른|트럼펫|트롬본|튜바|하프|기타|오르간|violin|viola|cello|flute|saxophone|clarinet|oboe|bassoon|horn|trumpet|trombone|tuba|harp|guitar|organ)\s*(?:독주회|리사이틀|recital)/i
const recitalPattern = /독주회|리사이틀|recital/i

export const getTargetConcertRelevance = (concert, query) => {
  const target = getTrackTarget(query.targetTrackId)
  if (!target) return { score: 0, similar: false }
  const title = String(concert.title || '')
  const hasPiano = pianoPattern.test(title)
  const hasOtherInstrumentRecital = otherInstrumentRecitalPattern.test(title)
  let score = 0
  if (composerPatterns[target.work.composer]?.test(title)) score += 6
  if (target.work.aliases?.some((alias) => title.toLocaleLowerCase().includes(alias.toLocaleLowerCase()))) score += 5
  if (hasPiano) score += 4
  if (hasPiano && recitalPattern.test(title)) score += 2
  if (hasOtherInstrumentRecital && !hasPiano) score -= 10
  return { score, similar: score > 0 && !(hasOtherInstrumentRecital && !hasPiano) }
}
export const concertFitsQuery = (concert, query, now = Date.now()) => {
  const from = concert.dateFrom || concert.startsAt?.slice(0, 10)
  const to = concert.dateTo || concert.endsAt?.slice(0, 10) || from
  return isUpcomingConcert(concert, now) && (!concert.kopisId || !concert.genre || concert.genre === '서양음악(클래식)')
    && (!concert.performanceStatus || ['공연예정', '공연중'].includes(concert.performanceStatus))
    && (query.region === '전국' || concert.region === query.region) && from <= query.to && to >= query.from
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
export const prioritizeRegisteredTargetConcerts = (candidates, query, now = Date.now()) => {
  const preferred = new Set(getRegisteredTargetConcerts(query, now).map(({ kopisId }) => kopisId).filter(Boolean))
  return candidates.map((concert, index) => ({ concert, index, relevance: getTargetConcertRelevance(concert, query).score })).sort((a, b) =>
    Number(!preferred.has(a.concert.kopisId)) - Number(!preferred.has(b.concert.kopisId))
    || b.relevance - a.relevance || a.index - b.index).map(({ concert }) => concert)
}

export const getSimilarTargetConcerts = (candidates, query, now = Date.now()) => prioritizeRegisteredTargetConcerts(candidates, query, now)
  .filter((concert) => concert.targetMatch?.status !== 'matched' && getTargetConcertRelevance(concert, query).similar)
