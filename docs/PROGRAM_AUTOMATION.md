# 공연–곡 연결 자동 운영 (2026-10-22)

구현과 격리 DB 검증을 완료했다. **원격 migration·자동 처리 저장·웹 서버 배포는 아직 하지 않았다.** 원격에는 새 RPC가 없으며, 현재 확인된 자격증명은 Supabase 데이터 API용이다. SQL 실행용 DB 연결이나 관리 API 자격증명은 확인되지 않았다. 아래 적용 절차를 마쳐야 다음 예약 실행이 자동 확정까지 진행한다. 새 migration 없이 수정된 배치를 실행하면 쓰기 전 preflight에서 `PROGRAM_AUTOMATION_MIGRATION_REQUIRED`로 종료한다.

## 1. 기존 정책과 호출 경로

`runConcertPipeline` → 수집 `sync_kopis_concert` → `runEasyOcrBatch` / `record_concert_image_ocr` → `analyzeStoredProgram` → `matchNormalizedProgramWork` → `save_concert_program_analysis_v3` → 후보 저장. 기존에는 여기서 끝나고 보고서가 `show`/수동 검토 목록을 만들었다. 별도 CLI `confirm` → `review_concert_program_candidate_identity`가 확인 영수증을 만들어야 공개 검색에 들어갔다.

| 기존 용어 | 실제 의미 |
|---|---|
| `MATCHED` | 정규화된 여러 언어 표기의 작곡가·작품 정보 제약을 모두 통과한 작품이 하나. 연주 구간·공연 맥락·원본 유효성을 보장하는 상태가 아니다. |
| `EXACT` | 위 작품에서 요청 범위에 대응하는 카탈로그 target이 하나이며 편곡/복수 악장 등의 별도 관계로 분류되지 않음. **원문 문자열의 완전 일치도, 사람/시스템의 근거 검증 완료도 아니다.** 등록 악장이 하나뿐인 작품도 전체 작품 기재만으로 이 관계가 나올 수 있었다. |
| `NEW_UNIQUE_MATCH` | 운영 테이블의 상태/제약이나 저장 RPC 분기가 아니다. 기존 진단의 신규 고유 연결 분류이며 확정 근거가 아니다. |
| `DUPLICATE_EFFECTIVE_CONFIRMATION` | 기존 진단의 유효 확정 중복 분류. 이번에는 원자적 자동 저장 RPC의 결과 코드로도 사용한다. |
| `REVIEW_REQUIRED` | 초기 수동 검증 정책. 분석 결과 생성기와 저장 RPC가 모든 신규 후보에 강제했다. 모호성 때문에만 부여된 상태가 아니었다. |
| stale | 이미지 활성/종류/revision, 공연 context/revision, OCR 결과·시도·순서, 분석 버전/current, 영수증의 근거 fingerprint 등이 달라짐. |
| identity 불일치 | 현재 작품/target의 식별 hash와 영수증 hash 불일치, 또는 후보와 불변 분석 snapshot·원문 인용 불일치. 전체 catalog hash 차이와는 다르다. |

검색은 `concert_program_candidate_status`의 현재·유효 `CONFIRMED + EXACT + MATCHED`와 영수증을 요구한다. `supabaseConcertSearch`가 현재 곡 식별 hash, matcher/OCR pipeline, 공연 날짜·상태·지역을 다시 검사하고 공개 필드만 반환한다. 전체 catalog hash가 바뀌었다는 이유만으로 같은 작품의 유효 영수증을 버리지는 않는다.

사람 검토가 필요했던 첫 이유는 **명시적으로 강제한 초기 정책과 자동 확정 구현의 부재**다. 실제 데이터에는 OCR 번호 오류, 불명확한 악장/편곡, 카탈로그 미등록, 프로그램 구간 부재도 있다. 이들은 이번 정책에서도 임의 확정하지 않는다.

## 2. 구현한 규칙

분석·후보 생성 알고리즘 `stored-program-3`과 불변 snapshot은 유지하고, 독립된 판정 정책 `program-auto-1`을 추가했다. 기존 분석 payload를 변조하거나 의미가 달라진 payload를 같은 분석 키로 덮어쓰지 않는다.

