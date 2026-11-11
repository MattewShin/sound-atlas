import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {socialTestDatabase} from './socialTestDatabase.mjs'
const forward=new URL('../supabase/migrations/202611110001_social_like_invalidation.sql',import.meta.url),rollback=new URL('../supabase/rollback/202611110001_social_like_invalidation.sql',import.meta.url)
test('좋아요 migration은 명시적 transaction·ACL·trigger만 변경한다',async()=>{
 for(const path of [forward,rollback]){const sql=await readFile(path,'utf8');assert.match(sql,/begin;/i);assert.match(sql,/commit;/i);assert.match(sql,/lock_timeout = '5s'/);assert(!/\b(cascade|truncate|if exists)\b/i.test(sql));assert(!/\b(insert into|update public\.|delete from|alter table|create policy)\b/i.test(sql))}
})
test('실제 격리 SQL: typed broadcast·ACL·행 보존·일반 권한 이벤트·rollback·실패 원자성',async()=>{
 const {db,q,as,users,profiles,legacy}=await socialTestDatabase({afterRetirement:true});
 const snapshot=async()=>q("select c.relname,t.tgname,t.tgfoid::regprocedure::text fn from pg_trigger t join pg_class c on c.oid=t.tgrelid where t.tgname='social_invalidate' and c.relname<>'music_social_likes' order by 1");
 try{
  await db.exec('reset role');const generic=await snapshot(),rows=await q('select count(*)::int n from public.music_social_likes');await db.exec(await readFile(forward,'utf8'));assert.deepEqual(await snapshot(),generic);assert.deepEqual(await q('select count(*)::int n from public.music_social_likes'),rows)
  for(const role of ['anon','authenticated'])assert.equal((await q("select has_function_privilege($1,'atlas_private.social_like_invalidate()','EXECUTE') allowed",[role]))[0].allowed,false)
  await db.exec('delete from realtime.test_events');await as(users.B);await q('select public.social_set_like($1,true)',[legacy]);await q('select public.social_set_like($1,true)',[legacy]);assert.equal((await q('select public.social_feed(post=>$1) f',[legacy]))[0].f[0].like_count,1)
  await q('select public.social_follow($1,true)',[profiles.A.id]);await db.exec('reset role');let events=await q('select * from realtime.test_events');assert(events.some(e=>JSON.stringify(e.payload)==='{"kind":"like"}'&&e.event==='invalidate'&&e.topic==='atlas-social'&&!e.private));assert(events.some(e=>JSON.stringify(e.payload)==='{}'));assert(events.every(e=>Object.keys(e.payload).every(k=>k==='kind')))
  await db.exec(await readFile(rollback,'utf8'));assert.deepEqual(await snapshot(),generic);assert.equal((await q("select to_regprocedure('atlas_private.social_like_invalidate()') f"))[0].f,null);await db.exec('delete from realtime.test_events');await as(users.B);await q('select public.social_set_like($1,false)',[legacy]);await db.exec('reset role');assert((await q('select payload from realtime.test_events')).every(e=>JSON.stringify(e.payload)==='{}'))
  await db.exec('alter trigger social_invalidate on public.music_social_likes rename to unexpected_trigger');await assert.rejects(db.exec(await readFile(forward,'utf8')),/Unexpected likes trigger/);await db.exec('rollback');assert.equal((await q("select to_regprocedure('atlas_private.social_like_invalidate()') f"))[0].f,null)
 }finally{await db.close()}
})
