-- CA-SOCIAL-20261106-001. Independent of concert/OCR schemas.
begin;
create table public.social_tracks (id text primary key, title text not null, composer text not null);
create table public.social_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z][a-z0-9_]{2,23}$'),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now()
);
create table public.music_records (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  track_id text not null references public.social_tracks(id),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);
create table public.music_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  source_record_id uuid references public.music_records(id) on delete set null,
  track_id text not null references public.social_tracks(id),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  visibility text not null default 'private' check (visibility in ('private','public','followers')),
  created_at timestamptz not null default now()
);
create table public.social_follows (
  follower_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  author_id uuid not null references public.social_profiles(id) on delete cascade,
  primary key (follower_id,author_id), check (follower_id <> author_id)
);
create table public.social_blocks (
  blocker_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.social_profiles(id) on delete cascade,
  primary key (blocker_id,blocked_id), check (blocker_id <> blocked_id)
);
create table public.music_likes (
  post_id uuid not null references public.music_posts(id) on delete cascade,
  user_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  primary key (post_id,user_id)
);
create table public.music_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.music_posts(id) on delete cascade,
  author_id uuid not null references public.social_profiles(id) on delete cascade default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table public.social_reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.music_posts(id) on delete set null,
  reported_author_id uuid, snapshot jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index music_posts_feed on public.music_posts(created_at desc,id desc);
create index music_posts_track on public.music_posts(track_id,created_at desc);
create index music_posts_author on public.music_posts(author_id,created_at desc);
create index music_records_author on public.music_records(author_id,created_at desc);
create index music_comments_post on public.music_comments(post_id,created_at,id);
create index social_follows_author on public.social_follows(author_id);
create index social_blocks_reverse on public.social_blocks(blocked_id,blocker_id);

-- Fixed caller identity; SECURITY DEFINER avoids recursive RLS policies.
create function public.social_unblocked(other uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.social_blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=other) or (b.blocked_id=auth.uid() and b.blocker_id=other))
$$;
create function public.social_can_read(post uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.music_posts p where p.id=post and public.social_unblocked(p.author_id)
    and (p.author_id=auth.uid() or p.visibility='public' or (p.visibility='followers' and exists
      (select 1 from public.social_follows f where f.author_id=p.author_id and f.follower_id=auth.uid()))))
$$;
alter table public.social_tracks enable row level security;
alter table public.social_profiles enable row level security;
alter table public.music_records enable row level security;
alter table public.music_posts enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_blocks enable row level security;
alter table public.music_likes enable row level security;
alter table public.music_comments enable row level security;
alter table public.social_reports enable row level security;
create policy tracks_read on public.social_tracks for select using (true);
create policy profiles_read on public.social_profiles for select using (public.social_unblocked(id));
create policy profiles_create on public.social_profiles for insert with check (id=auth.uid());
create policy profiles_edit on public.social_profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy records_own on public.music_records for all using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy posts_read on public.music_posts for select using (author_id=auth.uid() or public.social_can_read(id));
create policy posts_create on public.music_posts for insert with check (author_id=auth.uid() and exists
  (select 1 from public.music_records r where r.id=source_record_id and r.author_id=auth.uid() and r.track_id=music_posts.track_id));
create policy posts_edit on public.music_posts for update using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy posts_delete on public.music_posts for delete using (author_id=auth.uid());
create policy follows_read on public.social_follows for select using (public.social_unblocked(author_id) and public.social_unblocked(follower_id));
create policy follows_create on public.social_follows for insert with check (follower_id=auth.uid() and public.social_unblocked(author_id));
create policy follows_delete on public.social_follows for delete using (follower_id=auth.uid());
create policy blocks_own on public.social_blocks for all using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
create policy likes_read on public.music_likes for select using (public.social_can_read(post_id) and public.social_unblocked(user_id));
create policy likes_create on public.music_likes for insert with check (user_id=auth.uid() and public.social_can_read(post_id));
create policy likes_delete on public.music_likes for delete using (user_id=auth.uid() and public.social_can_read(post_id));
create policy comments_read on public.music_comments for select using (public.social_can_read(post_id) and public.social_unblocked(author_id));
create policy comments_create on public.music_comments for insert with check (author_id=auth.uid() and public.social_can_read(post_id));
create policy comments_delete on public.music_comments for delete using (author_id=auth.uid() and public.social_can_read(post_id));
-- Reports have no client read/update policies. Moderators use a trusted service connection.

create function public.social_block_cleanup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.social_follows where (follower_id=new.blocker_id and author_id=new.blocked_id)
    or (follower_id=new.blocked_id and author_id=new.blocker_id);
  return new;
end $$;
create trigger social_block_cleanup after insert on public.social_blocks for each row execute function public.social_block_cleanup();

create function public.social_feed(track text default null, person uuid default null, post uuid default null,
  before_time timestamptz default null, before_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc),'[]'::jsonb) from (
    select p.*, to_jsonb(u) as profile,
      (select count(*) from public.music_likes l where l.post_id=p.id) as like_count,
      (select count(*) from public.music_comments c where c.post_id=p.id) as comment_count,
      exists(select 1 from public.music_likes l where l.post_id=p.id and l.user_id=auth.uid()) as liked
    from public.music_posts p join public.social_profiles u on u.id=p.author_id
    where (track is null or p.track_id=track) and (person is null or p.author_id=person) and (post is null or p.id=post)
      and (before_time is null or (p.created_at,p.id)<(before_time,before_id))
    order by p.created_at desc,p.id desc limit 30
  ) page
