-- 3H: read-only validity of official receipts. No data/policy/RPC changes.
begin;
create view public.concert_program_text_confirmation_status with (security_invoker=true) as
select r.id,r.candidate_id,r.analysis_id,r.concert_id,r.track_id,r.work_id,r.source_kind,r.status,
 r.source_hash,r.payload_hash,r.catalog_hash,r.matcher_version,r.decision_version,
 r.evidence_hash,r.candidate_snapshot_hash,r.work_identity_hash,r.verification_hash,
 a.is_current as analysis_is_current,coalesce(p.enabled,false) as policy_enabled,
 c.snapshot->>'relation' as relation,c.snapshot->>'outcome' as outcome,
 reasons.items as stale_reasons,(reasons.items)[1] as stale_reason,
 cardinality(reasons.items)=0 as is_effectively_confirmed
from public.concert_program_text_confirmations r
left join public.concert_program_text_analyses a on a.id=r.analysis_id
left join public.concert_program_text_candidates c on c.id=r.candidate_id
left join public.concerts k on k.id=r.concert_id
left join public.concert_program_catalogs cat on cat.catalog_hash=r.catalog_hash
left join public.concert_program_version_policy p on p.matcher_version='stored-program-4'
cross join lateral (select public.program_work_identity(cat.catalog,r.work_id) as snapshot) identity
cross join lateral (select array_remove(array[
 case when r.status<>'CONFIRMED' or r.source_kind<>'KOPIS_DETAIL_TEXT' or r.matcher_version<>'stored-program-4'
   or r.decision_version<>'program-text-confirm-1' then 'RECEIPT_CONTRACT_CHANGED' end,
 case when k.id is null or a.id is null or c.id is null or c.analysis_id is distinct from a.id
   or a.concert_id is distinct from k.id then 'SOURCE_MEMBERSHIP_CHANGED' end,
 case when a.is_current is distinct from true then 'ANALYSIS_SUPERSEDED' end,
 case when k.kopis_detail_text is null or k.kopis_detail_text='' or k.kopis_detail_text_hash is distinct from r.source_hash
   or a.source_hash is distinct from r.source_hash
   or encode(sha256(convert_to(k.kopis_detail_text,'UTF8')),'hex') is distinct from r.source_hash
   then 'SOURCE_HASH_CHANGED_OR_INVALID' end,
 case when a.concert_revision is distinct from k.program_context_revision
   or a.concert_context is distinct from jsonb_build_object('title',k.title,'venue',k.venue,'start_date',k.start_date,'end_date',k.end_date)
   then 'CONCERT_CONTEXT_CHANGED' end,
 case when a.source_kind is distinct from r.source_kind or a.matcher_version is distinct from r.matcher_version
   or a.payload_hash is distinct from r.payload_hash or a.catalog_hash is distinct from r.catalog_hash
   or a.snapshot->>'schema_version' is distinct from 'official-program-text-analysis-1'
   or a.snapshot->>'source_kind' is distinct from a.source_kind or a.snapshot->>'matcher_version' is distinct from a.matcher_version
   or a.snapshot->>'source_hash' is distinct from a.source_hash or a.snapshot->>'catalog_hash' is distinct from a.catalog_hash
   or a.snapshot->>'concert_id' is distinct from a.concert_id::text
   or a.snapshot->'concert_revision' is distinct from to_jsonb(a.concert_revision)
   or a.snapshot->'concert_context' is distinct from a.concert_context
   or a.offset_unit is distinct from 'UNICODE_CODE_POINT' or a.snapshot->>'offset_unit' is distinct from a.offset_unit
   or a.snapshot->>'payload_hash' is distinct from r.payload_hash
   or encode(sha256(convert_to(public.program_identity_canonical(a.snapshot-'payload_hash'),'UTF8')),'hex') is distinct from r.payload_hash
   then 'ANALYSIS_SNAPSHOT_CHANGED' end,
 case when c.generation_version is distinct from r.matcher_version or c.review_status is distinct from 'REVIEW_REQUIRED'
   or c.snapshot->>'generation_version' is distinct from c.generation_version
   or c.snapshot->>'review_status' is distinct from c.review_status
   or c.snapshot->>'candidate_key' is distinct from c.candidate_key or c.snapshot->>'logical_work_id' is distinct from c.logical_work_id
   or c.snapshot->>'track_id' is distinct from r.track_id or c.snapshot->>'work_id' is distinct from r.work_id
   or encode(sha256(convert_to(public.program_identity_canonical(c.snapshot),'UTF8')),'hex') is distinct from r.candidate_snapshot_hash
   or jsonb_typeof(a.snapshot->'candidates') is distinct from 'array'
   or (select count(*) from jsonb_array_elements(case when jsonb_typeof(a.snapshot->'candidates')='array' then a.snapshot->'candidates' else '[]'::jsonb end) n where n=c.snapshot)<>1
   then 'CANDIDATE_SNAPSHOT_CHANGED' end,
 case when encode(sha256(convert_to(public.program_identity_canonical(c.snapshot->'evidence'),'UTF8')),'hex') is distinct from r.evidence_hash
   or jsonb_typeof(c.snapshot->'evidence') is distinct from 'array'
   or jsonb_array_length(case when jsonb_typeof(c.snapshot->'evidence')='array' then c.snapshot->'evidence' else '[]'::jsonb end)=0
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'evidence')='array' then c.snapshot->'evidence' else '[]'::jsonb end) ev
     where not case when jsonb_typeof(ev->'quote')='string' and jsonb_typeof(ev->'start')='number' and jsonb_typeof(ev->'end')='number'
       and ev->>'start' ~ '^[0-9]{1,9}$' and ev->>'end' ~ '^[0-9]{1,9}$'
       then (ev->>'start')::integer>=0 and (ev->>'end')::integer>(ev->>'start')::integer
         and (ev->>'end')::integer<=length(k.kopis_detail_text)
         and substring(k.kopis_detail_text from (ev->>'start')::integer+1 for (ev->>'end')::integer-(ev->>'start')::integer)=ev->>'quote'
         and coalesce(ev->'bbox','null'::jsonb)='null'::jsonb and coalesce(ev->'confidence','null'::jsonb)='null'::jsonb
       else false end)
   then 'EVIDENCE_CHANGED' end,
 case when c.snapshot->>'outcome' is distinct from 'MATCHED' or c.snapshot->>'relation' is distinct from 'EXACT'
   then 'NOT_MATCHED_EXACT' end,
 case when cat.catalog_hash is null or cat.catalog->'works'->r.work_id is null
   or not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(cat.catalog->'targets')='array' then cat.catalog->'targets' else '[]'::jsonb end) t
     where t->>'trackId'=r.track_id and t->>'workId'=r.work_id) then 'CATALOG_TARGET_CHANGED' end,
 case when identity.snapshot is null or identity.snapshot is distinct from r.work_identity_snapshot
   or encode(sha256(convert_to(public.program_identity_canonical(identity.snapshot),'UTF8')),'hex') is distinct from r.work_identity_hash
   then 'WORK_IDENTITY_CHANGED' end,
 case when c.snapshot#>>'{identity,arrangement_or_excerpt}' is distinct from 'false' or c.snapshot#>>'{scope,kind}' is distinct from 'EXACT'
   or jsonb_typeof(c.snapshot->'review_reasons') is distinct from 'array'
   or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(c.snapshot->'review_reasons')='array' then c.snapshot->'review_reasons' else '[]'::jsonb end) reason
     where reason not in ('COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','COMPOSER_AND_EXPLICIT_ITEM_IDENTITY','TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'))
   or coalesce(c.snapshot#>'{matching,issues}','[]'::jsonb)<>'[]'::jsonb
   or coalesce(c.snapshot#>'{matching,arrangement_features}','[]'::jsonb)<>'[]'::jsonb
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(c.snapshot#>'{matching,variants}')='array' then c.snapshot#>'{matching,variants}' else '[]'::jsonb end) v
     where v#>>'{arrangement,arranged}'='true' or coalesce(v->'excerpts','[]'::jsonb)<>'[]'::jsonb)
   or coalesce(cat.catalog->'works'->r.work_id->'arrangement','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)
   or coalesce(cat.catalog->'works'->r.work_id->'excerpt','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(cat.catalog->'targets')='array' then cat.catalog->'targets' else '[]'::jsonb end) t
     where t->>'trackId'=r.track_id and (coalesce(t->'arrangement','false'::jsonb) not in ('false'::jsonb,'null'::jsonb) or coalesce(t->'excerpt','false'::jsonb) not in ('false'::jsonb,'null'::jsonb)))
   then 'UNRESOLVED_REVIEW_OR_SCOPE' end,
 case when exists(select 1 from public.concert_program_text_candidates other where other.analysis_id=a.id and other.id<>c.id
   and (other.snapshot->>'track_id'=r.track_id or other.snapshot->>'work_id'=r.work_id)) then 'DUPLICATE_TRACK_OR_WORK' end,
 case when encode(sha256(convert_to(public.program_identity_canonical(to_jsonb(r)-array['id','created_at','verification_hash']),'UTF8')),'hex') is distinct from r.verification_hash
   then 'RECEIPT_VERIFICATION_CHANGED' end,
 case when p.enabled is distinct from true then 'VERSION_POLICY_DISABLED_OR_MISSING' end
 ],null) as items) reasons;
revoke all on public.concert_program_text_confirmation_status from public,anon,authenticated,service_role;
grant select on public.concert_program_text_confirmation_status to service_role;
comment on view public.concert_program_text_confirmation_status is 'Private live validity of official confirmations; exposes scalar identities/hashes only, no source text, evidence quotes or identity snapshots.';
notify pgrst,'reload schema';
commit;
