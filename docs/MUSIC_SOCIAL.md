# 곡 중심 음악 기록 SNS — 명세 2

- 작업: CA-SOCIAL-20261106-001 / 명세 2
- 통합 브랜치: `codex/ca-social-20261106-001-integration`
- 시작 원격 main: `f50251e95fe9c2e00290c6eee6329017e9d2e9f4`
- 이전 검토: [Draft #20](https://github.com/MattewShin/sound-atlas/pull/20) / `8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e` (보존)
- 작성일: 2026-11-06 Asia/Seoul. 고정 코드 SHA와 최종 검증은 [HANDOFF](../HANDOFF.md)를 따른다.
- 검증 코드 SHA: `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5`, tree `e9773ba88b48ea9dccec689d959a4e63be72160e`.
- 배포 전 확인 기준 HEAD: `5a302bcaff00c33246a2d68c8e688aa67b54cf89`. 스테이징 미구성을 사용자에게 확인했다. 실제 서비스 검증은 미실행이며 [환경 구성·검증표·신고 정리 설정안](MUSIC_SOCIAL_STAGING.md)을 별도로 준비했다. 운영 적용은 하지 않았다.
- 현재 검증 경로: 사용자 지시로 신규 클라우드 프로젝트 대신 [로컬 Supabase](MUSIC_SOCIAL_LOCAL.md)로 전환. CLI 3.0.0/격리 프로젝트 준비와 start 시도까지 실행했지만 Docker 부재로 실패했다. 실제 migration/PostgREST/Realtime는 아직 미실행이다.

## 통합 기준

최신 main에서 별도 worktree를 만들고 SNS 관련 기능만 이식했다. 오래된 App/공연/OCR 코드를 덮어쓰거나 공통 이력이 없는 PR #20을 merge하지 않았다. 기존 초보자/숙련자 검색·보관함·공연·PWA·곡 ID·감정 평가를 유지한다.

`src/lib/supabaseClient.js`의 단일 client와 `useGoogleAuth`를 재사용한다. 기존 `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`가 우선이고 공개 anon 키 별칭도 지원한다. 별도 OAuth client·별도 인증 저장소·SNS 전용 세션을 만들지 않는다. 기존 새로고침 로그인 유지도 보존한다. SDK는 2.119로 올려 local 로그아웃이 네트워크 응답 전 기기 세션을 폐기하도록 한다. 초기 getSession 응답이 나중 계정 상태를 덮지 못하게 하고 화면을 사용자/세션 버전으로 격리한다.

## 기존 데이터와 공개 응답

| 데이터 | 처리 |
| --- | --- |
| `user_music_journal` | 기존 원본 ID·본문·날짜·유형·revision 유지. 복사/대체/자동 공개 없음 |
| `user_music_nicknames` | 기존 닉네임과 유일성·변경 불가 정책 유지. Google 이름/이메일/사진 복사 없음 |
| `music_record_publications` | 기존 공유 ID·본문 snapshot·원본 FK 유지. 새 `profile_id`, `visibility` 추가 |
| `social_tracks` | 앱 등록 곡 291개 ID/제목/작곡가. 새 공유는 등록 곡만 허용 |
| `music_social_profiles` | 별도 무작위 공개 프로필 ID, 고유 handle, 기존 닉네임, 선택 이미지. Auth UUID 없음 |
| `atlas_private.social_accounts` | Auth UUID ↔ 공개 프로필 매핑. anon/authenticated는 스키마·테이블·함수 접근 불가 |
| `music_social_follows/blocks/likes/comments` | 공개 프로필 ID와 공유 ID만 사용. 쓰기는 권한 검증 RPC만 가능 |
| `atlas_private.social_reports` | 운영자 전용 신고. Auth UUID/비공개 원본 ID를 저장하지 않음 |

기존에 공개 중인 공유본 작성자만 공개 프로필을 backfill한다. 공유를 모두 취소한 사람의 저장 닉네임을 자동 공개하지 않는다. 그 닉네임은 본인용 `social_me`에서 설정 힌트로 읽고, 명시적 프로필 저장/공유 때 재사용한다. 기존 handle이 없는 작성자는 별도 공개 ID로 만든 고유 임시 handle을 쓰며 내 프로필에서 설정한다. 기존 닉네임은 다시 입력하거나 다른 이름으로 대체할 필요가 없다.

원본/공유본을 새 테이블에 복제하지 않으므로 기존 기록·공유가 중복 생성되지 않는다. 신규 공유 RPC도 기존 publish RPC의 원본 소유권·revision·본문 한도·닉네임·공유 개수·동일 UUID 재시도 검사를 사용한다. 개인 기록 수정은 공유 snapshot을 바꾸지 않는다. 기록 날짜/유형과 4,000자 한도도 유지한다.

공개 피드 RPC는 지정 필드와 안전한 공개 프로필만 반환한다. **직접 REST 테이블 접근도 열 권한으로 제한**한다. `music_record_publications`의 허용 필드는 `id,track_id,nickname,body,kind,recorded_on,published_at,profile_id,visibility`이며 `owner_id,source_record_id,source_revision` 및 `SELECT *`는 거부된다. 공개 profile/댓글/좋아요/팔로우에도 Auth UUID가 없다. 원본 ID는 본인 전용 원본·공유 상태 API에서만 사용한다.

기존 `?story=<공유 ID>`는 같은 ID의 SNS 게시물을 열고, 기존 공개 목록/상세 API가 사용하는 테이블에도 새 RLS가 적용된다. `#music/post/...`, `#music/profile/...`, `#music/track/...`를 지원한다. 링크 복사는 범위를 바꾸지 않고 OAuth code·토큰을 복사하지 않는다.

## 공개 범위·관계·반응

| 범위/동작 | 권한/보존 |
| --- | --- |
| 개인 원본 저장 | 작성자만 조회. 공개본 생성 안 함 |
| 새 UI 공유 | 기본 private(나만 보기), 범위 미리보기·동의 후 독립 snapshot 저장 |
| private | 작성자만 글·댓글·반응·개수 조회/작성 |
| public | 익명도 읽기. 댓글·좋아요는 로그인/공개 프로필/열람 권한 필요 |
| followers | 작성자와 현재 팔로워만 읽기/반응. 자기 팔로우 불가, 즉시 성립 |
| private 전환 | 기존 링크·곡별·프로필·목록·직접 REST/RPC 모두 타인 접근 거부. 반응 행 보존 |
| 팔로우 취소 | 해당 작성자의 followers 글·댓글·좋아요/개수 권한 상실. public 글은 계속 열람 |
| 양방향 차단 | 두 계정의 상호 프로필·글·댓글·반응을 숨기고 상호 작성 거부. 양쪽 팔로우 제거. 해제해도 복원 안 함 |

기존 공개본의 visibility는 public으로 유지한다. 예전 클라이언트가 명시적으로 호출하던 `publish_music_record`도 public 게시 의도를 유지하되 새 RLS와 등록 곡 검사를 적용한다. 새 화면은 기본 private인 `social_publish_record`를 사용한다. 비공개 원본 저장을 public 게시로 취급하지 않는다.

차단은 로그인 계정 관계에 적용한다. 식별할 수 없는 익명은 public 글을 읽을 수 있다. 제삼자는 자신의 권한에 맞는 기존 댓글/반응을 계속 읽을 수 있으므로 차단한 방문자와 표시 개수가 다를 수 있다. 열람 권한을 잃은 게시물의 자기 댓글 삭제/좋아요 취소도 재접근 가능해질 때까지 거부한다.

좋아요는 `(post_id,profile_id)` PK와 원하는 상태를 보내는 RPC로 재시도해도 한 개다. 댓글은 초안 UUID를 재사용해 중복 요청을 방지한다. UI는 요청 중 중복 실행을 막고 서버 개수를 다시 읽는다. 실패한 댓글 초안은 유지하며 계정 전환·권한 상실 후에는 재표시하지 않는다. 전역 SNS 이벤트가 기존 개인 기록 편집 초안을 지우지 않도록 기존 편집기를 따로 유지한다.

## 삭제와 신고 보관

| 동작 | 결과 |
| --- | --- |
| 공유 취소 | 해당 공유본과 모든 작성자의 댓글·좋아요 삭제. 비공개 원본 보존 |
| 원본 삭제 | **기존 운영 정책대로 공유본도 CASCADE 삭제**, 종속 댓글·좋아요 삭제 |
| 원본 수정 | 공유본 snapshot 유지 |
| 공유본 수정/범위 변경 | 원본 유지. 범위 변경만으로 댓글·좋아요 삭제 안 함 |
| 자기 댓글 삭제 | 그 댓글만 삭제, 서버 댓글 수 갱신 |
| 계정 삭제 | 기존 `delete_current_user_account`로 auth.users 삭제. 보관/원본/공유본, 자기 글의 모든 댓글·좋아요, 다른 글에 남긴 자기 댓글·좋아요, 프로필·팔로우·차단·Auth 매핑 삭제 |
| 로그아웃 | DB 기록 유지. 기존 기기 세션/계정 사본 정리, SNS 메모리 화면·초안·이전 요청 폐기 |

신고는 신고 시점의 **공유본** 본문/곡/범위와 사유를 운영자 전용으로 보관한다. 비공개 원본 본문은 가져오지 않는다. 공유본 삭제 시 신고의 post_id는 NULL, 계정 삭제 시 신고자·신고 대상 공개 프로필 FK도 NULL이 된다. Auth UUID·원본 ID는 처음부터 신고에 저장하지 않는다.

신고 생성 시 expires_at을 30일 뒤로 기록한다. `atlas_private.purge_expired_social_reports()`는 service_role/신뢰된 운영 연결만 실행할 수 있다. **일일 만료 정리 스케줄은 이 PR에서 설치/실행하지 않았다.** 운영 개시 전에 담당자와 일일 실행·실패 알림을 설정해야 하며, 현재 코드만으로 물리적 30일 자동 삭제를 보장한다고 표현하지 않는다.

```sql
-- 신뢰된 운영 연결 전용. 이번 작업에서 운영 실행하지 않음.
select id,created_at,expires_at,reason,snapshot from atlas_private.social_reports
where expires_at>now() and resolved_at is null order by created_at;
select atlas_private.purge_expired_social_reports();
```

## 실시간·캐시·타이포그래피

기존 client의 하나의 `atlas-social` Broadcast 구독을 피드와 기존 공개 화면이 공유한다. DB 변경 트리거는 빈 `{}` invalidate만 보내며 행·Auth ID·원본 ID·본문을 보내지 않는다. 연결 오류/오프라인/탭 숨김에는 피드를 지우고, 재연결·온라인·복귀 후 RLS로 다시 읽는다. 요청 세대와 계정 key로 오래된 응답의 재등장을 막는다. 60초 재검증도 한다. 운영 Realtime 전달 지연은 별도 확인이 필요하다.

Supabase fetch는 `cache:no-store`, SNS 내용/초안은 메모리만 사용한다. Google 세션 저장은 기존 SDK 흐름을 유지한다. 서비스워커는 같은 origin 정적 자산·글꼴만 캐시하며 `/api/`, 외부 Supabase, SNS 내용은 캐시하지 않는다. 추천은 기존 보관곡/감정 점수만 사용하고 비공개 기록 본문은 읽지 않는다.

서비스 기본 글꼴은 자체 호스팅 Pretendard Variable v1.3.9, 자간은 -0.03em이다. [공식 소스](https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/web/variable/woff2)의 글꼴과 SIL OFL 라이선스를 `public/fonts/`에 포함한다. 외부 Google Fonts 요청은 제거했다. font-size/글자 변수는 12px 이상 짝수 고정값으로 정리했다. 버튼의 기존 44px 이상 터치 영역은 유지한다.

`src/data/typography.js`가 Range의 실제 줄 사각형을 측정해 한 줄은 normal, 여러 줄은 1.5를 적용한다. 인라인 강조·강제 줄바꿈, 입력/텍스트 변경, 폭 변경, 글꼴 로딩도 반영한다. textarea는 잠시 만든 비표시 측정 요소의 내용을 즉시 비운다. 오프라인 화면도 자체 글꼴과 CSP를 지키는 외부 스크립트를 사용한다. 실제 모바일 레이아웃 확인은 아래 한계를 따른다.

## 적용 순서·실패 복구 (운영 미실행)

1. 스키마/적용 이력과 백업을 확인한다. 전제는 기존 202611020001~004 및 auth.users/auth.uid/기본 역할이다. 원본/공유본/닉네임 행 수와 ID를 보존 기준으로 기록하고, 공유 owner에 닉네임이 없는 비정상 행이 없는지 확인한다. 실제 사용자 본문을 테스트로 공개하지 않는다.
2. 공유 쓰기를 제한한 적용 구간에서 `202611060001_music_social.sql` → `202611060002_social_track_catalog.sql` 순서로 적용한다. 001은 기존 공유 테이블의 메타데이터·RLS를 확장하고 새 public 6개/private 2개 테이블을 만든다. 002는 사용자 데이터 없는 등록곡 291개만 넣는다. 001과 002 사이에는 등록 곡 검사가 공유 쓰기를 막을 수 있으므로 두 단계 완료 전 새 SNS 쓰기를 열지 않는다.
3. `realtime.send(jsonb,text,text,boolean)`와 Broadcast from Database, 빈 이벤트 수신, 공개 URL/key와 기존 Google redirect를 스테이징에서 확인한다. SNS 테이블을 Postgres Changes로 공개 복제하지 않는다. PostgREST 스키마 reload는 migration에 포함한다.
4. 스테이징 A/B/C/익명으로 기존 링크·직접 REST·범위/차단/팔로우 취소·삭제·실제 세션과 모바일/오프라인을 확인하고 신고 정리 운영을 설정한다. 이후 별도 운영 적용/배포 판단을 한다. 이 PR 게시 단계에서는 실행하지 않는다.

- **001 COMMIT 전 오류:** 남은 aborted transaction은 ROLLBACK하고 변경이 전부 롤백되었는지 확인한다. 이미 성공한 CREATE migration을 그대로 재실행하지 않는다.
- **001 성공·002 실패:** 공유 쓰기를 제한한 채 카탈로그 원인을 수정하고 원자적 INSERT인 002만 재시도한다. 기존 원본을 복사하거나 전체 과거 migration을 일괄 재실행하지 않는다.
- **프런트 오류:** 이전 검증된 프런트로 복귀하되 강화된 RLS와 기존 데이터는 유지한다. 관련 없는 worktree 변경을 reset하지 않는다.
- **권한 사고:** 프런트 롤백만으로 직접 API를 막을 수 없다. 운영 연결에서 새 SNS/공유 테이블 및 RPC의 anon/authenticated 접근을 제한하고 빈 무효화 신호를 발행한다. RLS를 끄거나 private/followers를 public으로 바꾸지 않는다. 수정 후 격리 권한 검증을 통과하고 정확한 GRANT/RLS를 복구한다.
- **사용자 행 생성 후:** DROP/CASCADE 자동 down은 제공하지 않는다. 기존 원본·공유 ID·관계·반응 백업을 보존하고 데이터 보존형 후속 migration으로 수정한다. 복구 절차의 실제 장애 실행은 미검증이다.

## 검증 경계

검토 대상은 [통합 Draft PR #21](https://github.com/MattewShin/sound-atlas/pull/21)이다. 고정 코드 전체 SHA는 `d2a7e88feb02bcd10fa075b070357d6ff92ba9a5`이며 이후 커밋은 문서 보완이다. 이전 #20은 보존했다.

전체 `npm test`, 전용 `npm run test:social`, `npm run build`를 이 통합 worktree의 실제 코드에서 실행한다. 이전 377개 결과를 이번 결과로 사용하지 않는다. SQL은 PGlite에서 실제 기존+신규 migration과 역할/열 권한/RLS를 실행한다. REST 검증은 실제 SDK 요청을 로컬 SQL 역할 검사에 연결한 전송 계약 검사다. **실제 PostgREST 서버/JWT 검증은 아니다.**

최종 결과: Node 22.18.0/npm 10.9.3, 전체 147/147·SNS 전용 5/5·skip 0, build 성공(106 modules, JS 875.36 kB/gzip 224.81 kB, 기존 단일 chunk 경고). 코드 고정 뒤에는 문서만 보완했다. 기존 회귀의 가짜 track-a/track-b는 등록 곡 검증에 맞춰 실제 카탈로그 ID fixture로 바꾸었으며 원본/ID 정책을 완화해 테스트를 통과시키지 않았다.

실제 Google OAuth·Supabase PostgREST·Realtime·원격 DB·운영 복구는 미실행이다. 브라우저 접근 호스트 부재와 Windows 현재 URL 정책 확인 실패로 컴퓨터 사용이 중단되어 실제 모바일 화면/터치/실기기 PWA는 확인하지 못했다. CSS 규칙·글꼴 바이너리·줄 수 판별·DOM 상호작용 검증을 시각 검증으로 표현하지 않는다. 병합 전 스테이징/실기기 확인이 필요하다. 최종 수치·코드 SHA·PR은 HANDOFF를 따른다.
