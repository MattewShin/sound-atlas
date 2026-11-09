# 작업 인계 — SNS 통합

- 작업 ID: CA-SOCIAL-20261106-001 / 명세 2
- 상태: IMPLEMENTED / 운영 반영·검증 결과 보고 (ACCEPTED 아님)
- 작성: Codex / 2026-11-06 Asia/Seoul
- 결과 브랜치: main / codex/ca-social-20261106-001-production
- PR #21 merge SHA: `6bd183ca21efc53ea3c842c942cece96af0af03e`
- 최종 운영 기능 코드 SHA: `e569b568f66d22aae35e4317f3fae5a5fef70fc6`
- 시작 main: f50251e95fe9c2e00290c6eee6329017e9d2e9f4
- 이전 Draft #20/8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e 및 원래 worktree 미커밋 변경 보존
- 이전 전체 회귀 기준 코드 SHA: `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5`
- 이전 검증 tree: `e9773ba88b48ea9dccec689d959a4e63be72160e`
- 게시: [PR #21 병합 완료](https://github.com/MattewShin/sound-atlas/pull/21), [운영 결과](../../../../MUSIC_SOCIAL_PRODUCTION.md). 기능 코드와 이후 문서 저장 SHA를 구분한다. 문서 HEAD는 GitHub 이력에서 확인한다.

## 피드 상단 가로 정렬 후속 수정 — 2026-11-06 KST

사용자 요청에 따라 게시물 작성자 별명/아이디와 선택 곡 정보를 **동일한 높이의 한 줄**로 정렬했다. 작성자 이름 영역의 두 줄 grid를 한 줄 flex로 바꾸고 아바타/곡명/시각을 세로 중앙에 맞췄다. 별명 공간을 확보하고 긴 별명·아이디/곡명은 말줄임 처리한다. 원문 텍스트와 title 속성은 보존하며 프로필/곡별 화면으로 이동해 전체 정보를 볼 수 있다. 곡명을 헤더에서 한 줄로 표시하는 이번 요청을 이전의 헤더 긴 제목 줄바꿈보다 우선 적용했다. 본문·댓글과 전체 정보 화면의 줄바꿈은 유지한다.

- 코드: `e569b568f66d22aae35e4317f3fae5a5fef70fc6`, MusicSocial.jsx/musicSocial.css 2개 파일 13줄 추가/2줄 변경. main과 결과 브랜치 push, Vercel success 확인.
- 검증: 기존 mobileTypography **8/8**, 기존 SNS `verifyMusicSocial` DOM 회귀 PASS. 실제 컴포넌트를 렌더링한 로컬 합성 화면과 **배포된 운영 번들에 합성 REST 응답을 주입한 화면**에서 각각 짧은/긴 작성자×320/375/390/520px **8조합 PASS**. 기본 헤더 높이 44px, 별명/아이디/곡명 한 줄, 버튼 중심/텍스트 높이 정렬, 겹침·가로 넘침 없음, 44px 이상 터치 확인. 프로필/곡별 화면의 전체 정보도 확인했다.
- 운영 브라우저 검증은 실제 사용자 게시물을 가져오지 않도록 REST 응답을 모두 합성 데이터로 대체했다. 새 테스트 계정/게시물 생성·DB 쓰기 없음. 이번 결과를 권한/등록 API 재검증으로 보고하지 않는다. 검사에 사용한 loopback Vite 서버는 종료했다.
- 증거: Git 제외 `.cache/social-production-ops/header-local-results.json`, `header-live-results.json`, `screenshots/header-live-*-320.png`. 기존 IDE 브랜치/미커밋 변경 보존. 이후 인계 문서 SHA는 GitHub 이력에서 확인한다.

## 하단 메뉴 표기 후속 수정 — 2026-11-06 KST

사용자 요청에 따라 하단 SNS 메뉴를 **음악 이야기**로 바꾸고 한 줄 표시했다. App.jsx의 해당 메뉴만 이름/전용 클래스를 변경하고 styles.css에서 해당 열을 최소 76px로 확보했다. 라벨 nowrap과 내부 여백으로 글자를 줄이지 않고 버튼 안에 표시한다. 아이콘/이동 동작과 충분한 터치 영역을 유지했다.

- 코드: `de661b53ec9cdaa7d679b062dd8c94b6acc9ccd3`, source 2개 파일 4줄 추가/1줄 변경. main 및 결과 브랜치에 push, Vercel success 확인.
- 관련 기존 mobileTypography 테스트 8/8 PASS. 실제 운영 headless Chromium에서 **320/375/390/520px 모두 라벨 한 줄·버튼 내부 표시·가로 넘침 없음·전체 메뉴 44px 이상**, 음악 이야기 클릭 시 SNS 화면 이동 확인. 임시 CSS 없이 확인했다.
- 메뉴 글자만 바꿨고 화면 제목은 기존 ‘내 음악 기록’이다. DB/실제 사용자 자료를 변경하지 않았다. 이전 운영 전체 검증은 아래 78a1dbb 기준이며 이번에는 해당 UI 검사만 실행했다.
- 로컬 결과: Git 제외 `.cache/social-production-ops/nav-label-live-results.json`, nav-label-320.png. 원래 IDE 브랜치/HEAD와 미커밋 변경은 보존했다. 이후 문서 저장 SHA는 GitHub 이력에서 확인한다.

## 운영 반영·검증 — 2026-11-06 KST (78a1dbb 기준)

사용자가 운영 migration·병합·배포를 명시적으로 승인했다. 아래 로컬/클라우드 단계의 미실행 보고는 당시 이력이며 현재의 운영 금지 지시가 아니다. 별도 스테이징/Docker 설치와 변경 없는 전체 테스트 반복은 하지 않았다.

1. 운영 앱·관리자 DB 대상 일치를 읽기 확인했다. PostgreSQL 17.11. 15:47:18 KST 전체 pg_dump archive 1,447,001 bytes 생성, pg_restore 목록 854개·전체 SQL 추출 검사 성공. 현재 Windows 사용자/SYSTEM만 접근하는 Git 제외 폴더에 보관했다. 운영 실복원·플랫폼 자동 백업/PITR은 미검증이다.
2. 15:49:17 KST `202611060001`→`202611060002`를 원본 변경 없이 하나의 transaction으로 적용/COMMIT했다. 기존 평가/원본/닉네임/공유 내용 지문과 개수 일치, 등록 곡 291개. 운영에 CLI migration history 테이블이 없어 자동 이력 등록은 하지 않았고 local manifest에 파일 hash/결과를 기록했다.
3. PR #21 기대 head fb3dc5b를 지정해 병합했다. 첫 운영 배포 Ready 확인 후 실제 화면에서 10px small과 약 40.125px 메뉴 폭을 발견해 **CSS 두 파일, 3줄 추가/1줄 변경**으로만 보완했다. 최종 기능 코드 78a1dbb, 운영 배포 `dpl_ARvQwrhzi1VT7iy6S3ZVaiS4AGgV` Ready 및 운영 alias 확인.
4. 합성 A/B/C를 실제 Auth API로 로그인하고 실제 PostgREST/Realtime와 전용 headless 브라우저에서 검증했다. **최신 판정 API/WS 16/16, 브라우저 13/13, 보완 관련 기존 typography 테스트 8/8 PASS.** 320/375/390px·34자 기존형 handle·긴 곡명/한글 본문/댓글·글꼴/자간/leading·44px 터치를 확인했다. 별도 창의 반응/댓글/범위/공유 취소 갱신, offline 복귀 미재노출, 직접 링크/민감 열/팔로우 취소/차단·삭제를 포함한다.
5. 실제 앱에서 테스트 A 계정을 삭제하고 B/C도 생성 ID/고유 테스트 이메일을 대조해 정리했다. 합성 신고만 ID+본문 접두사로 제한해 삭제했다. 16:12:20 KST 테스트 계정/신고 0, 원본/공유/프로필 0. 기존 평가 7·닉네임 1과 전체 내용 지문은 시작 전과 같았다. 실제 사용자 기록을 시험 목적으로 공개/삭제하지 않았다.

초기 실패도 보존했다. Realtime는 `{}` 업무 payload에 플랫폼 추적 ID를 붙이므로 수신 객체 전체가 비어 있다는 runner 가정을 고쳐 실패 4개만 재검증했다. UI 시험의 합성 한글 표준입력 인코딩과 reload 세션 재주입 문제도 바로잡았다. 실제 앱 수정은 위 두 CSS뿐이다. 변경 없는 147개 전체 테스트는 반복하지 않았다.

**검증 한계:** Google provider 활성화·PKCE authorize의 Google 302 리디렉션은 확인했지만 실제 Google 계정 인증/동의/코드 교환 완료는 미검증이다. 로그인/세션 시험은 테스트 이메일 Auth JWT와 앱 세션 반영이다. 모바일은 Chromium viewport/터치 모사로, 실기기 iOS/Android·한글 가상 키보드·설치 PWA는 미검증이다. 운영에 기존 기록/공유 행이 없어 실제 legacy backfill 사례는 없었다. 신고 일일 작업·외부 실패 알림은 기존 설정안만 있고 설치/발송하지 않았다.

복구는 보존한 전체 논리 archive/이전 Ready 배포와 데이터 보존형 후속 수정 경로를 확보했다. 실제 DB 복원/배포 롤백은 실행하지 않았다. 상세 범위·초기 실패·백업 checksum·배포 ID·합성 화면 증거는 [운영 반영 결과](../../../../MUSIC_SOCIAL_PRODUCTION.md)에 기록했다. 이번 결과 문서는 main에 게시하며 기능/DB 추가 변경 없이 경로·내용·비밀값·원래 작업 보존을 확인한다.

이후 아래 내용은 단계별 과거 인계로 보존한다. 이전의 미실행/금지 상태를 현재 결과와 섞지 않는다.

## 로컬 Supabase 전환 — 2026-11-06 KST

- 사용자 지시: 새 클라우드 Supabase 프로젝트를 만들지 않고 로컬에서 migration·실제 PostgREST·Realtime를 먼저 검증한다. 아래 이전 클라우드 안내는 과거 계획으로 보존하며 현재 선행 조건으로 요구하지 않는다.
- 시작 HEAD: `b3c17cd9882f3ca829f37c1f2ce79d79eed88a9f`, 깨끗한 통합 worktree. 기능 코드는 고정 d2a7e88과 동일하다. 원래 IDE worktree의 기존 브랜치/공연·OCR 변경을 보존했다.
- Docker 조사: PATH의 docker/podman 없음, 시스템/사용자 기본 Docker 설치 경로 없음, 관련 설치 레지스트리 항목 0, Docker 서비스/엔진 pipe 없음. DOCKER_HOST/DOCKER_CONTEXT 미설정. WSL은 샌드박스 조회 E_ACCESSDENIED 후 권한 밖 읽기 재확인에서 기본 버전 2·설치된 Linux 배포판 없음 확인. Docker Desktop 설치/시스템 기능 변경/재부팅은 실행하지 않았다.
- 실제 준비: Node 22.18.0/npm 10.9.3. 독립 `.cache/social-local-runtime`에 **Supabase CLI 3.0.0 고정 설치**, --version/help와 local init 성공. 앱 package/전역 도구/env 변경 없이 API 예정 55321·DB 55322·Studio 55323, project_id=ca-social-local-20261106 구성. 기존 기반 4개 active/SNS 2개 pending, 6개 원본 hash 일치 manifest를 로컬에 저장했다. 원격 login/link 및 운영 env 복사 없음.
- 실제 기동 시도: `supabase start --workdir .` → **exit 1 / DockerLifecycleInspectError**, `docker: command not found (podman also not found)`. DB 적용 0, 생성된 테스트 계정/기록 0. 서비스 기동 전에 막혔으므로 실제 PostgREST/Realtime 시험 결과는 없다.

| 범위 | 로컬에서 가능한 검증 | 현재 상태 |
| --- | --- | --- |
| migration·기존 기록/링크 | 기반 4개→합성 기존 원본/닉네임/공유→SNS 2개, 실제 Postgres ID/개수/권한 backfill | Docker 준비 후 실행 필요 |
| 실제 PostgREST | 로컬 GoTrue의 A/B/C 실제 JWT 및 익명으로 범위·민감 열·직접 REST·중복 반응·관계·삭제 | 미실행. 모의 fetch/SET ROLE 결과로 대체 안 함 |
| 실제 Realtime | 실제 WS 다중 client·빈 invalidate·범위/차단/공유 취소·끊김/재연결 후 재조회 | 미실행. API/WS 성공과 브라우저 화면 갱신은 별도로 판단 |
| 실제 Google OAuth | 로컬 provider/Google client·test users·callback과 사용자 로그인 필요. 클라우드 Supabase 프로젝트는 불필요 | 추가 설정 필요, 로컬 비밀번호 JWT 시험과 구분 |
| 320/375/390px·키보드/PWA | 브라우저 확인 환경, 실기기 접속 경로/필요 시 HTTPS 필요 | 추가 환경 필요. 이번에 브라우저 UI 재검증 안 함 |
| 신고 정리·알림 | 로컬 purge/스케줄 시험 가능, 지속 일일 실행·독립 감시/실제 알림은 별도 | 설치/실행/발송 없음 |

다음 단계는 Docker Desktop의 이 PC Linux 컨테이너 엔진 설치·기동과 `docker version`/`docker info`의 Client/Server 확인이다. 이후 준비된 local start→합성 사용자/기존 데이터→SNS migration→실제 서비스 테스트를 이어간다. 실제 서비스 runner도 아직 작성/실행하지 않았으며, 기존 147/147·SNS 5/5·build는 이전 검증 이력으로 유지한다. [로컬 검증 안내](../../../../MUSIC_SOCIAL_LOCAL.md)에 명령/포트/active-pending migration·로컬 가능한 범위와 추가 환경을 구분했다.

이번 변경은 CURRENT_TASK/HANDOFF, MUSIC_SOCIAL/STAGING 및 새 MUSIC_SOCIAL_LOCAL 문서 5개와 Git 제외 로컬 준비 폴더다. 기능 코드·migration 원본·운영 DB·main·운영 배포 변경 없음. 문서 링크/UTF-8/허용 경로/비밀값 패턴·PowerShell 예시 2개 문법·로컬 설정/원격 link 부재·migration 복사본 6개/manifest·소스 diff 검사 통과. 원래 파일 52개의 hash와 원래 HEAD도 보존 확인했다. 이 정적 검사는 실제 서비스 시험 결과와 구분한다. 구현 상태 IMPLEMENTED는 배포 전 검증 PASS를 뜻하지 않는다.

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

사용자의 후속 요청에 따라 [스테이징 준비·검증 안내](../../../../MUSIC_SOCIAL_STAGING.md)를 작성했다. 테스트 프로젝트 생성부터 브랜치 전용 Preview 연결, 기존 합성 fixture와 실제 서비스 시험표까지 실행 순서를 제공한다. 테스트 기반 4개→OAuth/Preview의 계정 생성만→합성 기존 원본/공유→SNS 2개 순서로 빈 DB 설치와 backfill 호환 검증을 구분한다. Preview의 브라우저/서버 양쪽 DB 설정 상속을 확인해 운영 연결이 남지 않게 한다. 공연/OCR migration 전체 적용이나 운영 데이터 복사는 계획에 포함하지 않는다.

신고 정리는 `atlas_private.purge_expired_social_reports()`만 신뢰된 DB 연결로 실행한다. UTC/GMT Cron이면 `15 18 * * *`이며 실제 cron.timezone 확인을 선행한다. cron.job_run_details와 만료 잔여 개수를 확인하고 DB 자체 중단까지 외부에서 감시하는 안이다. 수신처에 메시지를 보내거나 스케줄을 설치하지 않았다. 일일 배치의 정상 물리 삭제 지연은 만료 후 다음 실행까지 최대 약 24시간이며 엄격한 30일 시점 삭제를 이미 보장한다고 보고하지 않는다.

이번 변경: `CURRENT_TASK.md`, `HANDOFF.md`, `docs/MUSIC_SOCIAL.md`, 새 `docs/MUSIC_SOCIAL_STAGING.md` 4개. 기능/SQL migration/환경변수 변경 없음. 문서의 로컬 링크·migration 6개 경로·파일 allowlist/기준 SHA·비밀값 패턴·소스 diff 검사 통과. PowerShell 예시 2개는 AST 문법 검사만 통과했으며 예시 명령은 실행하지 않았다. 기존 147/147·전용 5/5·build는 앞선 실행 이력이고 이번에 다시 실행한 결과가 아니다. 운영 DB 연결/쓰기·main 병합·운영 배포·실제 개인 기록 공개는 하지 않았다.

다음 전달 정보: 테스트 Preview 앱 URL, Supabase project ref와 설정 위치, 배포 SHA, A/B/C 준비 여부. 비밀키는 채팅/문서에 보내지 않는다. 환경 구성 후 위 시험표의 실제 서비스 증거와 신고 일일 실행/실패 알림 수신 결과를 채우는 것이 남은 작업이다.

## 구현

기존 Supabase singleton/useGoogleAuth, 개인 원본·닉네임·공유 테이블을 재사용했다. 원본/공유 ID·기존 ?story 링크·revision·날짜·유형·기존 닉네임과 public 범위를 유지하고 신규 공유만 기본 private으로 시작한다. 공개 프로필 ID는 별도 무작위 값이며 Auth 매핑/신고는 비공개 스키마에 둔다. 기존 테이블 REST에도 열 권한과 범위·차단 RLS를 적용한다.

계정/원본 삭제는 기존 CASCADE 정책을 유지해 공유본과 종속 댓글·좋아요를 함께 삭제한다. 공유 취소는 원본을 보존한다. 신고는 공유 snapshot만 30일 만료 정책으로 분리하고 계정/공유 삭제 시 관련 FK를 NULL로 만든다. 일일 만료 정리는 운영 설정이 필요하다.

기존 로그인·새로고침 세션·로그아웃·계정 삭제를 하나로 통합했다. 초기 세션 응답 경합과 계정 간 화면/초안/응답 혼용을 막고 SDK 2.119의 local 로그아웃 선행 폐기를 검증한다. 공통 Pretendard·-0.03em·짝수 12px 이상·실제 줄 수별 line-height를 적용했다.

구조·권한·삭제 표·migration 순서·실패 복구·신고 보관은 [MUSIC_SOCIAL.md](../../../../MUSIC_SOCIAL.md)를 따른다. 이전 377개 결과는 이번 통합의 근거로 사용하지 않는다.

## 초기 통합 검증과 당시 한계 (d2a7e88 기준)

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

## 초기 게시 단계의 운영 제한 (현재 승인 이전)

운영 migration/main 병합/운영 배포는 하지 않는다. 검증한 코드 이후에는 문서만 보완하여 새 Draft PR로 게시한다. 명세 1 및 기존 main 작업 문서는 docs/collaboration/archive/에 보존했다. 원래 worktree와 PR #20은 그대로 두었다. 새 브랜치는 main과 공통 이력이 있으며 오래된 App 전체나 공연/OCR 변경을 이식하지 않았다.

실제 OAuth/PostgREST/Realtime와 직접 모바일 화면 확인, 신고 정리 운영, 실기기 PWA/복구 확인은 다음 스테이징 검토 요청이다. 이 구현자 보고를 서비스 적용 또는 검토 ACCEPTED로 취급하지 않는다.
