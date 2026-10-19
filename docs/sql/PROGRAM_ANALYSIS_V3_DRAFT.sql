-- DRAFT ONLY. Not in supabase/migrations; never auto-applied by this change.
-- Apply only after reviewing the v3 canary/rollback plan. No existing v2
-- analysis payload, candidate, review, current flag or timestamp is updated.
begin;
alter table public.concert_program_analyses add column snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot)='object');
drop index public.concert_program_analysis_current_image_idx;
create unique index concert_program_analysis_current_image_version_idx
  on public.concert_program_analyses(image_id,matcher_version) where is_current;
create table public.concert_program_version_policy (
  matcher_version text primary key,
  enabled boolean not null,
  note text not null check (length(btrim(note)) between 1 and 2000)
);
alter table public.concert_program_version_policy enable row level security;
revoke all on public.concert_program_version_policy from public, anon, authenticated;
grant select,insert,update on public.concert_program_version_policy to service_role;
-- Absence of a policy means enabled. Disable only v3 with an explicit policy;
-- selection falls back to the latest enabled snapshot without editing v2 rows.
create or replace function public.save_concert_program_analysis(p_analysis jsonb, p_catalog_json text)
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
    where image_id = v_image.id and is_current and matcher_version = p_analysis->>'matcher_version';
  insert into public.concert_program_analyses(concert_id, image_id, ocr_result_id, source_attempt_id, image_revision, concert_revision, concert_context,
    matcher_version, catalog_hash, sections, limitations, payload_hash, created_at)
  values (v_image.concert_id, v_image.id, v_ocr.id, (p_analysis->>'source_attempt_id')::uuid, (p_analysis->>'image_revision')::bigint, (p_analysis->>'concert_revision')::bigint,
    p_analysis->'concert_context', p_analysis->>'matcher_version', p_analysis->>'catalog_hash',
    p_analysis->'sections', p_analysis->'limitations', p_analysis->>'payload_hash', clock_timestamp()) returning id into v_id;
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


create function public.save_concert_program_analysis_v3(p_analysis jsonb,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_id uuid;
  v_snapshot jsonb;
begin
  if p_analysis->>'matcher_version' is distinct from 'stored-program-3' then raise exception 'V3 version required'; end if;
  if exists (select 1 from public.concert_program_version_policy p where p.matcher_version='stored-program-3' and not p.enabled)
    then raise exception 'V3 version disabled'; end if;
  if jsonb_typeof(p_analysis->'logical_works') is distinct from 'array'
    or jsonb_typeof(p_analysis->'grouping') is distinct from 'object'
    or jsonb_typeof(p_analysis->'candidates') is distinct from 'array' then raise exception 'V3 logical snapshot required'; end if;
  if jsonb_array_length(p_analysis->'logical_works') <> jsonb_array_length(p_analysis->'candidates')
    or (select count(distinct w->>'logical_work_id') from jsonb_array_elements(p_analysis->'logical_works') w) <> jsonb_array_length(p_analysis->'logical_works')
    or (select count(distinct c->>'logical_work_id') from jsonb_array_elements(p_analysis->'candidates') c) <> jsonb_array_length(p_analysis->'candidates')
    or exists(select 1 from jsonb_array_elements(p_analysis->'logical_works') w
      where jsonb_typeof(w->'catalog_matches') is distinct from 'array' or jsonb_array_length(w->'catalog_matches') > 1)
    or exists(select 1 from jsonb_array_elements(p_analysis->'candidates') c
      where c->>'generation_version' is distinct from 'stored-program-3'
        or not exists(select 1 from jsonb_array_elements(p_analysis->'logical_works') w where w->>'logical_work_id'=c->>'logical_work_id'))
    then raise exception 'One candidate and at most one catalog decision per logical work required'; end if;
  v_id := public.save_concert_program_analysis(p_analysis,p_catalog_json);
  select snapshot into v_snapshot from public.concert_program_analyses where id=v_id for update;
  -- Compare complete JSON too: a caller cannot reuse an old hash for changed data.
  if v_snapshot is not null and v_snapshot is distinct from p_analysis then raise exception 'Analysis changed: increment matcher version'; end if;
  if v_snapshot is null then
    update public.concert_program_analyses set snapshot=p_analysis where id=v_id and matcher_version='stored-program-3';
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_concert_program_analysis_v3(jsonb,text) from public,anon,authenticated;
grant execute on function public.save_concert_program_analysis_v3(jsonb,text) to service_role;
create or replace view public.concert_program_candidate_status with (security_invoker = true) as
select candidate.*, analysis.concert_id, concert.kopis_id, concert.title as concert_title,
  image.source_url, analysis.ocr_result_id, analysis.matcher_version, analysis.catalog_hash,
  current_choice.selected as analysis_is_current,
  analysis.sections->candidate.section_index as section,
  validity.reason as stale_reason,
  case when validity.reason is not null then 'REVIEW_REQUIRED' else candidate.review_status end as effective_status,
  current_choice.selected and validity.reason is null and candidate.review_status = 'CONFIRMED' as is_effectively_confirmed
from public.concert_program_candidates candidate
join public.concert_program_analyses analysis on analysis.id = candidate.analysis_id
join public.concerts concert on concert.id = analysis.concert_id
join public.concert_program_images image on image.id = analysis.image_id
cross join lateral (select analysis.is_current
  and not exists (select 1 from public.concert_program_version_policy p where p.matcher_version=analysis.matcher_version and not p.enabled)
  and not exists (select 1 from public.concert_program_analyses newer
    where newer.image_id=analysis.image_id and newer.is_current
      and not exists (select 1 from public.concert_program_version_policy p where p.matcher_version=newer.matcher_version and not p.enabled)
      and (newer.created_at,newer.id) > (analysis.created_at,analysis.id)) as selected) current_choice
cross join lateral (select case when not current_choice.selected then 'ANALYSIS_SUPERSEDED'
  else public.concert_program_evidence_issue(analysis.ocr_result_id, analysis.image_revision, analysis.concert_context, analysis.source_attempt_id, analysis.concert_revision) end as reason) validity;

create or replace function public.review_concert_program_candidate(p_candidate_id uuid, p_status text, p_note text,
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
    or a.catalog_hash <> p_catalog_hash
    or not exists (select 1 from public.concert_program_candidate_status s where s.id=c.id and s.analysis_is_current) then raise exception 'Candidate analysis is no longer current'; end if;
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

notify pgrst, 'reload schema';
commit;
