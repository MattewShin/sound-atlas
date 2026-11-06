-- CA-SOCIAL-20261106-001 spec 2: extend the deployed journal/publication IDs.
-- Apply after 202611020004. No journal copies or automatic publication.
begin;
create schema atlas_private;
revoke all on schema atlas_private from public,anon,authenticated;
create table public.social_tracks(id text primary key,title text not null,composer text not null);
create table public.music_social_profiles(
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check(handle ~ '^[a-z][a-z0-9_]{2,39}$'),
  nickname text not null, avatar_url text check(avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now()
);
create table atlas_private.social_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null unique references public.music_social_profiles(id) on delete cascade
);
create table public.music_social_follows(
  follower_id uuid references public.music_social_profiles(id) on delete cascade,
  author_id uuid references public.music_social_profiles(id) on delete cascade,
  primary key(follower_id,author_id),check(follower_id<>author_id)
);
create table public.music_social_blocks(
  blocker_id uuid references public.music_social_profiles(id) on delete cascade,
  blocked_id uuid references public.music_social_profiles(id) on delete cascade,
  primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
create function atlas_private.ensure_profile(owner uuid,display_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare profile uuid; stored_name text;
begin
  perform 1 from auth.users where id=owner for update;
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
  select profile_id into profile from atlas_private.social_accounts where user_id=owner;
  if found then return profile; end if;
  select nickname into stored_name from public.user_music_nicknames where user_id=owner;
  if stored_name is null then raise exception 'Public nickname required' using errcode='22023'; end if;
  profile:=gen_random_uuid();
  insert into public.music_social_profiles(id,handle,nickname) values(profile,'u_'||replace(profile::text,'-',''),stored_name);
  insert into atlas_private.social_accounts values(owner,profile);
  return profile;
end $$;
-- Existing nicknames and public IDs are retained. Only the opaque profile mapping is new.
do $$ declare r record; begin
  for r in select n.user_id,n.nickname from public.user_music_nicknames n
    where exists(select 1 from public.music_record_publications p where p.owner_id=n.user_id) loop
    perform atlas_private.ensure_profile(r.user_id,r.nickname);
  end loop;
end $$;
alter table public.music_record_publications add column profile_id uuid references public.music_social_profiles(id) on delete cascade;
alter table public.music_record_publications add column visibility text not null default 'public' check(visibility in ('private','public','followers'));
update public.music_record_publications p set profile_id=a.profile_id from atlas_private.social_accounts a where a.user_id=p.owner_id;
alter table public.music_record_publications alter column profile_id set not null;
create function atlas_private.publication_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.social_tracks where id=new.track_id) then
    raise exception 'Registered track required' using errcode='22023';
  end if;
  new.profile_id:=atlas_private.ensure_profile(new.owner_id,new.nickname);
  return new;
end $$;
create trigger publication_profile before insert on public.music_record_publications for each row execute function atlas_private.publication_profile();
-- The existing source_record_id FK remains ON DELETE CASCADE (not SET NULL).
create table public.music_social_likes(
  post_id uuid references public.music_record_publications(id) on delete cascade,
  profile_id uuid references public.music_social_profiles(id) on delete cascade,
  primary key(post_id,profile_id)
);
create table public.music_social_comments(
  id uuid primary key default gen_random_uuid(),post_id uuid not null references public.music_record_publications(id) on delete cascade,
  profile_id uuid not null references public.music_social_profiles(id) on delete cascade,
  body text not null check(char_length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
create table atlas_private.social_reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.music_social_profiles(id) on delete set null,
  reported_id uuid references public.music_social_profiles(id) on delete set null,
  post_id uuid references public.music_record_publications(id) on delete set null,
  reason text not null check(char_length(btrim(reason)) between 1 and 1000),snapshot jsonb not null,
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',resolved_at timestamptz
);
create index social_publication_feed on public.music_record_publications(published_at desc,id desc);
create index social_publication_profile on public.music_record_publications(profile_id,published_at desc,id desc);
create index social_comment_post on public.music_social_comments(post_id,created_at,id);
create index social_follows_author on public.music_social_follows(author_id);
create index social_blocks_reverse on public.music_social_blocks(blocked_id,blocker_id);

create function public.social_self_id() returns uuid language sql stable security definer set search_path='' as $$
  select profile_id from atlas_private.social_accounts where user_id=auth.uid()
$$;
create function public.social_unblocked(person uuid) returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.music_social_blocks where
    (blocker_id=public.social_self_id() and blocked_id=person) or(blocked_id=public.social_self_id() and blocker_id=person))
$$;
create function public.social_can_read(post uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.music_record_publications p where p.id=post and public.social_unblocked(p.profile_id)
    and(p.owner_id=auth.uid() or p.visibility='public' or(p.visibility='followers' and exists(
      select 1 from public.music_social_follows f where f.author_id=p.profile_id and f.follower_id=public.social_self_id()))))
$$;
drop policy music_publications_read on public.music_record_publications;
create policy music_publications_read on public.music_record_publications for select to anon,authenticated using(public.social_can_read(id));
-- Column grants, not just RPC projections: SELECT * and private columns remain denied.
revoke all on public.music_record_publications from public,anon,authenticated;
grant select(id,track_id,nickname,body,kind,recorded_on,published_at,profile_id,visibility) on public.music_record_publications to anon,authenticated;
drop function public.list_my_music_shares(uuid);
create function public.list_my_music_shares(p_owner_id uuid)
returns table(id uuid,source_record_id uuid,published_at timestamptz,visibility text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_owner_id is distinct from auth.uid() then raise exception 'Authentication required' using errcode='42501'; end if;
 return query select p.id,p.source_record_id,p.published_at,p.visibility from public.music_record_publications p
   where p.owner_id=auth.uid() order by p.published_at desc limit 100;
end $$;
revoke all on function public.list_my_music_shares(uuid) from public,anon,authenticated;
grant execute on function public.list_my_music_shares(uuid) to authenticated;
alter table public.social_tracks enable row level security;
alter table public.music_social_profiles enable row level security;
alter table public.music_social_follows enable row level security;
alter table public.music_social_blocks enable row level security;
alter table public.music_social_likes enable row level security;
alter table public.music_social_comments enable row level security;
create policy tracks_read on public.social_tracks for select using(true);
create policy profiles_read on public.music_social_profiles for select using(public.social_unblocked(id));
create policy follows_read on public.music_social_follows for select using(public.social_unblocked(follower_id) and public.social_unblocked(author_id));
create policy blocks_read on public.music_social_blocks for select using(blocker_id=public.social_self_id());
create policy likes_read on public.music_social_likes for select using(public.social_can_read(post_id) and public.social_unblocked(profile_id));
create policy comments_read on public.music_social_comments for select using(public.social_can_read(post_id) and public.social_unblocked(profile_id));
revoke all on public.social_tracks,public.music_social_profiles,public.music_social_follows,public.music_social_blocks,public.music_social_likes,public.music_social_comments from public,anon,authenticated;
grant select on public.social_tracks,public.music_social_profiles,public.music_social_follows,public.music_social_likes,public.music_social_comments to anon,authenticated;
grant select on public.music_social_blocks to authenticated;

create function public.social_me() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('id',p.id,'handle',p.handle,'nickname',p.nickname,'avatar_url',p.avatar_url)
    from public.music_social_profiles p where p.id=public.social_self_id()),
    (select jsonb_build_object('nickname',n.nickname,'needs_setup',true) from public.user_music_nicknames n where n.user_id=auth.uid()))
