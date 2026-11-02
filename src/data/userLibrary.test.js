import test from 'node:test'
import assert from 'node:assert/strict'
import { tracks } from './musicData.js'
import { clearAccountLocalData, LIBRARY_OWNER_KEY, mergeReactions, reactionsToPayload, rowsToReactions, syncUserLibrary } from './userLibrary.js'
import { NOTICE_KEY, RECENT_KEY, STORAGE_KEY } from './storage.js'
import { RECOMMENDATION_EXPOSURE_STORAGE_KEY } from './recommendationExposure.js'

const [first, second] = tracks

test('사용자 보관함은 활성곡만 직렬화하고 boolean·시각을 정규화한다', () => {
  const payload = reactionsToPayload({
    [first.id]: { listenAgain: true, liked: false, updatedAt: '2026-11-01T01:02:03+09:00' },
    [second.id]: { listenAgain: true },
    removed: { listenAgain: true, updatedAt: '2026-11-01T00:00:00Z' },
  })
  assert.deepEqual(payload, [
    { track_id: first.id, listen_again: true, liked: false, updated_at: '2026-10-31T16:02:03.000Z' },
    { track_id: second.id, listen_again: true, liked: false, updated_at: '2020-01-01T00:00:00.000Z' },
  ])
  assert.deepEqual(rowsToReactions([{ track_id: first.id, listen_again: true, liked: true, updated_at: '2026-11-01T00:00:00Z' }, { track_id: 'removed', listen_again: true, updated_at: '2026-11-01T00:00:00Z' }]), {
    [first.id]: { listenAgain: true, liked: true, updatedAt: '2026-11-01T00:00:00.000Z' },
  })
})

test('로컬·원격 충돌은 곡별 최신 updatedAt을 사용하고 해제 기록도 보존한다', () => {
  const merged = mergeReactions({
    [first.id]: { listenAgain: true, updatedAt: '2026-11-01T00:00:00Z' },
    [second.id]: { listenAgain: true, updatedAt: '2026-11-03T00:00:00Z' },
  }, {
    [first.id]: { listenAgain: false, liked: true, updatedAt: '2026-11-02T00:00:00Z' },
    [second.id]: { listenAgain: false, updatedAt: '2026-11-02T00:00:00Z' },
  })
  assert.equal(merged[first.id].listenAgain, false)
  assert.equal(merged[first.id].liked, true)
  assert.equal(merged[second.id].listenAgain, true)
})

test('동기화 adapter는 한 RPC로 병합하고 서버 최신 결과를 반환한다', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push([name, args])
    return { data: [{ track_id: first.id, listen_again: false, liked: false, updated_at: '2026-11-02T00:00:00Z' }], error: null }
  } }
  const local = { [first.id]: { listenAgain: true, updatedAt: '2026-11-01T00:00:00Z' } }
  const result = await syncUserLibrary(client, local)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'merge_user_track_reactions')
  assert.equal(calls[0][1].p_reactions[0].track_id, first.id)
  assert.equal(result[first.id].listenAgain, false)
  await assert.rejects(syncUserLibrary({ rpc: async () => ({ error: new Error('denied') }) }, local), /denied/)
})

test('로그아웃용 정리는 계정 행동 기록만 기기에서 제거한다', () => {
  const values = new Map([
    [STORAGE_KEY, '{}'], [LIBRARY_OWNER_KEY, 'user-a'], [RECENT_KEY, '[]'],
    [RECOMMENDATION_EXPOSURE_STORAGE_KEY, '[]'], [NOTICE_KEY, 'notice'],
    ['classic-atlas-concert-region-v1', '서울'],
  ])
  const storage = { removeItem: (key) => values.delete(key) }
  clearAccountLocalData(storage)
  assert.deepEqual([...values], [['classic-atlas-concert-region-v1', '서울']])
})
