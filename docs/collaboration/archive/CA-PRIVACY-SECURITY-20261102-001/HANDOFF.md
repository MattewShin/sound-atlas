# 작업 인계

- 작업 ID: CA-PRIVACY-SECURITY-20261102-001 / 명세1
- 상태: OPERATIONAL / main 병합·production 배포·로그아웃 격리 검증 완료
- 작성: 웹 GPT / 2026-11-02 13:53 KST
- 브랜치: codex/ca-privacy-security-20261102-001
- 시작 기준: main / `97785fa`

## 실제 production 검증

- Google 로그인 전 기기 보관곡 1개와 계정의 기존 2곡이 총 3곡으로 병합됐다.
- 새로고침 뒤에도 3곡이 유지되어 로그인·DB 동기화·세션 복원을 확인했다.
- 로그아웃 뒤 계정 보관함 3곡과 파생 취향이 비회원 화면에 남는 문제를 재현했다.
- 테스트 뒤 cloud browser 세션은 로그아웃했다.

## 구현 결과

- 인증 초기 확인이 완료된 뒤 계정 소유자가 남아 있는데 세션이 없으면 보관 반응·최근 곡·추천 노출·소유자 표식을 기기에서 삭제하고 React 상태도 비운다.
- 로그인 전 소유자가 없는 비회원 보관함과 공연 지역 설정은 보존한다.
- `delete_current_user_account()`는 인자 없이 `auth.uid()`의 계정만 삭제하고 FK cascade로 해당 보관 기록을 삭제한다.
- 인증 사용자의 직접 INSERT/UPDATE/DELETE를 회수하고 `merge_user_track_reactions()`를 400행 상한의 SECURITY DEFINER RPC로 교체했다. SELECT RLS는 유지했다.
- 계정 삭제는 2단계 확인 UI를 거치며, 성공 뒤 로컬 인증 세션을 폐기한다.
- Google 프로필 이미지 외부 요청을 없애고 앱 내부 아이콘을 사용한다.
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`를 Vercel 전체 응답에 추가했다.
- 앱 내 개인정보 안내에 문의 이메일 `ybshin09@gmail.com`과 Supabase 핵심 데이터 저장 지역 `Oceania (Sydney), Australia`를 반영했다.

## 검증

- 직접 테스트: 10/10 통과.
- 전체 테스트: 124/124, fail 0·skip 0.
- production build: PASS. 기존 번들 크기 warning만 있으며 실패가 아니다.
- `npm audit --omit=dev --json`: production 취약점 0건.
- 격리 SQL: 사용자 A의 직접 쓰기 차단, RPC 쓰기, 400행 초과 차단, A 계정/반응 삭제, 사용자 B 계정/반응 보존, anon 삭제 거부 확인.

## 운영 변경

- 신규 migration 적용: 사용자가 2026-11-02 KST에 1회 적용 완료를 보고했다. 관리자 연결을 통한 독립 확인은 하지 않았다.
- main 병합·production 배포: PR #12 / `875a6bec7440fa34225341e9fd8024bc92c63fc9`, Vercel status success.
- production 로그아웃 격리 canary: 기존 계정 보관곡 3개·파생 취향이 비로그인 재진입에서 0개로 정리됨.
- production 계정 삭제 canary: 실제 주계정 보호를 위해 미실행. 격리 SQL에서 본인 계정/반응 삭제와 타 사용자 보존을 검증함.
- 기존 공연 예약: Disabled 유지, 변경 없음.

## production 확인

1. Vercel의 merge SHA 배포 상태가 success임을 확인했다.
2. 새 화면에서 개인정보 안내, Sydney 지역, 공개 문의 이메일을 확인했다.
3. 비로그인 화면의 보관곡과 취향이 3곡에서 0곡으로 정리되어 이전 계정 자료가 더 이상 노출되지 않음을 확인했다.
4. Google 로그인 버튼과 기존 음악 탐색·공연·보관함·취향 내비게이션을 유지했다.

## 구현자 의견

- 계정 삭제 production canary가 필요하면 별도 Google 테스트 계정을 사용한다. 실제 주계정으로는 삭제 버튼을 실행하지 않는다.
- 개인정보 안내는 기술적 사실의 초안이며 법률 자문을 대체하지 않는다. 공개 서비스 운영 전 문의처·국외 처리 지역·미성년자 정책을 운영자가 확정해야 한다.
