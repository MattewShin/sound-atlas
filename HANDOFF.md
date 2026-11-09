# 작업 인계 — OCR 제거 후 DB 정리 조사

- 작업 ID: **CA-OCR-DB-AUDIT-20261109-001**
- 명세 버전: **1**
- 상태: **IMPLEMENTED / 읽기 전용 조사 완료, 검토 전(ACCEPTED 아님)**
- 작성: Codex / 2026-11-09 Asia/Seoul
- 조사 브랜치: `codex/ocr-db-audit-20261109`
- 코드 기준 전체 SHA: **2552f5b021238b65a8c4d2e235a342b12e498cde** (`main` 및 실제 Vercel production 일치)
- 문서 저장 SHA: 이 브랜치의 GitHub 커밋 이력에서 확인. 코드와 운영은 위 SHA 유지. 이번 결과는 문서/집계 JSON만 변경하며 기능 코드 미커밋 변경 없음.
- 원래 IDE: `codex/ca-social-20261106-001` / **8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e** 및 사용자 공연/OCR/Program 미커밋·untracked 변경 보존. 별도 `.cache/ocr-db-audit-20261109` worktree에서 조사/문서화.
- 결과: [정리 범위·행 수·크기·보존 판단](docs/OCR_DB_CLEANUP_AUDIT_2026-11-09.md), [테이블별 읽기/쓰기·FK/view/RPC/trigger 코드 근거](docs/OCR_DB_CODE_AUDIT_2026-11-09.md), [운영 집계·카탈로그 JSON](docs/OCR_DB_AUDIT_METADATA_2026-11-09.json).

## 결과와 구현자 의견

운영 public24/private2 테이블을 OCR 전용 미사용5, 수집/Program text8, 현재 서비스13으로 분류했다. 발견된 앱 테이블 중 용도 미상은0개이나, 감사 영수증 보존 기간·외부/수동 호출 종료 여부·확정 이력 장기 보존 방식은 확인/결정이 필요하다.

OCR 전용5개 전체는 **3,792,896 bytes(3.62 MiB)**로 조건부 정리 후보다. 하지만 현재 유효한 OCR 확정3건(공연1/등록곡3, 모두 공연기간 종료)의 원시 증거/analysis/review를 포함하므로 즉시 안전하게 회수 가능하다고 확인된 DB 공간은 **0 bytes**다. 기존 graph 보존 또는 새 이력 모델 이전과 검증을 먼저 권장한다. ID tuple만 복사하면 현행 evidence 재검증 보장을 유지하지 못한다. 이 권장안은 새 제품 정책이나 migration 승인으로 취급하지 않는다.

공식 Program text analysis1/candidate18/유효확정2건과 공용 concerts/images/catalog/version policy를 유지해야 한다. 현재 웹 공연 조회는 KOPIS+browser_cache만 사용하고 OCR 확정 연결을 읽지 않는다. 기존 곡 ID·개인 기록·공유본·SNS/auth는 OCR graph와 FK가 분리되어 모두 유지 대상이다. 현재 실제 개인 원본/공유본이 존재하며 본문을 조회/출력하거나 시험 공개·삭제하지 않았다.

기존 cleanup은 예상 inbound FK10개에 고정되어 실제12개(text 부모2개 추가)와 맞지 않는다. 소스와 동일한 정의라면 BLOCKED_UNEXPECTED_FOREIGN_KEY로 차단될 것으로 예상되며, text confirmation에는 NO ACTION 및 변경/DELETE/TRUNCATE 차단 trigger도 있다. 기존 삭제 RPC를 실행하거나 우회하지 않았다.

## 실제 예약·Storage

- Windows `ClassicAtlas-LocalPipeline` **Disabled/Enabled=false**. 마지막2026-10-29 08:40 KST/결과0. 매일08:40 trigger는 남지만 비활성 task의 next nominal 값은 실행 보장이 아니다. 등록 동작은 `-Mode run`이며 실제 target은 clean frozen release **1db327cd38dfce778da543738f975b70789aed66**, manifest320개 hash 일치.
- frozen launcher는 collection/공식 text=true, OCR/analysis/cleanup=false다. 다시 켜면 공식 text DB 쓰기/최대1건 확정이 가능하므로 OCR 제거와 배치 전체 폐기는 구분해야 한다. launcher/배치/verify 모드도 이번에 실행하지 않았다.
- DB의 cron.job/pgagent 없음, Vercel 실제 deployment/project cron 정의0. 현재 main 추적 트리에 GitHub workflow 없음. 타 PC/별도 외부 예약·수동 호출은 전역 검증 불가.
- Supabase Storage bucket/object **0**, 이미지 파일 회수량0. images119행은 외부 URL 메타데이터이며 바이너리 아님.
- 로컬 `.cache/easyocr/models` 가중치2개 **99,233,863 bytes(94.64 MiB)**, 해당 cache의 tmp 이미지0. 모델 용량은 DB 회수량/이미지 Storage와 별도이며 삭제하지 않았다. Python 환경·다른 증거/백업·임의 외부 폴더 전체는 조사/회수량에서 제외.

