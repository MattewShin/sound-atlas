import { concertWorks, concerts } from './concerts.js'
import { emotionLabel, isFullyRated } from './emotions.js'
import { cosineSimilarity, emotionVector, getEmotionFit, getLibraryPreferenceProfile, getRecommendationResult, getSelectedEmotionKeys } from './recommendations.js'

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export const formatConcertDate = (value) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value))

export const getConcertTicketStatus = (concert, now = Date.now()) => {
  if (!concert.ticketOpensAt) return concert.saleState === '예정' ? '예매 오픈 예정 · 시간은 공식 페이지에서 확인' : '예매 현황은 공식 페이지에서 확인'
  if (Number(now) >= Date.parse(concert.endsAt)) return '공연 종료'
  if (Number(now) >= Date.parse(concert.startsAt)) return '공연 시작 시각 경과'
  return Number(now) < Date.parse(concert.ticketOpensAt)
    ? '예매 오픈 예정' : '예매 현황은 공식 페이지에서 확인'
}

export const resolveConcertProgram = (concert, trackList, works = concertWorks) => [...new Set(concert.programWorkIds || [])]
  .map((id) => works[id]).filter(Boolean).map((work) => {
    const explicitIds = new Set(work.trackIds)
    const linkedTracks = [...new Map(trackList.filter((track) => explicitIds.has(track.id)
      || track.workId === work.id
      || (track.composer === work.composer && track.type === work.type && track.number === work.number
        && (work.opus != null || work.catalogue != null) && track.opus === work.opus
        && (track.opusPart || null) === (work.opusPart || null) && (track.opusSuffix || '') === (work.opusSuffix || '')
        && (track.catalogue || null) === (work.catalogue || null) && (track.catalogueNumber || null) === (work.catalogueNumber || null)))
      .map((track) => [track.id, track])).values()]
      .sort((a, b) => (a.movementNumber ?? 0) - (b.movementNumber ?? 0))
    const scope = concert.programScopes?.[work.id]
    const performedTracks = scope?.kind === 'movement-excerpt' ? linkedTracks.filter(({ movementNumber }) => scope.movementNumbers.includes(movementNumber)) : linkedTracks
    return { ...work, linkedTracks: performedTracks, ratedTracks: performedTracks.filter(isFullyRated) }
  })

// 매 호출 시 전달받은 실제 곡 평가에서 계산합니다. 작품당 평균만 반영합니다.
export const analyzeConcert = (concert, trackList, { mode = 'keyword', selectedKeys = [], savedTrackIds = [] } = {}, works = concertWorks) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  const savedIds = new Set(savedTrackIds)
  const profile = getLibraryPreferenceProfile(trackList, savedTrackIds)
  const canAnalyze = concert.programStatus === 'verified'
  const program = (canAnalyze ? resolveConcertProgram(concert, trackList, works) : []).map((work) => {
    const matchedIds = new Set(keys.length ? getRecommendationResult(work.ratedTracks, keys).tracks.map(({ id }) => id) : [])
    const matches = work.ratedTracks.filter(({ id }) => matchedIds.has(id)).map((track) => ({
      track, emotions: keys.filter((key) => track.emotionScores[key] >= 3)
        .map((key) => ({ key, label: emotionLabel(key), score: track.emotionScores[key] })),
    }))
    const savedTracks = work.linkedTracks.filter(({ id }) => savedIds.has(id))
    return {
      ...work, matches, savedTracks,
      emotionFit: keys.length ? average(work.ratedTracks.map((track) => getEmotionFit(track, keys))) : null,
      libraryFit: profile.isActive ? average(work.ratedTracks.map((track) => cosineSimilarity(emotionVector(track), profile.vector))) : null,
    }
  })
  const analyzedWorks = program.filter(({ ratedTracks }) => ratedTracks.length)
  const directWorks = program.filter(({ savedTracks }) => savedTracks.length)
  const emotionalWorks = analyzedWorks.filter(({ matches }) => matches.length)
  const isLibrary = mode === 'library'
  const isRecommended = isLibrary ? directWorks.length > 0 || (profile.isActive && analyzedWorks.length > 0) : emotionalWorks.length > 0
  const reasons = isLibrary ? directWorks.map((work) => `보관한 ${work.savedTracks.map((track) => track.movement || track.title).join('·')}이 프로그램의 ${work.title}와 직접 연결돼요.`)
    : emotionalWorks.flatMap((work) => work.matches.map(({ track, emotions }) => `${work.title} ${track.movement || ''}: ${emotions.map(({ label, score }) => `${label} ${score}/5`).join(' · ')}로 평가했어요.`))
  if (isLibrary && !reasons.length && profile.isActive && analyzedWorks.length) reasons.push('보관한 곡의 감정 성향과 분석된 작품의 평가를 비교했어요. 프로그램에 직접 연결된 보관곡은 없어요.')
  if (!canAnalyze) reasons.push('연주 프로그램과 기존 곡의 연결을 확인한 뒤 감정·보관함 기반 추천에 사용할 수 있어요.')
  if (!reasons.length) reasons.push(isLibrary
    ? '보관곡과 연결할 근거가 부족해 일반 공연 정보로 보여드려요.'
    : keys.length ? '선택한 감정이 3점 이상인 등록 악장이 없어 일반 공연 정보로 보여드려요.' : '감정을 선택하면 등록된 악장 평가로 공연을 살펴볼 수 있어요.')
  const scope = !canAnalyze ? '프로그램이 없거나 작품 연결을 확인하지 못해 일반 검색 결과로 표시해요. 취향 적합도는 계산하지 않았어요.' : analyzedWorks.length && ['text', 'ocr'].includes(concert.programVerification)
    ? `분석된 작품 기준 · 확보한 프로그램에서 정확히 연결한 ${analyzedWorks.length}작품의 등록 평가만 반영했어요. 미등록 작품이나 확인하지 못한 자료는 반영하지 않았어요.` : analyzedWorks.length
    ? `분석된 작품 기준 · ${analyzedWorks.map(({ title }) => title).join(', ')}. 프로그램 ${program.length}작품 중 ${analyzedWorks.length}작품의 등록된 평가만 반영했어요.`
    : '아직 분석하지 않은 작품으로 구성되어 있어 일반 공연 정보로 보여드려요.'
  return {
    concert, program, reasons, scope, isRecommended,
    hasDirectConnection: directWorks.length > 0,
    score: isRecommended ? average(analyzedWorks.map((work) => isLibrary ? work.libraryFit : work.emotionFit).filter((value) => value !== null)) : null,
  }
}

export const isUpcomingConcert = (concert, now = Date.now()) => concert.startsAt
  ? Date.parse(concert.startsAt) > Number(now)
  : concert.performanceStatus !== '공연완료' && Date.parse(`${concert.dateTo}T23:59:59.999+09:00`) > Number(now)

export const getConcertRecommendations = (trackList, options = {}, concertList = concerts, works = concertWorks) => [...new Map(concertList.map((concert) => [concert.id, concert])).values()]
  .filter((concert) => isUpcomingConcert(concert, options.now))
  .filter((concert) => !options.region || options.region === '전국' || concert.region === options.region)
  .map((concert) => analyzeConcert(concert, trackList, options, works))
  .sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended)
    || Number(b.hasDirectConnection) - Number(a.hasDirectConnection)
    || (b.score ?? 0) - (a.score ?? 0) || a.concert.id.localeCompare(b.concert.id))
