-- 3G: one official-text CONFIRMED receipt; no legacy/text-row/policy updates.
begin;

create table public.concert_program_text_confirmations (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null references public.concert_program_text_candidates(id),
 analysis_id uuid not null references public.concert_program_text_analyses(id),
 concert_id uuid not null references public.concerts(id),
 source_kind text not null check(source_kind='KOPIS_DETAIL_TEXT'),
 status text not null check(status='CONFIRMED'),
 track_id text not null check(length(track_id)>0),work_id text not null check(length(work_id)>0),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 catalog_hash text not null references public.concert_program_catalogs(catalog_hash),
 matcher_version text not null check(matcher_version='stored-program-4'),
 decision_version text not null check(decision_version='program-text-confirm-1'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 candidate_snapshot_hash text not null check(candidate_snapshot_hash ~ '^[a-f0-9]{64}$'),
 work_identity_snapshot jsonb not null check(jsonb_typeof(work_identity_snapshot)='object' and work_identity_snapshot->>'schema' is not distinct from 'work-identity-1'),
 work_identity_hash text not null check(work_identity_hash ~ '^[a-f0-9]{64}$'),
 verification_hash text not null check(verification_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(candidate_id,decision_version)
);
alter table public.concert_program_text_confirmations enable row level security;
revoke all on public.concert_program_text_confirmations from public,anon,authenticated,service_role;
grant select,insert on public.concert_program_text_confirmations to service_role;

create function public.prevent_program_text_confirmation_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Official confirmation receipts are append-only';end; $$;
create trigger program_text_confirmation_immutable before update or delete
 on public.concert_program_text_confirmations for each row execute function public.prevent_program_text_confirmation_mutation();
create trigger program_text_confirmation_no_truncate before truncate
 on public.concert_program_text_confirmations for each statement execute function public.prevent_program_text_confirmation_mutation();

create function public.confirm_concert_program_text_candidate_v4(p_expected jsonb,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 k public.concerts%rowtype;
 a public.concert_program_text_analyses%rowtype;
 c public.concert_program_text_candidates%rowtype;
 old public.concert_program_text_confirmations%rowtype;
 concert_id uuid;enabled boolean;cat jsonb;identity jsonb;verified jsonb;ev jsonb;
 evidence_hash text;identity_hash text;candidate_hash text;verification_hash text;receipt_id uuid;
begin
 if jsonb_typeof(p_expected) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(p_expected))<>7
   or exists(select 1 from jsonb_each(p_expected) x where jsonb_typeof(x.value)<>'string')
   or not p_expected ?& array['candidate_id','analysis_id','source_hash','payload_hash','catalog_hash','matcher_version','decision_version']
   or p_expected->>'candidate_id' is null or p_expected->>'candidate_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or p_expected->>'analysis_id' is null or p_expected->>'analysis_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   or p_expected->>'source_hash' is null or p_expected->>'source_hash' !~ '^[a-f0-9]{64}$'
   or p_expected->>'payload_hash' is null or p_expected->>'payload_hash' !~ '^[a-f0-9]{64}$'
   or p_expected->>'catalog_hash' is null or p_expected->>'catalog_hash' !~ '^[a-f0-9]{64}$'
   or p_expected->>'matcher_version' is distinct from 'stored-program-4'
   or p_expected->>'decision_version' is distinct from 'program-text-confirm-1'
   then raise exception 'Official confirmation expected identity required';end if;

 -- Lock order is shared with text saving: policy -> concert -> analysis ->
 -- candidates (UUID order). The initial analysis lookup only locates concert;
 -- its identity is checked again after the concert and analysis locks.
 select p.enabled into enabled from public.concert_program_version_policy p
   where p.matcher_version='stored-program-4' for share;
 if not found or enabled is distinct from true then raise exception 'V4 disabled or policy missing';end if;
 select x.concert_id into concert_id from public.concert_program_text_analyses x where x.id=(p_expected->>'analysis_id')::uuid;
 select * into k from public.concerts x where x.id=concert_id for update;
 if not found then raise exception 'Official concert missing';end if;
 select * into a from public.concert_program_text_analyses x where x.id=(p_expected->>'analysis_id')::uuid for update;
 if not found or a.concert_id is distinct from k.id then raise exception 'Official analysis changed';end if;
 perform x.id from public.concert_program_text_candidates x where x.analysis_id=a.id order by x.id for update;
 select * into c from public.concert_program_text_candidates x where x.id=(p_expected->>'candidate_id')::uuid and x.analysis_id=a.id for update;
 if not found or c.analysis_id is distinct from a.id then raise exception 'Official candidate/analysis mismatch';end if;

 if a.source_kind<>'KOPIS_DETAIL_TEXT' or a.matcher_version is distinct from p_expected->>'matcher_version'
   or not a.is_current or a.source_hash is distinct from p_expected->>'source_hash'
   or a.payload_hash is distinct from p_expected->>'payload_hash' or a.catalog_hash is distinct from p_expected->>'catalog_hash'
   then raise exception 'Official expected snapshot changed';end if;
 if k.kopis_detail_text is null or k.kopis_detail_text='' or k.kopis_detail_text_hash is distinct from a.source_hash
   or encode(sha256(convert_to(k.kopis_detail_text,'UTF8')),'hex') is distinct from a.source_hash
   or k.program_context_revision is distinct from a.concert_revision
   or jsonb_build_object('title',k.title,'venue',k.venue,'start_date',k.start_date,'end_date',k.end_date) is distinct from a.concert_context
   then raise exception 'Official source/context stale';end if;
 if a.snapshot->>'payload_hash' is distinct from a.payload_hash
   or encode(sha256(convert_to(public.program_identity_canonical(a.snapshot-'payload_hash'),'UTF8')),'hex') is distinct from a.payload_hash
   or (select count(*) from jsonb_array_elements(a.snapshot->'candidates') n where n=c.snapshot)<>1
   then raise exception 'Official analysis/candidate snapshot mismatch';end if;
 if encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex') is distinct from a.catalog_hash then raise exception 'Expected catalog bytes changed';end if;
 -- Catalogs are SELECT/INSERT-only for service_role. Do not broaden the old
 -- catalog ACL just to take an UPDATE-requiring row lock on immutable content.
 select x.catalog into cat from public.concert_program_catalogs x where x.catalog_hash=a.catalog_hash;
 if not found or cat is distinct from p_catalog_json::jsonb then raise exception 'Stored catalog snapshot mismatch';end if;
 -- This existing view is read UNDER the locks, never a client-supplied plan.
 -- It checks full snapshot columns, explicit policy, current freshness,
 -- MATCHED+EXACT, catalog membership, scope/review reasons and duplicates.
 if c.review_status<>'REVIEW_REQUIRED' or c.generation_version<>'stored-program-4'
   or not exists(select 1 from public.concert_program_text_candidate_status s where s.id=c.id and s.automatic_ready)
   then raise exception 'Official candidate not eligible';end if;
 -- Recheck quoted code-point evidence, including nested snapshot variants,
 -- against the locked full source; diagnostic UTF-16 is not trusted.
 for ev in with recursive nodes(v) as (
   select a.snapshot union all
   select child.v from nodes cross join lateral (
     select value v from jsonb_each(case when jsonb_typeof(nodes.v)='object' then nodes.v else '{}'::jsonb end)
     union all select value v from jsonb_array_elements(case when jsonb_typeof(nodes.v)='array' then nodes.v else '[]'::jsonb end)
   ) child
 ) select v from nodes where jsonb_typeof(v)='object' and v ? 'quote' loop
   if jsonb_typeof(ev->'quote') is distinct from 'string'
     or jsonb_typeof(ev->'start') is distinct from 'number' or jsonb_typeof(ev->'end') is distinct from 'number'
     or ev->>'start' !~ '^[0-9]+$' or ev->>'end' !~ '^[0-9]+$'
     or (ev->>'start')::integer<0 or (ev->>'end')::integer<=(ev->>'start')::integer
     or (ev->>'end')::integer>length(k.kopis_detail_text)
     or substring(k.kopis_detail_text from (ev->>'start')::integer+1 for (ev->>'end')::integer-(ev->>'start')::integer) is distinct from ev->>'quote'
     or coalesce(ev->'bbox','null'::jsonb)<>'null'::jsonb or coalesce(ev->'confidence','null'::jsonb)<>'null'::jsonb
     then raise exception 'Official evidence mismatch';end if;
 end loop;
 identity:=public.program_work_identity(cat,c.snapshot->>'work_id');
 if identity is null then raise exception 'Official work identity missing';end if;
 identity_hash:=encode(sha256(convert_to(public.program_identity_canonical(identity),'UTF8')),'hex');
 evidence_hash:=encode(sha256(convert_to(public.program_identity_canonical(c.snapshot->'evidence'),'UTF8')),'hex');
 candidate_hash:=encode(sha256(convert_to(public.program_identity_canonical(c.snapshot),'UTF8')),'hex');
 verified:=jsonb_build_object('candidate_id',c.id,'analysis_id',a.id,'concert_id',k.id,
   'source_kind',a.source_kind,'status','CONFIRMED','track_id',c.snapshot->>'track_id','work_id',c.snapshot->>'work_id',
   'source_hash',a.source_hash,'payload_hash',a.payload_hash,'catalog_hash',a.catalog_hash,'matcher_version',a.matcher_version,
   'decision_version',p_expected->>'decision_version','evidence_hash',evidence_hash,'candidate_snapshot_hash',candidate_hash,
   'work_identity_snapshot',identity,'work_identity_hash',identity_hash);
 verification_hash:=encode(sha256(convert_to(public.program_identity_canonical(verified),'UTF8')),'hex');
 select * into old from public.concert_program_text_confirmations x
   where x.candidate_id=c.id and x.decision_version=p_expected->>'decision_version';
 if found then
   if old.verification_hash is distinct from verification_hash
     or to_jsonb(old)-array['id','created_at','verification_hash'] is distinct from verified
     then raise exception 'Confirmation idempotency snapshot mismatch';end if;
   return old.id;
 end if;
 insert into public.concert_program_text_confirmations(candidate_id,analysis_id,concert_id,source_kind,status,track_id,work_id,
   source_hash,payload_hash,catalog_hash,matcher_version,decision_version,evidence_hash,candidate_snapshot_hash,
   work_identity_snapshot,work_identity_hash,verification_hash)
 values(c.id,a.id,k.id,a.source_kind,'CONFIRMED',c.snapshot->>'track_id',c.snapshot->>'work_id',a.source_hash,a.payload_hash,
   a.catalog_hash,a.matcher_version,p_expected->>'decision_version',evidence_hash,candidate_hash,identity,identity_hash,verification_hash)
 returning id into receipt_id;
 return receipt_id;
end; $$;

revoke all on function public.confirm_concert_program_text_candidate_v4(jsonb,text),public.prevent_program_text_confirmation_mutation() from public,anon,authenticated,service_role;
grant execute on function public.confirm_concert_program_text_candidate_v4(jsonb,text) to service_role;
comment on table public.concert_program_text_confirmations is 'Append-only official CONFIRMED receipts. No raw source copy, no REJECTED status, no OCR/review/search integration.';
notify pgrst,'reload schema';
commit;
