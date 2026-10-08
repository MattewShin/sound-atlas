import assert from 'node:assert/strict'
import test from 'node:test'
import { DATA_VERSION } from './emotions.js'
import { tracks } from './musicData.js'
import { getLibraryPreferenceProfile } from './recommendations.js'
import { migrateMusicStorage, migrateSelectedEmotions, STORAGE_KEY, VERSION_KEY, SELECTION_KEY, RECENT_KEY, NOTICE_KEY } from './storage.js'

const memoryStorage = (values = {}) => {
  const data = new Map(Object.entries(values))
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key), data }
}
test('정확히 같은 두 악장은 보관·좋아요를 유지하고 삭제 곡과 음악 캐시만 정리한다', () => {
  const storage = memoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      'chopin-sonata-2-1': { listenAgain: true, liked: true, updatedAt: '2026-10-01' },
      'chopin-sonata-3-4': { listenAgain: true },
      'chopin-sonata-2': { listenAgain: true },
      'beethoven-moonlight-1': { listenAgain: true },
    }),
    [SELECTION_KEY]: JSON.stringify(['편안한', '따뜻한', '장엄한', '몽환적인']),
    [RECENT_KEY]: JSON.stringify(['chopin-sonata-2-1', 'beethoven-moonlight-1', 'chopin-sonata-2-1']),
    'classic-atlas-preference-profile-v1': '{"moods":{}}',
    'classic-atlas-energy-preference-v1': 'old',
    'classic-atlas-recommendation-cache-v1': 'old',
    'auth-token': 'preserve-auth', 'theme': 'preserve-theme',
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(Object.keys(state.reactions), ['chopin-sonata-op35-no2-m1', 'chopin-sonata-op58-no3-m4'])
  assert.equal(state.reactions['chopin-sonata-op35-no2-m1'].liked, true)
  assert.deepEqual(state.selectedKeys, ['peacefulness', 'nostalgia'])
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_KEY)), ['chopin-sonata-op35-no2-m1'])
  assert.ok(state.notice.includes('2개'))
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
  assert.equal(storage.getItem('classic-atlas-energy-preference-v1'), null)
  assert.equal(storage.getItem('classic-atlas-preference-profile-v1'), null)
  assert.equal(storage.getItem('classic-atlas-recommendation-cache-v1'), null)
  assert.equal(storage.getItem('auth-token'), 'preserve-auth')
  assert.equal(storage.getItem('theme'), 'preserve-theme')
  const before = [...storage.data]
  const again = migrateMusicStorage(storage)
  assert.deepEqual(again, state)
  assert.deepEqual([...storage.data], before)
  storage.removeItem(NOTICE_KEY)
  assert.equal(migrateMusicStorage(storage).notice, null)
  assert.deepEqual(getLibraryPreferenceProfile(tracks, Object.keys(again.reactions)).vector,
    getLibraryPreferenceProfile(tracks, ['chopin-sonata-op35-no2-m1', 'chopin-sonata-op58-no3-m4']).vector)
})

test('구 ID와 새 ID가 함께 있어도 보관·좋아요를 보존하고 중복을 만들지 않는다', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({
    'chopin-sonata-2-1': { listenAgain: true, liked: false, updatedAt: '2026-10-07' },
    'chopin-sonata-op35-no2-m1': { listenAgain: false, liked: true, updatedAt: '2026-10-01' },
  }) })
  const state = migrateMusicStorage(storage)
  assert.equal(Object.keys(state.reactions).length, 1)
  assert.equal(state.reactions['chopin-sonata-op35-no2-m1'].listenAgain, true)
  assert.equal(state.reactions['chopin-sonata-op35-no2-m1'].liked, true)
  assert.equal(state.reactions['chopin-sonata-op35-no2-m1'].updatedAt, '2026-10-07')
  assert.deepEqual(migrateMusicStorage(storage), state)
})

test('선택 마이그레이션은 편안한만 이름을 바꾸고 새로운 평가를 추정하지 않는다', () => {
  assert.deepEqual(migrateSelectedEmotions(['편안한', '평안한', '따뜻한', '장엄한', '힘찬', '경쾌한', '설레는']), ['peacefulness', 'power', 'joy'])
  assert.deepEqual(migrateSelectedEmotions(null), [])
})

test('손상되거나 차단된 저장소와 새 설치에서도 오류 없이 동작한다', () => {
  assert.deepEqual(migrateMusicStorage(null), { reactions: {}, selectedKeys: [], notice: null })
  assert.deepEqual(migrateMusicStorage(memoryStorage({ [STORAGE_KEY]: 'broken' })).reactions, {})
  assert.deepEqual(migrateMusicStorage({ getItem: () => { throw new Error('blocked') } }).reactions, {})
})

test('저장 용량 부족으로 쓰기가 차단돼도 읽을 수 있는 보관 기록은 유지한다', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ 'chopin-sonata-2-1': { listenAgain: true } }) })
  storage.setItem = () => { throw new Error('quota') }
  assert.equal(migrateMusicStorage(storage).reactions['chopin-sonata-op35-no2-m1'].listenAgain, true)
  assert.equal(storage.getItem(VERSION_KEY), null)
})
