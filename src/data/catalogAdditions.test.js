import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { tracks, trackDetails } from './musicData.js'
import { emotionKeys, formatTrackTitle, isFullyRated } from './emotions.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from './recommendations.js'

const inputs = JSON.parse(readFileSync(new URL('../../data/manual/catalog-additions-2026-10-19.json', import.meta.url), 'utf8'))
const seconds = value => value.split(':').map(Number).reduce((m, s) => m * 60 + s)
test('신규 34곡의 306개 점수·제목·설명·출처·재생 구간을 사용자 입력과 대조한다', () => {
  assert.equal(inputs.length, 34)
  assert.equal(new Set(inputs.map(input => input.id)).size, 34)
  assert.deepEqual(tracks.slice(81, 115).map(track => track.id), inputs.map(input => input.id))
  for (const input of inputs) {
    const track = tracks.find(track => track.id === input.id)
    const detail = trackDetails[input.id]
    assert.equal(formatTrackTitle(track), input.titleKorean.replace(/\s*‘[^’]+’/, '').replace(/ : (\d악장)/, ' - $1'))
    assert.equal(track.alias, input.titleKorean.match(/‘([^’]+)’/)?.[1] || '')
    assert.equal(track.titleEn, input.titleEn)
    assert.equal(track.summary, input.summary)
    assert.equal(track.description, input.summary)
    assert.deepEqual(Object.keys(track.emotionScores), emotionKeys)
    assert.deepEqual(track.emotionScores, input.emotionScores)
    assert.ok(isFullyRated(track))
    const [about, tip] = input.backgroundAndPoint.split('감상 포인트:')
    assert.equal(detail.about, about.trim())
    assert.equal(detail.listeningTip, tip.trim())
    const link = new URL(input.link)
    assert.equal(link.origin, 'https://www.youtube.com')
    assert.equal(link.pathname, '/watch')
    assert.match(link.searchParams.get('v'), /^[A-Za-z0-9_-]{11}$/)
    assert.equal(detail.pendingPreview, undefined)
    assert.deepEqual(detail.shortPreview, {
      provider: 'youtube', videoId: link.searchParams.get('v'),
      startSeconds: seconds(input.start), endSeconds: seconds(input.end), sourceLabel: input.sourceLabel,
    })
    assert.deepEqual(getLibraryPreferenceProfile(tracks, [input.id]).vector, Object.values(input.emotionScores).map(s => (s - 1) / 4))
    for (const key of emotionKeys) assert.equal(getRecommendationResult(tracks, [key]).tracks.some(t => t.id === input.id), input.emotionScores[key] >= 3)
    assert.equal(track.ratingUnit, track.movementNumber ? 'whole-movement' : 'whole-work')
  }
})
