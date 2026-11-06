import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { socialTestDatabase } from './socialTestDatabase.mjs'

test('SNS spec2: existing rows/links/nicknames, safe public fields, scopes, revocation, cascades and account deletion',async()=>{
 const f=await socialTestDatabase(),{db,q,as,users:u,profiles:p,original,legacy,track}=f
 const safe='id,track_id,nickname,body,kind,recorded_on,published_at,profile_id,visibility'
 const feed=async(post)=> (await q('select public.social_feed(post=>$1) f',[post]))[0].f
 const rows=async(id)=>q(`select ${safe} from public.music_record_publications where id=$1`,[id])
 const create=async(user,scope='private')=>{
  await as(u[user]);const record=randomUUID(),post=randomUUID()
  await q('select * from public.save_private_music_record($1,$2,$3,$4,$5,0,$6)',[record,track,'free','PRIVATE '+user,'2026-11-06',u[user]])
  await q('select public.social_publish_record($1,$2,1,$3,$4,$5,$6)',[post,record,u[user],p[user].nickname,'SHARE '+scope,scope]);return {record,post}
 }
 try{
  assert.equal(f.profileCountBeforeOnboarding,1,'withdrawn/private-only nicknames are not auto-exposed as profiles')
  assert.equal(f.dormantNickname.needs_setup,true);assert.equal(f.dormantNickname.nickname,'별명C')
  await as(u.A)
  assert.equal((await rows(legacy))[0].body,'LEGACY SNAPSHOT');assert.equal((await rows(legacy))[0].visibility,'public')
  assert.equal((await q('select * from public.user_music_journal')).length,1)
  assert.equal((await q('select * from public.list_my_music_shares($1)',[u.A]))[0].source_record_id,original)
  assert.equal(p.A.nickname,'기존닉네임');assert.notEqual(p.A.id,u.A)
  await assert.rejects(q('select public.social_save_profile($1,$2,null)',['listener_b','기존닉네임']),e=>e.code==='23505')
  await assert.rejects(q('select public.social_save_profile($1,$2,null)',['renamed','다른닉네임']),e=>e.code==='22023')
  const priv=await create('A'),followers=await create('A','followers')
  await assert.rejects(q('insert into public.music_social_likes values($1,$2)',[priv.post,p.A.id]),e=>e.code==='42501')
  await assert.rejects(q('update public.music_social_profiles set handle=$1 where id=$2',['forged',p.A.id]),e=>e.code==='42501')
  for(const viewer of [null,u.B,u.C]){
   await as(viewer)
   assert.equal((await rows(legacy)).length,1)
   for(const target of [priv.post,followers.post]){
    assert.deepEqual(await rows(target),[]);assert.deepEqual(await feed(target),[])
    assert.deepEqual(await q('select * from public.music_social_comments where post_id=$1',[target]),[])
    await assert.rejects(q('select public.social_set_like($1,true)',[target]),e=>e.code==='42501')
    await assert.rejects(q('select public.social_comment($1,$2,$3)',[target,'DENIED',randomUUID()]),e=>e.code==='42501')
   }
   await assert.rejects(q('select * from public.music_record_publications'),e=>e.code==='42501')
   for(const field of ['owner_id','source_record_id','source_revision'])await assert.rejects(q('select '+field+' from public.music_record_publications'),e=>e.code==='42501')
   await assert.rejects(q('select * from atlas_private.social_accounts'),e=>e.code==='42501')
   await assert.rejects(q('select * from atlas_private.social_reports'),e=>e.code==='42501')
   const payload=JSON.stringify([await feed(legacy),await q('select * from public.music_social_profiles')])
   for(const secret of [...Object.values(u),original,'PRIVATE GOOGLE NAME','private-fixture@example.invalid'])assert.ok(!payload.includes(secret),secret)
   assert.ok(!payload.includes('source_record_id'));assert.ok(!payload.includes('owner_id'))
  }
  await as(u.A);await q('select public.social_set_like($1,true)',[priv.post]);assert.equal((await feed(priv.post))[0].like_count,1)
  await as(u.B);await assert.rejects(q('select public.social_follow($1,true)',[p.B.id]),e=>e.code==='42501')
  await q('select public.social_follow($1,true)',[p.A.id]);assert.equal((await rows(followers.post)).length,1)
  for(let i=0;i<2;i++)await q('select public.social_set_like($1,true)',[followers.post])
  const comment=randomUUID()
  for(let i=0;i<2;i++)await q('select public.social_comment($1,$2,$3)',[followers.post,'DRAFT RETRY',comment])
  assert.equal((await feed(followers.post))[0].like_count,1);assert.equal((await feed(followers.post))[0].comment_count,1)
  await assert.rejects(q('select public.social_comment($1,$2,$3)',[followers.post,'DIFFERENT',comment]),e=>e.code==='40001')
  await as(u.C);await assert.rejects(q('select public.social_delete_comment($1)',[comment]),e=>e.code==='42501')
  await as(u.B);await q('select public.social_delete_comment($1)',[comment]);assert.equal((await feed(followers.post))[0].comment_count,0)
  await q('select public.social_follow($1,false)',[p.A.id]);assert.deepEqual(await rows(followers.post),[])
  await assert.rejects(q('select public.social_set_like($1,false)',[followers.post]),e=>e.code==='42501')
  await as(u.A);assert.equal((await feed(followers.post))[0].like_count,1,'unfollow retains hidden like')
  await q('select public.social_edit_post($1,$2,$3)',[legacy,'EDITED SHARE','private'])
  assert.equal((await q('select body from public.user_music_journal where id=$1',[original]))[0].body,'PRIVATE ORIGINAL')
  for(const viewer of [null,u.B,u.C]){await as(viewer);assert.deepEqual(await rows(legacy),[]);assert.deepEqual(await feed(legacy),[])}
  await as(u.A);await q('select public.social_edit_post($1,$2,$3)',[legacy,'EDITED SHARE','public'])
  await q('select * from public.save_private_music_record($1,$2,$3,$4,$5,1,$6)',[original,track,'reflection','EDITED ORIGINAL','2026-11-06',u.A]);assert.equal((await rows(legacy))[0].body,'EDITED SHARE')
  await as(u.B);await q('select public.social_follow($1,true)',[p.A.id]);await q('select public.social_set_like($1,true)',[legacy])
  await q('select public.social_comment($1,$2,$3)',[legacy,'RETAINED COMMENT',randomUUID()]);await q('select public.social_report($1,$2)',[legacy,'ISOLATED REPORT'])
  await as(u.A);await q('select public.social_follow($1,true)',[p.B.id]);await q('select public.social_block($1,true)',[p.B.id])
  assert.equal((await feed(legacy))[0].comment_count,0);assert.equal((await feed(legacy))[0].like_count,0)
  await as(u.B);assert.deepEqual(await rows(legacy),[]);assert.deepEqual(await feed(legacy),[])
  await assert.rejects(q('select public.social_follow($1,true)',[p.A.id]),e=>e.code==='42501')
  await assert.rejects(q('select public.social_comment($1,$2,$3)',[legacy,'DENIED',randomUUID()]),e=>e.code==='42501')
  await as(u.C);assert.equal((await feed(legacy))[0].comment_count,1);assert.equal((await feed(legacy))[0].like_count,1)
  await as(u.A);await q('select public.social_block($1,false)',[p.B.id])
  assert.equal((await q('select * from public.music_social_follows')).length,0,'unblocking does not restore follows')
  // Legacy RPC and direct table entry point obey the same scope and block policies.
  await q('select public.withdraw_music_record($1,$2)',[priv.post,u.A])
  assert.equal((await q('select * from public.user_music_journal where id=$1',[priv.record])).length,1,'unshare keeps private record')
  await q('select public.delete_private_music_record($1,2,$2)',[original,u.A])
  assert.deepEqual(await rows(legacy),[]);assert.equal((await q('select * from public.music_social_comments where post_id=$1',[legacy])).length,0)
  await db.exec('reset role')
  assert.equal((await q('select * from public.music_social_likes where post_id=$1',[legacy])).length,0)
  const report=(await q('select * from atlas_private.social_reports'))[0];assert.equal(report.post_id,null);assert.equal(report.snapshot.body,'EDITED SHARE')
  assert.ok(new Date(report.expires_at)-new Date(report.created_at)>=29*86400000)
  const other=await create('B','public')
  await as(u.A);await q('select public.social_comment($1,$2,$3)',[other.post,'A ON B',randomUUID()]);await q('select public.social_set_like($1,true)',[other.post]);await q('select public.social_follow($1,true)',[p.B.id])
  await q('select public.delete_current_user_account()')
  await assert.rejects(q('select public.social_save_profile($1,$2,null)',['deleted_account','삭제계정']),e=>e.code==='42501')
  await db.exec('reset role')
  assert.equal((await q('select * from public.music_social_profiles where id=$1',[p.A.id])).length,0)
  assert.equal((await q('select * from public.music_record_publications where owner_id=$1',[u.A])).length,0)
  assert.equal((await q('select * from public.user_music_journal where user_id=$1',[u.A])).length,0)
  assert.equal((await q('select * from public.music_social_comments where profile_id=$1',[p.A.id])).length,0)
  assert.equal((await q('select * from public.music_social_likes where profile_id=$1',[p.A.id])).length,0)
  assert.equal((await q('select * from public.music_social_follows')).length,0)
  assert.equal((await q('select * from public.music_record_publications where id=$1',[other.post])).length,1)
  assert.equal((await q('select * from atlas_private.social_reports'))[0].reported_id,null)
  await as(u.B);await q('select public.delete_current_user_account()');await db.exec('reset role')
  assert.equal((await q('select * from atlas_private.social_reports'))[0].reporter_id,null)
  await q("update atlas_private.social_reports set expires_at=now()-interval '1 second'")
  await db.exec('set role service_role')
  assert.equal((await q('select atlas_private.purge_expired_social_reports() n'))[0].n,1)
  await db.exec('reset role')
  const events=await q('select * from realtime.test_events');assert.ok(events.length>0);assert.ok(events.every(e=>JSON.stringify(e.payload)==='{}'&&e.topic==='atlas-social'))
 }finally{await db.close()}
})
