begin;

-- Increment only when a source leaves/re-enters the active set or changes identity.
-- Ordinary successful collection does not invalidate an otherwise identical snapshot.
alter table public.concert_program_images add column evidence_revision bigint not null default 0;
alter table public.concerts add column program_context_revision bigint not null default 0;
create function public.bump_program_concert_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.title, new.venue, new.start_date, new.end_date) is distinct from row(old.title, old.venue, old.start_date, old.end_date) then
    new.program_context_revision := old.program_context_revision + 1;
  else new.program_context_revision := old.program_context_revision;
  end if;
  return new;
end;
$$;
create trigger program_concert_revision before update on public.concerts
for each row execute function public.bump_program_concert_revision();
create function public.bump_program_image_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_active is distinct from old.is_active or new.source_url is distinct from old.source_url
    or new.image_type is distinct from old.image_type then
    new.evidence_revision := old.evidence_revision + 1;
  else new.evidence_revision := old.evidence_revision;
  end if;
  return new;
end;
$$;
create trigger program_image_revision before update on public.concert_program_images
for each row execute function public.bump_program_image_revision();
create index concert_image_ocr_attempts_ingested_idx on public.concert_image_ocr_attempts(image_id, created_at desc, finished_at desc, id desc);

create table public.concert_program_catalogs (
  catalog_hash text primary key check (catalog_hash ~ '^[a-f0-9]{64}$'),
  catalog jsonb not null check (jsonb_typeof(catalog) = 'object'),
  created_at timestamptz not null default now()
);
create table public.concert_program_analyses (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  image_id uuid not null references public.concert_program_images(id) on delete cascade,
  ocr_result_id uuid not null references public.concert_image_ocr_results(id),
  source_attempt_id uuid not null references public.concert_image_ocr_attempts(id),
  image_revision bigint not null,
  concert_revision bigint not null,
  concert_context jsonb not null,
  matcher_version text not null check (length(matcher_version) between 1 and 150),
  catalog_hash text not null references public.concert_program_catalogs(catalog_hash),
  sections jsonb not null check (jsonb_typeof(sections) = 'array'),
  limitations jsonb not null check (jsonb_typeof(limitations) = 'array'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ocr_result_id, matcher_version, catalog_hash, image_revision, concert_revision, concert_context, source_attempt_id)
);
create unique index concert_program_analysis_current_image_idx on public.concert_program_analyses(image_id) where is_current;
create table public.concert_program_candidates (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.concert_program_analyses(id) on delete cascade,
  candidate_key text not null check (candidate_key ~ '^[a-f0-9]{64}$'),
  track_id text,
  work_id text,
  identity jsonb not null check (jsonb_typeof(identity) = 'object'),
  relation text not null check (relation in ('EXACT', 'WHOLE_WORK_REFERENCE', 'ARRANGEMENT_OR_EXCERPT', 'AMBIGUOUS')),
  outcome text not null check (outcome in ('MATCHED', 'UNREGISTERED', 'AMBIGUOUS', 'CONFLICT')),
  section_index integer not null check (section_index >= 0),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  generation_reasons jsonb not null check (jsonb_typeof(generation_reasons) = 'array'),
  review_reasons jsonb not null check (jsonb_typeof(review_reasons) = 'array'),
  review_status text not null default 'REVIEW_REQUIRED' check (review_status in ('REVIEW_REQUIRED', 'CONFIRMED', 'REJECTED')),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, candidate_key),
  check (review_status <> 'CONFIRMED' or track_id is not null)
);
create index concert_program_candidates_analysis_status_idx on public.concert_program_candidates(analysis_id, review_status);
create table public.concert_program_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.concert_program_candidates(id) on delete cascade,
  status text not null check (status in ('CONFIRMED', 'REJECTED')),
  note text not null check (length(btrim(note)) between 1 and 2000),
  reviewer_kind text not null default 'LOCAL_SERVICE_ROLE_OPERATOR' check (reviewer_kind = 'LOCAL_SERVICE_ROLE_OPERATOR'),
  reviewed_at timestamptz not null default now()
);
comment on table public.concert_program_reviews is
  'Manual CLI decisions. service_role operator is not an authenticated application user. History is append-only.';
