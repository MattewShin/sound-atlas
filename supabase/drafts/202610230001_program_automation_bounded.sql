-- DRAFT / ISOLATED TESTS ONLY. No production approval; no automatic run seed.
-- Future cutover must replace the per-candidate client before applying this file.
begin;
create table public.program_automation_bounded_runs (
 id uuid primary key default gen_random_uuid(), task_ref text not null,
 rule text not null default 'program-auto-1' check(rule='program-auto-1'),
 image_limit integer not null default 20 check(image_limit between 1 and 20),
 candidate_limit integer not null default 100 check(candidate_limit between 1 and 100),
 image_ids uuid[] not null default '{}', candidate_rows_used integer not null default 0,
 closed boolean not null default false, allow_history_only boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 check(cardinality(image_ids)<=image_limit),check(candidate_rows_used between 0 and candidate_limit)
);
create table public.program_automation_bounded_batches (
 run_id uuid not null references public.program_automation_bounded_runs(id),request_id uuid not null,
 request_hash text not null,plan_hash text not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(run_id,request_id)
);
alter table public.program_automation_bounded_runs enable row level security;
alter table public.program_automation_bounded_batches enable row level security;
revoke all on public.program_automation_bounded_runs,public.program_automation_bounded_batches from public,anon,authenticated,service_role;
grant select on public.program_automation_bounded_runs,public.program_automation_bounded_batches to service_role;
create policy bounded_run_read on public.program_automation_bounded_runs for select to service_role using(true);
create policy bounded_batch_read on public.program_automation_bounded_batches for select to service_role using(true);

