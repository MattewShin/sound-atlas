import { DATA_VERSION, emotions, emotionKeys } from './emotions.js'
import { tracks, legacyTrackIdMap } from './musicData.js'

export const STORAGE_KEY = 'classic-atlas-track-reactions-v1'
export const VERSION_KEY = 'classic-atlas-music-data-version'
export const SELECTION_KEY = 'classic-atlas-music-selection-v1'
export const NOTICE_KEY = 'classic-atlas-music-migration-notice'
export const RECENT_KEY = 'classic-atlas-recent-tracks-v1'
const obsoleteKeys = [
  'classic-atlas-preference-profile-v1', 'classic-atlas-energy-preference-v1',
  'classic-atlas-recommendation-cache-v1',
]
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const readJson = (storage, key, fallback) => {
  try { return JSON.parse(storage.getItem(key)) ?? fallback } catch { return fallback }
}
const activeIds = new Set(tracks.map(({ id }) => id))
const currentId = (id) => activeIds.has(id) ? id : Object.hasOwn(legacyTrackIdMap, id) ? legacyTrackIdMap[id] : undefined
export const migrateSelectedEmotions = (values) => [...new Set((Array.isArray(values) ? values : []).map((value) => {
  if (value === '편안한') return 'peacefulness'
  return emotionKeys.includes(value) ? value : emotions.find(({ label }) => label === value)?.key
}).filter(Boolean))].slice(0, 3)

export const migrateMusicStorage = (storage) => {
  if (!storage) return { reactions: {}, selectedKeys: [], notice: null }
  try {
    const raw = readJson(storage, STORAGE_KEY, {})
    const reactions = isObject(raw) ? raw : {}
    const selection = readJson(storage, SELECTION_KEY, [])
    if (storage.getItem(VERSION_KEY) === DATA_VERSION) {
      return { reactions, selectedKeys: migrateSelectedEmotions(selection), notice: storage.getItem(NOTICE_KEY) }
    }
    const next = {}
    let removedSaved = 0
    for (const [id, reaction] of Object.entries(reactions)) {
      if (!isObject(reaction)) continue
      const mapped = currentId(id)
      if (!mapped) { if (reaction.listenAgain === true) removedSaved += 1; continue }
      const previous = next[mapped]
      next[mapped] = previous ? {
        ...previous, ...reaction,
        listenAgain: previous.listenAgain === true || reaction.listenAgain === true,
        liked: previous.liked === true || reaction.liked === true,
        updatedAt: (Date.parse(previous.updatedAt) || 0) > (Date.parse(reaction.updatedAt) || 0) ? previous.updatedAt : reaction.updatedAt,
      } : { ...reaction }
    }
    const selectedKeys = migrateSelectedEmotions(selection)
    const notice = removedSaved ? `새 곡 목록에 맞춰 보관함을 정리했어요. 제외된 곡 ${removedSaved}개` : null
    try {
      const recent = readJson(storage, RECENT_KEY, [])
      if (Array.isArray(recent) && storage.getItem(RECENT_KEY) !== null) {
        storage.setItem(RECENT_KEY, JSON.stringify([...new Set(recent.map(currentId).filter(Boolean))]))
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(next))
      storage.setItem(SELECTION_KEY, JSON.stringify(selectedKeys))
      obsoleteKeys.forEach((key) => storage.removeItem(key))
      if (notice) storage.setItem(NOTICE_KEY, notice)
      storage.setItem(VERSION_KEY, DATA_VERSION)
    } catch {
      // 쓰기만 차단돼도 읽어 온 유효한 보관 기록은 현재 화면에서 유지합니다.
    }
    return { reactions: next, selectedKeys, notice: notice || storage.getItem(NOTICE_KEY) }
  } catch {
    // 저장 차단/용량 부족이어도 현재 활성 곡만 화면에 사용합니다.
    return { reactions: {}, selectedKeys: [], notice: null }
  }
}
export const getInitialMusicState = () => {
  try { return migrateMusicStorage(window.localStorage) } catch { return migrateMusicStorage(null) }
}
export const saveMusicValue = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장 차단 시 현재 화면 유지 */ }
}
