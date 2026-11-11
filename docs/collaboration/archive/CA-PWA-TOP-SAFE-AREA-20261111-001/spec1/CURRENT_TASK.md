# PWA 상단 상태바 보완

- 작업 ID: CA-PWA-TOP-SAFE-AREA-20261111-001
- 명세 버전: 1
- 상태: IMPLEMENTED (구현자 보고, 실제 iOS/검토 미확인)
- 기준 main: 3e4e163fbc77577354dddc783d174ccb2893258a
- 기능·검증 SHA: b8b15cf25f5c80ac3dd3f36eb4f5971c49303c20
- 브랜치: codex/ca-pwa-top-safe-area-20261111-001
- 기록 시각: 2026-11-11 13:36:42 KST

상태바 default와 불투명 크림색 canvas를 적용했다. 실제 중첩 증거 없이 일반 헤더 top inset은 추가하지 않았고, 기존 모달 inset/헤더 장식/하단 safe-area를 유지한다. 브랜드 클릭 영역만 텍스트 위치를 유지하며44px로 보완했다. 전체171/정적PWA5·build PASS. 모바일 수정78/기준78 비교(일반39,standalone CSS시뮬레이션39) PASS. 실제 iOS PWA/Safari/Android 설치형·노치/홈 인디케이터/실기기는 미검증이며 iOS PWA PASS로 기록하지 않는다. DB·환경변수·OAuth·사용자 자료·main 병합·운영 배포 변경0.

[구현·재설치 안내](../../../../PWA_TOP_SAFE_AREA.md) · [검증 JSON](../../../../PWA_TOP_SAFE_AREA_VERIFICATION_2026-11-11.json) · [실측 JSON](../../../../PWA_TOP_SAFE_AREA_MOBILE_2026-11-11.json) · [HANDOFF](../../../../../HANDOFF.md) · [이전 CLOSED 작업 보관](../../CA-PROFILE-DASHBOARD-IA-20261110-001/spec2/CURRENT_TASK.md)
