-- Selected, immutable public snapshots. Private journal and Auth identifiers stay private.
begin;

create table public.user_music_nicknames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname = btrim(nickname) and nickname ~ '^[가-힣A-Za-z0-9_ -]{2,20}$'),
  created_at timestamptz not null default now()
);
create unique index user_music_nicknames_unique on public.user_music_nicknames(lower(nickname));
alter table public.user_music_nicknames enable row level security;
create policy music_nickname_own on public.user_music_nicknames for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.user_music_nicknames from public, anon, authenticated;
grant select on public.user_music_nicknames to authenticated;

create table public.music_record_publications (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_record_id uuid not null references public.user_music_journal(id) on delete cascade,
  source_revision integer not null,
  track_id text not null,
  nickname text not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  kind text not null check (kind in ('free','practice','listening','reflection')),
  recorded_on date not null,
  published_at timestamptz not null default now(),
  unique (owner_id, source_record_id)
);
create index music_record_publications_track_time on public.music_record_publications(track_id, published_at desc, id desc);
alter table public.music_record_publications enable row level security;
create policy music_publications_read on public.music_record_publications for select to anon, authenticated using (true);
revoke all on public.music_record_publications from public, anon, authenticated;
-- Never expose Auth UUID, source UUID, or source revision through REST/GraphQL.
grant select (id,track_id,nickname,body,kind,recorded_on,published_at)
  on public.music_record_publications to anon, authenticated;

create function public.list_my_music_shares(p_owner_id uuid)
returns table (id uuid, source_record_id uuid, published_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_owner_id is distinct from auth.uid() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query select p.id,p.source_record_id,p.published_at
    from public.music_record_publications p where p.owner_id = auth.uid()
    order by p.published_at desc limit 100;
end;
$$;

create function public.publish_music_record(
  p_id uuid, p_record_id uuid, p_revision integer, p_owner_id uuid, p_nickname text, p_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  source public.user_music_journal;
  previous public.music_record_publications;
  stored_nickname text;
begin
  if caller is null or p_owner_id is distinct from caller then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = caller for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 4000
    or p_nickname is null or btrim(p_nickname) !~ '^[가-힣A-Za-z0-9_ -]{2,20}$' then
    raise exception 'invalid publication' using errcode = '22023';
  end if;
  select * into previous from public.music_record_publications where id = p_id;
  if found then
    if previous.owner_id = caller and previous.source_record_id = p_record_id
      and previous.source_revision = p_revision and previous.body = btrim(p_body)
      and previous.nickname = btrim(p_nickname) then return previous.id; end if;
    raise exception 'publication conflict' using errcode = '40001';
  end if;
  select * into source from public.user_music_journal
    where id = p_record_id and user_id = caller and revision = p_revision for update;
  if not found then raise exception 'record conflict' using errcode = '40001'; end if;
  if exists (select 1 from public.music_record_publications where owner_id = caller and source_record_id = p_record_id) then
    raise exception 'already published' using errcode = '40001';
  end if;
  if (select count(*) from public.music_record_publications where owner_id = caller) >= 100 then
    raise exception 'publication limit reached' using errcode = '54000';
  end if;
  select nickname into stored_nickname from public.user_music_nicknames where user_id = caller;
  if found then
    if stored_nickname <> btrim(p_nickname) then
      raise exception 'nickname cannot be changed' using errcode = '22023';
    end if;
  else
    insert into public.user_music_nicknames(user_id,nickname) values (caller,btrim(p_nickname));
  end if;
  insert into public.music_record_publications(id,owner_id,source_record_id,source_revision,track_id,nickname,body,kind,recorded_on)
    values (p_id,caller,source.id,source.revision,source.track_id,btrim(p_nickname),btrim(p_body),source.kind,source.recorded_on);
  return p_id;
end;
$$;

create function public.withdraw_music_record(p_id uuid, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_owner_id is distinct from auth.uid() then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.music_record_publications where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'publication conflict' using errcode = '40001'; end if;
  return true;
end;
$$;

revoke all on function public.list_my_music_shares(uuid) from public, anon, authenticated;
grant execute on function public.list_my_music_shares(uuid) to authenticated;
revoke all on function public.publish_music_record(uuid,uuid,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.publish_music_record(uuid,uuid,integer,uuid,text,text) to authenticated;
revoke all on function public.withdraw_music_record(uuid,uuid) from public, anon, authenticated;
grant execute on function public.withdraw_music_record(uuid,uuid) to authenticated;
comment on table public.music_record_publications is 'Public snapshot only. Withdrawal, source deletion or account deletion removes it. Owner/source columns not exposed.';
notify pgrst, 'reload schema';
commit;
