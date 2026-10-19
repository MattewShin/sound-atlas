# stored-program-3 준비 및 canary 계획

2026-10-19 검증 기록입니다. **운영 저장·예약 변경·SQL 적용을 실행하지 않았습니다.**

## 버전·키·hash

분석 버전과 matcher 버전은 분리되어 있지 않습니다. `server/programAnalysis.mjs`의 `MATCHER_VERSION=stored-program-3`이 헤더 인식, 물리 블록, 논리 작품, 정규화와 매칭을 함께 식별합니다. catalog 데이터/hash는 유지했습니다.

- 분석 payload의 `matcher_version`, 후보의 `generation_version`, 실행 보고서·진행 로그·CLI 출력에 같은 상수를 사용합니다. 후보의 `logical_work_id`도 별도로 보존합니다.
- 로컬 체크포인트 키는 `programAnalysisCacheKey`가 OCR ID, 성공 시도 ID, 이미지 revision, 공연 revision/context, matcher 버전, catalog hash를 해시합니다. v2 키·재시도·체크포인트는 지우지 않습니다. `sameAnalysis`도 버전을 비교하므로 v2를 v3 완료로 재사용하지 않습니다.
- DB unique key는 `(ocr_result_id, matcher_version, catalog_hash, image_revision, concert_revision, concert_context, source_attempt_id)`입니다. 후보의 unique key는 `(analysis_id,candidate_key)`이므로 버전별 후보가 공존합니다.
- `payload_hash`는 hash 필드 자체를 제외한 전체 분석 payload의 SHA-256입니다. RPC는 catalog JSON의 hash와 동일 키의 기존 payload hash를 검사합니다. v3 RPC는 전체 snapshot JSON도 비교하여 이전 hash를 붙인 변경 payload도 거부합니다.
- PowerShell launch 영수증은 Node의 `analysis_version` 이벤트에서 실제 import된 버전을 읽습니다. 예약 인자에 별도 버전 문자열을 복제하지 않습니다. 강제 종료로 최종 영수증 갱신이 불가능하면 stdout 이벤트와 실행 보고서가 근거입니다.

## SQL 초안이 필요한 이유

기존 RPC/unique key는 새 문자열을 허용하지만, 저장 시 이전 버전의 `is_current`를 false로 바꿉니다. 또한 `logical_works`, `grouping`, 매칭 전용 근거와 catalog 부모 연결 등 새 payload 필드를 저장하지 않습니다. 따라서 문자열 변경만으로 운영 저장하지 않습니다.

[미실행 SQL 초안](sql/PROGRAM_ANALYSIS_V3_DRAFT.sql)은 자동 migration 디렉터리 밖에 있습니다. 기존 202610140001·202610140002·202610150001 스키마 이후 적용하는 초안입니다.

1. 분석에 nullable `snapshot` JSONB를 추가해 v3 전체 payload를 보존합니다. 기존 v2 payload·후보·검토·현재 플래그·시각은 갱신하지 않습니다.
2. 현재 분석의 unique index를 **이미지+버전당 현재 분석**으로 변경합니다. 새 snapshot은 같은 버전의 이전 현재 플래그만 변경합니다.
3. 후보 상태 view는 활성 버전들 중 이미지의 가장 최근 snapshot을 조회 시 선택합니다. v2 레코드는 그대로 두고 superseded 여부만 계산합니다. 빈 후보의 새 snapshot도 이전 후보를 supersede합니다.
4. `save_concert_program_analysis_v3`는 full snapshot, 논리 작품당 후보 하나·catalog 판정 최대 하나, generation 버전, idempotency와 기존 증거 검증을 보호합니다. 실패 시 한 이미지 transaction 전체가 롤백됩니다.
5. `concert_program_version_policy`로 특정 버전을 제외할 수 있습니다. 정책 행이 없으면 허용합니다. 검토 RPC도 계산된 현재 상태를 검사합니다. RLS와 service-role 접근 범위를 유지합니다.

코드는 v3 전용 RPC만 호출하며 legacy RPC로 fallback하지 않습니다. RPC가 없으면 예약 배치는 **수집·이미지 다운로드·Python/OCR 전에 preflight에서 `PROGRAM_ANALYSIS_V3_MIGRATION_REQUIRED`로 중단**합니다. 제외 정책이 있으면 `PROGRAM_ANALYSIS_VERSION_DISABLED`로 중단합니다. 읽기 전용 plan에는 `matcher_version`, `analysis_schema_ready`, `analysis_version_enabled`가 표시됩니다. 운영 DB에는 아직 전용 RPC가 없는 것을 GET 메타데이터로 확인했습니다.

