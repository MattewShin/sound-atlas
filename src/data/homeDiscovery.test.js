import test from 'node:test'
import assert from 'node:assert/strict'
import { tracks } from './musicData.js'
import { isFullyRated } from './emotions.js'
import { getRecommendationResult } from './recommendations.js'
import { selectDiscoveryTracks, DISCOVERY_CARD_COUNT } from './homeDiscovery.js'

const ids = (list) => list.map(({ id }) => id)
test('초기 탐색은 기존 엔진의 평가 완료 후보에서 4곡을 골라 곡·작곡가와 직전 목록을 다양화한다', () => {
  const candidates = getRecommendationResult(tracks).tracks
  const before = ids(candidates)
  for (const draw of [0, 0.1, 0.5, 0.99]) {
    const first = selectDiscoveryTracks(candidates, [], DISCOVERY_CARD_COUNT, () => draw)
    const next = selectDiscoveryTracks(candidates, ids(first), DISCOVERY_CARD_COUNT, () => draw)
    assert.equal(first.length, 4)
    assert.equal(new Set(ids(first)).size, 4)
    assert.equal(new Set(first.map(({ composer }) => composer)).size, 4)
    assert.ok(first.every(isFullyRated))
    assert.ok(next.every(({ id }) => !ids(first).includes(id)), '같은 난수여도 곡 구성 자체가 바뀜')
    assert.ok(next.slice(1).every((track, index) => track.composer !== next[index].composer))
  }
  assert.deepEqual(ids(candidates), before, '원본 추천 순위 유지')
})

test('직전 목록에 다른 작곡가가 있어도 가능한 작곡가를 번갈아 배치한다', () => {
  const candidates = [
    { id: 'a1', composer: 'A' }, { id: 'a2', composer: 'A' }, { id: 'a3', composer: 'A' },
    { id: 'b1', composer: 'B' }, { id: 'b2', composer: 'B' },
  ]
  const result = selectDiscoveryTracks(candidates, ['b1', 'b2'], 4, () => 0)
  assert.deepEqual(result.map(({ composer }) => composer), ['A', 'B', 'A', 'B'])
})

test('빈 후보·적은 후보·단일 작곡가·중복 ID는 빈 카드나 중복 곡을 만들지 않는다', () => {
  assert.deepEqual(selectDiscoveryTracks([]), [])
  const track = { id: 'one', composer: 'A' }, other = { id: 'two', composer: 'A' }
  assert.deepEqual(new Set(ids(selectDiscoveryTracks([track, track, other], ['one', 'two']))), new Set(['one', 'two']))
  assert.deepEqual(ids(selectDiscoveryTracks([track], ['one'])), ['one'])
})
