import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tracks } from './musicData.js'
import { emotionKeys } from './emotions.js'
import { searchReferenceTracks, getReferenceRecommendations, referenceWorkKey } from './referenceTrackSearch.js'

const ids = (query) => searchReferenceTracks(tracks, query).map(({ id }) => id)
const reference = tracks.find(({ id }) => id === 'chopin-ballade-op52-no4')
test('기준곡 검색은 한·영·대소문자·숫자 결합·No/번·별칭을 지원한다', () => {
  for (const query of ['쇼팽 발라드 4번', '쇼팽 발라드 제4번', 'Chopin Ballade No.4 Op.52', ' CHOPIN OPUS 52 ', 'chopin ballade4']) {
    assert.deepEqual(ids(query), [reference.id], query)
  }
  assert.deepEqual(ids('리스트 사랑의꿈 3번'), ['liszt-liebestraum-s541-no3'])
  assert.deepEqual(ids('리스트 사랑').sort(), ['liszt-liebestraum-s541-no1', 'liszt-liebestraum-s541-no2', 'liszt-liebestraum-s541-no3'])
  assert.equal(ids('베토벤 월광').length, 3)
  assert.ok(ids('Chopin Sonata 2악장').every((id) => id.endsWith('-m2')))
  assert.ok(ids('Rachmaninov').length > 0)
  const accented = { ...reference, id: 'accented', composer: '드뷔시', title: '드뷔시', titleEn: 'Debussy Rêverie' }
  assert.equal(searchReferenceTracks([accented], 'DÉBUSSY rêverie')[0].id, 'accented')
})
test('작품번호와 곡번호는 혼동하지 않으며 숫자 부분일치를 허용하지 않는다', () => {
  assert.deepEqual(ids('Chopin Ballade Op.4'), [])
  assert.deepEqual(ids('Chopin Ballade No.52'), [])
  assert.deepEqual(ids('Chopin Ballade 5'), [])
  assert.deepEqual(ids('Chopin Ballade Op.5'), [])
  assert.ok(ids('Chopin Etude No.1').every((id) => /-no1$/.test(id)))
})
test('빈 검색·미등록 검색은 빈 목록이며 불완전 평가는 검색과 추천에서 제외한다', () => {
  for (const query of ['', ' ', '???', '없는곡']) assert.deepEqual(ids(query), [])
  const incomplete = { ...reference, id: 'incomplete', emotionScores: { tension: 5 } }
  assert.deepEqual(searchReferenceTracks([incomplete], '쇼팽'), [])
  assert.deepEqual(getReferenceRecommendations(tracks, incomplete), [])
  assert.deepEqual(getReferenceRecommendations(tracks, null), [])
})
test('기준곡·동일 작품의 다른 악장·중복 ID를 추천에서 제외하고 작곡가 편중을 제한한다', () => {
  for (const source of tracks) {
    const result = getReferenceRecommendations([...tracks, ...tracks], source)
    assert.ok(result.length <= 6 && result.length > 0)
    assert.equal(new Set(result.map(({ track }) => track.id)).size, result.length)
    assert.equal(new Set(result.map(({ track }) => referenceWorkKey(track))).size, result.length)
    for (const { track, similarity, reason } of result) {
      assert.notEqual(referenceWorkKey(track), referenceWorkKey(source))
      assert.ok(Number.isFinite(similarity) && similarity >= 0 && similarity <= 1)
      assert.ok(reason.length > 0)
      assert.ok(result.filter((item) => item.track.composer === track.composer).length <= 2)
    }
    assert.deepEqual(result, getReferenceRecommendations(tracks, source))
  }
})
test('감정 벡터는 형태와 강도를 비교하며 같은 형태라도 다른 강도를 구별한다', () => {
  const make = (id, score) => ({ id, composer: id, emotionScores: Object.fromEntries(emotionKeys.map((key) => [key, score])) })
  const base = make('base', 5), exact = make('exact', 5), quieter = make('quieter', 3)
  assert.equal(getReferenceRecommendations([quieter, exact], base)[0].track.id, 'exact')
  assert.deepEqual(getReferenceRecommendations([base], base), [])
  assert.deepEqual(getReferenceRecommendations(tracks, reference, 0), [])
})
test('검색과 추천은 원본 평가와 목록 순서를 변경하지 않는다', () => {
  const before = JSON.stringify(tracks)
  searchReferenceTracks(tracks, '쇼팽')
  getReferenceRecommendations(tracks, reference)
  assert.equal(JSON.stringify(tracks), before)
})
test('숙련자 모바일 검색은 축소 가능한 폭·16px 입력·44px 터치·줄바꿈을 갖춘다', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.exploration-level-switch \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.reference-search \{[^}]*width: 100%[^}]*min-width: 0[^}]*font-size: 16px/)
  assert.match(css, /\.reference-explorer li \{[^}]*overflow-wrap: anywhere/)
  assert.match(css, /\.reference-actions button,[^}]*min-height: 44px/)
})
