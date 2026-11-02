import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'

test('사용자 보관함 migration은 auth UUID·RLS·최신값 병합으로 두 계정을 격리한다', async () => {
  const db = new PGlite()
  const migration = await readFile(new URL('../supabase/migrations/202611020001_user_track_reactions.sql', import.meta.url), 'utf8')
  const asUser = async (userId) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId])
    await db.exec('set role authenticated')
  }
  const merge = (rows) => db.query('select * from public.merge_user_track_reactions($1::jsonb)', [JSON.stringify(rows)])
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      insert into auth.users values ('${userA}'), ('${userB}');
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `)
    await db.exec(migration)
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.user_track_reactions'::regclass")).rows[0].relrowsecurity, true)

    await asUser(userA)
    await merge([{ track_id: 'chopin-fixture', listen_again: true, liked: false, updated_at: '2026-11-01T00:00:00Z' }])
    await merge([{ track_id: 'chopin-fixture', listen_again: false, liked: true, updated_at: '2026-10-31T00:00:00Z' }])
    assert.deepEqual((await db.query('select track_id,listen_again,liked from public.user_track_reactions')).rows, [{ track_id: 'chopin-fixture', listen_again: true, liked: false }])
    await assert.rejects(db.query('insert into public.user_track_reactions(user_id,track_id) values($1,$2)', [userB, 'cross-account']), (error) => error.code === '42501')

    await asUser(userB)
    assert.deepEqual((await db.query('select track_id from public.user_track_reactions')).rows, [])
    await merge([{ track_id: 'liszt-fixture', listen_again: true, liked: true, updated_at: '2026-11-02T00:00:00Z' }])
    assert.deepEqual((await db.query('select track_id from public.user_track_reactions')).rows, [{ track_id: 'liszt-fixture' }])

    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.user_track_reactions'), (error) => error.code === '42501')
    await assert.rejects(merge([]), (error) => error.code === '42501')
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int count from public.user_track_reactions')).rows[0].count, 2)
    await assert.rejects(db.exec(migration), (error) => error.code === '42P07')
  } finally {
    await db.close()
  }
})
