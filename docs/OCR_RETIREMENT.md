> **명세2 운영 적용 완료 — 2026-11-09.** PR #22가 main `52869c77338d7d343ca7ce204c67d3a466b6da3c`로 병합·배포됐고, 새 백업 확인 후 16:30:20 KST 승인 migration을 적용했다. [운영 결과](OCR_RETIREMENT_PRODUCTION_2026-11-09.md)와 [실제 증거](OCR_RETIREMENT_PRODUCTION_VERIFICATION_2026-11-09.json)를 따른다. 아래 명세1의 미실행/추가 승인 문구는 준비 당시 이력이며 현재 사용자 승인을 취소하지 않는다. rollback 명령은 이번 미실행이다.

# OCR 영구 폐기 — 적용 전 검토 자료

CA-OCR-RETIRE-20261109-001 / 명세1. **구현·격리 검증·Draft PR 준비이며 운영 DB 적용 전**이다. 기준 main과 실제 production은 `2552f5b021238b65a8c4d2e235a342b12e498cde`다. [기존 감사](OCR_DB_CLEANUP_AUDIT_2026-11-09.md), [코드 감사](OCR_DB_CODE_AUDIT_2026-11-09.md), [감사 snapshot](OCR_DB_AUDIT_METADATA_2026-11-09.json), [이번 증거](OCR_RETIREMENT_VERIFICATION_2026-11-09.json)를 구분해서 읽는다.

사용자는 OCR 재사용과 확정3건/모든 OCR 이력 보존을 명시적으로 폐기했다. 과거 감사의 “확정 보존 선행/즉시 회수0”은 당시 조건이며 **이번 제품 정책을 제한하지 않는다.** 새 보존 테이블로 복사하지 않는다. 공식 KOPIS Program text와 사용자 서비스는 유지한다.

## 재검증과 적용 중단 기준

2026-11-09 10:21~10:28 KST 운영 카탈로그/COUNT를 READ ONLY로 재조회했다. 감사와 public/private26개 테이블·38FK·4view·65함수의 이름/직접 참조/호출 체인·15개 앱 trigger·열 구성이 같았다. 다른 schema의 함수/procedure/view에서 OCR 이름 참조는 발견되지 않았다. 운영 정의의 CRLF/LF 줄끝만 정규화한 지문이 이력 SQL로 재구성한 격리 DB와 일치하고, view 지문도 일치했다. 접속정보·키·사용자 본문은 출력하지 않았다.

**11:02:34 KST 작성된 [운영 사전 검사 SQL](../supabase/retirement/ocr-20261109-preflight.sql) 자체를 READ ONLY로 실행하여 PASS**를 확인했다. 이것은 삭제 migration 실행이 아니다. 운영 객체/행 수는 그대로이며 적용 이후 관측값은 아직 없다. 원격 main과 Vercel production SHA도 동일하고 Vercel cron 정의는0이다.

적용 전에는 같은 검사를 다시 실행한다. 새 FK/열/view/trigger/RLS 정책/제약/함수/procedure/문자열 참조/compiled dependency가 생기거나 정의 지문이 달라지면 **BLOCKED**다. 기존 manifest를 자동 갱신하거나 `IF EXISTS`로 지나가지 않는다. 비교 대상 전체가 엄격히 고정되어 있어 OCR와 무관한 앱 schema 변경도 재검토를 요구할 수 있다. 함수 지문은 CRLF→LF만 정규화하며 운영 함수를 재작성하지 않는다.

## 정확한 삭제 목록

[명시적 migration](../supabase/migrations/202611090001_retire_ocr.sql)과 [typed signature·FK·유지 manifest](../supabase/retirement/ocr-20261109-manifest.json)가 실행 계약이다. 파일 적용 순서는 현재 운영 schema 이후 **202611090001** 하나다. 옛 SQL/draft를 운영에 재실행하지 않는다. 운영에는 CLI migration ledger가 없어 `supabase db push`로 과거 파일 전체를 밀지 않는다.

| 테이블 | 재검증 행 수 | 인덱스·TOAST 포함 bytes |
| --- | ---: | ---: |
| `public.concert_image_ocr_attempts` | 72 | 114,688 |
| `public.concert_image_ocr_results` | 60 | 729,088 |
| `public.concert_program_analyses` | 114 | 1,638,400 |
| `public.concert_program_candidates` | 290 | 1,204,224 |
| `public.concert_program_reviews` | 65 | 106,496 |

