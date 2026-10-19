import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { emotionKeys, emotions, formatTrackTitle, getRepresentativeEmotions, isFullyRated, RATING_VERSION } from './emotions.js'
import { composerImages, tracks, trackDetails } from './musicData.js'
import { cosineSimilarity, emotionVector, getDiversifiedKeywordRecommendations, getKeywordCandidateGroups, getKeywordMetrics, getKeywordRecommendationCandidates, getKeywordRecommendationWeight, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult, pickRandomTopRecommendation, pickRandomKeywordRecommendation, getFeelingRecommendationCandidates, pickRandomFeelingRecommendation } from './recommendations.js'
import { getRecentExposureCount, readRecommendationExposures, recordRecommendationExposures, RECOMMENDATION_EXPOSURE_MAX_RECORDS, RECOMMENDATION_EXPOSURE_STORAGE_KEY } from './recommendationExposure.js'
import { feelingOptions, getSuggestedEmotions } from './feelingSuggestions.js'
import { buildRecommendationDiagnosis } from '../../scripts/diagnoseRecommendations.js'

test('사용자 제공 62곡의 제목·558개 점수·요약·배경·감상 포인트·영상 구간이 ID별로 일치한다', () => {
  const updates = JSON.parse(readFileSync(new URL('../../data/manual/catalog-update-2026-10-13.json', import.meta.url), 'utf8'))
  assert.equal(updates.length, 62)
  assert.equal(new Set(updates.map(({ id }) => id)).size, 62)
  const plainTitle = (value) => value.replace(/'[^']*'/g, '').replace(/\s+/g, ' ').trim()
  const seconds = (value) => { const [minutes, seconds] = value.split(':').map(Number); return minutes * 60 + seconds }
  for (const input of updates) {
    const track = tracks.find(({ id }) => id === input.id)
    assert.ok(track, input.id)
    assert.equal(plainTitle(formatTrackTitle(track)), plainTitle(input.titleKorean))
    const alias = input.titleKorean.match(/'([^']+)'/)?.[1] || ''
    assert.equal(track.alias, alias)
    assert.equal(track.titleEn, input.titleEn)
    assert.deepEqual(track.emotionScores, input.emotionScores)
    assert.equal(track.summary, input.summary)
    assert.equal(track.description, input.summary)
    const [background, listeningTip] = input.backgroundAndPoint.split('감상 포인트:')
    const detail = trackDetails[input.id]
    assert.equal(detail.about, background.trim())
    assert.equal(detail.listeningTip, listeningTip.trim())
    assert.deepEqual(detail.shortPreview, {
      provider: 'youtube', videoId: new URL(input.link).searchParams.get('v'),
      startSeconds: seconds(input.start), endSeconds: seconds(input.end), sourceLabel: input.sourceLabel,
    })
    assert.ok(detail.shortPreview.endSeconds > detail.shortPreview.startSeconds)
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [input.id]).vector, Object.values(input.emotionScores).map((score) => (score - 1) / 4))
  }
})

test('확장 카탈로그의 구성, 제목·별칭, 전체 점수, 평가 출처가 확정 CSV와 전부 일치한다', () => {
  const rows = readFileSync(new URL('../../data/manual/manual-emotions-v1.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
  assert.deepEqual(rows.shift().split(',').slice(2), emotionKeys)
  assert.equal(rows.length, 115)
  assert.equal(tracks.length, rows.length)
  assert.equal(new Set(tracks.map(({ id }) => id)).size, rows.length)
  assert.equal(tracks.filter((track) => track.composer === '쇼팽').length, 54)
  assert.equal(tracks.filter((track) => track.composer === '라흐마니노프').length, 4)
  assert.equal(tracks.filter((track) => track.composer === '사티').length, 3)
  assert.equal(tracks.filter((track) => track.composer === '리스트').length, 1)
  assert.equal(tracks.filter((track) => track.composer === '베토벤').length, 21)
  assert.equal(tracks.filter((track) => track.composer === '슈베르트').length, 8)
  assert.equal(tracks.filter((track) => track.composer === '슈만').length, 12)
  assert.equal(tracks.filter((track) => track.composer === '차이콥스키').length, 12)
  assert.equal(tracks.filter((track) => track.type === 'piano-concerto' && track.opus === 73 && track.number === 5).length, 3)
  assert.equal(tracks.filter((track) => track.type === 'etude' && track.opus === 10).length, 12)
  assert.equal(tracks.filter((track) => track.type === 'etude' && track.opus === 25).length, 12)
  assert.equal(tracks.filter((track) => track.type === 'sonata' && track.composer === '쇼팽').length, 8)
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
    assert.match(track.id, /^(chopin|rachmaninoff|satie|liszt|beethoven|schubert|schumann|tchaikovsky)-/)
  })
  assert.equal(emotions.find(({ key }) => key === 'peacefulness').label, '평안한')
})

