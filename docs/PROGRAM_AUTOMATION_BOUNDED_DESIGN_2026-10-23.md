# Bounded 자동화 완료 RPC — 설계·격리 검증용 초안

- 작업: CA-AUTO-20261022-001 / 명세2 CHANGES_REQUESTED 후속.
- 검토 기준: `1bfd7ba6367731c40637e64e038f78d4cb871737`.
- **운영 적용·후보 재처리·예약 강제 실행은 승인되지 않았다.** 이 문서와 SQL/클라이언트는 설계 및 합성 DB 검증용이다. 현재 root의 skip guard와 예약 action은 바꾸지 않았다.
- 기존 묶음4의 직접26+과거38=64행 초과 이력은 유지한다. 기존 유효5연결과 receipt를 롤백하지 않는다. 기존 `202610220001_program_automation.sql`도 수정·재실행하지 않는다.

## 영향 집합과 원자성

`COMPLETE` 계획은 fresh 분석 후보 중 아직 해당 입력의 결정을 마치지 않은 집합 D와, 같은 이미지·stored-program-3의 다른 분석에 남은 REVIEW_REQUIRED 집합 H를 합친다. 현재 분석을 새로 저장하면 이전 current 분석도 H에 포함한다. 후보 ID 또는 새 후보의 고유 key로 중복을 제거하며 한 묶음은 이미지3개, |D|+|H|≤30이어야 한다. CONFIRMED와 이미 거절된 과거 receipt는 H에 포함하지 않는다. 분석·예산·receipt metadata 행을 후보 수와 섞지 않는다.

새 `plan_automatic_program_batch_bounded`는 READ ONLY에서 실행 가능한 STABLE 함수다. 전체 영향 수·정확한 과거 ID·source hash·예산·plan hash를 반환한다. 원문 OCR은 반환하지 않는다. source hash에는 공연, 전체 이미지/OCR/시도, 대상 이미지의 분석과 후보 행을 넣으므로 같은 수의 후보 교체도 계획을 무효화한다.

새 `complete_automatic_program_batch_bounded` 한 번이 분석 저장, 기존 검증 규칙의 직접 결정, **명시적으로 계획된 과거 ID만** 정리, current 분석 완료, 누적 예산 debit, idempotency 기록을 한 트랜잭션으로 처리한다. 기존 무제한 finish RPC를 호출하지 않는다. 중간 SQL 오류나 불완전 결정은 예외를 그대로 전파해 분석/receipt/과거 정리/예산을 모두 롤백한다. 예외를 잡고 부분 성공을 반환하지 않는다.

`operation_required=false`인 계획은 클라이언트가 완료 POST를 보내지 않는다. 응답 손실로 같은 request ID를 재전송해도 같은 내용이면 DB 기록을 추가하지 않고 이전 결과를 반환한다. 다른 내용을 같은 request ID에 재사용하면 거부한다. 기존 receipt의 identity·note를 수정하지 않으며 기존 유효 확정 중복 처리는 기존 decide 함수의 검증을 그대로 사용한다.

## 경합 아래 DB 상한

완료 RPC는 READ COMMITTED만 허용한다. 관련 source/analysis/candidate/review/catalog/policy/예산 테이블에 **EXCLUSIVE NOWAIT**를 먼저 획득한 뒤, 별도 SQL 문으로 계획을 다시 계산한다. VOLATILE 완료 함수 내부의 이 SQL은 잠금 후 새 snapshot을 사용한다. 전달된 plan hash 및 3/30·실행 예산을 확인하는 지점까지 INSERT/UPDATE는 없다.

- 다른 writer 또는 SELECT FOR UPDATE 보유자가 먼저 있으면 55P03으로 DML 전에 실패한다.
- 사전 계획 이후 writer가 이미 commit했다면 잠금 아래 새 집합/hash가 달라져 무쓰기 실패한다.
- 잠금 뒤에는 직접 SQL·기존 writer도 candidate phantom INSERT/UPDATE를 할 수 없다. 잠금은 commit/rollback까지 유지된다.
- 마지막 실제 직접/과거 row count와 계획의 일치도 검사하며 다르면 전부 롤백한다.

이는 **테이블 전체 쓰기를 짧게 직렬화하는 보수적 1차안**이다. 일반 SELECT는 허용하지만 다른 공연의 수집·OCR 쓰기도 기다릴 수 있고, 이미 writer가 있으면 자동화가 즉시 실패한다. RPC 안에 다운로드/OCR/외부 HTTP는 없다. 운영 지연·동시성 검토 없이 배포할 최종안으로 간주하지 않는다. 더 세밀한 잠금은 모든 legacy/direct writer의 잠금 규약 또는 강제 trigger까지 함께 설계해야 phantom 보장을 유지할 수 있다.

보장 범위는 이 bounded RPC의 후보 상태 변경이다. 관리자 직접 SQL과 기존 service-role의 광범위한 테이블 관리 권한까지 제한하는 보안 경계라고 주장하지 않는다.

## 64행 이미지의 처리 경로 제안

COMPLETE64를 한 번에 허용하거나 history를 계산에서 빼지 않는다. 별도 운영 승인된 run의 `allow_history_only=true`일 때만 명시적 HISTORY_ONLY 요청을 받을 수 있다. 기본값은 false이며 자동 fallback은 없다.

이 모드는 **fresh current 분석이 이미 존재할 때만**, 명시적으로 지정한 과거 미검토 ID≤30을 정리한다. 현재 후보 결정·receipt 생성·분석 저장·current 완료 checkpoint를 하지 않는다. 반환값도 HISTORY_RETIRED이며 COMPLETED가 아니다. 예를 들어 과거38을30/8로 먼저 정리한 뒤 COMPLETE26을 실행하면 각 묶음30 이하, 합계64행으로 진행할 수 있다. 각 단위는 원자적이고 중간 실패로 그 단위의 일부가 남지 않는다. 전체 작업이 끝났다는 표시는 마지막 COMPLETE 성공 후에만 생긴다.

