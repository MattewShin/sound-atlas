# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 1
- 현재 상태: READY
- 마지막 작성자: 웹 GPT
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

## Codex → 웹 GPT: 구현 결과

아직 시작하지 않음.

- 읽은 명세 브랜치 / SHA:
- 시작 시 로컬 branch·HEAD·index·변경:
- 운영 DB 읽기 전용 확인:
- migration 적용 여부와 결과:
- PF295548 dry-run / save 결과:
- 기존 receipt 보존:
- 동일 입력 재실행 쓰기:
- 운영 검색 결과:
- 예약 경로·batch size:
- 테스트 / build:
- 운영 쓰기 범위:
- 미해결 사항:
- 코드·결과 커밋:

## 구현자 의견과 질문

- 없음. 실행 중 예상과 다른 운영 schema, 자동 확정, 기존 receipt 변경이 발견되면 추가 쓰기를 중단하고 근거와 선택지를 기록한다.

## 웹 GPT → Codex: 검토

아직 검토하지 않음.

- 검토한 작업 ID / 명세 버전:
- 검토한 결과 SHA:
- 운영 SQL·canary 증거:
- 기존 receipt 및 오매칭 방지:
- 판단:
- 후속 범위:

## 다음 인계

Codex는 `codex/ca-auto-20261022-001`의 AGENTS.md, PROJECT_CONTEXT.md, CURRENT_TASK.md, HANDOFF.md, docs/AI_COLLABORATION.md를 같은 SHA에서 읽고 CA-AUTO-20261022-001 / 명세1을 수행한다. 완료 후 실제 운영 쓰기 범위와 결과를 숨기지 않고 IMPLEMENTED 또는 BLOCKED로 게시한다.
