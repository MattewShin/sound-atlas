# OCR 제거 후 DB 정리 범위 조사

- 작업: **CA-OCR-DB-AUDIT-20261109-001 / 명세 1 / IMPLEMENTED(조사 완료, 검토 전)**
- 조사일: 2026-11-09, Asia/Seoul. 테이블 집계 09:41:25, 확정 연결 집계 09:44:21 KST.
- 코드 기준: `main` / **2552f5b021238b65a8c4d2e235a342b12e498cde**. Vercel 실제 production 배포 SHA도 동일하고 READY임을 GET으로 확인했다.
- 결과 브랜치: `codex/ocr-db-audit-20261109`. 이 문서의 코드 근거는 위 고정 SHA이며, 조사 문서 저장 커밋과 구분한다.
- 상세 근거: [테이블별 읽기·쓰기 코드와 SQL 의존성](OCR_DB_CODE_AUDIT_2026-11-09.md), [운영 집계·카탈로그 증거 JSON](OCR_DB_AUDIT_METADATA_2026-11-09.json).

## 판단

**OCR 전용 미사용 테이블은 5개, 인덱스·TOAST 포함 3,792,896 bytes(3.62 MiB)다. 모두 조건부 삭제 후보이며, 지금 독립적으로 제거해도 안전하다고 확정한 DB 용량은 0이다.** 유효한 OCR 확정 공연↔곡 연결 3건이 이 테이블들의 원시 자료·분석·review에 의존한다. 그 연결을 보존하려면 현 그래프를 유지하거나 별도 보존 모델을 먼저 구현해야 한다.

현재 공연 서비스는 KOPIS와 `concert_browser_cache`를 사용하며 과거 OCR/곡 매칭 테이블을 읽지 않는다. 따라서 “현재 화면에서 사용 중인 OCR 연결”은 확인되지 않았다. 반면 **DB의 확정 유효성 판단은 OCR 3건, 공식 Program text 2건 모두 true**다. 화면에서 안 보인다는 이유로 확정 이력을 폐기 대상으로 삼지 않았다.

`concerts`, 이미지 메타데이터, catalog, version policy, 공식 text 3개 테이블과 수집 삭제 영수증은 유지 대상이다. 현재 사용자 보관함·개인 원본·공유본·SNS 및 브라우저 캐시는 OCR 정리 대상에서 제외한다. 실제 개인 기록이나 공유본의 본문은 읽거나 출력하지 않았다.

## 조사 방법과 한계

