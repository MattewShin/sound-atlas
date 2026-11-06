# 작업 인계 및 의견 교환

- 작업 ID: CA-SOCIAL-20261106-001
- 명세 버전: 1
- 상태: IMPLEMENTED (구현자 보고, ACCEPTED 아님)
- 작성자: Codex
- 작성일: 2026-11-06 (Asia/Seoul)
- 게시 브랜치: [codex/ca-social-20261106-001](https://github.com/MattewShin/sound-atlas/tree/codex/ca-social-20261106-001)
- 고정 기능 코드 전체 SHA: `7505b7f2a7ecee51acf9fcc850f163060e3f5e4b`
- 구현 시작 main SHA: `1607ca201c3a559bc7f28aabe998ef062db02ef9`
- 게시 시 비교한 원격 main SHA: `f50251e95fe9c2e00290c6eee6329017e9d2e9f4`
- 커밋 전 변경: 무관한 공연 자동화 수정/미추적 파일은 로컬에 보존. SNS 기능과 문서만 분리 커밋
- 결과: [구현·운영 안내](docs/MUSIC_SOCIAL.md), [현재 명세](CURRENT_TASK.md)
- GitHub 검토 경로: [Draft PR #20](https://github.com/MattewShin/sound-atlas/pull/20), base `main`, head `codex/ca-social-20261106-001`. 기능 SHA와 그 뒤 문서 커밋을 구분하며 최종 PR HEAD는 GitHub 이력과 게시 완료 응답에서 확인한다. main 병합·운영 DB 적용·운영 배포는 하지 않았다.
- 게시 확인: GitHub에서 OPEN/DRAFT, mergeable=false, SNS 변경 19개 파일을 확인했다. 원격 main은 위 비교 SHA 그대로다. 문서 3개를 제외한 시작 시 파일 52개의 SHA-256이 보존되었고 무관한 변경은 unstaged/untracked로 남아 있다.
- 이전 로컬 공동 작업: [보관 명세](https://github.com/MattewShin/sound-atlas/blob/f50251e95fe9c2e00290c6eee6329017e9d2e9f4/docs/collaboration/archive/CA-COLLAB-20261022-001/CURRENT_TASK.md), [보관 인계](https://github.com/MattewShin/sound-atlas/blob/f50251e95fe9c2e00290c6eee6329017e9d2e9f4/docs/collaboration/archive/CA-COLLAB-20261022-001/HANDOFF.md)

## Draft의 병합 전 미해결 사항

구현 시작 커밋에는 실제 인증/기록/공유 모델이 없었으나 게시 확인 시 원격 main에는 이미 Google 인증과 `user_music_journal`, `user_music_nicknames`, `music_record_publications`가 있었다. [원격 main 인계](https://github.com/MattewShin/sound-atlas/blob/f50251e95fe9c2e00290c6eee6329017e9d2e9f4/HANDOFF.md)를 고정 SHA에서 확인했다. 현재 Draft는 이전 구현 기준의 결과를 그대로 검토하도록 게시하며 최신 main과 통합한 결과가 아니다.

따라서 최신 인증 세션/기존 닉네임/원본·공유본 데이터 호환, 기존 공개 공유본에도 새 범위·차단 정책 적용, App/설정/테스트/공동 문서의 병합 충돌 해결과 결합 검증이 필요하다. 기존 main은 Auth UUID·원본 식별자 비노출 정책이 있고 이 Draft는 새 프로필/게시물 관계에서 UUID를 사용하므로 공개 식별자 정책도 통합 검토해야 한다. 이 상태를 병합·배포 가능으로 판단하지 않는다. 이번 게시에서는 기능 코드를 수정하거나 정책을 임의 변경하지 않았다.

## 구현 결과

구현 시작 체크아웃에는 실제 인증·음악 기록·공개 게시물 모델이 없었다. 기존 보관함을 이전하지 않고 Supabase Auth와 독립 기록 모델을 추가했다. 기록은 등록 곡 FK가 필수이며 자유 게시물을 만들 수 없다. 기본 개인 원본은 비공개다. 공개/팔로워 작성은 원본과 독립 공유본을 한 트랜잭션에서 만들며 공유 전 범위를 확인한다. 기존 개인 데이터를 자동 공개하는 UPDATE는 없다. 원본과 공유본 수정은 독립적이다. 최신 main과의 차이는 위 미해결 사항을 따른다.

세로 피드에 기본 아바타, 직접 입력한 공개 닉네임·고유 아이디, 작품번호·악장 제목, 상대 시각·정확한 KST 시각, 줄바꿈·더 보기, 0을 포함한 반응 개수를 구현했다. 곡별/프로필/직접 링크와 추가 조회를 연결했다. 원본 관리, 공유 내용 수정, 범위 변경, 범위를 바꾸지 않는 링크 복사, 공유 취소, 원본 삭제를 구분했다.

RLS가 게시물·좋아요·댓글·개수의 조회/쓰기 권한을 검증한다. 팔로우 취소와 양방향 차단 이후 새 요청은 거부되며 반응은 삭제하지 않고 숨긴다. 차단 시 두 방향 팔로우를 제거하고 해제해도 복원하지 않는다. 신고는 당시 공유본 스냅샷을 보존하고 운영용 DB 연결만 읽는다. 운영 조회 SQL은 안내 문서에 있다.

좋아요는 복합 PK와 명시적 상태 RPC, UI 중복 실행 잠금, 서버 수치 재조회로 처리한다. 댓글은 초안 UUID로 재시도를 중복 방지하고 실패 초안을 메모리에 보존한다. 삭제 후 서버 개수를 다시 읽는다. 게시물 권한을 잃은 초안은 제거한다.

Google 실명/이메일/아바타 자동 복사가 없다. 세션·기록은 메모리에 두고 일회용 OAuth verifier만 탭 저장소에 둔다. SDK 탭 간 인증 채널 키를 분리해 UI 사용자와 API 토큰이 어긋나지 않게 했다. 로그아웃·계정 전환 시 화면과 비동기 요청을 폐기한다.

실시간 이벤트에는 빈 무효화 신호만 넣고 목록을 지운 뒤 RLS로 다시 읽는다. 연결이 없거나 탭이 숨겨지면 목록을 숨긴다. StrictMode·빠른 계정 전환 때 동일 Realtime 채널이 재사용되지 않도록 이전 구독 제거를 기다린다. 콘텐츠를 브라우저 영구 저장소나 공연 검색 캐시에 넣지 않고 추천 계산에도 사용하지 않는다.

## 변경 파일

- UI: `src/App.jsx`, `src/main.jsx`, `src/styles.css`, `src/components/MusicSocial.jsx`, `src/components/musicSocial.css`
- 인증/데이터: `src/components/useSocialSession.js`, `src/data/socialClient.js`
- DB: `supabase/migrations/202611060001_music_social.sql`, `supabase/migrations/202611060002_social_track_catalog.sql`
- 검증: `server/musicSocialSql.test.mjs`, `scripts/testMusicSocial.mjs`, `scripts/test.mjs`
- 설정/의존성: `package.json`, `package-lock.json`, `.env.example`. 공식 `@supabase/supabase-js` 2.119.0 추가
- 게시 문서: `README.md`, `docs/MUSIC_SOCIAL.md`, `CURRENT_TASK.md`, `HANDOFF.md`
- 게시 제외: 기존 공동 문서 `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/AI_COLLABORATION.md` 및 로컬 보관본. 원격에는 후속 작업의 버전이 이미 있어 오래된 로컬 내용으로 대체하지 않는다.

기존 공연 수집·OCR·자동화 수정/미추적 코드는 이번 기능으로 수정하지 않았다. 혼합 파일 `package.json`은 SDK와 test:social만, `scripts/test.mjs`는 SNS 테스트 import만 index에 투영해 커밋했다. 작업 파일의 다른 변경은 남아 있다. 사용자 지시에 따라 `git switch -c`로 새 브랜치를 만들었으며 main ref는 시작 SHA 그대로다. pull/reset/stash는 하지 않았다.

## Migration·권한·삭제·복구 요약

실제 운영 적용은 미실행이다. 최신 main 통합 검증을 먼저 완료한 후 별도 승인된 적용 단계에서 `202611060001_music_social.sql` → `202611060002_social_track_catalog.sql` 순서로 진행한다. 001은 신규 9개 테이블·RLS·RPC·트리거를 한 트랜잭션으로 만들고, 002는 개인 데이터 없는 등록 곡 291개 ID/제목/작곡가를 새 카탈로그에 넣는다. 기존 공연/평가/보관/기록/공개본 행을 갱신하거나 자동 공개하지 않는다. 이 분리는 기존 main 데이터 호환이 해결되었다는 의미가 아니다.

- 나만 보기는 작성자만, 모든 사람은 익명도, 내 팔로워는 작성자와 현재 팔로워만 글·댓글·좋아요/개수를 읽는다. 쓰기는 로그인·프로필·열람 권한이 필요하다.
- 나만 보기 전환·팔로우 취소 뒤 새 요청은 RLS로 거부한다. 댓글·좋아요 행은 보존한다. 양방향 차단은 상호 조회·상호작용을 거부하고 양쪽 팔로우를 삭제한다. 제삼자 조회/개수는 그 방문자의 차단 관계를 따른다. 로그아웃한 익명은 누구에게나 공개된 글을 읽을 수 있다.
- 원본 삭제는 공유본을 보존하고 참조만 NULL로 만든다. 공유 취소는 그 공유본과 모든 사람의 댓글·좋아요를 삭제하고 원본을 보존한다. 신고는 남으며 삭제된 게시물 참조만 NULL이다.
- `auth.users` 계정 삭제 시 자기 프로필·원본·공유본, 자기 글에 달린 모든 댓글/좋아요, 다른 글에 자기가 남긴 댓글/좋아요, 관련 팔로우/차단을 CASCADE 삭제한다. 계정 삭제 UI/RPC는 이 Draft에 추가하지 않았다. 이는 DDL 확인이며 전체 계정 삭제 경로 실검증은 남아 있다.
- 신고의 reporter FK는 계정 삭제 시 NULL이지만 reported_author_id UUID·본문 스냅샷·사유는 운영자 전용으로 남는다. 보관 기한/익명화 정책은 배포 전 검토가 필요하며 완전 삭제로 표현하지 않는다.

복구는 001 COMMIT 전 실패 시 트랜잭션 롤백 확인, 001 성공·002 실패 시 SNS 비활성 상태에서 002만 재시도, 프런트 실패 시 이전 산출물/기능 설정으로 복귀하면서 DB/RLS 보존 순서다. 권한 사고는 프런트 롤백만으로 막지 말고 운영 연결에서 새 SNS 테이블/RPC 접근을 제한하고 빈 무효화 이벤트를 발행한다. RLS를 끄거나 범위를 public으로 바꾸지 않는다. 데이터가 생긴 후 DROP/CASCADE 대신 백업을 보존하고 후속 migration으로 복구한다. 자동 down migration은 없다. 상세 절차는 [운영 적용·복구 안내](docs/MUSIC_SOCIAL.md)에 있으며 실행한 복구 실험이 아니다.

## 검증 결과와 한계

환경: Windows PowerShell, Node 22, React 19, Vite 6.4.3, PGlite, JSDOM. 운영 데이터/실제 계정 대신 격리 가짜 A/B/C UUID와 별도 본문만 사용했다.

| 검증 | 결과 | 한계 |
| --- | --- | --- |
| `npm test` | 이전 구현 단계 377/377 통과, 실패 0 | 당시 로컬 트리에는 별도 자동화 변경도 포함. 선별 커밋 전체의 테스트 결과로 간주하지 않음. 이후 구독 교체 회귀 1개와 추가 단언을 전용 검증으로 확인 |
| `npm run test:social` | 최종 5/5 통과 | 실제 migration/RLS SQL + 컴파일한 React DOM + 저장소/구독 교체 검사. 실제 Supabase HTTP/OAuth/Realtime 서버 검증 아님 |
| `node server/musicSocialSql.test.mjs` | 최종 SQL 보강 후 1/1 통과 | 차단 후 방문자별 댓글·좋아요 개수 차이와 원본 보존을 추가 확인 |
| `npm run build` | 성공, 103 modules, JS 약 868 kB / gzip 223 kB | 기존에도 있던 500 kB chunk 경고 지속. SDK 추가로 번들 증가 |
| `git diff --check` | CRLF 인식 설정으로 exit 0 | 새 파일 공백·문서 로컬 링크/작업 ID도 별도 검사 |
| `npm audit` | 기존 Vite <=6.4.3에 high 권고 1건 | 새 Supabase 의존성 권고는 없음. 기존 Vite 업그레이드는 별도 후속 작업 |

이번 게시에서는 기능/테스트/SQL 코드가 바뀌지 않아 사용자의 지시대로 앱 테스트·빌드를 반복하지 않았다. 추가 검증은 커밋 후보 19개 경로 allowlist, 실제 .env/사용자 export/캐시 제외, 비밀키/JWT/credential 패턴과 빈 `.env.example` 템플릿, 선별 diff·한국어 인코딩·문서 링크·원본 파일 해시 보존 확인이다. `.env.example`에는 변수 이름과 비밀값 없는 설정 예시만 들어간다.

처음 sandbox의 node --test/esbuild 실행은 spawn EPERM으로 중단되어, SQL은 자식 프로세스 없는 실행으로, JSX·기존 Windows fixture는 실행 허용 환경으로 확인했다. 빌드 로그 리다이렉트 한 번은 PowerShell이 stderr chunk 경고를 NativeCommandError로 처리했으나 리다이렉트 없는 재실행에서 exit 0을 확인했다. 인계 문서 작성 중 파이프 인코딩 문제는 한국어 UTF-8 문서로 다시 저장해 수정했다.

A/B/C/익명 RLS 검증: 세 범위의 글·좋아요·댓글·개수 조회, 익명 쓰기 거부, 자기 팔로우 금지, 고유 handle, 다른 사용자 원본을 이용한 게시/수정 거부, 미등록 곡 거부, 작성 시각 위조 거부, 팔로우 취소·차단·해제, 직접 조회·RPC 링크, 비공개 전환 시 반응 보존, 중복 좋아요/취소, 댓글 자기 삭제·개수, 원본/공유본 수정·삭제 독립성, 원자적 생성 재시도·실패 롤백, 운영 전용 신고·스냅샷, 공개 이벤트에 데이터가 없는 것을 확인했다.

DOM 검증: 프로필 직접 입력·중복 오류, 나만 보기 기본·곡 필수, 공유 전 확인, 원본 수정과 공유본 불변, 범위 변경·링크 복사·공유 취소, 기본 아바타·시각·더 보기, 연속 좋아요·실패 복구, 실패 댓글 초안·재시도·삭제 개수, 팔로우 취소·차단 후 화면, 직접 링크에서 탭 복귀, 권한 변경 전 응답 무효화, 연결 종료·재연결, 로그아웃·계정 전환 키 변경을 확인했다.

## 운영 적용·배포와 남은 확인

- 운영 DB migration 적용: 미실행. 신규 SQL 두 개는 로컬 격리 DB에만 적용했다.
- 실제 개인 기록 공개/수정: 없음.
- Google OAuth 공급자·리다이렉트, VITE 공개 URL/키 설정, 실제 PostgREST/RLS HTTP: 미검증.
- Supabase Realtime 실제 빈 이벤트 전달, 다중 브라우저·오프라인 복구·기기 화면, 다중 DB 세션 경쟁 부하: 미검증.
- 운영 배포·main 병합: 미실행. 이번에는 지정 브랜치 commit/push와 Draft PR 게시만 수행한다.
- 최신 main 결합 트리·기존 기록/닉네임/공개본 호환·계정 삭제 전체 동작·복구 시나리오 실행: 미검증이며 병합 전 필요.
- 기존 Vite high 보안 권고 업데이트: 미실행. lockfile에서 기존 Vite 버전을 바꾸지 않았다.

적용 순서와 환경변수는 [운영 적용 안내](docs/MUSIC_SOCIAL.md)에 있다. 스테이징 전용 계정과 테스트 곡으로 진행하며 실제 기록을 테스트 목적으로 공개하지 않는다.

## 구현자 의견

- Q-SOCIAL-001 (운영 의존성): DB 접근 차단은 RLS 커밋으로 처리한다. 이미 열린 화면 제거에는 Realtime 전송이 필요하다. 배포 전 `realtime.send` 함수·Broadcast from Database·빈 이벤트 수신을 두 브라우저로 확인해야 한다. 연결이 안 되면 UI는 피드를 표시하지 않는다. 실네트워크 지연은 로컬 테스트로 보장하지 않는다.
- Q-SOCIAL-002 (호환성): 구현 시작 체크아웃에 기존 원본/공유/닉네임 구조가 없어 독립 구조를 추가했다. 게시 시 원격 main의 후속 모델을 확인했으며 병합 전 대조·통합이 필요하다. 시작 체크아웃의 보관함/평가/추천/공연 경로는 보존했다.
- Q-SOCIAL-003 (운영 선택): 신고 조회는 신뢰된 SQL/운영 서버에 한정했다. 새 관리자 계정 정책이나 공개 관리자 페이지는 추가하지 않았다. 서비스 키를 브라우저에 넣지 않는다.
- Q-SOCIAL-004 (향후 최적화): SDK 추가 후 약 868 kB 단일 JS 번들이다. 필요 시 로딩 경계를 분리할 수 있다.
- Q-SOCIAL-005 (병합 전 차단 사항): 게시 시 확인한 최신 main의 기존 인증·개인 기록·공개 공유본과 통합하지 않았다. 기능 코드 재작성 없이 기존 기준의 결과를 Draft로 게시하며, 통합·식별자/삭제 정책·기존 범위 호환과 결합 검증이 끝나기 전 운영 적용하지 않는다.

## 다음 검토 요청

검토자는 이 작업 ID/명세 1과 로컬 변경 또는 이를 선별 게시한 브랜치의 전체 코드를 함께 읽고 ACCEPTED/CHANGES_REQUESTED를 기록한다. 운영 적용 검증 전에는 배포 완료로 취급하지 않는다. 기존 공연 자동화 미커밋 파일을 이번 기능 검토와 섞지 않는다.