1. 현재 성공한 저장 OCR을 사용해 프로그램을 다시 파싱한다. 인용문의 Unicode code-point 범위·본문, 명시적 PROGRAM 구간, 공연 날짜·회차·장소를 검사한다.
2. 기존 정규화 matcher로 한글/영문 variant, 작곡가 변형, 별칭, 작품/카탈로그 번호, 작품 내 번호, 조성, 악장, 편곡/악기 편성을 다시 대조한다. 결정적 충돌은 하나의 읽기 쉬운 표기로 덮어쓰지 않는다. 모든 필드를 필수로 요구하지 않는다. 작곡가 + 작품번호 + 유형/별칭 + 필요한 항목 번호처럼 고유 작품을 식별하는 조합을 쓴다.
3. 유일한 `EXACT + MATCHED` target이라도 **target이 악장이면 그 악장의 명시적 번호가 있어야 한다.** 전체 작품에서 모든 악장을 펼치지 않고, 악장을 전체 작품 target으로 확대하지 않는다. 편곡/발췌를 확정할 정보가 부족하면 미연결이다.
4. 구분되지 않은 복수 후보, 번호 충돌, 프로그램 증거 부재, 미등록 곡 등은 `REJECTED`로 자동 완료한다. `auto_outcome=AUTO_UNLINKED`, 사유 배열을 저장한다. 관리자 대기열이 아니다.
5. 자동 확정은 기존 형식의 식별 snapshot/hash·OCR pipeline·근거 fingerprint를 갖춘 **새 자동 영수증**을 append한다. actor/identity source는 `AUTOMATIC_PROGRAM_RULE`다. 모델 확률·OCR confidence만으로 확정하지 않는다.

추가 확인은 현재 있는 저장 원문·좌표·한영 variant 재해석이다. 동일 OCR 재파싱은 독립 관측으로 세지 않는다. 별도 유료 서비스, 새 키, 외부 모델 호출은 없다. 다른 이미지의 내용으로 모호한 항목을 억지로 승격하지 않는다. 같은 공연의 이미지/시도/내용 변경은 재평가 fingerprint에 포함한다. 새 원본의 hash 확인/OCR은 기존 일일 OCR 경로와 제한 안에서 수행한다.

`19.30`이 날짜로 인식돼 `MULTIPLE_DATES_OR_SERIES_SCOPE`가 되는 실제 오류는 자동 판정 단계에서 월·일 범위 검증으로 재확인한다. 기존 snapshot과 원문은 그대로 둔다. 실제 다른 날짜·여러 회차·공연 기간은 보수적으로 미연결한다.

주요 사유는 `PROGRAM_EVIDENCE_MISSING`, `CATALOG_TARGET_MISSING`, `WHOLE_WORK_WITHOUT_EXPLICIT_MOVEMENT`, `EXPLICIT_MOVEMENT_REQUIRED`, `MOVEMENT_CANNOT_EXPAND_TO_WHOLE_WORK`, `ARRANGEMENT_IDENTITY_UNRESOLVED`, `SOURCE_QUOTE_MISMATCH`, `SNAPSHOT_IDENTITY_MISMATCH`, 기존 matcher의 충돌 사유다.

## 3. 상태 전이·재평가·원자성

| 입력/상황 | 저장 결과 | 다음 처리 |
|---|---|---|
| 신규 중간 후보 + 충분한 근거 | `CONFIRMED`, `AUTO_CONFIRMED`, 자동 영수증 | 같은 입력은 완료 checkpoint로 제외 |
| 같은 공연/곡의 유효한 확정이 있음 | `DUPLICATE_EFFECTIVE_CONFIRMATION` | 유효 영수증을 그대로 유지. 여분 후보는 `REJECTED` 완료 |
| 판정할 식별/프로그램 근거 부족 | `REJECTED`, `AUTO_UNLINKED`, 사유 | 판단 입력이 바뀔 때 재평가 |
| 새 분석으로 대체된 미검토 후보 | `REJECTED`, `SUPERSEDED_BY_CURRENT_ANALYSIS` 사유 | 과거 검토 영수증은 보존 |
| 비활성 원본 또는 영구 이미지 제한 | 자동 미연결 완료 | 원본/시도 변경 시 다시 평가 |
| 통신 실패·현재 OCR 확보 대기 | `RETRY_PENDING` 관측, 24시간 자동 재시도 | 입력이 달라지면 대기 시간 중에도 다시 선택 |
| 후보 저장 실패 | 해당 후보 실패/재시도 기록 | 다른 후보·이미지 계속, 미완료 checkpoint는 남기지 않음 |
| 시간/건수 예산 소진 | `deferred_images`, 사유, 완료분 checkpoint | 다음 예약에서 자동 재개 |

