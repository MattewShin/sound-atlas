# 작업 인계 — SNS 통합

- 작업 ID: CA-SOCIAL-20261106-001 / 명세 2
- 상태: IMPLEMENTED / 실제 서비스 검증·검토 대기 (ACCEPTED 아님)
- 작성: Codex / 2026-11-06 Asia/Seoul
- 브랜치: codex/ca-social-20261106-001-integration
- 시작 main: f50251e95fe9c2e00290c6eee6329017e9d2e9f4
- 이전 Draft #20/8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e 및 원래 worktree 미커밋 변경 보존
- 고정 코드 전체 SHA: `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5`
- 검증 tree: `e9773ba88b48ea9dccec689d959a4e63be72160e`
- 게시: [통합 Draft PR #21](https://github.com/MattewShin/sound-atlas/pull/21), [codex/ca-social-20261106-001-integration](https://github.com/MattewShin/sound-atlas/tree/codex/ca-social-20261106-001-integration). 문서 HEAD는 GitHub 이력에서 확인하며 검증 코드 SHA와 구분한다. 최초 게시 후 PR 링크 기록은 문서 3개 변경이었으며, 이번 배포 전 확인은 아래 문서 4개 변경이다.

## 배포 전 확인 — 2026-11-06 KST

- 요청 기준 HEAD: `5a302bcaff00c33246a2d68c8e688aa67b54cf89`. 통합 worktree의 HEAD/깨끗한 작업 트리와 ID·명세 2를 대조했다. 원래 IDE worktree/기존 공연·OCR 변경은 보존했다.
- 판정: **배포 전 검증 미완료**. 사용자가 운영과 분리된 스테이징이 아직 없다고 확인했다. 구현자 상태는 IMPLEMENTED를 유지하되 실제 검증 PASS/ACCEPTED로 표시하지 않는다.
- 환경 조사: 통합 worktree는 빈 예제만 있고 실값 env 없음. 원래 worktree에는 기존 서버 DB 설정이 있지만 테스트 환경임을 확인할 수 없어 연결/재사용하지 않았다. 프로세스에 staging/DB/Google 설정 없음, Docker/Supabase CLI/psql은 PATH에서 사용 불가, Supabase 관리 연결 도구 없음. 비밀값은 출력/커밋하지 않았다.
- GitHub에서 위 SHA의 Vercel status=success와 PR OPEN/DRAFT·미병합을 확인했다. 실제 Preview 앱·환경변수·DB 분리 확인이나 기능 검증을 뜻하지 않는다. 브라우저 호스트 부재 및 Windows 현재 URL 확인 실패로 컴퓨터 사용 도구가 이번에도 중단되었으며 UI 조작을 우회하지 않았다.

| 요청 항목 | 이번 실제 실행 | 결과/남은 조건 |
| --- | --- | --- |
| 분리 스테이징 migration | 미실행 | 테스트 Supabase 생성, 별도 CLI 작업 폴더에 기반 4개+SNS 2개만 준비. dry-run 대상 ref 확인 필요 |
| Google 로그인/로그아웃/전환·기존 기록/링크 | 미실행 | 테스트 OAuth client/A·B·C/Preview redirect 설정 및 합성 기존 데이터 필요 |
| 실제 PostgREST A/B/C/익명·민감 열·삭제 | 미실행 | 실제 사용자 토큰/익명 apikey 요청으로 검증. 기존 PGlite/모의 전송 결과로 대체 안 함 |
| 실제 Realtime 다중 접속/끊김·복귀 | 미실행 | Broadcast 수신/화면 제거/재조회·WSS 단독 끊김/전체 offline·재노출 확인 필요 |
| 모바일 320/375/390px | 미실행 | 긴 곡명/24·34자 handle/본문/댓글/메뉴·44px 터치/실기기 IME·키보드·nav/실제 computed typography 확인 필요 |
| 신고 일일 실행/실패 알림 | 설정안만 준비 | KST 03:15 pg_cron + 독립된 15분 감시, 실패/미실행/정리 잔여·전송 실패 알림안. 담당자/수신처/감시 환경 미정, 설치·실행·발송 0 |

사용자의 후속 요청에 따라 [스테이징 준비·검증 안내](docs/MUSIC_SOCIAL_STAGING.md)를 작성했다. 테스트 프로젝트 생성부터 브랜치 전용 Preview 연결, 기존 합성 fixture와 실제 서비스 시험표까지 실행 순서를 제공한다. 테스트 기반 4개→OAuth/Preview의 계정 생성만→합성 기존 원본/공유→SNS 2개 순서로 빈 DB 설치와 backfill 호환 검증을 구분한다. Preview의 브라우저/서버 양쪽 DB 설정 상속을 확인해 운영 연결이 남지 않게 한다. 공연/OCR migration 전체 적용이나 운영 데이터 복사는 계획에 포함하지 않는다.

신고 정리는 `atlas_private.purge_expired_social_reports()`만 신뢰된 DB 연결로 실행한다. UTC/GMT Cron이면 `15 18 * * *`이며 실제 cron.timezone 확인을 선행한다. cron.job_run_details와 만료 잔여 개수를 확인하고 DB 자체 중단까지 외부에서 감시하는 안이다. 수신처에 메시지를 보내거나 스케줄을 설치하지 않았다. 일일 배치의 정상 물리 삭제 지연은 만료 후 다음 실행까지 최대 약 24시간이며 엄격한 30일 시점 삭제를 이미 보장한다고 보고하지 않는다.

이번 변경: `CURRENT_TASK.md`, `HANDOFF.md`, `docs/MUSIC_SOCIAL.md`, 새 `docs/MUSIC_SOCIAL_STAGING.md` 4개. 기능/SQL migration/환경변수 변경 없음. 문서의 로컬 링크·migration 6개 경로·파일 allowlist/기준 SHA·비밀값 패턴·소스 diff 검사 통과. PowerShell 예시 2개는 AST 문법 검사만 통과했으며 예시 명령은 실행하지 않았다. 기존 147/147·전용 5/5·build는 앞선 실행 이력이고 이번에 다시 실행한 결과가 아니다. 운영 DB 연결/쓰기·main 병합·운영 배포·실제 개인 기록 공개는 하지 않았다.

다음 전달 정보: 테스트 Preview 앱 URL, Supabase project ref와 설정 위치, 배포 SHA, A/B/C 준비 여부. 비밀키는 채팅/문서에 보내지 않는다. 환경 구성 후 위 시험표의 실제 서비스 증거와 신고 일일 실행/실패 알림 수신 결과를 채우는 것이 남은 작업이다.

## 구현

기존 Supabase singleton/useGoogleAuth, 개인 원본·닉네임·공유 테이블을 재사용했다. 원본/공유 ID·기존 ?story 링크·revision·날짜·유형·기존 닉네임과 public 범위를 유지하고 신규 공유만 기본 private으로 시작한다. 공개 프로필 ID는 별도 무작위 값이며 Auth 매핑/신고는 비공개 스키마에 둔다. 기존 테이블 REST에도 열 권한과 범위·차단 RLS를 적용한다.

계정/원본 삭제는 기존 CASCADE 정책을 유지해 공유본과 종속 댓글·좋아요를 함께 삭제한다. 공유 취소는 원본을 보존한다. 신고는 공유 snapshot만 30일 만료 정책으로 분리하고 계정/공유 삭제 시 관련 FK를 NULL로 만든다. 일일 만료 정리는 운영 설정이 필요하다.

기존 로그인·새로고침 세션·로그아웃·계정 삭제를 하나로 통합했다. 초기 세션 응답 경합과 계정 간 화면/초안/응답 혼용을 막고 SDK 2.119의 local 로그아웃 선행 폐기를 검증한다. 공통 Pretendard·-0.03em·짝수 12px 이상·실제 줄 수별 line-height를 적용했다.

구조·권한·삭제 표·migration 순서·실패 복구·신고 보관은 [MUSIC_SOCIAL.md](docs/MUSIC_SOCIAL.md)를 따른다. 이전 377개 결과는 이번 통합의 근거로 사용하지 않는다.

## 최종 검증과 한계

- 환경: Windows PowerShell, Node 22.18.0/npm 10.9.3, React 19/Vite 6.4.3, SDK 2.119.0, PGlite/JSDOM.
- `npm test`: 위 고정 통합 코드에서 **147/147 통과**, 실패/skip 0. 로그 `.cache/verified-regression.log` (로컬, 커밋 제외).
- `npm run test:social`: **5/5 통과**, 실패/skip 0. 로그 `.cache/verified-social.log` (로컬). 실제 SQL 역할/열 권한/RLS, SDK REST 요청 계약, 구독 공유/교체, 실제 SDK local 로그아웃 선행 폐기, 실제 React+기존 auth hook 흐름을 포함한다.
- `npm run build`: 성공, 106 modules, JS 875.36 kB/gzip 224.81 kB. 기존 단일 500kB 초과 chunk 경고 유지. Pretendard WOFF2 2,057,688 bytes와 OFL 포함.
- 통합 도중 144개 통과 후 보강했으며, 최종 첫 실행의 1건은 예전 가짜 track-a/track-b가 등록 곡 검사에 걸린 fixture 문제였다. 실제 카탈로그 ID로 갱신한 뒤 위 147개 최종 실행을 통과했다. 게시 검사에서는 공식 라이선스의 줄 끝 공백만 정리했다. 앱 동작/검증 정책을 느슨하게 바꿔 통과시키지 않았다.
- 게시 검사 통과: GitHub 변경 경로 43개가 로컬 allowlist와 일치, 원래 파일 52개 hash 및 원래 HEAD 8a1fa8b 보존, UTF-8/링크·비밀값 패턴·빈 `.env.example`·공통 이력·소스 diff 확인. 실제 .env/개인 사용자 자료/캐시/무관한 공연·OCR 변경은 제외했다. GitHub에서 Draft와 main 충돌 없음 확인. 원래 IDE worktree는 보존하고 `.cache/social-integration`에서 구현·게시했다.
- 실제 OAuth·PostgREST·Realtime·운영 DB·실배포·복구 실행 미검증. SDK REST 계약은 로컬 SQL 역할 검증이며 실제 PostgREST 서버 결과가 아니다.
- 브라우저 호스트가 없고 Windows 현재 URL도 정책상 확인되지 않아 컴퓨터 사용이 중단됐다. 실제 모바일 화면/터치·실기기 PWA는 미검증이다. 정적 CSS/글꼴·DOM·줄 수 알고리즘 검증과 구분한다.

검증 내용: 기존 원본·공유 ID/닉네임/public 범위·snapshot 불변·등록 곡·고유 handle, 비공개/공유 취소된 사람의 닉네임 비노출, A/B/C/익명 세 범위·기존 링크/REST·차단/팔로우 취소, 공개 필드에서 Auth UUID/비공개 원본 ID 제거, 직접 table wildcard/민감 열 거부, 반응/댓글 중복·실패 초안·개수·자기 삭제, 기존 개인 기록 생성/편집 초안 보존, 계정/원본/공유 삭제 CASCADE, 신고 FK 익명화/만료 정리, 세션 초기 응답 경합·로그아웃/계정 전환·계정 삭제·오래된 응답 무효화·오프라인 복귀, 공유 구독의 이전 콜백 무효화, Pretendard·짝수 크기·자간·줄 수 판별 및 기존 탐색·검색·보관 회귀.

## Migration·권한·삭제·복구

- 기존 202611020001~004 이후 202611060001 → 202611060002 순서. 001은 기존 공유 테이블/RLS를 확장하고 public 6개/private 2개 테이블을 만들며 기존 원본은 복사하지 않는다. 002는 등록 곡 291개만 넣는다. 기존 공개본은 public 유지, 원본 자동 공개 없음. 두 단계 사이 공유 쓰기는 등록 곡 검사로 제한될 수 있어 동일 적용 구간에서 완료해야 한다.
- 단일 Auth 세션을 재사용하며 공개 프로필 ID만 외부에 사용한다. 테이블 열 권한 자체가 owner_id/source_record_id/source_revision을 숨기고, 새 RLS가 이전 REST/링크까지 적용된다. 본인 전용 원본/공유 상태 API만 비공개 원본 ID를 사용한다.
- 나만 보기는 작성자만, public은 익명도, followers는 작성자·현재 팔로워만 글/댓글/반응/개수를 읽는다. 변경/팔로우 취소/차단 후 새 요청은 즉시 DB 권한을 다시 검증하며 기존 반응은 범위 변경만으로 지우지 않는다. 차단은 로그인 계정 관계에 적용하므로 익명의 public 조회는 가능하다.
- 원본 삭제 → 공유본·그 댓글/좋아요 CASCADE. 공유 취소 → 원본 보존. 계정 삭제 → 자기 콘텐츠·자기 반응·관계 및 자기 공유본에 달린 모든 반응 삭제. 원본 수정은 snapshot 불변.
- 신고는 공유 snapshot·사유만 운영자 전용 저장, 계정/공유 삭제 시 식별 FK를 NULL로 만든다. expires_at=30일, service_role 전용 만료 삭제 함수 제공. 일일 정리 스케줄/실패 알림은 배포 전 운영 설정이 필요하며 물리적 자동 삭제를 이미 보장하지 않는다.
- 실패 복구: 001 COMMIT 전 실패는 롤백 확인, 001 성공·002 실패는 공유 쓰기를 제한하고 002만 재시도. 프런트 실패는 이전 산출물로 복귀하면서 RLS/데이터 보존. 권한 사고는 직접 테이블/RPC 접근 제한+빈 무효화 신호 후 수정/재검증. RLS 해제/public 범위 확대/DROP CASCADE로 복구하지 않는다. 이미 데이터가 있으면 백업을 보존한 후속 migration을 쓴다. 운영 복구 실행은 미검증이다.

## 운영

운영 migration/main 병합/운영 배포는 하지 않는다. 검증한 코드 이후에는 문서만 보완하여 새 Draft PR로 게시한다. 명세 1 및 기존 main 작업 문서는 docs/collaboration/archive/에 보존했다. 원래 worktree와 PR #20은 그대로 두었다. 새 브랜치는 main과 공통 이력이 있으며 오래된 App 전체나 공연/OCR 변경을 이식하지 않았다.

실제 OAuth/PostgREST/Realtime와 직접 모바일 화면 확인, 신고 정리 운영, 실기기 PWA/복구 확인은 다음 스테이징 검토 요청이다. 이 구현자 보고를 서비스 적용 또는 검토 ACCEPTED로 취급하지 않는다.