test('단일 감정의 높은 원점수는 항상 먼저 추천된다', () => {
  for (const key of emotionKeys) {
    const result = getRecommendationResult(tracks, [key]).tracks
    assert.ok(result.every((track) => track.emotionScores[key] >= 3))
    assert.ok(result.every((track, i) => !i || result[i - 1].emotionScores[key] >= track.emotionScores[key]))
  }
  assert.ok(getRecommendationResult(tracks, ['power']).topScoreTracks.some((track) => track.id === 'chopin-etude-op25-no12'))
  assert.ok(getRecommendationResult(tracks, ['peacefulness']).topScoreTracks.some((track) => track.id === 'schubert-impromptu-d899-op90-no3'))
  assert.equal(getRecommendationResult(tracks, ['transcendence']).tracks[0].emotionScores.transcendence, 5)
})

const song = (id, overrides = {}) => ({ id, emotionScores: Object.fromEntries(emotionKeys.map((key) => [key, overrides[key] ?? 1])) })

test('기분 대표곡 후보는 평균 1점 경계를 포함하고 두 감정이 모두 3 이상이어야 한다', () => {
  const keys = ['joy', 'wonder']
  const incomplete = song('incomplete', { joy: 5, wonder: 5 }); incomplete.emotionScores.power = null
  const result = getRecommendationResult([
    song('top', { joy: 5, wonder: 4 }),
    song('boundary', { joy: 4, wonder: 3 }),
    song('below', { joy: 3, wonder: 3 }),
    song('unbalanced', { joy: 5, wonder: 2 }), incomplete,
  ], keys)
  assert.deepEqual(getFeelingRecommendationCandidates(result, keys).map(({ id }) => id), ['top', 'boundary'])
  assert.deepEqual(getFeelingRecommendationCandidates(result, []), [])
  assert.equal(pickRandomFeelingRecommendation(result, keys, 0, 'top').id, 'boundary')
  assert.equal(pickRandomFeelingRecommendation(result, keys, 0.99, 'boundary').id, 'top')
  assert.equal(pickRandomTopRecommendation(result, 0.99).id, 'top', '느낌 추천은 최고점만 추첨')
})

