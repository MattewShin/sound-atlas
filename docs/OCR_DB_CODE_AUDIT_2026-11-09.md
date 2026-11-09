# OCR·DB 코드 의존성 조사 — 2026-11-09

- 작업: CA-OCR-DB-AUDIT-20261109-001 / 명세 1
- 조사 기준: `main`의 전체 SHA `2552f5b021238b65a8c4d2e235a342b12e498cde`; 조사 브랜치 `codex/ocr-db-audit-20261109`
- 방법: 위 SHA의 로컬 체크아웃에서 추적된 소스·migration·draft·검증 SQL·설정·문서를 정적 분석했다. 아래 GitHub 근거는 모두 같은 SHA로 고정했다.
- 범위 한계: 본 조사자는 DB/실제 `.env`/Storage/Windows 예약/실배포/API에 직접 접속하지 않았다. 먼저 코드를 조사한 뒤, 후반의 **운영 snapshot 대조**에서는 부모 조사자가 제공한 안전한 집계·메타데이터 JSON만 읽었다. 그 절 이전의 “미확인”은 코드만 읽었을 때의 한계다. 함수/view 원문 동일성·실제 호출 주체·Windows 예약 상태는 이 snapshot으로 확정할 수 없다. 원래 IDE의 미커밋 OCR 스크립트는 이 main 조사와 별도다. 앱·migration 수정, 배치·테스트 실행은 하지 않았다.
- 시작 시 AGENTS·PROJECT_CONTEXT·CURRENT_TASK·HANDOFF·협업 안내를 읽었다. 기준 main의 기존 공동 문서는 SNS 작업 기록이며, 이번 조사 문서와 구분한다. 조사 중 부모 작업자가 공동 문서를 갱신하고 있으므로 그 변경을 코드 기준 SHA의 내용으로 섞지 않았다.

## 핵심 판단

현재 공연 화면의 도달 가능한 경로는 **지역·날짜 기반 KOPIS 목록/상세 + 별도 `concert_browser_cache`**다. `createConcertSearchService`는 항상 `createKopisService`를 반환한다. API는 GET만 허용하고 `targetTrackId` 요청을 `SONG_SEARCH_RETIRED` 400으로 거부한다. 과거 `concerts`/Program/OCR 저장 자료를 읽어 현재 목록을 만들지 않는다. 다만 캐시 miss/갱신 시 **Supabase 캐시 POST upsert는 발생**할 수 있으므로 공연 기능 전체를 “DB 쓰기 없음”으로 표현하면 부정확하다. [서비스 선택][service], [API][api], [캐시 읽기·쓰기][cache], [KOPIS 캐시 호출][kopis-cache]

현재 main 소스의 `src`/`server`/`api`에는 과거 OCR·Program 테이블 또는 그 저장/확정 RPC를 호출하는 서비스 코드가 없다. 추적된 `scripts`는 테스트·EMMA 가져오기·추천 진단이며, 수집기/EasyOCR/Program 배치 실행 파일과 Windows 예약 등록 스크립트가 없다. SQL과 과거 운영 안내가 남아 있다는 사실은 예약이 실행 중이라는 증거가 아니다. [npm 진입점][package], [현재 테스트 진입점][tests], [기존 전환 정책][browser-doc]

**OCR 전용 객체와 공유 객체를 구분해야 한다.** `concert_program_catalogs`, `concert_program_version_policy`, `concerts`는 공식 KOPIS text 분석에도 쓰인다. `concert_program_text_*`는 OCR ID를 금지하는 독립 공식 text 경로다. 현재 서비스가 사용하지 않는다는 판단과 데이터를 지워도 된다는 판단은 다르다. 특히 OCR 기반 확정 후보의 유효성은 OCR 원문·attempt·이미지·공연 맥락·카탈로그·review까지 연결되어 있다. [text 저장][text-save], [OCR 확정 증거][identity], [공식 text 확정][text-confirm]

## 실제 서비스 도달 경로

| 시작점 | 실제 호출 경로 | DB 영향 |
| --- | --- | --- |
| 공연 찾기/상세 | `App` → `useConcertSearch` → `createConcertSearchClient` → `/api/concerts` 또는 `/api/concerts/PF…` → Vercel `api/index.js` → `server/vercel.mjs` → 공통 API → KOPIS service | `concert_browser_cache`만 GET/POST; KOPIS에는 GET. 과거 DB 곡 검색/OCR/수집 RPC 호출 없음 |
| 보관함·평가 | `App` → `syncUserLibrary` → `merge_user_track_reactions` | 본인 `user_track_reactions` 읽기·병합 |
| 곡별/전체 개인 음악 기록 | `App`/`MusicSocial` → `MusicJournal` → `musicJournal.js` | `user_music_journal` 읽기, 저장·삭제 RPC |
| 공유/공개 곡별 기록 | 곡 상세의 `PublicMusicStories`, 기록의 `ShareMusicRecord` → `musicSharing.js` | 닉네임·공유 조회, 공유/취소 RPC |
| 음악 이야기·기존 공유 링크 | `App`의 social/story 분기 → `MusicSocial` → `getSocialApi` | social RPC, 댓글·차단 목록 직접 SELECT; private 계정 매핑·신고는 RPC 내부 사용 |
| 계정 삭제 | `useGoogleAuth` → `delete_current_user_account` | `auth.users` 삭제와 사용자/social FK 연쇄. OCR 계열과 분리 |

근거: [App의 공연/social 분기][app-routes], [공연 클라이언트][concert-client], [Vercel 진입][entry], [Vercel 연결][vercel-handler], [보관함 RPC][library], [음악 기록 API][journal-client], [공유 API][sharing-client], [social API 전체][social-client], [계정 삭제][account-client]. 곡 상세에서의 공개 기록·개인 기록과 보관함 기록 경로도 실제 렌더링된다. 과거 공개 화면 컴포넌트가 export되어 있다는 사실만으로 모든 화면이 주 라우트라는 의미는 아니다. [App 곡 상세][app-track], [social 기록 탭][social-tab]

