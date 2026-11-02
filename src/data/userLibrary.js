import { tracks } from './musicData.js'

export const LIBRARY_OWNER_KEY = 'classic-atlas-library-owner-v1'
const activeTrackIds = new Set(tracks.map(({ id }) => id))

const validTimestamp = (value) => Number.isFinite(Date.parse(value))
// 이전 로컬 데이터에 시각이 없으면 원격의 정상 기록보다 앞선 안전한 기준시각을 사용합니다.
const normalizedTimestamp = (value) => validTimestamp(value) ? new Date(value).toISOString() : '2020-01-01T00:00:00.000Z'

const normalizeReaction = (reaction = {}) => ({
  listenAgain: reaction.listenAgain === true,
  liked: reaction.liked === true,
  updatedAt: normalizedTimestamp(reaction.updatedAt),
})

export const rowsToReactions = (rows = []) => Object.fromEntries(rows
  .filter((row) => activeTrackIds.has(row?.track_id))
  .map((row) => [row.track_id, normalizeReaction({
    listenAgain: row.listen_again,
    liked: row.liked,
    updatedAt: row.updated_at,
  })]))

export const reactionsToPayload = (reactions = {}) => Object.entries(reactions)
  .filter(([trackId, reaction]) => activeTrackIds.has(trackId) && reaction && typeof reaction === 'object')
  .map(([trackId, reaction]) => ({
    track_id: trackId,
    listen_again: reaction.listenAgain === true,
    liked: reaction.liked === true,
    updated_at: normalizedTimestamp(reaction.updatedAt),
  }))

export const mergeReactions = (local = {}, remote = {}) => {
  const merged = {}
  for (const trackId of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (!activeTrackIds.has(trackId)) continue
    const localReaction = local[trackId] && normalizeReaction(local[trackId])
    const remoteReaction = remote[trackId] && normalizeReaction(remote[trackId])
    if (!localReaction) merged[trackId] = remoteReaction
    else if (!remoteReaction) merged[trackId] = localReaction
    else merged[trackId] = Date.parse(remoteReaction.updatedAt) > Date.parse(localReaction.updatedAt) ? remoteReaction : localReaction
  }
  return merged
}

export const readLibraryOwner = () => {
  try { return window.localStorage.getItem(LIBRARY_OWNER_KEY) } catch { return null }
}

export const saveLibraryOwner = (userId) => {
  try { window.localStorage.setItem(LIBRARY_OWNER_KEY, userId) } catch { /* 현재 세션 동기화는 계속합니다. */ }
}

export async function syncUserLibrary(client, reactions, { includeLocal = true } = {}) {
  if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
  const payload = includeLocal ? reactionsToPayload(reactions) : []
  const { data, error } = await client.rpc('merge_user_track_reactions', { p_reactions: payload })
  if (error) throw error
  const remote = rowsToReactions(data)
  return includeLocal ? mergeReactions(reactions, remote) : remote
}
