-- Requires PROGRAM_ANALYSIS_V3_DRAFT.sql and 202610210001_program_work_identity.sql.
begin;
-- A reactivated/replaced source must be hash-checked again before old OCR is reused.
alter table public.concert_program_images add column evidence_changed_at timestamptz;
update public.concert_program_images set evidence_changed_at=clock_timestamp() where evidence_revision>0;
create or replace function public.bump_program_image_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.is_active is distinct from old.is_active or new.source_url is distinct from old.source_url or new.image_type is distinct from old.image_type then
  new.evidence_revision:=old.evidence_revision+1;new.evidence_changed_at:=clock_timestamp();
 else new.evidence_revision:=old.evidence_revision;new.evidence_changed_at:=old.evidence_changed_at;end if;
 return new;
end; $$;
alter table public.concert_program_analyses add column auto_input_hash text;
alter table public.concert_program_analyses add column auto_retry_at timestamptz;
alter table public.concert_program_analyses add column auto_retry_hash text;
alter table public.concert_program_candidates add column auto_input_hash text;
alter table public.concert_program_candidates add column auto_outcome text;
alter table public.concert_program_candidates add column auto_reasons jsonb;
alter table public.concert_program_reviews drop constraint concert_program_reviews_reviewer_kind_check;
alter table public.concert_program_reviews add constraint concert_program_reviews_reviewer_kind_check
 check (reviewer_kind in ('LOCAL_SERVICE_ROLE_OPERATOR','AUTOMATIC_PROGRAM_RULE'));
alter table public.concert_program_reviews drop constraint concert_program_reviews_identity_source_check;
alter table public.concert_program_reviews add constraint concert_program_reviews_identity_source_check
 check (identity_source in ('MANUAL_CONFIRMATION','VERIFIED_LEGACY_BACKFILL','AUTOMATIC_PROGRAM_RULE'));
alter table public.concert_program_reviews drop constraint program_review_identity_complete;
alter table public.concert_program_reviews add constraint program_review_identity_complete check (
 (work_identity_hash is null and work_identity_snapshot is null and identity_source is null and identity_attested_at is null and confirmed_evidence_hash is null and confirmed_matcher_version is null and confirmed_pipeline_version is null and identity_source_git_commit is null)
 or (status='CONFIRMED' and work_identity_hash is not null and work_identity_snapshot->>'schema'='work-identity-1'
 and identity_source is not null and identity_attested_at is not null and confirmed_evidence_hash ~ '^[a-f0-9]{64}$'
 and confirmed_matcher_version is not null and confirmed_pipeline_version is not null
 and (identity_source in ('MANUAL_CONFIRMATION','AUTOMATIC_PROGRAM_RULE') or identity_source_git_commit ~ '^[a-f0-9]{40}$')) is true);
comment on table public.concert_program_reviews is 'Append-only confirmation/rejection receipts, including automatic deterministic decisions. No operator queue is required.';

-- Content, source membership, context, catalog and rule changes reopen completed work.
-- No timestamps or review status in the fingerprint: completing a decision cannot reopen itself.
create function public.program_auto_input_hash(p_analysis_id uuid,p_catalog_hash text,p_rule text)
returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(public.program_identity_canonical(jsonb_build_object(
 'analysis',a.payload_hash,'catalog',p_catalog_hash,'rule',p_rule,
 'candidates',(select jsonb_agg(jsonb_build_array(c.id,c.candidate_key,c.track_id,c.work_id,c.relation,c.outcome,c.section_index,c.identity,c.evidence,c.rematch_snapshot) order by c.id)
  from public.concert_program_candidates c where c.analysis_id=a.id),
 'concert',jsonb_build_array(k.program_context_revision,k.title,k.venue,k.start_date,k.end_date),
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'revision',i.evidence_revision,'active',i.is_active,'url',i.source_url,'type',i.image_type,
 'attempts',(select jsonb_agg(jsonb_build_array(t.id,t.status,t.result_id,t.content_sha256,t.pipeline_version) order by t.created_at,t.id) from public.concert_image_ocr_attempts t where t.image_id=i.id),
 'ocr',(select jsonb_agg(jsonb_build_array(o.id,o.content_sha256,o.pipeline_version,encode(sha256(convert_to(o.raw_text,'UTF8')),'hex')) order by o.id) from public.concert_image_ocr_results o where o.image_id=i.id)) order by i.id)
 from public.concert_program_images i where i.concert_id=k.id),'[]'::jsonb)
 )),'UTF8')),'hex') from public.concert_program_analyses a join public.concerts k on k.id=a.concert_id where a.id=p_analysis_id;
