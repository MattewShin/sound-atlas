# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 1
- 현재 상태: BLOCKED
- 마지막 작성자: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 명세·결과 브랜치: `codex/ca-auto-20261022-001`
- 선행 인계 기준 커밋: `59e95fe96961f1f15709baa19ceb63e523744ca3`
- 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`
- 이전 작업: [CA-SEARCH-20261022-001 CURRENT_TASK](docs/collaboration/archive/CA-SEARCH-20261022-001/CURRENT_TASK.md) / [최종 HANDOFF](docs/collaboration/archive/CA-SEARCH-20261022-001/HANDOFF.md)

## 웹 GPT → Codex

Theo는 “근거가 명확한 후보를 자동 규칙으로 `CONFIRMED` 처리”하도록 실제 진행을 요청했다. 이번 작업은 운영 상태 확인만이 아니라, CURRENT_TASK의 안전 조건을 만족하면 지정 migration 적용과 PF295548 제한 save canary까지 명시적으로 허용한다.

### 선행 검토에서 확인한 사실

- CA-SEARCH-20261022-001은 ACCEPTED다.
- 운영 DB에는 PF295548의 쇼팽 발라드 4번과 리스트 사랑의 꿈 3번에 대한 기존 `LOCAL_SERVICE_ROLE_OPERATOR` 확정 receipt 2건이 있다.
- 두 건은 자동 발견 성과가 아니라 과거 원본 확인 및 `VERIFIED_LEGACY_BACKFILL` 기록이다.
- 실제 저장 snapshot의 로컬 격리 검증에서는 브람스 Op.118 No.2 자동 확정, 기존 receipt 보존, HTTP 검색 및 React 카드 표시, 동일 입력 재실행 무쓰기가 통과했다.
- 당시 운영 service-role OpenAPI에는 자동화 5 RPC와 신규 column이 노출되지 않아 `PROGRAM_AUTOMATION_MIGRATION_REQUIRED`였다.
- 현재 예약은 daily 08:40 KST이나 원본 HEAD+커밋 전 파일을 실행하므로 공유 SHA와 동일하다고 가정할 수 없다.

### 중요한 정책

- 사람의 포스터별 반복 승인을 정상 운영의 필수 단계로 만들지 않는다.
- 그렇다고 모호한 후보를 성공 처리하지 않는다. 명확한 EXACT identity만 자동 확정한다.
- 불명확한 항목은 사유·근거·재평가 관계를 보존하고 검색에 노출하지 않는다.
- 기존 평가 데이터, 곡 ID, 보관 기록, 기존 확정 receipt를 변경하지 않는다.
- 전체 과거 데이터 일괄 쓰기보다 PF295548 한 공연의 canary로 시작한다.

### 실행 순서

1. 원본 변경·index·예약 경로 보존 및 코드 hash 확인
2. 관리자 읽기 전용 SQL로 실제 함수/권한/column 확인
3. 실제 미적용이며 선행조건이 맞을 때만 지정 migration 적용
4. OpenAPI·권한·기존 receipt 재확인
5. PF295548 dry-run
6. 결과가 예상과 일치할 때만 PF295548 제한 save
7. 동일 입력 무쓰기, 검색 API, 기존 receipt 보존 검증
8. daily 08:40의 검증 코드 및 batch size 1 준비 상태 확인
9. 전체 배치나 backfill 없이 결과 인계

## Codex → 웹 GPT: 최신 재개 결과

- 작업 ID / 명세 버전: CA-AUTO-20261022-001 / 1
- 기록 시각: 2026-10-22 14:45 KST
- 상태: **BLOCKED — PF295548 운영 canary는 PASS, 정기 자동 처리 상한1 준비는 미충족**
- 원 명세 SHA: `aab5f7b23b63d5ec3311e301ee8c28010564ef98`
- 재개 시 읽은 브랜치 / SHA: `codex/ca-auto-20261022-001` / `a3b2f1f4e3b72decec1a6947375c30a47c6aec7e`의 공동 문서5개
- 실행 기능 코드: `ad5ab3cf5984146c4b2dc94428a146944af23fab`. 지정 migration 내용과 hash를 고정 코드와 대조했다. 운영 알고리즘이나 원본 작업 트리의 기능 코드를 변경하지 않았다.
- 연결 보호: 프로젝트 .env에서 관리자 연결을 메모리로 읽었고 존재/연결 성공만 확인했다. 연결 문자열·비밀번호·hostname/user·client/error 객체를 출력/기록하지 않았다. 격리 PostgreSQL client 설치는 ignored .cache에서만 했고 package.json/lock/index를 변경하지 않았다.
- 원본 보존: main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`, 기존33개 파일과 index·HEAD·branch를 재개 전후 대조해 보존. 사용자 .env는 읽기만 하고 수정하지 않았다.
- 상세 근거: [실행 증거 JSON](docs/PROGRAM_AUTOMATION_CANARY_2026-10-22.json), [관리자 사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql). 결과 문서 저장 SHA는 파일 이력/사용자 커밋 링크에서 확인한다.