## 정확한 17건과 dry-run 결과

[고정 manifest](PROGRAM_ANALYSIS_INITIAL_CANARY.json)의 OCR UUID 17개는 실행 `f8930c00-a841-4433-b1da-f54740dca99b` 로컬 기록의 `priority_selection.analysis` 및 이전 진단 대상과 정확히 같은 집합입니다. 각 source 분석 UUID가 해당 OCR과 `stored-program-2`에 연결되는지 DB GET으로 확인했습니다. 정렬된 OCR UUID 집합 hash는 `491a8f99d14b8d43f6a958df53c7a52e173a8c24fb8161e31828a225bfca1e1f`입니다.

| 항목 | DB에 저장된 v2 | v3 메모리 재생 |
|---|---:|---:|
| 분석/OCR | 17 | 성공 17 / 실패 0 / 제외 0 |
| 물리적 작품 진입 행 | UNKNOWN | 71 |
| 논리 작품 | UNKNOWN | 62 |
| 후보 레코드 | 50 | 62 |
| catalog 연결 후보 | 0 | 3 |
| 고유 catalog ID | 0 | 2 |
| REVIEW_REQUIRED | 50 | 62 |
| 후보가 0개인 OCR | 7 | 6 |

v2는 물리 행/논리 작품 집계를 저장하지 않았으므로 후보 50개를 논리 작품 50개로 간주하지 않습니다. 앞선 개선 코드의 메모리 결과 71/62/3/2와 이번 결과는 같습니다. 버전 변경 자체가 매칭 결과를 더 바꾸지는 않았습니다. 전 대상의 입력 불변, 반복 결과 결정성, 원문 인용의 Unicode 위치 일치, hash 유효성, 버전별 키 분리를 검증했습니다.

실제 저장 v2와 후보 수가 달라진 공연은 PF295548 **0→15**, PF301750 **11→5**, PF291310 **3→6**입니다. 다른 14건은 후보 수가 같습니다. 연결은 PF295548 두 후보와 PF300523 한 후보입니다. ID는 `chopin-ballade-op52-no4`, `liszt-liebestraum-s541-no3` 두 개이며 자동 확정하지 않습니다. [공연별 수치와 검증 JSON](PROGRAM_ANALYSIS_V3_DRY_RUN_2026-10-19.json)을 참고하세요.

현재 v3 분석·후보는 각각 0개입니다. 근거가 유지되고 저장이 모두 성공하면 **새 분석 17개, 새 후보 62개, 새 검토 이벤트 0개**가 예상됩니다. 후보가 없는 OCR 6개에도 재사용 가능한 분석 레코드가 생성됩니다. 동일 키 재실행 시 추가 행은 0개입니다. `saved`/`save_receipt.successful_calls`는 저장 또는 재사용이 성공한 호출 수이며 신규 행 수가 아닙니다. snapshots의 행 수와 UUID로 신규 생성을 구분합니다.

## 명령 — 저장 명령은 실행하지 않았음

프로젝트 루트 PowerShell에서 사용합니다. dry-run은 SQL 초안 없이도 동작합니다.

```powershell
npm.cmd run program:analyze -- analyze --dry-run --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
```

사용자가 SQL 초안·검색 영향·버전 전환을 검토하고 별도 운영 적용을 결정한 뒤에만 다음 저장 명령을 사용합니다.

```powershell
npm.cmd run program:analyze -- analyze --save --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
```

manifest의 OCR만 대상으로 하며 전체 공연 탐색이나 다른 OCR로 대체하지 않습니다. source 분석 누락, 이미지 비활성, OCR 교체/새 실패가 있으면 해당 UUID를 제외하고 사유와 종료 코드 1을 반환합니다. 다른 적격 대상은 계속 처리합니다. 같은 명령으로 재시도하면 성공했던 동일 키는 재사용됩니다. 종료 공연 cleanup으로 근거가 삭제되면 당초 17개 모두를 저장할 수 없습니다.

저장 전후 조회에는 다음 읽기 전용 명령을 사용합니다. v3 snapshots는 적용 전에도 분석 테이블을 GET하므로 현재 0개를 확인할 수 있습니다.

```powershell
npm.cmd run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json --version stored-program-3
npm.cmd run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json --version stored-program-2
npm.cmd run program:analyze -- list --version stored-program-3
npm.cmd run program:analyze -- show <위 결과의 candidate_id>
```