## public/atlas_private 테이블별 사용 분류

`R/I/U/D`는 소스에서 확인한 읽기/추가/갱신/삭제 경로다. 운영에서 최근 실행했다는 뜻은 아니다. FK에 의한 삭제도 D에 포함했다. 아래 26개는 migrations가 선언한 25개와 draft가 선언했지만 후속 migration이 전제하는 version policy 1개다. 별도 bounded draft 2개는 다음 표에서 분리한다.

| 테이블 | 분류 | 현재 서비스 및 보존/변경 의존성 |
| --- | --- | --- |
| `public.concert_browser_cache` | 현재 서비스 사용 | 서버 REST R/I/U. 목록/상세 JSON·fetched_at 저장, key별 upsert. 과거 공연 FK 없음. [캐시 코드][cache] / [DDL][cache-ddl] |
| `public.user_track_reactions` | 현재 서비스 사용 | `merge_user_track_reactions` R/I/U, 계정 삭제 CASCADE D. 곡 ID는 text이며 OCR candidate FK 없음. [서비스][library] / [권한·RPC][account-sql] |
| `public.user_music_journal` | 현재 서비스 사용 | 직접 본인 R, 저장 RPC R/I/U, 삭제 RPC D, 계정 CASCADE D. 공유본의 원본 FK 대상. [서비스][journal-client] / [DDL·RPC][journal-sql] |
| `public.user_music_nicknames` | 현재 서비스 사용 | 본인 R; 공유·profile 생성 내부 R/I, 계정 CASCADE D. [서비스][sharing-client] / [DDL][sharing-sql] / [social profile][social-profile] |
| `public.music_record_publications` | 현재 서비스 사용 | 직접 제한 열 R 및 social feed R; 공유 I, 글/범위 U, 취소 D. 원본·계정·profile 삭제 CASCADE. 기존 공유 ID 보존. [공유 API][sharing-client] / [DDL][sharing-sql] / [social 확장][social-ddl] |
| `public.social_tracks` | 현재 서비스 사용 | 게시 INSERT trigger에서 등록곡 R; catalog migration I/U. 공연↔곡 매칭 테이블이 아니다. [trigger][social-ddl] / [catalog seed][social-catalog] |
| `public.music_social_profiles` | 현재 서비스 사용 | profile/feed/댓글 join R, profile 생성 I·handle/avatar U, 계정 매핑 삭제 trigger D. [social API][social-client] / [DDL·함수][social-ddl] |
| `public.music_social_follows` | 현재 서비스 사용 | 팔로워 권한·인원 R, follow I/D; block 시 양방향 D, profile CASCADE D. [social 읽기][social-read] / [관계 변경][social-write] |
| `public.music_social_blocks` | 현재 서비스 사용 | RLS helper·차단 목록 R; block/unblock I/D; profile CASCADE D. [클라이언트][social-client] / [관계 변경][social-write] |
| `public.music_social_likes` | 현재 서비스 사용 | feed count/liked R, like I/D, post/profile CASCADE D. [feed][social-read] / [변경 RPC][social-write] |
| `public.music_social_comments` | 현재 서비스 사용 | 댓글 직접 R 및 feed count R, comment I·삭제 D, post/profile CASCADE D. [클라이언트][social-client] / [RPC][social-write] |
| `atlas_private.social_accounts` | 현재 서비스 간접 사용 | auth UUID↔opaque profile 매핑 R/I; auth 삭제 CASCADE D와 profile 정리 trigger. public REST 직접 사용 아님. [매핑 정의/생성][social-ddl] / [삭제 trigger][social-triggers] |
| `atlas_private.social_reports` | 현재 서비스 간접 사용 | 신고 RPC I; 운영 service_role R/U/D 및 purge D. post/profile 삭제 시 관련 FK SET NULL, snapshot은 남음. purge 함수가 있다고 스케줄 등록이 증명되지는 않음. [DDL][social-ddl] / [신고·정리][social-triggers] |
| `public.concerts` | 수집·Program text/OCR 공유, 현재 서비스 미참조 | `sync_kopis_concert` R/I/U; OCR/text save·status·확정·cleanup R. cleanup D; 이미지/OCR 분석/text 분석 부모. 현재 KOPIS 브라우저는 이 테이블을 쓰지 않음. [수집 최신 함수][collect-text] / [cleanup][cleanup] / [text 저장][text-save] |
| `public.concert_program_images` | 수집·OCR 공유, 현재 서비스 미참조 | 수집 R/I/U(비활성화 포함); OCR 저장·증거·자동화 R, revision trigger U; 공연 CASCADE D. URL/유형/활성 상태는 OCR 증거의 일부. [수집][collect-text] / [OCR][ocr] |
| `public.concert_image_ocr_results` | OCR 전용, 현재 서비스 미참조 | `record_concert_image_ocr` R/I. raw_text/detections/confidence 등; 이미지 CASCADE D. 분석·attempt·증거 hash가 참조하므로 독립 삭제 불가. [OCR DDL/RPC][ocr] / [분석 FK][analysis-ddl] |
| `public.concert_image_ocr_attempts` | OCR 전용, 현재 서비스 미참조 | 완료 시도 R/I, 최신 성공/실패의 증거 유효성 판정에 R; cleanup 직접 D·이미지 CASCADE D. 결과를 참조하며 분석의 source_attempt FK 대상. [OCR][ocr] / [증거 재검증][automation-evidence] |
| `public.concert_program_catalogs` | Program text/OCR 공유, 현재 서비스 미참조 | OCR/text save/rematch 시 R/I; work identity 및 두 확정 체계 R. OCR analysis·matching catalog와 text analysis·confirmation에서 FK 참조. [분석][analysis-ddl] / [identity][identity] / [text 저장][text-save] / [text 확정][text-confirm] |
| `public.concert_program_analyses` | OCR Program, 현재 서비스 미참조 | save/rematch/자동화 R/I/U; OCR source·이미지·공연·catalog 의존. cleanup 직접 D, 공연/이미지 CASCADE D; candidate 부모. [분석][analysis-ddl] / [v4 wrapper][v4] / [자동화][automation] |
| `public.concert_program_candidates` | OCR Program, 현재 서비스 미참조 | save/rematch I; review/자동화 R/U; status view R. analysis CASCADE D, review 부모. `track_id`/`work_id` 자체만 보존해서는 유효 확정이 복원되지 않음. [분석 DDL][analysis-ddl] / [identity/rematch][identity] |
| `public.concert_program_reviews` | OCR Program 확정/rejection 이력, 현재 서비스 미참조 | 수동·자동 결정 R/I; 검증된 legacy identity backfill의 제한 U. candidate CASCADE D. immutable identity trigger가 INSERT/UPDATE 검사하며 DELETE를 막지는 않음. [identity trigger][identity] / [자동 결정][automation] |
| `public.concert_cleanup_events` | 수집/OCR 운영 삭제 영수증, 현재 서비스 미참조 | cleanup RPC R/I, 재시도 멱등성 보장. 삭제된 concert_id는 FK가 아니므로 공연 삭제 뒤 유지. title/OCR/review 본문 보관소 아님. [cleanup][cleanup] |
| `public.concert_program_version_policy` | Program text/OCR 공유, 현재 서비스 미참조 | draft에서 생성; v4 migration은 기본 false 행 I(기존값 보존). 저장/상태/확정에서 R·row lock. service_role 정책 관리 I/U 권한. 실제 값과 적용 여부 미확인. [생성 draft][v3-draft] / [v4][v4] / [text 저장][text-save] |
| `public.concert_program_text_analyses` | 공식 text 전용, 현재 서비스 미참조 | save text R/I/U(`is_current`); source_hash·공연 revision·context·catalog·policy 검증. 공연 CASCADE D, text candidate/confirmation 참조. OCR ID 입력 금지. [저장][text-save] |
| `public.concert_program_text_candidates` | 공식 text 전용, 현재 서비스 미참조 | save text I, status/확정 R. analysis CASCADE D지만 confirmation FK는 NO ACTION. track/work는 snapshot에서 추출. [저장][text-save] / [확정 FK][text-confirm] |
| `public.concert_program_text_confirmations` | 공식 text 확정 영수증, 현재 서비스 미참조 | confirm RPC R/I, status view R. UPDATE/DELETE/TRUNCATE 차단 trigger; concert/analysis/candidate/catalog NO ACTION FK. [영수증][text-confirm] / [유효성 view][text-confirm-status] |

