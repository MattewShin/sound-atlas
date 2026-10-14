import test from 'node:test'
import assert from 'node:assert/strict'
import { emotionKeys, getRepresentativeEmotions, isFullyRated, isValidEmotionScore, normalizeScore } from './emotions.js'
import { cosineSimilarity, emotionVector, getEmotionFit, getFeelingRecommendationCandidates, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult } from './recommendations.js'
import { analyzeConcert } from './concertRecommendations.js'

const song = (id, scores = {}) => ({ id, emotionScores: { ...Object.fromEntries(emotionKeys.map((key) => [key, 1])), ...scores } })

test('원점수는 숫자 타입의 1~5와 0.5점 단위만 허용한다', () => {
  const allowed = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
  for (const score of allowed) {
    assert.equal(isValidEmotionScore(score), true)
    assert.equal(isFullyRated(song('valid', Object.fromEntries(emotionKeys.map((key) => [key, score])))), true)
  }
  const invalid = [-Infinity, Infinity, NaN, -1, 0, 0.5, 1.25, 4.2, 5.5, 6, '4', '4.5', '', null, undefined, true, new Number(4.5)]
  for (const key of emotionKeys) {
    for (const score of invalid) {
      const track = song('invalid', { [key]: score })
      assert.equal(isValidEmotionScore(score), false)
      assert.equal(isFullyRated(track), false)
      assert.deepEqual(getRecommendationResult([track], [key]).tracks, [])
      assert.equal(getLibraryPreferenceProfile([track], [track.id]).count, 0)
    }
    const incomplete = song('missing')
    delete incomplete.emotionScores[key]
    assert.equal(isFullyRated(incomplete), false)
  }
})

test('4.5점은 JSON 저장·복원 후에도 숫자와 평가 완료 상태를 유지한다', () => {
  const original = song('half-point', { tenderness: 4.5 })
  const restored = JSON.parse(JSON.stringify(original))
  assert.equal(typeof restored.emotionScores.tenderness, 'number')
  assert.equal(restored.emotionScores.tenderness, 4.5)
  assert.equal(isFullyRated(restored), true)
  assert.deepEqual(restored, original)
})

test('키워드 정렬·대표 감정은 4.5와 4를 구분하고 2.5는 3점 필터를 통과하지 않는다', () => {
  const integer = song('a-integer', { wonder: 4 })
  const half = song('z-half', { wonder: 4.5, tenderness: 4, joy: 3.5, power: 2.5 })
  const below = song('below', { wonder: 2.5 })
  const result = getRecommendationResult([integer, below, half], ['wonder'])
  assert.deepEqual(result.tracks.map(({ id }) => id), ['z-half', 'a-integer'])
  assert.deepEqual(result.topScoreTracks, [half])
  assert.deepEqual(getRepresentativeEmotions(half).map(({ key }) => key), ['wonder', 'tenderness', 'joy'])
  assert.equal(normalizeScore(4), 0.75)
  assert.equal(normalizeScore(4.5), 0.875)
  assert.equal(getEmotionFit(half, ['wonder', 'tenderness']), 0.8125)
})

test('기분 후보는 소수점 평균에서도 기존 1점 범위와 모든 감정 3점 이상 기준을 유지한다', () => {
  const candidates = [
    song('top', { tenderness: 4.5, peacefulness: 4 }),
    song('boundary', { tenderness: 3.5, peacefulness: 3 }),
    song('outside', { tenderness: 3, peacefulness: 3 }),
    song('below-threshold', { tenderness: 5, peacefulness: 2.5 }),
  ]
  const keys = ['tenderness', 'peacefulness']
  const result = getRecommendationResult(candidates, keys)
  assert.deepEqual(getFeelingRecommendationCandidates(result, keys).map(({ id }) => id), ['top', 'boundary'])
})

test('보관함 평균·코사인·취향 정렬은 계산 결과를 0.5점 단위로 맞추지 않는다', () => {
  const saved = song('saved', { wonder: 4.5, tenderness: 4 })
  const integer = song('integer', { wonder: 4, tenderness: 4 })
  const same = song('same', { wonder: 4.5, tenderness: 4 })
  const profile = getLibraryPreferenceProfile([saved, integer], [saved.id, integer.id])
  assert.equal(profile.emotionProfile.wonder, 0.8125)
  assert.equal(profile.emotionProfile.tenderness, 0.75)
  const savedProfile = getLibraryPreferenceProfile([saved], [saved.id])
  const similarity = cosineSimilarity(emotionVector(saved), emotionVector(integer))
  // (7, 6)과 (6, 6)의 방향 유사도입니다. 원점수를 정수로 자르면 같은 방향이 됩니다.
  assert.ok(Math.abs(similarity - 13 / Math.sqrt(170)) < 1e-12)
  assert.ok(similarity < 1 && similarity > 0.99)
  assert.deepEqual(getLibraryRecommendations([integer, saved, same], savedProfile).map(({ id }) => id), ['same', 'integer'])
})

test('공연 감정 점수·추천 이유·작품 평균도 소수점 원점수를 유지한다', () => {
  const half = song('half', { tenderness: 4.5 })
  const integer = song('integer', { tenderness: 4 })
  const work = { id: 'test-work', title: '테스트 작품', trackIds: [half.id, integer.id] }
  const result = analyzeConcert({ id: 'test-concert', programStatus: 'verified', programWorkIds: [work.id] },
    [integer, half], { selectedKeys: ['tenderness'] }, { [work.id]: work })
  assert.equal(result.isRecommended, true)
  assert.equal(result.program[0].ratedTracks.length, 2)
  assert.equal(result.score, 0.8125)
  assert.ok(result.reasons.some((reason) => reason.includes('부드러운 4.5/5')))
  assert.ok(result.reasons.some((reason) => reason.includes('부드러운 4/5')))
})
