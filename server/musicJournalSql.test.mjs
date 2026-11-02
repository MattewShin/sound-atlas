import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('비공개 음악 기록: 본인 CRUD·RLS·충돌·한도·보관 독립·계정 cascade', async () => {
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  let currentOwner = a
  const asUser = async (user) => {
    currentOwner = user
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
    await db.exec('set role authenticated')
  }
  const save = (recordId = id, body = '첫 감상', revision = 0, kind = 'listening') => db.query(
    "select * from public.save_private_music_record($1, 'chopin-ballade-op52-no4', $2, $3, '2026-11-02', $4, $5)", [recordId, kind, body, revision, currentOwner])
  const remove = (recordId, revision) => db.query('select public.delete_private_music_record($1, $2, $3)', [recordId, revision, currentOwner])
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${a}'), ('${b}');`)
    await db.exec(await readFile(new URL('../supabase/migrations/202611020001_user_track_reactions.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611020002_user_account_security.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../supabase/migrations/202611020003_private_music_journal.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await asUser(a)
    assert.equal((await save()).rows[0].body, '첫 감상')
    assert.equal((await save()).rows[0].revision, 1, 'same UUID retry is idempotent')
    assert.equal((await db.query('select * from public.user_music_journal')).rows.length, 1)
    await assert.rejects(save(id, '바뀐 입력'), (e) => e.code === '40001')
    assert.equal((await save(id, '수정된 감상', 1)).rows[0].revision, 2)
    await assert.rejects(save(id, '오래된 수정', 1), (e) => e.code === '40001')
    await assert.rejects(remove(id, 1), (e) => e.code === '40001')
    await assert.rejects(db.query("update public.user_music_journal set body = 'direct'"), (e) => e.code === '42501')
    await assert.rejects(save(idB, '   '), (e) => e.code === '23514')
    await assert.rejects(save(idB, 'x'.repeat(4001)), (e) => e.code === '23514')
    await assert.rejects(save(idB, 'text', 0, 'public'), (e) => e.code === '23514')

    await asUser(b)
    await assert.rejects(db.query("select * from public.save_private_music_record($1,'fixture','free','delayed A draft','2026-11-02',0,$2)", [idB, a]), (e) => e.code === '42501')
    assert.equal((await db.query('select * from public.user_music_journal')).rows.length, 0)
    await assert.rejects(save(id, '타인 수정', 2), (e) => e.code === '40001')
    await assert.rejects(remove(id, 2), (e) => e.code === '40001')
    await save(idB, 'B의 기록')

    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.user_music_journal'), (e) => e.code === '42501')
    await assert.rejects(save(), (e) => e.code === '42501')
    await assert.rejects(remove(id, 2), (e) => e.code === '42501')
    await asUser(a)
    // Existing library removal has no FK relationship to journal records.
    await db.query("select * from public.merge_user_track_reactions('[{\"track_id\":\"chopin-ballade-op52-no4\",\"listen_again\":false,\"updated_at\":\"2026-11-02T00:00:00Z\"}]'::jsonb)")
    assert.equal((await db.query('select body from public.user_music_journal')).rows[0].body, '수정된 감상')
    await remove(id, 2)
    assert.equal((await db.query('select * from public.user_music_journal')).rows.length, 0)
    await save()
    await db.query('select public.delete_current_user_account()')
    await db.exec('reset role')
    assert.deepEqual((await db.query('select user_id,body from public.user_music_journal')).rows, [{ user_id: b, body: 'B의 기록' }])

    await asUser(b)
    await db.exec('reset role')
    await db.query(`insert into public.user_music_journal(id,user_id,track_id,body,recorded_on)
      select md5('fixture-' || i)::uuid,$1,'fixture','fixture',date '2026-11-02' from generate_series(1,999) i`, [b])
    await asUser(b)
    await assert.rejects(save('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), (e) => e.code === '54000')
    await save(idB, '상한에서도 수정 가능', 1)
    await db.exec('reset role')
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.user_music_journal'::regclass")).rows[0].relrowsecurity, true)
  } finally { await db.close() }
})
