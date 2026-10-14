import test from 'node:test'
import assert from 'node:assert/strict'
import { tracks, trackDetails } from './musicData.js'
import { weeklySelections } from './weeklySelections.js'
import { getKoreanDate, getWeeklySelectionState, getSelectionPreview } from './weeklySelectionHelpers.js'

const first = weeklySelections[0]
const state = (entries, now = '2026-10-14T03:00:00Z') => getWeeklySelectionState(entries, tracks, now)

test('한국 날짜와 양 끝 날짜 포함: UTC 기준 전날 15시에 시작하고 종료일 다음 날 15시에 종료한다', () => {
  assert.equal(getKoreanDate('2026-10-13T14:59:59.999Z'), '2026-10-13')
  assert.equal(state([first], '2026-10-13T14:59:59.999Z').current, null)
  assert.equal(state([first], '2026-10-13T15:00:00Z').current.id, first.id)
  assert.equal(state([first], '2026-10-31T14:59:59.999Z').current.id, first.id)
  assert.equal(state([first], '2026-10-31T15:00:00Z').current, null)
  assert.equal(state([first], '2026-10-31T15:00:00Z').archive[0].id, first.id)
})

test('현재·미래·지난·비공개 글을 분리하며 같은 곡의 이전 제목과 글을 보존한다', () => {
  const past = { ...first, id: 'past', title: '그때의 제목', reason: '그때의 선정 이유', startsOn: '2026-09-01', endsOn: '2026-09-07' }
  const older = { ...past, id: 'older', endsOn: '2026-09-02' }
  const future = { ...first, id: 'future', startsOn: '2026-11-01', endsOn: '2026-11-07' }
  const hidden = { ...past, id: 'hidden', published: false }
  const result = state([older, future, hidden, first, past])
  assert.equal(result.current.id, first.id)
  assert.deepEqual(result.archive.map(({ id }) => id), ['past', 'older'])
  assert.equal(result.archive[0].reason, '그때의 선정 이유')
  assert.deepEqual(new Set(result.readable.map(({ id }) => id)), new Set([first.id, 'past', 'older']))
  assert.equal(state([future, hidden]).current, null)
  assert.deepEqual(state([future, hidden]).archive, [])
})

test('겹치는 글 중 최근 시작일 하나를 선택하고 운영 진단을 반환한다', () => {
  const earlier = { ...first, id: 'earlier', startsOn: '2026-10-01' }
  const result = state([earlier, first])
  assert.equal(result.current.id, first.id)
  assert.ok(result.diagnostics.some((message) => message.includes('기간 겹침')))
})

test('잘못된 곡 ID·필수 정보·날짜·중복 ID는 건너뛰고 선택 항목을 기본값으로 처리한다', () => {
  const invalid = [null, { ...first, id: 'unknown', trackId: 'missing' }, { ...first, id: 'empty', reason: ' ' },
    { ...first, id: 'date', startsOn: '2026-02-30' }, { ...first, id: 'reverse', endsOn: '2026-10-01' }]
  assert.equal(state(invalid).current, null)
  const result = state([...invalid, { ...first, sectionName: '', editorName: 123, listeningMoment: null }, first])
  assert.equal(result.current.sectionName, '이번 주의 한 곡')
  assert.equal(result.current.editorName, '')
  assert.equal(result.readable.length, 1)
  assert.equal(result.diagnostics.length, 5)
})

test('미리듣기 구간은 기존 영상에 연결된 유효 구간만 적용하고 나머지는 기존 구간으로 돌아간다', () => {
  const detail = trackDetails[first.trackId], original = detail.shortPreview
  assert.equal(getSelectionPreview(first, detail).preview, original)
  const range = { videoId: original.videoId, start: '0:30', end: '1:10' }
  const custom = getSelectionPreview({ ...first, previewRange: range }, detail)
  assert.equal(custom.custom, true)
  assert.equal(custom.preview.startSeconds, 30)
  assert.equal(custom.preview.endSeconds, 70)
  assert.equal(custom.preview.videoId, original.videoId)
  for (const changes of [{ videoId: 'other' }, { start: '-1:00' }, { start: '0:60' }, { start: '1:10' }, { end: '0:20' }, { end: '' }, { start: 30 }]) {
    assert.deepEqual(getSelectionPreview({ ...first, previewRange: { ...range, ...changes } }, detail), { preview: original, custom: false })
  }
  assert.deepEqual(getSelectionPreview(first, {}), { preview: null, custom: false })
  assert.deepEqual(getSelectionPreview(first, { shortPreview: { provider: 'other', videoId: 'other' } }), { preview: null, custom: false })
})