$$;
create function public.social_profile(person uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(p)||jsonb_build_object('follower_count',(select count(*) from public.music_social_follows where author_id=person),
    'following_count',(select count(*) from public.music_social_follows where follower_id=person),
    'following',exists(select 1 from public.music_social_follows where author_id=person and follower_id=public.social_self_id()))
  from public.music_social_profiles p where id=person
$$;
create function public.social_feed(track text default null,person uuid default null,post uuid default null,before_time timestamptz default null,before_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc),'[]'::jsonb) from(
  select p.id,p.track_id,p.body,p.kind,p.recorded_on,p.published_at as created_at,p.visibility,
    to_jsonb(u) as profile,(p.profile_id=public.social_self_id()) as own,
    (select count(*) from public.music_social_likes l where l.post_id=p.id) as like_count,
    (select count(*) from public.music_social_comments c where c.post_id=p.id) as comment_count,
    exists(select 1 from public.music_social_likes l where l.post_id=p.id and l.profile_id=public.social_self_id()) as liked
  from public.music_record_publications p join public.music_social_profiles u on u.id=p.profile_id
  where(track is null or p.track_id=track) and(person is null or p.profile_id=person) and(post is null or p.id=post)
    and(before_time is null or(p.published_at,p.id)<(before_time,before_id)) order by p.published_at desc,p.id desc limit 30
 )page