$$;

create function public.queue_automatic_programs(p_limit integer,p_catalog_hash text,p_rule text,p_image_ids uuid[] default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (
 select a.id,a.concert_id,a.image_id,a.ocr_result_id,
 public.program_auto_input_hash(a.id,p_catalog_hash,p_rule) as input_hash
 from public.concert_program_analyses a join public.concerts k on k.id=a.concert_id
 where a.is_current and a.matcher_version='stored-program-3'
 and (p_image_ids is null or a.image_id=any(p_image_ids))
 and k.end_date >= (clock_timestamp() at time zone 'Asia/Seoul')::date
 and k.performance_status in ('공연예정','공연중')
 and not exists(select 1 from public.concert_program_version_policy p where p.matcher_version=a.matcher_version and not p.enabled)
 and a.auto_input_hash is distinct from public.program_auto_input_hash(a.id,p_catalog_hash,p_rule)
 and (a.auto_retry_at is null or a.auto_retry_at<=clock_timestamp() or a.auto_retry_hash is distinct from public.program_auto_input_hash(a.id,p_catalog_hash,p_rule))
 order by a.auto_retry_at nulls first,k.start_date,a.created_at,a.id limit greatest(1,least(p_limit,100))
 ) q;
$$;

create function public.decide_automatic_program_candidate(p_candidate_id uuid,p_analysis_id uuid,p_input_hash text,p_rule text,p_status text,p_reasons jsonb,p_verified jsonb,p_catalog_json text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.concert_program_analyses%rowtype; c public.concert_program_candidates%rowtype;
 cat jsonb:=p_catalog_json::jsonb; ch text:=encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex');
 wh text; saved jsonb; pipeline text; result text; note text; at_time timestamptz; field text;
begin
 if p_rule is distinct from 'program-auto-1' or p_status is null or p_status not in ('CONFIRMED','REJECTED')
 or jsonb_typeof(p_reasons) is distinct from 'array' or jsonb_array_length(p_reasons)=0 then raise exception 'Invalid automatic policy';end if;
 select * into a from public.concert_program_analyses where id=p_analysis_id;
 -- Exclusive concert lock serializes equivalent links across different images/workers.
 perform 1 from public.concerts where id=a.concert_id for update;
 perform 1 from public.concert_program_images where concert_id=a.concert_id order by id for update;
 select * into c from public.concert_program_candidates where id=p_candidate_id for update;
 if c.id is null or c.analysis_id is distinct from a.id or a.matcher_version<>'stored-program-3'
 or not a.is_current or p_input_hash is distinct from public.program_auto_input_hash(a.id,ch,p_rule)
 or public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision) is not null
 or exists(select 1 from public.concert_program_version_policy p where p.matcher_version=a.matcher_version and not p.enabled)
 then return jsonb_build_object('outcome','RETRY_PENDING','reasons',jsonb_build_array('EVIDENCE_CHANGED_DURING_DECISION'));end if;
 foreach field in array array['candidate_key','track_id','work_id','relation','outcome','identity','evidence','section_index'] loop
  if coalesce(p_verified->field,'null') is distinct from coalesce(to_jsonb(c)->field,'null') then raise exception 'Automatic identity mismatch';end if;
 end loop;
 if c.auto_input_hash=p_input_hash then return jsonb_build_object('outcome','UNCHANGED','reasons','[]'::jsonb);end if;
 select catalog into saved from public.concert_program_catalogs where catalog_hash=coalesce(c.matching_catalog_hash,a.catalog_hash);
 wh:=public.program_work_identity_hash(cat,c.work_id);
 if p_status='CONFIRMED' then
  if c.relation<>'EXACT' or c.outcome<>'MATCHED' or wh is null
   or not public.program_candidate_snapshot_valid(c.id)
   or wh is distinct from public.program_work_identity_hash(saved,c.work_id)
   or p_reasons is distinct from '["SOURCE_AND_UNIQUE_IDENTITY_VERIFIED"]'::jsonb
   or a.sections->c.section_index->>'reason' is distinct from 'EXPLICIT_PROGRAM_HEADING'
   or not exists(select 1 from jsonb_array_elements(cat->'targets') t where t->>'trackId'=c.track_id and t->>'workId'=c.work_id)
   then raise exception 'Automatic identity or program proof invalid';end if;
  if exists(select 1 from public.concert_program_candidate_status s where s.concert_id=a.concert_id and s.track_id=c.track_id and s.work_id=c.work_id
    and s.matcher_version=a.matcher_version and s.is_effectively_confirmed and s.confirmed_work_identity_hash=wh) then
   result:='DUPLICATE_EFFECTIVE_CONFIRMATION';
   -- Keep a valid receipt, or complete a redundant candidate as unlinked.
   if not exists(select 1 from public.concert_program_candidate_status s where s.id=c.id and s.is_effectively_confirmed and s.confirmed_work_identity_hash=wh) then p_status:='REJECTED';else p_status:=null;end if;
  else result:='AUTO_CONFIRMED';end if;
 else result:='AUTO_UNLINKED';end if;
 note:=p_rule||':'||result||':'||left(p_reasons::text,1800);
 if p_status is not null then
  at_time:=clock_timestamp();
  select pipeline_version into pipeline from public.concert_image_ocr_results where id=a.ocr_result_id;
  insert into public.concert_program_reviews(candidate_id,status,note,reviewer_kind,reviewed_at,work_identity_hash,work_identity_snapshot,identity_source,identity_attested_at,confirmed_evidence_hash,confirmed_matcher_version,confirmed_pipeline_version)
  values(c.id,p_status,note,'AUTOMATIC_PROGRAM_RULE',at_time,case when p_status='CONFIRMED' then wh end,
   case when p_status='CONFIRMED' then public.program_work_identity(cat,c.work_id) end,
   case when p_status='CONFIRMED' then 'AUTOMATIC_PROGRAM_RULE' end,case when p_status='CONFIRMED' then at_time end,
   case when p_status='CONFIRMED' then public.program_confirmation_evidence_hash(c.id) end,
   case when p_status='CONFIRMED' then a.matcher_version end,case when p_status='CONFIRMED' then pipeline end);
  update public.concert_program_candidates set review_status=p_status,review_note=note,reviewed_at=at_time,updated_at=at_time where id=c.id;
 end if;
 update public.concert_program_candidates set auto_input_hash=p_input_hash,auto_outcome=result,auto_reasons=p_reasons where id=c.id;
 return jsonb_build_object('outcome',result,'reasons',p_reasons);
end; $$;

create function public.finish_automatic_program(p_analysis_id uuid,p_input_hash text,p_catalog_hash text,p_rule text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.concert_program_analyses%rowtype;
begin
 select * into a from public.concert_program_analyses where id=p_analysis_id;
 perform 1 from public.concerts where id=a.concert_id for update;
 perform 1 from public.concert_program_images where concert_id=a.concert_id order by id for update;
 if p_rule is distinct from 'program-auto-1' or not a.is_current
 or p_input_hash is distinct from public.program_auto_input_hash(a.id,p_catalog_hash,p_rule)
 or exists(select 1 from public.concert_program_candidates c where c.analysis_id=a.id and c.auto_input_hash is distinct from p_input_hash)
 then return false;end if;
 update public.concert_program_analyses set auto_input_hash=p_input_hash,auto_retry_at=null,auto_retry_hash=null where id=a.id;
 -- Close obsolete unreviewed rows without rewriting historical manual receipts.
 update public.concert_program_candidates c set review_status='REJECTED',auto_input_hash=p_input_hash,
  auto_outcome='AUTO_UNLINKED',auto_reasons='["SUPERSEDED_BY_CURRENT_ANALYSIS"]'::jsonb
 from public.concert_program_analyses old
 where c.analysis_id=old.id and old.image_id=a.image_id and old.matcher_version=a.matcher_version and not old.is_current
 and c.review_status='REVIEW_REQUIRED';
 return true;
end; $$;

create function public.defer_automatic_program(p_analysis_id uuid,p_input_hash text,p_catalog_hash text,p_rule text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.concert_program_analyses%rowtype; issue text; permanent boolean;
begin
 select * into a from public.concert_program_analyses where id=p_analysis_id;
 perform 1 from public.concerts where id=a.concert_id for update;
 perform 1 from public.concert_program_images where concert_id=a.concert_id order by id for update;
 if p_rule is distinct from 'program-auto-1' or p_input_hash is distinct from public.program_auto_input_hash(a.id,p_catalog_hash,p_rule)
 then return jsonb_build_object('outcome','RETRY_PENDING','reasons',jsonb_build_array('EVIDENCE_CHANGED_DURING_DECISION'));end if;
 issue:=public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision);
 select t.error_code in ('OCR_IMAGE_LIMIT_EXCEEDED','OCR_IMAGE_TOO_LARGE','OCR_IMAGE_INVALID') into permanent
 from public.concert_image_ocr_attempts t where t.image_id=a.image_id order by t.created_at desc,t.finished_at desc,t.id desc limit 1;
 if issue in ('IMAGE_INACTIVE_OR_NOT_DETAIL') or permanent then
  update public.concert_program_candidates set auto_input_hash=p_input_hash,auto_outcome='AUTO_UNLINKED',auto_reasons=jsonb_build_array(issue),
   review_status=case when review_status='REVIEW_REQUIRED' then 'REJECTED' else review_status end where analysis_id=a.id;
  update public.concert_program_analyses set auto_input_hash=p_input_hash where id=a.id;
  return jsonb_build_object('outcome','AUTO_UNLINKED','reasons',jsonb_build_array(issue));
 end if;
 update public.concert_program_analyses set auto_retry_at=clock_timestamp()+interval '24 hours',auto_retry_hash=p_input_hash where id=a.id;
 return jsonb_build_object('outcome','RETRY_PENDING','reasons',jsonb_build_array(coalesce(issue,'CURRENT_OCR_UNAVAILABLE')));
end; $$;

revoke all on function public.program_auto_input_hash(uuid,text,text),public.queue_automatic_programs(integer,text,text,uuid[]),public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text),public.finish_automatic_program(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.program_auto_input_hash(uuid,text,text),public.queue_automatic_programs(integer,text,text,uuid[]),public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text),public.finish_automatic_program(uuid,text,text,text) to service_role;
revoke all on function public.defer_automatic_program(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.defer_automatic_program(uuid,text,text,text) to service_role;
create or replace function public.concert_program_evidence_issue(p_ocr_id uuid, p_revision bigint, p_context jsonb, p_attempt_id uuid, p_concert_revision bigint)
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
  if not found then return 'LATEST_OCR_NOT_SUCCESSFUL'; end if;
  if a.status <> 'SUCCEEDED' then
    -- Failed analysis/download is not evidence that the last known bytes changed.
    select * into a from public.concert_image_ocr_attempts t where t.image_id=i.id and t.status='SUCCEEDED'
      order by t.created_at desc,t.finished_at desc,t.id desc limit 1;
    if not found or exists(select 1 from public.concert_image_ocr_attempts f where f.image_id=i.id
      and (f.created_at,f.finished_at,f.id)>(a.created_at,a.finished_at,a.id)
      and (f.pipeline_version<>a.pipeline_version or (f.content_sha256 is not null and f.content_sha256<>a.content_sha256)))
      then return 'LATEST_OCR_NOT_SUCCESSFUL';end if;
  end if;
  if a.id is distinct from p_attempt_id then return 'OCR_ATTEMPT_CHANGED'; end if;
  if i.evidence_changed_at is not null and a.created_at<i.evidence_changed_at then return 'SOURCE_RECHECK_REQUIRED';end if;
  if a.result_id is distinct from r.id then return 'OCR_REPLACED'; end if;
  if exists (select 1 from public.concert_image_ocr_attempts x where x.image_id = i.id
    and x.created_at = a.created_at and x.finished_at = a.finished_at and x.result_id is distinct from a.result_id) then return 'OCR_ORDER_AMBIGUOUS'; end if;
  if exists (select 1 from public.concert_image_ocr_results x where x.image_id = i.id and x.created_at > a.created_at)
    then return 'NEWER_OCR_RESULT'; end if;
  return null;
end;
$$;

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
 when exists(select 1 from public.concert_program_candidates nc join public.concert_program_analyses na on na.id=nc.analysis_id
  where na.image_id=a.image_id and na.matcher_version=a.matcher_version and na.is_current
  and nc.evidence=c.evidence and nc.auto_outcome='AUTO_UNLINKED'
  and (na.created_at,na.id)>(a.created_at,a.id)) then 'AUTOMATIC_EVIDENCE_REJECTED'
 else null end as reason) validity;

notify pgrst,'reload schema';
commit;