| draft에만 정의된 테이블 | 분류·의미 |
| --- | --- |
| `public.program_automation_bounded_runs` | OCR 자동화 제한 실행 관리. planning R, completion R/I/U, service_role SELECT. migrations에 CREATE 없음; 운영 존재 추정 금지. [bounded draft][bounded] |
| `public.program_automation_bounded_batches` | run FK 및 run+request별 멱등 영수증. completion R/I; planning/completion이 OCR 전체 그래프·review를 읽고 바꿈. 현재 서버 호출 없음. [bounded draft][bounded] |

## SQL·migration·view·trigger 의존성

| 파일/객체 | 영향과 적용 판단 |
| --- | --- |
| `202610140001` | concerts/images 생성, updated_at trigger, 수집 upsert RPC. 원본 이미지 row를 재생성하지 않고 활성 상태 변경. [원본 DDL][collect] |
| `202610140002` | OCR 결과/완료 attempt 생성, service_role 전용 record RPC. OCR은 raw 자료이며 곡 확정이 아님. [OCR][ocr] |
| `202610150001` | 공연/이미지 revision trigger, catalogs/analyses/candidates/reviews, evidence check/save/review RPC와 status view. OCR FK 그래프 형성. [분석][analysis-ddl] |
| `202610160001` | cleanup counts/FK/shared-dependency 검사, plan/delete RPC·영수증. delete는 알려진 10개 inbound edge를 요구. [cleanup][cleanup] |
| `PROGRAM_ANALYSIS_V3_DRAFT.sql` | snapshot·버전별 current index·version policy 및 save_v3 정의가 **draft에만** 있음. [draft][v3-draft] |
| `202610210001` | work identity canonical/hash, review immutable trigger, confirm identity/backfill/rematch, status view 대체. rematch_source_candidate_id는 의도적으로 FK 없음. [identity][identity] |
| `202610220001` | draft 전제 명시. 자동 queue/decide/finish/defer RPC, evidence_changed_at 및 revision trigger 교체, evidence 검사와 status view 최종 대체. [자동화][automation] |
| `202610230002` | concerts 공식 원문·hash nullable 열, sync RPC 교체. legacy payload는 기존 원문 보존하고 명시적 null pair는 원문을 비움. [공식 원문][collect-text] |
| `202610230003` | v3 RPC·snapshot·버전별 index를 사전 검사하고 v4 wrapper 및 disabled 초기 policy 행 생성. [v4][v4] |
| `202610260001`~`004` | 공식 text analysis/candidate, analysis/candidate status, append-only confirmation, confirmation status. OCR 분석과 분리되나 concerts/catalog/policy/identity 함수 공유. [저장][text-save] / [상태][text-status] / [확정][text-confirm] / [확정 상태][text-confirm-status] |
| `202610270001`~`002` | text table ACL 복구, 한 analysis 대상 read-only 후보 상태 RPC. 새로운 confirmation 권한 없음. [ACL][text-acl] / [bounded read][text-read] |
| `202610300001` | 독립 브라우저 캐시. 역사 자료/공연 FK 없음. [DDL][cache-ddl] |
| `202611020001`~`004`, `202611060001`~`002` | 현재 사용자 보관함·원본·공유·SNS. auth/원본 FK를 공유하며 OCR 그래프와 연결 안 됨. SNS 확장 trigger는 등록곡 검사·profile 매핑·계정 삭제 정리·Realtime invalidate 발행을 수행. [계정][account-sql] / [원본][journal-sql] / [공유][sharing-sql] / [SNS][social-ddl] / [트리거][social-triggers] |