DB fingerprint에는 분석 payload, 후보의 식별·인용·범위, catalog hash, 자동 규칙 버전, 공연 context/revision, 같은 공연의 이미지 활성 상태/주소/revision, OCR 내용 hash·pipeline, 시도 정보가 들어간다. 완료 status나 실행 시각은 넣지 않는다. 입력 불변인 미연결을 매일 재판정하지 않는다. 새 카탈로그는 저장 OCR로 새 분석을 만들며, OCR 전체 재실행은 필요하지 않다.

확정 RPC는 **공연 → 그 공연의 이미지들(고정 ID 순서) → 후보**를 잠근다. 공연의 배타 잠금으로 다른 이미지/worker의 동일 연결 확정을 직렬화한다. 저장 직전 fingerprint, current 분석, 원문 snapshot, OCR 유효성, 현재/저장 작품 hash를 재검증한다. 변경이 끼면 `RETRY_PENDING`으로 돌려 오래된 판단을 확정하지 않는다. 분석의 고유 키와 후보별 `auto_input_hash`가 중단·HTTP 재시도에도 중복 영수증 생성을 막는다.

다운로드 실패처럼 새 바이트를 입증하지 못한 실패는 마지막 성공 근거를 유지한다. 다른 content hash가 관측됐거나 원본이 비활성화되면 기존 연결은 검색에서도 즉시 제외한다. 재활성화된 이미지에는 `evidence_changed_at`을 두어 과거 OCR 시도를 새 revision으로 둔갑시킬 수 없게 했다. 바이트가 같으면 기존 OCR artifact를 재사용하고 hash 확인 시도만 저장한다. 새 분석의 명시적 부정 판정은 같은 근거를 가진 과거 확정의 검색 유효성에도 반영한다.

## 4. 배치와 보고서

일반 daily 배치와 제한된 analysis-only 경로 모두 분석 뒤 자동 판단·저장을 호출한다. 이전 `show`/수동 승인 우선 목록은 만들지 않는다. `review.operational_queue=false`이고 `automation`에 다음 값이 기록된다.

- `confirmed`, `duplicate_maintained`, `unlinked`, `retry_pending`, `failed`, `unchanged`
- `reasons`별 건수 및 `items`별 후보/분석 ID, 결과·사유
- `images_selected`, `images_completed`, `deferred_images`, `limit_reached`, `deferred_reason`

후보가 없는 프로그램 이미지는 이미지 단위 미연결 결과로 기록되므로 전체 결과 건수에는 그 항목도 포함된다. 미완료 backlog는 `deferred_images`로 구분한다. 보고서는 관측용이며 승인 입력을 요구하지 않는다.

추가 확인은 회당 기존 `analysisLimit` 이하의 이미지, 최대 100개 후보 판정, 각 테이블 최대 999행의 제한된 읽기로 한정한다(1000행 도달 시 명시적 오류). 데이터 API의 기존 요청 timeout/retry와 배치의 기존 AbortSignal을 그대로 쓴다. 완료 체크포인트는 DB에 저장하므로 로컬 상태 파일이 없어도 재개한다. 독립 CLI는 60초 후 중단하고 다음 실행으로 넘긴다.

읽기 전용 작업 스케줄러 확인: **매일 08:40 KST, 다음 실행 2026-10-23 08:40, PT32M, 배치 1,800초, OCR 20건, analysis 20건, 이미지 확인 40건**. 기존 OCR/마무리 예약 180초, worker 종료 5초, finalize grace 10초와 scheduler의 `IgnoreNew` 정책을 변경하지 않았다. 작업 등록·시간·전원 정책·worker 종료 설정을 쓰지 않았다.

