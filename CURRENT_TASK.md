# 현재 작업

- 작업 ID: **CA-OCR-RETIRE-20261109-001**
- 명세 버전: **1**
- 상태: **IMPLEMENTED / 검토 전**
- 기준 main/실제 운영 SHA: **2552f5b021238b65a8c4d2e235a342b12e498cde**
- 구현 코드 전체 SHA: **e8e204e31d0bf5c401fec2e12641c8183a0fb219**
- 결과 브랜치: **codex/ca-ocr-retire-20261109-001**
- 작성일: 2026-11-09 Asia/Seoul

## 범위·제품 정책

OCR를 영구 폐기하며 확정3건/모든 이력도 보존 이전하지 않는다. OCR5개 테이블과 전용 view/trigger/22함수를 명시적 RESTRICT migration으로 제거하도록 준비한다. 공식 Program text·수집·공유 helper 및 현재 보관함/개인 기록/공유/SNS/Auth/API/Realtime를 유지한다. 사용자 원래 WIP·실제 .env·로컬 모델을 보존한다.

이번 허용은 새 브랜치·코드/migration·test/build·Draft PR·적용/backup/rollback 안내까지다. **운영 migration/main 병합/운영 배포·예약/실제 환경변수 변경·로컬 model 삭제는 하지 않는다.** 새 의존성을 발견하면 적용은 BLOCKED로 보고한다.

## 완료 결과

실제 main/배포·DB 재조회에서 새 의존성 없음, 운영 READ ONLY 사전 SQL 11:02:34 KST PASS. 격리 DB에서 26→21 table,65→43함수,4→3view,38→27FK,15→14앱 trigger와 유지 데이터/권한 불변, 신규 text 저장/확정, 전체 rollback 및 새 의존성 차단을 검증했다. 전체162/162·SNS5/5·폐기15/15·정적검사/build PASS다. 운영 적용은 전부 미실행이다.

[구현·적용/복구 안내](docs/OCR_RETIREMENT.md), [검증 증거](docs/OCR_RETIREMENT_VERIFICATION_2026-11-09.json), [HANDOFF](HANDOFF.md)를 함께 검토한다. 이전 감사 작업의 [명세/인계 보관본](docs/collaboration/archive/CA-OCR-DB-AUDIT-20261109-001/spec1/)과 원문 감사3개도 보존했다. Draft PR과 문서 저장 HEAD는 GitHub 브랜치 이력/최종 게시 보고로 확인하며 코드 SHA와 문서 저장 SHA를 구분한다.
