-- CA-AUTO-20261022-001: administrator preflight. No writes; never apply migration from this file.
begin isolation level repeatable read read only;
set local statement_timeout='15s';
select current_setting('transaction_read_only') as transaction_read_only,
       current_setting('server_version_num') as server_version_num;

with expected(signature,expected_result,category) as (values
 ('public.save_concert_program_analysis_v3(jsonb,text)','uuid','PREREQUISITE'),
 ('public.review_concert_program_candidate_identity(uuid,text,text,uuid,text,text)','uuid','PREREQUISITE'),
 ('public.save_concert_program_rematch(uuid,text,jsonb)','uuid','PREREQUISITE'),
 ('public.program_work_identity(jsonb,text)','jsonb','PREREQUISITE'),
 ('public.program_work_identity_hash(jsonb,text)','text','PREREQUISITE'),
 ('public.program_candidate_snapshot_valid(uuid)','boolean','PREREQUISITE'),
 ('public.program_confirmation_evidence_hash(uuid)','text','PREREQUISITE'),
 ('public.concert_program_evidence_issue(uuid,bigint,jsonb,uuid,bigint)','text','PREREQUISITE'),
 ('public.queue_automatic_programs(integer,text,text,uuid[])','jsonb','AUTOMATION'),
 ('public.program_auto_input_hash(uuid,text,text)','text','AUTOMATION'),
 ('public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text)','jsonb','AUTOMATION'),
 ('public.finish_automatic_program(uuid,text,text,text)','boolean','AUTOMATION'),
 ('public.defer_automatic_program(uuid,text,text,text)','jsonb','AUTOMATION')
)
select e.category,e.signature,e.expected_result,p.oid is not null as exists,
       p.oid::regprocedure::text as actual_signature,
       pg_get_function_result(p.oid) as actual_result,
       case when p.oid is not null then has_function_privilege('service_role',p.oid,'EXECUTE') end as service_can_execute,
       case when p.oid is not null then has_function_privilege('anon',p.oid,'EXECUTE') end as anon_can_execute,
       case when p.oid is not null then has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_can_execute
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
order by e.category,e.signature;

with expected(table_name,column_name,expected_type) as (values
 ('concert_program_images','evidence_changed_at','timestamp with time zone'),
 ('concert_program_analyses','auto_input_hash','text'),
 ('concert_program_analyses','auto_retry_at','timestamp with time zone'),
 ('concert_program_analyses','auto_retry_hash','text'),
 ('concert_program_candidates','auto_input_hash','text'),
 ('concert_program_candidates','auto_outcome','text'),
 ('concert_program_candidates','auto_reasons','jsonb')
)
select e.*,c.data_type as actual_type,c.column_name is not null as exists
from expected e left join information_schema.columns c on c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name
order by e.table_name,e.column_name;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('concert_program_images','concert_program_analyses','concert_program_candidates','concert_program_candidate_status')
order by table_name,ordinal_position;

select conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.concert_program_reviews'::regclass
order by conname;

-- Private note/identity values are not returned. Compare the complete-row digests before/after.
select r.id,r.candidate_id,c.track_id,c.work_id,r.status,r.reviewer_kind,r.identity_source,
       r.work_identity_hash,
       encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') as receipt_sha256
from public.concert_program_reviews r
join public.concert_program_candidates c on c.id=r.candidate_id
join public.concert_program_analyses a on a.id=c.analysis_id
join public.concerts k on k.id=a.concert_id
where k.kopis_id='PF295548'
order by r.id;
commit;
