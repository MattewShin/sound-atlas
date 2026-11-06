# SNS 명세 2 — 로컬 Supabase 검증

- 작업: CA-SOCIAL-20261106-001 / 명세 2
- 사용자 방향 변경: 새 클라우드 Supabase 프로젝트를 만들지 않고 로컬 Supabase로 먼저 검증한다.
- 확인 기준: `b3c17cd9882f3ca829f37c1f2ce79d79eed88a9f`. 기능 코드는 기존 `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5`와 동일하다.
- 기록일: 2026-11-06 Asia/Seoul. [Draft PR #21](https://github.com/MattewShin/sound-atlas/pull/21)
- **결과: 로컬 준비 완료, Docker 부재로 서비스 검증 미완료. 운영 DB·배포 변경 없음.**

## 실제 확인·실행 결과

| 항목 | 확인 결과 |
| --- | --- |
| Docker/Podman CLI | PATH에서 찾지 못함 |
| Docker Desktop 설치 | 시스템/사용자 기본 경로 모두 없음. Docker/Podman/Rancher 설치 레지스트리 항목 0 |
| Docker 엔진 | com.docker.service 없음, docker_engine/dockerDesktopLinuxEngine pipe 없음. DOCKER_HOST/DOCKER_CONTEXT 설정 없음 |
| WSL | 권한 밖 읽기 재확인: 기본 버전 2. 설치된 Linux 배포판 없음. 샌드박스의 최초 조회 거부와 구분 |
| 실행 환경 | Windows PowerShell, Node 22.18.0/npm 10.9.3 |
| Supabase CLI | 별도 캐시 폴더에 **3.0.0 고정 설치 성공**, 실제 `--version`/명령 help 확인 |
| 로컬 프로젝트 | `supabase init --workdir .` 성공. 원격 login/link 없음, 기존 env 복사 없음 |
| migration 준비 | 기반 4개는 active migrations, SNS 2개는 pending 폴더. 6개 모두 원본 SHA-256 일치 |
| `supabase start --workdir .` | **실패**, exit 1 / `DockerLifecycleInspectError` |
| 실제 DB migration/PostgREST/Realtime | **미실행**, 컨테이너 기동 전에 실패. 합성 계정/기록도 아직 생성하지 않음 |

실제 오류:

```text
failed to inspect container health: docker: command not found (podman also not found)
— install Docker Desktop or Podman and ensure it is on PATH
```

Docker Desktop 설치/WSL 기능 변경/재부팅은 실행하지 않았다. CLI 설치는 앱의 package.json/package-lock.json이나 전역 도구를 변경하지 않았다. 기존 147/147·전용 5/5·build는 이전 코드 검증 이력이다. 이번 준비/기동 실패를 실제 서버 테스트 통과로 표현하지 않는다.

## 준비된 로컬 작업 공간

경로: `C:\Users\CNXK\dev\sound-atlas\.cache\social-local-runtime`

이 폴더는 Git에서 제외된 일회용 검증 공간이다. 실제 키/토큰을 공동 문서에 넣지 않는다. 다른 기기에서는 CLI 설치와 아래 설정을 새로 준비해야 한다.

| 설정 | 값/상태 |
| --- | --- |
| CLI | devDependency `supabase: 3.0.0`, 해당 폴더의 package-lock 보존 |
| project_id | `ca-social-local-20261106` |
| API | 예정 `http://127.0.0.1:55321` |
| DB / shadow DB | 예정 55322 / 55320 |
| Studio / local SMTP | 예정 55323 / 55324 |
| Auth site_url | `http://127.0.0.1:5177` |
| Auth redirect allowlist | `http://127.0.0.1:5177/`, `http://localhost:5177/` |
| API schemas | public/기본 graphql_public, **atlas_private 미노출** |
| Seed / Analytics | 비활성. 기존 사용자 자료/외부 AI key 미사용 |
| 로컬 migration manifest | `local-preparation.json`, 파일별 SHA-256·기준 SHA·active/pending 구분 |
| 원격 연결 | 미설정. 클라우드 계정/프로젝트 불필요 |

기반 4개:

```text
supabase/migrations/202611020001_user_track_reactions.sql
supabase/migrations/202611020002_user_account_security.sql
supabase/migrations/202611020003_private_music_journal.sql
supabase/migrations/202611020004_music_record_sharing.sql
```

기존 원본/닉네임/공유 링크의 migration 호환을 검증하기 위해 먼저 기반만 기동하고 합성 기존 데이터를 만든다. 그 뒤 아래 2개를 active migrations로 복사한다. 공연/OCR migration은 가져오지 않는다.

```text
pending-migrations/202611060001_music_social.sql
pending-migrations/202611060002_social_track_catalog.sql
```

## Docker 준비 후 이어갈 순서

1. [Docker 공식 Windows 설치 안내](https://docs.docker.com/desktop/setup/install/windows-install/)에 따라 Docker Desktop과 Linux 컨테이너 엔진을 준비한다. 실제 WSL 버전/가상화/메모리 등 시스템 요구사항을 확인하고 필요한 시스템 변경·재부팅을 처리한다. 현재 WSL 기본 버전 2라는 사실만으로 Docker 요구사항 충족을 판정하지 않는다.
2. 새 터미널에서 `docker version`, `docker info`로 **Client와 Server**가 모두 응답하는지 확인한다. 원격 Docker context를 사용하지 않고 이 PC 엔진임을 확인한다. 별도 Ubuntu 배포판을 임의로 추가하는 작업은 이번에 하지 않았다.
3. 아래 로컬 전용 명령으로 시작한다. 기동 후 실제 포트/컨테이너 상태와 Docker published port 바인딩을 확인한다. 로컬에서만 접속하고 방화벽/라우터 포트를 열지 않는다. health check를 무시해서 성공으로 만들지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\CNXK\dev\sound-atlas\.cache\social-local-runtime'
.\node_modules\.bin\supabase.cmd --version
.\node_modules\.bin\supabase.cmd start --workdir .
.\node_modules\.bin\supabase.cmd status --workdir .
```

위 start는 이번에 실제 실행했으나 Docker 부재로 실패했다. status는 서비스 기동 후 실행할 명령이다. 출력되는 로컬 API key/secret은 로그/PR에 붙이지 않는다. **CLI v3.0.0의 `init`, `start`는 Local only이며 `migration up`도 기본 Local이다.** 이 작업 공간에서는 login/link/db push/--remote를 사용하지 않는다. [공식 로컬 CLI 안내](https://supabase.com/docs/guides/local-development/cli/getting-started).

4. 실제 로컬 GoTrue에서 `ca-a-<실행 ID>@example.invalid` 등 합성 A/B/C를 만든다. 로컬 admin API는 테스트 계정 생성에만 쓰고, 테스트의 읽기/반응/댓글에는 각 사용자 `signInWithPassword`가 발급한 실제 JWT를 사용한다. 비밀번호는 실행마다 임의 생성해 메모리에서만 사용한다. 익명은 별도 client로 세션을 넣지 않는다. 이는 **로컬 Auth 세션/JWT 시험이며 Google OAuth 시험이 아니다.**
5. 기반 4개 상태에서 A의 `save_private_music_record`/`publish_music_record`를 실제 사용자 JWT로 호출한다. 합성 private 원본과 공유 원본·닉네임·기존 공유 ID/`?story=` 링크를 저장한다. public snapshot과 원본을 다르게 만들고 ID/revision/개수의 사전 증거를 남긴다. 원본·공유본에 실제 개인 기록을 사용하지 않는다.
6. 이 전용 로컬 프로젝트에 아래 2개만 추가해 적용한다. 전역/원래 저장소 migration 전체를 실행하거나 DB reset으로 기존 자료를 지우지 않는다. CLI v3.0.0 help에서 확인한 명령이며 실제 DB 적용은 아직 미실행이다.

```powershell
foreach ($fileName in @('202611060001_music_social.sql','202611060002_social_track_catalog.sql')) {
  $destination = Join-Path '.\supabase\migrations' $fileName
  if (Test-Path -LiteralPath $destination) { throw '이미 준비된 migration의 적용 이력을 먼저 확인하세요.' }
  Copy-Item -LiteralPath (Join-Path '.\pending-migrations' $fileName) -Destination $destination
}
.\node_modules\.bin\supabase.cmd migration up --workdir .
```

7. 아래 실제 서비스 시험을 실행한다. 요청 URL은 위의 loopback API만 허용하고 요청에 운영 env를 읽지 않는다. 전용 테스트 runner도 cloud URL이면 거부하도록 구성한다. 사용자 REST 요청에 admin key를 넣지 않는다. 아직 실제 서비스 runner를 작성/실행한 상태는 아니며 기존 모의 전송 테스트를 재사용해 PASS로 표시하지 않는다.
8. 완료 시 이 프로젝트의 `supabase stop --workdir .`으로 멈춘다. 다음 명령 전에 해당 CLI help/프로젝트 ID를 확인한다. Docker 전체 prune·다른 컨테이너/volume 삭제는 하지 않는다. stop 명령은 이번에 실행하지 않았다(기동된 서비스 없음).

## 로컬에서 검증할 수 있는 항목

아래는 Docker 정상화 후 가능한 범위이며 현재 실제 서버 실행 결과는 모두 미검증이다. 기대 결과/삭제 정책 상세는 [SNS 안내](MUSIC_SOCIAL.md), 시험 케이스는 [기존 검증표](MUSIC_SOCIAL_STAGING.md#6-실제-oauthpostgrest삭제-검증표)를 참고한다. 클라우드 구성 절차는 이번 작업에서 사용하지 않는다.

| 영역 | 실제 로컬 검증 방법 |
| --- | --- |
| migration/기존 호환 | 실제 Postgres에 기반 4개→합성 기존 원본/닉네임/공유→SNS 2개 적용. ID/원본/기존 공개 범위/개수 보존·비공개 원본 자동 공개 없음·snapshot 불변 |
| PostgREST/RLS/열 권한 | 실제 `/rest/v1/`와 사용자 JWT A/B/C/익명으로 private/public/followers·민감 열/select * 거부·직접 table/embedded 관계/댓글·반응/개수 검사 |
| 관계/삭제 | 팔로우 취소·양방향 차단 직후 새 요청, 공유 취소 시 원본 유지, 원본/계정 삭제 CASCADE·신고 FK NULL, 삭제된 계정 토큰 재사용 검사 |
| 반응/댓글 | 원하는 상태 중복/동시 전송, 사용자당 좋아요 1개, 같은 댓글 UUID 재시도, 자기 댓글 삭제·정확한 개수 |
| 실제 Realtime 전송 | 실제 WS client 4개와 atlas-social/invalidate/public 채널, 빈 payload, 범위 변경·차단·팔로우 취소·공유 취소 이벤트 수신 및 재조회 |
| Realtime 재연결 | B WS를 끊고 A가 권한 변경→B 재연결→새 RLS 응답에서 숨김. 연결 상태/수신/재조회 시각을 기록하고 timer 결과를 WS 성공으로 대체하지 않음 |
| UI 세션/화면 | 로컬 앱과 브라우저가 준비되면 화면 제거·초안 폐기·계정 전환·연결 복귀를 추가 확인. SDK 이벤트 수신만으로 타인 화면 갱신 통과를 보고하지 않음 |
| 신고 정리 함수 | 합성 만료/미만료 신고를 만들어 실제 DB purge 권한과 삭제 수 검증. pg_cron 설치 가능 여부/일일 실행은 별도 확인 |

앱 연결은 기존 env를 덮어쓰지 않고 별도 프로세스에 loopback URL과 **로컬 공개 키만** 전달한다. `VITE_SUPABASE_URL=http://127.0.0.1:55321`, `VITE_SUPABASE_PUBLISHABLE_KEY=<로컬 공개 키>`를 사용하며, 실제 생성된 로컬 키 종류를 status에서 확인한다. 로컬 개발 서버는 `127.0.0.1:5177`로 바인딩한다. 서버/브라우저 양쪽에 운영 DB 설정을 전달하지 않는다.

## 추가 환경이 필요한 항목

| 항목 | 추가 조건/검증 한계 |
| --- | --- |
| 실제 Google OAuth | Google Web OAuth client/test users·로컬 provider secret·허용 origin/redirect가 필요. callback은 로컬 API의 `http://127.0.0.1:55321/auth/v1/callback`, 앱 redirect는 `http://127.0.0.1:5177/`. Google 정책/설정에서 실제 허용 여부 확인. 사용자 직접 로그인 필요 |
| 모바일 320/375/390px 레이아웃 | 동작하는 브라우저 자동화/직접 확인 환경 필요. 이전 URL 확인 실패로 중단된 도구 상태를 이번에 성공으로 바꾸어 보고하지 않음. 실제 font/computed style·줄 수·메뉴/터치 확인 필요 |
| 실기기 키보드/PWA | 모바일 Safari/Chrome·테스트 접속 경로/필요 시 HTTPS 필요. 휴대폰의 127.0.0.1은 PC가 아니므로 현재 loopback 구성만으로 접속 불가. LAN/터널 노출은 이번 작업에서 설정하지 않음 |
| 운영과 같은 장애/성능 | 로컬 서비스와 실제 운영 Supabase/Vercel의 버전·설정·지연/제한이 다를 수 있음. 로컬 성공만으로 운영 검증을 대신하지 않음 |
| 신고 일일 작업/실패 알림 | 로컬 purge/시험 스케줄 검증과 운영의 지속 실행·외부 감시·알림 수신은 별도. [기존 설정안](MUSIC_SOCIAL_STAGING.md#9-신고-일일-정리실패-알림-설정안)은 미설치이며 운영 변경 없음 |

Google OAuth는 새 클라우드 Supabase 프로젝트 없이도 로컬 provider 설정으로 시험할 수 있다. 현재는 Google 설정/로그인과 실제 로컬 서비스가 모두 준비되지 않았다. [Supabase Google 로컬 설정](https://supabase.com/docs/guides/auth/social-sign-in/auth-google#local-development).

Pretendard·-0.03em·최소 12px 짝수·실제 한 줄 normal/여러 줄 1.5 규칙은 바꾸지 않았다. 로컬 Auth/API/WS 시험과 모바일 시각 확인을 각각 구분해 기록한다.

## 남은 작업

선행 조건은 **Docker Desktop 설치 및 이 PC Linux 컨테이너 엔진 기동**이다. 그 뒤 Client/Server 상태 확인→준비된 로컬 start→합성 데이터→SNS migration→실제 PostgREST/Realtime 검증을 이어간다. 신규 클라우드 Supabase 프로젝트/Vercel Preview 구성은 이번 경로의 선행 조건이 아니다. 운영 DB·main·운영 배포는 변경하지 않는다.
