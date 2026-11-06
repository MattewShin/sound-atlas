# 음악 기록 SNS 운영 반영 결과

- 작업: CA-SOCIAL-20261106-001 / 명세 2
- 일시: 2026-11-06, Asia/Seoul
- 근거: 사용자가 운영 migration·PR #21 병합·운영 배포·테스트 계정 검증을 명시적으로 승인했다. 별도 스테이징/Docker 설치 및 변경 없는 전체 테스트 반복은 하지 않았다.
- 운영 앱: [Classic Atlas](https://sound-atlas.vercel.app)
- 병합: [PR #21](https://github.com/MattewShin/sound-atlas/pull/21), merge SHA `6bd183ca21efc53ea3c842c942cece96af0af03e`
- 최종 기능 코드 SHA: `78a1dbb65a515ae583687e2e19d1389c2a59fd0f` (실제 화면에서 발견한 CSS 2건 보완 포함)
- 검증한 보완 배포: `dpl_ARvQwrhzi1VT7iy6S3ZVaiS4AGgV`, [고정 배포 URL](https://sound-atlas-o8gwdct25-yhshin.vercel.app), target=production / Ready, 운영 alias 확인
- 이후 문서/합성 화면 증거 커밋은 기능 코드 변경과 구분한다. 해당 커밋 SHA는 GitHub 이력에서 확인한다.

## 백업·복구 확인

운영 앱 번들의 Supabase 대상과 기존 관리자 DB 연결의 project ref가 같은지 먼저 대조했다. TLS는 Supabase CA와 호스트명 검증을 유지했다. 최초 기본 CA 연결은 SELF_SIGNED_CERT_IN_CHAIN으로 실패했고 공급자 CA를 지정한 후 정상 연결했다. 운영 DB는 PostgreSQL 17.11이며 읽기 점검 당시 크기는 17MB였다.

2026-11-06 **15:47:18 KST**, PostgreSQL 18.6의 pg_dump로 전체 DB 논리 archive를 만들었다. 도구는 PostgreSQL 공식 페이지에서 연결하는 EDB 배포의 포터블 클라이언트만 사용했으며 DB 서버/Docker를 설치하지 않았다.

| 항목 | 결과 |
| --- | --- |
| 파일 | `.cache/social-production-ops/backup-before-social/database-before-social.dump` |
| 파일 크기 | 1,447,001 bytes |
| SHA-256 | `03d77729b31c25fb1e8753e9c7ff31876878d2dbe0bad70e06e4049f455dcf0e` |
| pg_restore --list | 성공, 854개 항목 |
| pg_restore 전체 SQL 추출 검사 | 성공, 출력은 NUL로 보내 실제 내용을 공개/별도 저장하지 않음 |
| 접근/게시 | 백업 폴더 ACL은 현재 Windows 사용자와 SYSTEM만 허용. Git 제외, 업로드/커밋 안 함 |
| 실제 DB 복원 실행 | 하지 않음. 운영 데이터를 덮어쓰는 복원 시험으로 표현하지 않음 |

archive와 복구 도구의 읽기/해제 가능성을 확인했다. 기존 Supabase 역할·확장 환경에서 필요한 객체/행을 선택해 복구하는 경로를 확보했지만 **복원 SQL을 DB에 적용하는 실복원 시험은 미실행**이다. 플랫폼의 자동 백업/PITR 권한·복구 시점은 별도로 확인하지 못했으며 이 수동 백업과 구분한다. pg_dump는 역할 자체, Storage 바이너리 파일, OAuth/플랫폼 설정의 백업이 아니다. 이번 migration은 그 설정/파일을 변경하지 않는다.

## 운영 migration

**15:49:17 KST**, `202611060001_music_social.sql` → `202611060002_social_track_catalog.sql`을 적용/COMMIT했다. 원본 파일은 변경하지 않았다. 001의 외곽 BEGIN/COMMIT만 실행 조합에서 제거하고 두 파일을 하나의 transaction에 넣어 순서를 유지했다. 이로써 001 이후 카탈로그가 비어 있는 중간 상태를 외부 쓰기에 노출하지 않았다. lock_timeout=5s, statement_timeout=120s였으며 실패 시 전체 rollback하도록 실행했다.

적용 전후 기존 평가/원본/닉네임/공유 테이블의 개수와 전체 내용 지문을 비교했다. 공유 테이블은 새 메타데이터 두 열을 제외한 기존 열을 비교했다. 불일치 시 COMMIT하지 않도록 했고 모두 일치했다.

| 데이터 | 적용 전 | 적용 후 / 테스트 정리 후 |
| --- | --- | --- |
| 기존 평가·보관 반응 | 7 | 7, 내용 지문 일치 |
| 개인 원본 | 0 | 0 |
| 닉네임 | 1 | 1, 내용 지문 일치 |
| 공유본 | 0 | 0 |
| 등록 곡 | 없음 | 291 |

기존 닉네임을 자동 공개하지 않았으며 정리 후 공개 프로필도 0개다. 실제 사용자 원본을 공개하거나 삭제하지 않았다. 운영에 기존 원본/공유본이 없었으므로 **실제 기존 행의 backfill 사례**는 발생하지 않았다. 합성 데이터의 기존 링크/API·삭제 정책에 대한 실제 검증과 앞선 격리 migration/snapshot 호환 검증을 구분한다.

운영에는 `supabase_migrations.schema_migrations`가 없어 CLI 이력 테이블에는 등록하지 않았다. 적용 시각·원본 파일 SHA-256·전후 지문은 Git 제외 `migration-result.json`에 기록했다. 후속 작업에서 두 CREATE migration을 무조건 재실행하지 않는다. 향후 CLI 도입 시 기존 수동 적용 이력 전체와 대조해 정합성을 맞춘다.

## 병합·운영 배포

PR #21의 head `fb3dc5b0bd675c449f76a2bf71b8025069158f1c`와 Vercel success·main 충돌 없음을 확인한 뒤 Draft를 해제하고 기대 head SHA를 지정해 병합했다. 원래 IDE worktree와 PR #20 브랜치/HEAD 및 무관한 공연·OCR 변경은 보존했다.

첫 운영 배포는 `dpl_7iTus2ayTWWbcoYPmu8KbymHkbqf` / `https://sound-atlas-j8i6x2cow-yhshin.vercel.app`였고 production Ready 및 운영 alias를 확인했다. 이전 배포 `dpl_6k4CQXEzvurVPwtaLJKtdrozsQwF` / `https://sound-atlas-qdx82lrz2-yhshin.vercel.app`도 롤백 기준으로 확보했다.

운영 화면 검증에서 아래 두 CSS 문제를 찾아 `78a1dbb...`로 main에 반영했고 보완 운영 배포 Ready와 alias를 다시 확인했다. 그 외 기능 로직·DB 변경은 하지 않았다.

1. 12px 부모 안의 `<small>`이 브라우저 기본 상대 크기로 **10px**가 됨 → 공통 `small` 기본값을 12px로 지정.
2. `···` 메뉴 summary 폭이 약 **40.125px** → 최소 44px 지정. 기존 44px 높이 유지.

수정은 `src/styles.css`, `src/components/musicSocial.css`의 **3줄 추가·1줄 변경**이다. 관련 기존 typography 테스트 8/8과 실제 브라우저의 computed style/터치 경계를 확인했다. 처음 샌드박스의 node test runner는 spawn EPERM으로 실행되지 못했으며 권한 밖에서 같은 대상 8개를 실행해 통과했다. 변경 없는 전체 147개 테스트는 반복하지 않았다.

## 실제 서비스 검증

Windows / Node 22.18.0 / npm 10.9.3 / 실제 Supabase Auth·PostgREST·Realtime, SDK 2.119.0, headless Chromium 141(Playwright 1.56.1)에서 실행했다. 일반 브라우저 접근 호스트가 없어 개인 Chrome 프로필을 사용하지 않는 전용 브라우저를 캐시 폴더에 준비했다. 브라우저 보안 경고를 우회하거나 개인 로그인 정보를 사용하지 않았다.

실행마다 식별 가능한 **새 합성 계정 A/B/C**를 관리자 Auth API로 만들고 실제 이메일/비밀번호 Auth 로그인이 발급한 JWT를 사용했다. 사용자 요청에는 admin key를 사용하지 않았다. 브라우저는 이 테스트 세션으로 앱의 기존 auth hook·로그아웃·계정 교체를 확인했다. **Google 계정 선택/동의/인증 코드 교환 완료 시험은 아니다.**

최종 항목별 최신 결과: **실제 Auth/API/WS 16/16 PASS**, **브라우저 13/13 PASS**, **수정 관련 기존 테스트 8/8 PASS**. 앞선 147/147 결과를 새 운영 검증으로 대체 보고하지 않았다.

| 검증 범위 | 확인한 결과 |
| --- | --- |
| 로그인·세션 | A/B/C 실제 Auth 로그인·서로 다른 세션, 실제 로그아웃, 앱의 즉시 비공개 화면/세션 정리, B 세션으로 교체 후 A의 private 미노출 |
| 공개 범위 | A/B(현재 팔로워)/C/익명에서 private/public/followers의 글·댓글·반응/개수 제한 |
| 직접 REST | wildcard·owner_id/source_record_id/source_revision 거부. 안전한 기존 테이블 목록/직접 공유 ID 조회에도 RLS 적용 |
| 식별자 | 피드 응답을 테스트 Auth UUID/비공개 원본 ID와 대조해 비노출. 공개 프로필 ID는 별도 값 |
| 팔로우·차단 | 자기 팔로우 거부, 취소 즉시 followers 읽기/반응/댓글 거부, 재팔로우 시 보존된 반응 확인. 양방향 차단·팔로우 제거·해제 후 미복원. 실제 UI의 팔로우/차단/해제도 확인 |
| 좋아요·댓글 | desired 상태 중복/동시 요청 유일성, 댓글 같은 UUID 재시도·자기 삭제·정확한 개수. 실제 UI 오류 주입 시 댓글 초안 유지·재전송 및 다른 창 개수 갱신 |
| 범위·기존 링크 | 실제 UI의 공유 전 확인/private 저장 후 다른 열린 창에서 제거. `?story=` 기존 링크 형식은 같은 공유본을 표시하고 범위 변경 시 접근 제한 |
| Realtime | 실제 WS B/익명 구독·scope/block/unshare invalidate 수신. 별도 브라우저 A/B의 좋아요/댓글/범위/공유 취소 화면 갱신 |
| 끊김·복귀 | 실제 WS 제거/재연결 후 새 RLS 조회, 브라우저 offline 동안 범위 변경→online 후 옛 글 미재노출 |
| 삭제 | 공유 취소 시 원본 유지, 원본 삭제 시 타인 댓글/좋아요 CASCADE, 실제 앱의 테스트 A 계정 삭제와 세션 정리·종속 데이터 삭제·남은 토큰 쓰기 거부 |
| 신고 | 운영자 전용 저장, 계정/공유 삭제 후 식별 FK NULL·snapshot 보존. 생성한 합성 신고만 최종 정리 |
| 캐시·오류 | 확인한 브라우저 localStorage/sessionStorage에 SNS 본문/초안 미저장, 예상하지 않은 JS pageerror 없음. Auth 세션 저장은 별도 |
| 모바일 | 320/375/390 CSS px, 24자 입력형/34자 기존형 handle·긴 등록 곡명·3,990자 한글 본문·긴 댓글. 가로 넘침 0, Pretendard 실제 로딩, -0.03em·짝수 12px 이상·한 줄 normal/다중 줄 1.5, 버튼/summary 44px 이상. 더 보기·메뉴·nav·textarea 포커스/입력 확인 |

### 초기 실패와 재검증

실제 Realtime는 빈 업무 payload에 플랫폼의 메시지 추적 UUID `payload.id`와 같은 `meta.id`를 붙였다. 첫 runner는 수신 객체 전체가 `{}`일 것으로 가정해 두 항목에서 중단됐고, 시험의 범위/차단 복구가 중단되면서 후속 두 항목도 실패했다. 합성 상태를 복구하고 추적 ID와 업무 데이터 비노출을 구분해 실패 4개만 다시 확인했으며 모두 통과했다. 수신 ID를 Auth/프로필/게시물/원본 ID와 비교해 일치하지 않음을 확인했다. 앱은 payload를 읽지 않고 invalidate로만 사용하므로 앱 코드 수정은 필요 없었다.

브라우저 첫 실행의 3개 실패는 10px 날짜 실제 CSS 문제, PowerShell 표준입력에서 합성 한글이 `?`로 변한 fixture 문제, reload마다 A 세션을 재주입한 시험 설정 문제였다. fixture를 UTF-8 파일로 전달하고 브라우저 초기 storageState로 바꿨다. 실제 터치 경계 재검사에서 메뉴 40.125px도 발견해 위 두 CSS만 수정했다. 최종 운영 배포에서 임시 스타일 없이 해당 3개 항목을 통과했다. 과거 실패 이력은 로컬 결과 파일에 보존하고 최종 최신 판정과 구분했다.

## 테스트 정리·실제 데이터 보존

테스트 A는 실제 앱의 계정 삭제 버튼으로 삭제했고 B/C는 생성 때 저장한 ID·고유 테스트 이메일을 대조한 뒤 관리자 API로 삭제했다. 신고도 저장한 테스트 신고 ID와 합성 body 접두사를 함께 제한해 지웠다. 실제 사용자 행/신고를 정리 대상으로 삼지 않았다.

2026-11-06 **16:12:20 KST** 최종 확인: 테스트 Auth 계정 0, 테스트 신고 0, 공유본/공개 프로필/원본 0. 기존 평가 7·닉네임 1과 전체 내용 지문은 migration 직전과 동일했다. 비밀값/테스트 세션/백업/원본 자료는 Git에 넣지 않았다. 아래 이미지는 삭제한 합성 테스트 게시물의 화면만 포함한다.

| 320px | 375px | 390px |
| --- | --- | --- |
| [화면](qa/CA-SOCIAL-20261106-001/mobile-320.png) | [화면](qa/CA-SOCIAL-20261106-001/mobile-375.png) | [화면](qa/CA-SOCIAL-20261106-001/mobile-390.png) |

## 복구 경로와 남은 검증

- 프런트 문제는 이전 Ready 배포로 운영 alias를 되돌리는 경로가 있다. 강화된 RLS/데이터를 없애는 DB down은 실행하지 않는다. 실제 배포 롤백은 필요하지 않아 실행하지 않았다.
- migration은 COMMIT 전 오류면 전체 rollback하도록 실행했다. COMMIT 후 문제는 백업·지문을 보존하고 영향 객체만 후속 migration으로 수정한다. 전체 archive를 운영에 덮어쓰면 이후 사용자 변경까지 되돌릴 수 있으므로 자동 복원하지 않는다. 실제 복원 실행은 미검증이다.
- **Google:** provider 활성화와 PKCE authorize의 HTTP 302→accounts.google.com은 확인했다. 실제 Google 계정 인증/동의/코드 교환은 미검증이다.
- **모바일:** Chromium의 모바일 viewport/터치 모사다. 실기기 iOS/Android·한글 IME/가상 키보드·설치 PWA는 미검증이다. headless textarea 입력을 실기기 키보드 검증으로 표현하지 않는다.
- **신고:** 기존 일일 만료 정리·외부 실패 알림은 설정안만 있으며 운영 스케줄/수신처를 설치하지 않았다. 30일 expires_at과 정리 함수가 일일 물리 삭제/실제 알림까지 보장하는 것은 아니다.
- **범위:** 기존 사용자 데이터에 실제 기록/공유 행이 없었으므로 운영 legacy 행의 backfill 실사례는 없다. Storage 바이너리/플랫폼 자동 백업·실복원, 실제 기기 영구 저장소 전체 검사는 이번 결과와 구분한다.

원래 IDE worktree의 브랜치/HEAD와 미커밋 공연/OCR 변경은 유지했다. 구현자 결과는 IMPLEMENTED이며 검토자의 ACCEPTED 판단을 대신하지 않는다.