$$;
create function public.social_save_profile(p_handle text,p_nickname text,p_avatar_url text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); profile uuid; stored text;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform 1 from auth.users where id=caller for update;
 if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
 if p_handle is null or p_handle!~'^[a-z][a-z0-9_]{2,23}$' or p_nickname is null or btrim(p_nickname)!~'^[가-힣A-Za-z0-9_ -]{2,20}$' then
   raise exception 'Invalid profile' using errcode='22023'; end if;
 select nickname into stored from public.user_music_nicknames where user_id=caller;
 if found and stored<>btrim(p_nickname) then raise exception 'Existing nickname is fixed' using errcode='22023'; end if;
 insert into public.user_music_nicknames(user_id,nickname) values(caller,btrim(p_nickname)) on conflict(user_id) do nothing;
 profile:=atlas_private.ensure_profile(caller,p_nickname);
 update public.music_social_profiles set handle=p_handle,avatar_url=nullif(btrim(p_avatar_url),'') where id=profile;
 return public.social_me();
end $$;
create function public.social_publish_record(p_id uuid,p_record_id uuid,p_revision integer,p_owner_id uuid,p_nickname text,p_body text,p_visibility text default 'private')
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.music_record_publications;
begin
 if auth.uid() is null or p_owner_id is distinct from auth.uid() then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_visibility is null or p_visibility not in('private','public','followers') then raise exception 'Invalid scope' using errcode='22023'; end if;
 -- Preserve the existing revision/quota/nickname/idempotency checks.
 select * into previous from public.music_record_publications where id=p_id;
 if found and(previous.owner_id<>auth.uid() or previous.visibility<>p_visibility) then raise exception 'Publication conflict' using errcode='40001'; end if;
 result:=public.publish_music_record(p_id,p_record_id,p_revision,p_owner_id,p_nickname,p_body);
 update public.music_record_publications set visibility=p_visibility where id=result and owner_id=auth.uid();
 return result;
