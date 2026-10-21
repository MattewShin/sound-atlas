-- Prerequisite: reviewed PROGRAM_ANALYSIS_V3_DRAFT.sql already applied.
-- No catalog/analysis/candidate/review rows are backfilled by this migration.
begin;

create function public.program_identity_canonical(p_value jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v text;
begin
  case jsonb_typeof(p_value)
    when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.program_identity_canonical(value),',' order by key collate "C"),'')||'}' into v from jsonb_each(p_value);
    when 'array' then select '['||coalesce(string_agg(public.program_identity_canonical(value),',' order by n),'')||']' into v from jsonb_array_elements(p_value) with ordinality x(value,n);
    when 'number' then v:=trim_scale((p_value#>>'{}')::numeric)::text;
    else v:=coalesce(p_value::text,'null');
  end case;
  return v;
end; $$;
create function public.program_identity_normalize(p_value jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb;
begin
  case jsonb_typeof(p_value)
    when 'string' then return to_jsonb(btrim(regexp_replace(translate(normalize(p_value#>>'{}',NFKC),'‐‑‒–—−','------'),E'[ \\t\\r\\n\\f\\v]+',' ','g')));
    when 'object' then select coalesce(jsonb_object_agg(key,public.program_identity_normalize(value)),'{}') into v from jsonb_each(p_value);
    when 'array' then select coalesce(jsonb_agg(value order by public.program_identity_canonical(value) collate "C"),'[]') into v from (select distinct public.program_identity_normalize(value) value from jsonb_array_elements(p_value)) x;
    else return coalesce(p_value,'null');
  end case;
  return v;
end; $$;
create function public.program_work_identity(p_catalog jsonb,p_work_id text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare w jsonb; t jsonb; fields text[]; projected jsonb; targets jsonb:='[]'; k text;
begin
  w:=p_catalog->'works'->p_work_id;
  if w is null or w->>'id' is distinct from p_work_id or jsonb_typeof(p_catalog->'targets') is distinct from 'array' then return null; end if;
  fields:=array['id','composer','title','titleEn','alias','aliases','type','cycleId','monthEn','opus','opusPart','opusSuffix','number','bookNumber','catalogue','catalogueNumber','musicalKeys','arrangement','instrumentation','excerpt'];
  projected:='{}';
  foreach k in array fields loop projected:=projected||jsonb_build_object(k,coalesce(nullif(w->k,'null'::jsonb),case when k in ('aliases','musicalKeys') then '[]'::jsonb else 'null'::jsonb end)); end loop;
  w:=projected;
  for t in select value from jsonb_array_elements(p_catalog->'targets') where value->>'workId'=p_work_id loop
    if nullif(t->>'trackId','') is null then return null; end if;
    projected:='{}';
    foreach k in array array['trackId','workId','title','alias','movement','movementNumber','arrangement','instrumentation','excerpt'] loop projected:=projected||jsonb_build_object(k,coalesce(t->k,'null')); end loop;
    targets:=targets||jsonb_build_array(projected);
  end loop;
  if jsonb_array_length(targets)=0 or (select count(distinct value->>'trackId') from jsonb_array_elements(targets))<>jsonb_array_length(targets) then return null; end if;
  return public.program_identity_normalize(jsonb_build_object('schema','work-identity-1','work',w,'targets',targets));
end; $$;
create function public.program_work_identity_hash(p_catalog jsonb,p_work_id text)
returns text language sql immutable set search_path='' as $$
  select case when public.program_work_identity(p_catalog,p_work_id) is not null then encode(sha256(convert_to(public.program_identity_canonical(public.program_work_identity(p_catalog,p_work_id)),'UTF8')),'hex') end;
$$;

alter table public.concert_program_reviews
  add column work_identity_hash text check(work_identity_hash is null or work_identity_hash ~ '^[a-f0-9]{64}$'),
  add column work_identity_snapshot jsonb,
  add column identity_source text check(identity_source in ('MANUAL_CONFIRMATION','VERIFIED_LEGACY_BACKFILL')),
  add column identity_attested_at timestamptz,
  add column identity_source_git_commit text,
  add column confirmed_evidence_hash text,
  add column confirmed_matcher_version text,
  add column confirmed_pipeline_version text;
alter table public.concert_program_reviews add constraint program_review_identity_complete check (
  (work_identity_hash is null and work_identity_snapshot is null and identity_source is null and identity_attested_at is null and confirmed_evidence_hash is null and confirmed_matcher_version is null and confirmed_pipeline_version is null and identity_source_git_commit is null)
  or (status='CONFIRMED' and work_identity_hash is not null and work_identity_snapshot->>'schema'='work-identity-1'
    and identity_source is not null and identity_attested_at is not null and confirmed_evidence_hash ~ '^[a-f0-9]{64}$'
    and confirmed_matcher_version is not null and confirmed_pipeline_version is not null
    and (identity_source='MANUAL_CONFIRMATION' or identity_source_git_commit ~ '^[a-f0-9]{40}$')) is true);
alter table public.concert_program_candidates
  add column matching_catalog_hash text references public.concert_program_catalogs(catalog_hash),
  add column rematch_source_candidate_id uuid,
  add column rematch_payload_hash text,
  add column rematch_snapshot jsonb;
-- Source is required to be in the SAME analysis by the rematch RPC. Avoid a new
-- inbound FK to the cleanup-owned graph; existing analysis cascade owns both rows.
create unique index program_rematch_once_idx on public.concert_program_candidates(rematch_source_candidate_id,matching_catalog_hash) where rematch_source_candidate_id is not null;

create function public.program_confirmation_evidence_hash(p_id uuid)
returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(public.program_identity_canonical(jsonb_build_object(
   'candidate',jsonb_build_object('id',c.id,'analysis_id',c.analysis_id,'track_id',c.track_id,'work_id',c.work_id,'relation',c.relation,'outcome',c.outcome,'evidence',c.evidence,'identity',c.identity,'section_index',c.section_index),
   'analysis',jsonb_build_object('ocr_result_id',a.ocr_result_id,'source_attempt_id',a.source_attempt_id,'matcher_version',a.matcher_version,'image_revision',a.image_revision,'concert_revision',a.concert_revision,'concert_context',a.concert_context),
   'ocr',jsonb_build_object('content_sha256',o.content_sha256,'pipeline_version',o.pipeline_version,'raw_text_hash',encode(sha256(convert_to(o.raw_text,'UTF8')),'hex'),'detections',o.detections,'settings',o.settings,'width',o.width,'height',o.height)
 )),'UTF8')),'hex') from public.concert_program_candidates c join public.concert_program_analyses a on a.id=c.analysis_id join public.concert_image_ocr_results o on o.id=a.ocr_result_id where c.id=p_id;
$$;
create function public.protect_program_review_identity()
returns trigger language plpgsql set search_path='' as $$
declare a public.concert_program_analyses%rowtype; c public.concert_program_candidates%rowtype; cat jsonb; pipeline text;
begin
 if tg_op='UPDATE' then
  if row(new.id,new.candidate_id,new.status,new.note,new.reviewer_kind,new.reviewed_at) is distinct from row(old.id,old.candidate_id,old.status,old.note,old.reviewer_kind,old.reviewed_at)
    or old.work_identity_hash is not null or new.identity_source is distinct from 'VERIFIED_LEGACY_BACKFILL' then raise exception 'Review events and identity attestations are immutable'; end if;
 end if;
 if new.status='CONFIRMED' then
  select * into c from public.concert_program_candidates where id=new.candidate_id;
  select * into a from public.concert_program_analyses where id=c.analysis_id;
  select catalog into cat from public.concert_program_catalogs where catalog_hash=coalesce(c.matching_catalog_hash,a.catalog_hash);
  select pipeline_version into pipeline from public.concert_image_ocr_results where id=a.ocr_result_id;
  if c.relation<>'EXACT' or c.outcome<>'MATCHED' or new.work_identity_hash is null
   or new.work_identity_snapshot is distinct from public.program_work_identity(cat,c.work_id)
   or new.work_identity_hash is distinct from public.program_work_identity_hash(cat,c.work_id)
   or new.confirmed_evidence_hash is distinct from public.program_confirmation_evidence_hash(c.id)
   or new.confirmed_matcher_version is distinct from a.matcher_version or new.confirmed_pipeline_version is distinct from pipeline
    then raise exception 'Invalid confirmation identity or evidence'; end if;
 end if;
 return new;
end; $$;
create trigger program_review_identity_immutable before insert or update on public.concert_program_reviews for each row execute function public.protect_program_review_identity();

create function public.program_candidate_snapshot_valid(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare c public.concert_program_candidates%rowtype; a public.concert_program_analyses%rowtype; o public.concert_image_ocr_results%rowtype; snap jsonb; field text; ev jsonb;
begin
 select * into c from public.concert_program_candidates where id=p_id;
 select * into a from public.concert_program_analyses where id=c.analysis_id;
 select * into o from public.concert_image_ocr_results where id=a.ocr_result_id;
 snap:=c.rematch_snapshot;
 if snap is null then select value into snap from jsonb_array_elements(a.snapshot->'candidates') where value->>'candidate_key'=c.candidate_key;end if;
 if snap is null or jsonb_typeof(c.evidence) is distinct from 'array' or jsonb_array_length(c.evidence)=0 then return false;end if;
 foreach field in array array['track_id','work_id','relation','outcome','section_index','identity','evidence'] loop
  if coalesce(snap->field,'null') is distinct from coalesce(to_jsonb(c)->field,'null') then return false;end if;
 end loop;
 for ev in select value from jsonb_array_elements(c.evidence) loop
  if (ev->>'start')::int<0 or (ev->>'end')::int>(length(o.raw_text)) or (ev->>'end')::int<=(ev->>'start')::int
    or substring(o.raw_text from (ev->>'start')::int+1 for (ev->>'end')::int-(ev->>'start')::int) is distinct from ev->>'quote' then return false;end if;
 end loop;
 return exists(select 1 from public.concert_image_ocr_attempts t where t.id=a.source_attempt_id and t.result_id=o.id and t.content_sha256=o.content_sha256 and t.pipeline_version=o.pipeline_version);
end; $$;

-- Preserve every pre-existing column position for dependent PostgREST clients.
create or replace view public.concert_program_candidate_status with (security_invoker=true) as
select c.id,c.analysis_id,c.candidate_key,c.track_id,c.work_id,c.identity,c.relation,c.outcome,c.section_index,c.evidence,c.generation_reasons,c.review_reasons,c.review_status,c.reviewed_at,c.review_note,c.created_at,c.updated_at,
 a.concert_id,k.kopis_id,k.title as concert_title,i.source_url,a.ocr_result_id,a.matcher_version,a.catalog_hash,
 choice.selected as analysis_is_current,a.sections->c.section_index as section,validity.reason as stale_reason,
 case when validity.reason is not null then 'REVIEW_REQUIRED' else c.review_status end as effective_status,
 choice.selected and validity.reason is null and c.review_status='CONFIRMED' and c.relation='EXACT' and c.outcome='MATCHED' as is_effectively_confirmed,
 r.id as confirmation_review_id,r.work_identity_hash as confirmed_work_identity_hash,r.confirmed_matcher_version as confirmation_matcher_version,r.confirmed_pipeline_version as confirmation_pipeline_version,
 c.matching_catalog_hash,c.rematch_source_candidate_id,c.rematch_payload_hash,
 public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision) as evidence_stale_reason,c.rematch_snapshot,k.end_date as concert_end_date
from public.concert_program_candidates c join public.concert_program_analyses a on a.id=c.analysis_id
join public.concerts k on k.id=a.concert_id join public.concert_program_images i on i.id=a.image_id
left join lateral (select x.* from public.concert_program_reviews x where x.candidate_id=c.id order by x.reviewed_at desc,x.id desc limit 1) r on true
cross join lateral (select
 not exists(select 1 from public.concert_program_version_policy p where p.matcher_version=a.matcher_version and not p.enabled)
 and (a.is_current or (c.review_status='CONFIRMED' and exists(select 1 from public.concert_program_analyses n where n.image_id=a.image_id and n.matcher_version=a.matcher_version and n.is_current
   and n.ocr_result_id=a.ocr_result_id and n.source_attempt_id=a.source_attempt_id and n.image_revision=a.image_revision and n.concert_revision=a.concert_revision and n.concert_context=a.concert_context)))
 and (c.review_status<>'REVIEW_REQUIRED' or not exists(select 1 from public.concert_program_candidates n where n.rematch_source_candidate_id=coalesce(c.rematch_source_candidate_id,c.id) and (n.created_at,n.id)>(c.created_at,c.id))) as selected) choice
cross join lateral(select case
 when not choice.selected then 'ANALYSIS_SUPERSEDED'
 when public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision) is not null then 'EVIDENCE_CHANGED'
 when c.review_status='CONFIRMED' and (c.relation<>'EXACT' or c.outcome<>'MATCHED') then 'NOT_EXACT'
 when c.review_status='CONFIRMED' and (r.status is distinct from 'CONFIRMED' or r.note is distinct from c.review_note or c.reviewed_at is null or r.reviewed_at>c.reviewed_at or r.work_identity_hash is null) then 'CONFIRMATION_IDENTITY_MISSING'
 when c.review_status='CONFIRMED' and r.confirmed_matcher_version is distinct from a.matcher_version then 'MATCHER_VERSION_CHANGED'
 when c.review_status='CONFIRMED' and r.confirmed_evidence_hash is distinct from public.program_confirmation_evidence_hash(c.id) then 'EVIDENCE_CHANGED'
 else null end as reason) validity;

-- One lock order for review, backfill and rematch: concert -> image -> candidate.
create function public.review_concert_program_candidate_identity(p_candidate_id uuid,p_status text,p_note text,p_analysis_id uuid,p_matcher_version text,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.concert_program_candidates%rowtype; a public.concert_program_analyses%rowtype; cat jsonb:=p_catalog_json::jsonb; saved jsonb; identity jsonb; hash text; pipeline text; rid uuid; at_time timestamptz;
begin
 if p_status is null or p_status not in ('CONFIRMED','REJECTED') or p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'Single manual decision and note required'; end if;
 select * into a from public.concert_program_analyses where id=p_analysis_id;
 perform 1 from public.concerts where id=a.concert_id for share;
 perform 1 from public.concert_program_images where id=a.image_id for update;
 select * into c from public.concert_program_candidates where id=p_candidate_id for update;
 if c.id is null or c.analysis_id<>a.id or a.matcher_version<>p_matcher_version or not exists(select 1 from public.concert_program_candidate_status s where s.id=c.id and s.analysis_is_current and s.evidence_stale_reason is null) then raise exception 'Candidate analysis is no longer current'; end if;
 if p_status='CONFIRMED' then
  if not public.program_candidate_snapshot_valid(c.id) then raise exception 'Historical evidence unproven';end if;
  select catalog into saved from public.concert_program_catalogs where catalog_hash=coalesce(c.matching_catalog_hash,a.catalog_hash);
  identity:=public.program_work_identity(cat,c.work_id);hash:=public.program_work_identity_hash(cat,c.work_id);
  if hash is null or hash is distinct from public.program_work_identity_hash(saved,c.work_id) or c.relation<>'EXACT' or c.outcome<>'MATCHED'
   or not exists(select 1 from jsonb_array_elements(cat->'targets') t where t->>'trackId'=c.track_id and t->>'workId'=c.work_id) then raise exception 'Work identity changed or not EXACT'; end if;
  select pipeline_version into pipeline from public.concert_image_ocr_results where id=a.ocr_result_id;
 end if;
 if c.review_status=p_status and c.review_note=btrim(p_note) then
  if p_status='CONFIRMED' and not exists(select 1 from public.concert_program_candidate_status where id=c.id and confirmed_work_identity_hash=hash and is_effectively_confirmed) then raise exception 'Confirmation identity missing; use verified backfill'; end if;
  return c.id;
 end if;
 at_time:=clock_timestamp();
 insert into public.concert_program_reviews(candidate_id,status,note,reviewed_at,work_identity_hash,work_identity_snapshot,identity_source,identity_attested_at,confirmed_evidence_hash,confirmed_matcher_version,confirmed_pipeline_version)
 values(c.id,p_status,btrim(p_note),at_time,hash,identity,case when hash is not null then 'MANUAL_CONFIRMATION' end,case when hash is not null then at_time end,case when hash is not null then public.program_confirmation_evidence_hash(c.id) end,case when hash is not null then a.matcher_version end,pipeline) returning id into rid;
 update public.concert_program_candidates set review_status=p_status,review_note=btrim(p_note),reviewed_at=at_time,updated_at=at_time where id=c.id;
 return c.id;
end; $$;
create or replace function public.review_concert_program_candidate(p_candidate_id uuid,p_status text,p_note text,p_analysis_id uuid,p_matcher_version text,p_catalog_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$ begin raise exception 'Identity migration: use review_concert_program_candidate_identity'; end; $$;

create function public.backfill_concert_program_review_identity(p_candidate_id uuid,p_review_id uuid,p_catalog_json text,p_expected_hash text,p_source_git_commit text,p_verified_catalog_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.concert_program_candidates%rowtype; a public.concert_program_analyses%rowtype; r public.concert_program_reviews%rowtype; saved jsonb; v_catalog jsonb:=p_catalog_json::jsonb; hash text; pipeline text;
begin
 if p_candidate_id is null or p_review_id is null or p_catalog_json is null or p_expected_hash is null or p_verified_catalog_hash is null or p_source_git_commit is null or p_source_git_commit !~ '^[a-f0-9]{40}$' then raise exception 'Verified Git catalog and exact review required'; end if;
 select a0.* into a from public.concert_program_analyses a0 join public.concert_program_candidates c0 on c0.analysis_id=a0.id where c0.id=p_candidate_id;
 perform 1 from public.concerts where id=a.concert_id and end_date>=(clock_timestamp() at time zone 'Asia/Seoul')::date for share;
 if not found then raise exception 'Concert missing or ended'; end if;
 perform 1 from public.concert_program_images where id=a.image_id for update;
 select * into c from public.concert_program_candidates where id=p_candidate_id for update;
 select * into r from public.concert_program_reviews where candidate_id=c.id order by reviewed_at desc,id desc limit 1 for update;
 if r.id is distinct from p_review_id or r.status<>'CONFIRMED' or c.review_status<>'CONFIRMED' or c.relation<>'EXACT' or c.outcome<>'MATCHED' or r.note is distinct from c.review_note or c.reviewed_at is null or r.reviewed_at>c.reviewed_at then raise exception 'Latest unchanged confirmation required'; end if;
 if not exists(select 1 from public.concert_program_candidate_status s where s.id=c.id and s.analysis_is_current and s.evidence_stale_reason is null) then raise exception 'Evidence changed'; end if;
 if not public.program_candidate_snapshot_valid(c.id) then raise exception 'Historical evidence unproven';end if;
 if coalesce(c.matching_catalog_hash,a.catalog_hash) is distinct from p_verified_catalog_hash then raise exception 'Git catalog does not match stored snapshot'; end if;
 select catalog into saved from public.concert_program_catalogs where catalog_hash=p_verified_catalog_hash;
 hash:=public.program_work_identity_hash(v_catalog,c.work_id);
 if hash is null or hash is distinct from p_expected_hash or hash is distinct from public.program_work_identity_hash(saved,c.work_id) then raise exception 'Work identity changed'; end if;
 if r.work_identity_hash is not null then
  if r.work_identity_hash<>hash then raise exception 'Immutable identity differs'; end if;return r.id;
 end if;
 select pipeline_version into pipeline from public.concert_image_ocr_results where id=a.ocr_result_id;
 update public.concert_program_reviews set work_identity_hash=hash,work_identity_snapshot=public.program_work_identity(v_catalog,c.work_id),identity_source='VERIFIED_LEGACY_BACKFILL',identity_attested_at=clock_timestamp(),identity_source_git_commit=p_source_git_commit,confirmed_evidence_hash=public.program_confirmation_evidence_hash(c.id),confirmed_matcher_version=a.matcher_version,confirmed_pipeline_version=pipeline where id=r.id;
 return r.id;
end; $$;

create function public.save_concert_program_rematch(p_source_candidate_id uuid,p_catalog_json text,p_candidate jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.concert_program_candidates%rowtype; a public.concert_program_analyses%rowtype; cat jsonb:=p_catalog_json::jsonb; ch text; ph text; old public.concert_program_candidates%rowtype; result_id uuid;
begin
 ch:=encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex');ph:=encode(sha256(convert_to(public.program_identity_canonical(p_candidate),'UTF8')),'hex');
 select a0.* into a from public.concert_program_analyses a0 join public.concert_program_candidates c0 on c0.analysis_id=a0.id where c0.id=p_source_candidate_id;
 perform 1 from public.concerts where id=a.concert_id and end_date>=(clock_timestamp() at time zone 'Asia/Seoul')::date for share;
 if not found then raise exception 'Concert missing or ended'; end if;
 perform 1 from public.concert_program_images where id=a.image_id for update;
 select * into c from public.concert_program_candidates where id=p_source_candidate_id for update;
 if c.id is null or a.matcher_version<>'stored-program-3' or not public.program_candidate_snapshot_valid(c.id) or c.rematch_source_candidate_id is not null or c.review_status<>'REVIEW_REQUIRED' or exists(select 1 from public.concert_program_reviews where candidate_id=c.id)
  or not a.is_current or public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision) is not null
  or exists(select 1 from public.concert_program_version_policy p where p.matcher_version=a.matcher_version and not p.enabled)
  or exists(select 1 from public.concert_program_candidates x join public.concert_program_analyses xa on xa.id=x.analysis_id where xa.ocr_result_id=a.ocr_result_id and x.evidence=c.evidence and exists(select 1 from public.concert_program_reviews rr where rr.candidate_id=x.id))
  then raise exception 'Reviewed, stale or superseded source cannot be rematched'; end if;
 if p_candidate->>'generation_version' is distinct from a.matcher_version or p_candidate->>'review_status' is distinct from 'REVIEW_REQUIRED'
  or p_candidate->'identity' is distinct from c.identity or p_candidate->'evidence' is distinct from c.evidence
  or (p_candidate->>'section_index')::int is distinct from c.section_index or p_candidate->>'candidate_key' !~ '^[a-f0-9]{64}$'
  or p_candidate->>'relation' is null or p_candidate->>'outcome' is null then raise exception 'Invalid rematch evidence or generation'; end if;
 if p_candidate->>'track_id' is not null and not exists(select 1 from jsonb_array_elements(cat->'targets') t where t->>'trackId'=p_candidate->>'track_id' and t->>'workId'=p_candidate->>'work_id') then raise exception 'Track is not in rematch catalog'; end if;
 select * into old from public.concert_program_candidates where rematch_source_candidate_id=c.id and matching_catalog_hash=ch;
 if found then if old.rematch_payload_hash<>ph then raise exception 'Rematch changed: increment matcher version'; end if;return old.id;end if;
 insert into public.concert_program_catalogs(catalog_hash,catalog) values(ch,cat) on conflict do nothing;
 insert into public.concert_program_candidates(analysis_id,candidate_key,track_id,work_id,identity,relation,outcome,section_index,evidence,generation_reasons,review_reasons,matching_catalog_hash,rematch_source_candidate_id,rematch_payload_hash,rematch_snapshot,created_at)
 values(c.analysis_id,p_candidate->>'candidate_key',p_candidate->>'track_id',p_candidate->>'work_id',c.identity,p_candidate->>'relation',p_candidate->>'outcome',c.section_index,c.evidence,p_candidate->'generation_reasons',p_candidate->'review_reasons',ch,c.id,ph,p_candidate,clock_timestamp()) returning id into result_id;
 return result_id;
end; $$;

-- Explicit grants, including deployments after the 2026-10-30 default-privilege
-- transition. No new tables/sequences, no anonymous OCR/review access.
alter table public.concert_program_reviews enable row level security;
revoke all on public.concert_program_reviews from public,anon,authenticated,service_role;
grant select,insert on public.concert_program_reviews to service_role;
revoke all on public.concert_program_candidate_status from public,anon,authenticated;
grant select on public.concert_program_candidate_status to service_role;
revoke all on function public.program_identity_canonical(jsonb),public.program_identity_normalize(jsonb),public.program_work_identity(jsonb,text),public.program_work_identity_hash(jsonb,text),public.program_confirmation_evidence_hash(uuid),public.program_candidate_snapshot_valid(uuid),public.protect_program_review_identity(),public.review_concert_program_candidate_identity(uuid,text,text,uuid,text,text),public.backfill_concert_program_review_identity(uuid,uuid,text,text,text,text),public.save_concert_program_rematch(uuid,text,jsonb),public.review_concert_program_candidate(uuid,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.program_identity_canonical(jsonb),public.program_identity_normalize(jsonb),public.program_work_identity(jsonb,text),public.program_work_identity_hash(jsonb,text),public.program_confirmation_evidence_hash(uuid),public.program_candidate_snapshot_valid(uuid),public.review_concert_program_candidate_identity(uuid,text,text,uuid,text,text),public.backfill_concert_program_review_identity(uuid,uuid,text,text,text,text),public.save_concert_program_rematch(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
