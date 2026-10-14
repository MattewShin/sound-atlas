import { emotionKeys, isFullyRated, normalizeScore } from './emotions.js'
import { getRecentExposureCount, RECOMMENDATION_EXPOSURE_PENALTY } from './recommendationExposure.js'

const stableIdOrder = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
export const getSelectedEmotionKeys = (selectedKeys = []) => [...new Set(selectedKeys)].filter((key) => emotionKeys.includes(key))
export const getEmotionFit = (track, selectedKeys = []) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  return isFullyRated(track) && keys.length
    ? keys.reduce((sum, key) => sum + normalizeScore(track.emotionScores[key]), 0) / keys.length : 0
}
export const emotionVector = (track) => emotionKeys.map((key) => normalizeScore(track.emotionScores[key]))
export const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 9 || b.length !== 9 || [...a, ...b].some((value) => !Number.isFinite(value))) return 0
  const norm = Math.hypot(...a) * Math.hypot(...b)
  if (!norm) return 0
  return Math.min(1, Math.max(0, a.reduce((sum, value, i) => sum + value * b[i], 0) / norm))
}
export const getLibraryPreferenceProfile = (trackList, savedTrackIds = []) => {
  const requestedIds = new Set(savedTrackIds)
  const savedTracks = [...new Map(trackList.filter((track) => requestedIds.has(track.id) && isFullyRated(track)).map((track) => [track.id, track])).values()]
  const vector = emotionKeys.map((key) => savedTracks.length
    ? savedTracks.reduce((sum, track) => sum + normalizeScore(track.emotionScores[key]), 0) / savedTracks.length : 0)
  const highest = Math.max(...vector)
  return {
    isActive: highest > 0, count: savedTracks.length,
    savedIdSet: new Set(savedTracks.map(({ id }) => id)), vector,
    emotionProfile: Object.fromEntries(emotionKeys.map((key, i) => [key, vector[i]])),
    topEmotions: highest > 0 ? emotionKeys.filter((_, i) => vector[i] === highest) : [],
  }
}
export const getRecommendationResult = (trackList, selectedKeys = [], preferenceProfile = null) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  const candidates = trackList.filter(isFullyRated).filter((track) => keys.length === 0 || keys.some((key) => track.emotionScores[key] >= 3))
  const fit = (track) => getEmotionFit(track, keys)
  const matchCount = (track) => keys.filter((key) => track.emotionScores[key] >= 3).length
  const similarity = (track) => preferenceProfile?.isActive ? cosineSimilarity(emotionVector(track), preferenceProfile.vector) : 0
  const rankedTracks = [...candidates].sort((a, b) => fit(b) - fit(a) || matchCount(b) - matchCount(a) || similarity(b) - similarity(a) || stableIdOrder(a, b))
  return {
    tracks: rankedTracks,
    topScoreTracks: rankedTracks.filter((track) => fit(track) === fit(rankedTracks[0])),
    isPersonalized: Boolean(preferenceProfile?.isActive), hasFewCandidates: candidates.length < 3,
  }
}
// 선택 시 만든 난수를 전달해 일반 화면 갱신에는 대표곡을 유지합니다.
const pickRandomCandidate = (candidates, randomValue) => {
  if (candidates.length === 0) return undefined
  const draw = Number.isFinite(randomValue) ? Math.max(0, Math.min(1, randomValue)) : 0
  return candidates[Math.min(candidates.length - 1, Math.floor(draw * candidates.length))]
}
export const pickRandomTopRecommendation = (result, randomValue) => pickRandomCandidate(result.topScoreTracks, randomValue)

export const KEYWORD_RECOMMENDATION_POLICY = Object.freeze({
  minimumScore: 3,
  minimumMultiAverage: 3,
  minimumMultiScore: 2.5,
  singleScoreWindow: 1,
  preciseBalancedWindow: 1,
  explorationBalancedWindow: 1.75,
  hiddenDominanceMinimum: 0.75,
  diversifiedCount: 5,
  highCount: 3,
})

export const getKeywordMetrics = (track, selectedKeys) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  const selectedScores = keys.map((key) => track.emotionScores?.[key]).filter(Number.isFinite)
  if (!keys.length || selectedScores.length !== keys.length) return null
  const unselectedScores = emotionKeys.filter((key) => !keys.includes(key)).map((key) => track.emotionScores?.[key]).filter(Number.isFinite)
  const average = selectedScores.reduce((sum, score) => sum + score, 0) / selectedScores.length
  const minimum = Math.min(...selectedScores)
  const unselectedAverage = unselectedScores.length ? unselectedScores.reduce((sum, score) => sum + score, 0) / unselectedScores.length : average
  return {
    average,
    minimum,
    balancedFit: keys.length > 1 ? average * 0.7 + minimum * 0.3 : average,
    dominance: average - unselectedAverage,
    matchCount: selectedScores.filter((score) => score >= 3).length,
  }
}

