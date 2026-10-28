-- 3F: read-only, additive official-text status. No policy/data/RPC changes.
begin;

-- Analysis-level status also represents a fresh analysis with zero candidates.
create view public.concert_program_text_analysis_status with (security_invoker=true) as
select a.id,a.concert_id,a.source_kind,a.source_hash,a.matcher_version,a.catalog_hash,
 a.concert_revision,a.concert_context,a.is_current as analysis_is_current,
 checks.reasons as freshness_reasons,cardinality(checks.reasons)=0 as is_fresh,
 coalesce(p.enabled,false) as policy_enabled,
 array_remove(checks.reasons || array[
   case when not a.is_current then 'ANALYSIS_SUPERSEDED' end,
   case when p.enabled is distinct from true then 'VERSION_POLICY_DISABLED_OR_MISSING' end
 ],null) as stale_reasons,
 (array_remove(checks.reasons || array[
   case when not a.is_current then 'ANALYSIS_SUPERSEDED' end,
   case when p.enabled is distinct from true then 'VERSION_POLICY_DISABLED_OR_MISSING' end
 ],null))[1] as stale_reason,
 a.is_current and cardinality(checks.reasons)=0 and coalesce(p.enabled,false) as is_effective_current
from public.concert_program_text_analyses a
join public.concerts k on k.id=a.concert_id
left join public.concert_program_version_policy p on p.matcher_version=a.matcher_version
left join public.concert_program_catalogs cat on cat.catalog_hash=a.catalog_hash
cross join lateral (select array_remove(array[
 case when k.kopis_detail_text is null or k.kopis_detail_text=''
   or k.kopis_detail_text_hash is distinct from a.source_hash
   or encode(sha256(convert_to(k.kopis_detail_text,'UTF8')),'hex') is distinct from a.source_hash
   then 'SOURCE_HASH_CHANGED_OR_INVALID' end,
 case when k.program_context_revision is distinct from a.concert_revision
   or jsonb_build_object('title',k.title,'venue',k.venue,'start_date',k.start_date,'end_date',k.end_date) is distinct from a.concert_context
   then 'CONCERT_CONTEXT_CHANGED' end,
 case when a.matcher_version<>'stored-program-4' or a.source_kind<>'KOPIS_DETAIL_TEXT'
   or a.snapshot->>'schema_version' is distinct from 'official-program-text-analysis-1'
   or a.snapshot->>'source_kind' is distinct from a.source_kind
   or a.snapshot->>'matcher_version' is distinct from a.matcher_version
   or a.snapshot->>'source_hash' is distinct from a.source_hash
   or a.snapshot->>'concert_id' is distinct from a.concert_id::text
   or a.snapshot->'concert_revision' is distinct from to_jsonb(a.concert_revision)
   or a.snapshot->'concert_context' is distinct from a.concert_context
   or a.snapshot->>'offset_unit' is distinct from a.offset_unit
   or a.snapshot->>'payload_hash' is distinct from a.payload_hash
   or encode(sha256(convert_to(public.program_identity_canonical(a.snapshot-'payload_hash'),'UTF8')),'hex') is distinct from a.payload_hash
   then 'ANALYSIS_SNAPSHOT_MISMATCH' end,
 case when cat.catalog_hash is null or a.snapshot->>'catalog_hash' is distinct from a.catalog_hash
   then 'CATALOG_SNAPSHOT_MISMATCH' end
 ],null) as reasons) checks;

create view public.concert_program_text_candidate_status with (security_invoker=true) as
select c.id,c.analysis_id,c.candidate_key,c.logical_work_id,c.generation_version,c.review_status,
 s.concert_id,s.source_kind,s.source_hash,s.matcher_version,s.catalog_hash,
 s.analysis_is_current,s.is_fresh,s.policy_enabled,s.is_effective_current,
 s.stale_reason,s.stale_reasons,
 c.snapshot->>'track_id' as track_id,c.snapshot->>'work_id' as work_id,
 c.snapshot->>'outcome' as outcome,c.snapshot->>'relation' as relation,
 c.snapshot->'review_reasons' as review_reasons,c.snapshot as candidate_snapshot,
 excluded.reasons as exclusion_reasons,
 cardinality(excluded.reasons)=0 as automatic_ready
