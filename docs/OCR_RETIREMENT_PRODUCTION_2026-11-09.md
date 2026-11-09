# OCR 영구 폐기 운영 결과 — 2026-11-09

CA-OCR-RETIRE-20261109-001 / **명세2 · IMPLEMENTED**. 사용자의 명시적 운영 승인으로 PR #22를 Ready로 전환·병합하고 Vercel 운영 배포, 새 논리 백업 검증, 승인된 migration 한 파일 적용과 실제 API/화면 확인을 마쳤다. 구현자가 작성한 결과이며 검토 상태 ACCEPTED를 뜻하지 않는다. [기계 판독 증거](OCR_RETIREMENT_PRODUCTION_VERIFICATION_2026-11-09.json), [HANDOFF](../HANDOFF.md), [명세1 준비 자료](OCR_RETIREMENT.md)를 구분한다.

## 기준과 시각

| 항목 | 확인 결과 |
| --- | --- |
| PR | [#22](https://github.com/MattewShin/sound-atlas/pull/22), Ready 전환 후 merged, 2026-11-09 16:19:40 KST |
| 승인 HEAD | `f90e6b77dcaf29d72982600033ad6e71377f5b9a` |
| 승인 기능·migration SHA | `e8e204e31d0bf5c401fec2e12641c8183a0fb219` |
| 적용 전 main / 실제 production | `2552f5b021238b65a8c4d2e235a342b12e498cde`, 서로 일치 |
| 최종 main / 운영 배포 SHA | **`52869c77338d7d343ca7ce204c67d3a466b6da3c`** |
| Vercel deployment | `dpl_66uJ7dDatRkryksXWA1YwewgrU7J` / production **READY** |
| 운영 앱 | https://sound-atlas.vercel.app |
| 최초 READ ONLY gate | 2026-11-09 16:18:56 KST, schema/행 수/누적 앱 쓰기 통계의 승인 감사 대비 차이 없음 |
| 새 백업 완료 | 2026-11-09 16:28:10 KST |
| 직전 READ ONLY preflight | 2026-11-09 16:30:11 KST PASS; 백업 이후 앱·Auth 사용자 지문/행 수 동일 |
| migration 시작 / COMMIT 확인 | 2026-11-09 16:30:20 / 2026-11-09 16:30:20 KST |
| postflight / 최종 읽기 확인 | 2026-11-09 16:30:22 / 2026-11-09 16:35:57 KST PASS |

원격 main과 실제 Vercel alias의 SHA를 다시 확인했다. merged main의 tree는 승인 HEAD tree와 일치하며 기능 수정이 없다. 결과 문서는 `codex/ca-ocr-retire-20261109-001-production`의 별도 문서 커밋으로 게시한다. 배포된 main과 결과 문서 브랜치를 혼동하지 않는다. main에 들어간 명세1 문서의 “운영 미실행” 문구는 준비 당시 기록이다. 명세2 최신 상태는 이 브랜치의 CURRENT_TASK/HANDOFF와 본 보고서다.

## 적용 방법과 중단 조건

[승인 preflight](../supabase/retirement/ocr-20261109-preflight.sql) → [202611090001_retire_ocr.sql](../supabase/migrations/202611090001_retire_ocr.sql) **한 파일** → [postflight](../supabase/retirement/ocr-20261109-postflight.sql) → `NOTIFY pgrst, 'reload schema'` → 실제 PostgREST 순서로 실행했다. 예전 migration 전체 push나 cleanup RPC 호출은 하지 않았다. migration SHA-256은 `07458a1ae0a7a1017c85dd5e36e90c3a38754921085a9642b4703c9b3da5f27b`이며 승인 기능 SHA의 파일과 byte 단위 일치한다.

SQL 자체의 BEGIN/COMMIT 경계를 유지했고 COMMIT 응답을 확인했다. 새 의존성/정의 차이가 없었고 실패·에러 무시·재실행·CASCADE·TRUNCATE·예상 밖 객체 삭제·운영 restore는 없었다. pre/postflight는 READ ONLY다. 논리 백업 전후 및 적용 직전 row 지문을 DB 내부에서 계산하고 개수/지문만 비교했으며 본문은 출력하지 않았다.

대상5개 ACCESS EXCLUSIVE NOWAIT, 그 외 lock_timeout 3초·statement_timeout 30초 계약을 그대로 사용했다. 이번 관측에서 lock/timeout 오류가 없고 시작과 COMMIT은 같은 KST 초에 기록됐다. 배포 직후와 migration 직후 앱 smoke는 성공했다. 연속 트래픽/동시 session 지연을 측정하지 않아 전체 구간의 무중단을 보장하지 않는다.

## 전후 운영 구조와 삭제 결과

집계 범위는 `public`과 `atlas_private`의 앱 객체이며 Supabase 전체 내부 schema 집계가 아니다. trigger는 비내부 앱 trigger다. 최종 catalog 조회로 각 삭제 이름의 부재도 별도 확인했다.

| 객체 | 적용 전 | 적용 후 | 제거 |
| --- | ---: | ---: | ---: |
| 테이블 | 26 | 21 | 5 |
| View | 4 | 3 | 1 |
| 함수/RPC | 65 | 43 | 22 |
| FK | 38 | 27 | 11 |
| 앱 Trigger | 15 | 14 | 1 |
| 공식 text 유효 확정 | 2 | 2 | 0 |

삭제 테이블과 행 수: attempts72, results60, analyses114, candidates290, reviews65, 합계601행. OCR 확정3건을 포함한 전체 이력을 삭제했으며 새 보존 테이블로 이전하지 않았다. 감사 당시 relation 할당량은 합계3,792,896 bytes(3.62 MiB)였고 실제 cloud 과금/WAL/백업 포함 회수량은 측정하지 않았다.

`public` 테이블5개:

```text
concert_image_ocr_attempts
concert_image_ocr_results
concert_program_analyses
concert_program_candidates
concert_program_reviews
```

View `public.concert_program_candidate_status`, Trigger `public.concert_program_reviews.program_review_identity_immutable`도 제거됐다.

함수/RPC22개(전부 public, 정확한 signature는 [동일 manifest](../supabase/retirement/ocr-20261109-manifest.json)):

```text
backfill_concert_program_review_identity
concert_cleanup_counts
concert_cleanup_foreign_keys
concert_cleanup_shared_dependency
concert_program_evidence_issue
decide_automatic_program_candidate
defer_automatic_program
delete_expired_concert
finish_automatic_program
plan_expired_concert_cleanup
program_auto_input_hash
program_candidate_snapshot_valid
program_confirmation_evidence_hash
protect_program_review_identity
queue_automatic_programs
record_concert_image_ocr
review_concert_program_candidate
review_concert_program_candidate_identity
save_concert_program_analysis
save_concert_program_analysis_v3
save_concert_program_analysis_v4
save_concert_program_rematch
```

FK11개(모두 제거 테이블 소유):

```text
concert_image_ocr_attempts_image_id_fkey
concert_image_ocr_attempts_result_id_fkey
concert_image_ocr_results_image_id_fkey
concert_program_analyses_catalog_hash_fkey
concert_program_analyses_concert_id_fkey
concert_program_analyses_image_id_fkey
concert_program_analyses_ocr_result_id_fkey
concert_program_analyses_source_attempt_id_fkey
concert_program_candidates_analysis_id_fkey
concert_program_candidates_matching_catalog_hash_fkey
concert_program_reviews_candidate_id_fkey
```

## 유지 데이터·권한 검증

적용 직전/직후와 앱 읽기 후 최종 시점 모두 유지21개 테이블의 행 수와 정렬된 전체 행 SHA-256 지문이 일치했다. `auth.users`도 개수·지문이 같다. 사용자 ID/본문/개별 행 지문을 공개 문서에 담지 않았다. 유지 함수43개 정의/ACL, View3개 정의/ACL, FK27개, 앱 trigger14개, RLS 정책과 테이블 권한도 동일하다. 공식 text 유효 확정2건은 SQL status와 실제 PostgREST에서 확인했다.

| 유지 테이블 | 적용 직전 행 | 적용 후 행 | 전체 행 지문 |
| --- | ---: | ---: | --- |
| `atlas_private.social_accounts` | 1 | 1 | 일치 |
| `atlas_private.social_reports` | 0 | 0 | 일치 |
| `public.concert_browser_cache` | 9 | 9 | 일치 |
| `public.concert_cleanup_events` | 71 | 71 | 일치 |
| `public.concert_program_catalogs` | 4 | 4 | 일치 |
| `public.concert_program_images` | 119 | 119 | 일치 |
| `public.concert_program_text_analyses` | 1 | 1 | 일치 |
| `public.concert_program_text_candidates` | 18 | 18 | 일치 |
| `public.concert_program_text_confirmations` | 2 | 2 | 일치 |
| `public.concert_program_version_policy` | 1 | 1 | 일치 |
| `public.concerts` | 49 | 49 | 일치 |
| `public.music_record_publications` | 1 | 1 | 일치 |
| `public.music_social_blocks` | 0 | 0 | 일치 |
| `public.music_social_comments` | 0 | 0 | 일치 |
| `public.music_social_follows` | 0 | 0 | 일치 |
| `public.music_social_likes` | 0 | 0 | 일치 |
| `public.music_social_profiles` | 1 | 1 | 일치 |
| `public.social_tracks` | 291 | 291 | 일치 |
| `public.user_music_journal` | 1 | 1 | 일치 |
| `public.user_music_nicknames` | 1 | 1 | 일치 |
| `public.user_track_reactions` | 7 | 7 | 일치 |

운영 배포 직후 승인된 “공연 조회”를 실제 요청하면서 기존 `concert_browser_cache`가 **8→9행**으로 정상 채워졌다. 이 변화는 백업과 migration **이전**에 분리 확인했고, 다른 앱/계정 데이터는 최초 gate와 같았다. 따라서 migration 보존 비교는 **9→9행** 기준이다. 공연 API의 총291/반환20은 응답의 `total`/배열 길이이며 `public.concerts`의49행과 다른 수치다. 사용자 기록의 시험 수정·공개·삭제는0회다.

공유 identity4개(`program_identity_canonical`, `program_identity_normalize`, `program_work_identity`, `program_work_identity_hash`), 공식 text 저장/조회/확정3개, status View3개, confirmation 불변 trigger, `sync_kopis_concert`, 수집 revision/updated_at 및 순수 date helper를 유지했다. concerts/images/catalogs/version policy/text3개/cleanup events/cache와 보관함·개인 기록·닉네임·공유·SNS 계정/프로필/차단/팔로우/댓글/좋아요/신고가 보존됐다. SNS 권한 함수·정책·invalidation trigger를 변경하지 않았다. Realtime publication·Auth 설정을 변경하는 SQL도 없다.

## 실제 PostgREST와 운영 화면

- schema reload NOTIFY 후 실제 서비스 키 권한 OpenAPI에서 삭제 테이블5·View1·RPC22 경로 부재를 확인했다. 본문을 보관/출력하지 않았다.
- 실제 REST에서 테이블5개 각각 `select=id&limit=0` 요청이 **404 / PGRST205**. 유지 공식 text/공연/cache/KOPIS 관련12개 경로는 남아 있고 effective confirmation 응답2행을 확인했다. DB와 REST 대상의 일치도 검증했다. 쓰기 RPC를 호출하지 않았다.
- 격리된 익명 Chromium 새 context에서 **배포 직후와 migration 후** 기본 홈·공연 찾기/조회·보관함·음악 이야기 진입 PASS. 공연 API200, 응답 total291/returned20/stale=false. 실제 `social_feed` 읽기200, 화면 오류0, 금지 쓰기 요청0. 로그인된 보관함 내용 검증으로 해석하지 않는다.
- 기존 승인 코드의 전체162/162·SNS5/5·폐기15/15·production build PASS 로그와 SHA를 확인했다. e8e204e→승인 f90e6b7은 기능 파일 차이0, merged tree도 동일하다. 변경 없는 전체 테스트/build를 다시 실행하지 않았다. 이전 500 kB chunk 경고는 당시 build의 알려진 경고다.

## 새 전체 논리 백업 근거와 복구 한계

- 완료: **2026-11-09 16:28:10 KST**, PostgreSQL custom archive, **1,558,953 bytes**. client `pg_dump (PostgreSQL) 18.6`.
- SHA-256: **`1fbeb302b6786f730a6c28e74f5e9b6281f932dfaa090230ab57e167d14bbaec`**. migration 직전 다시 일치 확인.
- pg_dump exit0, pg_restore --list exit0, 전체 SQL decode를 NUL로 보내는 검사 exit0. decode는 DB 연결/restore가 아니다. stderr 오류 없음.
- 전체 TOC **1,041개**, OCR-only TOC **95개**. TABLE5/DATA5/FUNCTION22/VIEW1/TRIGGER1/FK11/ROW SECURITY5/secondary INDEX5/PK·UNIQUE8/function ACL22/relation ACL6을 검증했다.
- archive·원본 TOC·원본 로그·비공개 snapshot은 현재 사용자와 SYSTEM만 접근하는 Git 제외 로컬 보안 폴더에 있다. Git/PR/공개 Storage에 업로드하지 않았다. 실제 경로는 로컬 `.cache/ocr-retire-production-ops/backup-location.private.json`에서 확인한다. 증거 JSON에는 안전한 종료 코드/개수/checksum만 옮겼다.
- 이 백업은 DB 논리 백업이다. global role, Storage binary, OAuth/provider 설정은 pg_dump 범위 밖이다. 이번 새 archive의 **실제 격리 restore는 미실행**이며 복원 성공까지 검증했다고 표현하지 않는다. 운영 DB 전체 restore도 수행하지 않았다.

COMMIT 전 실패는 단일 transaction rollback 계약이다. 이미 성공 COMMIT된 현재 상태에는 자동 down이 없다. 장애 시 기존 사용자 데이터를 이전 시점으로 덮어쓰지 않고 영향 범위부터 조사한다. OCR graph 복구가 필요한 예외에는 최신 archive의 검증된 OCR-only TOC만 별도 격리 환경에서 먼저 복원·권한 확인한 뒤 운영 대응을 승인받는다. 전체 DB restore, --clean/--create/에러 무시로 우회하지 않는다. 구체적 제한/선별 복구 명령은 [명세1 복구 절차](OCR_RETIREMENT.md#rollback장애-대응)를 따른다. 이 문서의 링크는 실행 승인이 아니며 이번에 복구 명령을 실행하지 않았다. 임시 백업의 보관 기간/삭제는 별도 운영 정책으로 정하며 이번 작업에서 파일을 삭제하지 않았다.

## 예약·frozen release·로컬 모델

Windows `ClassicAtlas-LocalPipeline`은 **Disabled / Enabled=false** 유지, 마지막 실행2026-10-29 08:40 KST/결과0으로 동일하다. task/launcher를 실행·변경하거나 재활성화하지 않았다. frozen SHA `1db327cd38dfce778da543738f975b70789aed66`의 파일320개 hash가 전부 동일하다. launcher의 OCR/analysis/cleanup=false, collection/official text=true를 정적으로 읽기 확인했다. 향후 공식 text 예약은 별도 검토한 새 text-only CLI로 retarget해야 하며 옛 target을 켜지 않는다. Vercel crons0이며 실제 환경변수 삭제/수정은 이번에 하지 않았다.

운영 성공 후에도 로컬 모델2개를 **삭제하지 않았다**. `.cache/easyocr/models/craft_mlt_25k.pth`83,152,330 bytes와 `korean_g2.pth`16,081,533 bytes, 합계99,233,863 bytes(94.64 MiB) 보존을 재확인했다. 현재 main은 인식 코드/의존성이 제거됐지만 원래 IDE WIP·옛 release도 보존 중이므로 파일 삭제는 별도 로컬 정리로 남긴다. [선택적 파일별 정리 명령](OCR_RETIREMENT.md#로컬-모델--이번-삭제-제외)은 준비 자료이며 미실행이다.

## 미검증·후속 검토

실제 Google OAuth 로그인/계정 전환·로그인 사용자 보관함/기록 화면 전체, 모바일 전체/실기기 IME, 실 Realtime 다중 창의 범위 변경/차단/재연결, 동시 DDL lock 지연·연속 트래픽 가용성, 새 archive 실복원, 타 PC/외부 수동 OCR 호출은 이번에 검증하지 않았다. 앞 세 가지와 Docker/새 Supabase 프로젝트 구성은 요청에서 제외했다. 사용자 데이터는 테스트에 수정하지 않았다. 운영 성공은 이번 객체/보존/읽기 검증 범위로 한정한다.

이번 최종 결과 커밋은 문서와 안전한 증거 JSON뿐이며 기능·migration 추가 수정이 없다. 원래 IDE branch/HEAD/미커밋 변경과 실제 .env는 보존한다. 검토자는 운영 성공 근거, 백업 실복원 미검증 및 향후 임시 백업 보관/모델 정리/공식 text task retarget을 확인하면 된다.
