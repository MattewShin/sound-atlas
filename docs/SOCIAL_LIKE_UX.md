# 음악 이야기 좋아요 UX

CA-SOCIAL-LIKE-UX-20261111-001 / 통합 구현·운영 적용. 구현 코드 SHA: 283decdf99d54ca1969d4983e97a2c9cd189751d. 기준 main de4f78d2b00edae6166348194e1a648c8d0e184a. 작성 2026-11-11 16:54:09 KST.

## 원인과 변경

좋아요 RPC 이후 run→refresh 및 likes의 일반 Realtime invalidate가 모두 setData(null)/setComments({})를 호출해 피드를 unmount했다. 새 경로는 게시물별 Map/token으로 중복 요청을 막고 즉시 liked/count/하트/aria-pressed/label을 갱신한다. 0 아래로 감소하지 않는다. pending은 aria-disabled/aria-busy와 동기 guard로 해당 게시물만 막아 native disabled가 일으키는 포커스 해제를 피한다. 전역 busy를 사용하지 않는다. 실패는 해당 게시물만 rollback하고 role=alert 고정형 안내를 표시한다. 안내 삽입으로 스크롤이 움직이던 첫 모바일 실패를 수정한 후 재검증했다.

세션/route generation, background sequence, mutation revision과 진행 중 Map으로 오래된 서버 응답을 버린다. pending 상태를 feed 응답이 덮지 못하며 종료 후 서버를 다시 읽어 수렴한다. background는 현재 페이지 깊이만큼 읽고 새 글 때문에 밀려 누락된 기존 ID만 직접 권한 조회한다. 현재 게시물 key·DOM·페이지 깊이·댓글·초안·펼침 상태를 유지한다. 신규 게시물 탐색은 기존 일반 재검증 경로를 따른다.

createInvalidationSubscriber는 broadcast message.payload를 전달한다. kind=like만 background에서 liked/count를 동기화한다. 빈/알 수 없는 이벤트, 공개 범위/차단/팔로우/삭제/프로필 변경은 기존 clear-first, offline/pagehide/visibility/재연결·주기적 권한 재검증도 유지한다. 42501/401/403/인증 거부는 clear-first로 권한 재검증한다. 일시적 like background 네트워크 오류는 피드를 지우지 않는다. App의 기존 세션별 key/Auth 격리는 변경하지 않았다.

## DB 영향·적용·복구

기존 migration 수정0. 새 [forward SQL](../supabase/migrations/202611110001_social_like_invalidation.sql)은 단일 BEGIN/COMMIT, lock_timeout5초/statement_timeout30초, likes 테이블 SHARE ROW EXCLUSIVE 잠금 아래 예상 statement trigger 구조를 검사한다. 기존 generic trigger 하나를 전용 social_like_invalidate trigger/function으로 교체한다. 데이터/RLS/기존 RPC·나머지5개 generic trigger 변경0. 잠금 중 likes 쓰기는 잠시 대기하며 일반 SELECT는 유지된다. timeout/예상외 구조에서는 오류로 transaction이 실패하며 rollback한다. SQL-only 격리 DB에서 실패 원자성을 확인했다.

Realtime topic atlas-social/event invalidate/public broadcast는 그대로이고 payload는 {"kind":"like"} 하나뿐이다. post/profile/Auth ID·본문·공개 범위를 전송하지 않는다. private 함수 execute는 PUBLIC/anon/authenticated에 revoke한다. 구 클라이언트는 기존 event를 받아 재검증하므로 호환된다.

운영 순서: Draft/자체 검토·Preview Ready → 정의/ACL/RLS/행 수 읽기 재검사 및 변경 전 정의·migration SHA256·[rollback SQL](../supabase/rollback/202611110001_social_like_invalidation.sql) 확보 → forward 한 파일 transaction 적용/후속 catalog·행 지문 확인 → expected HEAD PR 병합 → Production Ready/SHA/alias → 합성 사용자 실제 API/UI/Realtime 검증·정리. 기존 이력 테이블이 없어 Supabase CLI history 적용을 주장하지 않고 catalog/실행 checksum으로 관리한다. 정의 백업/출력은 Git 제외 로컬에만 두며 공개 Storage에 올리지 않는다.

DB rollback은 명시적 SQL로 typed trigger 제거 → 기존 atlas_private.social_invalidate() generic trigger 복원 → 전용 함수 제거다. 행 변경/전체 DB restore/CASCADE/TRUNCATE 없음. 코드 문제는 최종 merge commit의 별도 revert -m 1 커밋을 사용하며 강제 push하지 않는다. DB rollback 뒤 새 클라이언트는 빈 payload를 clear-first 처리한다.

## 검증

최종 전체174/174, 기존 SNS5/5, 전용3/3(SQL 정적1·격리 PGlite 통합1·DOM UX1), production build PASS. 기존 chunk 크기 경고는 유지된다. [검증 JSON](SOCIAL_LIKE_UX_VERIFICATION_2026-11-11.json)에 코드 기준과 로그 checksum을 기록했다. SQL 통합은 payload/ACL/행 보존·중복 방지·타 테이블 generic 이벤트·rollback·예상외 trigger시 자동 rollback을 확인한다. 기존 SNS 권한/차단/공개 범위·삭제·Auth 회귀를 유지했다. 기존 DOM 검사의 좋아요 선택자를 aria-pressed 버튼으로 명확히 해 오류 닫기 버튼과 혼동하지 않게 했다.

전용 DOM: 즉시 등록/취소/음수 방지·per-post pending/중복·독립된 두 요청·실패 rollback·typed/unknown/빈 이벤트·네트워크 실패 유지/권한 거부 제거·늦은 feed와 mutation 경합·route/계정 변경·track/person/post 딥링크·익명 읽기·60개 추가 로드·동일 DOM/본문 펼침/댓글 초안/포커스·영구 저장 없음을 확인했다. 320/375/390px 실제 Chromium 렌더링에서도 60개 피드, 즉시 label/pressed, 다른 버튼 사용 가능, scroll 차이2px 미만/포커스/댓글/펼침·DOM 유지, 실패 rollback/가로 넘침 없음 PASS. [320](social-like-ux-20261111/like-state-320.png)·[375](social-like-ux-20261111/like-state-375.png)·[390](social-like-ux-20261111/like-state-390.png)은 외부 네트워크 없는 합성 자료다.

이 문서 작성 당시 운영 migration/로그인/다중 창 실검증은 아직 수행 전이며 기존 합성 테스트를 운영 PASS로 표현하지 않는다. 실제 운영 결과는 별도 결과 문서 브랜치에 기록하고 그 문서 PR은 별도 승인 전 생성/병합하지 않는다. 실제 Google OAuth/실기기 IME/iOS PWA는 범위 밖 미검증이다. PWA 작업은 별도 브랜치 IOS_CONFIRMATION_PENDING을 그대로 유지한다. 환경변수/OAuth/Vercel 프로젝트 설정·실제 사용자 자료는 변경하지 않는다.
