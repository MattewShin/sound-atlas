import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteMusicRecord, journalDate, journalErrorMessage, listMusicRecords, saveMusicRecord, validateMusicRecord } from './musicJournal.js'

test('음악 기록은 유효한 날짜·유형·1~4000자 본문만 허용한다', () => {
  const record = { id: 'test-id', kind: 'practice', body: ' 연습했다 ', recorded_on: '2026-11-02', revision: 0 }
  assert.equal(validateMusicRecord(record), null)
  assert.ok(validateMusicRecord({ ...record, body: '  ' }))
  assert.ok(validateMusicRecord({ ...record, body: 'x'.repeat(4001) }))
  assert.ok(validateMusicRecord({ ...record, kind: 'public' }))
  assert.ok(validateMusicRecord({ ...record, recorded_on: '2026-02-30' }))
  assert.equal(journalDate(new Date(2026, 10, 2)), '2026-11-02')
  assert.match(journalErrorMessage({ code: '40001' }), /다른 기기/)
})

test('음악 기록 adapter는 본인·곡 필터, 10건 페이지와 안전한 RPC 인자를 사용한다', async () => {
  const calls = []
  const builder = Object.fromEntries(['select', 'eq', 'order'].map((method) => [method, (...args) => { calls.push([method, ...args]); return builder }]))
  builder.range = async (...args) => { calls.push(['range', ...args]); return { data: [{ id: 'one' }], count: 11 } }
  const client = { from: (table) => { calls.push(['from', table]); return builder }, rpc: async (name, args) => { calls.push([name, args]); return { data: [{ id: 'one' }] } } }
  const page = await listMusicRecords(client, 'owner-a', 'track-a', 1)
  assert.equal(page.total, 11)
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'user_id', 'owner-a'])))
  assert.deepEqual(calls.at(-1), ['range', 10, 19])
  const record = { id: 'one', body: ' text ', kind: 'free', recorded_on: '2026-11-02', revision: 0 }
  await saveMusicRecord(client, 'owner-a', 'track-a', record)
  assert.equal(calls.at(-1)[1].p_body, 'text')
  assert.equal(calls.at(-1)[1].p_owner_id, 'owner-a')
  await deleteMusicRecord(client, 'owner-a', record)
  assert.deepEqual(calls.at(-1), ['delete_private_music_record', { p_owner_id: 'owner-a', p_id: 'one', p_revision: 0 }])
  await assert.rejects(saveMusicRecord({ rpc: async () => ({ error: new Error('denied') }) }, 'owner-a', 'track-a', record), /denied/)
})