test('현재 기분별 후보 8~32곡을 고르게 추첨하고 후보 부족과 직전곡 제외를 처리한다', () => {
  const counts = [12, 12, 8, 25, 24, 32]
  feelingOptions.forEach((feeling, index) => {
    const keys = getSuggestedEmotions(feeling)
    const result = getRecommendationResult(tracks, keys)
    const candidates = getFeelingRecommendationCandidates(result, keys)
    assert.equal(candidates.length, counts[index], feeling)
    const picked = candidates.map((_, i) => pickRandomFeelingRecommendation(result, keys, (i + 0.5) / candidates.length))
    assert.equal(new Set(picked.map(({ id }) => id)).size, candidates.length)
    const previous = candidates[0].id
    const afterExclusion = candidates.slice(1).map((_, i) => pickRandomFeelingRecommendation(result, keys, (i + 0.5) / (candidates.length - 1), previous))
    assert.ok(afterExclusion.every(({ id }) => id !== previous))
    assert.equal(new Set(afterExclusion.map(({ id }) => id)).size, candidates.length - 1)
  })
  const keys = ['joy', 'wonder']
  const one = getRecommendationResult([song('only', { joy: 3, wonder: 3 })], keys)
  assert.equal(pickRandomFeelingRecommendation(one, keys, 0, 'only').id, 'only')
  const noBalanced = getRecommendationResult([song('unbalanced', { joy: 5, wonder: 1 })], keys)
  assert.equal(pickRandomFeelingRecommendation(noBalanced, keys, 0), undefined)
  assert.equal(pickRandomFeelingRecommendation(getRecommendationResult([], keys), keys, 0), undefined)
})
test('대표곡은 최고 점수 동점 후보에서만 추첨하고 동일 추첨값에는 같은 곡을 유지한다', () => {
  const songs = [song('a', { power: 5 }), song('b', { power: 5 }), song('c', { power: 4 })]
  const result = getRecommendationResult(songs, ['power'])
  assert.deepEqual(result.topScoreTracks.map(({ id }) => id), ['a', 'b'])
  assert.equal(pickRandomTopRecommendation(result, 0).id, 'a')
  assert.equal(pickRandomTopRecommendation(result, 0.99).id, 'b')
  assert.equal(pickRandomTopRecommendation(result, 0.99).id, 'b')
  assert.deepEqual(result.tracks.map(({ id }) => id), ['a', 'b', 'c'])
  assert.equal(pickRandomTopRecommendation(getRecommendationResult([], ['power']), 0.5), undefined)
})

test('다중 선택은 평균 점수가 같은 최고 후보 전체에서 대표곡을 추첨한다', () => {
  const result = getRecommendationResult([
    song('a', { power: 3, joy: 3 }), song('z', { power: 5, joy: 1 }), song('low', { power: 3, joy: 1 }),
  ], ['power', 'joy'])
  assert.deepEqual(result.topScoreTracks.map(({ id }) => id), ['a', 'z'])
  assert.equal(pickRandomTopRecommendation(result, 0).id, 'a')
  assert.equal(pickRandomTopRecommendation(result, 0.75).id, 'z')
})

test('2개·3개 키워드는 모두 맞는 평균 1점 이내 후보에서 직전 추천곡을 제외해 다시 추첨한다', () => {
  const songs = [
    song('top', { power: 5, joy: 5, wonder: 5 }),
    song('near', { power: 4, joy: 4, wonder: 4 }),
    song('far', { power: 3, joy: 3, wonder: 3 }),
    song('partial', { power: 5, joy: 5, wonder: 1 }),
  ]
  for (const keys of [['power', 'joy'], ['power', 'joy', 'wonder']]) {
    const result = getRecommendationResult(songs, keys)
    const candidates = getKeywordRecommendationCandidates(result, keys)
    assert.deepEqual(candidates.map(({ id }) => id), keys.length === 2 ? ['partial', 'top', 'near'] : ['top', 'near'])
    const previous = candidates[0].id
    assert.notEqual(pickRandomKeywordRecommendation(result, keys, 0, previous).id, previous)
    assert.notEqual(pickRandomKeywordRecommendation(result, keys, 0.99, previous).id, previous)
  }
  const single = getRecommendationResult(songs, ['power'])
  assert.deepEqual(getKeywordRecommendationCandidates(single, ['power']).map(({ id }) => id), ['partial', 'top', 'near'])

  const sparseKeys = ['power', 'joy', 'wonder']
  const sparse = getRecommendationResult([
    song('only-balanced', { power: 5, joy: 5, wonder: 5 }),
    song('closest', { power: 5, joy: 5, wonder: 1 }),
    song('next', { power: 4, joy: 4, wonder: 1 }),
  ], sparseKeys)
  const sparseCandidates = getKeywordRecommendationCandidates(sparse, sparseKeys)
  assert.deepEqual(sparseCandidates.map(({ id }) => id), ['only-balanced'])
  assert.equal(pickRandomKeywordRecommendation(sparse, sparseKeys, 0, 'only-balanced').id, 'only-balanced')
})