**migrations 폴더만으로 운영 스키마를 재현했다고 가정할 수 없다.** version policy 생성과 v3 RPC는 draft에 있고, `202610220001`은 그 draft를 요구하며 `202610230003`은 해당 v3 객체를 명시적으로 검사한다. 운영에는 수동 적용·변경이 있을 수 있으므로 실제 정의를 별도 대조해야 한다. draft를 이번 조사에서 실행하거나 migration으로 옮기지 않았다. [draft 구분 안내][draft-readme], [자동화 전제][automation], [v4 전제][v4]

또한 과거 cleanup RPC는 text 테이블 추가 전 10개 edge에 고정되어 있다. 공식 text analysis/confirmation의 concerts FK 등이 실제 설치되어 있으면 그 검사에서 `BLOCKED_UNEXPECTED_FOREIGN_KEY`가 될 것으로 코드상 예상된다. 검사 우회 시에도 confirmation NO ACTION FK와 DELETE 차단 trigger가 있다. **오래된 cleanup을 현재 전체 그래프의 안전한 정리 도구로 바로 사용할 수 없다.** 이는 운영 실행 관측이 아니라 정의 비교에 근거한 추론이다. [검사·삭제][cleanup], [text 부모 FK][text-save], [확정 FK·trigger][text-confirm]

view 네 가지는 모두 파생 조회이며 별도의 확정 저장소가 아니다. OCR `concert_program_candidate_status`는 analyses/candidates/reviews/images/concerts/policy 및 evidence 함수에 의존한다. text `concert_program_text_analysis_status`와 `concert_program_text_candidate_status`는 text 테이블/concerts/catalog/policy에 의존하고, `concert_program_text_confirmation_status`는 거기에 confirmation receipt·identity/evidence 검사를 더한다. `read_concert_program_text_candidate_status_v4`는 해당 후보 view의 한 analysis용 동등 조회다. [OCR view 최종 migration][automation-view], [text views][text-status], [확정 view][text-confirm-status], [단일 analysis RPC][text-read]

## 확정 공연↔곡 연결을 “보존”한다는 의미

1. **OCR 경로:** candidate의 `concert_id`는 analysis를 거쳐 얻고, `track_id`·`work_id`와 review의 `status=CONFIRMED`, work identity snapshot/hash, matcher/pipeline/evidence hash를 함께 사용한다. 최종 status view의 `is_effectively_confirmed`는 선택된 current 계열·증거 유효·EXACT·MATCHED·확정 이력 일치·정책 등을 평가한다. raw OCR 결과나 CONFIRMED 문자열만은 확정 연결이 아니다. [identity 검사][identity], [최종 OCR 유효성][automation-view]
2. **공식 text 경로:** `concert_program_text_confirmations`에 concert/candidate/analysis/track/work와 source/payload/catalog/evidence/identity/verification hash가 저장된다. 현재 source bytes·revision·context·current·policy·candidate·catalog가 유지되는지는 confirmation status view가 다시 판단한다. 영수증이 존재하는 것과 `is_effectively_confirmed=true`는 구분해야 한다. [receipt][text-confirm], [live validity][text-confirm-status]
3. **물리 보존과 검증 가능성:** ID tuple만 추출해 보관하면 “어떤 곡으로 확정했었는지”는 남길 수 있지만 기존 view/RPC가 검증하는 연결은 유지하지 못한다. OCR 분석이 raw result/attempt FK와 hash 검사를 요구하므로 OCR 삭제와 현행 확정 검증을 동시에 유지하려면 별도 보존 계약·검증 기준·후속 migration 설계가 필요하다. 이번 조사는 그 정책/구현을 승인하거나 수행하지 않는다. [분석 FK][analysis-ddl], [증거 hash][identity]
4. 사용자 보관함/개인 기록/social의 text track ID와 공식 `social_tracks`는 공연 매칭 FK가 아니다. OCR 원시 자료를 지울 때 이 사용자 데이터까지 지울 이유는 코드상 확인되지 않는다. 반대로 사용자 곡 ID/원본/공유 링크를 OCR table과 혼동해 정리하면 현재 서비스 기능이 손상된다. [보관함][account-sql], [개인 원본][journal-sql], [공유 FK][sharing-sql], [등록곡 trigger][social-ddl]

## Storage·스케줄·과거 스크립트 확인

- 현재 추적 소스·SQL에서 Supabase Storage SDK(`storage.from`)나 `storage.buckets`/`storage.objects`, bucket 생성/삭제, upload/download/remove 경로를 찾지 못했다. concert image는 `source_url`, 현재 브라우저 cache/detail은 poster/introduction image의 안전한 외부 URL을 저장/표시한다. **운영 bucket이나 파일이 0이라는 결론은 낼 수 없다.** [이미지 URL DDL][collect], [캐시 URL projection][cache], [KOPIS URL 정규화][kopis-data]
- `vercel.json`에는 rewrite/functions/headers만 있고 `crons` 정의는 없다. package scripts에도 OCR/수집/Program 배치가 없다. 추적된 파일 목록에는 `.github` workflow, `.ps1`, `.py`, cron 설치 SQL이 없다. DB 내부 cron·Windows 예약·외부 스케줄러가 실제 없는지는 별도 조회 사항이다. [Vercel 설정][vercel-config], [npm][package]
- `docs/CONCERT_BROWSER.md`는 과거 pipeline 예약을 Disabled하고 대체 배치를 만들지 않는 정책을 기록한다. `docs/LOCAL_PIPELINE.md` 등은 과거 등록/실행 가이드다. 문서의 명령을 실행 가능한 현재 main 파일 또는 현재 예약의 실제 command로 간주하지 않는다. [전환 정책][browser-doc], [과거 pipeline 문서][pipeline-doc]
- social 신고 정리 함수는 현재 migration에 있다. 반면 일일 03:15 KST `pg_cron` 및 15분 외부 감시는 staging 문서에 “설정안, 실제 실행하지 않음”으로 적혀 있다. OCR 스케줄과 무관하다. 문서의 cron.schedule 예문이 DB에 설치되어 있다고 보고하지 않는다. [purge 함수][social-triggers], [미실행 설정안][cron-plan]
- `supabase/verification/*.sql`은 읽기 전용 검증 예시, `supabase/diagnostics/*.sql`은 사전 조건/FK/identity 확인이며 앱에서 import하지 않는다. `supabase/drafts`의 bounded plan/complete는 실행하면 저장·확정할 수 있는 SQL 정의이지만, 현재 runtime 진입점이 아니다. [OCR 검증 SQL][ocr-verify], [분석 검증 SQL][program-verify], [사전 조건 SQL][diagnostic], [bounded draft][bounded]