-- A GET/read-only planning statement. Returns candidate IDs/counts, never raw OCR.
create function public.plan_automatic_program_batch_bounded(p_run_id uuid,p_items jsonb,p_catalog_json text,p_rule text default 'program-auto-1',p_mode text default 'COMPLETE',p_history_ids uuid[] default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare run public.program_automation_bounded_runs%rowtype;
 item jsonb;a jsonb;d jsonb;existing public.concert_program_analyses%rowtype;
 image public.concert_program_images%rowtype;k public.concerts%rowtype;
 ch text:=encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex');
 image_ids uuid[]:='{}';history_ids uuid[];direct_keys jsonb;items jsonb:='[]';
 source jsonb;direct_count integer:=0;history_count integer:=0;count_direct integer;count_history integer;
 operations boolean:=false;new_images integer;plan jsonb;scope text;candidate_count integer;full_history_count integer:=0;pending_direct_count integer:=0;
begin
 if p_rule is distinct from 'program-auto-1' or jsonb_typeof(p_items) is distinct from 'array'
 or jsonb_array_length(p_items) not between 1 and 3 then raise exception 'BOUNDED_INVALID_BATCH';end if;
 select * into run from public.program_automation_bounded_runs where id=p_run_id;
 if not found or run.closed or run.rule<>p_rule then raise exception 'BOUNDED_RUN_NOT_APPROVED';end if;
 if p_mode is null or p_mode not in ('COMPLETE','HISTORY_ONLY') or (p_mode='COMPLETE' and p_history_ids is not null) then raise exception 'BOUNDED_INVALID_MODE';end if;
 if p_mode='HISTORY_ONLY' and (not run.allow_history_only or cardinality(p_history_ids) is null or cardinality(p_history_ids) not between 1 and 30
  or (select count(distinct id) from unnest(p_history_ids) id)<>cardinality(p_history_ids)) then raise exception 'BOUNDED_HISTORY_NOT_APPROVED';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  a:=item->'analysis';
  if jsonb_typeof(a) is distinct from 'object' or a->>'matcher_version' is distinct from 'stored-program-3'
  or a->>'catalog_hash' is distinct from ch or jsonb_typeof(a->'candidates') is distinct from 'array'
  or jsonb_typeof(item->'decisions') is distinct from 'array' then raise exception 'BOUNDED_INVALID_ANALYSIS';end if;
  candidate_count:=jsonb_array_length(a->'candidates');
  if candidate_count>1000 or jsonb_array_length(item->'decisions')<>candidate_count
  or (select count(distinct c->>'candidate_key') from jsonb_array_elements(a->'candidates') c)<>candidate_count
  or (select count(distinct c->>'candidate_key') from jsonb_array_elements(item->'decisions') c)<>candidate_count
  then raise exception 'BOUNDED_DECISION_SET';end if;
  for d in select value from jsonb_array_elements(item->'decisions') loop
   if d->>'status' is null or d->>'status' not in ('CONFIRMED','REJECTED')
   or jsonb_typeof(d->'reasons') is distinct from 'array' or jsonb_array_length(d->'reasons')=0
   or not exists(select 1 from jsonb_array_elements(a->'candidates') c where c->>'candidate_key'=d->>'candidate_key' and c=d->'verified')
   then raise exception 'BOUNDED_DECISION_SET';end if;
  end loop;
  select * into image from public.concert_program_images where id=(a->>'image_id')::uuid;
  select * into k from public.concerts where id=image.concert_id;
  if image.id is null or image.id=any(image_ids) or image.concert_id is distinct from (a->>'concert_id')::uuid
  or not image.is_active or image.image_type<>'DETAIL'
  or k.end_date<(clock_timestamp() at time zone 'Asia/Seoul')::date or k.performance_status not in ('공연예정','공연중')
  or public.concert_program_evidence_issue((a->>'ocr_result_id')::uuid,(a->>'image_revision')::bigint,a->'concert_context',(a->>'source_attempt_id')::uuid,(a->>'concert_revision')::bigint) is not null
  then raise exception 'BOUNDED_STALE_SOURCE';end if;
  image_ids:=array_append(image_ids,image.id);
  select * into existing from public.concert_program_analyses x where x.ocr_result_id=(a->>'ocr_result_id')::uuid
   and x.matcher_version=a->>'matcher_version' and x.catalog_hash=ch and x.image_revision=(a->>'image_revision')::bigint
   and x.concert_context=a->'concert_context' and x.concert_revision=(a->>'concert_revision')::bigint and x.source_attempt_id=(a->>'source_attempt_id')::uuid;
  if existing.id is not null and (not existing.is_current or existing.payload_hash is distinct from a->>'payload_hash')
   then raise exception 'BOUNDED_IMMUTABLE_SNAPSHOT';end if;
  if p_mode='HISTORY_ONLY' and existing.id is null then raise exception 'BOUNDED_CURRENT_ANALYSIS_REQUIRED';end if;
  scope:=case when existing.id is not null then public.program_auto_input_hash(existing.id,ch,p_rule) end;
  if existing.id is null then
   select coalesce(jsonb_agg(c->>'candidate_key' order by c->>'candidate_key'),'[]') into direct_keys from jsonb_array_elements(a->'candidates') c;
  else
   if (select count(*) from public.concert_program_candidates where analysis_id=existing.id)<>candidate_count then raise exception 'BOUNDED_SNAPSHOT_CANDIDATES';end if;
   select coalesce(jsonb_agg(c.candidate_key order by c.candidate_key),'[]') into direct_keys from public.concert_program_candidates c
    where c.analysis_id=existing.id and c.auto_input_hash is distinct from scope;
  end if;
  select coalesce(array_agg(c.id order by c.id),'{}') into history_ids from public.concert_program_candidates c
   join public.concert_program_analyses old on old.id=c.analysis_id
   where old.image_id=image.id and old.matcher_version=a->>'matcher_version'
    and old.id is distinct from existing.id and c.review_status='REVIEW_REQUIRED';
  pending_direct_count:=pending_direct_count+jsonb_array_length(direct_keys);
  full_history_count:=full_history_count+cardinality(history_ids);
  if p_mode='HISTORY_ONLY' then
   direct_keys:='[]';select coalesce(array_agg(id order by id),'{}') into history_ids from unnest(history_ids) id where id=any(p_history_ids);
  end if;
  count_direct:=jsonb_array_length(direct_keys);count_history:=cardinality(history_ids);
  direct_count:=direct_count+count_direct;history_count:=history_count+count_history;
  if p_mode='HISTORY_ONLY' then operations:=operations or count_history>0;
  else operations:=operations or existing.id is null or existing.auto_input_hash is distinct from scope or count_history>0;end if;
  -- Hash every source membership/attempt/result in the concert, plus all
  -- candidate rows in this image, so even same-count replacements change plan.
  select jsonb_build_object('concert',to_jsonb(k),'images',(
   select jsonb_agg(jsonb_build_object('image',to_jsonb(i),
    'attempts',(select jsonb_agg(to_jsonb(t) order by t.id) from public.concert_image_ocr_attempts t where t.image_id=i.id),
    'results',(select jsonb_agg(to_jsonb(o) order by o.id) from public.concert_image_ocr_results o where o.image_id=i.id)) order by i.id)
   from public.concert_program_images i where i.concert_id=k.id),
   'analyses',(select jsonb_agg(to_jsonb(x) order by x.id) from public.concert_program_analyses x where x.image_id=image.id and x.matcher_version=a->>'matcher_version'),
   'candidates',(select jsonb_agg(to_jsonb(c) order by c.id) from public.concert_program_candidates c join public.concert_program_analyses x on x.id=c.analysis_id where x.image_id=image.id and x.matcher_version=a->>'matcher_version')) into source;
  items:=items||jsonb_build_array(jsonb_build_object('image_id',image.id,'existing_analysis_id',existing.id,
   'direct_keys',direct_keys,'history_ids',to_jsonb(history_ids),'direct_count',count_direct,'history_count',count_history,
   'source_hash',encode(sha256(convert_to(public.program_identity_canonical(source),'UTF8')),'hex')));
 end loop;
 if p_mode='HISTORY_ONLY' and exists(select 1 from unnest(p_history_ids) requested(id) where not exists(
  select 1 from public.concert_program_candidates c join public.concert_program_analyses old on old.id=c.analysis_id
  where c.id=requested.id and old.image_id=any(image_ids) and old.matcher_version='stored-program-3' and not old.is_current
   and (c.review_status='REVIEW_REQUIRED' or (c.review_status='REJECTED' and c.auto_reasons @> '["SUPERSEDED_BY_CURRENT_ANALYSIS"]'))))
 then raise exception 'BOUNDED_INVALID_HISTORY_SET';end if;
 select count(*) into new_images from unnest(image_ids) id where not id=any(run.image_ids);
 plan:=jsonb_build_object('run_id',run.id,'mode',p_mode,'items',items,'image_ids',to_jsonb(image_ids),'image_count',cardinality(image_ids),
  'new_run_images',new_images,'direct_count',direct_count,'history_count',history_count,'candidate_rows',direct_count+history_count,
  'full_history_count',full_history_count,'pending_direct_count',pending_direct_count,
  'operation_required',operations,'batch_fits',direct_count+history_count<=30,
  'run_fits',cardinality(run.image_ids)+new_images<=run.image_limit and run.candidate_rows_used+direct_count+history_count<=run.candidate_limit);
 return plan||jsonb_build_object('plan_hash',encode(sha256(convert_to(public.program_identity_canonical(jsonb_build_object(
  'plan',plan,'input',p_items,'catalog',ch,'rule',p_rule,'history_ids',to_jsonb(p_history_ids),'run',to_jsonb(run))),'UTF8')),'hex'));
end; $$;

-- Atomic save + direct decisions + explicit, pre-counted historical closeout.
-- SECURITY DEFINER permits revoking legacy automatic write RPCs from clients.
-- Owner must remain the reviewed migration owner, never an API role.
create function public.complete_automatic_program_batch_bounded(p_run_id uuid,p_request_id uuid,p_items jsonb,p_expected_plan_hash text,p_catalog_json text,p_rule text default 'program-auto-1',p_mode text default 'COMPLETE',p_history_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare plan jsonb;item jsonb;a jsonb;pi jsonb;d jsonb;result jsonb;results jsonb:='[]';
 run public.program_automation_bounded_runs%rowtype;prior public.program_automation_bounded_batches%rowtype;
 c public.concert_program_candidates%rowtype;aid uuid;scope text;ids uuid[];history_ids uuid[];
 ch text:=encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex');
 request_hash text;direct_done integer:=0;history_done integer:=0;n integer;all_images uuid[];
begin
 if p_request_id is null or p_expected_plan_hash is null or p_expected_plan_hash!~'^[a-f0-9]{64}$' then raise exception 'BOUNDED_INVALID_REQUEST';end if;
 -- READ COMMITTED is required: a VOLATILE caller obtains a fresh snapshot for
 -- the planning SELECT below AFTER acquiring all locks. No stale outer snapshot.
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'BOUNDED_READ_COMMITTED_REQUIRED';end if;
 -- Coarse first version: serialize ALL writers of the impact/source tables.
 -- NOWAIT fails without DML when a writer/row-lock holder is already active.
 -- This covers legacy/direct INSERTs too; no cooperative-writer assumption.
 lock table public.concerts,public.concert_program_images,public.concert_image_ocr_attempts,public.concert_image_ocr_results,
  public.concert_program_analyses,public.concert_program_candidates,public.concert_program_reviews,
  public.concert_program_catalogs,public.concert_program_version_policy,
  public.program_automation_bounded_runs,public.program_automation_bounded_batches in exclusive mode nowait;
 select * into run from public.program_automation_bounded_runs where id=p_run_id for update nowait;
 request_hash:=encode(sha256(convert_to(public.program_identity_canonical(jsonb_build_object('items',p_items,'catalog',ch,'rule',p_rule,'mode',p_mode,'history_ids',to_jsonb(p_history_ids))),'UTF8')),'hex');
 select * into prior from public.program_automation_bounded_batches where run_id=p_run_id and request_id=p_request_id;
 if found then
  if prior.request_hash<>request_hash then raise exception 'BOUNDED_REQUEST_REUSED';end if;
  return prior.result||jsonb_build_object('replayed',true,'writes',0);
 end if;
 -- Separate SQL statement in VOLATILE function: snapshot starts under locks.
 plan:=public.plan_automatic_program_batch_bounded(p_run_id,p_items,p_catalog_json,p_rule,p_mode,p_history_ids);
 if not (plan->>'operation_required')::boolean then return jsonb_build_object('outcome','UNCHANGED','writes',0,'candidate_rows',0);end if;
 if plan->>'plan_hash'<>p_expected_plan_hash then raise exception 'BOUNDED_PLAN_CHANGED';end if;
 if not (plan->>'batch_fits')::boolean or not (plan->>'run_fits')::boolean then raise exception 'BOUNDED_LIMIT_EXCEEDED';end if;
 -- All validation/counting above precedes the first INSERT/UPDATE below.
 for item in select value from jsonb_array_elements(p_items) loop
  a:=item->'analysis';select value into pi from jsonb_array_elements(plan->'items') where value->>'image_id'=a->>'image_id';
  if p_mode='HISTORY_ONLY' then aid:=(pi->>'existing_analysis_id')::uuid;
  else aid:=public.save_concert_program_analysis_v3(a,p_catalog_json);end if;
  if not exists(select 1 from public.concert_program_analyses where id=aid and is_current) then raise exception 'BOUNDED_STALE_ANALYSIS';end if;
  scope:=public.program_auto_input_hash(aid,ch,p_rule);
  if p_mode='COMPLETE' then
  for c in select * from public.concert_program_candidates where analysis_id=aid order by candidate_key loop
   if c.auto_input_hash=scope then continue;end if;
   select value into d from jsonb_array_elements(item->'decisions') where value->>'candidate_key'=c.candidate_key;
   result:=public.decide_automatic_program_candidate(c.id,aid,scope,p_rule,d->>'status',d->'reasons',d->'verified',p_catalog_json);
   if result->>'outcome' not in ('AUTO_CONFIRMED','AUTO_UNLINKED','DUPLICATE_EFFECTIVE_CONFIRMATION') then raise exception 'BOUNDED_DECISION_INCOMPLETE';end if;
   direct_done:=direct_done+1;
   results:=results||jsonb_build_array(jsonb_build_object('candidate_id',c.id,'analysis_id',aid,'track_id',c.track_id,'result',result));
  end loop;
  if exists(select 1 from public.concert_program_candidates where analysis_id=aid and auto_input_hash is distinct from scope)
   or scope is distinct from public.program_auto_input_hash(aid,ch,p_rule) then raise exception 'BOUNDED_PARTIAL_ANALYSIS';end if;
  end if;
  select coalesce(array_agg(value::uuid),'{}') into history_ids from jsonb_array_elements_text(pi->'history_ids');
  -- No unbounded UPDATE and no legacy finish_automatic_program call.
  update public.concert_program_candidates set review_status='REJECTED',auto_input_hash=scope,
   auto_outcome='AUTO_UNLINKED',auto_reasons='["SUPERSEDED_BY_CURRENT_ANALYSIS"]'
   where id=any(history_ids) and review_status='REVIEW_REQUIRED';
  get diagnostics n=row_count;history_done:=history_done+n;
  if n<>(pi->>'history_count')::integer then raise exception 'BOUNDED_HISTORY_CHANGED';end if;
  if p_mode='COMPLETE' then update public.concert_program_analyses set auto_input_hash=scope,auto_retry_at=null,auto_retry_hash=null where id=aid;end if;
 end loop;
 if direct_done<>(plan->>'direct_count')::integer or history_done<>(plan->>'history_count')::integer or direct_done+history_done>30
 then raise exception 'BOUNDED_IMPACT_MISMATCH';end if;
 select array_agg(distinct id order by id) into all_images from (select unnest(run.image_ids) id union select value::uuid from jsonb_array_elements_text(plan->'image_ids')) x;
 update public.program_automation_bounded_runs set image_ids=all_images,candidate_rows_used=candidate_rows_used+direct_done+history_done where id=p_run_id;
 result:=jsonb_build_object('outcome',case when p_mode='HISTORY_ONLY' then 'HISTORY_RETIRED' else 'COMPLETED' end,'image_count',jsonb_array_length(p_items),'direct_decisions',direct_done,
  'historical_closed',history_done,'candidate_rows',direct_done+history_done,'decisions',results,'replayed',false);
 insert into public.program_automation_bounded_batches(run_id,request_id,request_hash,plan_hash,result) values(p_run_id,p_request_id,request_hash,p_expected_plan_hash,result);
 return result;
 -- No EXCEPTION handler: any error rolls back analyses, receipts, checkpoints,
 -- closeout and run debit together. Never return a success after partial DML.
end; $$;
revoke all on function public.plan_automatic_program_batch_bounded(uuid,jsonb,text,text,text,uuid[]),public.complete_automatic_program_batch_bounded(uuid,uuid,jsonb,text,text,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.plan_automatic_program_batch_bounded(uuid,jsonb,text,text,text,uuid[]),public.complete_automatic_program_batch_bounded(uuid,uuid,jsonb,text,text,text,text,uuid[]) to service_role;
-- Coordinated future cutover required. Keep the original migration immutable.
revoke execute on function public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text),public.finish_automatic_program(uuid,text,text,text),public.defer_automatic_program(uuid,text,text,text) from service_role;
notify pgrst,'reload schema';
commit;
