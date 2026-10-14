export const RECOMMENDATION_EXPOSURE_STORAGE_KEY = 'classic-atlas-recommendation-exposure-v1'
export const RECOMMENDATION_EXPOSURE_MAX_RECORDS = 80
export const RECOMMENDATION_EXPOSURE_RECENT_LIMIT = 12
export const RECOMMENDATION_EXPOSURE_PENALTY = 0.65

const defaultStorage = () => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

const normalizeRecords = (value) => Array.isArray(value) ? value.filter((record) => record
  && typeof record.trackId === 'string'
  && typeof record.conditionKey === 'string'
  && Number.isFinite(record.count)
  && Number.isFinite(record.lastShownAt))
  .map((record) => ({ trackId: record.trackId, conditionKey: record.conditionKey,
    count: Math.max(1, Math.floor(record.count)), lastShownAt: record.lastShownAt })) : []

export const readRecommendationExposures = (storage = defaultStorage()) => {
  try { return normalizeRecords(JSON.parse(storage?.getItem(RECOMMENDATION_EXPOSURE_STORAGE_KEY) || '[]')) } catch { return [] }
}

export const recordRecommendationExposures = (trackIds, conditionKey, { storage = defaultStorage(), now = Date.now() } = {}) => {
  if (!conditionKey || !Array.isArray(trackIds) || !trackIds.length) return readRecommendationExposures(storage)
  const uniqueIds = [...new Set(trackIds.filter((id) => typeof id === 'string' && id))]
  const records = readRecommendationExposures(storage)
  const byKey = new Map(records.map((record) => [`${record.conditionKey}\u0000${record.trackId}`, record]))
  uniqueIds.forEach((trackId) => {
    const key = `${conditionKey}\u0000${trackId}`
    const previous = byKey.get(key)
    byKey.set(key, { trackId, conditionKey, count: (previous?.count || 0) + 1, lastShownAt: now })
  })
  const next = [...byKey.values()].sort((a, b) => b.lastShownAt - a.lastShownAt)
    .slice(0, RECOMMENDATION_EXPOSURE_MAX_RECORDS)
  try { storage?.setItem(RECOMMENDATION_EXPOSURE_STORAGE_KEY, JSON.stringify(next)) } catch { /* 저장소 오류는 추천을 중단하지 않습니다. */ }
  return next
}

export const getRecentExposureCount = (records, conditionKey, trackId) => normalizeRecords(records)
  .filter((record) => record.conditionKey === conditionKey)
  .sort((a, b) => b.lastShownAt - a.lastShownAt)
  .slice(0, RECOMMENDATION_EXPOSURE_RECENT_LIMIT)
  .find((record) => record.trackId === trackId)?.count || 0