관측된 총601행과 OCR 확정3건을 포함해 **적용 시 이 다섯 테이블의 모든 데이터**가 제거된다. 3,792,896 bytes(3.62 MiB)는 현재 relation 할당량 기준이며 함수/view/catalog 및 backup/WAL/provider 과금 변화까지 예측하지 않는다. 행 수는 증거이며 migration을 특정 데이터 개수에 한정하지 않는다. 적용 직전 개수가 바뀌면 운영자는 새 쓰기 주체와 제품 범위를 재확인해야 한다.

- View: `public.concert_program_candidate_status` 1개.
- Trigger: `public.concert_program_reviews.program_review_identity_immutable` 1개.
- 함수/RPC22개(모두 public, 정확한 인자 타입은 manifest):

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

이 중 cleanup5개는 OCR 전체 graph를 계산·삭제하는 옛 통합 정리 함수다. OCR 테이블 제거 후 깨진 RPC/문자열 참조와 불필요한 삭제 진입점을 남기지 않기 위해 함께 폐기한다. **이번 삭제 도구로 호출하지 않는다.** `concert_cleanup_events` 및 OCR와 무관한 순수 date helper2개는 유지한다. 공식 text나 현재 서비스가 이 cleanup5개를 호출하는 경로는 없다.

FK11개는 모두 삭제할 다섯 테이블이 소유한다. 유지 테이블에 새로 붙은 inbound FK가 있으면 중단한다.

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

대상 테이블의 PK·UNIQUE·CHECK·자체 인덱스·ACL·RLS는 테이블 소유 객체로 함께 없어지며, 다른 테이블 제약을 연쇄 제거하지 않는다. 목록은 감사 metadata와 manifest의 `restore_requirements`에서 확인한다. **DROP CASCADE/TRUNCATE/DROP IF EXISTS는 없다.** 단일 transaction에서 사전 검증 → view/trigger/함수 RESTRICT → FK11개 명시 제거 → 테이블5개 RESTRICT → 유지 지문 확인 → COMMIT 순서다.

## 유지 목록과 보존 근거

다음8개는 이름·열·의미와 데이터에 DDL/DML을 가하지 않는다.

```text
public.concerts
public.concert_program_images
public.concert_program_catalogs
public.concert_program_version_policy
public.concert_program_text_analyses
public.concert_program_text_candidates
public.concert_program_text_confirmations
public.concert_cleanup_events
```

공식 text의3개 status view, `save_concert_program_text_analysis_v4`, `read_concert_program_text_candidate_status_v4`, `confirm_concert_program_text_candidate_v4`, 불변 confirmation trigger2개와 `sync_kopis_concert`를 유지한다. 공유 `program_identity_canonical`, `program_identity_normalize`, `program_work_identity`, `program_work_identity_hash`, 수집 updated_at/revision trigger/helper 및 `concert_cleanup_korean_date`, `concert_cleanup_valid_dates`도 그대로다. 유지 함수43개 전체와 definition 지문은 manifest에 있다.

`concert_browser_cache`와 보관함·개인 기록·닉네임·공유본·등록곡·프로필·팔로우·차단·좋아요·댓글·비공개 계정 매핑/신고 등 현재 서비스13개 테이블, Auth 및 SNS Realtime/권한 정책을 유지한다. OCR graph에서 사용자 graph로 FK가 없고, migration은 유지 테이블 데이터를 복사/수정/삭제하거나 RLS/ACL을 바꾸지 않는다. 격리 시험에서 유지21개 테이블의 모든 합성 행 지문, 유지 함수 정의/ACL·정책·trigger가 전후 일치했다. 실제 운영 사용자 데이터 보존은 적용 후 별도 확인해야 하며, 현재 결과를 운영 적용 성공으로 표현하지 않는다.

| 앱 객체 | 적용 전 관측 | 적용 후 기대 | 격리 실제 적용 |
| --- | ---: | ---: | ---: |
| 테이블 | 26 | 21 | 21 |
| view | 4 | 3 | 3 |
| 함수 | 65 | 43 | 43 |
| FK | 38 | 27 | 27 |
| 비내부 앱 trigger | 15 | 14 | 14 |
| 공식 text 유효 확정 | 2 | 기존2 보존 | 기존2 유지, 새 공연 확정1 추가 성공 |

