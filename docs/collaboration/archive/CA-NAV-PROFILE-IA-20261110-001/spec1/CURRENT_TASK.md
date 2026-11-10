> **명세1 보관 이력.** 승인 HEAD `2cfb28ffd0587a3f481029561b0ac8ff12dbd677`의 구현/검토 보완 기록이다. 최신 명세2 운영 상태는 [운영 보고서](../../../../NAV_PROFILE_IA_PRODUCTION_2026-11-10.md)를 따른다.

# 현재 작업

- 작업 ID: CA-NAV-PROFILE-IA-20261110-001
- 명세 버전: 1
- 상태: IMPLEMENTED
- 기준 main: `465173d2e2e41ee58f387b18b6897a3e29cbaff9`
- 기능·테스트 코드 전체 SHA: `1a03ca832329a356fa15a615af568958244c911e`
- 작업 브랜치: `codex/ca-nav-profile-ia-20261110-001`
- 게시: [Draft PR #24](https://github.com/MattewShin/sound-atlas/pull/24), main 대상, 검토 전

[사용자 명세](../../../../NAV_PROFILE_IA_SPEC.md)에 따라 음악 이야기 공개 탐색 전용화, 내 프로필 통합, 보관함 중복 제거, 아이콘 전용 내비게이션과 세션/이동 호환을 구현했다. 전체166·SNS5·신규 통합4·모바일36 및 build PASS. DB migration 불필요. 기존 데이터·권한 SQL/API·곡/평가·공유 ID는 유지한다. 운영 DB·main 병합·운영 배포는 미실행이며 Draft PR 검토 전이다.

[구현 결과](../../../../NAV_PROFILE_IA.md), [검증 JSON](../../../../NAV_PROFILE_IA_VERIFICATION_2026-11-10.json), [명세1 HANDOFF](HANDOFF.md)를 따른다. 이전 OCR 명세2 [명세/인계 보관](../../CA-OCR-RETIRE-20261109-001/spec2)을 함께 남겼다. 실제 OAuth/PostgREST/Realtime·실기기 IME는 미검증이다. 문서 HEAD·PR은 GitHub 이력과 최종 게시 보고에서 확인하며 기능 SHA와 구분한다.

## PR #24 검토 보완

명세1을 유지하며 기준 HEAD `f343e6e753a8e8144ed0cf38148bbba951cc2f9a`의 검토 의견을 반영했다. `.profile-section`의 p/a/button 일괄 line-height 선언을 제거하고 기존 실제 줄 수 규칙에 맡긴다. 4개 너비에서 독립 글자 Range 실측과 computed line-height를 대조했다(36 화면/대상16/잘못된 normal 탐지4). 필터는 전체·나만 보기·공개 중이며 private 공유본과 미공유는 나만 보기, followers/public만 공개 중이다. 데이터 구조·권한·공유 범위 변경/취소·딥링크/아이콘 메뉴는 유지한다. 전체166·SNS5·프로필4·build PASS.
