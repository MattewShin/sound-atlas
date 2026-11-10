# 내비게이션·내 프로필 운영 인계

- 작업 ID: **CA-NAV-PROFILE-IA-20261110-001 / 명세2**
- 상태: **IMPLEMENTED** (검토자 ACCEPTED 아님)
- PR: [#24](https://github.com/MattewShin/sound-atlas/pull/24), Ready 전환 후 2026-11-10 10:24:07 KST 병합
- 최종 main / Vercel production SHA: **`3e588ebc8dacdd5cf3cd648229ff31bd5553a4ef`**
- 승인 HEAD: `2cfb28ffd0587a3f481029561b0ac8ff12dbd677`
- 승인 기능·테스트 SHA: `1a03ca832329a356fa15a615af568958244c911e`
- 결과 문서 브랜치: `codex/ca-nav-profile-ia-20261110-001-production`, [운영 보고서](docs/NAV_PROFILE_IA_PRODUCTION_2026-11-10.md) / [검증 JSON](docs/NAV_PROFILE_IA_PRODUCTION_VERIFICATION_2026-11-10.json)
- 원래 IDE: codex/ca-social-20261106-001 / `8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e`, 기존52개 파일/문서/HEAD와 미커밋·비추적 변경 보존. 별도 worktree에서 진행했다.

## 적용 결과

main/PR/실제 production 기준 일치와 충돌 없음, 승인166/166·SNS5/5·프로필4/4·모바일36/36·build PASS의 로그/JSON·기능 SHA 일치를 확인하고 PR #24를 Ready로 전환·expected HEAD로 병합했다. Vercel `dpl_93i4kUeQpqhYuyE9sHsWTtivt73M` production READY, 승인 HEAD와 merged tree 동일. 기능 추가 수정0이다.

2026-11-10 10:25:09 KST 운영 익명 스모크18/18 PASS. 320/375/390px에서 음악 이야기 한·영 제목·탭 제거·익명 피드, 보관곡 전용 보관함, 내 프로필/나의 음악 취향/Google 로그인 안내, 기존 게시물·곡·타인 프로필 링크를 확인했다. 하단 아이콘5/ARIA/단일 활성 페이지·터치48·SVG28·정렬·가로 넘침0·페이지 오류0이다. 기존 링크는 익명 공개 응답으로만 얻었으며 실제 ID/본문은 로그·문서에 남기지 않았다.

## 범위와 한계

DB 접속/SQL/migration·Supabase 설정/RLS/Realtime publication·OAuth provider·환경변수 변경0. 보호된 SQL/API/SDK 설정/곡/패키지 파일은 이전 main과 같다. 사용자 기록 생성/수정/삭제/공개0, 계정 전환/로그아웃/삭제0, 기존 사용자 세션 미사용. 테스트/build 및 DB 검증을 다시 실행하지 않고 승인 증거만 확인했다. 실제 익명 RPC15회는 읽기 스모크이며 데이터 검증/쓰기 시험이 아니다.

Google OAuth/계정 선택은 수동 미검증으로 남겼다. 로그인 실제 개인 기록/프로필 CRUD·계정 삭제, Realtime 다중 창 무효화/재연결, 실기기 IME/safe-area도 미검증이다. 최초 Vercel 조회403은 기존 CLI inspect로 만료된 로컬 인증을 갱신해 해결했으며 서비스 설정은 수정하지 않았다.

## 문서와 구현자 의견

명세1 CURRENT_TASK/HANDOFF를 [함께 보관](docs/collaboration/archive/CA-NAV-PROFILE-IA-20261110-001/spec1/)하고 현재 쌍을 명세2로 갱신했다. PROJECT_CONTEXT·구현 안내에 운영 결과 링크를 추가하고 별도 운영 보고서/안전한 JSON을 작성했다. 결과는 문서 전용 브랜치에 게시해 운영 코드 SHA를 그대로 유지한다. 원문 토큰/로그/사용자 본문은 포함하지 않았다.

사용자의 이번 운영 승인이 이전 명세1의 배포 금지를 대체한다. 운영 앱 읽기 확인 범위에서는 추가 기능 수정이 필요하지 않았다. 검토자는 Ready/병합/배포·읽기 결과와 수동 OAuth/Realtime/실기기 한계를 확인하면 된다. 새 자료를 만들어 추가 시험하거나 변경 없는 전체 검증을 반복하지 않았다.