$$;
create function public.social_profile(person uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(u)||jsonb_build_object(
    'follower_count',(select count(*) from public.social_follows where author_id=person),
    'following_count',(select count(*) from public.social_follows where follower_id=person),
    'following',exists(select 1 from public.social_follows where author_id=person and follower_id=auth.uid()))
  from public.social_profiles u where u.id=person
$$;
-- Explicit desired state is safe to retry; the composite PK prevents duplicate likes.
create function public.social_set_like(post uuid, desired boolean) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.social_can_read(post) then raise exception 'Post unavailable' using errcode='42501'; end if;
  if desired then insert into public.music_likes(post_id) values (post) on conflict do nothing;
  else delete from public.music_likes where post_id=post and user_id=auth.uid(); end if;
end $$;
create function public.social_report(post uuid, reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.social_can_read(post) then raise exception 'Post unavailable' using errcode='42501'; end if;
  insert into public.social_reports(reporter_id,post_id,reported_author_id,snapshot,reason)
    select auth.uid(),id,author_id,jsonb_build_object('body',body,'track_id',track_id,'visibility',visibility),reason
    from public.music_posts where id=post and author_id<>auth.uid();
end $$;

-- Creating an original plus an optional share is one transaction. Retrying a
-- request after a lost response cannot publish twice or overwrite a snapshot.
create function public.social_create_record(record_id uuid, selected_track text, record_body text,
  share_scope text default 'private', shared_id uuid default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or share_scope is null or share_scope not in ('private','public','followers') then
    raise exception 'Invalid record request' using errcode='42501';
  end if;
  insert into public.music_records(id,track_id,body) values(record_id,selected_track,record_body) on conflict do nothing;
  if not exists(select 1 from public.music_records r where r.id=record_id and r.author_id=auth.uid() and r.track_id=selected_track and r.body=record_body) then
    raise exception 'Record payload changed';
  end if;
  if share_scope<>'private' then
    if shared_id is null then raise exception 'Shared ID required'; end if;
    insert into public.music_posts(id,source_record_id,track_id,body,visibility)
      values(shared_id,record_id,selected_track,record_body,share_scope) on conflict do nothing;
    if not exists(select 1 from public.music_posts p where p.id=shared_id and p.author_id=auth.uid() and p.source_record_id=record_id and p.body=record_body and p.visibility=share_scope) then
      raise exception 'Shared payload changed';
    end if;
  end if;
  return record_id;
end $$;

-- Broadcast ONLY an empty invalidation signal, never row data or identifiers.
-- Production prerequisite: Supabase Realtime database broadcast enabled.
create function public.social_invalidate() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send(''{}''::jsonb, ''invalidate'', ''atlas-social'', false)';
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['social_profiles','music_posts','social_follows','social_blocks','music_likes','music_comments'] loop
    execute format('create trigger social_invalidate after insert or update or delete on public.%I for each statement execute function public.social_invalidate()',t);
  end loop;
end $$;

revoke all on public.social_tracks,public.social_profiles,public.music_records,public.music_posts,public.social_follows,public.social_blocks,public.music_likes,public.music_comments,public.social_reports from anon,authenticated;
grant select on public.social_tracks,public.social_profiles,public.music_posts,public.social_follows,public.music_likes,public.music_comments to anon,authenticated;
grant select,delete on public.music_records to authenticated;
grant insert(id,author_id,track_id,body) on public.music_records to authenticated;
grant update(body) on public.music_records to authenticated;
grant select,insert,delete on public.social_blocks to authenticated;
grant insert(id,handle,nickname,avatar_url) on public.social_profiles to authenticated;
grant insert(id,author_id,source_record_id,track_id,body,visibility) on public.music_posts to authenticated;
grant insert(id,post_id,author_id,body) on public.music_comments to authenticated;
grant insert on public.social_follows,public.music_likes to authenticated;
grant update(handle,nickname,avatar_url) on public.social_profiles to authenticated;
grant update(body,visibility) on public.music_posts to authenticated;
grant delete on public.music_posts,public.social_follows,public.music_likes,public.music_comments to authenticated;
grant all on public.social_reports to service_role;
revoke all on function public.social_unblocked(uuid),public.social_can_read(uuid),public.social_feed(text,uuid,uuid,timestamptz,uuid),public.social_profile(uuid),public.social_set_like(uuid,boolean),public.social_report(uuid,text),public.social_block_cleanup(),public.social_invalidate() from public;
revoke all on function public.social_create_record(uuid,text,text,text,uuid) from public;
grant execute on function public.social_create_record(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.social_unblocked(uuid),public.social_can_read(uuid),public.social_feed(text,uuid,uuid,timestamptz,uuid),public.social_profile(uuid) to anon,authenticated;
grant execute on function public.social_set_like(uuid,boolean),public.social_report(uuid,text) to authenticated;
commit;