snapshots에서 `analysis_records=17`, `candidate_records=62`, summary 연결=3·고유 ID=2·검토=62·빈 OCR=6, `snapshot_available=true`를 확인합니다. 동일 저장 명령 재실행 시 분석 UUID와 행 수가 유지되어야 합니다. 여러 revision/시도가 있으면 OCR 수와 분석 레코드 수는 다를 수 있습니다. `stored_is_current`는 버전 내부 플래그, `effective_is_current`는 다른 버전/정책도 반영한 view의 상태입니다. 후보가 없는 분석은 후보 view에 행이 없어 effective 값이 null(조회로 미확정)입니다. v2 snapshots로 이전 UUID·후보·검토 보존도 확인합니다.

## 검토·검색·예약·제외

기본 후보 목록은 로컬 코드의 v3 + 현재 catalog hash + 계산된 현재 분석 + REVIEW_REQUIRED만 조회합니다. v2 후보 UUID의 show는 계속 가능하며 `local_version_current=false`가 표시됩니다. 과거 대기 목록은 `list --version stored-program-2 --include-inactive`로 읽을 수 있습니다. 이 옵션은 쓰기 버전을 바꾸지 않습니다. v2 확정·반려와 검토 이력을 v3로 복사하지 않습니다.

검색 경로도 현재 matcher 버전을 사용하고 유효한 수동 CONFIRMED만 검색합니다. **새 코드 배포/서버 재시작 시 v2 확정 결과가 새 코드의 검색에서 제외될 수 있습니다.** canary 저장만으로 검색 가능한 공연이 증가하지 않습니다. 부모 catalog ID만 있는 후보를 임의 악장 track_id로 확정하지 않습니다.

예약 인자에 matcher 버전은 고정되어 있지 않습니다. 등록된 프로젝트의 Node 진입점이 현재 모듈을 import합니다. 새 코드 사용 + v3 SQL/RPC 준비 + 제외 정책 없음 + 최신/활성 OCR 근거가 조건입니다. 조건이 갖춰지면 다음 실제 예약은 v2를 v3 완료로 재사용하지 않고 기존 상한·우선순위 내에서 새 버전을 저장합니다. **canary 밖의 대상도 선택될 수 있으므로 SQL 적용·수동 canary·검토·예약 활성 시점을 먼저 결정**해야 합니다. 이번에는 예약을 바꾸거나 실행하지 않았습니다.

문제 발생 시 사용할 미실행 제외 SQL 예시입니다. v3나 v2 분석을 삭제/갱신하지 않고 정책 행만 바꿉니다.

```sql
insert into public.concert_program_version_policy(matcher_version,enabled,note)
values ('stored-program-3',false,'Exclude v3 pending canary review')
on conflict(matcher_version) do update set enabled=excluded.enabled,note=excluded.note;
```

v3는 계산된 현재 분석과 새 저장/배치에서 제외됩니다. 여전히 증거가 유효한 v2는 DB view의 현재 선택으로 돌아올 수 있습니다. **v3를 필터링하는 새 클라이언트가 v2로 자동 fallback하는 것은 아닙니다.** 검색 복구에는 실제 v2 구현을 가진 이전 배포본도 복구해야 합니다. 새 파서의 문자열만 v2로 낮춰 저장하면 안 됩니다. 재허용은 사용자 결정 후 정책 enabled를 true로 바꾸는 별도 운영 작업입니다.

## 검증·미실행 사항

관련 테스트 **71개**, 전체 테스트 **280개**, 프로덕션 빌드, `git diff --check` 모두 통과했습니다. 로컬 PGlite 테스트는 v2 행/후보/검토/시각 불변, v3 full snapshot, 동일 UUID 재사용, hash/전체 JSON 충돌, 부분 실패 롤백·재시도, 빈 후보 저장, catalog 최대 하나, v2 show, 예약/영수증 버전과 missing/disabled v3 차단을 검증했습니다. SQL 초안과 fixture는 로컬 테스트 DB에만 적용했습니다.

운영 반영 전 SQL 초안 적용 승인, v3 검색/검토 전환과 수동 확정 범위, canary 후 예약 전환 시점, 제외 시 이전 배포본 복구 경로를 결정해야 합니다. 실제 Supabase 적용·저장 canary·예약 실행·운영 검색 검증은 하지 않았습니다. catalog·OCR 엔진·수집량·예약 인자는 변경하지 않았습니다.

운영 요청은 **DB GET 10회**입니다. 운영 DB 쓰기, 저장 재분석/후보 생성, OCR, 실제 배치, KOPIS·이미지 요청, 예약 변경, 운영 SQL 적용은 모두 **0회**입니다. 진단용 임시 OCR 입력·전체 결과·스크립트 등 8개 파일은 검증 후 삭제했습니다. UUID manifest와 원문을 포함하지 않는 검증 수치 JSON, 로컬 테스트/빌드 로그는 남겼습니다.
