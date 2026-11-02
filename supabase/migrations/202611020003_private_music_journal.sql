-- Private, account-owned text records. No public sharing or recommendation inputs.
begin;

create table public.user_music_journal (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 160 and track_id ~ '^[a-z0-9][a-z0-9-]*$'),
  kind text not null default 'free' check (kind in ('free', 'practice', 'listening', 'reflection')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  recorded_on date not null check (recorded_on between date '1900-01-01' and date '2200-12-31'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_music_journal_owner_track_date on public.user_music_journal
  (user_id, track_id, recorded_on desc, created_at desc, id desc);
alter table public.user_music_journal enable row level security;
create policy user_music_journal_select_own on public.user_music_journal
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_music_journal from public, anon, authenticated;
grant select on public.user_music_journal to authenticated;

create function public.save_private_music_record(
  p_id uuid, p_track_id text, p_kind text, p_body text, p_recorded_on date, p_revision integer, p_owner_id uuid
) returns setof public.user_music_journal
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  saved public.user_music_journal;
begin
  if caller is null or p_owner_id is distinct from caller then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- Serialize one account's writes for the total-row bound and reject deleted accounts.
  perform 1 from auth.users where id = caller for update;
  if not found then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_revision is null or p_revision < 0 then
    raise exception 'invalid revision' using errcode = '22023';
  end if;
  if p_revision = 0 then
    -- A retry with the same UUID must not create a second journal entry.
    select * into saved from public.user_music_journal
      where id = p_id and user_id = caller and track_id = p_track_id;
    if found then
      if saved.kind = p_kind and saved.body = btrim(p_body) and saved.recorded_on = p_recorded_on then
        return next saved;
        return;
      end if;
      raise exception 'record conflict' using errcode = '40001';
    end if;
    if (select count(*) from public.user_music_journal where user_id = caller) >= 1000 then
      raise exception 'journal limit reached' using errcode = '54000';
    end if;
    insert into public.user_music_journal(id, user_id, track_id, kind, body, recorded_on)
      values (p_id, caller, p_track_id, p_kind, btrim(p_body), p_recorded_on)
      returning * into saved;
  else
    update public.user_music_journal
      set kind = p_kind, body = btrim(p_body), recorded_on = p_recorded_on,
          revision = revision + 1, updated_at = now()
      where id = p_id and user_id = caller and track_id = p_track_id and revision = p_revision
      returning * into saved;
    if not found then
      raise exception 'record conflict' using errcode = '40001';
    end if;
  end if;
  return next saved;
end;
$$;

create function public.delete_private_music_record(p_id uuid, p_revision integer, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or p_owner_id is distinct from caller then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.user_music_journal
    where id = p_id and user_id = caller and revision = p_revision;
  if not found then
    raise exception 'record conflict' using errcode = '40001';
  end if;
  return true;
end;
$$;

revoke all on function public.save_private_music_record(uuid,text,text,text,date,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_private_music_record(uuid,text,text,text,date,integer,uuid) to authenticated;
revoke all on function public.delete_private_music_record(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.delete_private_music_record(uuid,integer,uuid) to authenticated;
comment on table public.user_music_journal is 'Private music journal; independent of saved reactions; cascades only on account deletion.';
notify pgrst, 'reload schema';
commit;
