import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { tracks, trackDetails } from './musicData.js'
import { emotionKeys, formatTrackTitle, isFullyRated } from './emotions.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from './recommendations.js'

const inputs = JSON.parse(readFileSync(new URL('../../data/manual/catalog-additions-2026-10-20.json', import.meta.url), 'utf8'))
const seconds = value => { const [m, s] = value.split(':').map(Number); return m * 60 + s }
test('2026-10-20 추가·수정한 74곡의 666개 점수·제목·설명·영상 구간을 확정 입력과 대조한다', () => {
  assert.equal(inputs.length, 74)
  assert.equal(new Set(inputs.map(t => t.id)).size, 74)
  assert.deepEqual(tracks.slice(115, 189).map(t => t.id), inputs.map(t => t.id))
  for (const input of inputs) {
    const track = tracks.find(t => t.id === input.id), detail = trackDetails[input.id]
    assert.equal(formatTrackTitle(track), input.titleKorean.replace(/ : (\d악장)$/, ' - $1'))
    assert.equal(track.titleEn, input.titleEn)
    assert.equal(track.summary, input.summary)
    assert.equal(track.description, input.summary)
    assert.deepEqual(Object.keys(track.emotionScores), emotionKeys)
    assert.deepEqual(track.emotionScores, input.emotionScores)
    assert.ok(isFullyRated(track))
    assert.equal(track.ratingSource, 'manual')
    assert.equal(track.ratingVersion, 'manual-emotions-1')
    assert.equal(track.ratingUnit, track.movementNumber ? 'whole-movement' : 'whole-work')
    const [about, tip] = input.backgroundAndPoint.split('감상 포인트:')
    assert.equal(detail.about, about.trim())
    assert.equal(detail.listeningTip, tip.trim())
    assert.deepEqual(detail.shortPreview, {
      provider: 'youtube', videoId: new URL(input.link).searchParams.get('v'),
      startSeconds: seconds(input.start), endSeconds: seconds(input.end), sourceLabel: input.sourceLabel,
    })
    assert.ok(detail.shortPreview.endSeconds > detail.shortPreview.startSeconds)
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [input.id]).vector, Object.values(input.emotionScores).map(s => (s - 1) / 4))
    for (const key of emotionKeys) assert.equal(getRecommendationResult(tracks, [key]).tracks.some(t => t.id === input.id), input.emotionScores[key] >= 3)
  }
  assert.equal(trackDetails['brahms-variations-op24'].shortPreview.endSeconds, 1588)
  assert.equal(inputs.find(t => t.id === 'brahms-variations-op24').originalEnd, '26:28:00')
})

test('파가니니 변주곡은 기존 단일 곡을 제거하고 두 권의 평가·영상과 기존 ID 교체를 보존한다', () => {
  const oldId = 'brahms-variations-op35'
  const ids = [1, 2].map(n => `${oldId}-book${n}`)
  assert.ok(!tracks.some(t => t.id === oldId))
  assert.equal(trackDetails[oldId], undefined)
  assert.ok(!inputs.some(t => t.id === oldId))
  const expected = [
    [[4, 4.5, 1, 1, 1, 2.5, 5, 5, 2], 'PrFKU1bdoQU', 686],
    [[4, 4.5, 1.5, 1, 1, 2, 4.5, 5, 2.5], '_u9I9dAi3EE', 578],
  ]
  for (const [index, id] of ids.entries()) {
    const n = index + 1, track = tracks.find(t => t.id === id), [scores, videoId, endSeconds] = expected[index]
    assert.equal(track.bookNumber, n)
    assert.equal(track.movementNumber, null)
    assert.equal(track.ratingUnit, 'whole-work')
    assert.deepEqual(Object.values(track.emotionScores), scores)
    assert.equal(trackDetails[id].shortPreview.videoId, videoId)
    assert.equal(trackDetails[id].shortPreview.startSeconds, 0)
    assert.equal(trackDetails[id].shortPreview.endSeconds, endSeconds)
  }
})
