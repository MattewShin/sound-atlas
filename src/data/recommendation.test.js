import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { emotionKeys, emotions, formatTrackTitle, getRepresentativeEmotions, isFullyRated, RATING_VERSION } from './emotions.js'
import { composerImages, tracks, trackDetails } from './musicData.js'
import { cosineSimilarity, emotionVector, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult, pickRandomTopRecommendation } from './recommendations.js'
import { feelingOptions, getSuggestedEmotions } from './feelingSuggestions.js'
import { buildRecommendationDiagnosis } from '../../scripts/diagnoseRecommendations.js'

test('확장 카탈로그의 구성, 제목·별칭, 전체 점수, 평가 출처가 확정 CSV와 전부 일치한다', () => {
  const rows = readFileSync(new URL('../../data/manual/manual-emotions-v1.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
  assert.deepEqual(rows.shift().split(',').slice(2), emotionKeys)
  assert.equal(rows.length, 62)
  assert.equal(tracks.length, rows.length)
  assert.equal(new Set(tracks.map(({ id }) => id)).size, rows.length)
  assert.equal(tracks.filter((track) => track.composer === '쇼팽').length, 36)
  assert.equal(tracks.filter((track) => track.composer === '라흐마니노프').length, 4)
  assert.equal(tracks.filter((track) => track.composer === '사티').length, 3)
  assert.equal(tracks.filter((track) => track.composer === '리스트').length, 1)
  assert.equal(tracks.filter((track) => track.composer === '베토벤').length, 18)
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
    assert.match(track.id, /^(chopin|rachmaninoff|satie|liszt|beethoven)-/)
  })
  assert.equal(emotions.find(({ key }) => key === 'peacefulness').label, '평안한')
})

test('단일 감정의 높은 원점수는 항상 먼저 추천된다', () => {
  for (const key of emotionKeys) {
    const result = getRecommendationResult(tracks, [key]).tracks
    assert.ok(result.every((track) => track.emotionScores[key] >= 3))
    assert.ok(result.every((track, i) => !i || result[i - 1].emotionScores[key] >= track.emotionScores[key]))
  }
  assert.ok(getRecommendationResult(tracks, ['power']).topScoreTracks.some((track) => track.id === 'chopin-etude-op25-no10'))
  assert.ok(getRecommendationResult(tracks, ['peacefulness']).topScoreTracks.some((track) => track.id === 'chopin-ballade-op47-no3'))
  assert.equal(getRecommendationResult(tracks, ['transcendence']).tracks[0].emotionScores.transcendence, 5)
})

const song = (id, overrides = {}) => ({ id, emotionScores: Object.fromEntries(emotionKeys.map((key) => [key, overrides[key] ?? 1])) })
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
    assert.ok(track.description.includes(track.composer))
  }
  assert.ok(Object.keys(trackDetails).every((id) => tracks.some((track) => track.id === id)))
  assert.deepEqual(tracks.filter((track) => trackDetails[track.id]?.shortPreview).map((track) => track.id), ['beethoven-sonata-op27-2-no14-m1', 'beethoven-sonata-op27-2-no14-m3'])
  assert.deepEqual(buildRecommendationDiagnosis().emotions.map(({ key }) => key), emotionKeys)
})

test('새 8곡의 72개 점수와 작품번호가 사용자 입력 그대로이며 추천·취향에 반영된다', () => {
  const expected = [
    ['rachmaninoff-prelude-op23-no1', [2,1,2,3,2,1,1,1,4]],
    ['rachmaninoff-prelude-op23-no5', [1,3,1,1,1,4,4,3,2]],
    ['rachmaninoff-elegy-op3-no1', [4,2,1,2,1,1,3,3,5]],
    ['rachmaninoff-prelude-op3-no2', [3,4,1,1,1,1,4,4,3]],
    ['satie-gymnopedie-no1', [1,1,4,3,3,1,1,1,2]],
    ['satie-gymnopedie-no2', [1,1,4,3,3,1,1,3,1]],
    ['satie-gymnopedie-no3', [1,1,4,3,2,1,1,2,3]],
    ['liszt-liebestraum-s541-no3', [3,1,1,3,3,1,2,2,4]],
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
  const nostalgic = getRecommendationResult(tracks, ['nostalgia']).tracks
  assert.deepEqual(nostalgic.slice(0, 3).map((track) => track.id), ['satie-gymnopedie-no1', 'satie-gymnopedie-no2', 'satie-gymnopedie-no3'])
})

test('베토벤 18악장의 162개 점수와 작품번호를 보존하고 악장별 추천·취향에 반영한다', () => {
  const groups = [
    ['op13-no8', '비창', [[2,4,1,1,1,3,4,5,1], [5,2,2,3,3,1,1,1,4], [1,2,1,1,1,4,3,3,1]]],
    ['op27-2-no14', '월광', [[4,1,3,3,3,1,1,3,4], [2,1,1,4,4,3,1,1,1], [1,5,1,1,1,4,4,4,1]]],
    ['op31-2-no17', '템페스트', [[1,4,1,1,1,3,4,4,1], [3,1,1,3,3,1,1,1,2], [2,4,1,1,1,4,3,4,1]]],
    ['op53-no21', '발트슈타인', [[1,3,1,2,2,5,4,3,1], [3,1,1,3,4,1,1,1,1], [3,4,1,1,2,4,4,3,1]]],
    ['op57-no23', '열정', [[2,5,1,1,1,2,4,4,3], [4,1,1,3,3,2,1,1,4], [2,4,1,1,1,3,5,4,1]]],
    ['op81a-no26', '고별', [[2,1,1,2,2,4,4,1,1], [3,1,1,3,2,1,1,1,3], [1,4,1,1,1,4,4,3,1]]],
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
  assert.ok(getRecommendationResult(tracks, ['tension']).topScoreTracks.some((track) => track.id === 'beethoven-sonata-op13-no8-m1'))
  assert.ok(getRecommendationResult(tracks, ['joy']).topScoreTracks.some((track) => track.id === 'beethoven-sonata-op53-no21-m1'))
})

test('월광 영상은 기존에 등록된 정확한 두 악장의 재생 구간만 재사용한다', () => {
  const legacy = JSON.parse(readFileSync(new URL('../../data/manual/legacy-media.json', import.meta.url), 'utf8'))
  for (const movement of [1, 3]) {
    assert.deepEqual(trackDetails[`beethoven-sonata-op27-2-no14-m${movement}`].shortPreview, legacy[`beethoven-moonlight-${movement}`])
  }
  assert.equal(trackDetails['beethoven-sonata-op27-2-no14-m2']?.shortPreview, undefined)
})