## 확인 완료와 후속 확인 경계

정적 확인 완료: 현재 서비스 import/API 경로, table/RPC 호출, 21개 migration 파일, 2개 draft SQL과 draft 안내, 4개 verification·2개 diagnostic SQL, Storage/cron/스케줄러 관련 추적 코드·설정 참조를 확인했다. 문서만 추가했으며 앱 테스트·배치·DB/API 호출을 수행하지 않았다.

운영 읽기 조사에서 채워야 할 항목: 실제 public/atlas_private 테이블과 객체 정의(위 26+draft2 외 추가 객체 포함), 정책/trigger/FK/view/RPC 의존성, cron과 실제 예약 command, 최근 호출/실행 증거, 유효·과거 확정 연결 수, Storage bucket/파일/URL 관계, 인덱스 포함 공간. **정적 미참조는 최근 미사용의 직접 측정이나 삭제 승인 또는 예상 회수 공간 수치가 아니다.**

## 운영 snapshot 대조 — 2026-11-09 09:41:25 KST

근거 자료는 Git 제외 `.cache/db-inventory.json`이다. 부모 조사자가 운영에서 읽은 집계·카탈로그 메타데이터이며 사용자 본문·접속정보·키가 없다. `snapshot.transaction_read_only=on`, `default_read_only=off`이므로 **이번 transaction이 읽기 전용**이었다고 구분한다. 조사자는 이 JSON의 `tables`, `columns`, `constraints`, `views`, `view_dependencies`, `triggers`, `functions`를 앞선 고정 SHA 소스와 대조했으며 새 DB 명령을 실행하지 않았다. 이 JSON에는 함수/view 정의 원문·정의 hash·모든 인덱스 정의가 없으므로 “운영 정의가 소스와 byte 단위로 동일”하다고 단정하지 않는다.

| 대조 항목 | 관측 결과와 의미 |
| --- | --- |
| 테이블 | `public` 24개 + `atlas_private` 2개 = 26개. 앞의 코드 표와 이름이 모두 일치하며 추가 앱 테이블 없음. `concert_program_version_policy`는 실제 존재하고 1행. bounded runs/batches 2개는 없음 |
| draft 전제 적용 흔적 | `concert_program_analyses.snapshot jsonb` 열과 `save_concert_program_analysis_v3`가 실제 존재. draft 기반 객체가 설치된 모양은 확인되지만 파일별 적용 이력은 아님. `migration_history_available=false`이므로 migration 파일 적용 순서/시각을 이 snapshot으로 재구성 불가 |
| 함수 | public/private 65개. 코드의 서로 다른 함수명 67개 중 bounded `plan_automatic_program_batch_bounded`, `complete_automatic_program_batch_bounded`만 DB에 없음. 나머지 65개 함수명은 모두 코드에 정의. **운영에만 남은 public/private 함수명은 발견하지 못함.** migrations만 보면 v3 함수가 DB 전용처럼 보이지만 draft에 정의되어 있음 |
| 앱 trigger | 비내부 public/private trigger 15개 모두 소스에 정의되어 있고 `enabled=O`. 운영에만 추가된 앱 trigger명은 없음. `program_text_confirmation_immutable`/`no_truncate` 2개와 OCR review identity trigger가 실제 설치되어 있음 |
| 전체 trigger | snapshot 전체 168개 중 내부 FK 관련 142개, 비내부 26개. 위 앱15개 외 나머지 비내부11개는 `storage.buckets`/`storage.objects`의 Supabase 플랫폼 trigger이며 프로젝트 migration에 없는 것이 정상적인 구분이다. 앱 전용 잔재로 세면 안 됨 |
| view | 예상한 4개가 모두 실제 존재. `view_dependencies` 20개에는 OCR status6개, text analysis status4개, text candidate status4개(text analysis status view 포함), text confirmation status6개가 기록됨. OCR raw result/attempt는 evidence helper를 통한 간접 의존도 있으므로 이20개만 삭제 판단의 완전한 그래프로 쓰면 안 됨 |
| FK | public/private FK 38개. OCR cleanup이 소유한다고 가정하는 7개 테이블로 들어오는 FK는 실제 **12개**다. 기존10개에 `concert_program_text_analyses.concert_id`, `concert_program_text_confirmations.concert_id`가 추가됨. 따라서 소스와 같은 cleanup 함수라면 기존10개 검사에서 차단됨 |
| cron·Storage | `cron.available=false`로 이 DB의 `cron.job` 없음, `pgagent_available=false`. `storage_buckets=[]`, `storage_usage=[]`로 조사 시점 이 프로젝트에서 조회된 bucket/object 집계0. 외부 스케줄러·Windows 예약·외부 이미지 URL의 존재 여부와 별개 |
| 통계 | 누적 scan/insert/update/delete 통계가 존재하지만 reset 기준은 `2026-10-02T17:54:14.043Z`(KST 10월3일02:54:14)다. 최근 작업인지, 앱/배치/검증 중 누가 호출했는지, 현재에도 쓰는지는 이 값으로 판정 불가. 이번 COUNT 자체도 통계에 영향을 줄 수 있음 |