from public.concert_program_text_candidates c
join public.concert_program_text_analyses a on a.id=c.analysis_id
join public.concert_program_text_analysis_status s on s.id=a.id
join public.concert_program_catalogs cat on cat.catalog_hash=a.catalog_hash
cross join lateral (select s.stale_reasons || array_remove(array[
 case when c.snapshot->>'candidate_key' is distinct from c.candidate_key
   or c.snapshot->>'logical_work_id' is distinct from c.logical_work_id
   or c.snapshot->>'generation_version' is distinct from c.generation_version
   or c.snapshot->>'review_status' is distinct from c.review_status
   or not exists(select 1 from jsonb_array_elements(a.snapshot->'candidates') n where n=c.snapshot)
   then 'CANDIDATE_SNAPSHOT_MISMATCH' end,
 case when c.snapshot->>'outcome' is distinct from 'MATCHED' or c.snapshot->>'relation' is distinct from 'EXACT'
   then 'NOT_MATCHED_EXACT' end,
 case when nullif(btrim(c.snapshot->>'track_id'),'') is null or nullif(btrim(c.snapshot->>'work_id'),'') is null
   or not exists(select 1 from jsonb_array_elements(cat.catalog->'targets') t
     where t->>'trackId'=c.snapshot->>'track_id' and t->>'workId'=c.snapshot->>'work_id')
   or cat.catalog->'works'->(c.snapshot->>'work_id') is null then 'CATALOG_TARGET_MISSING' end,
 -- Only known corroborating review reasons are safe at this planning stage.
 -- Unknown/ambiguous/conflicting/arrangement/excerpt reasons fail closed.
 case when jsonb_typeof(c.snapshot->'review_reasons') is distinct from 'array'
   or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(c.snapshot->'review_reasons')='array'
     then c.snapshot->'review_reasons' else '[]'::jsonb end) r
     where r not in ('COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','COMPOSER_AND_EXPLICIT_ITEM_IDENTITY',
       'TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'))
   or c.snapshot#>>'{identity,arrangement_or_excerpt}' is distinct from 'false'
   or c.snapshot#>>'{scope,kind}' is distinct from 'EXACT'
   or coalesce(c.snapshot#>'{matching,issues}','[]'::jsonb)<>'[]'::jsonb
   or coalesce(c.snapshot#>'{matching,arrangement_features}','[]'::jsonb)<>'[]'::jsonb
   or exists(select 1 from jsonb_array_elements(coalesce(c.snapshot#>'{matching,variants}','[]'::jsonb)) v
     where v#>>'{arrangement,arranged}'='true' or coalesce(v->'excerpts','[]'::jsonb)<>'[]'::jsonb)
   or coalesce(cat.catalog->'works'->(c.snapshot->>'work_id')->'arrangement','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)
   or coalesce(cat.catalog->'works'->(c.snapshot->>'work_id')->'excerpt','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)
   or exists(select 1 from jsonb_array_elements(cat.catalog->'targets') t
     where t->>'trackId'=c.snapshot->>'track_id'
     and (coalesce(t->'arrangement','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)
       or coalesce(t->'excerpt','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)))
   then 'UNRESOLVED_REVIEW_OR_SCOPE' end,
 case when exists(select 1 from public.concert_program_text_candidates other
   where other.analysis_id=c.analysis_id and other.id<>c.id
   and ((nullif(c.snapshot->>'track_id','') is not null and other.snapshot->>'track_id'=c.snapshot->>'track_id')
     or (nullif(c.snapshot->>'work_id','') is not null and other.snapshot->>'work_id'=c.snapshot->>'work_id')))
   then 'DUPLICATE_TRACK_OR_WORK' end
 ],null) as reasons) excluded;

revoke all on public.concert_program_text_analysis_status,public.concert_program_text_candidate_status from public,anon,authenticated;
grant select on public.concert_program_text_analysis_status,public.concert_program_text_candidate_status to service_role;
comment on view public.concert_program_text_candidate_status is 'Read-only planning eligibility, never confirmation or public-search authority. security_invoker preserves underlying RLS.';
notify pgrst,'reload schema';
commit;
