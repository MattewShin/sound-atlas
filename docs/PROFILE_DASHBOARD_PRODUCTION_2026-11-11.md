# 프로필 대시보드 운영 결과 — 2026-11-11

**CA-PROFILE-DASHBOARD-IA-20261110-001 / 명세2 / IMPLEMENTED**. 사용자 명세1 ACCEPTED 및 운영 승인에 따라 [PR #26](https://github.com/MattewShin/sound-atlas/pull/26)을 Ready 전환·main 병합했고 Vercel Production Ready 및 운영 도메인 적용을 확인했다. [검증 JSON](PROFILE_DASHBOARD_PRODUCTION_VERIFICATION_2026-11-11.json)·[HANDOFF](../HANDOFF.md)·[명세1 구현](PROFILE_DASHBOARD_IA.md)을 구분해 읽는다. 결과는 별도 문서 브랜치에 게시하며 이 문서의 main 병합은 이번 범위에서 수행하지 않는다.

## 운영 반영 기준과 결과

| 항목 | 결과 |
| --- | --- |
| 검토/승인 HEAD | 9e60130a23e37d42a5d233cd6831daa1573e57f2 |
| 승인 기능·테스트 SHA | fda3efa7c750eaed9e9b3793b0fc18f887aceae0 |
| 적용 전 main/운영 배포 SHA | fe73abfccd4aafa62dedadbbaed3e1fa4abe099d, 동일 |
| Ready 전환·병합 | PR #26 Draft → Ready → merge commit 방식 |
| 병합 시각 | 2026-11-11 10:09:14 KST |
| 최종 merge/main 및 운영 배포 SHA | **a771252d86df084d382e7d7ad4d3f64d32d0adde** |
| Vercel Deployment | dpl_81wuvD5ArSLJiLaMx9quKop5J8zd / **production / READY** |
| 운영 도메인 | https://sound-atlas.vercel.app/ — 위 deployment의 alias 및 SHA 확인 |
| Ready 관측 | 2026-11-11 10:09:48 KST |
| 익명 스모크 완료 | 2026-11-11 10:13:50 KST |
| 실제 공연 조회 확인 | 2026-11-11 10:14:35 KST |
| 결과 문서 브랜치 | codex/ca-profile-dashboard-ia-20261110-001-production |

병합 직전 HEAD/main을 재확인하고 expected_head_sha를 고정했다. main은 기준 이후 변경0, unresolved review thread0, GitHub 등록 검사인 Vercel success 및 승인 HEAD의 Preview Ready를 확인했다. GitHub formal review 등록은0이며 ACCEPTED의 근거는 사용자의 명시적 검토 완료 지시다. GitHub Actions PR workflow는0이었다. 기존 병합 이력과 같은 merge commit을 사용했고 승인 HEAD와 병합 main의 전체 tree diff0이다. 강제 push/history rewrite는 하지 않았다.

기존 전체170/170·SNS5/5·프로필8/8·모바일69/69 및 관리 복귀12건·build PASS 증거의 코드 SHA/로그 SHA-256을 검증 JSON과 대조했다. 승인 기능 SHA 이후 런타임·테스트 차이0, protected DB/설정/인증 계약 파일 차이0과 안전 검사·원래 IDE52개 파일 보존을 확인했다. 새로운 런타임 변경이 없어 전체 테스트와 로컬 build는 반복하지 않았다. 배포 가능 상태는 승인 build checksum과 Preview Ready로 확인했고 실제 운영 배포도 Ready가 됐다. 기존 500kB chunk 경고는 명세1 이력에 남아 있다.

## 실제 운영 익명 검증

사용자 세션을 재사용하거나 로그아웃시키지 않은 독립 Chromium context에서 **운영 도메인**을 열었다. 모든 일반 쓰기 요청은 차단하고 공개 읽기 RPC social_feed/social_profile만 허용했다. 사용자 자료를 생성·수정·삭제·공유하지 않았으며 로그인 버튼/계정 전환/로그아웃/삭제는 실행하지 않았다.

| viewport | 프로필 직접 주소·새로고침 | 기존 주요 화면 | 실제 history |
| --- | --- | --- | --- |
| 320px | 11/11 PASS | 4/4 PASS | 설정 복귀·뒤로/앞으로 PASS |
| 375px | 11/11 PASS | 4/4 PASS | 설정 복귀·뒤로/앞으로 PASS |
| 390px | 11/11 PASS | 4/4 PASS | 설정 복귀·뒤로/앞으로 PASS |

일반 화면 스모크는 **45/45**(프로필33+기존12), history는 별도3/3이다. 실제 공연 검색은 추가 읽기 검사1/1이다. 숫자를 명세1의 합성 테스트 통과 수와 합산하지 않는다.

프로필에서 아래11개 주소를 각각 새 문서로 직접 열고 HTTP200·로그인 안내·새로고침 후 주소 복원·제목을 확인했다.

- `#profile`
- `#profile/records`, `#profile/records/private`, `#profile/records/public`
- `#profile/posts` → `#profile/records/public` 정규화
- `#profile/taste`, `#profile/settings`
- `#profile/edit`, `#profile/preview`, `#profile/blocked`, `#profile/privacy`

익명 화면에는 안전한 Google 로그인 안내만 있고 개인 헤더·기록 목록·개수·프로필 폼·계정 관리가 없었다. 빈 화면/무한 로딩/404/React pageerror0, 콘솔 error0, 앱/REST HTTP오류0이었다. 네 관리 화면의 ‘← 설정’ href를 세 viewport에서 확인했고 privacy→설정의 실제 링크 클릭과 native back/forward를 각 너비에서 확인했다. 브라우저 이동이 막히거나 반복되지 않았다.

실제 문자별 Range 좌표와 computed 스타일로 프로필 제목·설명·로그인 버튼·복귀 링크의 Pretendard/-0.03em/최소12px 짝수 크기, 한 줄 normal/여러 줄1.5를 확인했다. 가로 넘침0, 클릭 대상44×44px 이상, 아이콘 전용 전역 메뉴5개/aria-label/활성 상태를 확인했다. 끝까지 스크롤한 로그인 버튼이 고정 하단 메뉴에 가리지 않는지도 측정했다.

[320px 익명 홈](profile-dashboard-production-20261111/anonymous-profile-320.png) · [375px](profile-dashboard-production-20261111/anonymous-profile-375.png) · [390px](profile-dashboard-production-20261111/anonymous-profile-390.png). 화면 증거는 익명 로그인 안내만 포함하며 실제 닉네임·게시물 ID·본문·이메일은 포함하지 않는다.

기존 음악 탐색/추천 홈·보관함·공연 찾기·음악 이야기는 각 viewport에서 전역 메뉴로 이동해 진입·가로 넘침·메뉴 활성 상태를 확인했다. 익명 보관함은 빈 보관함이며 실제 사용자의 보관 자료를 조회하지 않았다. 음악 이야기는 실제 클라우드 PostgREST social_feed 응답200을 확인했다. 추가로390px에서 ‘공연 조회’를 눌러 실제 GET /api/concerts HTTP200·검색 결과 렌더링·오류 표시 없음을 확인했다. 공연 원문·공개 게시물 식별자/본문은 증거로 저장하지 않았다.

## 요청·권한 확인과 로그인 미검증

프로필33건의 직접 진입·새로고침 중 REST 요청0, 개인 기록 API0, 프로필 구간 websocket0이었다. 차단된 쓰기 요청0, 실제 사용자 기록 변경0이다. 토큰형 콘솔 패턴0이며 기록/헤더/세션/공개 피드 본문은 콘솔이나 JSON에 수집하지 않았다.

안전하게 사용하도록 지정된 기존 테스트 계정이나 준비된 테스트 세션이 제공되지 않아 **로그인 운영 검증은 수행하지 않았다**. 기존 사용자의 인증 세션을 찾아 사용하거나 계정 전환/로그아웃시키지 않았다. 다음은 명세1의 합성 검증 또는 코드 근거와 실제 운영 결과를 구분해 미검증으로 남긴다.

- 로그인 프로필 이미지/닉네임/아이디·비대화형 관계 숫자·명시적 미리보기 링크·기록 개수/최근 최대3개.
- 로그인 홈의 실제 최근3개 요청, 전체 기록10개 및 더 보기·상태 필터/주소 복원·곡 상세·공유본 관리 노출.
- 로그인 설정 네 하위 화면과 계정 전환/로그아웃/삭제의 위치 및 실제 인증 동작. 익명 header 복귀 링크 확인을 로그인 기능 검증으로 대신하지 않는다.
- 실제 Google OAuth chooser/계정 전환/로그아웃/삭제, authenticated PostgREST의 범위/민감 열/RLS·계정 격리. 실제 공개 피드 PostgREST200 확인은 이 권한 행렬을 검증한 것이 아니다.
- 실제 Realtime 다중 창·범위 변경/재연결·계정 전환. 프로필에서 불필요한 websocket0 관측과 구분한다.
- 실기기 IME/키보드·iOS Safari/PWA. Chromium viewport 검증은 실기기 확인을 대신하지 않는다.

## 변경 통제·보안·문서 위치

DB migration 추가/실행0, 직접 운영 DB 작업0, 환경변수/ Supabase 프로젝트·RLS/Realtime publication·OAuth callback/provider/ Vercel 프로젝트 설정 변경0, 실제 사용자 자료 쓰기0이다. 검증 도구는 .cache의 로컬 파일이고 운영 기능 코드에 추가 커밋을 섞지 않았다. 서버의 일반 GET 조회/기존 캐시 처리와 직접 DB 작업을 구분한다.

원래 IDE의 dirty worktree/HEAD·다른 브랜치를 보존한다. 비밀키/토큰/실제 .env 값·세션·사용자 본문·백업 실제 경로·원시 build/API 응답은 Git/문서에 올리지 않는다. JSON에는 메타데이터·상태·안전한 검증 수치만 기록했다. 기존 명세1 CURRENT_TASK/HANDOFF는 [보관 쌍](collaboration/archive/CA-PROFILE-DASHBOARD-IA-20261110-001/spec1/CURRENT_TASK.md)에 보존했다. 명세1은 사용자 지시에서 ACCEPTED로 확정되었고, 보관 문서의 구현자 IMPLEMENTED 표시는 당시 이력이다.

결과 문서는 위 별도 결과 브랜치로 push하며 문서 전용 PR 생성/병합과 이 브랜치의 운영 배포는 이번 단계에서 실행하지 않는다. 운영 main은 기능 merge SHA a771252d86df084d382e7d7ad4d3f64d32d0adde로 유지한다.

## 롤백 기준과 복구 대상

Vercel Production Ready 실패·main/배포 SHA 불일치, 프로필 치명 오류·익명 개인 자료 노출·주요 화면 접근 불가·딥링크 반복 이동·계정 상태 혼합이 발견되면 운영 완료로 처리하지 않는다. 이번에 확인한 익명 검증에서는 해당 실패가 없으며 **롤백은 실행하지 않았다**. 로그인 계정 격리 등 미검증 항목을 PASS로 확대하지 않는다.

복구 대상 merge commit은 **a771252d86df084d382e7d7ad4d3f64d32d0adde**다. 문제가 생기면 최신 main을 기준으로 별도 복구 브랜치를 만들고 다음 revert 변경을 검토·병합한 뒤 그 새 SHA의 Production Ready와 익명 스모크를 재확인한다.

```bash
git revert -m 1 a771252d86df084d382e7d7ad4d3f64d32d0adde
```

위 명령은 복구 준비 안내이며 실행하지 않았다. 강제 push/main history rewrite·전체 DB restore·DB 역 migration·설정 변경은 하지 않는다. 기존 정상 배포를 삭제하지 않는다. 후속 main 변경과 충돌하면 그 범위를 먼저 확인한다.
