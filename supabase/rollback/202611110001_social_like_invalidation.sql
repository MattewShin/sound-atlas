-- Explicit operational rollback; not a forward migration. No row changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.music_social_likes in share row exclusive mode;
do $$
begin
 if (select count(*) from pg_trigger where tgrelid='public.music_social_likes'::regclass and not tgisinternal) <> 1
 or not exists(select 1 from pg_trigger where tgrelid='public.music_social_likes'::regclass
   and tgname='social_like_invalidate' and tgfoid='atlas_private.social_like_invalidate()'::regprocedure
   and tgtype=28 and tgenabled='O' and tgnargs=0 and tgqual is null)
 then raise exception 'Unexpected typed likes trigger: abort rollback'; end if;
end $$;
drop trigger social_like_invalidate on public.music_social_likes;
create trigger social_invalidate after insert or update or delete on public.music_social_likes
for each statement execute function atlas_private.social_invalidate();
drop function atlas_private.social_like_invalidate();
commit;