test('한 감정은 최고점에서 1점 이내만 후보로 삼고 점수가 높을수록 큰 추첨 가중치를 받는다', () => {
  const songs = [
    song('five', { sadness: 5 }), song('four-half', { sadness: 4.5 }), song('four', { sadness: 4 }),
    song('three-half', { sadness: 3.5 }), song('irrelevant', { sadness: 2.5 }),
  ]
  const keys = ['sadness'], result = getRecommendationResult(songs, keys)
  const groups = getKeywordCandidateGroups(result, keys)
  assert.deepEqual(getKeywordRecommendationCandidates(result, keys).map(({ id }) => id), ['five', 'four-half', 'four'])
  assert.ok(getKeywordRecommendationWeight(songs[0], keys, groups) > getKeywordRecommendationWeight(songs[1], keys, groups))
  assert.ok(getKeywordRecommendationWeight(songs[1], keys, groups) > getKeywordRecommendationWeight(songs[2], keys, groups))
  assert.ok(!getKeywordRecommendationCandidates(result, keys).some(({ id }) => id === 'irrelevant'))
})

test('복수 감정은 평균 70%와 최저점 30%로 균형을 반영하고 2.5점 미만 곡을 제외한다', () => {
  const keys = ['power', 'joy']
  const uneven = song('uneven', { power: 5, joy: 2 })
  const balanced = song('balanced', { power: 3.5, joy: 3.5 })
  assert.equal(getKeywordMetrics(uneven, keys).average, getKeywordMetrics(balanced, keys).average)
  assert.ok(getKeywordMetrics(balanced, keys).balancedFit > getKeywordMetrics(uneven, keys).balancedFit)
  const groups = getKeywordCandidateGroups(getRecommendationResult([uneven, balanced], keys), keys)
  assert.deepEqual(groups.eligible.map(({ id }) => id), ['balanced'])
  assert.equal(pickRandomKeywordRecommendation(getRecommendationResult([uneven, balanced], keys), keys, 0).id, 'balanced')
})

test('숨은 일치와 새로운 발견을 높은 일치와 중복 없이 3·1·1로 구성한다', () => {
  const keys = ['power', 'joy']
  const hidden = song('hidden', { power: 3.5, joy: 3.5 })
  const discovery = song('discovery', Object.fromEntries(emotionKeys.map((key) => [key, 4])))
  discovery.emotionScores.power = 5; discovery.emotionScores.joy = 2.5
  const songs = [
    song('high-1', { power: 5, joy: 5 }), song('high-2', { power: 4.5, joy: 4.5 }), song('high-3', { power: 4, joy: 4 }),
    hidden, discovery,
  ]
  const result = getRecommendationResult(songs, keys)
  const groups = getKeywordCandidateGroups(result, keys)
  assert.ok(groups.hidden.some(({ id }) => id === 'hidden'))
  assert.ok(groups.discovery.some(({ id }) => id === 'discovery'))
  const mixed = getDiversifiedKeywordRecommendations(result, keys, { random: () => 0 })
  assert.equal(mixed.tracks.length, 5)
  assert.equal(new Set(mixed.tracks.map(({ id }) => id)).size, 5)
  assert.equal([...mixed.categories.values()].filter((value) => value === 'high').length, 3)
  assert.equal([...mixed.categories.values()].filter((value) => value === 'hidden').length, 1)
  assert.equal([...mixed.categories.values()].filter((value) => value === 'discovery').length, 1)
})

test('최근 노출은 같은 감정 조합에서 가중치를 낮추되 후보가 하나면 다시 사용할 수 있다', () => {
  const keys = ['sadness'], conditionKey = 'sadness'
  const songs = [song('recent', { sadness: 5 }), song('fresh', { sadness: 5 })]
  const result = getRecommendationResult(songs, keys)
  const exposures = [{ trackId: 'recent', conditionKey, count: 3, lastShownAt: 3 }]
  const groups = getKeywordCandidateGroups(result, keys, { exposures, conditionKey })
  assert.ok(getKeywordRecommendationWeight(songs[0], keys, groups, { exposures, conditionKey })
    < getKeywordRecommendationWeight(songs[1], keys, groups, { exposures, conditionKey }))
  assert.equal(getRecentExposureCount(exposures, 'other', 'recent'), 0)
  const only = getRecommendationResult([songs[0]], keys)
  assert.equal(pickRandomKeywordRecommendation(only, keys, 0.5, null, { exposures, conditionKey }).id, 'recent')
  assert.equal(pickRandomKeywordRecommendation(result, keys, 0.75, null, { exposures, conditionKey }).id,
    pickRandomKeywordRecommendation(result, keys, 0.75, null, { exposures, conditionKey }).id, '고정 난수에서는 렌더링마다 바뀌지 않음')
})

