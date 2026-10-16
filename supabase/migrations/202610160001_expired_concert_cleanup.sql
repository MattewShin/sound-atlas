begin;

-- Operational deletion receipts only: no OCR, analysis, title or review content.
-- A lost HTTP response can be retried without losing the actual deletion counts.
create table if not exists public.concert_cleanup_events (
  operation_id uuid primary key,
  run_id uuid not null,
  concert_id uuid not null,
  kopis_id text not null,
  deleted_at timestamptz not null default clock_timestamp(),
  cutoff_date date not null,
  counts jsonb not null check (jsonb_typeof(counts) = 'object')
);
alter table public.concert_cleanup_events enable row level security;
revoke all on public.concert_cleanup_events from public, anon, authenticated, service_role;
grant select on public.concert_cleanup_events to service_role;

create or replace function public.concert_cleanup_korean_date(p_at timestamptz)
returns date language sql immutable set search_path = '' as $$
  select (p_at at time zone 'Asia/Seoul')::date;
$$;
create or replace function public.concert_cleanup_valid_dates(p_start date, p_end date)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_start between date '0001-01-01' and date '9999-12-31'
    and p_end between date '0001-01-01' and date '9999-12-31' and p_end >= p_start, false);
$$;

-- All inbound edges to the owned graph must be known. An unexpected FK could
-- otherwise cascade into unrelated data. Expose metadata only to the operator.
create or replace function public.concert_cleanup_foreign_keys()
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text,
    'edge', conrelid::regclass::text || ':' || confrelid::regclass::text || ':' ||
      (select string_agg(a.attname, ',' order by k.n) from unnest(conkey) with ordinality k(attnum,n)
       join pg_attribute a on a.attrelid = conrelid and a.attnum = k.attnum),
    'name', conname, 'definition', pg_get_constraintdef(oid), 'expected',
    (conrelid::regclass::text || ':' || confrelid::regclass::text || ':' ||
      (select string_agg(a.attname, ',' order by k.n) from unnest(conkey) with ordinality k(attnum,n)
       join pg_attribute a on a.attrelid = conrelid and a.attnum = k.attnum)) = any(array[
      'public.concert_program_images:public.concerts:concert_id',
      'public.concert_image_ocr_results:public.concert_program_images:image_id',
      'public.concert_image_ocr_attempts:public.concert_program_images:image_id',
      'public.concert_image_ocr_attempts:public.concert_image_ocr_results:result_id',
      'public.concert_program_analyses:public.concerts:concert_id',
      'public.concert_program_analyses:public.concert_program_images:image_id',
      'public.concert_program_analyses:public.concert_image_ocr_results:ocr_result_id',
      'public.concert_program_analyses:public.concert_image_ocr_attempts:source_attempt_id',
      'public.concert_program_candidates:public.concert_program_analyses:analysis_id',
      'public.concert_program_reviews:public.concert_program_candidates:candidate_id'
    ]) and convalidated and confdeltype in ('a','c') and cardinality(confkey) = 1
      and (select attname from pg_attribute where attrelid=confrelid and attnum=confkey[1]) = 'id') order by conrelid, conname), '[]'::jsonb)
  from pg_constraint where contype = 'f' and confrelid = any(array[
    'public.concerts'::regclass,'public.concert_program_images'::regclass,
    'public.concert_image_ocr_results'::regclass,'public.concert_image_ocr_attempts'::regclass,
    'public.concert_program_analyses'::regclass,'public.concert_program_candidates'::regclass,
    'public.concert_program_reviews'::regclass]);
$$;

create or replace function public.concert_cleanup_counts(p_ids uuid[])
returns jsonb language sql stable set search_path = '' as $$
  with images as (select id from public.concert_program_images where concert_id = any(p_ids)),
  analyses as (select id from public.concert_program_analyses where concert_id = any(p_ids)),
  candidates as (select id from public.concert_program_candidates where analysis_id in (select id from analyses))
  select jsonb_build_object(
    'concerts', (select count(*) from public.concerts where id = any(p_ids)),
    'concert_program_images', (select count(*) from images),
    'concert_image_ocr_results', (select count(*) from public.concert_image_ocr_results where image_id in (select id from images)),
    'concert_image_ocr_attempts', (select count(*) from public.concert_image_ocr_attempts where image_id in (select id from images)),
    'concert_program_analyses', (select count(*) from analyses),
    'concert_program_candidates', (select count(*) from candidates),
    'concert_program_reviews', (select count(*) from public.concert_program_reviews where candidate_id in (select id from candidates)));
