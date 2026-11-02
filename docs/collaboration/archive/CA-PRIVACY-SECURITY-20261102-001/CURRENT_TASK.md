# 현재 작업

- 작업 ID: CA-PRIVACY-SECURITY-20261102-001
- 명세 버전: 1 / 사용자 보관함 개인정보·보안 보강
- 상태: OPERATIONAL / main 병합·production 배포·로그아웃 격리 검증 완료
- 브랜치: codex/ca-privacy-security-20261102-001
- 시작 main SHA: `97785fa`
- 요청: 실제 로그인·보관함 동기화 검증 후 개인정보·보안 보강을 별도 작업으로 진행

## production 확인 결과

1. 비회원 보관곡 1개가 기존 계정 보관곡 2개와 병합되어 총 3곡이 됐다.
2. 새로고침 뒤에도 계정 보관함 3곡이 유지됐다.
3. 로그아웃 뒤 계정 소유 3곡이 비회원 화면에 그대로 남는 문제를 재현했다.
4. Google 개인화 작업은 동기화 기능 기준 OPERATIONAL이며, 로컬 개인정보 격리는 본 작업의 첫 수정 대상으로 분리했다.

## 구현 범위

1. 인증 확인이 끝난 비로그인 상태에서 계정 소유 보관함·최근 곡·추천 노출 로컬 사본을 제거한다.
2. 공연 지역처럼 계정과 무관한 기기 설정과 로그인 전 비회원 보관함은 유지한다.
3. 로그인한 본인만 자신의 Supabase Auth 계정과 연쇄 보관 기록을 영구 삭제할 수 있게 한다.
4. 인증 사용자의 테이블 직접 쓰기를 회수하고, 크기 제한이 있는 본인 전용 RPC만 허용한다.
5. Google 프로필 사진 외부 요청을 제거한다.
6. CSP, clickjacking 차단, MIME sniffing 차단, referrer·browser permission 정책을 추가한다.
7. 앱 안에 수집 항목·목적·보유·외부 서비스·삭제 권리를 설명하는 개인정보 안내를 추가한다.
8. 기존 Google 로그인·보관함 동기화·PWA·공연 브라우저·예약 Disabled 상태를 유지한다.

## 완료 기준

- 로그아웃·세션 만료 후 이전 계정 보관함과 취향이 비회원 화면에 보이지 않는다.
- 첫 로그인 전의 비회원 보관함은 기존 병합 정책대로 보존된다.
- 계정 삭제가 본인 `auth.users`와 본인 반응만 삭제하며 다른 사용자를 보존한다.
- 익명 사용자와 인증 사용자의 직접 테이블 DML은 거부되고 제한 RPC는 정상 동작한다.
- 보안 헤더가 Vercel 설정에 명시되고 로그인·Supabase·KOPIS 이미지·YouTube 경로를 깨지 않는다.
- 직접·전체 테스트, production build, production 의존성 audit가 통과한다.
- 개인정보 문의처와 Supabase 데이터 처리 지역을 확정해 안내문에 반영한다.
- migration을 운영에 1회 적용한 뒤 main 병합·production 배포·실기기 canary를 수행한다.

## 현재 결과

- 로그아웃 로컬 격리, 계정 삭제 UI/RPC, 직접 DML 회수, 400행 상한, 보안 헤더, 개인정보 안내 초안을 구현했다.
- Google 프로필 사진 URL 렌더링을 제거했다.
- 격리 SQL을 포함한 전체 테스트 124/124, fail 0·skip 0, production build 통과.
- `npm audit --omit=dev`: 취약점 0건.
- 개인정보 문의처 `ybshin09@gmail.com`과 핵심 데이터 저장 지역 `Oceania (Sydney), Australia`를 안내문에 반영했다.
- 사용자가 2026-11-02 KST에 신규 migration `202611020002_user_account_security.sql` 적용 완료를 보고했다. 현재 실행 환경에서 관리자 연결로 적용 횟수를 독립 확인하지는 않았다.
- PR #12를 main에 병합했으며 production SHA는 `875a6bec7440fa34225341e9fd8024bc92c63fc9`다.
- Vercel 배포 상태 `success`와 새 production 화면의 개인정보 안내를 확인했다.
- 구버전 로그아웃 뒤 남아 있던 계정 보관곡 3개와 파생 취향이 새 배포 로드 후 0개로 정리되어 로그아웃 격리 경로를 production에서 확인했다.
- 실제 주계정 삭제는 수행하지 않았다. 본인 삭제·타 사용자 보존은 격리 SQL 테스트로 확인했다.

## 운영 적용 기록

1. 개인정보 문의 이메일: `ybshin09@gmail.com`
2. Supabase 핵심 데이터 저장 지역: `Oceania (Sydney), Australia`
3. 신규 migration: 사용자 적용 완료 보고 / 독립 확인 대기

이전 Google 개인화 작업은 [보관본](docs/collaboration/archive/CA-GOOGLE-PERSONALIZATION-20261102-001/CURRENT_TASK.md)에 보존했다.