test('추천 노출 기록은 저장 개수를 제한하고 저장소 오류에도 빈 기록으로 계속 동작한다', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
  for (let index = 0; index < RECOMMENDATION_EXPOSURE_MAX_RECORDS + 10; index += 1) {
    recordRecommendationExposures([`track-${index}`], `condition-${index}`, { storage, now: index })
  }
  const records = readRecommendationExposures(storage)
  assert.equal(records.length, RECOMMENDATION_EXPOSURE_MAX_RECORDS)
  assert.ok(values.has(RECOMMENDATION_EXPOSURE_STORAGE_KEY))
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.deepEqual(readRecommendationExposures(blocked), [])
  assert.doesNotThrow(() => recordRecommendationExposures(['track'], 'condition', { storage: blocked }))
})

test('실제 키워드마다 최고 점수 동점곡 모두가 대표곡이 될 수 있으며 단독 최고점은 유지한다', () => {
  for (const key of emotionKeys) {
    const result = getRecommendationResult(tracks, [key])
    const highest = Math.max(...result.tracks.map((track) => track.emotionScores[key]))
    const picked = result.topScoreTracks.map((_, i) => pickRandomTopRecommendation(result, (i + 0.5) / result.topScoreTracks.length))
    assert.ok(picked.every((track) => track.emotionScores[key] === highest))
    assert.equal(new Set(picked.map(({ id }) => id)).size, result.topScoreTracks.length)
  }
  const power = getRecommendationResult([song('only-highest', { power: 5 }), song('lower', { power: 4 })], ['power'])
  assert.equal(pickRandomTopRecommendation(power, 0.99).id, 'only-highest')
})

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
  assert.deepEqual(getRepresentativeEmotions(tracks.find(({ id }) => id === 'chopin-etude-op25-no10')).map(({ key }) => key), ['power', 'transcendence', 'tension'])
})

test('보관곡만 중복 없이 정규화 평균하고 보관·해제 후 정확히 재계산한다', () => {
  const a = tracks[0], b = tracks[2]
  const first = getLibraryPreferenceProfile(tracks, [a.id, a.id, 'removed'])
  assert.equal(first.count, 1)
  assert.deepEqual(first.vector, emotionVector(a))
  const both = getLibraryPreferenceProfile(tracks, [a.id, b.id])
  assert.deepEqual(both.vector, emotionVector(a).map((value, i) => (value + emotionVector(b)[i]) / 2))
  assert.deepEqual(getLibraryPreferenceProfile(tracks, [b.id]).vector, emotionVector(b))
  assert.equal(first.emotionProfile.wonder, 0.375)
  assert.deepEqual(first.topEmotions, ['power'])
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
  assert.equal(result.length, tracks.length - profile.savedIdSet.size)
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
  for (const track of tracks) {
    assert.ok(composerImages[track.composer])
    assert.ok(existsSync(new URL('../../public' + composerImages[track.composer], import.meta.url)))
    assert.ok(track.summary ? track.description === track.summary : track.description.includes(track.composer))
  }
  assert.ok(Object.keys(trackDetails).every((id) => tracks.some((track) => track.id === id)))
  assert.equal(tracks.filter((track) => trackDetails[track.id]?.shortPreview && track.composer === '베토벤').length, 21)
  assert.equal(tracks.filter((track) => trackDetails[track.id]?.shortPreview).length, 115)
  assert.deepEqual(buildRecommendationDiagnosis().emotions.map(({ key }) => key), emotionKeys)
})

