-- 3E: isolated official-text storage; no OCR/current/view/review changes.
-- Deliberately does not insert, enable, disable or otherwise update v4 policy.
begin;
do $$ begin
  if to_regprocedure('public.program_identity_canonical(jsonb)') is null
    or to_regclass('public.concert_program_version_policy') is null
    or (select count(*) from information_schema.columns where table_schema='public' and table_name='concerts'
      and column_name in ('kopis_detail_text','kopis_detail_text_hash','program_context_revision'))<>3
    then raise exception 'Official text storage prerequisites required'; end if;
end; $$;

create table public.concert_program_text_analyses (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  source_kind text not null check(source_kind='KOPIS_DETAIL_TEXT'),
  matcher_version text not null check(matcher_version='stored-program-4'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  catalog_hash text not null references public.concert_program_catalogs(catalog_hash),
  concert_revision bigint not null check(concert_revision>=0),
  concert_context jsonb not null check(jsonb_typeof(concert_context)='object'),
  offset_unit text not null check(offset_unit='UNICODE_CODE_POINT'),
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  is_current boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique(concert_id,source_kind,matcher_version,source_hash,catalog_hash,concert_revision,concert_context)
);
create unique index concert_program_text_current_idx on public.concert_program_text_analyses(concert_id,source_kind,matcher_version) where is_current;
create table public.concert_program_text_candidates (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.concert_program_text_analyses(id) on delete cascade,
  candidate_key text not null check(candidate_key ~ '^[a-f0-9]{64}$'),
  logical_work_id text not null check(length(logical_work_id)>0),
  generation_version text not null check(generation_version='stored-program-4'),
  review_status text not null default 'REVIEW_REQUIRED' check(review_status='REVIEW_REQUIRED'),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  unique(analysis_id,candidate_key),unique(analysis_id,logical_work_id)
);
alter table public.concert_program_text_analyses enable row level security;
alter table public.concert_program_text_candidates enable row level security;
revoke all on public.concert_program_text_analyses,public.concert_program_text_candidates from public,anon,authenticated;
grant select,insert,update on public.concert_program_text_analyses,public.concert_program_text_candidates to service_role;
comment on table public.concert_program_text_analyses is 'Official KOPIS text only. Separate from OCR analyses. is_current is saved-current, not a live freshness/search assertion.';

create function public.save_concert_program_text_analysis_v4(p_analysis jsonb,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  k public.concerts%rowtype;
  old public.concert_program_text_analyses%rowtype;
  enabled boolean;
  source_text text;
  source_length integer;
  id uuid;
  item jsonb;
  work jsonb;
  section jsonb;
  span jsonb;
  ev jsonb;
  n bigint;
begin
  if jsonb_typeof(p_analysis) is distinct from 'object'
    or p_analysis->>'schema_version' is distinct from 'official-program-text-analysis-1'
    or p_analysis->>'source_kind' is distinct from 'KOPIS_DETAIL_TEXT'
    or p_analysis->>'matcher_version' is distinct from 'stored-program-4'
    or p_analysis->>'offset_unit' is distinct from 'UNICODE_CODE_POINT'
    or p_analysis ?| array['image_id','ocr_result_id','source_attempt_id','attempt_id']
    then raise exception 'Official text v4 payload required; OCR IDs not allowed'; end if;
  select p.enabled into enabled from public.concert_program_version_policy p where matcher_version='stored-program-4' for share;
  if not found or enabled is distinct from true then raise exception 'V4 disabled or policy missing'; end if;
  select * into k from public.concerts where concerts.id=(p_analysis->>'concert_id')::uuid for update;
  if not found then raise exception 'Concert missing'; end if;
  source_text:=k.kopis_detail_text;source_length:=length(source_text);
  if source_text is null or source_text='' or k.kopis_detail_text_hash is null
    or k.kopis_detail_text_hash is distinct from p_analysis->>'source_hash'
    or encode(sha256(convert_to(source_text,'UTF8')),'hex') is distinct from k.kopis_detail_text_hash
    then raise exception 'Stale or invalid official source hash'; end if;
  if (p_analysis->>'concert_revision')::bigint is distinct from k.program_context_revision
    or p_analysis->'concert_context' is distinct from jsonb_build_object('title',k.title,'venue',k.venue,'start_date',k.start_date,'end_date',k.end_date)
    then raise exception 'Stale concert context/revision'; end if;
  if encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex') is distinct from p_analysis->>'catalog_hash'
    or jsonb_typeof(p_catalog_json::jsonb->'works') is distinct from 'object'
    or jsonb_typeof(p_catalog_json::jsonb->'targets') is distinct from 'array' then raise exception 'Catalog hash/snapshot mismatch'; end if;
  if encode(sha256(convert_to(public.program_identity_canonical(p_analysis-'payload_hash'),'UTF8')),'hex') is distinct from p_analysis->>'payload_hash'
    then raise exception 'Payload hash mismatch'; end if;
  if jsonb_typeof(p_analysis->'source_sections') is distinct from 'array'
    or jsonb_typeof(p_analysis->'sections') is distinct from 'array'
    or jsonb_typeof(p_analysis->'logical_works') is distinct from 'array'
    or jsonb_typeof(p_analysis->'candidates') is distinct from 'array'
    then raise exception 'Official logical snapshot required'; end if;
  if jsonb_array_length(p_analysis->'source_sections')=0
    or jsonb_array_length(p_analysis->'logical_works')<>jsonb_array_length(p_analysis->'candidates')
    or (select count(distinct w->>'logical_work_id') from jsonb_array_elements(p_analysis->'logical_works') w)<>jsonb_array_length(p_analysis->'logical_works')
    or (select count(distinct c->>'logical_work_id') from jsonb_array_elements(p_analysis->'candidates') c)<>jsonb_array_length(p_analysis->'candidates')
    then raise exception 'Logical work/candidate 1:1 required'; end if;
  for span,n in select value,ordinality from jsonb_array_elements(p_analysis->'source_sections') with ordinality loop
    if (span->>'source_section_index')::integer is distinct from n-1
      or jsonb_typeof(span->'start') is distinct from 'number' or jsonb_typeof(span->'end') is distinct from 'number'
      or span->>'start' !~ '^[0-9]+$' or span->>'end' !~ '^[0-9]+$'
      or (span->>'start')::integer<0 or (span->>'end')::integer<= (span->>'start')::integer
      or (span->>'end')::integer>source_length then raise exception 'Invalid official section bounds'; end if;
    if n>1 and (span->>'start')::integer<((p_analysis->'source_sections')->(n::integer-2)->>'end')::integer
      then raise exception 'Overlapping official sections'; end if;
  end loop;
  for section,n in select value,ordinality from jsonb_array_elements(p_analysis->'sections') with ordinality loop
    span:=(p_analysis->'source_sections')->(section->>'source_section_index')::integer;
    if (section->>'index')::integer is distinct from n-1 or span is null
      or jsonb_typeof(section->'start') is distinct from 'number' or jsonb_typeof(section->'end') is distinct from 'number'
      or section->>'start' !~ '^[0-9]+$' or section->>'end' !~ '^[0-9]+$'
      or section->>'source_section_index' !~ '^[0-9]+$'
      or span->'source_section_index' is distinct from section->'source_section_index'
      or (section->>'start')::integer<(span->>'start')::integer or (section->>'end')::integer>(span->>'end')::integer
      or (section->>'end')::integer<(section->>'start')::integer then raise exception 'Invalid analysis section bounds'; end if;
  end loop;
  -- Check every quoted source object, including nested variants/matching data.
  -- diagnostic_utf16 is intentionally excluded from trust decisions.
  for ev in with recursive nodes(v) as (
    select p_analysis union all
    select child.v from nodes cross join lateral (
      select value v from jsonb_each(case when jsonb_typeof(nodes.v)='object' then nodes.v else '{}'::jsonb end)
      union all select value v from jsonb_array_elements(case when jsonb_typeof(nodes.v)='array' then nodes.v else '[]'::jsonb end)
    ) child
  ) select v from nodes where jsonb_typeof(v)='object' and v ? 'quote' loop
    if jsonb_typeof(ev->'quote') is distinct from 'string'
      or jsonb_typeof(ev->'start') is distinct from 'number' or jsonb_typeof(ev->'end') is distinct from 'number'
      or ev->>'start' !~ '^[0-9]+$' or ev->>'end' !~ '^[0-9]+$'
      or (ev->>'start')::integer<0 or (ev->>'end')::integer<=(ev->>'start')::integer
      or (ev->>'end')::integer>source_length
      or substring(source_text from (ev->>'start')::integer+1 for (ev->>'end')::integer-(ev->>'start')::integer) is distinct from ev->>'quote'
      or coalesce(ev->'bbox','null'::jsonb)<>'null'::jsonb or coalesce(ev->'confidence','null'::jsonb)<>'null'::jsonb
      then raise exception 'Official evidence quote/bounds mismatch'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_analysis->'candidates') loop
    select value into work from jsonb_array_elements(p_analysis->'logical_works') where value->>'logical_work_id'=item->>'logical_work_id';
    section:=(p_analysis->'sections')->(item->>'section_index')::integer;
    if work is null or nullif(btrim(work->>'logical_work_id'),'') is null
      or item->>'generation_version' is distinct from 'stored-program-4' or item->>'review_status' is distinct from 'REVIEW_REQUIRED'
      or jsonb_typeof(work->'catalog_matches') is distinct from 'array' or jsonb_array_length(work->'catalog_matches')>1
      or work->'source_lines' is distinct from item->'evidence' or work->'work' is distinct from item->'identity'->'work'
      or work->'section_index' is distinct from item->'section_index' or work->'source_section_index' is distinct from item->'source_section_index'
      or section->>'classification' is null or section->>'classification' not in ('PROGRAM','UNCERTAIN')
      or jsonb_typeof(item->'section_index') is distinct from 'number' or item->>'section_index' !~ '^[0-9]+$'
      or section->'index' is distinct from item->'section_index'
      or section->'source_section_index' is distinct from item->'source_section_index'
      or jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')=0
      then raise exception 'Invalid v4 candidate/logical snapshot'; end if;
    if (item->>'work_id' is not null and (p_catalog_json::jsonb->'works'->(item->>'work_id')) is null)
      or (item->>'track_id' is not null and not exists(select 1 from jsonb_array_elements(p_catalog_json::jsonb->'targets') t
        where t->>'trackId'=item->>'track_id' and t->>'workId'=item->>'work_id'))
      then raise exception 'Candidate is not in catalog'; end if;
    for ev in select value from jsonb_array_elements(item->'evidence') loop
      if jsonb_typeof(ev) is distinct from 'object' or jsonb_typeof(ev->'quote') is distinct from 'string'
        or jsonb_typeof(ev->'start') is distinct from 'number' or jsonb_typeof(ev->'end') is distinct from 'number'
        or (ev->>'start')::integer<(section->>'start')::integer or (ev->>'end')::integer>(section->>'end')::integer
        then raise exception 'Candidate evidence outside its section'; end if;
    end loop;
  end loop;
  select * into old from public.concert_program_text_analyses a where a.concert_id=k.id
    and a.source_kind=p_analysis->>'source_kind' and a.matcher_version=p_analysis->>'matcher_version'
    and a.source_hash=p_analysis->>'source_hash' and a.catalog_hash=p_analysis->>'catalog_hash'
    and a.concert_revision=k.program_context_revision and a.concert_context=p_analysis->'concert_context' for update;
  if found then
    if old.payload_hash is distinct from p_analysis->>'payload_hash' or old.snapshot is distinct from p_analysis
      then raise exception 'Analysis changed: increment matcher version'; end if;
    -- The concert is locked and its CURRENT bytes/context matched above. If
    -- that exact source returns later, reuse its ID and restore only this text
    -- namespace's current pointer; never touch an OCR snapshot or timestamp.
    if not old.is_current then
      update public.concert_program_text_analyses a set is_current=false where a.concert_id=k.id and a.source_kind=old.source_kind and a.matcher_version=old.matcher_version and a.is_current;
      update public.concert_program_text_analyses a set is_current=true where a.id=old.id;
    end if;
    return old.id;
  end if;
  insert into public.concert_program_catalogs(catalog_hash,catalog) values(p_analysis->>'catalog_hash',p_catalog_json::jsonb) on conflict do nothing;
  if not exists(select 1 from public.concert_program_catalogs c where c.catalog_hash=p_analysis->>'catalog_hash' and c.catalog=p_catalog_json::jsonb)
    then raise exception 'Catalog snapshot collision'; end if;
  update public.concert_program_text_analyses a set is_current=false where a.concert_id=k.id and a.source_kind=p_analysis->>'source_kind' and a.matcher_version=p_analysis->>'matcher_version' and a.is_current;
  insert into public.concert_program_text_analyses(concert_id,source_kind,matcher_version,source_hash,catalog_hash,concert_revision,concert_context,offset_unit,payload_hash,snapshot)
  values(k.id,p_analysis->>'source_kind',p_analysis->>'matcher_version',p_analysis->>'source_hash',p_analysis->>'catalog_hash',k.program_context_revision,p_analysis->'concert_context',p_analysis->>'offset_unit',p_analysis->>'payload_hash',p_analysis) returning concert_program_text_analyses.id into id;
  for item in select value from jsonb_array_elements(p_analysis->'candidates') loop
    insert into public.concert_program_text_candidates(analysis_id,candidate_key,logical_work_id,generation_version,snapshot)
    values(id,item->>'candidate_key',item->>'logical_work_id',item->>'generation_version',item);
  end loop;
  return id;
end; $$;
revoke all on function public.save_concert_program_text_analysis_v4(jsonb,text) from public,anon,authenticated;
grant execute on function public.save_concert_program_text_analysis_v4(jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