## 5. 기존 후보 및 브람스 검증

실제 DB의 읽기 전용 표본 20개 현재 v3 분석을 재파싱한 예상 결과: 자동 확정 1, 기존 확정 유지 2, 미연결 75, 재시도 0, 실패 0. 후보 없는 이미지의 미연결도 포함한다. 이 수치는 전체 운영 DB가 아닌 제한된 표본이다.

후보 `af6e1086-9f3f-4e61-9bdf-4e10e428b5a6` / `brahms-intermezzo-op118-no2` / PF295548에는 아래 실제 인용이 있었다.

- `요하네스 브람스` / `J Brahms`
- `인터메조 가장조 Op 118, No.2`
- `Intermezzoin A Major Op. 118 No. 2`

원문에 있는 `10.27`과 공연 시각 `19.30`을 서로 다른 날짜로 읽은 것이 검토 사유였다. 공통 규칙으로 날짜 오판을 해소하고 한영 식별 제약이 일치함을 확인해 **자동 확정 예상**으로 판정했다. UUID/곡/공연에 대한 판정 예외는 없다.

원격 GET 9회로 PF295548의 공연 1, 이미지 2, OCR 1, 시도 1, 분석 3, 후보 30, 기존 영수증 2를 복제했다. 격리 PGlite에 실제 migration을 적용하고 **실제 store → runner → SQL RPC → 공개 검색 코드**를 실행한 결과:

| 결과 | 건수 |
|---|---:|
| 자동 확정 | 1 |
| 유효 확정 중복 유지 | 2 |
| 자동 미연결 | 12 |
| 재시도 예정 / 실패 | 0 / 0 |
| 기존 v3 수동 대기 후보 잔여 | 0 |
| 동일 입력 두 번째 실행 쓰기 | 0 |

카탈로그가 달라진 분석은 현재 카탈로그로 새 snapshot을 만들고, 원래 브람스 후보는 대체된 과거 후보로 자동 종료한다. 새 현재 후보에 공통 규칙의 영수증이 생긴다. 기존 쇼팽·리스트 영수증은 ID/메모/상태를 보존했다. 로컬 실제 검색에서 세 곡 모두 PF295548 한 건씩 반환했다.

공개 서비스 GET 확인은 별개다. 현재 production은 Supabase / stored-program-3이며 쇼팽·리스트는 PF295548 한 건, **브람스는 여전히 0건**이다. 원격 쓰기 0회이며 로컬 성공을 운영 반영으로 보고하지 않는다.

## 6. 변경 파일·DB

- `server/programAutomation.mjs`: 공통 자동 판정, 제한·오류 격리·재개·관측 보고서.
- `server/supabaseProgramAutomation.mjs`: 현재 근거 조회, queue/scope/자동 저장/완료 store.
- `server/concertPipeline.mjs`, `pipelineRepository.mjs`, `pipelineAnalysisOnly.mjs`: 예약 배치 및 제한 경로 연결, schema preflight, 수동 우선 목록 제거.
- `server/supabaseProgramAnalysis.mjs`, `pipelineSelection.mjs`: 실패가 바이트 변경을 증명하는지 구분, 변경 원본 재확인 선택.
- `server/supabaseConcertSearch.mjs`: 출처 문구를 자동/수동 공통 검증 표현으로 변경. 공개 DTO의 식별 방어는 유지.
- `scripts/runProgramAutomation.mjs`, `verifyProgramAutomation.mjs`, `analyzeConcertPrograms.mjs`, `package.json`: 관측/제한 저장/실자료 격리 검증 명령과 안내.
- `server/programAutomation*.test.mjs` 및 기존 pipeline/analysis/version/cleanup 테스트, `scripts/testProgramAnalysis.mjs`.
- `supabase/migrations/202610220001_program_automation.sql`: 이미지 변경 시각, 분석 완료·재시도 checkpoint, 후보 자동 결과/사유 컬럼. 리뷰 actor/source 제약 확장. queue/판정/완료/재시도 RPC, 근거 유효성 함수·view 보완. **새 테이블·외래키는 없으며** cleanup 소유/삭제 관계를 바꾸지 않는다. RPC/원문은 service_role 전용이다.

