-- Harden authenticated writes and allow a signed-in user to delete only their own account.
begin;

drop policy if exists user_track_reactions_insert_own on public.user_track_reactions;
drop policy if exists user_track_reactions_update_own on public.user_track_reactions;
drop policy if exists user_track_reactions_delete_own on public.user_track_reactions;

revoke insert, update, delete on table public.user_track_reactions from authenticated;

create or replace function public.merge_user_track_reactions(p_reactions jsonb default '[]'::jsonb)
returns setof public.user_track_reactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  payload jsonb := coalesce(p_reactions, '[]'::jsonb);
  payload_length integer;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'invalid reaction payload' using errcode = '22023';
  end if;

  payload_length := jsonb_array_length(payload);
  if payload_length > 400 then
    raise exception 'reaction limit exceeded' using errcode = '22023';
  end if;
  if payload_length <> (
    select count(distinct item->>'track_id')
    from jsonb_array_elements(payload) as item
  ) then
    raise exception 'duplicate reaction item' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload) as item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'track_id')
      or char_length(item->>'track_id') not between 1 and 160
      or (item->>'track_id') !~ '^[a-z0-9][a-z0-9-]*$'
      or not (item ? 'updated_at')
      or jsonb_typeof(item->'updated_at') <> 'string'
      or (item ? 'listen_again' and jsonb_typeof(item->'listen_again') <> 'boolean')
      or (item ? 'liked' and jsonb_typeof(item->'liked') <> 'boolean')
  ) then
    raise exception 'invalid reaction item' using errcode = '22023';
  end if;
  if (
    select count(*)
    from (
      select reactions.track_id
      from public.user_track_reactions as reactions
      where reactions.user_id = current_user_id
      union
      select item->>'track_id'
      from jsonb_array_elements(payload) as item
    ) as combined
  ) > 400 then
    raise exception 'account reaction limit exceeded' using errcode = '22023';
  end if;

  insert into public.user_track_reactions (user_id, track_id, listen_again, liked, updated_at)
  select
    current_user_id,
    item->>'track_id',
    coalesce((item->>'listen_again')::boolean, false),
    coalesce((item->>'liked')::boolean, false),
    (item->>'updated_at')::timestamptz
  from jsonb_array_elements(payload) as item
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

create or replace function public.delete_current_user_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_user_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from auth.users
  where id = current_user_id
  returning id into deleted_user_id;

  return deleted_user_id is not null;
end;
$$;

revoke all on function public.merge_user_track_reactions(jsonb) from public, anon, authenticated;
grant execute on function public.merge_user_track_reactions(jsonb) to authenticated;
revoke all on function public.delete_current_user_account() from public, anon, authenticated;
grant execute on function public.delete_current_user_account() to authenticated;

comment on function public.merge_user_track_reactions(jsonb) is 'Authenticated bounded reaction merge; direct table writes stay revoked.';
comment on function public.delete_current_user_account() is 'Deletes only auth.uid(); reaction rows cascade from auth.users.';
notify pgrst, 'reload schema';

commit;
