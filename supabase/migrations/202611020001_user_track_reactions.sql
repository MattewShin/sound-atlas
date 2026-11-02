-- User-owned music reactions. Google provider tokens and profile data are never stored here.
create table public.user_track_reactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  listen_again boolean not null default false,
  liked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id),
  constraint user_track_reactions_track_id_check check (
    char_length(track_id) between 1 and 160
    and track_id ~ '^[a-z0-9][a-z0-9-]*$'
  ),
  constraint user_track_reactions_updated_at_check check (
    updated_at >= timestamptz '2020-01-01 00:00:00+00'
    and updated_at <= now() + interval '1 day'
  )
);

alter table public.user_track_reactions enable row level security;

create policy user_track_reactions_select_own
  on public.user_track_reactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_track_reactions_insert_own
  on public.user_track_reactions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_track_reactions_update_own
  on public.user_track_reactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_track_reactions_delete_own
  on public.user_track_reactions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_track_reactions from public, anon, authenticated;
grant select, insert, update, delete on table public.user_track_reactions to authenticated;

create function public.merge_user_track_reactions(p_reactions jsonb default '[]'::jsonb)
returns setof public.user_track_reactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_reactions, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_reactions, '[]'::jsonb)) > 1000 then
    raise exception 'invalid reaction payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_reactions, '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'track_id')
      or char_length(item->>'track_id') not between 1 and 160
      or (item->>'track_id') !~ '^[a-z0-9][a-z0-9-]*$'
      or not (item ? 'updated_at')
  ) then
    raise exception 'invalid reaction item' using errcode = '22023';
  end if;

  insert into public.user_track_reactions (user_id, track_id, listen_again, liked, updated_at)
  select
    current_user_id,
    item->>'track_id',
    coalesce((item->>'listen_again')::boolean, false),
    coalesce((item->>'liked')::boolean, false),
    (item->>'updated_at')::timestamptz
  from jsonb_array_elements(coalesce(p_reactions, '[]'::jsonb)) as item
  on conflict (user_id, track_id) do update
  set listen_again = excluded.listen_again,
      liked = excluded.liked,
      updated_at = excluded.updated_at
  where excluded.updated_at >= public.user_track_reactions.updated_at;

  return query
  select reactions.*
  from public.user_track_reactions as reactions
  where reactions.user_id = current_user_id
  order by reactions.updated_at desc, reactions.track_id;
end;
$$;

revoke all on function public.merge_user_track_reactions(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_track_reactions(jsonb) to authenticated;

comment on table public.user_track_reactions is 'Per-user music reactions used for library sync and existing nine-axis taste calculation.';
comment on function public.merge_user_track_reactions(jsonb) is 'Authenticated latest-updated-at merge; returns only auth.uid() rows.';
notify pgrst, 'reload schema';