운영에서 text analysis1행·candidate18행·confirmation2행이 관측되므로 공유 catalog/policy와 text 부모 FK는 단순한 미래 설계가 아니다. OCR result60행·attempt72행·analysis114행·candidate290행·review65행도 존재한다. **review65개를 확정 연결65개로 취급해서는 안 된다.** 이 snapshot은 review status별 집계나 두 status view의 effectively-confirmed 결과를 제공하지 않는다. snapshot의 테이블별 행 수는 보존 범위가 있는 사실만 확인하며 유효 확정 수는 후속 안전 집계가 필요하다.

### 운영 함수 65개를 테이블과 호출 체인으로 묶기

`functions.table_text_references`와 `called_custom_functions`는 함수 본문에서 추출한 **직접 이름 참조**다. `%rowtype`, 문자열/주석과 같은 참조도 포함될 수 있고 dynamic SQL·trigger·FK 연쇄·RLS helper는 별도로 보아야 한다. `body_operations`의 단어가 곧 실제 DML이라고 해석하지 않았다. 예를 들어 v4의 `delete`나 수집 함수의 `delete` 표시는 주석에도 나타난다. `function_catalog_dependencies=[]`는 사용자 함수가 table을 전혀 참조하지 않는다는 뜻이 아니다. 문자열 본문으로 정의된 PL/pgSQL/SQL 함수의 catalog dependency 누락과 실제 런타임 접근을 구분한다.

아래 함수명은 별도 표시 없으면 `public`이다. 직접 참조 목록은 snapshot 기준이고, transitive closure는 그 호출 목록과 기존 소스를 함께 읽은 결과다. 같은 이름이라도 함수 본문 동일성 검증을 수행한 것은 아니다.

