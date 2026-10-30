import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createSupabaseBrowserCache,listCacheKey} from './concertCache.mjs'

test('isolated additive migration: existing history preserved, one table, least privilege, RLS, atomic upsert and shape constraints',async()=>{
 const db=new PGlite(),migration=await readFile(new URL('../supabase/migrations/202610300001_concert_browser_cache.sql',import.meta.url),'utf8')
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create table public.history_fixture(id int primary key,receipt text);insert into public.history_fixture values(1,'preserved');alter default privileges in schema public grant all on tables to anon,authenticated,service_role;")
  await db.exec(migration)
  assert.deepEqual((await db.query('select * from public.history_fixture')).rows,[{id:1,receipt:'preserved'}])
  const tables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename);assert.deepEqual(tables,['concert_browser_cache','history_fixture'])
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.concert_browser_cache'::regclass")).rows[0].relrowsecurity,true)
  for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query("select has_table_privilege($1,'public.concert_browser_cache',$2) ok",[role,privilege])).rows[0].ok,role==='service_role'&&['SELECT','INSERT','UPDATE'].includes(privilege),role+privilege)
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.concert_browser_cache'),e=>e.code==='42501');await db.exec('reset role')}
  await db.exec('set role service_role')
  const query={region:'서울',from:'2026-10-30',to:'2026-11-29'},now=()=>Date.parse('2026-10-30T00:00:00Z'),key=listCacheKey(query),value={concerts:[],fetchedAt:new Date(now()).toISOString()}
  const adapter=createSupabaseBrowserCache({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},now,fetchImpl:async(url,init)=>{
   if(init.method==='POST'){const b=JSON.parse(init.body);await db.query('insert into public.concert_browser_cache(cache_key,cache_kind,payload,fetched_at,updated_at) values($1,$2,$3,$4,$5) on conflict(cache_key) do update set cache_kind=excluded.cache_kind,payload=excluded.payload,fetched_at=excluded.fetched_at,updated_at=excluded.updated_at',[b.cache_key,b.cache_kind,JSON.stringify(b.payload),b.fetched_at,b.updated_at]);return {ok:true,status:201}}
   const rows=(await db.query('select payload,fetched_at from public.concert_browser_cache where cache_key=$1 and cache_kind=$2 limit 1',[url.searchParams.get('cache_key').slice(3),url.searchParams.get('cache_kind').slice(3)])).rows;return {ok:true,json:async()=>rows}
  }})
  await adapter.write(key,'list',value);await adapter.write(key,'list',value);assert.deepEqual(await adapter.read(key,'list'),value);assert.equal((await db.query('select count(*)::int n from public.concert_browser_cache')).rows[0].n,1)
  for(const [k,kind,payload]of [['bad','list',{concerts:[]}],[key,'list',{concert:{}}],['detail:v1:PF1','detail',{concerts:[]}],[key,'list',{}]])await assert.rejects(db.query('insert into public.concert_browser_cache values($1,$2,$3,now(),now()) on conflict(cache_key) do update set payload=excluded.payload',[k,kind,JSON.stringify(payload)]),e=>e.code==='23514')
  await assert.rejects(db.query('delete from public.concert_browser_cache'),e=>e.code==='42501')
  await db.exec('reset role');await assert.rejects(db.exec(migration),e=>e.code==='42P07');assert.equal((await db.query('select receipt from public.history_fixture')).rows[0].receipt,'preserved')
 }finally{await db.close()}
})
