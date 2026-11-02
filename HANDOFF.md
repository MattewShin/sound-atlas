# 작업 인계

- 작업 ID: CA-GOOGLE-PERSONALIZATION-20261102-001 / 명세1
- 상태: IN_PROGRESS / 운영 migration 사용자 적용 완료·production 검증 대기
- 작성: 웹 GPT / 2026-11-02 KST
- 브랜치: codex/ca-google-personalization-20261102-001
- 시작 기준: production / 1f138fc233b59d17ddecab5bc0a9b574a6a2cdd2

## 현재 확인

- 앱에는 Supabase browser client와 인증 UI가 없다.
- 보관 기록은 `classic-atlas-track-reactions-v1` localStorage에 있으며 `listenAgain`, `liked`, `updatedAt`을 사용한다.
- 나의 취향은 보관한 활성곡 ID를 기존 9개 감정 점수로 재계산하므로 별도 취향 벡터 저장은 필요하지 않다.
- 사용자 설정으로 Google OAuth Provider와 Vercel 공개 Config가 준비됐다.

## 구현 정책

- 내부 사용자 식별은 Supabase Auth UUID만 사용한다.
- DB에는 사용자별 곡 반응만 저장하며 Google access/refresh token은 저장하지 않는다.
- 최초 로그인은 로컬과 원격을 최신 수정시각 기준으로 병합하고, 이후에도 로컬 사본을 유지해 PWA·네트워크 장애 시 기존 화면을 보존한다.
- 로그아웃 후에는 원격 동기화를 중단하고 현재 기기의 로컬 보관함을 비회원 상태에서 유지한다.
- 운영 migration은 격리 테스트와 전체 회귀 통과 전에는 적용하지 않는다.

## 결과

- React에 Supabase PKCE 세션 복원과 Google 로그인·로그아웃을 연결했다.
- 비회원 localStorage 보관함은 유지하며, 첫 로그인은 로컬·원격의 곡별 `updated_at` 최신값으로 병합한다.
- 로그인 후 보관·해제는 화면과 로컬에 먼저 반영한 뒤 원격 RPC를 순차 호출한다. 실패해도 로컬 자료는 유지하고 화면에 동기화 오류를 표시한다.
- 다른 사용자로 전환할 때 이전 계정 소유 로컬 자료를 새 계정에 업로드하지 않는다.
- DB에는 Supabase Auth UUID·곡 ID·보관/좋아요·수정시각만 저장한다. Google token·secret·이메일은 저장하지 않는다.
- `202611020001_user_track_reactions.sql` 격리 적용에서 익명 차단, 두 사용자 RLS 분리, 오래된 쓰기 차단, 본인 CRUD를 확인했다.
- Google OAuth 시작·callback URL·세션 이벤트·로그아웃 DOM 검증을 완료했다.
- 전체 테스트 122/122, fail 0·skip 0. production build PASS.
- 사용자가 2026-11-02 KST에 신규 migration SQL 적용 완료를 보고했다. 현재 실행 환경에서 관리자 연결로 적용 횟수를 독립 확인하지는 않았다.
- production 배포는 아직 0회다. 기존 production·KOPIS 캐시·예약 Disabled 상태는 변경하지 않았다.

## 재개점

1. PR을 main에 병합해 production을 배포한다.
2. production에서 익명 RPC 거부와 Google OAuth 시작 경로를 확인한다.
3. production `나의 취향`에서 Google 로그인 → 기존 로컬 보관곡 병합 → 곡 1개 보관/해제 → 새로고침 유지 → 로그아웃을 확인한다.
4. 가능하면 두 번째 계정에서 첫 계정 곡이 보이지 않는지 확인한 뒤 OPERATIONAL로 기록한다.

이전 PWA 작업은 [보관본](docs/collaboration/archive/CA-PWA-20261030-001/HANDOFF.md)에 보존했다.
