import { emotionKeys, isFullyRated, normalizeScore } from './emotions.js'

const stableIdOrder = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
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
  const keys = [...new Set(selectedKeys)].filter((key) => emotionKeys.includes(key))
  const candidates = trackList.filter(isFullyRated).filter((track) => keys.length === 0 || keys.some((key) => track.emotionScores[key] >= 3))
  const fit = (track) => keys.length ? keys.reduce((sum, key) => sum + normalizeScore(track.emotionScores[key]), 0) / keys.length : 0
  const matchCount = (track) => keys.filter((key) => track.emotionScores[key] >= 3).length
  const similarity = (track) => preferenceProfile?.isActive ? cosineSimilarity(emotionVector(track), preferenceProfile.vector) : 0
  return {
    tracks: [...candidates].sort((a, b) => fit(b) - fit(a) || matchCount(b) - matchCount(a) || similarity(b) - similarity(a) || stableIdOrder(a, b)),
    isPersonalized: Boolean(preferenceProfile?.isActive), hasFewCandidates: candidates.length < 3,
  }
}
export const getLibraryRecommendations = (trackList, profile) => !profile?.isActive ? [] : trackList
  .filter((track) => isFullyRated(track) && !profile.savedIdSet.has(track.id))
  .sort((a, b) => cosineSimilarity(emotionVector(b), profile.vector) - cosineSimilarity(emotionVector(a), profile.vector) || stableIdOrder(a, b))