| 테이블 | 운영 함수의 직접 이름 참조 묶음 |
| --- | --- |
| `concerts` | `sync_kopis_concert`; `save_concert_program_analysis`, `save_concert_program_rematch`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`; `concert_program_evidence_issue`; `program_auto_input_hash`, `queue_automatic_programs`, `decide_automatic_program_candidate`, `finish_automatic_program`, `defer_automatic_program`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `plan_expired_concert_cleanup`, `delete_expired_concert`; `save_concert_program_text_analysis_v4`, `read_concert_program_text_candidate_status_v4`, `confirm_concert_program_text_candidate_v4` |
| `concert_program_images` | `sync_kopis_concert`, `record_concert_image_ocr`; `save_concert_program_analysis`, `save_concert_program_rematch`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`; `concert_program_evidence_issue`, `program_auto_input_hash`, `decide_automatic_program_candidate`, `finish_automatic_program`, `defer_automatic_program`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `concert_cleanup_shared_dependency`, `plan_expired_concert_cleanup`, `delete_expired_concert` |
| `concert_image_ocr_results` | `record_concert_image_ocr`, `save_concert_program_analysis`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`, `protect_program_review_identity`; `concert_program_evidence_issue`, `program_candidate_snapshot_valid`, `program_confirmation_evidence_hash`, `program_auto_input_hash`, `decide_automatic_program_candidate`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `concert_cleanup_shared_dependency`, `delete_expired_concert` |
| `concert_image_ocr_attempts` | `record_concert_image_ocr`; `concert_program_evidence_issue`, `program_candidate_snapshot_valid`, `program_auto_input_hash`, `defer_automatic_program`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `concert_cleanup_shared_dependency`, `delete_expired_concert` |
| `concert_program_analyses` | `save_concert_program_analysis`, `_v3`, `_v4`, `save_concert_program_rematch`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`, `protect_program_review_identity`; `program_candidate_snapshot_valid`, `program_confirmation_evidence_hash`; `program_auto_input_hash`, `queue_automatic_programs`, `decide_automatic_program_candidate`, `finish_automatic_program`, `defer_automatic_program`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `concert_cleanup_shared_dependency`, `delete_expired_concert` |
| `concert_program_candidates` | `save_concert_program_analysis`, `save_concert_program_rematch`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`, `protect_program_review_identity`; `program_candidate_snapshot_valid`, `program_confirmation_evidence_hash`, `program_auto_input_hash`, `decide_automatic_program_candidate`, `finish_automatic_program`, `defer_automatic_program`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `delete_expired_concert` |
| `concert_program_reviews` | `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`, `decide_automatic_program_candidate`, `save_concert_program_rematch`; `concert_cleanup_counts`, `concert_cleanup_foreign_keys`, `delete_expired_concert` |
| `concert_program_catalogs` | `save_concert_program_analysis`, `save_concert_program_rematch`; `review_concert_program_candidate_identity`, `backfill_concert_program_review_identity`, `protect_program_review_identity`, `decide_automatic_program_candidate`; **`save_concert_program_text_analysis_v4`, `read_concert_program_text_candidate_status_v4`, `confirm_concert_program_text_candidate_v4`** |
| `concert_program_version_policy` | `save_concert_program_analysis_v3`, `save_concert_program_analysis_v4`, `save_concert_program_rematch`, `queue_automatic_programs`, `decide_automatic_program_candidate`; **`save_concert_program_text_analysis_v4`, `read_concert_program_text_candidate_status_v4`, `confirm_concert_program_text_candidate_v4`** |
| `concert_program_text_analyses`, `concert_program_text_candidates` | 각각 `save_concert_program_text_analysis_v4`, `read_concert_program_text_candidate_status_v4`, `confirm_concert_program_text_candidate_v4` |
| `concert_program_text_confirmations` | `confirm_concert_program_text_candidate_v4`; 별도로 불변성 trigger와 confirmation status view가 연결됨 |
| `concert_cleanup_events` | `delete_expired_concert`; 과거 deletion receipt를 읽고 추가함 |
| `concert_browser_cache` | 사용자 정의 함수 직접 참조 없음. 현재 Node 서버 REST가 직접 읽고 upsert하므로 “함수 참조0 = 미사용”의 반례 |

의존성의 중요한 전이는 다음과 같다.

- `save_concert_program_analysis_v3`/`_v4` → `save_concert_program_analysis` → `concert_program_evidence_issue` → OCR result/attempt/image/concert. wrapper의 직접 테이블이 analysis/policy뿐이어도 OCR 원시 자료 의존성은 사라지지 않는다.
- `queue_automatic_programs`/`finish_automatic_program`/`defer_automatic_program`/`decide_automatic_program_candidate` → `program_auto_input_hash` → OCR attempts/results와 analysis/candidate/image/concert → `program_identity_canonical`. 특히 queue/finish의 직접 참조에서 result/attempt가 빠져 있어도 호출 체인으로 연결된다.
- 수동 identity review·legacy backfill·자동 decide·`protect_program_review_identity` → `program_candidate_snapshot_valid` 또는 `program_confirmation_evidence_hash` → OCR raw result/attempt/analysis/candidate; work identity/hash 함수 → canonical/normalize 함수. review trigger 자체가 candidate의 OCR 분석과 catalog를 다시 확인한다.
- `save_concert_program_rematch` → `concert_program_evidence_issue`, `program_candidate_snapshot_valid`, `program_identity_canonical`; rematch가 원시 자료와 무관한 새로운 독립 연결을 만든다는 해석은 틀리다.
- text save/read/confirm → `program_identity_canonical`, confirm → `program_work_identity` → `program_identity_normalize` → canonical. 이 identity 함수군은 OCR와 공식 text가 함께 쓰므로 OCR와 이름이 관련되어 보여도 함께 제거하면 안 된다.
- cleanup plan/delete → `concert_cleanup_counts`, `_foreign_keys`, `_korean_date`, `_shared_dependency`, `_valid_dates`. 현재 서버는 호출하지 않지만 운영 DB에 남은 실행 가능한 삭제 RPC이므로 삭제 영향 조사 대상이다.

위 역사 수집/OCR/Program/text/cleanup 계열은 36개 함수로 정리된다. table 직접 참조 외 남은 함수에는 `set_concert_collection_updated_at`, `bump_program_concert_revision`, `bump_program_image_revision`, `prevent_program_text_confirmation_mutation`, `program_identity_canonical`, `program_identity_normalize`, `program_work_identity`, `program_work_identity_hash`, `concert_cleanup_korean_date`, `concert_cleanup_valid_dates`, 그리고 identity 검토 경로 사용을 강제하는 옛 `review_concert_program_candidate` 진입점이 포함된다. 이 옛 review 함수는 소스상 예외를 발생시키며 실제 결정 table을 바로 바꾸지 않는다. `table_text_references=[]`만 보고 모두 제거 가능한 helper로 분류하면 안 된다. [옛 review 진입점][identity], [공유 identity 정의][identity-helper]

현재 서비스의 사용자/공유/SNS 나머지 29개 함수도 OCR와 분리하여 다음처럼 연결된다.

| 현재 서비스 테이블 묶음 | 운영 직접 참조 함수와 간접 호출 |
| --- | --- |
| `user_track_reactions` | `merge_user_track_reactions`; 계정 삭제는 `delete_current_user_account` → `auth.users` → FK 연쇄. auth schema는 table_text_references의 public/private 목록에 없어 빈 목록으로 표시됨 |
| `user_music_journal` | `save_private_music_record`, `delete_private_music_record`, `publish_music_record`; 원본 삭제 → publication CASCADE → likes/comments CASCADE |
| `user_music_nicknames` | `publish_music_record`, `social_me`, `social_save_profile`, `atlas_private.ensure_profile` |
| `music_record_publications` | `list_my_music_shares`, `publish_music_record`, `withdraw_music_record`, `social_can_read`, `social_feed`, `social_publish_record`, `social_edit_post`, `social_report`; `social_withdraw` → `withdraw_music_record`, `social_publish_record` → `publish_music_record`; INSERT trigger `atlas_private.publication_profile` → `ensure_profile` |
| `social_tracks` | `atlas_private.publication_profile`가 등록곡 검사. publication trigger는 profile 생성에도 이어짐 |
| `music_social_profiles`, `atlas_private.social_accounts` | `ensure_profile`/`social_save_profile`/`social_me`/`social_profile`/`social_feed`/`social_follow`/`social_block` 및 `atlas_private.delete_profile`; `social_self_id` → accounts. `social_save_profile` → ensure_profile/social_me. accounts 삭제 → account_profile_cleanup trigger → profile 삭제 |
| `music_social_follows`, `music_social_blocks` | follows는 `social_can_read`, `social_profile`, `social_follow`, `social_block`; blocks는 `social_unblocked`, `social_block`. `social_can_read` → `social_unblocked`/`social_self_id`, unblocked → self_id |
| `music_social_likes`, `music_social_comments` | likes는 `social_feed`, `social_set_like`; comments는 `social_feed`, `social_comment`, `social_delete_comment`. 변경 → `atlas_private.require_profile` → `social_can_read`/`social_self_id` → 게시물·관계·차단·계정 매핑. 댓글 직접 SELECT와 embedded profile join은 별도 프런트 경로 |
| `atlas_private.social_reports` | `social_report` → `atlas_private.require_profile` → 게시물 권한; `atlas_private.purge_expired_social_reports` 삭제. profile/post 삭제 시 FK SET NULL로 snapshot은 남음 |
| 위 SNS profile/publication/follows/blocks/likes/comments 6개 | 각각 statement trigger → `atlas_private.social_invalidate` → 동적 `realtime.send`(설치된 경우). JSON의 called_custom_functions에는 public/private 외 동적 함수가 빠져 있으므로 빈 호출 목록이라고 트리거 효과가 없는 것은 아님 |

### 삭제 위험 대조 결과

1. **실제 FK 때문에 raw OCR만 독립 삭제하기 어렵다.** attempt.result_id → result와 analysis.ocr_result_id/source_attempt_id → result/attempt는 NO ACTION이다. FK를 넘어가려면 analysis/candidate/review 연결까지 영향을 검토해야 한다. image/concert 삭제는 여러 CASCADE를 통해 원시 OCR뿐 아니라 확정 이력까지 지울 수 있다.
2. **공유 catalog와 공식 text2건의 confirmation을 보존해야 한다.** 운영 FK에서 text analysis·confirmation → catalog는 NO ACTION이고, confirmation → text analysis/candidate/concert도 NO ACTION이다. catalog가 OCR와 text 양쪽에서 참조되는 사실과 append-only trigger 설치를 확인했다. 부모 공연이나 text analysis 삭제를 OCR 정리 범위에 포함하면 차단되거나, 규칙을 우회하는 추가 변경이 필요해진다.
3. **view dependency와 함수 문자열 의존성을 함께 보아야 한다.** DROP CASCADE는 명시적 view/FK를 제거할 수 있고, 문자열로 정의된 함수는 DB catalog dependency가 없어도 나중에 실행 시 실패할 수 있다. 함수 dependency 배열0과 scan통계만으로 제거 안전성을 증명할 수 없다. 이번에는 DROP 등 DDL을 실행하지 않았다.
4. **현재 서비스 자료 보호 경계가 코드·운영 FK 양쪽에서 일치한다.** 보관함/원본/공유/SNS→auth·profile 그래프와 과거 공연/OCR 그래프 사이 FK는 snapshot에 없다. `social_tracks`를 과거 Program catalog로 혼동하거나 publication/source_record CASCADE를 건드리면 현재 서비스 사용자 자료를 손상시킨다.
5. **정리할 Storage 파일은 이 snapshot에서 관측되지 않는다.** bucket/object0은 조사 시점 프로젝트 Storage 집계다. concert image URL이 외부 KOPIS 이미지를 가리키는 경로와 별개이고, 플랫폼 storage trigger11개를 OCR 잔재로 제거할 근거가 되지 않는다.

이 보충은 코드 분류와 실제 운영 객체 이름·참조·FK/trigger 존재를 연결한 결과다. 실제 함수/view 원문 동일성, 유효 확정 개수, 현재 호출 주체, Windows 예약 실행 경로는 부모의 추가 조사와 함께 판단한다. 어떤 삭제도 수행·승인하지 않았으며, snapshot 원본은 Git 제외 상태로 보존하고 이 집계·해석만 문서화했다.

[service]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/concertSearchService.mjs#L1-L3
[api]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/api.mjs#L9-L18
[cache]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/concertCache.mjs#L8-L47
[kopis-cache]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/kopis.mjs#L7-L43
[package]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/package.json#L9-L18
[tests]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/scripts/test.mjs#L1-L28
[browser-doc]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/docs/CONCERT_BROWSER.md#L18-L26
[app-routes]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/App.jsx#L682-L694
[app-track]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/App.jsx#L121-L123
[social-tab]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/components/MusicSocial.jsx#L159
[concert-client]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/data/concertSearch.js#L4-L38
[entry]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/api/index.js#L1-L8
[vercel-handler]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/vercel.mjs#L1-L10
[library]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/data/userLibrary.js#L69-L76
[journal-client]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/data/musicJournal.js#L25-L53
[sharing-client]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/data/musicSharing.js#L20-L58
[social-client]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/data/socialClient.js#L27-L59
[account-client]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/src/components/useGoogleAuth.js#L81-L90
[cache-ddl]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610300001_concert_browser_cache.sql#L1-L16
[account-sql]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611020002_user_account_security.sql#L1-L113
[journal-sql]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611020003_private_music_journal.sql#L4-L91
[sharing-sql]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611020004_music_record_sharing.sql#L4-L109
[social-ddl]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060001_music_social.sql#L4-L81
[social-read]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060001_music_social.sql#L88-L161
[social-profile]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060001_music_social.sql#L162-L194
[social-write]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060001_music_social.sql#L195-L246
[social-triggers]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060001_music_social.sql#L240-L279
[social-catalog]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202611060002_social_track_catalog.sql#L1-L2
[collect]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610140001_concert_collection.sql#L3-L111
[collect-text]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610230002_kopis_detail_text.sql#L4-L98
[ocr]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610140002_concert_image_ocr.sql#L5-L109
[analysis-ddl]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610150001_concert_program_analysis.sql#L5-L93
[cleanup]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610160001_expired_concert_cleanup.sql#L5-L189
[identity]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610210001_program_work_identity.sql#L53-L250
[identity-helper]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610210001_program_work_identity.sql#L5-L51
[v3-draft]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql#L1-L122
[draft-readme]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/drafts/README.md#L1-L5
[v4]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610230003_program_analysis_v4.sql#L1-L80
[automation]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610220001_program_automation.sql#L1-L169
[automation-evidence]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610220001_program_automation.sql#L170-L207
[automation-view]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610220001_program_automation.sql#L209-L240
[text-save]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610260001_program_text_analysis_v4.sql#L12-L188
[text-status]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610260002_program_text_status.sql#L5-L105
[text-confirm]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610260003_program_text_confirmation.sql#L4-L149
[text-confirm-status]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610260004_program_text_confirmation_status.sql#L3-L95
[text-acl]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610270001_program_text_analysis_acl.sql#L1-L12
[text-read]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/migrations/202610270002_program_text_candidate_status_read.sql#L1-L120
[bounded]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/drafts/202610230001_program_automation_bounded.sql#L1-L198
[kopis-data]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/server/kopisData.mjs#L39-L63
[vercel-config]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/vercel.json#L1-L70
[pipeline-doc]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/docs/LOCAL_PIPELINE.md#L112-L128
[cron-plan]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/docs/MUSIC_SOCIAL_STAGING.md#L194-L231
[ocr-verify]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/verification/concert_image_ocr.sql#L1-L21
[program-verify]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/verification/concert_program_analysis.sql#L1-L27
[diagnostic]: https://github.com/MattewShin/sound-atlas/blob/2552f5b021238b65a8c4d2e235a342b12e498cde/supabase/diagnostics/20261022_program_automation_preflight.sql#L1-L60
