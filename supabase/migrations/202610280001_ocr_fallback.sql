-- Additive, independently disabled OCR fallback. Existing official/legacy contracts unchanged.
begin;
insert into public.concert_program_version_policy(matcher_version,enabled,note)
values('program-ocr-fallback-1',false,'Bounded OCR fallback awaits isolated tests and explicit canary') on conflict do nothing;

create table public.concert_program_ocr_fallback_receipts(
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null unique references public.concert_program_candidates(id) on delete cascade,
 review_id uuid not null unique references public.concert_program_reviews(id) on delete cascade,
 rule text not null check(rule='program-ocr-fallback-1'),
 expected jsonb not null check(jsonb_typeof(expected)='object'),
 expected_hash text not null check(expected_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.concert_program_ocr_fallback_receipts enable row level security;
revoke all on public.concert_program_ocr_fallback_receipts from public,anon,authenticated,service_role;
grant select,insert on public.concert_program_ocr_fallback_receipts to service_role;

-- Exact conservative counterpart of source routing. Invalid pairs and markup HOLD.
create function public.ocr_fallback_official_reason(p_text text,p_hash text)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare line text; active boolean:=false; seen boolean:=false;
begin
 if p_text is null and p_hash is null then return 'OFFICIAL_TEXT_ABSENT';end if;
 if p_text is null or p_hash is null or btrim(p_text,E' \t\r\n')='' or p_hash !~ '^[a-f0-9]{64}$'
   or encode(sha256(convert_to(p_text,'UTF8')),'hex')<>p_hash or p_text ~* '<[/]?[a-z][^>]*>' then return 'HOLD';end if;
 foreach line in array regexp_split_to_array(p_text,E'\r\n|\r|\n') loop
  if line ~* '^\s*(program(me)?|프로그램|곡목|\[\s*(program(me)?|프로그램|곡목)\s*\]|【\s*(program(me)?|프로그램|곡목)\s*】|\(\s*(program(me)?|프로그램|곡목)\s*\))\s*[:：]?\s*$' then active:=true;seen:=true;continue;end if;
  if active and (line ~* '^\s*(\[[^\]]+\]|【[^】]+】|profile|biography|program\s+notes?|visitor\s+information|ticket|admission|location|프로필|출연진|연주자\s*소개|작품\s*해설|공연소개|관람\s*안내|공지|안내|예매|후원|문의)'
    or line ~* '^\s*\*?\s*(program(me)?(\s+and\s+(artists?|performers?))?\s+((is|are)\s+)?(subject\s+to\s+change|may\s+(be\s+)?change)|프로그램\s*(및\s*연주자)?\s*(은|이|가)?.*변경)'
    or line ~* '졸업|학사|석사|박사|학위|역임|출강|교수|과거\s*공연|지난\s*공연|경력|\mpreviously\M|\mgraduat\w*|\muniversity\M|\mconservatory\M|\mdiscography\M') then active:=false;continue;end if;
  if active and btrim(line,E' \t')<>'' then return 'OFFICIAL_PROGRAM_AVAILABLE';end if;
 end loop;
 return case when seen then 'OFFICIAL_PROGRAM_EMPTY' else 'OFFICIAL_PROGRAM_ABSENT' end;
end;$$;

-- Recompute from immutable persisted OCR and analysis sections, not caller metrics.
create function public.ocr_fallback_quality(p_ocr uuid,p_sections jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare o public.concert_image_ocr_results%rowtype; q jsonb; d jsonb; point jsonb; line text; idx int:=0; offset_start int:=0; indices jsonb:='[]'; n int:=0; matched int:=0; confidences double precision[]:='{}'; med double precision; coverage double precision; w int; h int; field text;
begin
 select * into o from public.concert_image_ocr_results where id=p_ocr;
 q:=o.settings->'ocr_fallback_quality';
 if q is null or q->>'schema' is distinct from 'program-ocr-fallback-1' or q->'decoded' is distinct from 'true'::jsonb
  or q->>'content_hash' is distinct from o.content_sha256 or q->>'mime' is null or q->>'mime' not in ('image/jpeg','image/png','image/webp') then return null;end if;
 foreach field in array array['original_width','original_height','bytes','laplacian_variance'] loop
  if jsonb_typeof(q->field) is distinct from 'number' then return null;end if;
 end loop;
 w:=(q->>'original_width')::int;h:=(q->>'original_height')::int;
 if (q->>'original_width')::numeric<>w or (q->>'original_height')::numeric<>h or w<800 or h<800 or w>20000 or h>20000 or w::bigint*h>12000000
  or (q->>'bytes')::numeric<1 or (q->>'bytes')::numeric>6000000 or (q->>'bytes')::numeric<>trunc((q->>'bytes')::numeric)
  or (q->>'laplacian_variance')::numeric<100 or (q->>'laplacian_variance')::numeric>1040400
  or not ((o.width=w and o.height=h) or (o.width=h and o.height=w)) then return null;end if;
 for d in select value from jsonb_array_elements(o.detections) loop
  if jsonb_typeof(d->'text') is distinct from 'string' or jsonb_typeof(d->'confidence') is distinct from 'number' or (d->>'confidence')::numeric not between 0 and 1
   or jsonb_typeof(d->'bbox') is distinct from 'array' or jsonb_array_length(d->'bbox')<>4 then return null;end if;
  for point in select value from jsonb_array_elements(d->'bbox') loop
   if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number'
    or (point->>0)::numeric not between 0 and o.width or (point->>1)::numeric not between 0 and o.height then return null;end if;
  end loop;
  if (select max((p->>0)::numeric)-min((p->>0)::numeric) from jsonb_array_elements(d->'bbox') p)<=0
   or (select max((p->>1)::numeric)-min((p->>1)::numeric) from jsonb_array_elements(d->'bbox') p)<=0 then return null;end if;
 end loop;
 foreach line in array string_to_array(o.raw_text,E'\n') loop
  if btrim(line,E' \t\r')<>'' and regexp_replace(line,'[\s.\[\]【】()「」『』〈〉《》:：·•–—-]','','g') !~* '^(program(me)?|프로그램|연주곡목?|곡목)$' and exists(select 1 from jsonb_array_elements(p_sections) s where s->>'classification'='PROGRAM' and s->>'reason'='EXPLICIT_PROGRAM_HEADING'
    and offset_start>=(s->>'start')::int and offset_start+length(line)<=(s->>'end')::int) then
   n:=n+1;indices:=indices||to_jsonb(idx);d:=o.detections->idx;
   if d->>'text'=line then matched:=matched+1;confidences:=array_append(confidences,(d->>'confidence')::double precision);end if;
  end if;
  offset_start:=offset_start+length(line)+1;idx:=idx+1;
 end loop;
 if n=0 or matched<3 then return null;end if;
 coverage:=matched::double precision/n;
 select percentile_cont(0.5) within group(order by x) into med from unnest(confidences) x;
 if coverage<0.8 or med<0.9 then return null;end if;
 return jsonb_build_object('rule','program-ocr-fallback-1','image_quality',q,'width',o.width,'height',o.height,
  'detections_hash',encode(sha256(convert_to(public.program_identity_canonical(o.detections),'UTF8')),'hex'),'program_lines',indices,'coverage',coverage,'median',med);
exception when others then return null;
end;$$;

create function public.confirm_concert_ocr_fallback_v1(p_expected jsonb,p_catalog_json text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.concert_program_analyses%rowtype;c public.concert_program_candidates%rowtype;k public.concerts%rowtype;i public.concert_program_images%rowtype;o public.concert_image_ocr_results%rowtype;
 prior public.concert_program_ocr_fallback_receipts%rowtype;cat jsonb:=p_catalog_json::jsonb;saved jsonb;snap jsonb;quality jsonb;ev jsonb;d jsonb;composer_pattern text;composer_ok boolean:=false;catalogue_ok boolean:=false;
 field text;ch text:=encode(sha256(convert_to(p_catalog_json,'UTF8')),'hex');wh text;eh text;rh text;at_time timestamptz;rid uuid;receipt uuid;note text;movement int;
begin
 if jsonb_typeof(p_expected) is distinct from 'object' or p_expected->>'rule' is distinct from 'program-ocr-fallback-1' then raise exception 'OCR_FALLBACK_INPUT_INVALID';end if;
 perform 1 from public.concert_program_version_policy where matcher_version='program-ocr-fallback-1' and enabled for share;
 if not found then raise exception 'OCR_FALLBACK_DISABLED';end if;
 perform 1 from public.concert_program_version_policy where matcher_version='stored-program-4' and enabled for share;
 if not found then raise exception 'OCR_FALLBACK_V4_DISABLED';end if;
 select * into a from public.concert_program_analyses where id=(p_expected->>'analysis_id')::uuid;
 select * into k from public.concerts where id=a.concert_id for update;
 select * into i from public.concert_program_images where id=a.image_id for update;
 select * into c from public.concert_program_candidates where id=(p_expected->>'candidate_id')::uuid for update;
 select * into o from public.concert_image_ocr_results where id=a.ocr_result_id;
 if k.id is null or i.id is null or c.id is null or c.analysis_id is distinct from a.id or a.matcher_version<>'stored-program-4' or not a.is_current
  or k.region<>'서울' or k.end_date<(clock_timestamp() at time zone 'Asia/Seoul')::date or k.start_date>((clock_timestamp() at time zone 'Asia/Seoul')::date+30) or k.start_date<>k.end_date or k.performance_status not in ('공연예정','공연중')
  or not i.is_active or i.image_type<>'DETAIL' or public.concert_program_evidence_issue(a.ocr_result_id,a.image_revision,a.concert_context,a.source_attempt_id,a.concert_revision) is not null
  or not public.program_candidate_snapshot_valid(c.id) or c.rematch_source_candidate_id is not null then raise exception 'OCR_FALLBACK_SOURCE_CHANGED';end if;
 if public.ocr_fallback_official_reason(k.kopis_detail_text,k.kopis_detail_text_hash) not in ('OFFICIAL_TEXT_ABSENT','OFFICIAL_PROGRAM_ABSENT','OFFICIAL_PROGRAM_EMPTY')
  or public.ocr_fallback_official_reason(k.kopis_detail_text,k.kopis_detail_text_hash) is distinct from p_expected->>'official_reason'
  or k.kopis_detail_text_hash is distinct from p_expected->>'official_text_hash' then raise exception 'OCR_FALLBACK_OFFICIAL_HOLD';end if;
 if p_expected->>'analysis_payload_hash' is distinct from a.payload_hash or p_expected->>'catalog_hash' is distinct from ch or a.catalog_hash is distinct from ch
  or p_expected->>'image_id' is distinct from i.id::text or p_expected->'image_revision' is distinct from to_jsonb(i.evidence_revision)
  or p_expected->'concert_revision' is distinct from to_jsonb(k.program_context_revision) or p_expected->>'ocr_id' is distinct from o.id::text
  or p_expected->>'attempt_id' is distinct from a.source_attempt_id::text or p_expected->>'content_hash' is distinct from o.content_sha256 then raise exception 'OCR_FALLBACK_EXPECTED_CHANGED';end if;
 quality:=public.ocr_fallback_quality(o.id,a.sections);
 if quality is null or quality is distinct from p_expected->'quality' or encode(sha256(convert_to(public.program_identity_canonical(quality),'UTF8')),'hex') is distinct from p_expected->>'quality_hash' then raise exception 'OCR_FALLBACK_QUALITY_FAILED';end if;
 select value into snap from jsonb_array_elements(a.snapshot->'candidates') where value->>'candidate_key'=c.candidate_key;
 if snap is null or snap->>'generation_version' is distinct from 'stored-program-4' or c.outcome<>'MATCHED' or c.relation<>'EXACT' or a.sections->c.section_index->>'reason' is distinct from 'EXPLICIT_PROGRAM_HEADING'
  or snap#>>'{scope,kind}' is distinct from 'EXACT' or c.identity->'arrangement_or_excerpt' is distinct from 'false'::jsonb
  or c.identity#>>'{composer_relation,status}' is distinct from 'SOURCE_IDENTIFIED' or c.identity#>>'{composer_relation,association}' is null
  or c.identity#>>'{composer_relation,association}' not in ('INLINE','BBOX_PAIRED_ROW','BBOX_BILINGUAL_BLOCK')
  or exists(select 1 from jsonb_array_elements_text(c.review_reasons) r where r not in ('COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'))
  or coalesce(snap#>'{matching,issues}','[]')<>'[]'::jsonb
  or exists(select 1 from jsonb_array_elements_text(coalesce(snap#>'{matching,arrangement_features}','[]')) f where f ~ 'hands:|pianos:2|style:|method:|arranger:|ensemble:(?!solo)')
  or exists(select 1 from public.concert_program_candidates x where x.analysis_id=a.id and x.id<>c.id and (x.track_id=c.track_id or x.work_id=c.work_id)) then raise exception 'OCR_FALLBACK_IDENTITY_AMBIGUOUS';end if;
 select catalog into saved from public.concert_program_catalogs where catalog_hash=a.catalog_hash;
 wh:=public.program_work_identity_hash(cat,c.work_id);
 if wh is null or wh is distinct from public.program_work_identity_hash(saved,c.work_id)
  or not exists(select 1 from jsonb_array_elements(cat->'targets') t where t->>'trackId'=c.track_id and t->>'workId'=c.work_id)
  or cat->'works'->c.work_id->>'composer' is distinct from c.identity->>'composer'
  or cat->'works'->c.work_id->>'arrangement'='true' or cat->'works'->c.work_id->>'excerpt'='true' then raise exception 'OCR_FALLBACK_CATALOG_CHANGED';end if;
 select replace(value->>1,E'\\b',E'\\y') into composer_pattern from jsonb_array_elements(cat->'composers') where value->>0=c.identity->>'composer';
 for ev in select value from jsonb_array_elements(c.evidence) loop
  d:=o.detections->((ev->>'line_index')::int);
  if d->>'text' is distinct from ev->>'quote' or d->'bbox' is distinct from ev->'bbox' or d->'confidence' is distinct from ev->'confidence'
   or (ev->>'confidence')::numeric<0.85 or (ev->>'start')::int<(a.sections->c.section_index->>'start')::int or (ev->>'end')::int>(a.sections->c.section_index->>'end')::int then raise exception 'OCR_FALLBACK_EVIDENCE_FAILED';end if;
  if ev->>'quote' ~* composer_pattern and (ev->>'confidence')::numeric>=0.9 and c.identity#>'{composer_relation,source_line_indices}' @> jsonb_build_array((ev->>'line_index')::int) then composer_ok:=true;end if;
  if ev->>'role'<>'COMPOSER' and ev->>'quote' ~* '\m(Op|BWV|KV|K|D|S|R|Hob)[.:]?\s*[0-9]+' and (ev->>'confidence')::numeric>=0.9 then catalogue_ok:=true;end if;
 end loop;
 if not composer_ok or not catalogue_ok then raise exception 'OCR_FALLBACK_EXPLICIT_IDENTITY_REQUIRED';end if;
 select (t->>'movementNumber')::int into movement from jsonb_array_elements(cat->'targets') t where t->>'trackId'=c.track_id;
 if movement is not null and (not (c.identity->'movement_numbers' @> jsonb_build_array(movement)) or not exists(select 1 from jsonb_array_elements(c.evidence) evidence_line where evidence_line->>'role'<>'COMPOSER' and evidence_line->>'quote' ~* '(악장|movement|mov\.|(^|[;:])[[:space:]]*[IVX]+[.)])')) then raise exception 'OCR_FALLBACK_EXPLICIT_MOVEMENT_REQUIRED';end if;
 -- Context conflicts/unknown scope are included in review_reasons by the v4 snapshot.
 rh:=encode(sha256(convert_to(public.program_identity_canonical(p_expected),'UTF8')),'hex');
 select * into prior from public.concert_program_ocr_fallback_receipts where candidate_id=c.id;
 if found then
  if prior.expected is distinct from p_expected or prior.expected_hash<>rh or not exists(select 1 from public.concert_program_candidate_status s where s.id=c.id and s.is_effectively_confirmed and s.confirmation_review_id=prior.review_id) then raise exception 'OCR_FALLBACK_RECEIPT_CHANGED';end if;
  return prior.id;
 end if;
 if c.review_status<>'REVIEW_REQUIRED' or exists(select 1 from public.concert_program_reviews where candidate_id=c.id)
  or exists(select 1 from public.concert_program_candidate_status s where s.concert_id=k.id and s.track_id=c.track_id and s.work_id=c.work_id and s.is_effectively_confirmed)
  or exists(select 1 from public.concert_program_text_confirmation_status s where s.concert_id=k.id and s.track_id=c.track_id and s.work_id=c.work_id and s.is_effectively_confirmed) then raise exception 'OCR_FALLBACK_ALREADY_REVIEWED_OR_LINKED';end if;
 at_time:=clock_timestamp();note:='program-ocr-fallback-1:'||rh;eh:=public.program_confirmation_evidence_hash(c.id);
 insert into public.concert_program_reviews(candidate_id,status,note,reviewer_kind,reviewed_at,work_identity_hash,work_identity_snapshot,identity_source,identity_attested_at,confirmed_evidence_hash,confirmed_matcher_version,confirmed_pipeline_version)
 values(c.id,'CONFIRMED',note,'AUTOMATIC_PROGRAM_RULE',at_time,wh,public.program_work_identity(cat,c.work_id),'AUTOMATIC_PROGRAM_RULE',at_time,eh,a.matcher_version,o.pipeline_version) returning id into rid;
 update public.concert_program_candidates set review_status='CONFIRMED',review_note=note,reviewed_at=at_time,updated_at=at_time where id=c.id;
 insert into public.concert_program_ocr_fallback_receipts(candidate_id,review_id,rule,expected,expected_hash) values(c.id,rid,'program-ocr-fallback-1',p_expected,rh) returning id into receipt;
 return receipt;
end;$$;
revoke all on function public.ocr_fallback_official_reason(text,text),public.ocr_fallback_quality(uuid,jsonb),public.confirm_concert_ocr_fallback_v1(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.ocr_fallback_official_reason(text,text),public.ocr_fallback_quality(uuid,jsonb),public.confirm_concert_ocr_fallback_v1(jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
