# 프로필 대시보드 구현 인계

게시: [Draft PR #26](https://github.com/MattewShin/sound-atlas/pull/26) · 브랜치 `codex/ca-profile-dashboard-ia-20261110-001`. 원격에 반영했으며 main은 병합하지 않았다.

- 작업 ID: CA-PROFILE-DASHBOARD-IA-20261110-001 / 명세1
- 상태: IMPLEMENTED (검토자의 ACCEPTED 아님)
- 브랜치: codex/ca-profile-dashboard-ia-20261110-001
- 코드 기준 전체 SHA: 45f31bff938b820d1cda81b0a28af5d688b0211f
- 기준 main: fe73abfccd4aafa62dedadbbaed3e1fa4abe099d
- 기록 시각: 2026-11-10 14:55:59 KST

## 구현 결과

홈은 공개 프로필 헤더/수정 진입/미리보기/관계 숫자, 내 기록·나의 취향·설정 세 메뉴와 기록 개수/최근3개다. 기록10개씩·취향 차트·프로필 편집·차단·개인정보·계정은 별도 hash 화면으로 이동했다. 계정 전환/로그아웃/삭제는 설정 최하단에 기존 컴포넌트를 재사용한다. 공개 글 관리는 내 기록의 공유본 본문 편집/공개 범위/링크/공유 취소로 보존한다.

전체 기능 이동표·데이터 요청·주소·모바일 증거·한계는 [구현 보고서](docs/PROFILE_DASHBOARD_IA.md), 수치 근거는 [검증 JSON](docs/PROFILE_DASHBOARD_IA_VERIFICATION_2026-11-10.json)과 [실측 JSON](docs/PROFILE_DASHBOARD_MOBILE_2026-11-10.json)에 있다. 코드 이후 커밋은 문서/증거만 추가한다. 최종 PR HEAD는 PR 메타데이터와 완료 응답을 기준으로 확인한다.

## 변경 파일

- src/App.jsx: 전체 프로필 hash 경로 전달, 기존 보관곡을 취향 요약에 전달.
- src/components/MyProfile.jsx: 요약 홈/하위 화면·필요한 화면만 마운트·제한된 요청/지연 응답 격리.
- src/components/MusicJournal.jsx: 전체 기준 서버 SELECT 필터/페이지·공유본 편집·focus 갱신.
- src/data/profileRecords.js, profileRoutes.js: 기존 소유자 API 기반 요약·쿼리와 호환 경로.
- src/styles.css: 간결한 목록/프로필 홈·하위 복귀·터치·계정 영역.
- scripts/profileIaDomTest.mjs, profileIaFixture.mjs, profileIaMobileEntry.jsx, profileRecords.test.mjs, test.mjs, testProfileIa.mjs, testProfileMobile.mjs, concertBrowserUi.test.mjs: 변경 구조와 기존 기능의 회귀/실측 검증.
- 공동 문서/보고서·검증 JSON·합성 화면9개 및 이전 작업 보관 쌍.

## 검증

전체170/170, SNS5/5, 프로필8/8, 모바일69/69(320/375/390px), production build PASS. 모든 fail/skip0, 실제 텍스트 줄 수/computed line-height와 잘못된 normal 대조군3개 확인. 실제 SDK 요청 구성과 합성 DOM에서 전체 상태 필터·10→20→23·홈3·오류 재시도·원본/공유 독립·삭제/공유 취소·주소/history·계정 전환/지연 응답/초안 격리 확인. 기존 build chunk 경고는 남는다.

DB schema/migration/RLS/RPC/Realtime·OAuth 로직/환경변수·추천 알고리즘/기존 곡 ID 파일 변경0. 운영 DB 접속/실제 사용자 자료 생성·공개·수정·삭제0. 원래 IDE의 dirty worktree와 HEAD를 보존했고 기준 파일52개 checksum을 대조했다. .env/실제 비밀값/사용자 본문을 커밋하지 않는다. 게시 전 링크/JSON/변경 범위/비밀값/로그를 검사한다.

## 구현자 의견·미해결

기존 승인된 분류를 유지해 publication 없음 또는 private는 나만 보기, followers/public은 공개 중으로 전체를 배타적으로 분류한다. private 공유본을 누락하거나 취소로 오인하지 않는다. 소유자 목록 RPC 한도와 공유 quota가 모두100이어서 전체 본문 없이 정확한 상태 필터가 가능하다. 상한 변경 시 이 전제를 재검토해야 한다. 요약의 병렬 API는 단일 트랜잭션이 아니며 offset 페이지 사이의 외부 쓰기에는 재진입/focus 갱신이 필요할 수 있다.

팔로워/팔로잉 목록 API가 없으므로 숫자는 기존 공개 헤더 미리보기로 이동한다. 실제 Google OAuth/chooser·계정 전환, 클라우드 PostgREST/RLS와 다중 창 Realtime·재연결, 실기기 IME/키보드/iOS Safari/PWA는 미검증이다. 합성 Auth/API/채널·SQL 테스트를 실서비스 검증으로 보고하지 않는다.

## 다음 검토 요청

홈의 정보 우선순위·하위 화면 이동·private 공유본 분류·기록/공개 글 관리 기능 보존과 화면 증거를 검토해달라. Draft 게시만 수행하며 main 병합·운영 배포·DB 작업은 이번 명세에서 실행하지 않는다. 이전 작업은 [명세2 보관 쌍](docs/collaboration/archive/CA-NAV-PROFILE-IA-20261110-001/spec2/CURRENT_TASK.md)을 참조한다.
