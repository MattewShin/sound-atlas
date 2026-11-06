import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tracks } from '../src/data/musicData.js'

test('social RLS: isolated A/B/C/anonymous, scopes, direct API, reactions, revocation, block, snapshots and reports', async () => {
  const db = new PGlite()
  const A = randomUUID(), B = randomUUID(), C = randomUUID(), track = tracks[0].id
  const q = async (sql, args = []) => (await db.query(sql, args)).rows
  const as = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']); await db.exec('set role ' + (id ? 'authenticated' : 'anon')) }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`)
    await db.exec(`create schema realtime;
      create table realtime.test_events(payload jsonb,event text,topic text,private boolean);
      create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$
        insert into realtime.test_events values(payload,event,topic,private) $$;`)
    await db.exec(await readFile(new URL('../supabase/migrations/202611060001_music_social.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/202611060002_social_track_catalog.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await q('select id from public.social_tracks order by id')).map(t => t.id), tracks.map(t => t.id).sort())
    for (const id of [A, B, C]) await q('insert into auth.users values ($1)', [id])
    for (const [id, handle] of [[A, 'user_a'], [B, 'user_b'], [C, 'user_c']]) {
      await as(id); await q('insert into public.social_profiles(id,handle,nickname) values($1,$2,$3)', [id, handle, handle])
    }
    await assert.rejects(q('update public.social_profiles set handle=$1 where id=$2', ['user_a', C]), /unique/i)
    await assert.rejects(q('insert into public.social_profiles(id,handle,nickname) values($1,$2,$3)', [randomUUID(), 'forged', 'forged']), /row-level security/i)
    await as(A)
    const newRecord = randomUUID(), newShare = randomUUID()
    for (let retry = 0; retry < 2; retry++) await q('select public.social_create_record($1,$2,$3,$4,$5)', [newRecord, track, 'ATOMIC ISOLATED', 'public', newShare])
    assert.equal((await q('select count(*)::int n from public.music_records where id=$1', [newRecord]))[0].n, 1)
    assert.equal((await q('select count(*)::int n from public.music_posts where id=$1', [newShare]))[0].n, 1)
    const deniedRecord = randomUUID()
    await assert.rejects(q('select public.social_create_record($1,$2,$3,$4,$5)', [deniedRecord, track, 'ROLL BACK ON BAD SHARE', 'followers', null]), /Shared ID required/i)
    assert.equal((await q('select * from public.music_records where id=$1', [deniedRecord])).length, 0)
    await q('delete from public.music_posts where id=$1', [newShare]); await q('delete from public.music_records where id=$1', [newRecord])
    const original = (await q('insert into public.music_records(track_id,body) values($1,$2) returning *', [track, 'ISOLATED PRIVATE ORIGINAL']))[0]
    const posts = {}
    for (const visibility of ['private', 'public', 'followers']) posts[visibility] = (await q('insert into public.music_posts(source_record_id,track_id,body,visibility) values($1,$2,$3,$4) returning *', [original.id, track, 'SNAPSHOT ' + visibility, visibility]))[0]
    const defaults = (await q('insert into public.music_posts(source_record_id,track_id,body) values($1,$2,$3) returning *', [original.id, track, 'DEFAULT PRIVATE']))[0]
    assert.equal(defaults.visibility, 'private'); await q('delete from public.music_posts where id=$1', [defaults.id])
    await assert.rejects(q('insert into public.music_posts(source_record_id,track_id,body,created_at) values($1,$2,$3,now())', [original.id, track, 'FORGED TIME']), /permission denied/i)
    await assert.rejects(q('insert into public.music_posts(track_id,body) values($1,$2)', [track, 'FREE POST']), /row-level security/i)
    await assert.rejects(q('insert into public.music_records(track_id,body) values($1,$2)', ['unknown', 'BAD']), /foreign key/i)
    await q('update public.music_records set body=$1 where id=$2', ['EDITED PRIVATE ORIGINAL', original.id])
    assert.equal((await q('select body from public.music_posts where id=$1', [posts.public.id]))[0].body, 'SNAPSHOT public')
    const visible = async id => { await as(id); return (await q('select id from public.music_posts')).map(p => p.id).sort() }
    assert.deepEqual(await visible(A), Object.values(posts).map(p => p.id).sort())
    for (const viewer of [null, B, C]) {
      assert.deepEqual(await visible(viewer), [posts.public.id])
      if (viewer) assert.deepEqual(await q('select * from public.music_records'), [])
      else await assert.rejects(q('select * from public.music_records'), /permission denied/i)
      for (const p of [posts.private, posts.followers]) {
        assert.deepEqual(await q('select * from public.music_posts where id=$1', [p.id]), [])
        assert.equal((await q('select public.social_feed(post=>$1) result', [p.id]))[0].result.length, 0)
        assert.deepEqual(await q('select * from public.music_comments where post_id=$1', [p.id]), [])
        assert.deepEqual(await q('select * from public.music_likes where post_id=$1', [p.id]), [])
        await assert.rejects(q('select public.social_set_like($1,true)', [p.id]), /permission denied|unavailable/i)
        await assert.rejects(q('insert into public.music_comments(post_id,body) values($1,$2)', [p.id, 'DENIED']), /permission denied|row-level security/i)
      }
    }
    await as(null)
    await assert.rejects(q('insert into public.music_likes(post_id) values($1)', [posts.public.id]), /permission denied/i)
    await as(B)
    await assert.rejects(q('insert into public.social_follows(author_id) values($1)', [B]), /check constraint/i)
    await q('insert into public.social_follows(author_id) values($1)', [A])
    assert.deepEqual(await visible(B), [posts.public.id, posts.followers.id].sort())
    assert.equal((await q('select public.social_profile($1) p', [A]))[0].p.follower_count, 1)
    for (const p of [posts.public, posts.followers]) {
      await q('select public.social_set_like($1,true)', [p.id]); await q('select public.social_set_like($1,true)', [p.id])
      assert.equal((await q('select count(*)::int n from public.music_likes where post_id=$1', [p.id]))[0].n, 1)
      const comment = (await q('insert into public.music_comments(post_id,body) values($1,$2) returning *', [p.id, 'ISOLATED COMMENT']))[0]
      let feed = (await q('select public.social_feed(post=>$1) r', [p.id]))[0].r[0]
      assert.equal(feed.like_count, 1); assert.equal(feed.comment_count, 1); assert.equal(feed.liked, true)
      await as(C)
      assert.equal((await q('delete from public.music_comments where id=$1 returning id', [comment.id])).length, 0)
      await as(B); await q('delete from public.music_comments where id=$1', [comment.id])
      feed = (await q('select public.social_feed(post=>$1) r', [p.id]))[0].r[0]; assert.equal(feed.comment_count, 0)
    }
    await as(A)
    // Private posts are interactive only for their author.
    await q('select public.social_set_like($1,true)', [posts.private.id])
    await q('insert into public.music_comments(post_id,body) values($1,$2)', [posts.private.id, 'AUTHOR ONLY'])
    await as(B)
    await assert.rejects(q('update public.music_posts set track_id=$1 where id=$2', [tracks[1].id, posts.public.id]), /permission denied/i)
    assert.equal((await q('update public.music_posts set body=$1 where id=$2 returning id', ['FORGED', posts.public.id])).length, 0)
    await assert.rejects(q('insert into public.music_posts(source_record_id,track_id,body) values($1,$2,$3)', [original.id, track, 'STOLEN RECORD']), /row-level security/i)
    await q('delete from public.social_follows where author_id=$1', [A])
    assert.deepEqual(await visible(B), [posts.public.id])
    await assert.rejects(q('select public.social_set_like($1,false)', [posts.followers.id]), /unavailable/i)
    assert.deepEqual(await q('select * from public.music_likes where post_id=$1', [posts.followers.id]), [])
    await as(A)
    assert.equal((await q('select count(*)::int n from public.music_likes where post_id=$1', [posts.followers.id]))[0].n, 1, 'unfollow retains hidden likes')
    await q('update public.music_posts set visibility=$1 where id=$2', ['private', posts.public.id])
    for (const viewer of [null, B, C]) {
      assert.deepEqual(await visible(viewer), [])
      assert.deepEqual(await q('select * from public.music_likes where post_id=$1', [posts.public.id]), [])
      assert.equal((await q('select public.social_feed(post=>$1) r', [posts.public.id]))[0].r.length, 0)
    }
    await as(A)
    assert.equal((await q('select public.social_feed(post=>$1) r', [posts.public.id]))[0].r[0].like_count, 1)
    await q('update public.music_posts set visibility=$1 where id=$2', ['public', posts.public.id])
    await as(B); await q('select public.social_report($1,$2)', [posts.public.id, 'ISOLATED REPORT'])
    await q('insert into public.music_comments(post_id,body) values($1,$2)', [posts.public.id, 'RETAINED THROUGH BLOCK'])
    await assert.rejects(q('select * from public.social_reports'), /permission denied/i)
    await q('insert into public.social_follows(author_id) values($1)', [A])
    await as(A); await q('insert into public.social_follows(author_id) values($1)', [B])
    await q('insert into public.social_blocks(blocked_id) values($1)', [B])
    const blockedCounts = (await q('select public.social_feed(post=>$1) r', [posts.public.id]))[0].r[0]
    assert.equal(blockedCounts.comment_count, 0); assert.equal(blockedCounts.like_count, 0, 'blocked actors are excluded from visible counts')
    assert.equal((await q('select * from public.social_follows')).length, 0, 'block removes both follow directions')
    await assert.rejects(q('insert into public.social_follows(author_id) values($1)', [B]), /row-level security/i)
    assert.deepEqual(await visible(B), [])
    assert.deepEqual(await q('select * from public.social_profiles where id=$1', [A]), [])
    await assert.rejects(q('insert into public.social_follows(author_id) values($1)', [A]), /row-level security/i)
    await assert.rejects(q('select public.social_set_like($1,true)', [posts.public.id]), /unavailable/i)
    await assert.rejects(q('insert into public.music_comments(post_id,body) values($1,$2)', [posts.public.id, 'BLOCKED']), /row-level security/i)
    await as(C)
    assert.deepEqual(await visible(C), [posts.public.id], 'third party still sees public post')
    const thirdPartyCounts = (await q('select public.social_feed(post=>$1) r', [posts.public.id]))[0].r[0]
    assert.equal(thirdPartyCounts.comment_count, 1); assert.equal(thirdPartyCounts.like_count, 1, 'block hides rather than deleting existing interactions')
    await as(A); await q('delete from public.social_blocks where blocked_id=$1', [B])
    assert.deepEqual(await visible(B), [posts.public.id], 'unblocking does not restore follows')
    await q('select public.social_set_like($1,false)', [posts.public.id]); await q('select public.social_set_like($1,false)', [posts.public.id])
    assert.equal((await q('select public.social_feed(post=>$1) r', [posts.public.id]))[0].r[0].like_count, 0)
    await as(A); await q('delete from public.music_posts where id=$1', [posts.public.id])
    assert.equal((await q('select body from public.music_records where id=$1', [original.id]))[0].body, 'EDITED PRIVATE ORIGINAL', 'unshare retains original')
    await q('delete from public.music_records where id=$1', [original.id])
    assert.equal((await q('select source_record_id,body from public.music_posts where id=$1', [posts.followers.id]))[0].source_record_id, null, 'deleting original retains snapshot')
    await db.exec('reset role; set role service_role')
    const reports = await q('select * from public.social_reports')
    assert.equal(reports.length, 1); assert.equal(reports[0].snapshot.body, 'SNAPSHOT public'); assert.equal(reports[0].post_id, null)
    await db.exec('reset role')
    const events = await q('select * from realtime.test_events')
    assert.ok(events.length > 0)
    assert.ok(events.every(e => JSON.stringify(e.payload) === '{}' && e.event === 'invalidate' && e.topic === 'atlas-social' && e.private === false), 'no private rows or identifiers enter the public broadcast')
  } finally { await db.close() }
})
