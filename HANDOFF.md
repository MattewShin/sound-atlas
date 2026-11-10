# 음악 이야기·내 프로필 통합 인계

- 작업 ID: **CA-NAV-PROFILE-IA-20261110-001 / 명세1**
- 상태: **IMPLEMENTED** (검토 전, ACCEPTED 아님)
- 브랜치: `codex/ca-nav-profile-ia-20261110-001`
- 기준 main: `465173d2e2e41ee58f387b18b6897a3e29cbaff9`
- 기능·테스트 코드 전체 SHA: **`1a03ca832329a356fa15a615af568958244c911e`**
- 게시: [Draft PR #24](https://github.com/MattewShin/sound-atlas/pull/24), head `codex/ca-nav-profile-ia-20261110-001`, base main. 기능 SHA 이후는 문서 보완뿐이다.
- 원래 IDE: codex/ca-social-20261106-001 / `8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e`, 기존 파일52개·HEAD·문서·미커밋/비추적 변경 보존. 별도 worktree에서 진행했다.
- 결과: [정보 구조·코드·보존·한계](docs/NAV_PROFILE_IA.md), [검증 JSON](docs/NAV_PROFILE_IA_VERIFICATION_2026-11-10.json), [사용자 명세](docs/NAV_PROFILE_IA_SPEC.md)

## 구현 결과

음악 이야기 헤더 MUSIC STORIES/음악 이야기 및 공개 피드만 남겼다. records/profile/계정/차단 관리 탭과 자신의 ProfileEditor를 없애고 참여 안내·내 프로필 이동을 제공한다. 타인 프로필·곡/게시물 딥링크·반응/댓글/팔로우/신고/차단·기존 Realtime 흐름을 유지했다. 본인 프로필은 통합 화면으로, 기록 작성은 내 기록 제목으로 스크롤·focus한다.

내 프로필은 공개 프로필/내 기록/나의 음악 취향/활동 관리/계정 순서다. 기존 프로필·개인 기록·공유·취향 차트/추천을 재사용하고 보관함은 보관곡만 남겼다. 곡 상세 기록 작성 유지. 계정 전환/로그아웃을 분리하고 계정 삭제는 맨 아래 위험 영역의 기존 2단계 확인이다. 내 프로필 기본 진입은 전체 feed/Realtime 구독0개, 내 게시물 섹션만 person 필터·기존 shared subscriber를 사용한다.

계정 전환은 계정 로컬 사본 삭제/화면 세션 폐기→로그아웃 완료→prompt=select_account OAuth 순서다. 기존 PKCE/redirect/client는 유지한다. 실패 시 OAuth 중단, 중복 클릭 잠금, 이전 refresh/지연 응답 차단, React 보관함 상태 소유자 분리와 이전 계정 동기화 대기 취소를 포함한다.

## 검증과 보존

최종 코드 기준 전체 **166/166**, SNS **5/5**, 신규 통합 **4/4**, production build **PASS**. 기존 큰 chunk 경고는 유지한다. JSDOM/실 JSX·PGlite·mock SDK transport이며 기존 SQL/REST 권한·Auth/session·Realtime invalidation 계약 회귀를 포함한다. 모바일 실제 Chromium 합성 **36/36 PASS**: 320/375/390/520px, 아이콘28/터치48·동일 너비·활성 aria-current/이름·Pretendard/자간/짝수크기/실제 줄별 leading·키보드focus·뒤로가기·하단 가림/가로 넘침0.

운영 DB 접근/변경0, migration 추가0, SQL/RLS/publication/삭제 cascade·API 계약·곡 ID/평가·Supabase 설정·패키지/lockfile 변경0이다. 실제 사용자 기록은 공개/수정/삭제하지 않았다. 신규 테스트는 합성 계정·기록만 사용하고 screenshot도 합성이다. 실제 Google 인증 완료/chooser·클라우드 PostgREST/Realtime·iOS/Android IME·운영 배포는 **미검증**이다. 로컬 검증을 실환경 검증으로 표현하지 않는다.

## 변경 파일과 구현자 의견

App·MusicSocial·MusicJournal·MusicSharing·useGoogleAuth·styles, 신규 MyProfile/SocialProfile 및 DOM fixture/검증, 기존 테스트의 접근 가능한 메뉴 이름을 수정했다. 상세 diff는 기능 SHA를 따른다. 이전 OCR CURRENT_TASK/HANDOFF를 함께 보관하고 새 명세/인계·PROJECT_CONTEXT·결과/증거/사진을 추가했다.

기존 서버 필터 API를 늘리지 않고 필터는 불러온 기록에만 적용하며 더 보기 제한을 화면에 설명한다. 차단 목록은 기존 API가 ID만 반환하므로 순번으로 구분하며 해제할 수 있다. 공개 프로필 미리보기는 공개 헤더이며 타인의 권한을 가장하지 않는다. 실제 IAM/RLS를 변경할 필요가 없어 migration은 만들지 않았다.

## 게시·다음 검토

변경 코드와 문서를 지정 브랜치에 push하고 Draft PR #24로 게시했다. 기능 SHA 이후 변경은 문서뿐이다. main 병합·운영 DB·운영 배포는 하지 않았다. 검토자는 프로필 공개/계정 정보 분리, 필터의 불러온 범위 표시, 딥링크/뒤로가기와 세션/구독 경계, 합성 모바일 결과 및 실 OAuth/PostgREST/Realtime 미검증을 확인하면 된다. 최신 문서 저장 HEAD는 GitHub 이력과 최종 게시 보고를 따른다.

## PR #24 검토 보완 — 명세1 유지

- 검토 기준 HEAD: `f343e6e753a8e8144ed0cf38148bbba951cc2f9a`
- 보완 기능·테스트 SHA: `1a03ca832329a356fa15a615af568958244c911e`
- `.profile-section p/a/button`의 일괄 normal 선언을 제거했다. 기존 공통 `[data-text-lines]` 규칙과 실제 줄 수 판별기는 그대로 유지한다. 전역 important 규칙 덕분에 삭제 전 대상 실측도 기준을 충족했지만 중복 기본 선언을 정리해 책임을 명확히 했다.
- scripts/profileTextMetrics.mjs는 production 분류 함수·data-text-lines 값을 신뢰하지 않고 글자별 Range 좌표로 실제 줄 수를 센다. scripts/testProfileMobile.mjs로 링크를 포함한 실제 줄 수/계산된 leading을 대조하고, 긴 프로필 버튼·기록 설명·공개 프로필 안내·계정 삭제 확인을 너비별16건 기록했다. 다중 줄에 normal!important를 강제한 대조군4건도 탐지했다.
- 필터는 전체/나만 보기/공개 중으로 변경했다. publication 없음/private와 followers/public을 서로 배타적으로 나눴으며 private 공유본을 공개 중에 넣지 않는다. 공유 중·나만 보기 중복 문구를 없앴다. 불러온 페이지에 적용하는 제한은 유지한다. 공유 범위 변경/공유 취소 API는 수정하지 않았다.
- 최종 전체166/166·SNS5/5·프로필4/4·모바일36/36·대상16·잘못된 줄 높이 탐지4·build PASS. 기존 chunk 경고 유지. 이전165/3/28 수치를 새 결과로 재사용하지 않았다.
- 검토 기준 이후 MusicSocial·MyProfile 구조/라우팅·App·Google 세션·공유 범위 변경/취소 구현·SQL/RLS/Realtime/공유 ID/삭제 정책 변경0. 기능 변경은 CSS·기록 필터/상태 표시뿐이다. 운영 DB/병합/배포 미실행이며 실 OAuth/PostgREST/Realtime·실기기 IME 한계는 그대로다.