## 실행한 검증과 한계

2026-11-09 09:41:25 KST 테이블 COUNT/인덱스·TOAST 포함 크기, 09:44:21 KST 확정 status 집계를 운영 DB에서 실행했다. 인증서 검증 TLS 및 명시적 REPEATABLE READ READ ONLY transaction의 read_only=on을 확인했다. default_transaction_read_only=off와 구분하며 DB 기본값을 변경하지 않았다.

실행/확인: 앱 테이블26·FK38·함수65·앱 trigger15·view4와 직접 relation 의존성20, 함수 본문의 안전한 이름 참조/간접 호출, 실제 Storage 집계, cron/Windows/Vercel 읽기 확인, 고정 SHA의 코드/SQL·batch 진입점 추적. 사용자 본문·이미지 원문·URL·Auth UUID·DB 접속정보·비밀값은 보고서/JSON에 없음. 함수 원문은 저장하지 않았다.

파일별 migration ledger가 운영에 없어 적용 순서/시각을 복원할 수 없다. draft 전제 v3 객체/policy가 실제 존재하므로 migrations만으로 재구축 가능하다고 보장하지 않는다. 함수/view 본문 전체의 동일성, 외부 호출 부재, 최소 보존 graph, 부분 행 정리 후 물리 회수량, 백업 복원 성공은 미검증이다. COUNT/함수 조회의 catalog 열 오기·미존재 ledger 조회 실패는 읽기 transaction으로 종료하고 실제 schema에 맞춰 재집계했다.

문서/JSON 검증 PASS: 26개 표/합계/분류, FK·함수·trigger·view 수, 고정 SHA 근거 파일/줄, 상대 링크, UTF-8, 실제 env 접속·비밀값/비밀 패턴 제외, 원래 파일52개 hash/원래 HEAD 보존, 기능 코드 diff 없음을 확인했다. 공개 matcher enum인 PROGRAM_SEARCH_VERSION만 비밀값 검사에서 구분했고 운영 policy 집계에 같은 값이 존재한다. 결과 로그는 Git 제외 `.cache/report-verification.json`이다. 기능 코드가 바뀌지 않아 앱 전체 테스트/빌드·OAuth/PostgREST 쓰기/Realtime·모바일 검증을 반복하지 않았으며 이번 조사 결과를 해당 기능 테스트로 표현하지 않는다.

## 변경 파일·게시·운영 적용

변경은 CURRENT_TASK/HANDOFF, 새 조사 문서2개·집계 JSON1개, 이전 SNS 명세2 CURRENT_TASK/HANDOFF 보관본이다. 보관본은 내용 이력을 유지하고 위치 이동에 따른 Markdown 상대 링크만 고쳤다. PROJECT_CONTEXT/AGENTS/앱 코드/migration/package/env는 수정하지 않았다.

이번 조사 브랜치만 commit/push하여 공유하고 main에 병합하지 않는다. PR 생성/운영 배포·migration/DDL/DML·Storage 삭제·예약/권한 변경·데이터 복구는 **모두 미실행**. 이번 사용자 요청은 조사만이며 이전 SNS 운영 적용 승인을 OCR 삭제 승인으로 재사용하지 않는다.

## 다음 검토 요청

정리 후보의 분류·보존 필요성을 검토하고 OCR 확정3건의 장기 보존 범위와 cleanup 영수증71건의 보존 기간을 결정해야 한다. 실제 삭제 단계는 별도 요청 후 백업/복구 확인, 확정 보존 설계/이전, 현 FK graph 사전 검사 및 의존 객체/옛 수동 진입점 정리를 구체화한다. 이번 보고서가 삭제 실행 계획의 승인 또는 복구 성공 증거는 아니다.

## 이전 작업 보관

SNS **CA-SOCIAL-20261106-001 / 명세2**의 두 문서를 [보관 폴더](docs/collaboration/archive/CA-SOCIAL-20261106-001/spec2/)로 함께 보관했다. 해당 문서의 과거 배포 승인/실행 결과와 현재 OCR 읽기 전용 조사를 구분한다. 기존 MUSIC_SOCIAL/운영 결과 문서는 변경하지 않았다.
