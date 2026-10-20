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
      'debussy-clair-de-lune': { listenAgain: true },
    }),
    [SELECTION_KEY]: JSON.stringify(['편안한', '따뜻한', '장엄한', '몽환적인']),
    [RECENT_KEY]: JSON.stringify(['chopin-sonata-2-1', 'debussy-clair-de-lune', 'chopin-sonata-2-1']),
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

test('36곡 버전에서 확장해도 기존 보관과 선택을 모두 유지한다', () => {
  const reactions = Object.fromEntries(tracks.filter((track) => track.composer === '쇼팽').map((track) => [track.id, { listenAgain: true, liked: true }]))
  const storage = memoryStorage({
    [VERSION_KEY]: 'chopin-36-emotions-1',
    [STORAGE_KEY]: JSON.stringify(reactions),
    [SELECTION_KEY]: JSON.stringify(['wonder', 'nostalgia']),
    [RECENT_KEY]: JSON.stringify(Object.keys(reactions)),
    'auth-token': 'preserve-auth',
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions, reactions)
  assert.deepEqual(state.selectedKeys, ['wonder', 'nostalgia'])
  assert.equal(state.notice, null)
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
  assert.equal(storage.getItem('auth-token'), 'preserve-auth')
  assert.deepEqual(migrateMusicStorage(storage), state)
})

test('재추가된 동일 작품만 구 ID로 연결하고 잘못된 작품번호는 추정하지 않는다', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({
    'rachmaninoff-prelude-op23-5': { listenAgain: true },
    'satie-gymnopedie-1': { listenAgain: true },
    'liszt-liebestraum-3': { listenAgain: true },
    'rachmaninoff-prelude-op3': { listenAgain: true },
  }) })
  assert.deepEqual(Object.keys(migrateMusicStorage(storage).reactions), [
    'rachmaninoff-prelude-op23-no5', 'satie-gymnopedie-no1', 'liszt-liebestraum-s541-no3',
  ])
})

test('44곡 버전의 전체 보관 기록을 보존하고 정확한 베토벤 구 악장 ID를 연결한다', () => {
  const reactions = Object.fromEntries(tracks.slice(0, 44).map((track) => [track.id, { listenAgain: true, liked: true }]))
  assert.equal(Object.keys(reactions).length, 44)
  const mappings = {
    'beethoven-moonlight-1': 'beethoven-sonata-op27-2-no14-m1',
    'beethoven-moonlight-3': 'beethoven-sonata-op27-2-no14-m3',
    'beethoven-waldstein-1': 'beethoven-sonata-op53-no21-m1',
    'beethoven-appassionata-3': 'beethoven-sonata-op57-no23-m3',
  }
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-2',
    [STORAGE_KEY]: JSON.stringify({ ...reactions, ...Object.fromEntries(Object.keys(mappings).map((id) => [id, { listenAgain: true, liked: true }])) }),
    [SELECTION_KEY]: JSON.stringify(['wonder', 'joy']),
    [RECENT_KEY]: JSON.stringify(Object.keys(mappings)),
  })
  const state = migrateMusicStorage(storage)
  for (const [id, reaction] of Object.entries(reactions)) assert.deepEqual(state.reactions[id], reaction)
  for (const id of Object.values(mappings)) assert.deepEqual(state.reactions[id], { listenAgain: true, liked: true })
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_KEY)), Object.values(mappings))
  assert.deepEqual(state.selectedKeys, ['wonder', 'joy'])
  assert.equal(state.notice, null)
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
  assert.deepEqual(migrateMusicStorage(storage), state)
})

test('65곡 목록에서 81곡 목록으로 늘려도 기존 보관·좋아요·선택을 유지한다', () => {
  const existing = 'beethoven-piano-concerto-op73-no5-m2'
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-4',
    [STORAGE_KEY]: JSON.stringify({ [existing]: { listenAgain: true, liked: true } }),
    [SELECTION_KEY]: JSON.stringify(['tenderness']),
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions[existing], { listenAgain: true, liked: true })
  assert.deepEqual(state.selectedKeys, ['tenderness'])
  assert.equal(state.notice, null)
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
})

test('77곡 목록에서 슈베르트 4곡을 추가해도 기존 보관·좋아요를 유지한다', () => {
  const existing = 'tchaikovsky-seasons-op37a-no6'
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-5',
    [STORAGE_KEY]: JSON.stringify({ [existing]: { listenAgain: true, liked: true } }),
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions[existing], { listenAgain: true, liked: true })
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
  assert.equal(tracks.filter(({ id }) => id.startsWith('schubert-impromptu-d899-')).length, 4)
})

test('81곡 버전에서 115곡으로 확장해도 기존·신규 보관과 최근 곡을 보존한다', () => {
  const ids = ['schubert-impromptu-d899-op90-no3', 'schumann-sonata-op11-no1-m2', 'chopin-polonaise-op53']
  const reactions = Object.fromEntries(ids.map(id => [id, { listenAgain: true, liked: true }]))
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-6',
    [STORAGE_KEY]: JSON.stringify(reactions),
    [RECENT_KEY]: JSON.stringify(ids),
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions, reactions)
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_KEY)), ids)
  assert.equal(state.notice, null)
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
})

test('115곡 버전에서 188곡으로 확장해도 보관·좋아요·최근 곡을 유지한다', () => {
  const ids = ['chopin-polonaise-op53', 'chopin-nocturne-b49', 'brahms-sonata-op5-no3-m5', 'mozart-fantasy-k397']
  const reactions = Object.fromEntries(ids.map(id => [id, { listenAgain: true, liked: true }]))
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-7', [STORAGE_KEY]: JSON.stringify(reactions), [RECENT_KEY]: JSON.stringify(ids),
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions, reactions)
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_KEY)), ids)
  assert.equal(state.notice, null)
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
})

test('Op.35 단일 곡 삭제 시 다른 곡의 보관은 유지하고 기존 반응을 두 권에 임의 배분하지 않는다', () => {
  const oldId = 'brahms-variations-op35', keptId = 'brahms-variations-op24'
  const storage = memoryStorage({
    [VERSION_KEY]: 'manual-catalog-8',
    [STORAGE_KEY]: JSON.stringify({ [oldId]: { listenAgain: true, liked: true }, [keptId]: { listenAgain: true, liked: true } }),
    [RECENT_KEY]: JSON.stringify([oldId, keptId]),
  })
  const state = migrateMusicStorage(storage)
  assert.deepEqual(state.reactions, { [keptId]: { listenAgain: true, liked: true } })
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_KEY)), [keptId])
  assert.equal(storage.getItem(VERSION_KEY), DATA_VERSION)
  assert.ok(state.notice.includes('1개'))
})