comment on column public.concert_program_candidates.evidence is
  'Exact OCR quotations with zero-based Unicode code-point offsets, exclusive end, optional original bbox/confidence. Not OCR truth.';

-- Known freshness only. No request is made to the image URL and current remote bytes are unverified.
create function public.concert_program_evidence_issue(p_ocr_id uuid, p_revision bigint, p_context jsonb, p_attempt_id uuid, p_concert_revision bigint)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare
  r public.concert_image_ocr_results%rowtype;
  i public.concert_program_images%rowtype;
  c public.concerts%rowtype;
  a public.concert_image_ocr_attempts%rowtype;
begin
  select * into r from public.concert_image_ocr_results where id = p_ocr_id;
  if not found then return 'OCR_MISSING'; end if;
  select * into i from public.concert_program_images where id = r.image_id;
  if not i.is_active or i.image_type <> 'DETAIL' then return 'IMAGE_INACTIVE_OR_NOT_DETAIL'; end if;
  if i.evidence_revision <> p_revision then return 'IMAGE_REVISION_CHANGED'; end if;
  select * into c from public.concerts where id = i.concert_id;
  if c.program_context_revision is distinct from p_concert_revision then return 'CONCERT_CONTEXT_CHANGED'; end if;
  if p_context is distinct from jsonb_build_object('title', c.title, 'venue', c.venue, 'start_date', c.start_date, 'end_date', c.end_date)
    then return 'CONCERT_CONTEXT_CHANGED'; end if;
  select * into a from public.concert_image_ocr_attempts where image_id = i.id order by created_at desc, finished_at desc, id desc limit 1;
  if not found or a.status <> 'SUCCEEDED' then return 'LATEST_OCR_NOT_SUCCESSFUL'; end if;
  if a.id is distinct from p_attempt_id then return 'OCR_ATTEMPT_CHANGED'; end if;
  if a.result_id is distinct from r.id then return 'OCR_REPLACED'; end if;
  if exists (select 1 from public.concert_image_ocr_attempts x where x.image_id = i.id
    and x.created_at = a.created_at and x.finished_at = a.finished_at and x.result_id is distinct from a.result_id) then return 'OCR_ORDER_AMBIGUOUS'; end if;
  if exists (select 1 from public.concert_image_ocr_results x where x.image_id = i.id and x.created_at > a.created_at)
    then return 'NEWER_OCR_RESULT'; end if;
  return null;
end;
$$;