const exposureMultiplier = (track, options = {}) => {
  if (new Set(options.exemptTrackIds || []).has(track.id)) return 1
  const count = getRecentExposureCount(options.exposures || [], options.conditionKey || '', track.id)
  return 1 / (1 + count * RECOMMENDATION_EXPOSURE_PENALTY)
}

export const getKeywordCandidateGroups = (result, selectedKeys, options = {}) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  if (!keys.length) return { high: [], hidden: [], discovery: [], eligible: [], metricsById: new Map() }
  const metricsById = new Map(result.tracks.map((track) => [track.id, getKeywordMetrics(track, keys)]))
  const eligible = result.tracks.filter((track) => {
    const metrics = metricsById.get(track.id)
    return keys.length === 1 ? metrics.average >= KEYWORD_RECOMMENDATION_POLICY.minimumScore
      : metrics.average >= KEYWORD_RECOMMENDATION_POLICY.minimumMultiAverage && metrics.minimum >= KEYWORD_RECOMMENDATION_POLICY.minimumMultiScore
  })
  const highestScore = Math.max(0, ...eligible.map((track) => metricsById.get(track.id).average))
  const precise = eligible.filter((track) => keys.length === 1 || metricsById.get(track.id).minimum >= KEYWORD_RECOMMENDATION_POLICY.minimumScore)
  const highestPreciseFit = Math.max(0, ...precise.map((track) => metricsById.get(track.id).balancedFit))
  const highestBalancedFit = Math.max(0, ...eligible.map((track) => metricsById.get(track.id).balancedFit))
  const high = precise.filter((track) => keys.length === 1
    ? metricsById.get(track.id).average >= Math.max(KEYWORD_RECOMMENDATION_POLICY.minimumScore, highestScore - KEYWORD_RECOMMENDATION_POLICY.singleScoreWindow)
    : metricsById.get(track.id).balancedFit >= highestPreciseFit - KEYWORD_RECOMMENDATION_POLICY.preciseBalancedWindow)
  const hidden = eligible.filter((track) => metricsById.get(track.id).dominance >= KEYWORD_RECOMMENDATION_POLICY.hiddenDominanceMinimum)
  const discovery = eligible.filter((track) => metricsById.get(track.id).balancedFit
    >= highestBalancedFit - KEYWORD_RECOMMENDATION_POLICY.explorationBalancedWindow)
    .sort((a, b) => getRecentExposureCount(options.exposures || [], options.conditionKey || '', a.id)
      - getRecentExposureCount(options.exposures || [], options.conditionKey || '', b.id)
      || result.tracks.indexOf(a) - result.tracks.indexOf(b))
  return { high, hidden, discovery, eligible, metricsById }
}

export const getKeywordRecommendationCandidates = (result, selectedKeys) => {
  const groups = getKeywordCandidateGroups(result, selectedKeys)
  const preferredIds = new Set(groups.high.map(({ id }) => id))
  const candidates = [...groups.high]
  for (const pool of [groups.discovery, groups.eligible]) for (const track of pool) {
    if (candidates.length >= 2 || preferredIds.has(track.id)) continue
    preferredIds.add(track.id); candidates.push(track)
  }
  return candidates
}

const weightedPick = (candidates, weight, randomValue) => {
  if (!candidates.length) return undefined
  const weights = candidates.map((track) => Math.max(0.001, weight(track)))
  const total = weights.reduce((sum, value) => sum + value, 0)
  const draw = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999999, randomValue)) : 0
  let cursor = draw * total
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index]
    if (cursor < 0) return candidates[index]
  }
  return candidates.at(-1)
}

const seededRandom = (seed) => {
  let state = ((Number.isFinite(seed) ? seed : 0.5) * 0xffffffff) >>> 0
  return () => { state = (Math.imul(state || 1, 1664525) + 1013904223) >>> 0; return state / 0x100000000 }
}

