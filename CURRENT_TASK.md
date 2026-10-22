# 현재 작업

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 2
- 제목: 명확한 공연 프로그램 후보의 운영 자동 확정 활성화 및 단계적 확대
- 상태: READY
- 요청자: Theo
- 명세 작성자 / 후속 검토자: 웹 GPT
- 실행 담당: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 작업·명세 브랜치: `codex/ca-auto-20261022-001`
- 선행 인계 기준: `59e95fe96961f1f15709baa19ceb63e523744ca3`
- 선행 작업: CA-SEARCH-20261022-001 / ACCEPTED
- 고정 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`

## 사용자 목표

공연 프로그램 근거가 명확한 후보는 사람이 포스터마다 반복 확인하지 않아도 자동 규칙으로 `CONFIRMED` 처리하고 검색 결과에 연결한다. 불명확한 곡번호·악장·편곡·공연 범위는 자동 확정하지 않는다.

명세 1에서는 운영 DB migration 적용과 PF295548 제한 canary까지만 허용했다. 이 단계는 2026-10-22 운영에서 통과했다.

명세 2에서 사용자는 특정 육안 확인 사례만 추가하는 대신 **현재 저장된 공연 전체에서 더 많은 등록곡이 공연과 연결되도록 다음 단계까지 진행**할 것을 지시했다. 무제한 일괄 쓰기는 하지 않지만, 아래 단계적 상한과 중단 조건 안에서 전체 dry-run, 여러 공연의 제한 저장, 추출·matcher 보완 및 정기 처리 상한 분리를 허용한다.

## 명세 2 변경 범위 — 단계적 확대

### A. 예약 실행 전 안전 상한 분리

현재 daily 경로의 자동화 상한은 이미지 20개·후보 100개이고, 기존 예약이 Enabled라 다음 실행에서 canary 범위를 초과할 수 있다. 다음 예약 실행 전에 자동 확정 단계가 다른 분석/수집 상한을 재사용하지 않도록 전용 설정을 구현하고 실제 실행 경로에 적용한다.

- 초기 정기 자동화 상한: 이미지 3개 / 후보 30개
- 수집·OCR·일반 분석 상한과 자동 확정 상한을 별도 이름으로 관리
- 기존 08:40 KST, daily, IgnoreNew, PT32M은 유지
- 설정이 확인되지 않으면 자동 확정 단계만 fail-closed하고 수집·OCR 전체 예약을 임의로 중지하지 않음
- 원본 `.env`의 비밀값과 사용자 설정은 보존하며 새 비밀값을 커밋하지 않음
- 명세 1 canary가 처리한 PF295548는 반복 실행에서 쓰기 0이어야 함

### B. 현재 저장 자료 전체 dry-run

운영 DB의 현재 eligible queue 전체를 먼저 **쓰기 0 dry-run**으로 조사한다. 페이지/상한 때문에 일부만 읽었다면 전체라고 표현하지 않는다.

곡·공연별로 다음을 기록한다.

- AUTO_CONFIRMED 예상 track/work/concert와 근거
- DUPLICATE_EFFECTIVE_CONFIRMATION
- AUTO_UNLINKED 및 모든 reason
- OCR 없음 / OCR 있음·candidate 없음 / candidate 있음·identity 실패
- 동일 공연·곡 중복 제거 후 예상 신규 unique track–concert 수
- 검색 기간·지역·공연 상태 때문에 노출되지 않을 결과

dry-run에서 `AUTO_CONFIRMED`로 예상한 항목은 EXACT·현재 evidence·명시 악장·편곡 범위·날짜/프로그램 section을 코드로 다시 검증한다. 포스터별 사람 승인을 정상 절차로 추가하지 않는다.

### C. 여러 공연의 단계적 운영 저장

dry-run과 회귀 검증이 통과하면 현재 저장 자료를 작은 묶음으로 저장한다.

- 한 묶음: 최대 이미지 3개 / 후보 30개
- 이번 명세의 누적 상한: 이미지 20개 / 후보 decision 100개
- 각 묶음 직후 동일 입력 재실행 POST 0 확인
- 새 CONFIRMED track마다 운영 검색 API의 공연 ID·EXACT·CONFIRMED 대조
- 기존 수동·자동 receipt의 유효 identity 보존
- 중복 후보에 새 CONFIRMED 생성 금지
- 자동 REJECTED receipt도 후보 decision 상한에 포함하고 reason·원본 관계 보존
- false positive, 예상 밖 track, 실패/재시도, 기존 검색 소실 중 하나라도 발생하면 다음 묶음 중단

이번 범위 안의 명확한 후보는 특정 작곡가나 PF295548에 한정하지 않는다. 다만 신규 연결 수를 사전에 보장하거나 모호한 후보를 성공으로 바꾸지 않는다.

### D. 명확한데 놓치는 후보 개선

전체 dry-run 결과가 기존 자료상 명확한 후보를 놓치거나 신규 unique track이 매우 적으면 다음 우선순위로 원인을 개선한다.

1. OCR 성공이지만 candidate가 없는 이미지
2. candidate는 있으나 등록곡 표기·작품번호·악장 경계 때문에 불일치한 사례
3. 현재 성공 OCR이 없는 active DETAIL 이미지

먼저 1·2번에서 최대 10개 대표 이미지를 사용해 program section·작곡가·작품번호·악장·편곡 경계를 개선한다. cached/격리 자료와 합성 음성 사례로 회귀를 만든 뒤 운영에는 위 C 상한으로만 반영한다. 3번의 새 OCR 실행은 최대 5개 active DETAIL 이미지로 제한하고, 다운로드·OCR·분석 요청 수를 기록한다. 전체 60개를 한꺼번에 재처리하지 않는다.

다음 오매칭은 계속 차단한다.

- 상위 작품만으로 특정 악장 확정
- 공연 날짜의 월/숫자를 작품 번호로 사용
- 다른 작곡가의 유사 제목
- 편곡·발췌·연탄 범위 누락
- 연주자 소개·전기·시리즈 목록을 프로그램으로 해석
- 종료·비활성·stale 근거

### E. 단계적 확대 완료 기준

- 전용 정기 자동화 상한 3/30이 실제 예약 경로에서 검증됨.
- 전체 eligible queue dry-run의 분모와 예상 신규 unique 연결이 기록됨.
- 여러 공연 저장을 누적 20이미지/100후보 이하에서 수행함.
- 모든 저장 묶음의 즉시 재실행 쓰기 0.
- 새 자동 확정 전부 운영 검색 API에서 확인됨.
- 기존 확정 검색이 소실되지 않음.
- 놓친 명확 후보의 원인을 단계별로 분류하고, 개선한 경우 회귀 테스트를 추가함.
- 다음 예약 실행 결과 또는 실행 전 준비 상태를 정확히 구분함.
- 연결 수·거절 수·후보 수를 서로 다른 지표로 보고함.

## 확정 정책

다음 조건을 모두 만족하는 후보만 자동 `CONFIRMED`할 수 있다.

- 현재 활성 DETAIL 이미지와 현재 사용할 수 있는 성공 OCR 근거
- 공연 날짜·프로그램 구간이 명확하고 시리즈 전체·전기·연주자 소개 문구가 아님
- fresh reparse와 저장 candidate의 identity·evidence·section이 일치
- 등록 catalog의 작곡가와 고유 작품 identity가 일치
- `MATCHED + EXACT`
- 특정 악장 track이면 해당 악장이 원문에 명시됨
- 편곡·발췌·상위 작품만의 표기·번호 충돌·날짜 범위 모호성이 없음
- current analysis, matcher/catalog/pipeline 및 evidence hash가 유효함
- 기존 유효 확정과 중복이면 새 확정 receipt를 만들지 않음

조건을 만족하지 않는 후보는 `CONFIRMED`하지 않는다. 실패·모호성 사유와 재평가 가능한 원본 관계를 보존한다. 숫자 증가 자체를 성과로 보고하지 않는다.

## 1. 시작 상태와 변경 보존

- 먼저 원본 로컬 branch·HEAD·index·tracked/untracked 변경과 실제 예약 작업 경로를 확인한다.
- 기존 33개 로컬 변경과 사용자의 작업을 switch/reset/stash/자동 commit으로 훼손하지 않는다.
- 필요하면 격리 worktree 또는 읽기 전용 원격 SHA를 사용한다.
- 공동 문서와 실제 실행 코드의 파일 hash를 대조한다. 예약 경로가 고정 코드와 다르면 같다고 가정하지 않는다.
- 비밀키·연결 문자열·원문 OCR graph·환경값은 출력하거나 커밋하지 않는다.

## 2. 운영 DB 사전 확인

먼저 `docs/CONCERT_SEARCH_OPERATIONS_2026-10-22.md`의 관리자 읽기 전용 SQL을 실행하여 다음을 확인한다.

- 자동화 5 RPC의 존재, 정확한 signature·반환형
- service_role 실행 권한 및 anon/authenticated 실행 권한 부재
- `evidence_changed_at`, `auto_input_hash`, `auto_retry_at`, `auto_retry_hash`, `auto_outcome`, `auto_reasons` column
- 선행 v3·work identity schema, 현재 view 필드와 기존 receipt 2건
- PostgREST/OpenAPI 노출과 schema cache 상태

함수·column이 이미 존재하면 non-idempotent migration을 재실행하지 않는다. 부분 적용 또는 예상과 다른 signature가 있으면 SQL 적용을 중단하고 정확한 차이를 기록한다.

## 3. 조건부 migration 적용 — 이번 작업에서 허용

사전 확인 결과 migration이 실제로 미적용이고 선행 schema가 충족된 경우에만 다음 파일 전체를 한 트랜잭션으로 운영 DB에 적용한다.

- `supabase/migrations/202610220001_program_automation.sql`

적용 실패 시 rollback을 확인하고 같은 파일을 반복 실행하지 않는다. 오류와 누락 선행조건을 기록한다. 별도 migration 파일, 과거 draft 전체 재적용, 기존 receipt 삭제·수정은 허용하지 않는다.

적용 후 다시 읽기 전용으로 RPC·권한·column·view와 기존 확정 2건 보존을 확인한다. API schema reload가 필요한 경우 migration에 포함된 notify 결과를 확인하되 권한을 우회하지 않는다.

## 4. PF295548 제한 canary

운영 쓰기 전 다음 dry-run을 실행하고 결과를 기록한다.

- 대상 공연: `PF295548`
- 예상 양성: `brahms-intermezzo-op118-no2`
- 기존 확정 보존: `chopin-ballade-op52-no4`, `liszt-liebestraum-s541-no3`
- 잘못된 Op/상위 작품만의 악장/편곡/만료·비활성 근거는 자동 확정 금지
- 원격 dry-run 쓰기 0

dry-run이 고정 규칙·로컬 대표 결과와 일치할 때만 `PF295548` 한 공연에 한정해 save canary를 실행한다. canary 전후의 analysis/candidate/review 수와 candidate ID·track ID·outcome·reason을 비밀값 없이 기록한다.

성공 기준:

- 브람스 Op.118 No.2의 유효한 자동 receipt 1건과 운영 검색 연결
- 기존 쇼팽·리스트 확정 receipt의 ID·note·identity 보존
- 중복 유효 확정에 새 receipt 없음
- 모호·충돌·편곡 후보 자동 확정 0
- 실패·재시도 0 또는 정확한 원인 기록
- 같은 입력 즉시 재실행의 원격 쓰기 0
- 서울·대상 기간 검색 API에서 PF295548 확인, 웹 DTO까지 확인
- 실제 UI/브라우저를 확인하지 않았으면 API 성공과 구분

예상과 다르거나 확인되지 않은 candidate가 하나라도 자동 확정되면 추가 저장을 즉시 중단하고 결과를 BLOCKED로 기록한다.

## 5. 예약 자동화 연결

canary 성공 후 현재 `ClassicAtlas-LocalPipeline`의 daily 08:40 KST 경로가 검증한 자동화 코드와 동일한지 확인한다.

- 시간·daily 프로필·IgnoreNew·PT32M은 임의 변경하지 않는다.
- 초기 `PROGRAM_BATCH_SIZE`가 1인지 확인한다. 1이 아니거나 확인할 수 없으면 정기 자동 확장을 허용하지 않고 보고한다.
- 전체 과거 후보를 수동으로 일괄 backfill하지 않는다.
- 통합 전체 배치를 임의로 즉시 실행하지 않는다.
- 다음 예약 실행에 필요한 preflight가 통과하는 상태까지 준비하고, 실제 다음 실행 결과는 실행 이후 별도 근거로 검토한다.
- 예약 경로가 미공유/다른 코드면 사용자 원본을 덮어쓰지 말고 안전한 배포·경로 전환 방안을 제안한다.

## 6. 검증과 보고

- 기능 단위 및 기존 전체 테스트, build를 실행한다.
- migration은 가능한 경우 격리 PGlite/PostgreSQL에서도 다시 검증한다.
- 운영 쓰기 횟수와 대상 범위를 정확히 기록한다.
- 운영 SQL 적용, canary 저장, 공개 검색 확인, 예약 준비를 서로 다른 상태로 보고한다.
- CURRENT_TASK를 IMPLEMENTED 또는 BLOCKED로 갱신하고 HANDOFF에 고정 결과 SHA, 실행 환경, SQL 적용 결과, before/after, 테스트, 미해결 사항을 기록한다.
- main 병합·Vercel 배포·예약 시간 변경은 하지 않는다.

## 완료 기준

- [x] 기존 로컬 변경과 사용자 index가 보존됨.
- [x] 관리자 읽기 전용 SQL로 운영 DB 실상과 API 노출 차이를 확인함.
- [x] 필요한 경우 지정 migration만 원자적으로 적용하고 재검증함.
- [x] 기존 수동 확정 2건을 변경하지 않음.
- [x] PF295548 dry-run과 제한 save canary의 모든 후보 결과를 기록함.
- [x] 명확한 브람스 후보만 새 자동 확정되고 모호한 후보의 자동 확정은 0임.
- [x] 같은 입력 재실행의 새 쓰기가 0임.
- [x] 운영 검색에서 브람스와 기존 쇼팽·리스트를 대조함.
- [ ] 예약 경로·실행 코드·초기 batch size 1 조건을 확인함.
- [x] 테스트/build 및 운영 미검증 범위를 구분해 보고함.
- [x] HANDOFF와 CURRENT_TASK를 같은 작업 ID·명세 버전·상태로 게시함.

## 상태 기록

| 날짜 (Asia/Seoul) | 기록자 | 내용 |
| --- | --- | --- |
| 2026-10-22 | 웹 GPT | READY: 사용자 요청에 따라 명확한 후보의 운영 자동 확정을 단계적으로 활성화. 관리자 사전 확인, 필요 시 지정 migration 적용, PF295548 제한 canary까지 승인. 전체 backfill·무제한 쓰기·main 병합은 제외. |
| 2026-10-22 14:21 KST | Codex | BLOCKED: 관리자 SQL 연결/도구 부재로 실제 미적용·선행조건 확인 불가. 원본33개 파일/index 보존, 핵심15파일 고정 코드 대조, 회귀365/365·build 및 격리 migration/preflight SQL 검증 완료. 운영 SQL·dry-run/save·API 조회·DB 쓰기 미실행. 정기 자동화의 batch size1도 별도 미충족. |
| 2026-10-22 14:45 KST | Codex | 재개: 사용자 .env 관리자 연결 존재/성공 확인. READ ONLY SQL로 실제 미적용과 선행조건 확인 후 지정 migration1회, PF295548 한정 canary 성공. 기존2receipt 전체row digest 보존, 즉시 재실행POST0, 운영3곡 검색/DTO 확인. |
| 2026-10-22 14:45 KST | Codex | BLOCKED 사유 갱신: 관리자 연결 차단은 해소. DB/Python/모델 preflight PASS지만 daily 자동 이미지20/후보100으로 정기 상한1 조건 미충족. 운영 한정 canary PASS와 정기 확대 BLOCKED를 분리. |

## 이전 차단 기록 — 14:21 KST (관리자 연결 부재는 현재 해소됨)

- 관리자 SQL 읽기 연결이 필요하다. 로컬 프로세스/프로젝트 설정에는 REST용 Supabase 연결만 있고 관리자 DB URL·PG 설정·관리 토큰은 없다. psql/supabase/docker 및 연결된 SQL 도구도 확인되지 않았다. 실제 운영 SQL은 실행하지 못했으며 REST 비노출을 실제 미적용으로 대체하지 않았다.
- 사용자에게 비밀값을 채팅에 보내지 않고 `CLASSIC_ATLAS_DATABASE_URL`을 로컬 환경에 설정해 알려 달라고 요청했다. 답변 대기이며 migration/save 승인을 다시 요청하는 것이 아니다.
- 관리자 읽기 확인 → absent/complete/partial 구분 → 지정 migration 필요 시 1회 → 권한/receipt 재확인 → PF295548 dry-run → 일치할 때만 scoped save 순서를 유지한다. 이 지점까지 새 운영 쓰기0이다.
- `PROGRAM_BATCH_SIZE` 명시 설정은 없고 웹 프로그램 확인의 유효값1만 확인했다. daily 자동화는 analysisLimit20·candidateLimit100을 사용하므로 자동 쓰기 상한1을 보장하지 않는다. 정기 자동 확장은 허용하지 않았고 예약을 변경하지 않았다.

## 최신 재개 결과 — 2026-10-22 14:45 KST

- 관리자 연결은 존재/연결 성공 여부만 기록했다. 실제 연결 문자열·비밀번호·대상 hostname/user는 출력·로그·문서·Git에 넣지 않았다.
- 관리자 READ ONLY 사전 SQL: 선행8함수의 signature/반환형/권한 및 view 일치, 자동화5함수/7컬럼 실제0, 기존 수동 CONFIRMED2건 확인.
- 고정 코드와 같은 `202610220001_program_automation.sql` 전체를 운영에1트랜잭션으로1회 적용했다. 사후5함수/7컬럼·타입·service_role 권한 및 anon/authenticated 실행 권한 부재를 확인했다.
- PF295548, 이미지 상한1·후보상한20으로 dry-run(GET8/POST0) → save(GET9/POST17) → 같은입력 즉시재실행(GET3/POST0)을 수행했다. 새 브람스 자동 확정1, 기존 확정 유지2, 미연결12, 실패/재시도0.
- analysis/candidate/review 수: 3/30/2 → 4/45/17. 새 review는 CONFIRMED1 + REJECTED14(중복 후보2 포함). 기존2receipt의 ID·note·identity를 포함한 전체 row digest는 같고, 중복 새 CONFIRMED는0이다.
- 브람스·쇼팽·리스트 운영 검색 HTTP200/PF295548 각1, 웹 DTO의 track/work/EXACT/CONFIRMED 확인. 실제 UI/브라우저는 미확인.
- 실제 예약 디렉터리의 DB schema 및 Python/모델 사전 검사 PASS, GET13/POST0, 실제 통합 배치·KOPIS·OCR·정리·배포·예약 변경0.
- 남은 조건은 정기 자동 처리 상한1이다. 현재 daily는 이미지20·후보100이며 웹 config1로 대신 증명할 수 없다. **기존 예약은 Enabled 그대로이므로 다음 실행은20/100 상한으로 동작할 수 있다.** 이번 작업은 정기 확장을 준비 완료/승인으로 표시하지 않는다.
- 다음 단계 제안: 전용 자동화 상한1을 검증한 고정 버전을 별도 release 디렉터리에 준비 → 원본 .env를 안전하게 참조하는 launcher/preflight 검증 → 기존 action 백업과 rollback 경로를 준비한 뒤 action 전환 검토. 08:40/daily/IgnoreNew/PT32M 및 원본33개 작업은 유지한다. 이번에는 전환하지 않았다.
| 2026-10-22 | 웹 GPT | 명세 2 READY: 사용자가 특정 육안 사례 확인보다 현재 저장 공연 전체에서 더 많은 등록곡이 매칭되도록 다음 단계 진행을 지시. 전체 dry-run, 전용 정기 상한3/30, 묶음당3/30·누적20/100의 운영 저장, 제한된 추출·matcher 개선을 추가 승인. |
