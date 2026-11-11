# 좋아요 UX 운영 결과 인계

CA-SOCIAL-LIKE-UX-20261111-001 / 통합 명세 / **DEPLOYED**. 기록 2026-11-11 17:03:50 KST. 결과 브랜치 codex/ca-social-like-ux-20261111-001-production, 기능 283decdf99d54ca1969d4983e97a2c9cd189751d, PR #29 HEAD 7069cf1318b00b51d324a4d11faca966fca1dc9e, 코드 기준 merge/main·Vercel ed77628aef351a5655c382f97a40f8a75026e78a.

## 구현·운영

Optimistic 개별 pending/token·server reconcile, typed like background refresh, 일반 권한 이벤트 clear-first를 구현했다. 전체174/SNS5/전용3/SQL(전용 중2)/모바일3·build PASS. 새 migration을 2026-11-11 16:56:07 KST 적용/후속 확인 완료, likes0→0·행 지문/다른trigger/RLS/기존RPC 동일, private ACL revoke 확인. PR #29 16:56:38 KST 병합·Production Ready/SHA/alias/HTTP200 확인. 추가 기능 코드 수정0.

## 실검증·한계

합성 A/B/C 실제 비밀번호 Auth·A/B/C/익명 범위 매트릭스, 운영320/375/390의 즉시 좋아요·취소/scroll/focus/DOM/펼침/댓글 초안 유지, 합성503 rollback, 두 운영 브라우저+실 SDK typed Realtime, 범위 변경/팔로우 취소/차단/공유 취소 권한 회귀 PASS. 초기 원시 프레임 보조 관측2회는 형식 해석 한계로 실패 처리했고 실 SDK 관측으로 해결했다. 각 시도 계정3개씩 총9개 정리·기존 행 지문 유지, 자격증명 상태 파일 제거. 사용자 자료를 쓰기/공개/삭제하지 않았다.

실 Google OAuth·실기기 iOS/Android PWA/IME·실 통신 장애 미검증. 60개 추가 로드는 로컬 합성 검사다. PWA 결과 브랜치/기존 dirty 파일52개·HEAD를 보존했고 **IOS_CONFIRMATION_PENDING**을 변경하지 않는다.

## 다음 확인·복구

[운영 결과](docs/SOCIAL_LIKE_UX_PRODUCTION_2026-11-11.md) · [안전한 JSON](docs/SOCIAL_LIKE_UX_PRODUCTION_VERIFICATION_2026-11-11.json) · [구현](docs/SOCIAL_LIKE_UX.md). 변경은 결과 문서/JSON·공동 문서뿐이며 런타임 추가 변경0. 최종 문서 SHA/clean 여부는 Git 이력/최종 보고를 따른다. 문서 PR은 별도 승인 전 생성/병합하지 않는다. 코드 rollback은 merge ed77628aef351a5655c382f97a40f8a75026e78a 별도 revert -m 1, DB는 [명시적 rollback](supabase/rollback/202611110001_social_like_invalidation.sql)로 일반 trigger 복원·전용 함수 제거만 수행한다. 전체 DB restore/사용자 자료 변경/강제 push/환경·설정 복구 없음.
