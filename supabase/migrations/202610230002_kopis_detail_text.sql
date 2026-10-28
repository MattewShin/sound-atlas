begin;

-- Additive, nullable, no defaults and no backfill. Existing rows remain null.
alter table public.concerts
  add column kopis_detail_text text,
  add column kopis_detail_text_hash text,
  add constraint concerts_kopis_detail_text_hash_check
    check (kopis_detail_text_hash is null or kopis_detail_text_hash ~ '^[0-9a-f]{64}$');

comment on column public.concerts.kopis_detail_text is
  'KOPIS sty current source text; outer whitespace trimmed and CRLF normalized to LF by collector. Not a verified program.';
comment on column public.concerts.kopis_detail_text_hash is
  'Lowercase SHA-256 of stored text UTF-8 bytes. NULL when source text is absent.';

create or replace function public.sync_kopis_concert(p_concert jsonb, p_images jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_has_detail boolean;
  v_detail_text text;
  v_detail_text_hash text;
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

  -- Missing both fields is the legacy payload. Explicit nulls clear the text.
  -- Reject partial/typed/mismatched values rather than JSON-to-string coercion.
  v_has_detail := p_concert ? 'kopis_detail_text';
  if v_has_detail is distinct from (p_concert ? 'kopis_detail_text_hash') then
    raise exception 'A complete detail text/hash pair is required';
  end if;
  if v_has_detail then
    if jsonb_typeof(p_concert->'kopis_detail_text') not in ('string','null')
       or jsonb_typeof(p_concert->'kopis_detail_text_hash') not in ('string','null') then
      raise exception 'Invalid detail text/hash types';
    end if;
    v_detail_text := p_concert->>'kopis_detail_text';
    v_detail_text_hash := p_concert->>'kopis_detail_text_hash';
    if v_detail_text is null then
      if v_detail_text_hash is not null then raise exception 'Null text requires null hash'; end if;
    elsif v_detail_text_hash is null or v_detail_text_hash !~ '^[0-9a-f]{64}$'
       or v_detail_text = '' or v_detail_text ~ '^\s*$'
       or v_detail_text_hash is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_detail_text,'UTF8')),'hex') then
      raise exception 'Detail hash must match the stored UTF-8 text';
    end if;
  end if;

  insert into public.concerts as current_concert (
    kopis_id, title, venue, region, start_date, end_date, performance_status,
    poster_url, kopis_updated_at, synced_at, kopis_detail_text, kopis_detail_text_hash
  ) values (
    p_concert->>'kopis_id', p_concert->>'title', p_concert->>'venue', p_concert->>'region',
    (p_concert->>'start_date')::date, (p_concert->>'end_date')::date,
    p_concert->>'performance_status', p_concert->>'poster_url',
    (p_concert->>'kopis_updated_at')::timestamptz, (p_concert->>'synced_at')::timestamptz, v_detail_text, v_detail_text_hash
  ) on conflict (kopis_id) do update set
    title = excluded.title, venue = excluded.venue, region = excluded.region,
    start_date = excluded.start_date, end_date = excluded.end_date,
    performance_status = excluded.performance_status, poster_url = excluded.poster_url,
    kopis_updated_at = excluded.kopis_updated_at, synced_at = excluded.synced_at,
    kopis_detail_text = case when v_has_detail then excluded.kopis_detail_text else current_concert.kopis_detail_text end,
    kopis_detail_text_hash = case when v_has_detail then excluded.kopis_detail_text_hash else current_concert.kopis_detail_text_hash end
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


-- Preserve the existing invoker signature, RLS behavior and API role contract.
revoke all on function public.sync_kopis_concert(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kopis_concert(jsonb, jsonb) to service_role;

commit;

