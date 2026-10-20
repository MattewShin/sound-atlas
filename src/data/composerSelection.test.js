import test from 'node:test'
import assert from 'node:assert/strict'
import { tracks } from './musicData.js'
import { emotionKeys, isFullyRated } from './emotions.js'
import { composerButtonLabel, describeComposerConditions, filterTracksByComposers, getComposerOptions, searchComposers, toggleComposer } from './composerSelection.js'
import { getDiversifiedKeywordRecommendations, getEmotionFit, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult, pickRandomFeelingRecommendation, pickRandomKeywordRecommendation } from './recommendations.js'

test('작곡가 목록은 추천 가능한 곡에서 자동 추출하고 가나다순으로 정렬하며 기존 영문 이름을 검색한다', () => {
  const composers = getComposerOptions(tracks)
  assert.deepEqual(composers, [...new Set(tracks.filter(isFullyRated).map(({ composer }) => composer))].sort((a, b) => a.localeCompare(b, 'ko')))
  assert.deepEqual(searchComposers(composers), composers)
  assert.deepEqual(searchComposers(composers, '쇼팽'), ['쇼팽'])
  assert.deepEqual(searchComposers(composers, ' CHOPIN '), ['쇼팽'])
  assert.deepEqual(searchComposers(composers, 'Rachmaninov'), ['라흐마니노프'])
  assert.deepEqual(searchComposers(composers, '없는 작곡가'), [])
  assert.ok(!composers.includes('드뷔시'), '영문 별칭과 이미지가 있어도 곡이 없으면 제외')
  assert.ok(getComposerOptions([...tracks, { ...tracks[0], composer: '새 작곡가' }]).includes('새 작곡가'))
  assert.ok(!getComposerOptions([...tracks, { composer: '미평가 작곡가' }]).includes('미평가 작곡가'))
})

test('0·1·3명 표시, 네 번째 제한, 선택 해제와 조건 안내를 지원한다', () => {
  let selected = []
  assert.equal(composerButtonLabel(selected), '작곡가 · 전체')
  selected = toggleComposer(selected, '쇼팽')
  assert.equal(composerButtonLabel(selected), '작곡가 · 쇼팽')
  selected = toggleComposer(selected, '베토벤')
  assert.equal(composerButtonLabel(selected), '작곡가 · 쇼팽 외 1명')
  selected = toggleComposer(selected, '브람스')
  assert.equal(composerButtonLabel(selected), '작곡가 · 쇼팽 외 2명')
  assert.deepEqual(toggleComposer(selected, '슈만'), selected)
  assert.deepEqual(toggleComposer(selected, '베토벤'), ['쇼팽', '브람스'])
  assert.equal(describeComposerConditions(['쇼팽', '베토벤']), '쇼팽 · 베토벤의 음악')
  assert.equal(describeComposerConditions(['쇼팽', '베토벤'], ['peacefulness', 'tenderness']), '쇼팽 · 베토벤의 곡 중 ‘평안한 · 부드러운’ 음악')
})

test('작곡가 필터를 먼저 적용해도 기존 평균·동점 처리·보조 정렬과 다양화 알고리즘은 유지된다', () => {
  for (const selected of [[], ['사티'], ['쇼팽', '베토벤', '브람스']]) {
    const candidates = filterTracksByComposers(tracks, selected)
    if (!selected.length) assert.equal(candidates, tracks)
    for (const keys of [[], ['power'], ['peacefulness', 'tenderness'], ['wonder', 'transcendence', 'tension']]) {
      const result = getRecommendationResult(candidates, keys)
      const expected = getRecommendationResult(tracks, keys).tracks.filter(({ composer }) => !selected.length || selected.includes(composer))
      assert.deepEqual(result.tracks, expected, '필터는 기존 기본 순위나 동점 순서를 바꾸지 않음')
      const diversified = getDiversifiedKeywordRecommendations(result, keys, { randomValue: 0.25 })
      const pool = [...diversified.tracks, pickRandomKeywordRecommendation(result, keys, 0.25), pickRandomFeelingRecommendation(result, keys, 0.25)].filter(Boolean)
      assert.ok(pool.every(({ composer }) => !selected.length || selected.includes(composer)))
      assert.ok(result.tracks.every((track) => !keys.length || getEmotionFit(track, keys) === keys.reduce((sum, key) => sum + (track.emotionScores[key] - 1) / 4, 0) / keys.length))
    }
    const profile = getLibraryPreferenceProfile(tracks, [tracks[0].id])
    assert.ok(getLibraryRecommendations(candidates, profile).every(({ composer }) => !selected.length || selected.includes(composer)))
  }
})

test('적은 곡과 빈 결과는 다른 작곡가로 확대하지 않고 기존 기준을 유지한다', () => {
  const satie = filterTracksByComposers(tracks, ['사티'])
  assert.equal(getRecommendationResult(satie).tracks.length, 3)
  assert.deepEqual(getRecommendationResult(satie, ['power']).tracks, [])
  const synthetic = (id, composer, scores) => ({ id, composer, emotionScores: { ...Object.fromEntries(emotionKeys.map((key) => [key, 1])), ...scores } })
  const candidates = [synthetic('b', 'A', { power: 4, tension: 2 }), synthetic('a', 'A', { power: 3, tension: 3 }), synthetic('c', 'B', { power: 3, tension: 3 })]
  const result = getRecommendationResult(filterTracksByComposers(candidates, ['A', 'B']), ['power', 'tension'])
  assert.deepEqual(result.tracks.map(({ id }) => id), ['a', 'c', 'b'], '같은 평균에서는 기존 일치 감정 수와 ID 정렬 유지')
  assert.ok(result.tracks.every((track) => getEmotionFit(track, ['power', 'tension']) === 0.5))
  assert.equal(getRecommendationResult(filterTracksByComposers(candidates, ['A', 'B'])).tracks.filter(({ composer }) => composer === 'A').length, 2, '작곡가별 균등 배분 없음')
})
