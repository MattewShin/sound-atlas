import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tracks } from '../src/data/musicData.js'

export async function socialTestDatabase() {
  const db = new PGlite()
  const users = { A: randomUUID(), B: randomUUID(), C: randomUUID() }
  const q = async (sql,args=[]) => (await db.query(sql,args)).rows
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create schema realtime;create table realtime.test_events(payload jsonb,event text,topic text,private boolean);
    create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.test_events values(payload,event,topic,private)$$;`)
  for(const id of Object.values(users)) await q('insert into auth.users values($1,$2,$3)',[id,'private-fixture@example.invalid',JSON.stringify({full_name:'PRIVATE GOOGLE NAME'})])
  const apply = async name => db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
  for(const name of ['202611020001_user_track_reactions.sql','202611020002_user_account_security.sql','202611020003_private_music_journal.sql','202611020004_music_record_sharing.sql'])await apply(name)
  const as = async user => { await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role '+(user?'authenticated':'anon')) }
  const original=randomUUID(),legacy=randomUUID(),track=tracks[0].id
  await as(users.A)
  await q('select * from public.save_private_music_record($1,$2,$3,$4,$5,0,$6)',[original,track,'reflection','PRIVATE ORIGINAL','2026-11-06',users.A])
  await q('select public.publish_music_record($1,$2,1,$3,$4,$5)',[legacy,original,users.A,'기존닉네임','LEGACY SNAPSHOT'])
  await db.exec('reset role')
  await q('insert into public.user_music_nicknames(user_id,nickname) values($1,$2)',[users.C,'별명C'])
  await apply('202611060001_music_social.sql');await apply('202611060002_social_track_catalog.sql')
  const profileCountBeforeOnboarding=(await q('select count(*)::int n from public.music_social_profiles'))[0].n
  await as(users.C)
  const dormantNickname=(await q('select public.social_me() p'))[0].p
  const profiles={}
  for(const name of ['A','B','C']){
    await as(users[name])
    profiles[name]=(await q('select public.social_save_profile($1,$2,null) p',['listener_'+name.toLowerCase(),name==='A'?'기존닉네임':'별명'+name]))[0].p
  }
  return {db,q,as,users,profiles,original,legacy,track,profileCountBeforeOnboarding,dormantNickname}
}
