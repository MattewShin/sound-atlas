import test from 'node:test'
import assert from 'node:assert/strict'
import { isStoryId, listPublicStories, publishMusicRecord, readPublicStory, PUBLIC_STORY_FIELDS, storyUrl, validateShare } from './musicSharing.js'
import { listMusicRecords } from './musicJournal.js'

test('공개 링크는 인증 query를 포함하지 않고 닉네임/본문 입력을 제한한다', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  assert.equal(isStoryId(id), true)
  assert.equal(isStoryId('invalid'), false)
  assert.equal(storyUrl(id, 'https://example.test/?code=secret'), `https://example.test/?story=${id}`)
  assert.equal(validateShare('피아노_산책', '글'), null)
  assert.ok(validateShare('me@example.com', '글'))
  assert.ok(validateShare('너무짧아도', ' '))
  assert.ok(validateShare('닉네임', 'x'.repeat(4001)))
})

test('전체 내 기록은 user 필터만, 공개 조회는 허용된 snapshot 열만 사용한다', async () => {
  const calls = []
  const query = Object.fromEntries(['select','eq','order'].map((method) => [method, (...args) => { calls.push([method,...args]); return query }]))
  query.range = async (...args) => { calls.push(['range',...args]); return { data: [], count: 0 } }
  query.maybeSingle = async () => ({ data: null })
  const client = { from: (table) => { calls.push(['from',table]); return query } }
  await listMusicRecords(client, 'a', null)
  assert.ok(calls.some(([method,key]) => method === 'eq' && key === 'user_id'))
  assert.ok(!calls.some(([method,key]) => method === 'eq' && key === 'track_id'))
  calls.length = 0
  await listPublicStories(client, 'track', 1)
  assert.deepEqual(calls.find(([method]) => method === 'select'), ['select',PUBLIC_STORY_FIELDS,{ count: 'exact' }])
  assert.deepEqual(calls.at(-1), ['range',10,19])
  calls.length = 0
  await readPublicStory(client, 'invalid')
  assert.equal(calls.length, 0)
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  await publishMusicRecord({ rpc: async (name,args) => { calls.push([name,args]); return { data: id } } }, 'a', { id: 'record', revision: 3 }, { id, nickname: '닉네임', body: ' 공개본 ' })
  assert.deepEqual(calls[0], ['publish_music_record', { p_owner_id: 'a',p_id:id,p_record_id:'record',p_revision:3,p_nickname:'닉네임',p_body:'공개본' }])
})
