begin;

create table public.concerts (
  id uuid primary key default gen_random_uuid(),
  kopis_id text not null unique check (kopis_id ~ '^PF[0-9]{1,12}$'),
  title text not null check (length(btrim(title)) > 0),
  venue text not null check (length(btrim(venue)) > 0),
  region text not null check (length(btrim(region)) > 0),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  performance_status text not null check (performance_status in ('공연예정', '공연중', '공연완료')),
  poster_url text,
  kopis_updated_at timestamptz,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index concerts_region_start_date_idx on public.concerts (region, start_date);
create index concerts_region_end_date_idx on public.concerts (region, end_date);

create table public.concert_program_images (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  source_url text not null check (source_url ~ '^https?://'),
  image_type text not null check (image_type in ('POSTER', 'DETAIL')),
  sort_order integer not null check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (concert_id, source_url)
);
comment on column public.concert_program_images.image_type is
  'KOPIS source classification only. DETAIL does not confirm program content.';
comment on column public.concerts.kopis_updated_at is
  'KOPIS updatedate interpreted as Asia/Seoul. NULL when absent; never collection time.';

create function public.set_concert_collection_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger concerts_updated_at before update on public.concerts
  for each row execute function public.set_concert_collection_updated_at();
create trigger concert_program_images_updated_at before update on public.concert_program_images
  for each row execute function public.set_concert_collection_updated_at();

alter table public.concerts enable row level security;
alter table public.concert_program_images enable row level security;
revoke all on table public.concerts, public.concert_program_images from public, anon, authenticated;
grant select, insert, update on table public.concerts, public.concert_program_images to service_role;
-- No anon/authenticated policies. Existing application tables/policies are untouched.

-- Invoke only after a complete, validated detail response. A single transaction
-- preserves the previous image snapshot if any write fails. ON CONFLICT locks the
-- concert row, serializing concurrent snapshots for that KOPIS ID.
create function public.sync_kopis_concert(p_concert jsonb, p_images jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_concert) is distinct from 'object'
     or jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'A concert object and a complete image array are required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_images) as item
    where jsonb_typeof(item) is distinct from 'object'
      or nullif(item->>'source_url', '') is null
      or item->>'image_type' is null
      or item->>'sort_order' is null
  ) then
    raise exception 'Invalid image snapshot';
  end if;

  insert into public.concerts (
    kopis_id, title, venue, region, start_date, end_date, performance_status,
    poster_url, kopis_updated_at, synced_at
  ) values (
    p_concert->>'kopis_id', p_concert->>'title', p_concert->>'venue', p_concert->>'region',
    (p_concert->>'start_date')::date, (p_concert->>'end_date')::date,
    p_concert->>'performance_status', p_concert->>'poster_url',
    (p_concert->>'kopis_updated_at')::timestamptz, (p_concert->>'synced_at')::timestamptz
  ) on conflict (kopis_id) do update set
    title = excluded.title, venue = excluded.venue, region = excluded.region,
    start_date = excluded.start_date, end_date = excluded.end_date,
    performance_status = excluded.performance_status, poster_url = excluded.poster_url,
    kopis_updated_at = excluded.kopis_updated_at, synced_at = excluded.synced_at
  returning id into v_id;

  insert into public.concert_program_images (concert_id, source_url, image_type, sort_order, is_active)
    select v_id, item->>'source_url', item->>'image_type', (item->>'sort_order')::integer, true
    from jsonb_array_elements(p_images) as item
  on conflict (concert_id, source_url) do update set
    image_type = excluded.image_type, sort_order = excluded.sort_order, is_active = true;

  update public.concert_program_images as image set is_active = false
    where image.concert_id = v_id and image.is_active
      and not exists (
        select 1 from jsonb_array_elements(p_images) as item
        where item->>'source_url' = image.source_url
      );
  -- Never delete/recreate image rows. Future OCR columns/tables are not updated.
  return v_id;
end;
$$;

revoke all on function public.set_concert_collection_updated_at() from public, anon, authenticated;
revoke all on function public.sync_kopis_concert(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kopis_concert(jsonb, jsonb) to service_role;

commit;
