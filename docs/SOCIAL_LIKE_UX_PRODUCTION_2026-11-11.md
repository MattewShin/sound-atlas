# 음악 이야기 좋아요 UX 운영 결과

- 작업: **CA-SOCIAL-LIKE-UX-20261111-001 / DEPLOYED**
- 작성: 2026-11-11 17:03:50 KST
- [PR #29](https://github.com/MattewShin/sound-atlas/pull/29): Draft 자체 검토·Preview Ready 후 Ready 전환·병합 완료
- 병합: 2026-11-11 16:56:38 KST
- 기능 SHA: `283decdf99d54ca1969d4983e97a2c9cd189751d`
- 검토·병합 직전 expected PR HEAD: `7069cf1318b00b51d324a4d11faca966fca1dc9e`
- 운영 merge/main·배포 SHA: `ed77628aef351a5655c382f97a40f8a75026e78a`
- 결과 문서 브랜치: `codex/ca-social-like-ux-20261111-001-production` — 최종 문서 SHA는 Git 이력/완료 보고에서 확인한다. 자기 SHA 기록용 재귀 커밋은 만들지 않는다. 결과 문서 PR은 별도 승인 전 생성/병합하지 않는다.

## 원인·구현·자체 검토

기존 run('like')의 refresh와 likes generic invalidate가 모두 setData(null)/setComments({})로 피드를 unmount했다. 게시물별 optimistic liked/count/하트/aria, 동기 Map/token 중복 방지와 개별 pending, 실패 rollback을 적용했다. aria-disabled/aria-busy와 guard로 해당 버튼의 동작만 막아 포커스를 유지한다. 오류는 고정형 role=alert로 표시해 피드 높이·스크롤을 바꾸지 않는다. generation/sequence/revision으로 오래된 feed·mutation 응답을 무효화하고 종료 후 서버로 수렴한다.

kind=like 알림은 현재 페이지들의 좋아요 필드만 background로 동기화하며 key/DOM/초안/댓글/펼침/페이지 깊이를 유지한다. 빈/unknown·범위/차단/팔로우/삭제·로그아웃/계정 전환·offline/pagehide/재연결은 기존 clear-first/세션 격리를 유지한다. 42501/인증 거부는 권한 재검증, 일시적 background 네트워크 오류는 피드를 유지한다. RLS·공유·삭제 정책을 완화하지 않았다.

기준 main de4f78d2b00edae6166348194e1a648c8d0e184a와 최종 PR HEAD 고정·충돌 없음·미해결 review thread 없음·Preview 성공/Ready·변경 범위·민감정보 검사를 확인했다. 기존 migration 변경0, 새 forward 한 파일/rollback 한 파일만 추가했다. PWA 결과 브랜치와 원래 IDE dirty 파일52개·HEAD를 보존했다. merge tree와 검증된 PR tree가 동일하고 운영 반영 후 추가 기능 변경0이다.

## 운영 DB 적용과 복구 근거

[202611110001_social_like_invalidation.sql](../supabase/migrations/202611110001_social_like_invalidation.sql) 적용·후속 확인 완료: **2026-11-11 16:56:07 KST**. SHA256: `5305f26c70d2f62cdba72f464b2a5e366b7921cf199825858ad23408abff805b`. 기존 social_set_like/social_feed/social_invalidate 본문·generic trigger·RLS를 직전 읽기로 재확인했고 drift가 없었다. Supabase migration history 테이블은 존재하지 않아 CLI 이력 등록을 주장하지 않는다. catalog와 실행 SHA/시각을 근거로 수동 적용을 기록한다.

변경 전 trigger/function 정의, rollback SQL과 각각의 SHA256을 Git 제외 로컬에 확보했다. 이번 DDL은 행을 변경하지 않아 이 정의 백업과 명시적 rollback이 최소 복구 근거다. 전체 DB restore는 하지 않았고 백업 실제 경로/접속 정보/출력을 Git·PR·공개 Storage에 올리지 않았다. 근거 checksum은 [검증 JSON](SOCIAL_LIKE_UX_PRODUCTION_VERIFICATION_2026-11-11.json)의 migration.recovery를 따른다.

단일 BEGIN/COMMIT 아래 likes SHARE ROW EXCLUSIVE 잠금, lock timeout5초/statement timeout30초로 실행했다. likes 일반 social_invalidate trigger를 전용 social_like_invalidate trigger/private function으로 교체했다. 다른5개 일반 trigger·기존 RPC 정의/RLS·모든 기존 행 지문은 동일하다. likes 전후 **0 → 0**건, 지문 동일. PUBLIC/anon/authenticated의 전용 private function 실행 권한 모두 false다. 잠금은 likes 쓰기에 짧은 대기를 줄 수 있으나 일반 SELECT를 막는 구조가 아니며 이번 적용에서 timeout/오류/부분 적용은 없었다. 격리 SQL에서 예상외 trigger 시 transaction rollback도 검증했다.

DB 함수가 realtime.send에 전달하는 앱 payload는 **{"kind":"like"}**만이며 atlas-social topic/invalidate event를 유지한다. 실제 관리형 Realtime SDK 응답에는 서비스가 생성한 transport event id가 추가되는 것을 확인했다. 이는 게시물/프로필/Auth 사용자 식별자가 아니며 그 값은 로그/문서에 남기지 않았다. 앱 payload에 post_id/profile_id/user_id·이메일·본문·공개 범위는 포함하지 않는다. [안전한 관측 JSON](SOCIAL_LIKE_UX_PRODUCTION_VERIFICATION_2026-11-11.json)에 키 이름만 기록했다.

## 검증 결과와 범위

| 구분 | 결과 | 실제 확인 범위 |
| --- | --- | --- |
| 전체 회귀 | 174/174 PASS | 최종 기능 트리, 원본/공유/보관함/Auth/API/권한 포함 |
| SNS | 5/5 PASS | 기존 검사 유지 |
| 전용 | 3/3 PASS | SQL 정적·PGlite 통합·DOM UX |
| SQL 통합 | 전용 중2개 PASS | ACL/payload/다른 이벤트·행 보존/rollback/실패 원자성 |
| build | PASS | 기존 chunk 크기 경고만 유지 |
| 합성 모바일 | 320/375/390 각 PASS | 60개 feed, 중복·독립 pending·scroll/focus/DOM/초안/펼침·실패 |
| 운영 인증/API | PASS | 실제 합성 A/B/C 비밀번호 Auth, A/B/C/익명 세 범위 행 접근 |
| 운영 좋아요 UI | 320/375/390 각 PASS | 즉시 등록/취소/count/aria, 피드·scroll/focus·본문·초안 유지 |
| 운영 실패 rollback | PASS | 합성 post의 RPC만 브라우저에서503 주입, 실제 장애 아님 |
| 실제 다중 창 Realtime | PASS | 두 독립 운영 브라우저 peer count, 실 SDK typed 이벤트 수신 |
| 운영 권한 회귀 | PASS | 범위 변경/팔로우 취소/차단시 상대 화면 제거·좋아요42501, 공유 취소·원본 보존 |
| 운영 익명·기존 화면 | PASS | 3 viewport의 홈/보관함/공연 진입/음악 이야기, 익명 API/좋아요 제한 |

운영 인증은 Google OAuth가 아니라 새 합성 계정의 실제 Supabase 비밀번호 로그인이다. 60개 페이지 유지/경합/계정 전환 지연 응답은 로컬 합성 검사이며 운영에 수십 개 글을 생성하지 않았다. 운영은 안전한 단일 합성 공유본으로 수행했다. 두 브라우저 각각에서 실 운영 앱을 열었고 한 창의 좋아요/취소가 다른 창에 반영되는 것을 확인했다. SDK 실구독을 별도로 관측해 단순한 합성 이벤트 호출을 실제 Realtime PASS로 표현하지 않았다.

초기 두 차례 운영 시도에서 UI/실패 rollback은 통과했으나 보조 원시 프레임 파서가 현재 transport 형식을 해석하지 못해 Realtime PASS를 보류했다. 최종 실 SDK 관측+peer 화면 갱신으로 보완해12개 운영 시나리오가 모두 통과했다. 이는 검증 도구 보완이며 운영 기능 코드를 추가 수정하지 않았다. 초기 시도 실패와 자료 정리 결과도 JSON에서 구분한다.

## 합성 자료·민감정보

시도별 A/B/C 합성 계정3개(3회 총9개), 합성 원본/공유본/좋아요/팔로우/차단 관계를 정리했다. 계정 삭제 전 ID 소유와 합성 metadata를 확인했으며 기존 사용자 삭제/수정은 없었다. 각 시도 후 기존 테이블 행 수·지문, 마지막 시도의 RLS/RPC/trigger도 baseline과 동일하다. 합성 자격증명/세션 상태 파일은 정리했다. 댓글 초안은 브라우저 메모리에만 있었으며 전송하지 않았고 모든 임시 context를 종료했다. 실제 사용자 본문·식별자·이메일·세션·접속 문자열·백업 실제 경로는 결과 문서에 포함하지 않았다.

## 배포·남은 항목·rollback

Vercel Production **READY**, deployment `dpl_CSPnzCi2SmKoLaZv6Lz7Vz2Z5wDy`, main/배포 SHA 일치, sound-atlas.vercel.app alias와 HTTP200. 새 운영 앱의 익명 기존 화면 진입/가로 넘침 없음/치명적 pageerror 없음 확인. 환경변수·Supabase/OAuth/Vercel 프로젝트 설정 변경0, 기존 RLS/RPC 변경0이다. DB 변경은 승인된 likes trigger/function DDL뿐이다.

미검증: 실제 Google OAuth 계정 선택, 실기기 iOS/Android PWA/IME, 실제 통신망 단절/서버 장애. 503은 격리된 브라우저의 합성 요청에 주입한 실패다. PWA 작업은 **CA-PWA-TOP-SAFE-AREA-20261111-001 / DEPLOYED / IOS_CONFIRMATION_PENDING**을 유지하며 해결/종료를 확정하지 않는다. 이 좋아요 작업은 실제 로그인·Realtime 확인이 완료돼 **DEPLOYED**로 기록한다.

회귀 시 코드 복구 대상은 merge `ed77628aef351a5655c382f97a40f8a75026e78a`이며 별도 `git revert -m 1 ed77628aef351a5655c382f97a40f8a75026e78a` 커밋으로 복구한다. [DB rollback SQL](../supabase/rollback/202611110001_social_like_invalidation.sql)은 typed trigger 제거→기존 일반 trigger 복원→전용 함수 제거를 단일 transaction으로 수행하고 행을 변경하지 않는다. 새 클라이언트는 rollback의 빈 payload도 clear-first로 처리한다. migration 부분 적용/Ready 실패/SHA 불일치/깜빡임 지속/권한 노출/계정 혼합이면 성공으로 처리하지 않고 원인을 확인한다. 강제 push/전체 restore/환경·설정 변경은 복구 수단으로 쓰지 않는다. 현재 rollback 사유는 관찰되지 않아 실행하지 않았다.
