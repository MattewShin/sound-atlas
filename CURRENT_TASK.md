# 현재 작업

- 작업 ID: CA-OCR-DB-AUDIT-20261109-001
- 명세 버전: 1
- 상태: IMPLEMENTED (조사 완료, 검토 전)
- 기준 코드: main / 2552f5b021238b65a8c4d2e235a342b12e498cde
- 조사 브랜치: codex/ocr-db-audit-20261109
- 작성일: 2026-11-09 Asia/Seoul

## 범위

운영 DB 스키마·행 수·인덱스 포함 크기·FK/view/RPC/trigger/배치 의존성, 현재 main 및 실제 예약 실행 경로, OCR 이미지 Storage를 읽기 전용으로 조사한다. 테이블을 OCR 전용 미사용/공연 수집·Program 텍스트 공유/현재 서비스 사용/용도 확인 필요로 분류하고, 확정 공연↔곡 연결 보존과 삭제 영향·예상 회수 공간을 기록한다.

DB 접속 정보·비밀값·사용자 본문은 출력/게시하지 않는다. 이번 요청은 조사만 승인한 것이며, 이전 SNS 운영 변경 승인과 별개다. DB DDL/DML/데이터·Storage 삭제·예약 변경·배치 실행·운영 배포·main 병합은 하지 않는다. 원래 IDE의 미커밋 변경을 보존한다.

이전 CURRENT_TASK/HANDOFF는 docs/collaboration/archive/CA-SOCIAL-20261106-001/spec2/에 함께 보관했다.

## 완료 결과

운영 읽기 전용 집계와 실제 예약/Storage 확인을 완료했다. [조사 보고서](docs/OCR_DB_CLEANUP_AUDIT_2026-11-09.md), [코드 의존성 부록](docs/OCR_DB_CODE_AUDIT_2026-11-09.md), [인계](HANDOFF.md)에 결과와 한계를 기록했다. OCR 전용5개는 3.62 MiB의 조건부 후보이고 유효 확정3건 보존이 선행되어야 한다. 삭제·운영 변경은 미실행이다.