## 코드와 운영 진입점

기준 main은 10월 공연 브라우저 전환 때 이미 OCR worker/전처리/통합 batch/Python·EasyOCR/Tesseract 실행 코드·관련 npm dependency/테스트/환경 예시를 제거했다. 따라서 이 PR은 해당 제거를 새로 했다고 과장하지 않는다. 현재 tracked tree에 Python 실행 코드나 인식 package는 없으며, 새 코드에 삭제 객체를 호출하는 경로를 되살리지 않았다.

공식 text 실행 코드도 당시 main에서 빠져 실제 Windows 예약이 과거 frozen release를 가리키고 있었다. 이 PR은 그 release `1db327cd38dfce778da543738f975b70789aed66`의 **공식 text 및 KOPIS 수집 순수 기능만** `server/programText/`로 분리했다. 원래 App/UI를 덮어쓰지 않았고 수동 평가/곡 ID를 바꾸지 않았다. 이미지 source 선택/recognition cache/인식 version import/legacy 검증/재매칭/자동 OCR 판정 진입점을 가져오지 않았다. 현재 공식 source가 없으면 NONE으로 종료하며 다른 증거로 fallback하지 않는다.

- 새 운영자 진입점: `npm run program:text -- --concert-id UUID --mode dry-run` 또는 `--daily --mode dry-run`. 기본 dry-run, stage/limit 임의 인자와 옛 OCR 플래그 거부.
- 저장은 명시적 `--mode save`만 허용한다. 일일 mode는 추가로 `PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED=true`가 필요하다. collection 최대1, coordinator 최대1, 새 confirmation POST 최대1 제한을 유지한다. 기존 text source/current/정책/identity/hash/중복 확인을 우회하지 않는다.
- text core는 frozen 공식 v4의 합성 기준6개와 payload/catalog hash가 같다. `OCR_NUMBER_UNCERTAIN`은 기존 text 판정 계약의 불명확 숫자 reason enum이라 유지했다. 인식 engine/호출이 아니며 의미를 바꾸지 않기 위한 호환 상수다. 원시 source ID 입력 거부도 남긴다.
- source/script/test에서 삭제 테이블·함수·view·trigger의 **직접 이름 참조0**을 확인했다. 이력 SQL을 재구성하는 격리 fixture와 삭제/사전·사후 검증 SQL/manifest는 관리·검증 계약으로 구분한다. 역사 문서/옛 migration의 이름은 유지한다.
- 현재 OCR 진단·검증·cleanup 검증·bounded/v3 draft7개는 원문을 `supabase/history/ocr/*.sql.txt`로 옮겨 현 실행 진입점에서 제외했다. 과거 migration은 수정하지 않았다.
- `.vercelignore`는 로컬 운영자 scripts, SQL·이력, text CLI와 테스트 helper를 배포 입력에서 제외한다. frontend 및 public API import graph에 text CLI나 인식 engine이 없다. 공개 API에 새 쓰기 route를 만들지 않았다.

**Windows 기존 작업은 여전히 Disabled다.** 마지막2026-10-29 08:40 KST/결과0, frozen320개 파일 hash도 동일하다. launcher의 OCR/analysis/cleanup=false, collection/official text=true를 재확인했으며 실제 예약/launcher는 이번에 수정·실행하지 않았다. 과거 release에는 폐기된 코드가 남으므로 **그 target을 그대로 재활성화하지 않는다.** 별도 운영 승인 단계에서 검토한 새 text CLI checkout으로 task action을 교체하고 dry-run 확인 후 켜야 한다. 새 경로에는 OCR stage가 존재하지 않는다.

실제 Vercel production/preview의 미사용 `PROGRAM_SEARCH_VERSION`, 로컬의 `PROGRAM_SEARCH_VERSION`/`PROGRAM_ANALYSIS_SCHEDULE_ENABLED`는 **이름만 확인했고 값/설정은 변경하지 않았다.** 새 코드에는 사용처가 없으며 운영 적용 단계 삭제 후보다. 저장소 `.env.example`은 text 전용 schedule=false만 추가했다. `KOPIS_SERVICE_KEY`, `SUPABASE_URL`/server key와 기존 VITE/Auth 설정은 유지한다. 원래 IDE WIP/비추적 파일/실제 .env와 ignored frozen release를 이 PR에서 덮어쓰거나 삭제하지 않는다.