test('슈베르트 즉흥곡 D.899 Op.90 네 곡의 0.5점 점수·설명·영상 구간을 보존한다', () => {
  const expected = [
    [1, [3.5,2.5,2,3,2,1.5,3,3.5,4], '엄숙한 발걸음에서 시작해 격정과 위로를 오가는, 긴 독백 같은 즉흥곡.', 'hp1G3qUY5X8', 546],
    [2, [2.5,2,1,1.5,1,3.5,3,3.5,2], '반짝이는 음들이 달려가다가 거친 불안으로 뒤집히는, 밝음과 어둠의 즉흥곡.', 'L4B1IJmjsyo', 288],
    [3, [4,2.5,3.5,4.5,4.5,1.5,1,1.5,3], '잔잔하게 흐르는 반주 위에 따뜻함과 그리움이 길게 번지는 피아노의 노래.', 'dMi9AHqKWWs', 380],
    [4, [3,2,2.5,2.5,2,3,2.5,3,3.5], '쏟아지는 음들의 유려함 사이로 깊은 그리움이 모습을 드러내는 즉흥곡.', 'WbtzTNgJXNE', 481],
  ]
  for (const [number, scores, summary, videoId, endSeconds] of expected) {
    const id = `schubert-impromptu-d899-op90-no${number}`
    const track = tracks.find((item) => item.id === id)
    const detail = trackDetails[id]
    assert.ok(track)
    assert.equal(track.title, `슈베르트 즉흥곡 D.899 Op.90 No.${number}`)
    assert.equal(track.titleEn, `Schubert Impromptu D.899 Op.90 No.${number}`)
    assert.equal(track.opus, 90)
    assert.equal(track.number, number)
    assert.equal(track.catalogue, 'D')
    assert.equal(track.catalogueNumber, 899)
    assert.equal(track.ratingUnit, 'whole-work')
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [id]).vector, scores.map((score) => (score - 1) / 4))
    assert.equal(track.summary, summary)
    assert.equal(track.description, summary)
    assert.equal(detail.shortPreview.videoId, videoId)
    assert.equal(detail.shortPreview.startSeconds, 0)
    assert.equal(detail.shortPreview.endSeconds, endSeconds)
    assert.ok(detail.about && detail.listeningTip && detail.shortPreview.sourceLabel)
  }
})

test('라흐마니노프·사티·리스트 8곡의 최신 점수와 작품번호가 추천·취향에 반영된다', () => {
  const expected = [
    ['rachmaninoff-prelude-op23-no1', [2.5,1.5,2.5,3,1.5,1,1.5,2.5,4.5]],
    ['rachmaninoff-prelude-op23-no5', [2.5,3.5,1.5,2.5,1,1.5,4.5,3.5,2.5]],
    ['rachmaninoff-elegy-op3-no1', [4,3,2.5,3,1.5,1,3,3,5]],
    ['rachmaninoff-prelude-op3-no2', [3,4.5,1.5,1,1,1,4.5,4.5,3]],
    ['satie-gymnopedie-no1', [2,1,4.5,3.5,4.5,1,1,1,2.5]],
    ['satie-gymnopedie-no2', [1.5,1,4,3,3,1,1,2,2.5]],
    ['satie-gymnopedie-no3', [2,1,4.5,3.5,3,1,1,1.5,3.5]],
    ['liszt-liebestraum-s541-no3', [4,3,2.5,4.5,2.5,1.5,2.5,2.5,3.5]],
  ]
  for (const [id, scores] of expected) {
    const track = tracks.find((track) => track.id === id)
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [id]).vector, scores.map((score) => (score - 1) / 4))
  }
  const liszt = tracks.find((track) => track.id === 'liszt-liebestraum-s541-no3')
  assert.equal(liszt.catalogue, 'S')
  assert.equal(liszt.catalogueNumber, 541)
  assert.equal(liszt.opus, null)
  const nostalgic = getRecommendationResult(tracks, ['nostalgia']).topScoreTracks
  for (const number of [1, 3]) assert.ok(nostalgic.some((track) => track.id === `satie-gymnopedie-no${number}`))
})