create function public.save_concert_program_analysis(p_analysis jsonb, p_catalog_json text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_existing public.concert_program_analyses%rowtype;
  v_image public.concert_program_images%rowtype;
  v_ocr public.concert_image_ocr_results%rowtype;
  v_item jsonb;
  v_ev jsonb;
  v_issue text;
  v_section jsonb;
begin
  if jsonb_typeof(p_analysis) is distinct from 'object' or jsonb_typeof(p_analysis->'candidates') is distinct from 'array'
    or jsonb_typeof(p_analysis->'sections') is distinct from 'array' then raise exception 'Invalid analysis snapshot'; end if;
  if encode(sha256(convert_to(p_catalog_json, 'UTF8')), 'hex') is distinct from p_analysis->>'catalog_hash'
    then raise exception 'Catalog hash mismatch'; end if;
  select * into v_image from public.concert_program_images where id = (p_analysis->>'image_id')::uuid;
  if not found or v_image.concert_id <> (p_analysis->>'concert_id')::uuid then raise exception 'Image concert mismatch'; end if;
  -- Lock the concert too so collection cannot change context during the snapshot transaction.
  perform 1 from public.concerts where id = v_image.concert_id for share;
  select * into v_image from public.concert_program_images where id = (p_analysis->>'image_id')::uuid for update;
  select * into v_ocr from public.concert_image_ocr_results where id = (p_analysis->>'ocr_result_id')::uuid;
  if not found or v_ocr.image_id <> v_image.id then raise exception 'OCR image mismatch'; end if;
  v_issue := public.concert_program_evidence_issue(v_ocr.id, (p_analysis->>'image_revision')::bigint, p_analysis->'concert_context', (p_analysis->>'source_attempt_id')::uuid, (p_analysis->>'concert_revision')::bigint);
  if v_issue is not null then raise exception 'Stale program evidence: %', v_issue; end if;
  select * into v_existing from public.concert_program_analyses where ocr_result_id = v_ocr.id
    and matcher_version = p_analysis->>'matcher_version' and catalog_hash = p_analysis->>'catalog_hash'
    and image_revision = (p_analysis->>'image_revision')::bigint and concert_context = p_analysis->'concert_context'
    and concert_revision = (p_analysis->>'concert_revision')::bigint
    and source_attempt_id = (p_analysis->>'source_attempt_id')::uuid;
  if found then
    if v_existing.payload_hash <> p_analysis->>'payload_hash' then raise exception 'Analysis changed: increment matcher version'; end if;
    -- An old version rerun never reactivates a superseded snapshot or clears manual decisions.
    return v_existing.id;
  end if;
  insert into public.concert_program_catalogs(catalog_hash, catalog)
    values (p_analysis->>'catalog_hash', p_catalog_json::jsonb) on conflict do nothing;
  update public.concert_program_analyses set is_current = false, updated_at = clock_timestamp()
    where image_id = v_image.id and is_current;
  insert into public.concert_program_analyses(concert_id, image_id, ocr_result_id, source_attempt_id, image_revision, concert_revision, concert_context,
    matcher_version, catalog_hash, sections, limitations, payload_hash)
  values (v_image.concert_id, v_image.id, v_ocr.id, (p_analysis->>'source_attempt_id')::uuid, (p_analysis->>'image_revision')::bigint, (p_analysis->>'concert_revision')::bigint,
    p_analysis->'concert_context', p_analysis->>'matcher_version', p_analysis->>'catalog_hash',
    p_analysis->'sections', p_analysis->'limitations', p_analysis->>'payload_hash') returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_analysis->'candidates') loop
    if v_item->>'review_status' is distinct from 'REVIEW_REQUIRED' then raise exception 'Automatic decisions are review required'; end if;
    v_section := (p_analysis->'sections')->(v_item->>'section_index')::integer;
    if v_section->>'classification' is null or v_section->>'classification' not in ('PROGRAM', 'UNCERTAIN') then raise exception 'Invalid candidate section'; end if;
    if v_item->>'track_id' is not null and not exists (
      select 1 from jsonb_array_elements((p_catalog_json::jsonb)->'targets') t
      where t->>'trackId' = v_item->>'track_id' and t->>'workId' = v_item->>'work_id'
    ) then raise exception 'Track is not in catalog snapshot'; end if;
    for v_ev in select value from jsonb_array_elements(v_item->'evidence') loop
      if v_ev->>'start' is null or v_ev->>'end' is null or (v_ev->>'start')::integer < 0 or (v_ev->>'end')::integer <= (v_ev->>'start')::integer
        or v_ev->>'quote' is null or (v_ev->>'end')::integer > length(v_ocr.raw_text)
        or (v_ev->>'start')::integer < (v_section->>'start')::integer
        or (v_ev->>'end')::integer > (v_section->>'end')::integer
        or substring(v_ocr.raw_text from (v_ev->>'start')::integer + 1 for (v_ev->>'end')::integer - (v_ev->>'start')::integer)
          is distinct from v_ev->>'quote' then raise exception 'Evidence quote does not match OCR'; end if;
    end loop;
    insert into public.concert_program_candidates(analysis_id, candidate_key, track_id, work_id, identity, relation, outcome,
      section_index, evidence, generation_reasons, review_reasons)
    values(v_id, v_item->>'candidate_key', v_item->>'track_id', v_item->>'work_id', v_item->'identity', v_item->>'relation', v_item->>'outcome',
      (v_item->>'section_index')::integer, v_item->'evidence', v_item->'generation_reasons', v_item->'review_reasons');
  end loop;
  return v_id;
end;
$$;

