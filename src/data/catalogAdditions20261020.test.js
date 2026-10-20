import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { tracks, trackDetails } from './musicData.js'
import { emotionKeys, formatTrackTitle, isFullyRated } from './emotions.js'
import { getLibraryPreferenceProfile, getRecommendationResult } from './recommendations.js'
import { searchConcertTracks } from './concertTrackSearch.js'
import { getTrackTarget } from './workCatalog.js'
import { resolveConcertProgram } from './concertRecommendations.js'
import { matchConcertToTrack } from '../../server/programMatching.mjs'
import { analyzeStoredProgram, extractIdentity, matchIdentity } from '../../server/programAnalysis.mjs'

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
    assert.ok(searchConcertTracks(tracks, input.titleEn).some(t => t.id === input.id))
    const target = getTrackTarget(input.id)
    assert.equal(target.work.trackIds.length, track.movementNumber ? (track.number === 3 ? 5 : 4) : 1)
    const title = input.titleEn.replace(/ - (V|IV|III|II|I)$/, '')
    const concert = { programEvidence: { text: `프로그램\n${title}`, imageUrls: [] } }
    assert.equal(matchConcertToTrack(concert, input.id).status, 'matched', input.id)
    assert.equal(matchIdentity(extractIdentity(title), track.composer)[0].work_id, target.workId, input.id)
  }
  assert.equal(getTrackTarget('brahms-variations-op18b').work.opusSuffix, 'b')
  assert.equal(getTrackTarget('chopin-nocturne-b49').work.catalogue, 'B')
  assert.equal(getTrackTarget('mozart-fantasy-k397').work.catalogueNumber, 397)
  assert.equal(trackDetails['brahms-variations-op24'].shortPreview.endSeconds, 1588)
  assert.equal(inputs.find(t => t.id === 'brahms-variations-op24').originalEnd, '26:28:00')
})

test('작품번호·작곡가 충돌은 확정하지 않고 변주곡의 주제 원작자와 작곡가를 구분한다', () => {
  for (const title of ['Brahms Intermezzo Op.118 No.4', 'Brahms Intermezzo Op.118', 'Brahms Intermezzo Op.117 No.2']) {
    assert.notEqual(matchIdentity(extractIdentity(title), '브람스')[0].work_id, 'brahms-intermezzo-op118-no2')
  }
  for (const title of ['Chopin Nocturne B.108', 'Chopin Nocturne B.999']) {
    assert.notEqual(matchIdentity(extractIdentity(title), '쇼팽')[0].work_id, 'chopin-nocturne-b49')
  }
  for (const title of ['Mozart Fantasy K.475', 'Mozart Fantasy K.999']) {
    assert.notEqual(matchIdentity(extractIdentity(title), '모차르트')[0].work_id, 'mozart-fantasy-k397')
  }
  assert.equal(matchIdentity(extractIdentity('브람스 슈만 주제에 의한 변주곡 Op.9'), '브람스')[0].work_id, 'brahms-variations-op9')
  assert.equal(matchIdentity(extractIdentity('Brahms and Schumann Variations Op.9'), '브람스')[0].outcome, 'AMBIGUOUS')
})

test('파가니니 변주곡은 기존 단일 곡을 제거하고 두 권을 독립적으로 추천·검색·연결한다', () => {
  const oldId = 'brahms-variations-op35'
  const ids = [1, 2].map(n => `${oldId}-book${n}`)
  assert.equal(getTrackTarget(oldId), null)
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
    assert.deepEqual(searchConcertTracks(tracks, `브람스 Op.35 제${n}권`).map(t => t.id), [id])
    assert.deepEqual(resolveConcertProgram({ programWorkIds: [id] }, tracks)[0].linkedTracks.map(t => t.id), [id])
    for (const title of [track.titleEn, track.title, `Brahms Variations Op.35 Book ${n === 1 ? 'I' : 'II'}`]) {
      const result = matchConcertToTrack({ programEvidence: { text: `PROGRAM\n${title}`, imageUrls: [] } }, id)
      assert.equal(result.status, 'matched', title)
      assert.equal(matchIdentity(extractIdentity(title), '브람스')[0].work_id, id, title)
      assert.notEqual(matchIdentity(extractIdentity(title), '브람스')[0].work_id, ids[1 - index])
    }
  }
  for (const title of ['Brahms Variations Op.35', 'Brahms Variations Op.35 Book 3', 'Brahms Variations Op.35 Book 1 Book 2']) {
    for (const id of ids) {
      assert.notEqual(matchConcertToTrack({ programEvidence: { text: `PROGRAM\n${title}`, imageUrls: [] } }, id).status, 'matched')
      assert.notEqual(matchIdentity(extractIdentity(title), '브람스')[0].work_id, id)
    }
  }
  for (const raw_text of [
    'PROGRAM\nBrahms\nVariations Op.35 Book 1\nVariations Op.35 Book 2',
    '프로그램\n브람스\n파가니니 주제에 의한 변주곡 Op.35 제1권\n파가니니 주제에 의한 변주곡 Op.35 제2권',
  ]) {
    const result = analyzeStoredProgram({
      concert: { id: 'book-test-concert', kopis_id: 'PF900001', title: 'Local fixture', venue: 'Local fixture hall', region: '서울', start_date: '2026-10-20', end_date: '2026-10-20' },
      image: { id: 'book-test-image', is_active: true, image_type: 'DETAIL', evidence_revision: 0, source_url: 'https://kopis.or.kr/upload/local-fixture.png' },
      ocr: { id: 'book-test-ocr', raw_text, detections: [], width: 800, processed_at: '2026-10-20T00:00:00Z' },
      attempt: { id: 'book-test-attempt' },
    })
    assert.deepEqual(result.candidates.map(c => c.track_id), ids)
  }
})
