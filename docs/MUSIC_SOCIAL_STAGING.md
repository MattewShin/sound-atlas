# SNS 명세 2 — 스테이징 준비와 배포 전 검증

- 작업: CA-SOCIAL-20261106-001 / 명세 2
- 이번 검증 기준 HEAD: `5a302bcaff00c33246a2d68c8e688aa67b54cf89`
- 기능 코드: `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5` (기준 HEAD까지 이후 변경은 문서)
- 기록: 2026-11-06 Asia/Seoul. [Draft #21](https://github.com/MattewShin/sound-atlas/pull/21)
- **현재 결과: 스테이징 미구성. 아래는 준비·실행 계획이며 실행 성공 보고가 아니다.** 사용자가 별도 스테이징이 아직 없다고 확인했다.

## 이번에 확인한 사실

통합 worktree의 HEAD가 기준과 같고 작업 트리는 깨끗했다. 원래 IDE worktree는 이전 브랜치와 공연/OCR 미커밋 변경을 유지한다. 통합 worktree에는 실값 `.env`가 없고 `.env.example`만 있다. 원래 worktree에는 기존 서버 DB 설정이 있지만 스테이징으로 확인되지 않아 연결하거나 재사용하지 않았다. 프로세스 환경에서 staging/Supabase/DB/Google 설정도 발견하지 못했다. Docker/Supabase CLI/psql은 PATH에서 사용할 수 없으며 연결된 Supabase 관리 도구도 없다. 원격 환경의 존재를 키 이름만으로 추정하지 않았다.

GitHub에서 기준 SHA의 Vercel status=success와 PR OPEN/DRAFT·미병합을 확인했다. 이는 Preview의 DB 분리·OAuth·런타임 동작 검증이 아니다. 해당 Vercel 프로젝트의 실제 환경변수 값과 Preview 앱은 확인하지 못했다. 브라우저 호스트가 없고 Windows 현재 URL을 정책상 확인할 수 없어 컴퓨터 사용 도구가 중단됐다. 브라우저 조작을 다른 방식으로 우회하지 않았다.

실제 migration/OAuth/PostgREST/Realtime/320·375·390px 화면 검증은 **미실행**이다. 기존 147/147·SNS 5/5·build는 앞선 로컬 검증 이력으로만 유지한다. 이번에는 기능 변경이 없어 재실행하지 않았다.

## 1. 테스트용 Supabase 프로젝트 만들기

1. Supabase Dashboard에서 운영과 **다른 새 프로젝트**를 만든다. 예: `classic-atlas-social-staging`. 운영 데이터 복원/사용자 복제/운영 프로젝트 branching의 데이터 복사는 하지 않는다. 프로젝트 비용·리전은 계정에서 확인하고 선택한다.
2. 운영과 다른 project ref와 Project URL인지 확인한다. 새 DB 비밀번호는 비밀 저장소에 보관한다. Connect/API 설정에서 Project URL과 publishable key를 확보한다. 키 값·비밀번호는 Git/공동 문서/채팅에 넣지 않는다.
3. 테스트용 Google 계정 A/B/C를 준비한다. 각 계정은 서로 다른 브라우저 프로필에서 사용하고 익명은 별도 비로그인 창을 사용한다. 운영에서 사용하던 개인 기록을 옮기지 않는다.
4. API exposed schemas에 `atlas_private`를 추가하지 않는다. 공개 API 역할에 service_role을 사용하지 않는다. 서버 전용 키가 필요한 경우 이 테스트 프로젝트의 키만 별도로 보관한다.

## 2. SNS에 필요한 migration만 준비하기

기존 저장소의 migration 전체를 새 프로젝트에 일괄 적용하면 공연/OCR 변경까지 포함된다. **별도 CLI 작업 폴더에 아래 6개 파일만** 준비한다. 원래 worktree의 link 설정은 건드리지 않는다. CLI는 별도 폴더에 설치하고 정확한 버전을 실행 기록에 남긴다. [공식 CLI 설치 안내](https://supabase.com/docs/guides/local-development/cli/getting-started)를 따른다.

| 단계 | migration | 영향 |
| --- | --- | --- |
| 기존 기반 1 | `202611020001_user_track_reactions.sql` | 기존 보관/평가 테이블 |
| 기존 기반 2 | `202611020002_user_account_security.sql` | 쓰기 RPC·계정 삭제 |
| 기존 기반 3 | `202611020003_private_music_journal.sql` | 비공개 원본·revision |
| 기존 기반 4 | `202611020004_music_record_sharing.sql` | 기존 닉네임·공유 snapshot/링크 |
| SNS 1 | `202611060001_music_social.sql` | 기존 공유 확장·별도 공개 ID·권한·관계·반응·신고 |
| SNS 2 | `202611060002_social_track_catalog.sql` | 등록 곡 291개, 사용자 데이터 없음 |

Windows PowerShell 예시다. **이 문서의 명령은 이번 작업에서 실행하지 않았다.** `social-integration`의 위 6개 SQL은 검증 기준과 같아야 한다. 아래 첫 단계에서는 기반 4개만 복사한다.

```powershell
$sourceRoot = 'C:\Users\CNXK\dev\sound-atlas\.cache\social-integration'
$stageCliRoot = 'C:\Users\CNXK\dev\sound-atlas\.cache\social-staging-cli'
if (Test-Path -LiteralPath $stageCliRoot) { throw '새 빈 작업 폴더를 선택하세요.' }
New-Item -ItemType Directory -Path $stageCliRoot | Out-Null
Set-Location -LiteralPath $stageCliRoot
npm init -y
npm install --save-dev supabase
npx supabase --version
npx supabase init
New-Item -ItemType Directory -Path '.\supabase\migrations' -Force | Out-Null
$foundation = @(
  '202611020001_user_track_reactions.sql',
  '202611020002_user_account_security.sql',
  '202611020003_private_music_journal.sql',
  '202611020004_music_record_sharing.sql'
)
foreach ($fileName in $foundation) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot "supabase\migrations\$fileName") -Destination '.\supabase\migrations\'
}
npx supabase login
$stageRef = Read-Host '새 스테이징 project ref (운영 ref가 아닌지 Dashboard와 대조)'
npx supabase link --project-ref $stageRef
npx supabase db push --dry-run
```

Dashboard의 **새 테스트 프로젝트 ref**, CLI 연결 ref와 dry-run의 기반 4개 목록이 맞는지 확인한 뒤 같은 폴더에서 `npx supabase db push`를 실행한다. 로그인/DB 비밀번호 입력은 사용자가 로컬에서 처리한다. 비밀번호를 명령행 인수나 기록에 넣지 않는다. 이 작업에는 로컬 Supabase 컨테이너를 시작하지 않는다.

이후 OAuth·Preview에서 테스트 계정을 만들고 아래의 호환 fixture를 준비한 뒤 SNS 2개를 추가한다. 이렇게 해야 빈 DB 적용뿐 아니라 기존 공유본 backfill도 확인할 수 있다. `db push`는 migration 이력을 관리하며 dry-run으로 대상 목록을 확인할 수 있다. SQL Editor로 스키마를 수동 적용한 상태에서 이를 중복 실행하지 않는다. [공식 migration 안내](https://supabase.com/docs/guides/deployment/database-migrations), [CLI db push](https://supabase.com/docs/reference/cli/introduction#supabase-db-push).

## 3. 테스트 전용 Google OAuth 설정

1. Google Auth Platform에서 테스트용 Web OAuth client를 별도로 준비한다. Audience가 Testing이면 A/B/C를 test users로 등록한다. 운영 client/동의 화면 설정을 수정하지 않는다.
2. Authorized redirect URI에 **새 Supabase 프로젝트**의 `https://<staging-ref>.supabase.co/auth/v1/callback`을 등록한다. Authorized JavaScript origins에는 다음 단계에서 확보한 Preview origin을 추가한다.
3. 새 Supabase 프로젝트의 Authentication → Google provider에 이 client ID/secret을 설정한다. Secret은 Supabase 설정에만 저장하고 `VITE_` 변수로 만들지 않는다.
4. Supabase URL Configuration의 Site URL과 Redirect URLs에 사용할 Preview의 정확한 `https://.../`를 등록한다. 이 코드의 `redirectTo`는 `window.location.origin + '/'`다. deployment URL과 branch URL로 각각 접속할 계획이면 두 URL을 각각 등록한다.

Google의 callback URI는 **Supabase 주소**, 로그인 후 돌아올 Site/Redirect URL은 **Preview 앱 주소**다. 두 주소를 혼동하지 않는다. 기존 singleton의 PKCE 세션을 그대로 사용한다. [Supabase Google 설정](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 4. Vercel Preview를 테스트 DB에만 연결하기

1. 기존 Vercel 프로젝트에서 Production Branch/main 설정은 그대로 둔다. 통합 브랜치 `codex/ca-social-20261106-001-integration`의 **Preview**를 사용한다. Promote to Production은 하지 않는다.
2. Settings → Environment Variables에서 다음 값을 **Preview + 해당 Git 브랜치에만** 추가한다. Production/모든 Preview 범위를 선택하지 않는다.

| 변수 | 테스트 브랜치의 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | 새 테스트 Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 같은 프로젝트 publishable key |
| `VITE_SUPABASE_ANON_KEY` | 기존 별칭이 상속된다면 테스트 프로젝트 공개 anon key로 대체. publishable이 우선하지만 운영 값을 남기지 않음 |
| `SUPABASE_URL` | 서버 설정이 상속된다면 새 테스트 URL로 대체 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 경로에 필요하거나 같은 이름의 운영 키가 상속된다면 **테스트 프로젝트** 서버 키로 대체. 브라우저 사용 금지 |

3. 팀/프로젝트/Marketplace에서 상속된 다른 `DATABASE_URL`·`POSTGRES_*`·Google secret·공연 배치 키도 살핀다. 운영 자원으로 연결되는 값은 이 Preview에서 사용하지 않게 분리한다. 이를 확인할 수 없으면 연결하지 말고 별도 테스트 Vercel 프로젝트에서 Preview를 구성한다. SNS 검증에 공연/OCR 배치·KOPIS 실행은 필요하지 않다.
4. 환경변수를 저장한 뒤 기준 SHA의 Preview를 다시 빌드한다. Vite 공개 설정은 빌드 시 들어가므로 이전 Ready 배포를 그대로 열어서는 바뀌지 않는다. 배포 상세에서 Environment=Preview, source SHA를 확인한다. 이후 문서 커밋의 배포를 쓰면 기능 경로 diff가 없음을 기록한다.
5. Preview의 Network에서 Auth/REST/WSS가 **테스트 ref 하나로만** 향하는지 확인한 뒤 로그인한다. 헤더 토큰·OAuth code·개인 이메일을 캡처/문서에 남기지 않는다. 배포 보호를 사용하는 경우 테스트 담당자가 정상 접근 권한으로 연다.

브랜치별 Preview 변수는 같은 이름의 공통 Preview 변수보다 우선하며, 값 변경은 새 배포에 적용된다. [Vercel 환경변수](https://vercel.com/docs/environment-variables).

이 시점에는 SNS migration 전이므로 SNS 화면/API가 아직 준비되지 않은 것이 정상이다. **로그인으로 A/B/C의 테스트 Auth 계정 생성까지만** 진행한다. SNS 동작 판정은 다음 단계 이후에 한다. OAuth가 실패하면 callback/Redirect URL/Google test users부터 확인한다.

## 5. 기존 데이터 fixture와 SNS migration 적용

기반 4개가 적용된 새 프로젝트에서, OAuth로 만든 테스트 A의 UUID를 비공개로 확인한다. 다음 SQL은 **운영이 아닌 새 프로젝트 SQL Editor에서만 실행할 합성 데이터 템플릿**이다. 실제 개인 기록을 가져오지 않으며 원본·닉네임·공유 ID 보존을 확인하기 위한 것이다. 기본 UUID를 테스트 A의 UUID로 바꾸고, 실행 전에 프로젝트 ref를 다시 확인한다. 이 DML은 migration 이력을 변경하지 않는다.

```sql
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001'; -- 테스트 A로 교체
  private_id uuid := gen_random_uuid();
  shared_source_id uuid := gen_random_uuid();
begin
  if to_regclass('public.music_social_profiles') is not null then
    raise exception 'SNS 적용 전의 빈 테스트 계정에서만 실행';
  end if;
  if not exists(select 1 from auth.identities where user_id=a and provider='google')
     or exists(select 1 from public.user_music_journal where user_id=a)
     or exists(select 1 from public.user_music_nicknames where user_id=a) then
    raise exception '빈 테스트 Google 계정을 확인';
  end if;
  insert into public.user_music_nicknames(user_id,nickname) values(a,'CA STAGE A');
  insert into public.user_music_journal(id,user_id,track_id,kind,body,recorded_on)
  values
    (private_id,a,'chopin-etude-op10-no1','free','CA-STAGE 공개하면 안 되는 합성 원본',current_date),
    (shared_source_id,a,'chopin-etude-op10-no1','listening','CA-STAGE 공유 원본 합성 내용',current_date);
  insert into public.music_record_publications(id,owner_id,source_record_id,source_revision,track_id,nickname,body,kind,recorded_on)
  values(gen_random_uuid(),a,shared_source_id,1,'chopin-etude-op10-no1','CA STAGE A','CA-STAGE 기존 공유본 합성 내용','listening',current_date);
end $$;
```

테스트 행의 ID·revision·날짜·유형·닉네임·공유 snapshot·개수를 비공개 실행 기록에 저장한다. 공유 ID로 `?story=<공유 ID>`를 준비한다. 이것은 migration/기존 데이터 호환 fixture이며 **실제 사용자 REST 쓰기 권한 검증을 대신하지 않는다.** 이후 새 기록·공유는 반드시 A/B/C의 실제 사용자 세션으로 작성한다.

같은 staging CLI 폴더에서 SNS 2개 파일을 복사한다. 아래는 계획 명령이다.

```powershell
foreach ($fileName in @('202611060001_music_social.sql','202611060002_social_track_catalog.sql')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot "supabase\migrations\$fileName") -Destination '.\supabase\migrations\'
}
npx supabase db push --dry-run
# 대상 ref와 새로 적용할 2개 파일만 표시되는지 확인한 후 실행
npx supabase db push
npx supabase migration list
```

001은 원본을 복사/공개하지 않고 기존 공유를 public으로 유지한다. 기존 원본/공유/닉네임과 ID가 동일하며 원본 2개·공유 1개가 유지되는지 확인한다. 002의 등록 곡은 291개다. 001→002 완료 전 공유 쓰기를 열지 않는다. 001 실패는 transaction rollback, 002만 실패하면 원인 수정 후 미적용 002만 다시 적용한다. [기존 복구 정책](MUSIC_SOCIAL.md#적용-순서실패-복구-운영-미실행)을 따른다.

## 6. 실제 OAuth·PostgREST·삭제 검증표

현재 아래 모든 항목은 **미실행**이다. 각 항목별 실행 시각(KST), 배포 SHA, 테스트 project ref, 주체 A/B/C/익명, 안전한 요청 경로·HTTP/DB 오류 코드·기대/실제·판정만 기록한다. 토큰/이메일/실제 개인 본문을 증거에 포함하지 않는다. 사용자 요청에 service_role을 넣거나 `SET ROLE`/모의 fetch로 대체하지 않는다. Google 인증창 조작은 사용자가 직접 처리한다.

| ID | 절차 | 통과 기준 |
| --- | --- | --- |
| AUTH-1 | A Google 로그인→새로고침→로그아웃→뒤로 가기/새로고침 | 동일 기존 세션 흐름, 로그아웃 후 A 원본·followers·초안 미노출 |
| AUTH-2 | 같은 브라우저 A 로그아웃→B Google 로그인. 다른 프로필의 A는 유지 | B 화면/API가 A 토큰/원본/초안을 재사용하지 않음. Google 이름/이메일 자동 표시 없음 |
| LEGACY-1 | 위 fixture의 원본·닉네임·기존 ?story 및 새 #music 링크 | ID/내용/revision/공유 개수 유지, 중복 원본 없음, 비공개 원본 자동 공개 없음 |
| LEGACY-2 | 원본 수정, 기존 공유 private/followers 변경, 기존 링크 직접 열기 | snapshot 불변, 예전 링크와 안전한 기존 테이블 API도 새 범위 적용 |
| ACL-1 | A의 private/public/followers 게시물. B만 A 팔로우, C 미팔로우, 익명 별도 접속 | 아래 권한 표와 일치. 댓글/좋아요 행·개수도 함께 제한 |
| ACL-2 | 각 주체로 REST `music_record_publications?select=*`, `?select=owner_id`, `?select=source_record_id`, `?select=source_revision` | 민감 열 요청 거부. 익명/로그인에 따라 401/403 가능, SQLSTATE 42501 확인. 민감값 응답 0 |
| ACL-3 | 안전한 열 목록 조회, social_feed/profile, 댓글/profile/follow/like 직접 REST 및 embed | Auth UUID/source ID 없는 공개 필드. 숨긴 행은 빈 배열/불가 응답이며 개수·본문도 누출 없음 |
| ACL-4 | 비공개 journal/닉네임, atlas_private 스키마·함수에 익명/다른 사용자 요청. 공개 테이블 직접 INSERT/UPDATE/DELETE | 본인 원본 외 접근·직접 쓰기 거부. 단순히 RPC 결과만 제한한 상태로 통과 처리하지 않음 |
| REL-1 | B가 반응 후 A 팔로우 취소→기존 직접 링크/댓글/좋아요 API 재호출 | followers 조회/반응/댓글 거부. 재팔로우하면 보존했던 반응 개수 복구. 자기 팔로우 거부 |
| REL-2 | A가 B 차단, B도 A 차단 방향 시험, 해제 | 상호 프로필/글/반응 숨김, 상호 팔로우 제거/쓰기 거부. 해제만으로 팔로우 복원 안 됨. 익명 public 조회는 정책상 가능 |
| REACT-1 | 좋아요 desired=true 중복/동시 요청→false 중복, 댓글 같은 UUID 재시도/실패 후 재전송/자기 삭제 | 좋아요 사용자당 1개, 개수 일치, 댓글 중복 없음·실패 초안 보존·삭제 후 개수 갱신 |
| DELETE-1 | 공유 취소, 별도 fixture 원본 삭제 | 취소는 원본 유지; 원본 삭제는 공유와 모든 사용자의 댓글·좋아요 삭제 |
| DELETE-2 | 테스트 A의 계정 삭제 후 B/C/익명·기존 링크·이전 토큰 요청 | A 원본/공유/프로필/관계/자기 반응 및 A 글에 달린 타인 반응 삭제. 삭제된 계정으로 새 쓰기 거부. 신고 snapshot은 별도 보관/FK NULL |

| A 게시물 범위 | A | B(현재 팔로워) | C | 익명 |
| --- | --- | --- | --- | --- |
| private | 읽기·반응·댓글 | 불가 | 불가 | 불가 |
| public | 읽기·반응·댓글 | 읽기·반응·댓글 | 읽기·반응·댓글 | 읽기만 |
| followers | 읽기·반응·댓글 | 읽기·반응·댓글 | 불가 | 불가 |

실제 REST는 테스트 endpoint의 `/rest/v1/`에서 검증한다. 익명은 publishable apikey만 보내고 Authorization은 생략한다. 로그인은 **그 사용자의 테스트 Auth access token**을 사용한다. publishable key를 Bearer JWT로 보내지 않는다. 직접 테이블 안전 열은 `id,track_id,nickname,body,kind,recorded_on,published_at,profile_id,visibility`다. 세션 만료와 계정 삭제 후 JWT 검증/기존 토큰 재사용도 별도로 확인한다.

## 7. 실제 Realtime 다중 접속 검증

현재 전부 미실행. A/B/C/익명 창을 동시에 열고 이벤트 수신 시각→행 제거→재조회 완료 시각을 기록한다. public Broadcast topic=`atlas-social`, event=`invalidate`, payload=`{}`, private=false가 DB/client 양쪽에서 일치해야 한다. 공개 채널 사용이 허용되는지 확인하고 메시지에 사용자/글 식별자나 본문이 없는지도 검사한다. private/followers 행 자체를 Postgres Changes publication에 추가하지 않는다. [공식 Broadcast 안내](https://supabase.com/docs/guides/realtime/broadcast).

- 연결 창이 SUBSCRIBED 된 뒤 public→private, followers→private, 팔로우 취소, 양방향 차단, 공유 취소를 각각 실행한다. 타인 피드/곡별/프로필/기존 링크/열린 댓글에서 제거되고 같은 사용자의 새 REST 요청도 거부되는지 확인한다.
- 처음 연결된 상태에서 이벤트 누락 없이 갱신되는지 확인한다. 60초 재조회로 뒤늦게 사라진 것을 Realtime 통과로 처리하지 않는다. 관측 지연을 기록하며 이 코드의 이벤트가 모든 브라우저에 원자적·즉시 전달된다고 보장하지 않는다.
- B의 전체 네트워크 offline 및 WSS만 끊는 경우를 각각 만든다. 끊긴 동안 A가 범위를 변경/차단/공유 취소한다. 연결 오류 후 내용이 비워지고, 재연결 후 새 권한 응답 전에는 옛 글/댓글/초안이 재등장하지 않아야 한다.
- 탭 숨김/복귀, 뒤로 가기, 강제 새로고침, 토큰 갱신 중 계정 전환도 반복한다. localStorage/IndexedDB/Cache Storage에 followers 본문이 저장되지 않는지 확인한다. 기존 Auth 세션 저장과 콘텐츠 저장을 구분한다.
- Broadcast from Database는 활성 WebSocket/메시지 파티션 등 서비스 조건을 확인한다. migration에서 send 함수 부재를 허용하므로 migration 성공만으로 Realtime 작동을 판정하지 않는다.

## 8. 모바일 320/375/390px 확인

각 폭에서 긴 등록 곡명(작품번호/악장 포함), 입력 최대 24자 handle과 기존 backfill 임시 handle(34자), 여러 줄 닉네임·4,000자 본문·2,000자 댓글/줄바꿈·긴 공백 없는 문자열을 사용한다. 데이터는 `CA-STAGE` 합성 내용만 쓴다. 현재 세 폭 모두 **미실행**이다.

- 프로필/곡/시각 충돌, 가로 overflow, 글자 잘림 없이 자연스러운 줄바꿈. 더 보기/정확한 날짜/메뉴가 화면 밖이나 하단 nav 뒤에 숨지 않아야 한다.
- 메뉴·범위 확인·삭제 확인·댓글 작성창을 각각 열고 버튼 정렬과 충분한 터치 영역(기준 44×44 CSS px)을 실제 경계로 확인한다. 글꼴 크기만으로 터치 영역을 판정하지 않는다.
- Computed Style의 Pretendard와 실제 로딩된 WOFF2, letter-spacing=-0.03em, font-size≥12px인 짝수 값, 실제 한 줄 normal/여러 줄 1.5를 제목/본문/보조/버튼/input/댓글에서 확인한다. 창 폭/본문 편집/글꼴 로딩 후에도 다시 확인한다.
- 모바일 Safari/Chrome 실기기에서 한글 IME·키보드 열기/닫기, textarea 포커스·스크롤·댓글 등록·하단 nav·safe area를 확인한다. 데스크톱 viewport 모사만으로 실제 키보드/PWA 통과를 보고하지 않는다.
- 원래 검색/보관함/개인 기록/로그인도 같은 폭에서 확인하고 screenshot에는 OAuth code/토큰/개인 이메일을 포함하지 않는다.

## 9. 신고 일일 정리·실패 알림 설정안

**설치·실행·알림 발송 모두 미실행.** 담당자/알림 수신처/별도 감시 실행 환경도 아직 정해지지 않았다. 아래는 스테이징에서 먼저 시험할 제안이다.

| 항목 | 제안 |
| --- | --- |
| 실행 | Supabase Cron(pg_cron), 매일 03:15 KST. `cron.timezone`이 UTC/GMT일 때 `15 18 * * *` |
| 권한 | 신뢰된 DB 관리 연결이 등록. anon/authenticated 권한 확대·공개 purge RPC 추가 안 함 |
| 작업 | `select atlas_private.purge_expired_social_reports();` |
| 증거 | cron.job 등록/active/command/timezone + cron.job_run_details succeeded + 만료 행 0/미만료 유지 |
| 감시 | DB Cron과 독립된 외부 감시가 15분마다 확인. DB 접속 자체 실패도 알림 |
| 알림 | 마지막 시도 실패, 실행 10분 초과, 03:45 KST까지 당일 성공 없음, job 없음/비활성, 마지막 성공 26시간 초과, 성공 후에도 만료 잔여 발생 |
| 전달 | 담당 운영자 지정 후 이메일 또는 승인된 운영 webhook. 알림에 환경·job·KST 시각·상태·오류 코드만, 신고 사유/snapshot/프로필/토큰 제외 |
| 알림 실패 | 외부 감시의 전송 실패 재시도·중복 억제·복구 알림 및 별도 heartbeat 누락 감시 설정 |

Cron은 run 기록을 `cron.job_run_details`에 남긴다. 시간대는 pg_cron의 설정을 확인하며 DB session TimeZone만 보고 판단하지 않는다. [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_cron 설정](https://github.com/citusdata/pg_cron#extension-settings).

다음 SQL도 **설정안**이며 실제 실행하지 않았다. Supabase에서 Cron을 활성화한 후 테스트 프로젝트의 신뢰된 연결에서 검토한다. 같은 이름의 job은 덮어쓸 수 있으므로 먼저 기존 등록 내용을 확인한다. [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).

```sql
select current_setting('cron.timezone', true) as cron_timezone;
select jobid,jobname,schedule,active from cron.job
where jobname='ca-social-report-purge-daily';

do $$
begin
  if coalesce(current_setting('cron.timezone',true),'') not in ('UTC','GMT') then
    raise exception 'Cron 시간대 확인 후 KST 03:15에 맞게 스케줄 조정 필요';
  end if;
  if exists(select 1 from cron.job where jobname='ca-social-report-purge-daily') then
    raise exception '기존 job의 환경/소유자/명령 확인 후 변경';
  end if;
  perform cron.schedule('ca-social-report-purge-daily','15 18 * * *',
    'select atlas_private.purge_expired_social_reports();');
end $$;

select d.status,d.start_time,d.end_time -- 오류 메시지 원문은 외부 알림에 전달하지 않음
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='ca-social-report-purge-daily'
order by d.start_time desc limit 5;
select count(*) as expired_remaining from atlas_private.social_reports
where expires_at<=now();
```

외부 감시는 운영 DB 비밀번호/service key를 브라우저에 두지 않는다. 실제 구현 시 위의 job 상태/시각/만료 개수만 반환하는 제한된 관리 함수와 전용 모니터 권한을 별도 검토·설정한다. 현재 공개 API에 해당 모니터 endpoint는 없다. DB 안에서만 실패 알림을 실행하면 DB 중단을 감지할 수 없으므로 독립 감시까지 준비되어야 설정 완료로 판정한다.

스테이징의 합성 신고 2개로 만료/미만료를 만들고 Run now와 실제 다음 일일 실행을 각각 확인한다. 별도 시험 job의 오류/비활성·감시 중단·알림 전송 실패를 주입해 실제 수신/재시도/복구를 확인한 후 설정 완료를 기록한다. 운영에는 이 작업에서 설치하지 않는다.

신고는 생성 후 30일에 만료되지만 일일 배치의 물리 삭제는 정상 가동 시 다음 실행까지 최대 약 24시간 지연될 수 있다. 장애 시 추가 지연을 알린다. 이 계획을 정확히 30일 시점의 물리 삭제 보장으로 표현하지 않는다. 보관기간의 제품 정책 변경은 별도 판단이다.

## 완료 판정과 다음 전달 정보

지금 상태는 구현자 IMPLEMENTED, **배포 전 검증 미완료**다. 스테이징 구성 후 앱 URL·테스트 project ref/설정 위치·배포 SHA·A/B/C 준비 여부를 전달하면 실제 서비스 검증을 이어갈 수 있다. 비밀키나 개인 기록은 전달할 필요가 없다. 위 실행표의 실제 결과와 신고 스케줄/감시/실제 알림 수신 증거를 채우기 전에는 배포 검증 PASS/ACCEPTED로 표시하지 않는다. 운영 migration/main 병합/운영 배포는 이번 작업에서 하지 않는다.
