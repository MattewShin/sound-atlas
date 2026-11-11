# 음악 이야기 좋아요 UX 통합 개선

- 작업 ID: CA-SOCIAL-LIKE-UX-20261111-001
- 명세: 통합 구현·검증·운영 적용
- 상태: IMPLEMENTED (운영 적용 전 검증 완료)
- 기준 main: de4f78d2b00edae6166348194e1a648c8d0e184a
- 브랜치: codex/ca-social-like-ux-20261111-001
- 기록: 2026-11-11 16:54:09 KST

게시물별 optimistic 좋아요·pending·실패 rollback, typed like invalidate의 background 동기화, 권한 이벤트의 clear-first 유지. 새 migration은 likes trigger/private function만 교체하며 행/RLS/RPC를 바꾸지 않는다. 전체/SNS/전용·SQL/320·375·390px/build → Draft 자체 검토·Preview → 운영 복구 근거/사전검사 → 단일 transaction migration → PR 병합/Production Ready → 안전한 합성 계정/자료로 실제 API/다중 창 검증·정리 순서다. 결과 문서 PR은 생성·병합하지 않는다.

PWA 작업은 **DEPLOYED / IOS_CONFIRMATION_PENDING** 유지. 해당 [결과 브랜치](https://github.com/MattewShin/sound-atlas/tree/codex/ca-pwa-top-safe-area-20261111-001-production)와 기존 dirty 작업을 변경하지 않는다. PWA 결과 문서는 이번 PR에 이식하지 않는다. [main 당시 명세1 보관](docs/collaboration/archive/CA-PWA-TOP-SAFE-AREA-20261111-001/spec1/CURRENT_TASK.md).

기능 SHA: 283decdf99d54ca1969d4983e97a2c9cd189751d
[구현·적용·rollback](docs/SOCIAL_LIKE_UX.md) · [검증 JSON](docs/SOCIAL_LIKE_UX_VERIFICATION_2026-11-11.json)