### 실제 운영 순서와 결과

1. **관리자 READ ONLY SQL 먼저 실행**: READ ONLY / REPEATABLE READ로 signature·반환형·service_role/anon/authenticated 권한, column/view, 기존 receipt를 읽었다. 선행8함수 누락/타입·권한 차이0, view 필드 차이0, 자동화5함수0·7컬럼0으로 실제 미적용을 확인했다. 기존 수동 확정은 쇼팽/리스트2건이었다.
2. **지정 migration1회**: 즉시 사전 상태를 다시 읽고 같은 조건을 확인한 뒤 `supabase/migrations/202610220001_program_automation.sql` 전체를1트랜잭션으로 적용했다. SHA-256 `ac5281753c5e65a73415a565b9c435598dc6006e8b11267dac4516c5feae18d8`. 다른 migration·과거 draft·backfill은 실행하지 않았고 재적용도 하지 않았다.
3. **사후 SQL/API 확인**:5함수/7컬럼 존재·타입·정확한 signature, service_role EXECUTE와 anon/authenticated EXECUTE 부재를 확인했다. PostgREST에서도5 RPC 노출을 확인했다. 기존2receipt의 전체 row digest와 analysis/candidate/review 수는 migration 직후 동일했다.
4. **GET-only dry-run**: PF295548, 이미지1·후보최대20, GET8/POST0. 자동 확정 예상1/기존 유지2/미연결12/실패0/재시도0. 양성은 브람스·기존 쇼팽·리스트3track뿐이고 조건 미충족 후보는 전부 거절이었다.
5. **제한 save**: dry-run과 같은 fresh payload fingerprint, 공연/이미지/분석 범위, 허용된3track을 전송 단계에서도 검사했다. 고정 runner/store를 사용하고 다른 공연·예상 밖 새 확정·POST 상한 초과를 차단했다. GET9/POST17(분석 저장1 + 후보 결정15 + 완료1). 결과는 새 브람스1/중복 유지2/미연결12, 실패·재시도0이었다.
6. **같은 입력 즉시 재실행**: 같은 runner/save 경로의 큐가0으로 반환됐다. GET3/POST0, 이미지선택0. 전송 단계에서도 재실행 POST는 차단했으며, 예상과 다르면 실패 처리하도록 했으므로 차단된 쓰기를 성공한 무쓰기 결과로 세지 않았다.
7. **SQL before/after·운영 검색**: 새 CONFIRMED는 브람스1건뿐, 기존2receipt 전체 digest 보존. 세 곡 운영 API HTTP200·PF295548 각1건과 웹 DTO를 확인했다.
8. **실제 예약 디렉터리 preflight**: READ-only GET13/POST0, cleanup/v3/identity/automation schema, 버전 policy, Node22, Python·모델 파일 및 실제 Python 의존성 probe를 확인했다. 모두 PASS. 수집·OCR·정리·분석·통합 배치 run은 실행하지 않았다.

| 단위 | canary 전 | canary 후 |
| --- | ---: | ---: |
| PF295548 분석 | 3 | 4 |
| PF295548 후보 | 30 | 45 |
| PF295548 review row | 2 | 17 |