## 테스트 결과와 한계

`npm test` **162/162**, `test:social` **5/5**, `test:retirement` **15/15**, 정적 검증/build **PASS**. 기능·migration 코드 기준 SHA는 `e8e204e31d0bf5c401fec2e12641c8183a0fb219`다. 최종 명령별 결과와 환경은 [검증 JSON](OCR_RETIREMENT_VERIFICATION_2026-11-09.json) 및 HANDOFF에 기록한다. Windows/Node22, lockfile 그대로 설치, PGlite/JSDOM 및 mock HTTP/SDK transport, 실제 JSX/esbuild 번들을 사용한다. DB fixture는 전부 합성이며 실제 사용자 기록을 공개하거나 삭제하지 않았다.

- 통합 전체 test: 보관함/개인 원본·기존 공유 링크·SNS A/B/C/익명 권한·삭제·Auth/session/API/구독·모바일 typography와 공연/cache 회귀를 포함한다. **기존 SNS SQL 회귀도 폐기 migration을 실제 적용한 격리 DB에서 수행하도록 보강**했다.
- 폐기 전용: 비어 있지 않은 합성 graph/확정 상태3행 제거, 유지21개 데이터/정의/권한 불변, 공식 text 기존2건 유효성+신규 저장/확정, 늦은 실패의 전량 rollback, 예기치 않은 의존성10유형/반복 적용 거부, 복구 TOC 선별/ACL 누락 거부, frozen v4 기준6개, official-only source·수집·coordinator 실패/멱등/1회 제한.
- `verify:retirement`: 앱/서버/스크립트/테스트의 직접 삭제 객체 참조0, 인식 dependency0/Python0, 금지 migration DDL0, 실제 API 번들 입력8개에 text/인식 경로 없음.
- build: 성공. JS 약875.48 kB/gzip224.84 kB, 기존500 kB 초과 chunk 경고 유지. 오류로 숨기지 않았다.

실제 PostgREST schema cache 갱신·Google OAuth·운영 Realtime·클라우드 삭제/실복원·다중 PostgreSQL session lock/실기기 테스트는 이번에 실행하지 않았다. 기존 회귀는 격리 SQL·mock transport·DOM 검증이며 실제 운영 재검증이라고 보고하지 않는다. 인프라/Docker/Supabase 프로젝트는 새로 만들지 않았다.

## 별도 승인 후 적용 순서와 논리 백업

**아래는 준비한 명령이며 이번에 실행하지 않았다.** 이번 허용 범위는 코드/migration/test/build/Draft PR이다. 실제 삭제·main 병합·운영 배포·예약/실제 환경변수 변경은 PR 검토 후 별도 승인이 필요하다.

1. 승인할 정확한 코드 SHA와 main/배포/DB 대상을 다시 확인한다. [preflight SQL](../supabase/retirement/ocr-20261109-preflight.sql) 출력과 전후 snapshot을 Git 제외 보안 폴더에 저장한다. 기존 task Disabled, 수동/타 PC worker 중지와 새 의존성 부재를 확인한다. 새 차이는 BLOCKED다.
2. **적용 직전 새 전체 논리 archive**를 만들고 checksum·TOC·종료 코드를 확인한다. 11월6일 백업을 이번의 최신 백업으로 대신하지 않는다. backup은 복구 목적의 제한된 임시 보관물이며 새 서비스 이력/보존 테이블이 아니다. 접근을 제한하고 운영 승인 시 보관 기간(예: 적용/복구 승인 후7일)을 정한다. 사용자 자료가 들어 있으므로 Git/PR/공개 Storage에 올리지 않는다.
3. OCR 전용 복구 TOC를 준비하고, 격리 복원에서 유지 부모/catalog/helper가 있는 상태의 OCR graph 복원과 ACL/RLS를 확인한 뒤 적용한다. 실제 개인 기록을 시험 공개하지 않는다. 이번에는 **이전11월6일 archive의 목록 메타데이터**만 읽어95개 entry 선별을 검증했고 데이터를 복원하지 않았다. 새 backup의 실복원 성공은 아직 미검증이다.
4. migration 한 파일을 적용한다. 이 파일은 BEGIN/COMMIT을 소유하므로 자동 전체 migration/중첩 transaction/에러 무시로 실행하지 않는다. 새 text task는 아직 비활성으로 유지한다.
5. [postflight SQL](../supabase/retirement/ocr-20261109-postflight.sql), 대상 부재/남은 문자열 참조, 유지21개 및 기존2건 text 유효성, 기존 계정/보관·기록/공유/SNS/cache를 확인한다. 운영 내용은 조회·공개/삭제 시험에 사용하지 않고 합성 계정만 쓴다. PostgREST metadata cache도 별도 확인한다.
6. 승인된 main 병합/운영 배포 및 새 text task retarget/설정 정리는 해당 운영 단계에서 한다. 기존 task를 그대로 켜거나 옛 snapshot/worker를 다시 실행하지 않는다.

