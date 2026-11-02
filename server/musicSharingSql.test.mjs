import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('공유 SQL은 선택한 snapshot만 공개하고 소유자·원본·Auth 데이터는 숨긴다', async () => {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  const recordA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', recordB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const storyA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', storyB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const columns = 'id,track_id,nickname,body,kind,recorded_on,published_at'
  const asUser = async (user) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
    await db.exec('set role authenticated')
  }
  const createRecord = (id, owner, body = '비공개 원본', revision = 0) => db.query("select * from public.save_private_music_record($1,'chopin-ballade-op52-no4','reflection',$2,'2026-11-02',$3,$4)", [id, body, revision, owner])
  const publish = (id = storyA, record = recordA, owner = a, revision = 1, nickname = '피아노산책', body = '선택한 공개 내용') => db.query('select public.publish_music_record($1,$2,$3,$4,$5,$6) id', [id, record, revision, owner, nickname, body])
  const readPublic = () => db.query(`select ${columns} from public.music_record_publications order by published_at,id`)
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated;
      insert into auth.users values ('${a}'),('${b}');`)
    for (const name of ['202611020001_user_track_reactions.sql','202611020002_user_account_security.sql','202611020003_private_music_journal.sql','202611020004_music_record_sharing.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    }
    await asUser(a)
    await createRecord(recordA, a)
    assert.equal((await readPublic()).rows.length, 0, 'private creation never publishes')
    await assert.rejects(publish(storyA, recordA, b), (e) => e.code === '42501')
    await assert.rejects(publish(storyA, recordA, a, 2), (e) => e.code === '40001')
    await assert.rejects(publish(storyA, recordA, a, 1, 'email@example.com'), (e) => e.code === '22023')
    await assert.rejects(publish(storyA, recordA, a, 1, '피아노산책', ' '), (e) => e.code === '22023')
    await assert.rejects(publish(storyA, recordA, a, 1, '피아노산책', 'x'.repeat(4001)), (e) => e.code === '22023')
    assert.equal((await publish()).rows[0].id, storyA)
    await publish()
    assert.equal((await readPublic()).rows.length, 1, 'same UUID retry never duplicates')
    await assert.rejects(publish(storyB), (e) => e.code === '40001')
    await assert.rejects(db.query("update public.music_record_publications set body='unsafe'"), (e) => e.code === '42501')
    await assert.rejects(db.query("update public.user_music_nicknames set nickname='변경'"), (e) => e.code === '42501')
    await assert.rejects(db.query('select owner_id,source_record_id,source_revision from public.music_record_publications'), (e) => e.code === '42501')
    assert.equal((await db.query('select * from public.list_my_music_shares($1)', [a])).rows[0].source_record_id, recordA)
    await db.exec('reset role')
    await db.query(`insert into public.user_music_journal(id,user_id,track_id,body,recorded_on)
      select md5('quota-record-' || i)::uuid,$1,'quota-fixture','private',date '2026-11-02' from generate_series(1,100) i`, [a])
    await db.query(`insert into public.music_record_publications(id,owner_id,source_record_id,source_revision,track_id,nickname,body,kind,recorded_on)
      select md5('quota-story-' || i)::uuid,$1,md5('quota-record-' || i)::uuid,1,'quota-fixture','피아노산책','public','free',date '2026-11-02' from generate_series(1,99) i`, [a])
    const quotaSource = (await db.query("select md5('quota-record-100')::uuid id")).rows[0].id
    await asUser(a)
    await assert.rejects(publish(storyB, quotaSource), (e) => e.code === '54000')
    await db.exec("reset role; delete from public.user_music_journal where track_id='quota-fixture'")
    await asUser(a)
    await createRecord(recordA, a, '수정된 비공개 원본', 1)
    assert.equal((await readPublic()).rows[0].body, '선택한 공개 내용', 'private edits do not change public snapshot')

    await db.exec('reset role; set role anon')
    const publicRow = (await readPublic()).rows[0]
    assert.equal(publicRow.nickname, '피아노산책')
    assert.equal(publicRow.body, '선택한 공개 내용')
    assert.equal(Object.hasOwn(publicRow, 'owner_id'), false)
    await assert.rejects(db.query('select * from public.music_record_publications'), (e) => e.code === '42501')
    await assert.rejects(db.query('select * from public.user_music_journal'), (e) => e.code === '42501')
    await assert.rejects(db.query('select * from public.user_music_nicknames'), (e) => e.code === '42501')
    await assert.rejects(publish(), (e) => e.code === '42501')
    await assert.rejects(db.query('select * from public.list_my_music_shares($1)', [a]), (e) => e.code === '42501')

    await asUser(b)
    assert.equal((await db.query('select * from public.user_music_nicknames')).rows.length, 0)
    assert.equal((await db.query('select * from public.list_my_music_shares($1)', [b])).rows.length, 0)
    await assert.rejects(db.query('select * from public.list_my_music_shares($1)', [a]), (e) => e.code === '42501')
    await assert.rejects(publish(storyB, recordA, b), (e) => e.code === '40001')
    await assert.rejects(db.query('select public.withdraw_music_record($1,$2)', [storyA, b]), (e) => e.code === '40001')
    await createRecord(recordB, b, 'B의 비공개 기록')
    await assert.rejects(publish(storyB, recordB, b), (e) => e.code === '23505', 'public nicknames cannot impersonate an existing nickname')
    await publish(storyB, recordB, b, 1, '다른피아니스트', 'B의 공개 글')

    await asUser(a)
    await db.query('select public.withdraw_music_record($1,$2)', [storyA, a])
    assert.equal((await db.query('select body from public.user_music_journal')).rows[0].body, '수정된 비공개 원본')
    assert.equal((await readPublic()).rows.length, 1)
    await publish(storyA, recordA, a, 2)
    await db.query('select public.delete_private_music_record($1,2,$2)', [recordA, a])
    assert.equal((await readPublic()).rows.length, 1, 'source deletion removes only its snapshot')
    await asUser(b)
    await db.query('select public.delete_current_user_account()')
    await db.exec('reset role; set role anon')
    assert.equal((await readPublic()).rows.length, 0, 'account deletion removes snapshots')
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int n from public.user_music_nicknames')).rows[0].n, 1)
  } finally { await db.close() }
})
