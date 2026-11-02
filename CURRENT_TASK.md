# 현재 작업

- 작업 ID: CA-GOOGLE-PERSONALIZATION-20261102-001
- 명세 버전: 1 / Google 로그인·사용자별 보관함·개인화 동기화
- 상태: BLOCKED / 운영 migration 적용 전
- 브랜치: codex/ca-google-personalization-20261102-001
- 시작 production SHA: 1f138fc233b59d17ddecab5bc0a9b574a6a2cdd2
- 요청: Google 로그인과 사용자별 보관함·개인화 연동

## 사용자 완료 설정

- Google Cloud OAuth Web Client 생성
- Supabase Google Provider Client ID·Secret 저장 및 Enabled
- Supabase Site URL·redirect allow list 설정
- Vercel `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` Config 등록 및 production 재배포

## 구현 범위

1. React 앱에 Supabase browser client와 Google OAuth 로그인·로그아웃을 추가한다.
2. 비회원은 기존 localStorage 보관함과 취향 기능을 계속 사용할 수 있다.
3. 로그인 시 로컬 보관 기록과 사용자 DB 기록을 `updated_at` 최신값 기준으로 병합한다.
4. 로그인 후 보관·해제는 로컬에 즉시 반영하고 사용자 DB에 동기화한다.
5. 사용자별 DB 테이블은 auth.users와 연결하고 RLS로 본인 행만 읽기·쓰기 가능하게 한다.
6. 기존 291곡 ID·점수·추천 계산을 변경하지 않고 동기화된 보관곡으로 기존 9축 취향을 계산한다.
7. Google provider token·Client Secret·service_role key는 브라우저나 DB에 저장하지 않는다.
8. KOPIS 공연 캐시·OCR 이력·Service Worker·예약 Disabled 상태는 변경하지 않는다.

## 완료 기준

- 비로그인·환경변수 미설정 상태가 기존 기능을 중단하지 않는다.
- Google OAuth 시작·세션 복원·로그아웃 UI와 오류 안내가 동작한다.
- 첫 로그인에서 기존 로컬 보관곡을 잃지 않고 서버 기록과 병합한다.
- 두 사용자 간 데이터가 RLS로 분리되고 익명 접근이 차단된다.
- 직접 테스트·전체 테스트·production build가 통과한다.
- 격리 migration 검증 후 운영 적용 여부와 횟수를 HANDOFF에 기록한다.
- production에서는 실제 Google 로그인과 계정별 보관함 재접속을 확인한다.

## 현재 결과

- Google OAuth 세션 복원·로그인·로그아웃 UI 구현 완료
- 기존 localStorage와 사용자별 DB 최신값 병합 구현 완료
- 사용자 변경 시 이전 계정의 로컬 보관함을 새 계정에 전송하지 않도록 소유자 분리
- 사용자별 테이블·RLS·병합 RPC migration과 격리 검증 완료
- 직접·전체 테스트 122/122, fail 0·skip 0
- production build 통과
- 현재 실행 환경에는 운영 DB 관리자 연결이 없어 migration 적용 0회
- 운영 migration 적용 전에는 main 병합·production 배포·실계정 OAuth canary를 진행하지 않는다.

이전 PWA 작업은 [보관본](docs/collaboration/archive/CA-PWA-20261030-001/CURRENT_TASK.md)에 보존했다.
