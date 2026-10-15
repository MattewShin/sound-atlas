begin;

-- Successful OCR artifacts are separate from image collection metadata.
-- A mutable URL can produce multiple artifacts, identified by actual image bytes.
create table public.concert_image_ocr_results (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.concert_program_images(id) on delete cascade,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  pipeline_version text not null check (length(pipeline_version) between 1 and 150),
  engine text not null default 'easyocr' check (engine = 'easyocr'),
  engine_version text not null,
  torch_version text not null,
  languages text[] not null default array['ko', 'en']::text[],
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  raw_text text not null check (length(raw_text) <= 1000000),
  detections jsonb not null check (jsonb_typeof(detections) = 'array'),
  mean_confidence double precision check (mean_confidence >= 0 and mean_confidence <= 1),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  processed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (image_id, content_sha256, pipeline_version)
);

-- Append-only completion records, not a queue: no PENDING/lease/scheduler state.
-- The caller's UUID makes HTTP retries idempotent.
create table public.concert_image_ocr_attempts (
  id uuid primary key,
  image_id uuid not null references public.concert_program_images(id) on delete cascade,
  result_id uuid references public.concert_image_ocr_results(id),
  content_sha256 text check (content_sha256 ~ '^[a-f0-9]{64}$'),
  pipeline_version text not null,
  status text not null check (status in ('SUCCEEDED', 'FAILED')),
  error_code text check (error_code ~ '^[A-Z0-9_]{1,100}$'),
  started_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= started_at),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  check ((status = 'SUCCEEDED' and result_id is not null and content_sha256 is not null and error_code is null)
      or (status = 'FAILED' and result_id is null and error_code is not null))
);
create index concert_image_ocr_attempts_image_finished_idx on public.concert_image_ocr_attempts (image_id, finished_at desc);
comment on table public.concert_image_ocr_results is
  'Raw EasyOCR output only. Text/detections/confidence do not confirm program content or work matches.';
comment on table public.concert_image_ocr_attempts is
  'Completed manual OCR attempts only. Failures never remove previously successful artifacts.';

alter table public.concert_image_ocr_results enable row level security;
alter table public.concert_image_ocr_attempts enable row level security;
revoke all on table public.concert_image_ocr_results, public.concert_image_ocr_attempts from public, anon, authenticated;
grant select, insert on table public.concert_image_ocr_results, public.concert_image_ocr_attempts to service_role;

create function public.record_concert_image_ocr(p_attempt jsonb, p_result jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_attempt_id uuid := (p_attempt->>'id')::uuid;
  v_image_id uuid := (p_attempt->>'image_id')::uuid;
  v_result_id uuid;
  v_image public.concert_program_images%rowtype;
begin
  if jsonb_typeof(p_attempt) is distinct from 'object'
    or p_attempt->>'status' is null or p_attempt->>'status' not in ('SUCCEEDED', 'FAILED') then
    raise exception 'Invalid OCR attempt';
  end if;
  if exists (select 1 from public.concert_image_ocr_attempts where id = v_attempt_id) then
    return v_attempt_id;
  end if;
  select * into v_image from public.concert_program_images where id = v_image_id for share;
  if not found or not v_image.is_active or v_image.image_type <> 'DETAIL'
    or v_image.source_url is distinct from p_attempt->>'source_url' then
    raise exception 'OCR image is no longer an active DETAIL source';
  end if;

  if p_attempt->>'status' = 'SUCCEEDED' then
    if jsonb_typeof(p_result) is distinct from 'object' or p_attempt->>'error_code' is not null then
      raise exception 'Successful attempt requires an OCR result without an error';
    end if;
    insert into public.concert_image_ocr_results (
      image_id, content_sha256, pipeline_version, engine_version, torch_version,
      settings, raw_text, detections, mean_confidence, width, height, processed_at
    ) values (
      v_image_id, p_attempt->>'content_sha256', p_attempt->>'pipeline_version',
      p_result->>'engine_version', p_result->>'torch_version', p_result->'settings',
      p_result->>'raw_text', p_result->'detections', (p_result->>'mean_confidence')::double precision,
      (p_result->>'width')::integer, (p_result->>'height')::integer, (p_attempt->>'finished_at')::timestamptz
    ) on conflict (image_id, content_sha256, pipeline_version) do nothing;
    select id into v_result_id from public.concert_image_ocr_results
      where image_id = v_image_id and content_sha256 = p_attempt->>'content_sha256'
        and pipeline_version = p_attempt->>'pipeline_version';
  elsif p_result is not null and p_result <> 'null'::jsonb then
    raise exception 'Failed attempt cannot supply an OCR result';
  end if;

  insert into public.concert_image_ocr_attempts (
    id, image_id, result_id, content_sha256, pipeline_version, status, error_code, started_at, finished_at, duration_ms
  ) values (
    v_attempt_id, v_image_id, v_result_id, p_attempt->>'content_sha256', p_attempt->>'pipeline_version',
    p_attempt->>'status', p_attempt->>'error_code', (p_attempt->>'started_at')::timestamptz,
    (p_attempt->>'finished_at')::timestamptz, (p_attempt->>'duration_ms')::integer
  ) on conflict (id) do nothing;
  return v_attempt_id;
end;
$$;
revoke all on function public.record_concert_image_ocr(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_concert_image_ocr(jsonb, jsonb) to service_role;
-- SELECT FOR SHARE in the invoker function requires an UPDATE privilege.
-- service_role already has SELECT/UPDATE on concert_program_images from migration 001.
-- No permissions or policies on existing login/library tables are changed.
commit;
