import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { tracks, trackDetails } from './musicData.js'
import { emotionKeys, formatTrackTitle, isFullyRated } from './emotions.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from './recommendations.js'
import { searchConcertTracks } from './concertTrackSearch.js'
import { getTrackTarget, workTypePatterns } from './workCatalog.js'
import { extractProgram, getExtractedWorkLinks, matchConcertToTrack } from '../../server/programMatching.mjs'

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
    assert.ok(searchConcertTracks(tracks, input.titleEn).some(t => t.id === input.id))
    const target = getTrackTarget(input.id)
    if (track.composer === '슈만') {
      assert.equal(track.ratingUnit, 'whole-movement')
      assert.equal(target.work.trackIds.length, 4)
      assert.equal(target.workId, input.id.replace(/-m\d$/, ''))
    } else assert.equal(track.ratingUnit, 'whole-work')
  }
})

test('신규 작품은 정확한 작곡가·작품번호·곡번호로만 연결하고 복합 제목을 구분한다', () => {
  const match = (text, id) => matchConcertToTrack({ programEvidence: { text: `프로그램\n${text}`, imageUrls: [] } }, id)
  for (const input of inputs) {
    const title = input.titleEn.replace(/ - (IV|III|II|I)$/, '')
    assert.equal(match(title, input.id).status, 'matched', input.id)
    assert.notEqual(match(title.replace(/Op\.\d+/, 'Op.999'), input.id).status, 'matched', input.id)
  }
  assert.notEqual(match('Chopin Polonaise Op.26', 'chopin-polonaise-op26-no1').status, 'matched')
  assert.notEqual(match('Chopin Polonaise Op.26 No.2', 'chopin-polonaise-op26-no1').status, 'matched')
  assert.notEqual(match('Schubert Impromptu D.899 Op.90 No.1', 'schubert-impromptu-d935-op142-no1').status, 'matched')
  for (const title of ['Chopin Fantaisie-impromptu Op.66', '쇼팽 환상즉흥곡 Op.66', 'Chopin Polonaise-fantaisie Op.61', '쇼팽 환상 폴로네즈 Op.61']) {
    assert.equal(Object.values(workTypePatterns).filter(re => re.test(title)).length, 1, title)
  }
  const extraction = extractProgram('프로그램\n슈만 피아노 소나타 No.1 Op.11\nI. Introduzione\nII. Aria\nIII. Scherzo\nIV. Finale')
  assert.equal(extraction.entries.length, 1)
  assert.deepEqual(getExtractedWorkLinks(extraction).map(link => link.workId), ['schumann-sonata-op11-no1'])
})
