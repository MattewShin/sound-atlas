# 현재 작업

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 1
- 제목: 명확한 공연 프로그램 후보의 운영 자동 확정 활성화
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

이번 작업은 조사만 하는 작업이 아니다. 아래 안전 조건을 만족하면 운영 DB migration 적용과 PF295548 제한 canary 저장까지 명시적으로 허용한다. 전체 과거 데이터 일괄 backfill이나 무제한 자동 확정은 허용하지 않는다.

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

- [ ] 기존 로컬 변경과 사용자 index가 보존됨.
- [ ] 관리자 읽기 전용 SQL로 운영 DB 실상과 API 노출 차이를 확인함.
- [ ] 필요한 경우 지정 migration만 원자적으로 적용하고 재검증함.
- [ ] 기존 수동 확정 2건을 변경하지 않음.
- [ ] PF295548 dry-run과 제한 save canary의 모든 후보 결과를 기록함.
- [ ] 명확한 브람스 후보만 새 자동 확정되고 모호한 후보의 자동 확정은 0임.
- [ ] 같은 입력 재실행의 새 쓰기가 0임.
- [ ] 운영 검색에서 브람스와 기존 쇼팽·리스트를 대조함.
- [ ] 예약 경로·실행 코드·초기 batch size 1 조건을 확인함.
- [ ] 테스트/build 및 운영 미검증 범위를 구분해 보고함.
- [ ] HANDOFF와 CURRENT_TASK를 같은 작업 ID·명세 버전·상태로 게시함.

## 상태 기록

| 날짜 (Asia/Seoul) | 기록자 | 내용 |
| --- | --- | --- |
| 2026-10-22 | 웹 GPT | READY: 사용자 요청에 따라 명확한 후보의 운영 자동 확정을 단계적으로 활성화. 관리자 사전 확인, 필요 시 지정 migration 적용, PF295548 제한 canary까지 승인. 전체 backfill·무제한 쓰기·main 병합은 제외. |