운영 DB에는 인증서를 검증하는 TLS로 접속하여 명시적 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` 안에서 카탈로그와 집계만 SELECT했다. 각 transaction의 `transaction_read_only=on`을 확인했다. 첫 snapshot의 `default_transaction_read_only=off`와 구분하며, 계정/DB 기본 설정을 바꾸지 않았다. 두 번의 집계는 서로 다른 읽기 전용 snapshot이므로 사용 중인 테이블의 행 수는 이후 달라질 수 있다.

`COUNT(*)`는 추정치가 아닌 실제 행 수다. 크기는 `pg_table_size`(heap·TOAST·관리 페이지 포함), `pg_indexes_size`, `pg_total_relation_size`를 사용했다. partition/materialized table은 앱 목록에 없으며 26개 모두 일반 테이블이어서 합산 중복은 없다. 행의 제목·본문·메모·OCR 원문·실제 이미지 URL·Auth UUID·DB 접속정보·키·토큰은 보고서/증거 파일에 포함하지 않는다. Storage도 object 이름/owner/경로를 출력하지 않고 bucket/object 수와 용량 집계만 조회했다.

함수 정의는 메모리에서 테이블/함수 이름 참조만 추출하고 정의 원문은 저장하지 않았다. 사용자 정의 함수 65개와 trigger/view/FK를 코드와 대조했지만 **운영 함수/view 본문이 파일과 byte 단위로 같다는 검증은 수행하지 않았다.** PL/pgSQL 문자열 본문 의존성은 `pg_depend`에 모두 나오지 않으므로 직접 이름 참조·함수 호출 체인·trigger·FK를 함께 확인했다. 단어 검색의 INSERT/DELETE 등은 주석·row lock에도 나타날 수 있어 실제 쓰기 판정은 소스와 함께 했다.

누적 접근 통계 reset은 2026-10-03 02:54:14 KST다. 누적 scan/쓰기 횟수로 최근 호출 주체나 현재 미사용을 증명하지 않는다. 이번 COUNT도 읽기 통계에 반영될 수 있다. “미사용”은 현재 배포 코드의 도달 경로와 확인한 예약 작업 상태를 기준으로 한다. 다른 PC·외부 업체·수동 SQL 호출의 부재까지 증명하지는 못했다.

## 테이블 전체 분류·행 수·크기

① OCR 전용이며 현재 서비스/활성 예약에서 사용하지 않음: 5개. ② 공연 수집 또는 공식 Program text와 공유/독립 처리: 8개. ③ 현재 서비스 사용: 13개. ④ 용도 확인 필요: **발견된 앱 테이블 중 0개**. 다만 cleanup 영수증의 보존 기간, 확정 자료의 장기 보존 형태와 외부 수동 호출자는 미결정 사항이다.

②는 모두 OCR 전용이 아니라는 분류다. `concert_program_text_*`는 공식 text 전용이며, 현재 웹 화면에서 사용 중이라는 뜻은 아니다. `concert_program_images`는 수집 원본의 이미지 URL/상태 메타데이터이고 이미지 바이너리가 아니다. `concert_cleanup_events`는 과거 수집 자료 삭제의 감사·멱등 영수증이다.

모든 크기 단위는 bytes다. 총 크기는 앞의 두 크기를 합한 값이다.

| 테이블 | 분류 | 행 수 | 테이블·TOAST | 인덱스 | 전체 |
| --- | --- | ---: | ---: | ---: | ---: |
| `atlas_private.social_accounts` | ③ 현재 서비스 | 1 | 8,192 | 32,768 | 40,960 |
| `atlas_private.social_reports` | ③ 현재 서비스 | 0 | 16,384 | 16,384 | 32,768 |
| `public.concert_browser_cache` | ③ 현재 서비스 | 8 | 229,376 | 16,384 | 245,760 |
| `public.concert_cleanup_events` | ② 수집·Program text | 71 | 73,728 | 16,384 | 90,112 |
| `public.concert_image_ocr_attempts` | ① OCR 전용 | 72 | 65,536 | 49,152 | 114,688 |
| `public.concert_image_ocr_results` | ① OCR 전용 | 60 | 671,744 | 57,344 | 729,088 |
| `public.concert_program_analyses` | ① OCR 전용 | 114 | 1,507,328 | 131,072 | 1,638,400 |
| `public.concert_program_candidates` | ① OCR 전용 | 290 | 1,048,576 | 155,648 | 1,204,224 |
| `public.concert_program_catalogs` | ② 수집·Program text | 4 | 122,880 | 16,384 | 139,264 |
| `public.concert_program_images` | ② 수집·Program text | 119 | 73,728 | 65,536 | 139,264 |
| `public.concert_program_reviews` | ① OCR 전용 | 65 | 90,112 | 16,384 | 106,496 |
| `public.concert_program_text_analyses` | ② 수집·Program text | 1 | 114,688 | 49,152 | 163,840 |
| `public.concert_program_text_candidates` | ② 수집·Program text | 18 | 98,304 | 49,152 | 147,456 |
| `public.concert_program_text_confirmations` | ② 수집·Program text | 2 | 16,384 | 32,768 | 49,152 |
| `public.concert_program_version_policy` | ② 수집·Program text | 1 | 16,384 | 16,384 | 32,768 |
| `public.concerts` | ② 수집·Program text | 49 | 81,920 | 65,536 | 147,456 |
| `public.music_record_publications` | ③ 현재 서비스 | 1 | 16,384 | 81,920 | 98,304 |
| `public.music_social_blocks` | ③ 현재 서비스 | 0 | 8,192 | 32,768 | 40,960 |
| `public.music_social_comments` | ③ 현재 서비스 | 0 | 16,384 | 32,768 | 49,152 |
| `public.music_social_follows` | ③ 현재 서비스 | 0 | 8,192 | 32,768 | 40,960 |
| `public.music_social_likes` | ③ 현재 서비스 | 0 | 8,192 | 16,384 | 24,576 |
| `public.music_social_profiles` | ③ 현재 서비스 | 1 | 16,384 | 32,768 | 49,152 |
| `public.social_tracks` | ③ 현재 서비스 | 291 | 65,536 | 40,960 | 106,496 |
| `public.user_music_journal` | ③ 현재 서비스 | 1 | 16,384 | 32,768 | 49,152 |
| `public.user_music_nicknames` | ③ 현재 서비스 | 1 | 16,384 | 32,768 | 49,152 |
| `public.user_track_reactions` | ③ 현재 서비스 | 7 | 49,152 | 16,384 | 65,536 |

앱 26개 합계 **5,595,136 bytes(5.34 MiB)**. 이 중 ② 유지 대상은 909,312 bytes(888 KiB), ③ 현재 서비스는 892,928 bytes(872 KiB)다. 전체 DB `pg_database_size`는 18,446,003 bytes(17.59 MiB)이며 시스템 catalog·확장·플랫폼 schema 등의 공간도 포함하므로 앱 합계와 같지 않다.

`auth`(27 relations, 1,490,944 bytes), `storage`(10, 344,064 bytes), `realtime`(7, 229,376 bytes), `vault`(1, 24,576 bytes)는 Supabase 관리 schema다. 이 값은 해당 schema의 일반 relation 합계이며 schema 전체의 모든 객체 크기를 뜻하지 않는다. **OCR 제거 후보로 분류하지 않았다.** 특히 빈 Storage의 플랫폼 메타데이터·trigger를 OCR 잔재로 제거할 근거가 없다.

## 읽기·쓰기 및 삭제 영향

테이블별 현 서비스 경로·R/I/U/D·소스 줄 링크와 65개 함수의 테이블 참조/간접 호출은 [코드 감사 문서](OCR_DB_CODE_AUDIT_2026-11-09.md)에 있다. 실제 FK 38개, 앱 trigger 15개, view 4개/직접 relation 의존성 20개는 [증거 JSON](OCR_DB_AUDIT_METADATA_2026-11-09.json)의 `constraints`, `triggers`, `view_dependencies`, `functions`에서 확인할 수 있다.

| 과거 수집/OCR/Program 테이블 | 읽기·쓰기 경로와 삭제 영향 |
| --- | --- |
| `concert_image_ocr_results` | 과거 `supabaseOcr`/pipeline의 읽기, `record_concert_image_ocr`의 추가. attempt.result_id와 analysis.ocr_result_id가 **NO ACTION FK**로 참조. raw text/detections를 지우면 현재 증거 hash·확정 재검증을 잃으며 독립 삭제가 막힐 수 있음 |
| `concert_image_ocr_attempts` | 과거 OCR 완료/실패 시도 추가·최신 상태 읽기, 동일 RPC. analysis.source_attempt_id는 **NO ACTION**. 성공/실패·최신 시도 선택이 확정 유효성에 관여하므로 단순 로그로 취급하지 않음 |
| `concert_program_analyses` | 과거 save/v3/v4/rematch, 자동 queue/decide/finish/defer와 status view. result·attempt·catalog NO ACTION, concert/image CASCADE. 삭제하면 candidates → reviews가 CASCADE되어 확정 이력 소실 |
| `concert_program_candidates` | 과거 분석 저장·재매칭 추가, 수동/자동 review 갱신, status 조회. 부모 analysis CASCADE, matching catalog NO ACTION. 삭제하면 reviews CASCADE. rematch_source_candidate_id는 FK가 아닌 추적 참조이며 현재 non-null 0행 |
| `concert_program_reviews` | 수동 review/identity backfill/자동 decide와 status 조회. candidate CASCADE. identity 불변 trigger는 INSERT/UPDATE 검사이고 DELETE 보장은 아님. 확정3/거절62를 포함하므로 65행 전체를 실행 로그로 폐기하면 안 됨 |
| `concert_program_images` | 과거 수집 sync가 URL·활성 상태를 추가/갱신하고 OCR/Program이 읽음. concert CASCADE, image 아래 result/attempt/analysis CASCADE. 이미지 메타데이터 삭제로 원시 OCR·분석·후보·review가 함께 영향 받음. 독립 OCR image Storage가 아님 |
| `concerts` | 과거 수집 sync, 공식 text coordinator와 두 계열 status가 읽음. 이미지/OCR 분석/text 분석에 CASCADE 부모지만 text confirmation의 NO ACTION FK가 있음. 공식 text 원문·hash·revision 맥락을 유지해야 2건의 유효 확정 보존 가능 |
| `concert_program_catalogs` | OCR 및 text save가 저장·읽고 identity/rematch/확정 검증이 읽음. OCR analysis/matching catalog, text analysis/confirmation이 NO ACTION으로 참조. OCR만의 사전이 아니므로 유지 |
| `concert_program_version_policy` | OCR save/queue와 text save/read/confirm 및 status가 읽음. 현재 `stored-program-4=true` 1행. FK가 없어도 정책 삭제/변경으로 공식 text 확정이 무효가 될 수 있음. OCR 옛 버전 행이 없어도 유효 OCR3건이 존재하므로 단순 버전명으로 보존 판단 금지 |
| `concert_program_text_analyses` | 공식 text save/read/confirm·status. 공연 CASCADE, catalog NO ACTION; text candidate의 부모, confirmation의 NO ACTION 참조 대상. OCR raw 자료 삭제와 별개이나 부모 공연/catalog를 같이 지우면 영향 |
| `concert_program_text_candidates` | 공식 text save 추가·bounded read·confirm/status 읽기. analysis CASCADE지만 confirmation의 NO ACTION 참조가 삭제를 막음. OCR candidate와 별개 |
| `concert_program_text_confirmations` | confirm RPC 추가·status 읽기. 공연/analysis/candidate/catalog 모두 NO ACTION FK. UPDATE/DELETE 및 statement TRUNCATE를 금지하는 trigger가 실제 설치됨. 유지 |
| `concert_cleanup_events` | `delete_expired_concert`가 삭제 영수증을 읽고 추가. concert_id는 삭제 뒤 영수증을 남기기 위해 FK가 아님. 삭제 시 과거 삭제 감사와 operation 재시도 멱등 정보 소실. 보존 기간을 정하기 전 유지 |

현재 서비스 13개는 모두 유지한다. `concert_browser_cache`는 공연 API의 직접 REST 읽기/upsert, `user_track_reactions`는 보관함 RPC, `user_music_journal`은 개인 기록 읽기·저장·삭제, `user_music_nicknames`는 공유/프로필 내부 읽기·생성에 사용된다. `music_record_publications`는 원본·프로필·계정 FK와 공유/범위/취소 RPC에 연결된다. `social_tracks`는 게시물 등록곡 검증, `music_social_profiles`와 `atlas_private.social_accounts`는 공개 프로필/로그인 매핑, follows/blocks는 권한, likes/comments는 반응·댓글, `atlas_private.social_reports`는 운영 신고·만료 정리에 사용된다. **0행인 댓글/좋아요/차단/신고도 기능 테이블이므로 삭제 후보가 아니다.** 개별 R/I/U/D와 FK 삭제 정책은 [26개 코드 표 및 SNS 함수 표](OCR_DB_CODE_AUDIT_2026-11-09.md)에 구분했다. 사용자 계정/개인 원본/공유본 삭제는 이번 조사에서 실행하지 않았다.

### view·RPC·trigger·기존 cleanup 주의점

- `concert_program_candidate_status`는 OCR candidate/analysis/review/image/concert/policy와 evidence helper를 사용한다. raw result/attempt는 함수 경유의 간접 의존도 있으므로 view의 직접 FK/`pg_depend`만으로 안전성을 판단하면 안 된다.
- text의 analysis/candidate/confirmation status 3개 view는 공식 text·공연·catalog·policy·공유 identity 함수를 사용한다. `program_identity_canonical`, `program_identity_normalize`, `program_work_identity`, `program_work_identity_hash`는 **양쪽 공유 helper**다. OCR 함수와 이름이 비슷하다는 이유로 제거하면 text 처리도 깨진다.
- OCR 전용 함수의 제거 후보 범위는 record/save/rematch/review/backfill/automatic/evidence 함수군이다. 현재 살아 있는 table·view·trigger·text helper에서의 호출을 끊는 후속 설계가 필요하며 이번에 함수 삭제 목록을 실행하거나 확정하지 않았다.
- `concerts`와 images의 updated_at/revision trigger는 공식 source 맥락/수집 무효화와도 연관된다. review identity trigger는 OCR graph 전용, text confirmation 불변 trigger는 text 전용이다. 현재 SNS Realtime·profile trigger와 분리해야 한다.
- **기존 `plan_expired_concert_cleanup`/`delete_expired_concert`를 그대로 정리 도구로 사용하면 안 된다.** 소스의 소유 graph inbound FK 검사는 10개에 고정되어 있고, 운영은 text analysis/confirmation → concerts 2개가 더해진 **12개**다. 같은 정의라면 `BLOCKED_UNEXPECTED_FOREIGN_KEY`로 차단될 것으로 예상된다. 실제 함수 실행으로 시험하지 않았다. 이를 우회해도 text confirmation NO ACTION/불변 trigger가 있다.
- `DELETE`는 FK CASCADE/NO ACTION·DML trigger의 영향을 받는다. `DROP … CASCADE`는 종속 view/FK 제약을 제거할 수 있고, 문자열 본문 함수는 남아 실행 시 오류가 날 수 있다. `TRUNCATE`도 별도 trigger/연쇄 영향이 있다. 삭제 방법을 바꿔 보존 장치를 우회하는 것은 조사 결과에 포함되지 않는다.

## 확정 공연↔곡 연결 보존 가능성

| 항목 | OCR 경로 | 공식 Program text |
| --- | ---: | ---: |
| 표시상 CONFIRMED candidate / 저장 receipt | 3 | 2 |
| 현 status의 `is_effectively_confirmed=true` | 3 | 2 |
| 서로 다른 공연↔track pair | 3 | 2 |
| OCR 확정의 서로 다른 공연/곡 | 공연1·곡3 | — |
| 현재 `social_tracks`에 해당 ID 존재 | 3 | 2 |
| OCR 중 공연기간 미종료 연결 | 0 | — |
| OCR와 text 유효 pair의 교집합 | 0 | 0 |

OCR review 이력 65행은 자동 확정1, 검증된 legacy backfill 확정2, 자동 거절62다. 확정3개는 identity/evidence hash가 있고 status에서 current·증거 유효·EXACT/MATCHED까지 통과한다. 전체 OCR candidate290행 중 review_required159, rejected128, confirmed3이며 최신/옛 분석이 함께 있다. 공식 text는 analysis1·candidate18·receipt2다. 공연49개 중 공식 원문이 저장된 공연1개, 기간 미종료 공연12개다. 원문은 출력하지 않았다.

**보존 가능하다.** 가장 작은 위험의 방법은 확정3건과 그 증거를 포함한 기존 graph를 그대로 두는 것이다. 일부 비확정 이력만 나중에 정리하더라도 source result/attempt뿐 아니라 최신/current 선택에 필요한 분석·동일 image 시도·공연 맥락·catalog·정책·review를 함께 보존해야 한다. 이번에는 최소 보존 closure를 실험하거나 일부 행을 삭제하지 않았다.

OCR 원시 자료까지 없애면서 연결만 남기려면 별도 공연↔곡 확정 이력 모델로 이전하는 후속 migration이 필요하다. 기존 concert/track/work 식별자, provenance(`OCR`), 결정 시각/종류, identity 및 evidence/버전 hash와 보존용 증거 범위를 명시하고, 이력 보존과 현행 원문 재검증의 차이를 제품 정책으로 정해야 한다. ID tuple만 복사하거나 OCR 연결을 KOPIS 공식 text 확정으로 바꾸면 현재와 같은 검증 보장이 아니다. OCR3건과 text2건의 교집합도 0이어서 “text로 이미 대체됐다”고 볼 수 없다.

현재 main의 선택곡 공연 검색은 `SONG_SEARCH_RETIRED`로 종료됐고 공개 화면은 이 확정3건을 쓰지 않는다. 보관함/개인 기록/social의 track ID는 OCR graph와 FK가 없고 OCR origin의 연결이 삭제되어도 함께 지워야 할 근거가 없다. **등록된 곡 ID와 `social_tracks` 291개는 유지한다.**

## 예약 작업과 실제 실행 경로

| 위치 | 실제 확인 결과 |
| --- | --- |
| Windows 작업 스케줄러 | 관련 작업 `ClassicAtlas-LocalPipeline` 1개. **Disabled / Enabled=false**. 매일08:40 KST trigger 자체는 남아 Enabled=true지만 task가 비활성이라 정상 예약 실행되지 않음. 마지막2026-10-29 08:40, 결과0. next nominal 값2026-11-10 08:40은 실제 실행 예정이라는 뜻이 아님 |
| Windows 동작 | powershell의 `Invoke-OfficialProgramRelease.ps1 -Mode run`. launcher는 `.cache/ca-auto-20261022-001/spec4-task3m-finish/`에 있고, 고정 release SHA **1db327cd38dfce778da543738f975b70789aed66**를 선택. release 작업 트리 clean, manifest320개 파일 hash 모두 일치. launcher/배치는 이번에 실행하지 않음 |
| 고정 release 설정 | collection=true, official text=true, OCR=false, analysis=false, cleanup=false. 재활성화하면 **수집 및 공식 text 저장/최대1건 새 확정** 경로가 살아날 수 있어, OCR가 꺼져 있다는 사실과 DB 쓰기 전체가 없다는 사실은 다름. 시간제한32분, duplicate `IgnoreNew` |
| 운영 DB | `cron.job` 없음, pg_cron/pgagent 확장·pgagent job table 없음. Supabase DB 안에서 확인 가능한 설치 예약은 없음. 신고 purge의 문서 예제는 설치된 job이 아님 |
| Vercel 실제 운영 설정 | deployment `crons=[]`, project `crons.definitions=[]`. repository `vercel.json`에도 crons 없음. 실제 production SHA2552…와 현재 main이 일치 |
| GitHub/기타 | 기준 main 추적 트리에 Actions workflow 없음. 타 PC·별도 외부 스케줄러·수동 서비스키 호출자는 전역 확인 불가. 배치 재활성화/삭제는 하지 않음 |

이 frozen release의 collection 경로는 `sync_kopis_concert` → concerts/images를 쓰고, official text 경로는 `scheduledProgramText` → coordinator → text save/read/confirm RPC를 사용한다. OCR/analysis/cleanup 분기는 launcher에서 꺼져 있다. 관련 릴리스 소스: [고정 SHA pipeline runtime](https://github.com/MattewShin/sound-atlas/blob/1db327cd38dfce778da543738f975b70789aed66/server/pipelineRuntime.mjs), [공식 text 예약](https://github.com/MattewShin/sound-atlas/blob/1db327cd38dfce778da543738f975b70789aed66/server/scheduledProgramText.mjs), [text coordinator](https://github.com/MattewShin/sound-atlas/blob/1db327cd38dfce778da543738f975b70789aed66/server/programTextCoordinator.mjs). 이 코드들은 **현재 main에 다시 들어온 코드가 아니라 기존 예약이 참조하는 과거 release**다.

원래 IDE 작업 공간은 `codex/ca-social-20261106-001` / 8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e 및 미커밋 공연/OCR/Program 파일을 그대로 보존했다. 그것을 최신 운영 코드 또는 실제 예약 target과 섞지 않았다. 현재 root의 과거 수동 진입점은 보존되며, 실행하면 제거 후보 테이블에 접근할 가능성은 남아 있다.

## 이미지 Storage·로컬 자원

| 위치 | 관측과 처리 판단 |
| --- | --- |
| 운영 Supabase Storage | bucket0, object0, object metadata 집계0 bytes. **회수할 OCR Storage 파일은 발견되지 않음**. 플랫폼 테이블의 메타데이터 공간344,064 bytes와 이미지 파일 용량은 다름 |
| `concert_program_images` | 119행 = DETAIL70·POSTER49, 모두 active 외부 HTTP(S) URL. 이 프로젝트의 Supabase Storage URL로 분류된 행0. 외부 이미지 제공자의 파일은 이 DB 정리로 회수하지 못함. 실제 URL은 기록하지 않음 |
| 로컬 `.cache/easyocr` | 파일2개, **99,233,863 bytes(94.64 MiB)**. 모두 `models` 하위 가중치이고 `tmp` 이미지 파일0. OCR 이미지 잔존 용량으로 합산하지 않음. 로컬 OCR 완전 폐기 시 별도 정리 후보이나 이번 삭제 없음 |
| frozen release 기본 cache | 해당 release의 `.cache/easyocr` 경로 없음. 현재 설정 파일의 EASYOCR_CACHE_DIR override 없음. 과거 worker는 이미지 bytes를 tmp에 쓰고 finally unlink하는 경로지만 모든 과거 임시 위치의 부재를 보장하지는 않음 |

로컬 Python 가상환경·torch 패키지·다른 작업의 증거/백업 파일은 이번 DB/이미지 Storage 회수량에 넣지 않았다. 다른 드라이브나 임의의 과거 export/다운로드 폴더 전체를 스캔하지 않았다. 파일 이름·이미지 내용·사용자 데이터는 출력하지 않았고, 두 model 파일도 삭제하지 않았다.

## 삭제 후보·유지 대상·예상 회수량

| 구분 | 범위 | 예상 회수 공간 | 선행 조건 |
| --- | --- | ---: | --- |
| 조건부 DB 삭제 후보 | OCR 전용5개 전체 | **3,792,896 bytes / 3.62 MiB** | 확정3건 보존 방식 결정·이전/복구 검증, 의존 view/RPC/trigger와 옛 수동 경로 정리. 새 보존 테이블/인덱스 공간은 차감 전이므로 순회수량은 더 작음 |
| 즉시 안전하다고 확정된 DB 회수량 | 없음 | **0 bytes** | 현재 확정 유효성을 그대로 보존한다는 기준. 이번 실제 회수도0 |
| 유지 | 공유/수집/공식 text8개, 현 서비스13개, 플랫폼 schema | 회수량에 미포함 | cleanup 영수증71건(88 KiB)도 감사/멱등 보존 기간 결정 전 유지 |
| Supabase OCR 이미지 | 발견 없음 | **0 bytes** | bucket/object0 |
| 별도 로컬 자원 후보 | EasyOCR model2개 | **99,233,863 bytes / 94.64 MiB** | DB 공간과 별개. 로컬 OCR 재사용 필요 확인 후 별도 승인 범위에서 정리 |

3.62 MiB는 전체5개 relation을 나중에 제거하는 경우의 **현재 할당 크기 기준 상한성 참고값**이다. row DELETE만 하면 할당 파일이 같은 크기로 남을 수 있고, 보존 graph를 남기며 일부 행만 정리하는 경우 실제 회수량을 이 합계로 보장할 수 없다. 인덱스·TOAST를 이미 포함했으므로 중복 합산하지 않았다. view/RPC/trigger·system catalog 삭제에 따른 작은 공간이나 provider 청구 용량·backup/WAL·remote disk의 변화는 추정하지 않았다. `VACUUM FULL`/repack/백업 정리도 실행하지 않았다.

## 적용 이력·미확인·후속 검토

운영에는 migration이 선언하는25개 테이블과 draft의 version policy1개가 있다. v3 snapshot 열/save RPC도 존재하지만 `supabase_migrations.schema_migrations`가 없어 **파일별 실행 순서/시각을 운영 ledger로 검증할 수 없다.** 파일 의존 순서는 collection → OCR → Program → cleanup → v3 draft 전제 → identity → automation → v4/text이고, SQL 파일을 다시 실행하거나 새 migration을 만들지 않았다. bounded 자동화 draft의2개 테이블/2개 함수는 운영에서 발견되지 않았다.

후속으로 필요한 결정은 (1) 현재 UI에서 사용하지 않는 OCR 확정3건을 어떤 형태로 장기 보존할지, (2) 확정 증거까지 재검증해야 하는지, (3) cleanup 영수증의 보존 기간, (4) 외부/수동 호출 종료 확인이다. 그 뒤에 삭제 migration과 **현재 전체 FK graph를 기준으로 하는** 사전 검사·백업/복원 연습을 따로 설계할 수 있다. 이번 연결은 읽기 전용이라 복구 가능성이나 백업 복원 성공을 시험한 것은 아니다.

검증 완료: 운영 COUNT/크기·FK/view/함수 이름 참조/trigger, 확정 status 집계, Storage 집계, DB cron 유무, Windows 실제 작업/target/hash, Vercel 배포 SHA/cron 정의, 고정 main 코드의 서비스 도달 경로를 확인했다. 집계 SQL의 잘못된 catalog 열 이름/없는 migration ledger는 읽기 전용 조회 오류로 처리한 뒤 실제 schema에 맞춰 재조회했으며, 실패한 transaction에서도 쓰기는 하지 않았다.

문서/JSON 정합성·고정 SHA 근거 경로/줄·상대 링크·UTF-8·접속/비밀값 제외 검사와 원래 사용자 파일52개 hash/HEAD 보존 검사는 PASS다. 공개 matcher 버전 enum은 비밀값과 구분했다. **기능 코드 변경이 없으므로 앱 전체 테스트·Google OAuth·PostgREST 쓰기·Realtime 기능 테스트는 재실행하지 않았다.** 테이블·데이터·Storage·예약·권한 변경, 운영 배포 및 main 병합은 모두 **미실행**이다.
