-- Additive v4 analysis contract only. Do not apply to production as part of 3C.
-- Prerequisite: reviewed v3 storage draft (snapshot + version-scoped current).
-- No rematch/automation/source-text storage contract is introduced here.
begin;

do $$
begin
  if to_regprocedure('public.save_concert_program_analysis(jsonb,text)') is null
    or to_regprocedure('public.save_concert_program_analysis_v3(jsonb,text)') is null
    or to_regclass('public.concert_program_analysis_current_image_version_idx') is null
    or not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='concert_program_analyses' and column_name='snapshot')
    then raise exception 'V4 requires the reviewed v3 storage contract'; end if;
end;
$$;

-- A pre-existing operator policy is preserved, including its note. The PK and
-- row lock serialize a competing insert/update; never enable or reset it here.
insert into public.concert_program_version_policy(matcher_version,enabled,note)
values('stored-program-4',false,'V4 analysis storage awaits explicit operator activation')
on conflict(matcher_version) do nothing;
do $$
declare v_enabled boolean;
begin
  select enabled into v_enabled from public.concert_program_version_policy
    where matcher_version='stored-program-4' for update;
  if not found or v_enabled is null then raise exception 'V4 policy conflict'; end if;
end;
$$;

create function public.save_concert_program_analysis_v4(p_analysis jsonb,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_id uuid;
  v_enabled boolean;
  v_snapshot jsonb;
begin
  if jsonb_typeof(p_analysis) is distinct from 'object'
    or p_analysis->>'matcher_version' is distinct from 'stored-program-4'
    then raise exception 'V4 version required'; end if;

  -- Hold through the common save + snapshot comparison. A concurrent policy
  -- UPDATE/DELETE cannot disable or remove this row during an accepted save.
  select enabled into v_enabled from public.concert_program_version_policy
    where matcher_version='stored-program-4' for share;
  if not found or v_enabled is distinct from true then raise exception 'V4 version disabled or policy missing'; end if;

  if jsonb_typeof(p_analysis->'logical_works') is distinct from 'array'
    or jsonb_typeof(p_analysis->'grouping') is distinct from 'object'
    or jsonb_typeof(p_analysis->'candidates') is distinct from 'array'
    then raise exception 'V4 logical snapshot required'; end if;
  if jsonb_array_length(p_analysis->'logical_works') <> jsonb_array_length(p_analysis->'candidates')
    or (select count(distinct w->>'logical_work_id') from jsonb_array_elements(p_analysis->'logical_works') w) <> jsonb_array_length(p_analysis->'logical_works')
    or (select count(distinct c->>'logical_work_id') from jsonb_array_elements(p_analysis->'candidates') c) <> jsonb_array_length(p_analysis->'candidates')
    or exists(select 1 from jsonb_array_elements(p_analysis->'logical_works') w
      where jsonb_typeof(w) is distinct from 'object'
        or jsonb_typeof(w->'logical_work_id') is distinct from 'string'
        or btrim(w->>'logical_work_id')=''
        or jsonb_typeof(w->'catalog_matches') is distinct from 'array'
        or jsonb_array_length(w->'catalog_matches') > 1)
    or exists(select 1 from jsonb_array_elements(p_analysis->'candidates') c
      where jsonb_typeof(c) is distinct from 'object'
        or c->>'generation_version' is distinct from 'stored-program-4'
        or jsonb_typeof(c->'logical_work_id') is distinct from 'string'
        or not exists(select 1 from jsonb_array_elements(p_analysis->'logical_works') w where w->>'logical_work_id'=c->>'logical_work_id'))
    then raise exception 'One V4 candidate and at most one catalog decision per logical work required'; end if;

  -- Reuse catalog hashing, OCR/current-evidence locks, candidate/evidence
  -- validation and the existing version-scoped current/idempotency key.
  v_id := public.save_concert_program_analysis(p_analysis,p_catalog_json);
  select snapshot into v_snapshot from public.concert_program_analyses where id=v_id for update;
  if v_snapshot is not null and v_snapshot is distinct from p_analysis
    then raise exception 'Analysis changed: increment matcher version'; end if;
  if v_snapshot is null then
    update public.concert_program_analyses set snapshot=p_analysis where id=v_id and matcher_version='stored-program-4';
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_concert_program_analysis_v4(jsonb,text) from public,anon,authenticated;
grant execute on function public.save_concert_program_analysis_v4(jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