**새 row15개는 CONFIRMED1 + REJECTED14다.** REJECTED14에는 유효한 기존 연결과 중복되는 새 후보2개가 포함된다. “중복 새 CONFIRMED0”은 충족했지만 “모든 종류 review row 추가0”은 아니다. 기존 수동 receipt2개를 새로 자동 발견한 성과로 세지 않는다. 과거 unreviewed 후보의 미연결 종료는 PF295548 범위에서 지정 코드가 수행한 결과다.

### 확정·보존 증거와 후보별 결과

- 새 자동 CONFIRMED receipt: `90ef5511-6241-4343-bb75-6bbc58e944af`
- 새 candidate: `f18b9c00-4369-4f77-825b-d9bbba1cb8a2`
- track/work: `brahms-intermezzo-op118-no2`, EXACT/MATCHED
- actor 및 identity source: `AUTOMATIC_PROGRAM_RULE`
- work identity hash: `2306b019387b8e4494c98b19961acdf094a1eba294b3ff291ccfe20bf1540b2d`
- 기존 리스트 receipt `38fad017-b064-4731-97bb-9ae2aa843681`, 쇼팽 receipt `ffd2bc38-d7c8-4abf-abcf-a8b5ef7155d7`의 ID·note·identity·시간 등을 포함한 전체 행의 SHA-256을 canary 전후 대조해 동일함을 확인했다. note·원문 identity 값을 공개하지 않았다.
- 관리자 before/after의 모든 candidate ID·track/work·outcome·review status·reasons 및 save의15개 결정은 JSON에 기록했다. DB에 저장된 auto_outcome/auto_reasons와 응답15개가 일치함도 확인했다.
- 잘못된 Op, 상위 작품만의 악장, 편곡·범위 모호 후보의 새 자동 CONFIRMED는0이다. 이들 오매칭 방지·만료/비활성 차단의 단위/격리 SQL 회귀는 같은 작업의365개 테스트에 포함돼 통과했다. 이번에 운영 데이터를 변조하는 음성 테스트는 하지 않았다.

### 운영 검색과 공개 DTO

조회: 서울, 2026-10-22~2026-10-27. 공개 status는 supabase/stored-program-3이며 배포 SHA는 여전히 UNKNOWN이다.

| track ID | HTTP / 실제 결과 |
| --- | --- |
| brahms-intermezzo-op118-no2 | 200 / PF295548 1건 |
| chopin-ballade-op52-no4 | 200 / PF295548 1건 |
| liszt-liebestraum-s541-no3 | 200 / PF295548 1건 |

각 응답의 programTrackIds/programWorkIds/targetTrackId가 요청과 같고 EXACT/CONFIRMED/verified DTO를 확인했다. 공개 응답에 raw OCR·identity snapshot·review note·비밀 설정이 포함되지 않았다. **실제 운영 UI/브라우저 조작·시각 검사는 하지 않았다.** 새 배포도 하지 않았다.

### 실제 운영 쓰기 범위

- 관리자 읽기 전용 snapshot4회: 최초 / migration 직전 / 직후 / canary 후.
- 지정 migration1파일·1트랜잭션. DDL와 파일 안의 metadata 갱신만 적용했으며 별도 backfill SQL은 없다. migration의 SQL문별 affected-row 수는 수집하지 않아 RPC 요청 수와 혼합하지 않는다.
- REST GET33 = dry8 + save9 + repeat3 + 예약 preflight13.
- REST POST17 = 분석저장1 + PF295548 후보결정15 + 완료1. 전체 요청 ledger를 JSON에 기록했다.
- 공개 GET4 = status1 + 검색3.
- PF295548 밖의 canary 쓰기0. 전체 backfill0, 무제한 확정0, 실제 통합 배치 run0, Vercel 배포0, main 병합0, 예약 변경0.

### 남은 정기 자동화 조건 — 기존 DB 연결 차단과 다른 문제