test('베토벤 18악장의 162개 점수와 작품번호를 보존하고 악장별 추천·취향에 반영한다', () => {
  const groups = [
    ['op13-no8', '비창', [[2.5,4,1,1.5,1,1,4,4.5,3], [4,2,2,4.5,4.5,1.5,1,1.5,2.5], [2,2.5,1,1.5,1,2.5,3,3.5,2]]],
    ['op27-2-no14', '월광', [[3.5,2,4,3,2.5,1,1,3,4], [2,1,1.5,3.5,3,3.5,1.5,1,1], [2,4.5,1,1,1,1,5,5,1.5]]],
    ['op31-2-no17', '템페스트', [[2.5,3.5,1.5,1.5,1,1,4,4.5,2.5], [3,2,2,4,3.5,1,1,1.5,2.5], [2.5,3.5,1.5,1.5,1,1.5,3.5,4,3]]],
    ['op53-no21', '발트슈타인', [[2.5,3.5,1,2,1.5,4,4.5,3.5,1], [3,2,2.5,2.5,1.5,1,1,3.5,1.5], [4,4.5,2,2,2,4.5,4.5,3,1]]],
    ['op57-no23', '열정', [[3,4.5,1,1.5,1,1,4.5,5,3], [3.5,2,1.5,3.5,4,1.5,1.5,1.5,2], [2.5,4.5,1,1,1,1,5,5,2]]],
    ['op81a-no26', '고별', [[3,2.5,1.5,2.5,1.5,2,3,3,3.5], [3,1.5,2,3,1.5,1,1,2.5,4.5], [2.5,3.5,1,1.5,1.5,5,4,2.5,1]]],
  ]
  for (const [work, alias, movements] of groups) movements.forEach((scores, i) => {
    const id = `beethoven-sonata-${work}-m${i + 1}`
    const track = tracks.find((track) => track.id === id)
    assert.equal(track.movementNumber, i + 1)
    assert.equal(track.movement, `${i + 1}악장`)
    assert.equal(track.alias, alias)
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [id]).vector, scores.map((score) => (score - 1) / 4))
    emotionKeys.forEach((key, j) => {
      assert.equal(getRecommendationResult(tracks, [key]).tracks.some((track) => track.id === id), scores[j] >= 3)
    })
  })
  for (const number of [14, 17]) {
    const track = tracks.find((track) => track.composer === '베토벤' && track.number === number)
    assert.equal(track.opus, number === 14 ? 27 : 31)
    assert.equal(track.opusPart, 2)
  }
  assert.equal(tracks.find((track) => track.id === 'beethoven-sonata-op81a-no26-m1').opusSuffix, 'a')
  assert.ok(getRecommendationResult(tracks, ['tension']).topScoreTracks.some((track) => track.id === 'beethoven-sonata-op27-2-no14-m3'))
  assert.ok(getRecommendationResult(tracks, ['joy']).topScoreTracks.some((track) => track.id === 'beethoven-sonata-op81a-no26-m3'))
})

test('월광 세 악장은 사용자 제공 바렌보임 영상과 각 악장의 구간을 사용한다', () => {
  const media = [['YxL1i0MQDeI', 429], ['zKw9ads-XAg', 145], ['e747wgxSQ0Q', 498]]
  media.forEach(([videoId, endSeconds], i) => {
    const preview = trackDetails[`beethoven-sonata-op27-2-no14-m${i + 1}`].shortPreview
    assert.equal(preview.videoId, videoId)
    assert.equal(preview.startSeconds, 0)
    assert.equal(preview.endSeconds, endSeconds)
    assert.match(preview.sourceLabel, /Daniel Barenboim/)
  })
})