fresh current 분석이 없는 큰 이미지에는 HISTORY_ONLY가 분석을 몰래 선저장하지 않는다. 향후 명세에서 기존 일반 분석 단계가 current 분석을 준비하는 시점·상한을 함께 승인해야 한다. 이번에는 운영 준비나 과거 정리를 실행하지 않았다.

## 실행 예산·권한·전환 조건

새 run table은 승인된 실행의 서로 다른 이미지 ID≤20와 누적 후보 영향≤100을 DB에 저장한다. 재전송/no-op은 재차 debit하지 않는다. HISTORY_ONLY와 COMPLETE는 같은 run을 사용하므로 과거 정리38도 누적 예산에 포함된다. 같은 이미지를 여러 단계로 처리할 때 이미지 예산은 고유 ID 기준이고 후보 영향은 모든 단계 합계다. 이 계산 방식과 정기 실행의 run 발급 정책은 다음 명세에서 검토해야 한다.

API service_role은 run/감사 table에 SELECT만 가지며 예산을 직접 만들거나 늘리지 못한다. migration은 승인 run을 하나도 생성하지 않는다. 새 완료 함수는 고정된 migration owner의 SECURITY DEFINER/search_path=''로 실행되고 anon/authenticated에는 EXECUTE가 없다. 기존 자동 decide/finish/defer의 service_role EXECUTE는 초안에서 회수해 기존 경로를 계속 호출할 수 없게 한다. 기존 수동 identity 검토 권한은 그대로다.

따라서 **SQL만 먼저 운영에 적용하면 기존 자동화 preflight/호출이 실패할 수 있다.** 다음 명세에서 새 client·schema/preflight·승인 run 발급·관측·롤백 범위를 묶어 전환해야 한다. 현재 정기 skip guard는 유지하며 새 prototype은 production runner에서 import하지 않는다.

## 파일과 검증 범위

- `supabase/drafts/202610230001_program_automation_bounded.sql`: transaction 단위 후보 migration. 자동 적용 migrations 폴더에 넣지 않았다.
- `supabase/diagnostics/20261023_program_automation_bounded.sql`: READ ONLY schema/signature/owner/권한 확인. 실제 운영에서는 실행하지 않았다.
- `server/boundedProgramBatch.mjs`: 합산 영향으로 whole-image를 선택하고 단일 완료 호출만 하는 미연결 prototype.
- `server/testSupport/boundedProgramFixture.mjs`, `boundedProgramCases.mjs`: 합성 데이터와 공통 DB 회귀.
- `server/boundedProgramBatch*.test.mjs`: PGlite 및 클라이언트 회귀. fixture에는 운영 OCR·접속 정보가 없다.
- `scripts/testProgramAutomationBoundedPostgres.mjs`: 실제 로컬 PostgreSQL 두 세션 검증. .env/운영 URL을 읽지 않는다. 명시적127.0.0.1/`bounded_test` 계정과 cwd의 .cache data directory만 허용하고 서버의 data_directory를 대조한다.

READ ONLY planner/진단,64행 사전 거부,경합 성장,원자적 rollback,수동 receipt 보존,동일 입력 완료 호출0,실행 예산,권한 및 migration 후반 실패 시 DDL/권한 rollback을 격리 검증한다. PGlite는 실제 동시 세션을 제공하지 않으므로 lock 경합은 별도 PostgreSQL18.4에서 검증한다. 실제 PostgREST 배포·API 인증·운영 부하 테스트는 이번 결과가 아니다.

재현 시 repository root에서 기존 tests를 실행하고, 실제 경합 검증에는 별도로 만든 .cache 전용 PostgreSQL을 사용한다. 예시 configuration은 다음 네 항목만 허용한다.

```json
{"host":"127.0.0.1","port":15439,"user":"bounded_test","database":"postgres"}
```

`pg@8.16.3` driver는 `npm install --prefix .cache/bounded-test-tools --ignore-scripts --no-audit --no-fund pg@8.16.3`처럼 격리 설치할 수 있다. PostgreSQL은 별도 test data directory를 initdb하고127.0.0.1에만 bind한다. 실제 사용한 바이너리는 `@embedded-postgres/windows-x64@18.4.0-beta.17`이며 binary/data는 커밋하지 않는다.

```powershell
node scripts/testProgramAutomationBoundedPostgres.mjs --config=.cache/bounded-test-tools/local.json --driver=.cache/bounded-test-tools/node_modules/pg --data-dir=.cache/bounded-test-tools/data --output=.cache/bounded-test-tools/results.json
```

검증 후 해당 test cluster만 정상 종료한다. production URL 또는 .env를 이 명령에 전달하지 않는다. 실제 실행 횟수·종료·스케줄러 관측은 HANDOFF와 동반 JSON에 기록한다.

## 설계 근거

잠금 호환성과 NOWAIT 동작은 [PostgreSQL LOCK](https://www.postgresql.org/docs/current/sql-lock.html), snapshot 차이는 [Function Volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html)를 기준으로 했다. PostgREST의 GET/함수 transaction access mode는 [공식 transactions 문서](https://postgrest.org/en/stable/references/transactions.html)를 참고했다. 이 버전의 실제 PostgREST 노출 여부는 아직 격리 서버에서 검증하지 않았다. PGlite 동시성 제한은 [공식 socket 문서](https://pglite.dev/docs/pglite-socket), 테스트 바이너리 출처는 [embedded-postgres upstream](https://github.com/leinelissen/embedded-postgres)에 기록돼 있다.