end $$;
create function public.social_edit_post(post uuid,content text,scope text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if scope is null or scope not in('private','public','followers') or content is null then raise exception 'Invalid post' using errcode='22023'; end if;
 update public.music_record_publications set body=btrim(content),visibility=scope where id=post and owner_id=auth.uid();
 if not found then raise exception 'Post unavailable' using errcode='42501'; end if;
end $$;
create function public.social_withdraw(post uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.withdraw_music_record(post,auth.uid()); end $$;
create function atlas_private.require_profile(post uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=public.social_self_id();
begin
 if auth.uid() is null or me is null or not exists(select 1 from auth.users where id=auth.uid()) or(post is not null and not public.social_can_read(post)) then
   raise exception 'Post or profile unavailable' using errcode='42501'; end if;
 return me;
end $$;
create function public.social_set_like(post uuid,desired boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile(post);
begin
 if desired then insert into public.music_social_likes values(post,me) on conflict do nothing;
 else delete from public.music_social_likes where post_id=post and profile_id=me; end if;
end $$;
create function public.social_comment(post uuid,content text,comment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile(post);
begin
 if content is null then raise exception 'Invalid comment' using errcode='22023'; end if;
 insert into public.music_social_comments(id,post_id,profile_id,body) values(comment_id,post,me,btrim(content)) on conflict do nothing;
 if not exists(select 1 from public.music_social_comments where id=comment_id and post_id=post and profile_id=me and body=btrim(content)) then
   raise exception 'Comment conflict' using errcode='40001'; end if;
end $$;
create function public.social_delete_comment(comment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile(); target uuid;
begin
 select post_id into target from public.music_social_comments where id=comment_id and profile_id=me;
 if target is null or not public.social_can_read(target) then raise exception 'Comment unavailable' using errcode='42501'; end if;
 delete from public.music_social_comments where id=comment_id and profile_id=me;
end $$;
create function public.social_follow(person uuid,desired boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile();
begin
 perform 1 from public.music_social_profiles where id in(me,person) order by id for update;
 if me=person or not public.social_unblocked(person) then raise exception 'Relationship unavailable' using errcode='42501'; end if;
 if desired then insert into public.music_social_follows values(me,person) on conflict do nothing;
 else delete from public.music_social_follows where follower_id=me and author_id=person; end if;
end $$;
create function public.social_block(person uuid,desired boolean) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile();
begin
 perform 1 from public.music_social_profiles where id in(me,person) order by id for update;
 if me=person then raise exception 'Cannot block self' using errcode='22023'; end if;
 if desired then
  insert into public.music_social_blocks values(me,person) on conflict do nothing;
  delete from public.music_social_follows where(follower_id=me and author_id=person) or(follower_id=person and author_id=me);
 else delete from public.music_social_blocks where blocker_id=me and blocked_id=person; end if;
end $$;
create function public.social_report(post uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=atlas_private.require_profile(post);
begin
 if exists(select 1 from public.music_record_publications where id=post and profile_id=me) then raise exception 'Cannot report self' using errcode='22023'; end if;
 insert into atlas_private.social_reports(reporter_id,reported_id,post_id,reason,snapshot)
 select me,profile_id,id,reason,jsonb_build_object('body',body,'track_id',track_id,'visibility',visibility) from public.music_record_publications where id=post;
end $$;
create function atlas_private.delete_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.music_social_profiles where id=old.profile_id;return old;end $$;
create trigger account_profile_cleanup after delete on atlas_private.social_accounts for each row execute function atlas_private.delete_profile();
create function atlas_private.social_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   execute 'select realtime.send(''{}''::jsonb,''invalidate'',''atlas-social'',false)'; end if;
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['music_social_profiles','music_record_publications','music_social_follows','music_social_blocks','music_social_likes','music_social_comments'] loop
   execute format('create trigger social_invalidate after insert or update or delete on public.%I for each statement execute function atlas_private.social_invalidate()',t);
 end loop;
end $$;
-- Private helpers and the Auth mapping cannot be called or selected via REST.
revoke all on all tables in schema atlas_private from public,anon,authenticated;
revoke all on all functions in schema atlas_private from public,anon,authenticated;
revoke all on function public.social_self_id(),public.social_unblocked(uuid),public.social_can_read(uuid),public.social_me(),public.social_profile(uuid),public.social_feed(text,uuid,uuid,timestamptz,uuid),
 public.social_save_profile(text,text,text),public.social_publish_record(uuid,uuid,integer,uuid,text,text,text),public.social_edit_post(uuid,text,text),public.social_withdraw(uuid),
 public.social_set_like(uuid,boolean),public.social_comment(uuid,text,uuid),public.social_delete_comment(uuid),public.social_follow(uuid,boolean),public.social_block(uuid,boolean),public.social_report(uuid,text) from public,anon,authenticated;
grant execute on function public.social_self_id(),public.social_unblocked(uuid),public.social_can_read(uuid),public.social_profile(uuid),public.social_feed(text,uuid,uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.social_me(),public.social_save_profile(text,text,text),public.social_publish_record(uuid,uuid,integer,uuid,text,text,text),public.social_edit_post(uuid,text,text),public.social_withdraw(uuid),
 public.social_set_like(uuid,boolean),public.social_comment(uuid,text,uuid),public.social_delete_comment(uuid),public.social_follow(uuid,boolean),public.social_block(uuid,boolean),public.social_report(uuid,text) to authenticated;
grant usage on schema atlas_private to service_role;
grant select,update,delete on atlas_private.social_reports to service_role;
create function atlas_private.purge_expired_social_reports() returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin delete from atlas_private.social_reports where expires_at<=now();get diagnostics affected=row_count;return affected;end $$;
revoke all on function atlas_private.purge_expired_social_reports() from public,anon,authenticated;
grant execute on function atlas_private.purge_expired_social_reports() to service_role;
notify pgrst,'reload schema';
commit;