$$;

create or replace function public.concert_cleanup_shared_dependency(p_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.concert_image_ocr_attempts a
    join public.concert_program_images i on i.id=a.image_id
    join public.concert_image_ocr_results r on r.id=a.result_id
    join public.concert_program_images ri on ri.id=r.image_id
    where p_id in (i.concert_id,ri.concert_id) and i.concert_id <> ri.concert_id
  ) or exists (
    select 1 from public.concert_program_analyses a
    join public.concert_program_images i on i.id=a.image_id
    join public.concert_image_ocr_results r on r.id=a.ocr_result_id
    join public.concert_program_images ri on ri.id=r.image_id
    join public.concert_image_ocr_attempts t on t.id=a.source_attempt_id
    join public.concert_program_images ti on ti.id=t.image_id
    where p_id in (a.concert_id,i.concert_id,ri.concert_id,ti.concert_id)
      and not (a.concert_id=i.concert_id and a.concert_id=ri.concert_id and a.concert_id=ti.concert_id)
  );
$$;

create or replace function public.plan_expired_concert_cleanup(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.concert_cleanup_korean_date(statement_timestamp());
  v_ids uuid[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'Invalid cleanup limit'; end if;
  select coalesce(array_agg(id order by end_date, id), array[]::uuid[]) into v_ids from (
    select id, end_date from public.concerts
    where public.concert_cleanup_valid_dates(start_date,end_date) and end_date < v_today
    order by end_date, id limit p_limit
  ) targets;
  return jsonb_build_object('schema_version','expired-concert-cleanup-1','reference_date', v_today, 'date_source', 'DATABASE_ASIA_SEOUL', 'snapshot_consistent',true,
    'total', (select count(*) from public.concerts where public.concert_cleanup_valid_dates(start_date,end_date) and end_date < v_today),
    'excluded_invalid_dates', (select count(*) from public.concerts where not public.concert_cleanup_valid_dates(start_date,end_date)),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kopis_id',c.kopis_id,'title',c.title,'end_date',c.end_date,
      'shared_dependency',public.concert_cleanup_shared_dependency(c.id),
      'image_ids',(select coalesce(jsonb_agg(i.id),'[]'::jsonb) from public.concert_program_images i where i.concert_id=c.id),
      'counts',public.concert_cleanup_counts(array[c.id])) order by c.end_date,c.id),'[]'::jsonb)
      from public.concerts c where c.id = any(v_ids)),
    'counts', public.concert_cleanup_counts(v_ids), 'foreign_keys', public.concert_cleanup_foreign_keys());
end;
$$;

