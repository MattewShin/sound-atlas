-- CA-SOCIAL-LIKE-UX-20261111-001. No row changes, RLS/RPC changes or identifiers.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.music_social_likes in share row exclusive mode;
do $$
begin
 if to_regprocedure('atlas_private.social_like_invalidate()') is not null then
   raise exception 'Unexpected existing typed like function';
 end if;
 if (select count(*) from pg_trigger where tgrelid='public.music_social_likes'::regclass and not tgisinternal) <> 1
 or not exists(select 1 from pg_trigger where tgrelid='public.music_social_likes'::regclass
   and tgname='social_invalidate' and tgfoid='atlas_private.social_invalidate()'::regprocedure
   and tgtype=28 and tgenabled='O' and tgnargs=0 and tgqual is null)
 then raise exception 'Unexpected likes trigger: abort without replacing it'; end if;
end $$;
create function atlas_private.social_like_invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
   execute 'select realtime.send(''{"kind":"like"}''::jsonb,''invalidate'',''atlas-social'',false)';
 end if;
 return null;
end $$;
revoke all on function atlas_private.social_like_invalidate() from public,anon,authenticated;
drop trigger social_invalidate on public.music_social_likes;
create trigger social_like_invalidate after insert or update or delete on public.music_social_likes
for each statement execute function atlas_private.social_like_invalidate();
commit;