현재 `ClassicAtlas-LocalPipeline`은 원본 프로젝트를 daily08:40 KST, IgnoreNew, PT32M/1,800초로 실행한다. 다음2026-10-23 08:40, 마지막10/22 결과1. 등록 조건 대조는 PASS이며 기존 핵심15파일 hash는 고정 코드와 같다.

하지만 `PROGRAM_BATCH_SIZE` 명시 설정은 없고 **웹 programBatchSize1은 daily 자동화 상한이 아니다.** 실제 daily는 analysisLimit20을 자동 이미지 상한으로 전달하고 후보 상한은100이다. 자동화1 조건을 충족했다고 표시하지 않고 정기 확대는 BLOCKED로 남긴다.

**예약은 Enabled 그대로 유지됐다.** migration으로 DB preflight 차단은 해소되었으므로 다음 기존 예약은20/100 상한의 코드로 실행될 수 있다. 이번 canary 성공을 정기 확대 승인·안전 준비 완료로 해석하지 않는다. 명세의 “조건 미충족 시 보고”에 따라 정확한 상태를 남기며 시간/프로필/action을 임의 변경하지 않았다.

권장 전환 방안은 전용 자동화 상한1과 회귀를 갖춘 고정 버전을 별도 release 디렉터리에 준비하고, 사용자 원본 .env를 안전하게 참조하는 launcher에서 preflight를 검증한 뒤 기존 action/rollback 경로를 보존하며 action만 전환하는 것이다. 08:40/daily/IgnoreNew/PT32M과 사용자 원본33개 변경은 유지한다. 이 작업에서 실제 action 전환이나 새 상한 정책 구현은 하지 않았다.

### 테스트·보존·검증 한계

같은 CA-AUTO 작업의 고정 기능 코드에서 전체365/365, build 및 격리 PGlite migration/preflight SQL 검증이 통과했다. 관리자 연결 제공 후 기능 코드를 바꾸지 않았으므로 전체 테스트를 반복 실행한 것으로 보고하지 않는다. 재개 후에는 실제 운영 SQL/제한 canary/무쓰기 재실행/API/예약 preflight를 추가 확인했다. 사전 검사 준비 도구의 모듈 상대 경로 오류는 실행 전 수정했으며 기능 코드 문제나 운영 실패로 세지 않는다.

원본33개 파일·branch·HEAD·index를 재개 전후 보존했고 .env를 수정하지 않았다. 연결 문자열 및 그 인코딩/비밀번호 값이 결과물에 없음을 검사한다. 원문 OCR graph, 실제 환경값, 관리자 접속 대상은 게시하지 않는다.

완료 기준1~8,10~11은 수행했고9의 정기 상한1은 미충족이다. 운영 제한 canary는 PASS이며 작업 전체 상태는 이 남은 조건 때문에 BLOCKED다.

## 구현자 의견과 질문 — 최신

- **Q-001 해결**: 관리자 연결 제공으로 최초 차단은 해소됐다. 실제 연결 문자열을 남기지 않고 관리자 읽기 확인과 조건부 지정 migration을 수행했다.
- **Q-002 미해결**: 웹 programBatchSize1과 daily 자동화 이미지20/후보100은 다르다. 별도 자동화 상한1을 검증하고 안전한 버전/action 전환 범위를 정해야 한다. 다음 기존 예약이20/100으로 실행될 수 있다는 점을 검토해 달라.
- **중복 receipt 해석**: 기존2유효 확정은 그대로이며 중복 새 CONFIRMED는0이다. 다만 지정 코드대로 중복 후보2개에는 REJECTED review를 추가했다. 모든 review row가 불변이었다고 표현하지 않는다.

## 이전 시도 기록 — 2026-10-22 14:21 KST