create or replace function public.delete_expired_concert(p_concert_id uuid, p_operation_id uuid, p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_concert public.concerts%rowtype;
  v_event public.concert_cleanup_events%rowtype;
  v_today date;
  v_counts jsonb;
  v_rows bigint;
begin
  if p_concert_id is null or p_operation_id is null or p_run_id is null then raise exception 'Cleanup IDs required'; end if;
  -- Serialize duplicate HTTP operations before inspecting the receipt.
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into v_event from public.concert_cleanup_events where operation_id=p_operation_id;
  if found then
    if v_event.concert_id <> p_concert_id or v_event.run_id <> p_run_id then raise exception 'Cleanup operation mismatch'; end if;
    return jsonb_build_object('status','DELETED','kopis_id',v_event.kopis_id,'deleted_at',v_event.deleted_at,
      'reference_date',v_event.cutoff_date,'counts',v_event.counts,'receipt_reused',true);
  end if;
  -- Wait for concurrent end-date extensions, then read/revalidate the updated row.
  select * into v_concert from public.concerts where id=p_concert_id for update;
  if not found then return jsonb_build_object('status','NOT_FOUND'); end if;
  v_today := public.concert_cleanup_korean_date(clock_timestamp());
  if not public.concert_cleanup_valid_dates(v_concert.start_date,v_concert.end_date) or v_concert.end_date >= v_today then
    return jsonb_build_object('status','NOT_EXPIRED','kopis_id',v_concert.kopis_id,'reference_date',v_today,
      'start_date',v_concert.start_date,'end_date',v_concert.end_date);
  end if;
  -- Normal writes can continue on other rows, but FK-altering DDL must wait.
  lock table public.concerts, public.concert_program_images, public.concert_image_ocr_results,
    public.concert_image_ocr_attempts, public.concert_program_analyses,
    public.concert_program_candidates, public.concert_program_reviews in row exclusive mode;
  if (select count(distinct x->>'edge') from jsonb_array_elements(public.concert_cleanup_foreign_keys()) x) <> 10
    or exists (select 1 from jsonb_array_elements(public.concert_cleanup_foreign_keys()) x where (x->>'expected')::boolean is not true) then
    return jsonb_build_object('status','BLOCKED_UNEXPECTED_FOREIGN_KEY','kopis_id',v_concert.kopis_id);
  end if;
  -- Lock parents before children. FK key-share locks then prevent new references
  -- while counts, sharing checks and deletion run in this one transaction.
  perform 1 from public.concert_program_images where concert_id=p_concert_id order by id for update;
  perform 1 from public.concert_image_ocr_results where image_id in (select id from public.concert_program_images where concert_id=p_concert_id) order by id for update;
  perform 1 from public.concert_image_ocr_attempts where image_id in (select id from public.concert_program_images where concert_id=p_concert_id) order by id for update;
  perform 1 from public.concert_program_analyses where concert_id=p_concert_id order by id for update;
  perform 1 from public.concert_program_candidates where analysis_id in (select id from public.concert_program_analyses where concert_id=p_concert_id) order by id for update;
  perform 1 from public.concert_program_reviews where candidate_id in (select c.id from public.concert_program_candidates c join public.concert_program_analyses a on a.id=c.analysis_id where a.concert_id=p_concert_id) order by id for update;
  if public.concert_cleanup_shared_dependency(p_concert_id) then
    return jsonb_build_object('status','BLOCKED_SHARED_DEPENDENCY','kopis_id',v_concert.kopis_id);
  end if;
  v_counts := public.concert_cleanup_counts(array[p_concert_id]);
  -- Existing cascade owns candidates/reviews and images/results. Remove the
  -- NO ACTION cross references first; do not broaden any existing FK cascade.
  delete from public.concert_program_analyses where concert_id=p_concert_id;
  delete from public.concert_image_ocr_attempts where image_id in (select id from public.concert_program_images where concert_id=p_concert_id);
  delete from public.concerts where id=p_concert_id
    and public.concert_cleanup_valid_dates(start_date,end_date)
    and end_date < public.concert_cleanup_korean_date(clock_timestamp());
  get diagnostics v_rows = row_count;
  if v_rows <> 1 or exists (select 1 from jsonb_each_text(public.concert_cleanup_counts(array[p_concert_id])) x where x.value::bigint <> 0) then
    raise exception 'Cleanup did not remove complete owned graph';
  end if;
  insert into public.concert_cleanup_events(operation_id,run_id,concert_id,kopis_id,cutoff_date,counts)
    values(p_operation_id,p_run_id,p_concert_id,v_concert.kopis_id,v_today,v_counts) returning * into v_event;
  return jsonb_build_object('status','DELETED','kopis_id',v_event.kopis_id,'deleted_at',v_event.deleted_at,
    'reference_date',v_today,'counts',v_counts,'receipt_reused',false);
end;
$$;

revoke all on function public.concert_cleanup_korean_date(timestamptz),
  public.concert_cleanup_valid_dates(date,date), public.concert_cleanup_foreign_keys(),
  public.concert_cleanup_counts(uuid[]), public.concert_cleanup_shared_dependency(uuid), public.plan_expired_concert_cleanup(integer),
  public.delete_expired_concert(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.plan_expired_concert_cleanup(integer), public.delete_expired_concert(uuid,uuid,uuid) to service_role;
comment on table public.concert_cleanup_events is 'Minimal deletion receipts for HTTP idempotency. No retained concert/OCR/analysis/review payload.';
notify pgrst, 'reload schema';
commit;
