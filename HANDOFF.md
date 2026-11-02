# 작업 인계

- 작업 ID: CA-PRIVACY-SECURITY-20261102-001 / 명세1
- 상태: BLOCKED / 코드 구현·격리 검증 완료, 운영 적용 대기
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
- 앱 내 개인정보 안내 초안을 추가했으나 운영 문의처와 Supabase 처리 지역은 확인 전이라 명시적으로 미확정 표시했다.

## 검증

- 직접 테스트: 10/10 통과.
- 전체 테스트: 124/124, fail 0·skip 0.
- production build: PASS. 기존 번들 크기 warning만 있으며 실패가 아니다.
- `npm audit --omit=dev --json`: production 취약점 0건.
- 격리 SQL: 사용자 A의 직접 쓰기 차단, RPC 쓰기, 400행 초과 차단, A 계정/반응 삭제, 사용자 B 계정/반응 보존, anon 삭제 거부 확인.

## 운영 변경

- 신규 migration 적용: 0회.
- main 병합·production 배포: 0회.
- production DB 쓰기·계정 삭제 canary: 0회.
- 기존 공연 예약: Disabled 유지, 변경 없음.

## 차단 사유와 재개점

1. 사용자가 공개 가능한 개인정보 문의 이메일을 알려준다.
2. 사용자가 Supabase Dashboard의 프로젝트 지역/국가를 알려준다.
3. 두 값을 개인정보 안내에 반영하고 전체 테스트/build를 재확인한다.
4. 사용자가 `202611020002_user_account_security.sql`을 Supabase SQL Editor에 1회 적용한다.
5. main 병합·production 배포 후 로그인 → 로그아웃 로컬 삭제를 확인한다.
6. 계정 삭제는 실제 주계정 대신 별도 테스트 계정으로 canary하고, 해당 테스트 계정만 삭제됐음을 확인한다.

## 구현자 의견

- 현재 브랜치를 migration보다 먼저 production에 배포하면 계정 삭제 버튼이 RPC 부재 오류를 내므로, migration 적용 전 병합·배포하지 않는 것이 안전하다.
- 개인정보 안내는 기술적 사실의 초안이며 법률 자문을 대체하지 않는다. 공개 서비스 운영 전 문의처·국외 처리 지역·미성년자 정책을 운영자가 확정해야 한다.