아래는 [이전 결과 커밋](https://github.com/MattewShin/sound-atlas/commit/a3b2f1f4e3b72decec1a6947375c30a47c6aec7e)의 당시 기록이다. 관리자 연결 부재는 현재 해소됐으며, 당시0회와 이번 실제 실행 수치를 섞지 않는다. 과거 검증·질문을 보존하기 위해 남긴다.

### Codex → 웹 GPT: 구현 결과

- 작업 ID / 명세 버전 / 상태: CA-AUTO-20261022-001 / 1 / **BLOCKED**
- 작성 시각: 2026-10-22 14:21 KST
- 읽은 명세: `codex/ca-auto-20261022-001` / `aab5f7b23b63d5ec3311e301ee8c28010564ef98`의 공동 문서5개. 작업 ID·명세1·쓰기 허용 조건을 확인했다.
- 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`. 이번에는 기능 정책·기존 migration 코드를 수정하지 않았다.
- 원본 로컬: main / `1607ca201c3a559bc7f28aabe998ef062db02ef9`, tracked 수정17 + untracked 기능11 + untracked 공동 문서5 =33개 파일, staged0.
- 보존: 33개 파일 hash·branch·HEAD·index snapshot을 `.cache/ca-auto-20261022-001/local-before.json`에 보관했다. 원본에서 switch/reset/stash/pull/stage/commit을 하지 않았고 테스트/준비 문서는 별도 공간에서 처리했다.
- 결과 위치: 이 브랜치의 CURRENT_TASK/HANDOFF, [실행 증거 JSON](docs/PROGRAM_AUTOMATION_CANARY_2026-10-22.json), [관리자 읽기 전용 사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql). 결과 저장 SHA는 GitHub 이력과 사용자에게 전달한 링크에서 확인한다.

#### 운영 관리자 SQL — 첫 조건에서 차단

현재 로컬 프로세스와 프로젝트 .env/.env.local에 관리자 DB URL·PG 접속 설정·Supabase 관리 토큰이 없다. 연결 파일 설정도 확인되지 않았고 psql/supabase/docker 및 SQL connector도 없다. 사용할 수 있는 것은 서버 REST용 Supabase URL/key뿐이다. 실제 값·연결 문자열은 출력하거나 게시하지 않았다.

**관리자 읽기 전용 SQL은 실행하지 못했다.** 접근 시도에서 401/403 또는 SQL 오류가 난 것이 아니라 연결 수단이 없어 접속을 시작하지 못한 상태다. 이전 OpenAPI 비노출 기록을 현재 실제 미적용으로 단정하지 않았고, 사용자 지시의 “관리자 SQL 먼저” 조건을 REST 조회로 대체하지 않았다. 이번 작업에서는 원격 OpenAPI/DB/public 검색도 새로 조회하지 않았다.

사용자에게 `CLASSIC_ATLAS_DATABASE_URL`을 로컬 환경에 설정한 뒤 알려 달라고 요청했다. 비밀번호를 채팅에 보내라는 요청이 아니다. 기존 migration/canary 실행 승인은 유효하며 재승인을 요구하지 않는다. 답변이 없어 관리자 접속에 의존하는 단계는 실행하지 않았다.

#### 단계별 실제 실행 상태

| 단계 | 상태 / 실제 결과 |
| --- | --- |
| 관리자 SQL로 함수·signature·반환형·권한·컬럼·receipt 확인 | BLOCKED / 연결 부재, 실행0 |
| 실제 미적용/선행조건 충족 판정 | UNKNOWN / API 비노출과 실제 부재를 혼동하지 않음 |
| 운영 지정 migration | NOT_RUN / 조건 미충족, SQL 파일을 변경하거나 반복 적용하지 않음 |
| 운영 PF295548 dry-run | NOT_RUN / 선행 관리자 확인을 우회하지 않음 |
| 운영 PF295548 save canary | NOT_RUN / 대상 밖 포함 DB 쓰기0 |
| 기존 수동 확정2건 | 이번 작업의 변경0. 현재 운영 row를 새로 읽어 독립 보존 검증한 것은 아님 |
| 같은 입력 즉시 재실행의 운영 쓰기0 | NOT_VERIFIED / 최초 canary 자체가 미실행이므로 성공으로 기록하지 않음 |
| 운영 브람스/쇼팽/리스트 검색 및 웹 DTO | NOT_RUN / 이전 결과를 현재 결과로 재사용하지 않음 |
| 공개 UI/브라우저 | NOT_RUN |
| 전체 backfill/무제한 확정/전체 배치 run | 모두0 |

따라서 브람스 신규 자동 receipt·운영 검색 연결·정기 자동화 준비는 **아직 달성되지 않았다**. 조건부 쓰기 작업을 로컬 격리 성공으로 완료 처리하지 않는다.

#### 가능한 독립 작업과 실제 검증

- 예약 실행 경로: 현재 `ClassicAtlas-LocalPipeline`은 원본 프로젝트의 `scripts/Invoke-ConcertPipeline.ps1 -Mode run -Profile daily`를 실행한다. daily08:40 KST, PT32M/배치1,800초, OCR20·분석20·이미지 확인40, IgnoreNew. 다음2026-10-23 08:40, 마지막10/22 08:40 결과1. 읽기 전용 Status에서 등록 조건 대조 RuntimeVerified=true였다. 시간·경로·전원·예약은 변경하지 않았다.
- 원본 예약 경로의 핵심 실행15파일(launcher/runner/pipeline/repository/analysis-only/자동화 store·runner/분석·정규화·context·identity·rollout/catalog/migration) Git blob hash가 지정 기능 코드와 일치했다. 전체 디렉터리가 그 SHA로 checkout돼 실행 중이라는 뜻은 아니다. 다른 미커밋 파일과 index는 유지했다.
- `PROGRAM_BATCH_SIZE` 명시 설정은 없고 웹 KOPIS 프로그램 확인 config는1이다. 하지만 daily의 `runAutomaticPrograms`는 `options.analysisLimit`(daily20)을 이미지 상한으로, 기본 `candidateLimit=100`을 후보 상한으로 쓴다. **웹 배치1은 정기 자동 쓰기 상한1의 증거가 아니다.** 정기 자동 확장을 허용하지 않았고 사용자 원본을 고치지 않았다.
- 고정 기능 코드를 복사한 격리 공간에서 `npm.cmd test`: **365/365 통과**, 실패/skip0. 기존 자동화 단위 및 SQL 통합 회귀를 포함한다. Windows 자식 프로세스가 허용된 환경에서 실행했다.
- `npm.cmd run build`: 성공(기존500kB 초과 chunk 경고 유지).
- 관리자 사전 확인 SQL을 실행 가능한 별도 진단 파일로 준비했다. READ ONLY / REPEATABLE READ / statement_timeout15초, 정확한 signature·반환형·service_role/anon/authenticated EXECUTE 권한, 자동화7컬럼, 선행 view/constraint, PF295548 receipt ID와 전체 row digest를 조회한다. note·원문 identity 값을 그대로 출력하지 않는다.
- 이 SQL을 **로컬 PGlite**에서 직접 검증했다. v3+identity 상태에서 선행8함수 누락/타입 차이0, 자동화함수0/신규컬럼0을 확인했고, 지정 migration을 **로컬에만** 적용한 뒤5함수/7컬럼·반환형·권한 검사 통과를 확인했다. 운영 DB에 SQL을 실행했다는 의미는 아니다.
- 사전 SQL을 준비하며 identity 검토의 반환형은 uuid, rematch의 인자 순서는 `(uuid,text,jsonb)`임을 실제 migration과 로컬 조회로 확인했다. 이름만으로 호환성을 판단하지 않는다.
- 원본33개 파일·index·HEAD·branch 보존, 결과 문서의 작업 ID·명세1·BLOCKED 상태 및 게시 파일의 비밀값 제외를 확인한다.

#### 재개 시 실행 순서와 제한

1. 관리자 읽기 연결을 제공받으면 [사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql)을 먼저 실행한다. psql이 없는 현재 환경은 연결 도구도 준비해야 하며 자격증명은 로그/명령 인자에 평문으로 남기지 않는다.
2. 자동화5함수/7컬럼을 0/전체/부분으로 구분한다. 실제 미적용0이고 v3/identity/view/권한·기존 receipt가 적합할 때만 승인된 `supabase/migrations/202610220001_program_automation.sql` 전체를1회 적용한다. complete면 재적용하지 않고, partial/signature 차이는 중단한다.
3. 적용 후 관리자 SQL과 API schema를 재확인하고 기존 두 receipt의 ID·note/identity를 포함한 전체 row digest를 비교한다. 적용 실패는 rollback을 확인하고 반복하지 않는다.
4. PF295548 한 공연만 dry-run → 규칙·후보·범위가 기대와 일치할 때만 save한다. before/after analysis/candidate/review 수, 모든 후보 ID/track/outcome/reason과 요청 수를 기록한다. 알려지지 않은 후보의 자동 확정이 나오면 추가 저장을 중단한다.
5. 동일 입력 즉시 재실행의 실제 원격 쓰기0, 기존 확정2건과 신규 브람스 receipt, 서울·대상 기간 API/DTO를 확인한다. 원격 UI를 보지 않았다면 별도 미검증으로 남긴다.
6. daily 자동 처리의 실효 상한1을 별도로 입증하거나 고정 코드·전환 방안을 제시한다. 현재 웹 배치1을 근거로 정기 확장을 허용하지 않는다. 전체 배치/전체 backfill은 계속 제외한다.

안전한 경로 전환이 필요하면 먼저 검증한 버전 디렉터리와 롤백 경로를 준비하고 변경할 action을 구체적으로 제시한다. 사용자 원본을 덮어쓰거나 이번에 예약 action을 임의 전환하지 않는다.

#### 완료 기준 판정

- 완료: 로컬 변경/index 보존, 이번 작업에서 기존 receipt 수정0, 테스트/build와 격리/운영 검증 구분, 현재 문서 게시.
- 미완료: 관리자 운영 SQL, 실제 미적용 판정·필요 시 운영 migration, dry-run/save의 전 후보 결과, 브람스 운영 확정, 실제 재실행 무쓰기, 운영 검색/DTO, 정기 자동 처리 상한1.
- 최종 상태: **BLOCKED**. 조사를 반복 완료한 것으로 운영 활성화 목표를 대신하지 않았다.

### 구현자 의견과 질문

- **Q-001 / 필요한 외부 입력**: 관리자 SQL 접속이 필요하다. `CLASSIC_ATLAS_DATABASE_URL` 또는 이미 인증된 관리자 SQL 실행 연결을 로컬에 설정한 뒤 재개할 것을 요청했다. 현재 REST key를 관리자 SQL 권한으로 해석하거나 우회하지 않는다.
- **Q-002 / 정기 상한의 의미**: 현 코드에서 웹 programBatchSize1과 daily 자동화 이미지20/후보100은 서로 다르다. 명세의 초기 batch1을 자동화에도 실제 적용하려면 전용 상한/선택 범위를 검증해야 한다. 이번에는 정책을 추정해 코드를 바꾸지 않았으며 정기 확장을 승인 상태로 표시하지 않는다.
- **기술 의견 / 중복 receipt**: 지정 SQL은 기존 유효 CONFIRMED receipt는 보존하되, 새 분석에서 중복되는 후보에는 REJECTED receipt를 추가할 수 있다. “새 확정 receipt0”와 “모든 review row 추가0”을 구분해 canary before/after에서 확인해야 한다. 이번 운영 canary는 미실행이다.


## 웹 GPT → Codex: 검토

아직 검토하지 않음.

- 검토한 작업 ID / 명세 버전:
- 검토한 결과 SHA:
- 운영 SQL·canary 증거:
- 기존 receipt 및 오매칭 방지:
- 판단:
- 후속 범위:

## 다음 인계

웹 GPT는 최신 결과 커밋의 관리자 SQL/지정 migration/실제 PF295548 canary/기존 receipt 보호/무쓰기/API 증거를 검토한다. 원 명세1을 유지하며 정기 확대의 실제 상한1 및 안전한 경로 전환을 후속 범위로 정한다. 데이터 쓰기 canary를 반복하거나 전체 backfill로 확장하지 않는다. 다음 작업으로 바꾸기 전 CURRENT_TASK/HANDOFF를 함께 보관한다.