작업 전부터 있던 KOPIS HTTP 진단 수정은 보존했다.

## 7. 적용 절차와 제한

원격에 기존 v3 분석 및 202610210001 identity migration이 이미 있는 것을 REST schema로 확인했다. 과거 draft나 migration 전체를 일괄 재적용하지 않는다.

1. DB 관리자 연결에서 **새 파일 하나 전체**를 실행한다. 파일 자체가 한 트랜잭션이다. SQL Editor에 파일 전체를 실행하거나, psql이 설치된 관리 환경에서는 다음을 사용한다. `CLASSIC_ATLAS_DATABASE_URL`은 관리자가 제공한 DB 연결 문자열이며 현재 환경에 설정돼 있지 않다.

```powershell
psql "$env:CLASSIC_ATLAS_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/202610220001_program_automation.sql
```

2. 현재 프로젝트 디렉터리에서 읽기 전용 schema/계획과 같은 규칙의 예측을 확인한다.

```powershell
npm.cmd run pipeline -- plan --profile daily
npm.cmd run program:auto -- --dry-run --kopis-id PF295548 --limit 20
```

3. 최초 좁은 범위의 자동 처리를 실행한다. 후보 UUID 지정이나 `confirm`, `identity-backfill`, 사람 메모는 필요 없다. 60초 중단이면 같은 명령 또는 다음 예약이 DB checkpoint로 재개한다.

```powershell
npm.cmd run program:auto -- --save --kopis-id PF295548 --limit 20
npm.cmd run program:auto -- --dry-run --kopis-id PF295548 --limit 20
```

4. 이미 등록된 08:40 daily 작업은 현재 로컬 프로젝트를 사용하므로 별도 예약 등록은 필요 없다. 다음 실행부터 같은 자동 판정이 기존 한도 안에서 저장까지 끝낸다. 공개 서비스의 현재 검색 버전은 이미 v3이며, 새 자동 영수증은 기존 형식과 호환된다. 서버의 출처 문구 수정은 해당 서버를 배포해야 반영된다.

필수 확인 명령:

```powershell
npm.cmd run test:program
npm.cmd test
npm.cmd run build
git diff --check
npm.cmd run verify:program-auto
```

검증 결과: `test:program` 116/116, 전체 `npm test` 365/365 통과. 최종 후보 identity fingerprint 보완 뒤 SQL 통합 검사도 다시 통과했다. 신규 확정/중복, 번호·조성·작곡가 충돌, 단일 등록 악장 함정, 작품/악장/편곡 범위, 원문 불일치, 미연결 후 새 근거, 불변 입력 무처리, stale/identity 재선택, 저장 시점 원본 변경, 중단 후 재개, 실제 검색 projection을 검증했다. Windows 자식 프로세스 검사는 sandbox의 `spawn EPERM` 때문에 허용된 실행 환경에서 재검사했으며 잠금·worker·스케줄러 wrapper 검사까지 통과했다. 프로덕션 build와 `git diff --check`도 통과했다. 기존 500 kB 초과 bundle 경고는 남아 있다. 집계 증거는 [PROGRAM_AUTOMATION_RESULTS_2026-10-22.json](PROGRAM_AUTOMATION_RESULTS_2026-10-22.json)에 저장했다.

새로운 모델·API 키·대량 수집·전체 OCR 재실행은 사용하지 않았다. OCR 자체의 실제 오독을 원본 이미지와 다시 대조하는 새 인식 엔진은 추가하지 않았다. 근거가 부족한 항목을 미연결로 끝내는 보수적 정책이며 모든 레퍼토리의 연결을 보장하지 않는다. PGlite 통합 검사와 직렬화 잠금 경로는 검증했으나 원격 PostgreSQL의 복수 실제 세션을 사용한 부하/동시성 실험은 실행하지 않았다.

**코드와 로컬 실자료 검증에서는 사람의 후보 검토·승인 없이 완료한다. 운영 시스템이 매일 그 상태로 완료한다고 말하려면 새 원격 SQL 적용과 실제 자동 배치 실행이 남아 있다.**
