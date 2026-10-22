# 운영 선행 조건과 적용 준비 — 2026-10-22

CA-SEARCH-20261022-001의 조사 산출물이다. 아래 운영 변경 명령은 준비만 했으며 이번 작업에서 실행하지 않았다. 코드 기준은 `ad5ab3cf5984146c4b2dc94428a146944af23fab`다.

## 현재 확인

service-role REST OpenAPI와 테이블/view GET은 성공했다. `save_concert_program_analysis_v3(p_analysis jsonb,p_catalog_json text)`, identity 검토와 rematch의 노출 signature는 JSON에 기록했다. 검색 view의 identity/현재성 필드는 조회됐다. 자동화 5 RPC와 신규 column은 해당 API에 노출되지 않는다. 함수 미생성과 권한/스키마 캐시 비노출을 직접 SQL로 구별하지 못했으므로 원격 내부 상태를 단정하지 않는다.

daily는 현재 로컬 작업 트리를 실행하고 그 코드는 위 RPC를 요구한다. 운영 전제 미충족 시 Python·수집 이전 preflight에서 종료한다. 다음 2026-10-23 08:40 성공을 보장하지 않는다. 예약을 끄거나 예외로 우회하지 않았다.

## 준비된 선행 순서

1. DB 관리자 읽기 연결에서 아래 조사 SQL로 함수 signature와 서비스 role 권한을 확인한다. 기존 v3 및 `202610210001_program_work_identity.sql`의 선행 조건을 확인한다. 함수가 존재해도 RPC에서 비노출이면 권한/schema cache 원인을 구별한 뒤 처리한다. 존재 여부를 무시하고 non-idempotent migration을 재실행하지 않는다.
2. 새 적용이 필요한 것으로 확인되고 별도 운영 지시가 주어진 범위에서만 `supabase/migrations/202610220001_program_automation.sql` **전체를 한 트랜잭션으로** 실행한다. 이미 적용한 과거 migration/draft 전체를 일괄 재적용하지 않는다.
3. OpenAPI의 decide/queue/input_hash/finish/defer, 파라미터·타입·service_role 권한과 auto_* / evidence_changed_at column을 다시 읽는다. anon/authenticated에 실행 권한이 없어야 한다. 검색 view의 필드와 현재 identity receipt 보존도 확인한다.
4. `npm.cmd run pipeline -- plan --profile daily`, `npm.cmd run program:auto -- --dry-run --kopis-id PF295548 --limit 20`으로 읽기 계획과 같은 규칙의 판정을 확인한다. 원격 쓰기 0을 확인하고 이전 기록과 현재 상태를 구분한다.
5. 별도 운영 쓰기 지시가 있는 경우만 `npm.cmd run program:auto -- --save --kopis-id PF295548 --limit 20`의 제한 실행을 고려한다. receipt/중복/미연결 사유/검색을 확인하고 dry-run 및 같은 입력 재실행의 새 쓰기 0을 확인한다. 실제 자동 판정에 포스터별 사람 승인을 새로 요구하지 않는다. 이번 작업에서는 이 단계에 진입하지 않았다.
6. 다음 예약의 실제 보고서에서 사전 검사, 수집·OCR·분석·자동화 결과와 부분 실패를 나누어 확인한다. 다음 날 실행을 이번 조사 완료 조건으로 삼지 않는다.

관리자 환경용 준비 명령(현재 연결 문자열은 확인·출력하지 않음):

```powershell
psql "$env:CLASSIC_ATLAS_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/202610220001_program_automation.sql
```

현재 API가 제공하지 않는 부분을 위한 **읽기 전용 SQL**:

```sql
select p.oid::regprocedure::text as signature,
       pg_get_function_result(p.oid) as result_type,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'save_concert_program_analysis_v3','review_concert_program_candidate_identity',
 'save_concert_program_rematch','queue_automatic_programs','program_auto_input_hash',
 'decide_automatic_program_candidate','finish_automatic_program','defer_automatic_program')
order by p.proname,signature;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in (
 'concert_program_images','concert_program_analyses','concert_program_candidates',
 'concert_program_candidate_status')
order by table_name,ordinal_position;
```

## 실패 시 대응

migration 파일은 begin/commit을 포함한다. SQL 오류 시 트랜잭션이 rollback된 것을 확인하고 누락된 선행 schema·정확한 오류를 먼저 기록한다. 이미 성공한 migration은 add column/create function 때문에 중복 실행하지 않는다. 적용 후 제한 사례가 실패하면 추가 확정 쓰기를 진행하지 않고 current fingerprint·identity·권한·view 차이를 조사한다. 기존 receipt를 삭제하거나 과거 catalog를 덮어 복구하지 않는다. 운영 rollback/예약 변경/배포는 영향 범위와 별도 지시에 따라 다루며 이번 조사에서 수행하지 않았다.
