import test from 'node:test'
import assert from 'node:assert/strict'
import { concertWorks } from './concerts.js'
import { tracks } from './musicData.js'
import { analyzeConcert, formatConcertDate, getConcertRecommendations, getConcertTicketStatus } from './concertRecommendations.js'
import { getEmotionFit } from './recommendations.js'

const now = Date.parse('2026-10-12T12:00:00+09:00')
const emperorId = 'beethoven-piano-concerto-op73-no5'
const movementIds = concertWorks[emperorId].trackIds
const unanalysedId = 'test-unanalysed-work'
const testWorks = { ...concertWorks, [unanalysedId]: { id: unanalysedId, title: '미등록 교향곡', composer: '베토벤', type: 'symphony', opus: 125, number: 9, trackIds: [] } }
const concert = {
  id: 'test-registered-concert', title: '테스트 등록 공연', programStatus: 'verified', programVerification: 'manual',
  startsAt: '2026-12-24T20:00:00+09:00', endsAt: '2026-12-24T22:00:00+09:00', region: '서울', venue: '테스트홀',
  ticketOpensAt: '2026-10-15T14:00:00+09:00', sourceUrl: 'https://example.com/concert', sourceLabel: '테스트 출처', verifiedOn: '2026-10-12',
  programWorkIds: [emperorId, unanalysedId],
}
const analyze = (trackList, options) => analyzeConcert(concert, trackList, options, testWorks)
const recommend = (trackList, options, list = [concert]) => getConcertRecommendations(trackList, options, list, testWorks)

test('황제 작품 연결은 실제 세 악장 ID·점수를 재사용하고 합창은 분석에서 제외한다', () => {
  const result = analyze(tracks, { selectedKeys: ['power'] })
  assert.deepEqual(result.program[0].linkedTracks.map(({ id }) => id), movementIds)
  result.program[0].linkedTracks.forEach((track) => assert.equal(track, tracks.find(({ id }) => id === track.id)))
  assert.equal(result.program[1].linkedTracks.length, 0)
  assert.equal(result.program[1].emotionFit, null)
  assert.equal(result.score, (0.75 + 0 + 0.75) / 3)
  assert.match(result.scope, /분석된 작품 기준/)
  assert.match(result.scope, /2작품 중 1작품/)
})

test('감정 변경 시 세 악장 모두의 평균 적합도와 실제 3점 이상 악장만 설명한다', () => {
  const soft = analyze(tracks, { selectedKeys: ['tenderness'] })
  const powerful = analyze(tracks, { selectedKeys: ['power'] })
  assert.equal(soft.program[0].emotionFit, 0.25)
  assert.deepEqual(soft.program[0].matches.map(({ track }) => track.movementNumber), [2])
  assert.match(soft.reasons.join(' '), /2악장: 부드러운 4\/5/)
  assert.deepEqual(powerful.program[0].matches.map(({ track }) => track.movementNumber), [1, 3])
  assert.notEqual(soft.score, powerful.score)
  const combined = analyze(tracks, { selectedKeys: ['power', 'joy', 'power', 'unknown'] })
  assert.equal(combined.score, (getEmotionFit(tracks.find(({ id }) => id === movementIds[0]), ['power', 'joy'])
    + getEmotionFit(tracks.find(({ id }) => id === movementIds[1]), ['power', 'joy'])
    + getEmotionFit(tracks.find(({ id }) => id === movementIds[2]), ['power', 'joy'])) / 3)
})

test('평점 수정 후 재계산은 수정된 점수·추천 설명을 반영하고 캐시 점수를 사용하지 않는다', () => {
  const before = analyze(tracks, { selectedKeys: ['nostalgia'] })
  const updated = tracks.map((track) => track.id === movementIds[1]
    ? { ...track, emotionScores: { ...track.emotionScores, nostalgia: 5 } } : track)
  const after = analyze(updated, { selectedKeys: ['nostalgia'] })
  assert.equal(before.isRecommended, false)
  assert.equal(after.isRecommended, true)
  assert.equal(after.score, 1 / 3)
  assert.match(after.reasons.join(' '), /2악장: 몽환적인 5\/5/)
  assert.equal(tracks.find(({ id }) => id === movementIds[1]).emotionScores.nostalgia, 2)
})

