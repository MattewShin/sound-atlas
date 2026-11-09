-- READ ONLY schema/privilege inspection; no function invocation or candidate DML.
begin isolation level repeatable read read only;
set local statement_timeout='15s';
select current_setting('transaction_read_only') as transaction_read_only;
with expected(signature,security_definer,volatility) as (values
 ('public.plan_automatic_program_batch_bounded(uuid,jsonb,text,text,text,uuid[])',false,'s'),
 ('public.complete_automatic_program_batch_bounded(uuid,uuid,jsonb,text,text,text,text,uuid[])',true,'v'))
select e.*,p.oid is not null as exists,pg_get_function_result(p.oid) as actual_result,
 p.prosecdef as actual_security_definer,p.provolatile as actual_volatility,
 pg_get_userbyid(p.proowner) as function_owner,
 case when p.oid is not null then has_function_privilege('service_role',p.oid,'execute') end as service_execute,
 case when p.oid is not null then has_function_privilege('anon',p.oid,'execute') end as anon_execute,
 case when p.oid is not null then has_function_privilege('authenticated',p.oid,'execute') end as authenticated_execute
from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature);
select signature,has_function_privilege('service_role',signature,'execute') as legacy_service_execute
from (values('public.decide_automatic_program_candidate(uuid,uuid,text,text,text,jsonb,jsonb,text)'),
 ('public.finish_automatic_program(uuid,text,text,text)'),('public.defer_automatic_program(uuid,text,text,text)')) x(signature);
select name,to_regclass('public.'||name) is not null as exists,
 case when to_regclass('public.'||name) is not null then has_table_privilege('service_role','public.'||name,'insert') end as service_insert,
 case when to_regclass('public.'||name) is not null then has_table_privilege('service_role','public.'||name,'update') end as service_update
from (values('program_automation_bounded_runs'),('program_automation_bounded_batches')) x(name);
rollback;