예시는 PostgreSQL17 client가 PATH에 있고 안전한 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE, `PGSSLMODE=verify-full`/신뢰 CA를 **비밀 관리 경로로 이미 설정한 session**을 전제로 한다. 값을 명령행/문서/로그에 출력하지 않는다. `pg_dump`는 일관된 snapshot을 만들며 일반 읽기/쓰기를 막지 않지만 DDL lock과 경합할 수 있다. [공식 pg_dump 문서](https://www.postgresql.org/docs/17/app-pgdump.html)

```powershell
# 준비 예시. 실제 대상/권한/격리 복원 확인과 별도 승인 후 사용.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path (Get-Location) ('.cache/private-ocr-backup/' + $stamp)
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $backupDir /inheritance:r /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BACKUP_ACL_FAILED' }
$archive = Join-Path $backupDir 'before-retirement.dump'
pg_dump --format=custom --no-owner --file $archive
if ($LASTEXITCODE -ne 0) { throw 'BACKUP_FAILED' }
Get-FileHash -Algorithm SHA256 -LiteralPath $archive |
  Select-Object Hash | ConvertTo-Json | Set-Content (Join-Path $backupDir 'checksum.json')
pg_restore --list $archive | Set-Content -Encoding utf8 (Join-Path $backupDir 'all.toc')
if ($LASTEXITCODE -ne 0) { throw 'BACKUP_LIST_FAILED' }
node scripts/ocrRestoreList.mjs (Join-Path $backupDir 'all.toc') (Join-Path $backupDir 'ocr-only.toc')
if ($LASTEXITCODE -ne 0) { throw 'RESTORE_LIST_BLOCKED' }
# 5 TABLE/DATA, 22 FUNCTION+ACL, 1 VIEW, 1 TRIGGER, 11 FK,
# 8 PK/UNIQUE, 5 secondary INDEX, 5 ROW SECURITY, 6 relation ACL 확인.
# --no-acl을 사용하거나 본문을 공개 출력하지 않는다.

psql -X -v ON_ERROR_STOP=1 -f supabase/retirement/ocr-20261109-preflight.sql > (Join-Path $backupDir 'preflight.txt')
if ($LASTEXITCODE -ne 0) { throw 'PREFLIGHT_BLOCKED' }
# 다음 1줄이 실제 파괴적 적용이다. 이번 미실행이며 별도 승인이 필요하다.
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/202611090001_retire_ocr.sql
if ($LASTEXITCODE -ne 0) { throw 'MIGRATION_FAILED_TRANSACTION_NOT_COMMITTED' }
psql -X -v ON_ERROR_STOP=1 -f supabase/retirement/ocr-20261109-postflight.sql > (Join-Path $backupDir 'postflight.txt')
if ($LASTEXITCODE -ne 0) { throw 'POSTFLIGHT_FAILED' }
# 승인된 적용 단계에서 PostgREST schema cache 갱신을 요청하고 실제 API를 확인한다.
psql -X -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';"
if ($LASTEXITCODE -ne 0) { throw 'SCHEMA_RELOAD_REQUEST_FAILED' }
```

## rollback・장애 대응

COMMIT 전 lock/schema/dependency/DDL/postcheck 실패는 전체 transaction을 rollback한다. `ON_ERROR_STOP`으로 멈추고 접속 종료 또는 명시 ROLLBACK을 확인한다. 오류 후 계속 진행하거나 `DROP … CASCADE`, 제약/불변 trigger/RLS 해제로 우회하지 않는다. 격리 시험의 “마지막 COMMIT 직전 실패”에서 데이터·객체·함수·view/FK/trigger 전체가 돌아오는 것을 확인했다.

COMMIT 후에는 자동 down migration이 없고 데이터도 자동 복구할 수 없다. 앱의 보관함/기록/SNS를 이전 시점으로 덮어쓰지 않는다. 우선 새 text 작업을 정지하고 실제 장애 범위를 확인한 뒤, 공유 객체가 정상이라면 후속 수정으로 해결한다. OCR graph 자체를 되돌려야 하는 예외에는 **최신 archive에서 OCR 전용 TOC만** 단일 transaction으로 복원하는 별도 승인이 필요하다. 유지 테이블 데이터/공유 함수/현재 Auth/SNS에는 전체 restore를 덮어쓰지 않는다.

```powershell
# 위에서 만든 보안 폴더/검토된 ocr-only.toc, 안전한 PG session 전제.
# 먼저 별도 격리 대상에서 수행/검증하고, 운영 실행은 장애 대응 승인 후.
pg_restore --no-owner --exit-on-error --single-transaction `
  --use-list (Join-Path $backupDir 'ocr-only.toc') --dbname $env:PGDATABASE $archive
if ($LASTEXITCODE -ne 0) { throw 'OCR_ONLY_RESTORE_FAILED_ROLLED_BACK' }
```

`--clean`/`--create`/`--no-acl`로 충돌을 숨기지 않는다. 예상 객체가 이미 있거나 공유 부모/helper/권한이 달라지면 중단한다. 복원 후5개 table 데이터·22개 함수 ACL·RLS/view/trigger/FK를 snapshot과 대조한다. 선별 TOC는 현재 사용자/공유/table data를 제외하고 누락된 함수 ACL/RLS/핵심 객체가 있으면 거부한다. 실제 archive 복원은 이번에 실행하지 않았으므로 성공을 보장한다고 보고하지 않는다. [공식 pg_restore 문서](https://www.postgresql.org/docs/17/app-pgrestore.html)

## 예상 중단·잠금 영향

대상5개에 ACCESS EXCLUSIVE NOWAIT를 먼저 잡는다. 옛 OCR reader/worker가 lock을 보유하면 즉시 중단한다. 그 외 DDL lock은 `lock_timeout=3s`, 각 statement는30초 제한이며 lock은 transaction 종료까지 유지된다. FK 제거 과정의 부모 concerts/images/catalog와 catalog 조회에도 경합이 있을 수 있다. [PostgreSQL 잠금 문서](https://www.postgresql.org/docs/17/explicit-locking.html)

현재 웹 공연 조회/cache와 사용자/SNS는 대상5개를 사용하지 않아 기능 중단은 계획하지 않는다. 다만 짧은 DDL/catalog lock 지연 가능성이 있어 **무중단을 보장하지 않는다.** 운영 다중 session 실측은 하지 않았다. 공식 text/수집 작업은 적용 구간에 멈추고 성공 확인 후 새 CLI로만 재개한다. 3초 초과 경합이면 강제 세션 종료보다 중단·원인 확인 후 재계획한다.

## 로컬 모델 — 이번 삭제 제외

다음 두 파일은 읽기만 확인했다. 합계99,233,863 bytes(94.64 MiB), 관측한 EasyOCR Python 실행 process0, 관련 예약Disabled, 현재 tracked 실행 코드의 인식 engine 참조0이다. 다른 PC의 수동 사용까지 증명한 것은 아니다.

```text
.cache/easyocr/models/craft_mlt_25k.pth  83,152,330 bytes
.cache/easyocr/models/korean_g2.pth     16,081,533 bytes
```

PR 병합/의존성 제거·다른 사용자 작업의 모델 필요 여부 확인 **후에 원래 IDE 저장소 루트에서 따로 실행할 수 있는 명령**이다. 이번에는 실행하지 않았다. 원래 WIP/frozen release/Python 가상환경 전체를 재귀 삭제하지 않는다.

```powershell
$modelRoot = (Resolve-Path -LiteralPath '.cache/easyocr/models').Path
Remove-Item -LiteralPath (Join-Path $modelRoot 'craft_mlt_25k.pth'), (Join-Path $modelRoot 'korean_g2.pth')
```

완료 보고와 코드 SHA/PR는 [HANDOFF](../HANDOFF.md)를 따른다. 검토 전 구현 상태를 ACCEPTED 또는 운영 폐기 완료로 표시하지 않는다.