create view public.concert_program_candidate_status with (security_invoker = true) as
select candidate.*, analysis.concert_id, concert.kopis_id, concert.title as concert_title,
  image.source_url, analysis.ocr_result_id, analysis.matcher_version, analysis.catalog_hash,
  analysis.is_current as analysis_is_current,
  analysis.sections->candidate.section_index as section,
  validity.reason as stale_reason,
  case when validity.reason is not null then 'REVIEW_REQUIRED' else candidate.review_status end as effective_status,
  analysis.is_current and validity.reason is null and candidate.review_status = 'CONFIRMED' as is_effectively_confirmed
from public.concert_program_candidates candidate
join public.concert_program_analyses analysis on analysis.id = candidate.analysis_id
join public.concerts concert on concert.id = analysis.concert_id
join public.concert_program_images image on image.id = analysis.image_id
cross join lateral (select case when not analysis.is_current then 'ANALYSIS_SUPERSEDED'
  else public.concert_program_evidence_issue(analysis.ocr_result_id, analysis.image_revision, analysis.concert_context, analysis.source_attempt_id, analysis.concert_revision) end as reason) validity;

create function public.review_concert_program_candidate(p_candidate_id uuid, p_status text, p_note text,
  p_analysis_id uuid, p_matcher_version text, p_catalog_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  c public.concert_program_candidates%rowtype;
  a public.concert_program_analyses%rowtype;
  v_issue text;
begin
  if p_status is null or p_status not in ('CONFIRMED', 'REJECTED') or p_note is null
    or length(btrim(p_note)) not between 1 and 2000 then raise exception 'Single manual decision and note required'; end if;
  select * into a from public.concert_program_analyses where id = p_analysis_id;
  if not found then raise exception 'Analysis missing'; end if;
  perform 1 from public.concerts where id = a.concert_id for share;
  perform 1 from public.concert_program_images where id = a.image_id for update;
  select * into a from public.concert_program_analyses where id = p_analysis_id for share;
  select * into c from public.concert_program_candidates where id = p_candidate_id for update;
  if not found or c.analysis_id <> a.id or not a.is_current or a.matcher_version <> p_matcher_version
    or a.catalog_hash <> p_catalog_hash then raise exception 'Candidate analysis is no longer current'; end if;
  v_issue := public.concert_program_evidence_issue(a.ocr_result_id, a.image_revision, a.concert_context, a.source_attempt_id, a.concert_revision);
  if v_issue is not null then raise exception 'Stale program evidence: %', v_issue; end if;
  if p_status = 'CONFIRMED' and (c.track_id is null or c.relation = 'AMBIGUOUS') then raise exception 'Cannot confirm unresolved identity'; end if;
  -- HTTP retry of an unchanged decision is idempotent; changes append a new event.
  if c.review_status = p_status and c.review_note = btrim(p_note) then return c.id; end if;
  insert into public.concert_program_reviews(candidate_id, status, note) values (c.id, p_status, btrim(p_note));
  update public.concert_program_candidates set review_status = p_status, reviewed_at = clock_timestamp(),
    review_note = btrim(p_note), updated_at = clock_timestamp() where id = c.id;
  return c.id;
end;
$$;

alter table public.concert_program_catalogs enable row level security;
alter table public.concert_program_analyses enable row level security;
alter table public.concert_program_candidates enable row level security;
alter table public.concert_program_reviews enable row level security;
revoke all on table public.concert_program_catalogs, public.concert_program_analyses, public.concert_program_candidates,
  public.concert_program_reviews, public.concert_program_candidate_status from public, anon, authenticated;
grant select, insert on public.concert_program_catalogs, public.concert_program_reviews to service_role;
grant select, insert, update on public.concert_program_analyses, public.concert_program_candidates to service_role;
grant select on public.concert_program_candidate_status to service_role;
revoke all on function public.bump_program_image_revision() from public, anon, authenticated;
revoke all on function public.bump_program_concert_revision() from public, anon, authenticated;
revoke all on function public.concert_program_evidence_issue(uuid, bigint, jsonb, uuid, bigint) from public, anon, authenticated;
revoke all on function public.save_concert_program_analysis(jsonb, text) from public, anon, authenticated;
revoke all on function public.review_concert_program_candidate(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.concert_program_evidence_issue(uuid, bigint, jsonb, uuid, bigint),
  public.save_concert_program_analysis(jsonb, text), public.review_concert_program_candidate(uuid, text, text, uuid, text, text) to service_role;
commit;