test('보관한 황제 2악장은 직접 연결로 설명하며 단순 등록과 구분한다', () => {
  const saved = analyze(tracks, { mode: 'library', savedTrackIds: [movementIds[1], movementIds[1]] })
  assert.equal(saved.hasDirectConnection, true)
  assert.match(saved.reasons.join(' '), /보관한 2악장.*황제.*직접 연결/)
  assert.equal(saved.program[0].savedTracks.length, 1)
  const empty = analyze(tracks, { mode: 'library' })
  assert.equal(empty.hasDirectConnection, false)
  assert.equal(empty.isRecommended, false)
  assert.equal(empty.score, null)
  assert.doesNotMatch(empty.reasons.join(' '), /좋아하는|보관한 2악장/)
  const unrelated = analyze(tracks, { mode: 'library', savedTrackIds: [tracks[0].id] })
  assert.equal(unrelated.hasDirectConnection, false)
  assert.match(unrelated.reasons.join(' '), /직접 연결된 보관곡은 없어요/)
})

test('악장·보관 ID·프로그램 작품·공연 중복은 결과나 작품 평균 점수를 중복 가산하지 않는다', () => {
  const options = { now, selectedKeys: ['joy'], savedTrackIds: movementIds }
  const normal = recommend(tracks, options)
  const duplicated = recommend([...tracks, ...tracks.filter(({ id }) => movementIds.includes(id))], options,
    [concert, { ...concert, programWorkIds: [...concert.programWorkIds, emperorId] }])
  assert.equal(duplicated.length, 1)
  assert.equal(duplicated[0].program.length, 2)
  assert.equal(duplicated[0].score, normal[0].score)
  assert.equal(duplicated[0].program[0].linkedTracks.length, 3)
  assert.equal(duplicated[0].program[0].savedTracks.length, 3)
})

test('합창의 실제 작품 메타데이터 평가가 추가되면 작품당 동일 비중으로 연결한다', () => {
  // 후속 평가 등록을 모사하는 테스트용 데이터이며 활성 목록에는 등록하지 않습니다.
  const symphony = { ...tracks[0], id: 'test-symphony', composer: '베토벤', type: 'symphony', opus: 125, number: 9,
    emotionScores: Object.fromEntries(Object.keys(tracks[0].emotionScores).map((key) => [key, 5])) }
  const result = analyze([...tracks, symphony], { selectedKeys: ['tenderness'] })
  assert.equal(result.program[1].ratedTracks[0], symphony)
  assert.equal(result.score, (0.25 + 1) / 2)
  assert.match(result.scope, /2작품 중 2작품/)
})

test('선택·평가 부족은 일반 안내이며 미평가 악장과 삭제된 보관 ID는 추정하지 않는다', () => {
  assert.equal(analyze(tracks).isRecommended, false)
  const unrated = tracks.map((track) => movementIds.includes(track.id) ? { ...track, emotionScores: {} } : track)
  const result = analyze(unrated, { selectedKeys: ['power'], savedTrackIds: ['deleted-track'] })
  assert.equal(result.score, null)
  assert.equal(result.isRecommended, false)
  assert.match(result.scope, /일반 공연 정보/)
  assert.equal(result.program[0].linkedTracks.length, 3)
})

test('한국 시간의 티켓 오픈 경계·공연 시작·종료와 지역에 맞춰 예정 목록을 표시한다', () => {
  assert.equal(getConcertTicketStatus(concert, Date.parse('2026-10-15T04:59:59Z')), '예매 오픈 예정')
  assert.equal(getConcertTicketStatus(concert, Date.parse('2026-10-15T05:00:00Z')), '예매 현황은 공식 페이지에서 확인')
  assert.equal(getConcertTicketStatus(concert, Date.parse(concert.endsAt)), '공연 종료')
  assert.equal(recommend(tracks, { now: Date.parse(concert.startsAt) }).length, 0)
  assert.equal(recommend(tracks, { now: Date.parse(concert.endsAt) }).length, 0)
  assert.equal(recommend(tracks, { now, region: '부산' }).length, 0)
  assert.equal(recommend(tracks, { now, region: '전국' }).length, 1)
  assert.match(formatConcertDate(concert.startsAt), /2026.*12.*24.*20:00/)
})
