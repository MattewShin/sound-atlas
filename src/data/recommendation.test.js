import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { emotionKeys, emotions, formatTrackTitle, getRepresentativeEmotions, isFullyRated, RATING_VERSION } from './emotions.js'
import { composerImages, tracks, trackDetails } from './musicData.js'
import { cosineSimilarity, emotionVector, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult } from './recommendations.js'
import { feelingOptions, getSuggestedEmotions } from './feelingSuggestions.js'
import { buildRecommendationDiagnosis } from '../../scripts/diagnoseRecommendations.js'

test('36곡 구성, 제목·별칭, 324개 점수, 평가 출처가 확정 CSV와 전부 일치한다', () => {
  const rows = readFileSync(new URL('../../data/manual/chopin-emotions-v1.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
  assert.deepEqual(rows.shift().split(',').slice(2), emotionKeys)
  assert.equal(rows.length, 36)
  assert.equal(tracks.length, 36)
  assert.equal(new Set(tracks.map(({ id }) => id)).size, 36)
  assert.equal(tracks.filter((track) => track.type === 'etude' && track.opus === 10).length, 12)
  assert.equal(tracks.filter((track) => track.type === 'etude' && track.opus === 25).length, 12)
  assert.equal(tracks.filter((track) => track.type === 'sonata').length, 8)
  assert.equal(tracks.filter((track) => track.type === 'ballade').length, 4)
  rows.forEach((row, i) => {
    const [title, alias, ...scores] = row.split(',')
    const track = tracks[i]
    assert.equal(formatTrackTitle(track), title)
    assert.equal(track.alias, alias)
    assert.deepEqual(Object.keys(track.emotionScores), emotionKeys)
    assert.deepEqual(Object.values(track.emotionScores), scores.map(Number))
    assert.equal(isFullyRated(track), true)
    assert.equal(track.ratingSource, 'manual')
    assert.equal(track.ratingVersion, RATING_VERSION)
    assert.equal(track.ratingUnit, track.movement ? 'whole-movement' : 'whole-work')
    assert.ok(!('moods' in track) && !('energy' in track))
    assert.ok(track.id.startsWith('chopin-'))
  })
  assert.equal(emotions.find(({ key }) => key === 'peacefulness').label, '평안한')
})

test('단일 감정의 높은 원점수는 항상 먼저 추천된다', () => {
  for (const key of emotionKeys) {
    const result = getRecommendationResult(tracks, [key]).tracks
    assert.ok(result.every((track) => track.emotionScores[key] >= 3))
    assert.ok(result.every((track, i) => !i || result[i - 1].emotionScores[key] >= track.emotionScores[key]))
  }
  assert.equal(getRecommendationResult(tracks, ['power']).tracks[0].id, 'chopin-etude-op25-no10')
  assert.equal(getRecommendationResult(tracks, ['peacefulness']).tracks[0].id, 'chopin-ballade-op47-no3')
  assert.equal(getRecommendationResult(tracks, ['transcendence']).tracks[0].emotionScores.transcendence, 5)
})

const song = (id, overrides = {}) => ({ id, emotionScores: Object.fromEntries(emotionKeys.map((key) => [key, overrides[key] ?? 1])) })
test('다중 선택은 평균→3 이상 개수→취향 유사도→ID 순서이며 입력 순서에 독립적이다', () => {
  const songs = [song('z', { power: 5, joy: 1 }), song('a', { power: 3, joy: 3 }), song('higher', { power: 5, joy: 3 }), song('low', { joy: 2, power: 2 })]
  assert.deepEqual(getRecommendationResult(songs, ['power', 'joy']).tracks.map(({ id }) => id), ['higher', 'a', 'z'])
  assert.deepEqual(getRecommendationResult([...songs].reverse(), ['joy', 'power', 'joy']).tracks.map(({ id }) => id), ['higher', 'a', 'z'])
  const ties = [song('z', { power: 4 }), song('a', { power: 4 }), song('top', { power: 5 })]
  const profile = getLibraryPreferenceProfile([song('saved', { power: 4 })], ['saved'])
  assert.deepEqual(getRecommendationResult(ties, ['power'], profile).tracks.map(({ id }) => id), ['top', 'a', 'z'])
})

test('개인화는 점수와 일치 개수를 뒤집지 않고 완전 동점에서만 적용된다', () => {
  const songs = [song('a', { power: 4, sadness: 5 }), song('z', { power: 4, joy: 5 }), song('top', { power: 5, sadness: 5 })]
  const profile = getLibraryPreferenceProfile([song('saved', { power: 4, joy: 5 })], ['saved'])
  assert.deepEqual(getRecommendationResult(songs, ['power'], profile).tracks.map(({ id }) => id), ['top', 'z', 'a'])
})

test('후보 부족과 미평가를 처리하며 낮은 점수나 구 곡으로 결과를 채우지 않는다', () => {
  const incomplete = song('incomplete', { power: 5 }); incomplete.emotionScores.joy = null
  const missing = song('missing', { power: 5 }); delete missing.emotionScores.wonder
  const songs = [song('only', { power: 3 }), incomplete, missing, song('low', { power: 2 })]
  const result = getRecommendationResult(songs, ['power'])
  assert.deepEqual(result.tracks.map(({ id }) => id), ['only'])
  assert.equal(result.hasFewCandidates, true)
  assert.deepEqual(getRecommendationResult(songs, ['peacefulness']).tracks, [])
  assert.equal(incomplete.emotionScores.joy, null)
  assert.deepEqual(getRecommendationResult([], ['power']).tracks, [])
})

test('대표 키워드는 3 이상 상위 세 감정만 파생하고 동점에 기준표 순서를 쓴다', () => {
  assert.deepEqual(getRepresentativeEmotions(song('none')), [])
  assert.deepEqual(getRepresentativeEmotions(song('ties', Object.fromEntries(emotionKeys.map((key) => [key, 4])))).map(({ key }) => key), emotionKeys.slice(0, 3))
  assert.deepEqual(getRepresentativeEmotions(tracks.find(({ id }) => id === 'chopin-etude-op25-no10')).map(({ key }) => key), ['power', 'transcendence', 'joy'])
})

test('보관곡만 중복 없이 정규화 평균하고 보관·해제 후 정확히 재계산한다', () => {
  const a = tracks[0], b = tracks[2]
  const first = getLibraryPreferenceProfile(tracks, [a.id, a.id, 'removed'])
  assert.equal(first.count, 1)
  assert.deepEqual(first.vector, emotionVector(a))
  const both = getLibraryPreferenceProfile(tracks, [a.id, b.id])
  assert.deepEqual(both.vector, emotionVector(a).map((value, i) => (value + emotionVector(b)[i]) / 2))
  assert.deepEqual(getLibraryPreferenceProfile(tracks, [b.id]).vector, emotionVector(b))
  assert.equal(first.emotionProfile.wonder, 0)
  assert.deepEqual(first.topEmotions, ['transcendence', 'joy', 'power'])
  assert.equal(first.isActive, true)
})

test('빈 보관함·0벡터·NaN은 개인화 미형성이고 모두 보관하면 빈 추천을 반환한다', () => {
  assert.equal(getLibraryPreferenceProfile(tracks, []).isActive, false)
  const zeroProfile = getLibraryPreferenceProfile([song('zero')], ['zero'])
  assert.equal(zeroProfile.isActive, false)
  assert.deepEqual(zeroProfile.topEmotions, [])
  assert.deepEqual(getLibraryRecommendations(tracks, zeroProfile), [])
  assert.equal(cosineSimilarity(Array(9).fill(0), Array(9).fill(1)), 0)
  assert.equal(cosineSimilarity(Array(9).fill(NaN), Array(9).fill(1)), 0)
  const profile = getLibraryPreferenceProfile(tracks, tracks.map(({ id }) => id))
  assert.deepEqual(getLibraryRecommendations(tracks, profile), [])
})

test('취향 추천은 보관곡을 제외하고 코사인 유사도로 안정 정렬한다', () => {
  const profile = getLibraryPreferenceProfile(tracks, [tracks[0].id, tracks[2].id])
  const result = getLibraryRecommendations(tracks, profile)
  assert.equal(result.length, 34)
  assert.ok(result.every((track) => !profile.savedIdSet.has(track.id)))
  const values = result.map((track) => cosineSimilarity(emotionVector(track), profile.vector))
  assert.ok(values.every((value, i) => !i || values[i - 1] >= value))
  assert.deepEqual(getLibraryRecommendations([...tracks].reverse(), profile).map(({ id }) => id), result.map(({ id }) => id))
})

test('기분 정책은 새 감정 키에 명시적으로 연결하고 직접 선택과 같은 결과를 반환한다', () => {
  for (const feeling of feelingOptions) for (const direction of ['continue', 'change']) {
    assert.ok(getSuggestedEmotions(feeling, direction).every((key) => emotionKeys.includes(key)))
  }
  assert.deepEqual(getSuggestedEmotions('화나는'), ['tension', 'transcendence'])
  assert.deepEqual(getRecommendationResult(tracks, getSuggestedEmotions('차분한')).tracks, getRecommendationResult(tracks, ['peacefulness', 'nostalgia']).tracks)
})

test('작곡가 이미지와 활성 상세 연결이 유효하고 진단도 새 9개 감정을 사용한다', () => {
  assert.ok(existsSync(new URL('../../public' + composerImages.쇼팽, import.meta.url)))
  assert.ok(Object.keys(trackDetails).every((id) => tracks.some((track) => track.id === id)))
  assert.equal(tracks.filter((track) => trackDetails[track.id]?.shortPreview).length, 0)
  assert.deepEqual(buildRecommendationDiagnosis().emotions.map(({ key }) => key), emotionKeys)
})