export const getKeywordRecommendationWeight = (track, selectedKeys, groups, options = {}) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  const metrics = groups.metricsById.get(track.id) || getKeywordMetrics(track, keys)
  const fitWeight = keys.length === 1 ? Math.max(1, metrics.average - 2) ** 2
    : Math.max(1, metrics.balancedFit - 1.5) ** 2 * (metrics.minimum >= 3 ? 1.25 : 0.72)
  return fitWeight * exposureMultiplier(track, options)
}

export const pickRandomKeywordRecommendation = (result, selectedKeys, randomValue, previousTrackId, options = {}) => {
  const groups = getKeywordCandidateGroups(result, selectedKeys, options)
  const candidates = getKeywordRecommendationCandidates(result, selectedKeys)
  const available = candidates.length > 1 ? candidates.filter(({ id }) => id !== previousTrackId) : candidates
  return weightedPick(available, (track) => getKeywordRecommendationWeight(track, selectedKeys, groups, options), randomValue)
}

export const getDiversifiedKeywordRecommendations = (result, selectedKeys, options = {}) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  if (!keys.length) return { tracks: result.tracks, categories: new Map() }
  const groups = getKeywordCandidateGroups(result, keys, options)
  const random = typeof options.random === 'function' ? options.random : seededRandom(options.randomValue)
  const selected = [], selectedIds = new Set(), categories = new Map()
  const addFrom = (pool, count, category, weight) => {
    for (let index = 0; index < count; index += 1) {
      const available = pool.filter(({ id }) => !selectedIds.has(id))
      if (!available.length) break
      const track = weightedPick(available, weight, random())
      selected.push(track); selectedIds.add(track.id); categories.set(track.id, category)
    }
  }
  const standardWeight = (track) => getKeywordRecommendationWeight(track, keys, groups, options)
  addFrom(groups.high, KEYWORD_RECOMMENDATION_POLICY.highCount, 'high', standardWeight)
  addFrom(groups.hidden, 1, 'hidden', (track) => (1 + Math.max(0, groups.metricsById.get(track.id).dominance)) * exposureMultiplier(track, options))
  addFrom(groups.discovery, 1, 'discovery', (track) => standardWeight(track) * exposureMultiplier(track, options))
  for (const [pool, category] of [[groups.high, 'high'], [groups.hidden, 'hidden'], [groups.discovery, 'discovery'], [groups.eligible, 'high']]) {
    if (selected.length >= KEYWORD_RECOMMENDATION_POLICY.diversifiedCount) break
    addFrom(pool, KEYWORD_RECOMMENDATION_POLICY.diversifiedCount - selected.length, category, standardWeight)
  }
  const baseOrder = new Map(result.tracks.map((track, index) => [track.id, index]))
  const remainder = groups.eligible.filter(({ id }) => !selectedIds.has(id)).sort((a, b) => {
    const aMetrics = groups.metricsById.get(a.id), bMetrics = groups.metricsById.get(b.id)
    const aExposure = getRecentExposureCount(options.exposures || [], options.conditionKey || '', a.id)
    const bExposure = getRecentExposureCount(options.exposures || [], options.conditionKey || '', b.id)
    return (bMetrics.balancedFit - bExposure * 0.35) - (aMetrics.balancedFit - aExposure * 0.35)
      || baseOrder.get(a.id) - baseOrder.get(b.id)
  })
  return { tracks: [...selected, ...remainder], categories }
}

export const getFeelingRecommendationCandidates = (result, selectedKeys) => {
  const keys = getSelectedEmotionKeys(selectedKeys)
  if (!keys.length || !result.tracks.length) return []
  // 원점수 평균 1점 차이는 정규화된 평균에서 0.25입니다.
  const minimumFit = getEmotionFit(result.tracks[0], keys) - 0.25
  return result.tracks.filter((track) => keys.every((key) => track.emotionScores[key] >= 3)
    && getEmotionFit(track, keys) >= minimumFit)
}
export const pickRandomFeelingRecommendation = (result, selectedKeys, randomValue, previousTrackId) => {
  const candidates = getFeelingRecommendationCandidates(result, selectedKeys)
  const available = candidates.length > 1 ? candidates.filter(({ id }) => id !== previousTrackId) : candidates
  return pickRandomCandidate(available, randomValue)
}
export const getLibraryRecommendations = (trackList, profile) => !profile?.isActive ? [] : trackList
  .filter((track) => isFullyRated(track) && !profile.savedIdSet.has(track.id))
  .sort((a, b) => cosineSimilarity(emotionVector(b), profile.vector) - cosineSimilarity(emotionVector(a), profile.vector) || stableIdOrder(a, b))