test('황제 협주곡 세 악장은 기존 ID와 수정된 점수·설명·각각의 영상 구간을 보존한다', () => {
  const cases = [
    { scores: [4,4.5,1,1.5,1.5,3.5,4.5,3,1], videoId: 'MlrNjdYnheM', endSeconds: 1259 },
    { scores: [3.5,2.5,2.5,4.5,4.5,1.5,1,1.5,2.5], videoId: 'QsrnBnnoQ00', endSeconds: 501 },
    { scores: [3.5,4,1,1.5,1,4.5,4.5,2,1], videoId: 'DRPhtnden5g', endSeconds: 623 },
  ]
  cases.forEach(({ scores, videoId, endSeconds }, index) => {
    const id = `beethoven-piano-concerto-op73-no5-m${index + 1}`
    const track = tracks.find((item) => item.id === id)
    const detail = trackDetails[id]
    assert.equal(track.movementNumber, index + 1)
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.equal(track.description, track.summary)
    assert.ok(track.summary && detail.about && detail.listeningTip)
    assert.deepEqual(detail.shortPreview, { provider: 'youtube', videoId, startSeconds: 0, endSeconds,
      sourceLabel: 'Krystian Zimerman · London Symphony Orchestra · Sir Simon Rattle / Krystian Zimerman - Topic / 《Beethoven: Complete Piano Concertos》 · Deutsche Grammophon (2021)' })
  })
})

test('차이콥스키 사계 12곡은 사용자 점수·영문 제목·감상 설명·월별 영상 구간을 보존한다', () => {
  const rows = [
    [[3,1.5,3,4.5,4,1.5,1.5,1.5,2.5], '난롯가에서', 'IDUCeZW7Vqs', 297],
    [[2.5,2,1,1.5,1,4.5,4,2.5,1], '사육제', '9yv1b-OJaY0', 190],
    [[3,1.5,3,3.5,2.5,1.5,1,2,3.5], '종달새의 노래', 'BffmJzn-M1g', 148],
    [[3,1.5,2,4,3.5,3.5,1.5,1.5,2], '스노드롭', 'v2YieM-Ga8E', 163],
    [[4,2,3.5,4,3,3,2.5,2,2], '백야', 'ovaKRK5A_Ms', 239],
    [[4,2,3.5,4.5,3,2,2,2,4.5], '뱃노래', '1OE9j6mcviU', 252],
    [[2,1,1,2,2,3.5,3,1.5,1], '풀 베는 사람의 노래', 'dybRB0rpumc', 118],
    [[2.5,2,1,2,1.5,3.5,4,3.5,1.5], '수확', 'JwJmhCme3M4', 215],
    [[2.5,2.5,1,1,1,4,4.5,2.5,1], '사냥', 'hqmLglbqlPg', 171],
    [[3.5,1.5,3.5,4,2,1,1.5,2,4.5], '가을의 노래', 'N8pcv5HmL24', 286],
    [[3,1.5,2.5,2.5,2.5,4,2.5,1.5,2.5], '트로이카', 'yXejWsfggFs', 183],
    [[3,1.5,2,3.5,3,4,2,1.5,2], '크리스마스', '3fJ0oVboB0w', 273],
  ]
  rows.forEach(([scores, alias, videoId, endSeconds], index) => {
    const month = index + 1
    const id = `tchaikovsky-seasons-op37a-no${month}`
    const track = tracks.find((item) => item.id === id)
    const detail = trackDetails[id]
    assert.equal(track.alias, alias)
    assert.equal(track.opus, 37)
    assert.equal(track.opusSuffix, 'a')
    assert.equal(track.number, month)
    assert.equal(track.cycleId, 'tchaikovsky-seasons-op37a')
    assert.ok(track.titleEn.startsWith('Tchaikovsky Four Seasons '))
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.equal(track.ratingUnit, 'whole-work')
    assert.equal(track.description, track.summary)
    assert.ok(detail.about && detail.listeningTip)
    assert.deepEqual(detail.shortPreview, { provider: 'youtube', videoId, startSeconds: 0, endSeconds,
      sourceLabel: 'Alexander Malofeev · Mariinsky Theatre · 2019.12.26 리사이틀' })
  })
  assert.equal(new Set(rows.map(([, , videoId]) => videoId)).size, 12)
  assert.deepEqual(getLibraryPreferenceProfile(tracks, ['tchaikovsky-seasons-op37a-no10']).vector,
    rows[9][0].map((score) => (score - 1) / 4))
})
