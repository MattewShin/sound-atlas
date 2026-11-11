# PWA 상단 상태바 운영 반영

- 작업 ID: CA-PWA-TOP-SAFE-AREA-20261111-001
- 명세 버전: 2
- 상태: **DEPLOYED / IOS_CONFIRMATION_PENDING** (IMPLEMENTED: 운영 반영 완료, 실제 iOS 해결 확정 아님)
- 기록: 2026-11-11 13:59:00 KST
- 운영 코드·main·배포 SHA: de4f78d2b00edae6166348194e1a648c8d0e184a
- 승인 PR HEAD: 3a2cf97b93b17fa5dd79e0c7a3ad1ea20e2e04ad
- 결과 문서 브랜치: codex/ca-pwa-top-safe-area-20261111-001-production

사용자 명세1 코드 방향 승인 후 PR #28 Ready→main 병합, Vercel Production Ready와 alias·HTTP200·default meta·cover 유지를 확인했다. 운영 익명 Chromium13화면×320/375/390px=39/39 PASS. 기존171/5/78·build 증거만 확인했고 전체 테스트는 반복하지 않았다. DB/migration/환경·설정/사용자 자료 변경0. 결과 문서 PR은 생성·병합하지 않는다.

실제 iPhone PWA/Safari/Android 설치형·native insets·실기기 IME·Google OAuth/인증 PostgREST/Realtime와 완전 오프라인 대체 화면은 미검증. 사용자 iPhone 재실행/필요시 재설치 후 상단 흐림·잘림·여백·하단 확인을 기다린다. 확인 전 CLOSED/iOS PASS 금지.

[운영 결과·수동 절차](docs/PWA_TOP_SAFE_AREA_PRODUCTION_2026-11-11.md) · [검증 JSON](docs/PWA_TOP_SAFE_AREA_PRODUCTION_VERIFICATION_2026-11-11.json) · [HANDOFF](HANDOFF.md) · [명세1 보관](docs/collaboration/archive/CA-PWA-TOP-SAFE-AREA-20261111-001/spec1/CURRENT_TASK.md)
