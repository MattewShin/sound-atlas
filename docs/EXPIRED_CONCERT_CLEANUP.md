# 지난 공연 자동 삭제

통합 run에 환경 점검 → cleanup → 수집 → OCR → 분석 순서로 연결했습니다. **이번 구현 검증에서는 원격 삭제 RPC를 호출하지 않았습니다.** 실제 삭제·롤백·권한 검증은 로컬 PGlite PostgreSQL에서 수행합니다. 기존 예약을 변경하거나 재등록하지 않았습니다.

## 먼저 완료본 SQL 적용

Supabase의 현재 연결된 프로젝트 SQL Editor에서 [202610160001_expired_concert_cleanup.sql](../supabase/migrations/202610160001_expired_concert_cleanup.sql) **전체**를 실행하세요. 공연을 삭제하는 SQL 실행문은 없으며 테이블·함수·권한만 준비합니다. 완료본은 재적용할 수 있습니다. 작업 도중 초안을 적용했다면 이 파일 전체를 다시 적용해야 합니다. 기존 수집/OCR/분석 마이그레이션을 재실행할 필요는 없습니다.

새 환경변수는 없습니다. 기존 프로젝트 루트 `.env`의 서버 키를 재사용합니다. 다른 Supabase 프로젝트·조직에 접근하지 않습니다.

- `environment.cleanup_schema_ready: true`
- `stages.cleanup.plan.schema_version: expired-concert-cleanup-1`
- `migration_required: false`, `snapshot_consistent: true`

plan에서 위 값을 확인하세요. 미적용이면 기존 테이블을 GET으로 조회해 클라이언트 KST 날짜 기준의 대상·건수를 보여 줍니다. 이는 여러 GET의 읽기 결과여서 단일 DB 스냅샷이 아니며 `CLIENT_ASIA_SEOUL_MIGRATION_REQUIRED`, `snapshot_consistent: false`로 표시합니다. 정리 함수가 있는 초안이면 읽기 전용 RPC 결과를 표시하되 완료 버전 미확인을 명시합니다. **run은 미적용/초안 상태에서 FATAL·exit 2·CLEANUP_MIGRATION_REQUIRED로 중단**합니다. 삭제뿐 아니라 KOPIS 호출·수집·OCR·분석도 시작하지 않습니다. 기존 진행 상태의 값은 유지하고 실행 실패 보고만 남깁니다.

## 실행과 확인

```powershell
Set-Location 'C:\Users\CNXK\dev\sound-atlas'

# 읽기 전용: 삭제 대상과 테이블별 예정 행 수 확인
.\scripts\Invoke-ConcertPipeline.ps1 -Mode plan
$LASTEXITCODE

# 위 결과 확인 후: 실제 삭제 + 기존 수집/OCR/분석
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run
$LASTEXITCODE

# 실행 결과 확인
.\scripts\Invoke-ConcertPipeline.ps1 -Mode latest

# 삭제 공연 상한만 조정하려면 (기존 수집량/OCR/분석 상한은 유지)
# .\scripts\Invoke-ConcertPipeline.ps1 -Mode run -CleanupLimit 25
```

npm 대안은 `npm run pipeline -- plan`, `npm run pipeline -- run --cleanup-limit 100`, `npm run pipeline -- latest`입니다. 기본 100개, 최대 1000개이며 공연 수 기준입니다. 종료일 오름차순·내부 UUID 오름차순으로 결정적으로 선택합니다. 이번 상한 이후 잔여 대상은 다음 run에서 같은 규칙으로 처리합니다. 공유 관계 등으로 계속 차단되는 대상은 오류를 확인해 원인을 해결해야 하며 영구 제외하거나 삭제 범위를 넓히지 않습니다.

기존 예약은 같은 PowerShell 파일을 호출하므로 **재등록이 필요 없습니다.** 기존 작업 인자에 CleanupLimit이 없어도 새 스크립트 기본 100개가 적용됩니다. 매일 09:00 예약·사용자·전원·실행 정책은 그대로입니다. 다음 예약 전에 완료본 SQL 적용과 plan 확인을 마치세요. 등록 도구에는 향후 사용을 위한 `-CleanupLimit` 인자만 추가했으며 실제 등록 명령은 실행하지 않았습니다.

## 삭제·보존 기준과 관계

DB가 Asia/Seoul의 현재 날짜를 구해 **유효한 `end_date < 오늘`**인 공연만 삭제합니다. 오늘 종료·미래 종료·기간형 공연의 마지막 종료일이 오늘 이후인 경우는 유지합니다. 공연 상태·시작일만으로 삭제하지 않습니다. DATE의 null·무한대·역전된 날짜·지원 범위 밖 날짜는 제외 집계합니다. 문자열로 된 비정상 날짜는 기존 DATE 타입이 입력부터 거부합니다. 시작/종료일의 기존 NOT NULL/CHECK를 완화하지 않습니다.

기존 실제 FK는 다음과 같습니다. 새 cascade를 추가하거나 기존 FK를 바꾸지 않았습니다.

| 자식 | 부모 | 처리 |
| --- | --- | --- |
| concert_program_images.concert_id | concerts.id | 기존 CASCADE |
| concert_image_ocr_results.image_id | concert_program_images.id | 기존 CASCADE |
| concert_image_ocr_attempts.image_id | concert_program_images.id | 기존 CASCADE |
| concert_image_ocr_attempts.result_id | concert_image_ocr_results.id | 기존 NO ACTION, 시도 기록 먼저 삭제 |
| concert_program_analyses.concert_id / image_id | concerts.id / concert_program_images.id | 기존 CASCADE, OCR 교차 참조 때문에 분석을 먼저 삭제 |
| concert_program_analyses.ocr_result_id / source_attempt_id | concert_image_ocr_results.id / concert_image_ocr_attempts.id | 기존 NO ACTION |
| concert_program_candidates.analysis_id | concert_program_analyses.id | 기존 CASCADE, JSON 인용 근거도 같은 행과 삭제 |
| concert_program_reviews.candidate_id | concert_program_candidates.id | 기존 CASCADE |

공연별 한 RPC 트랜잭션에서 공연 행을 FOR UPDATE로 잠근 후 **잠금 이후의 종료일과 DB 한국 날짜를 다시 확인**합니다. 조회 후 종료일이 연장됐으면 NOT_EXPIRED로 건너뜁니다. 부모→자식 순서의 행 잠금으로 새 참조 생성을 제한하고, 기존 NO ACTION 참조를 분석→OCR 시도 순으로 제거한 뒤 공연 삭제/cascade를 수행합니다. 중간 오류면 그 공연의 삭제 전체와 삭제 기록이 롤백됩니다. 다른 공연의 정리는 계속하며 단계는 PARTIAL/exit 1로 보고합니다. DB 인증·스키마 오류는 기존 FATAL 규칙을 따릅니다.

알려진 FK 10개를 DB 카탈로그에서 검사합니다. FK가 누락됐거나 예상 밖 참조가 생기면 차단합니다. 분석·시도에 서로 다른 공연의 이미지/OCR이 공유된 경우도 CLEANUP_SHARED_DEPENDENCY로 차단합니다. `plan.targets[].shared_dependency`는 이 관계 확인 결과입니다. 임의로 다른 공연 자료까지 삭제하지 않습니다.

곡 데이터·작곡가·사용자·보관함은 대상이 아닙니다. `concert_program_catalogs`는 여러 분석이 공유하는 독립 카탈로그 스냅샷이므로 참조가 없어져도 유지합니다. 이미지 파일/Storage/모델/로컬 OCR 캐시는 이 DB 삭제 범위에 포함하지 않습니다.

행 잠금의 동작은 [PostgreSQL 행 잠금 문서](https://www.postgresql.org/docs/17/explicit-locking.html), 읽기 전용 GET RPC는 [PostgREST 트랜잭션 문서](https://postgrest.org/en/stable/references/transactions.html)에 따릅니다. 실제 원격 동시 갱신 경쟁을 유발한 테스트는 수행하지 않았습니다.

## plan·run 기록과 로컬 대기열

plan은 DB GET과 로컬 읽기만 수행합니다. 삭제·KOPIS·이미지 다운로드·OCR·분석 저장·잠금 생성·체크포인트 변경이 없습니다. 완료본 적용 후 기준일·총 대상·이번 대상/테이블별 건수를 단일 DB 읽기 스냅샷으로 구합니다.

run의 `stages.cleanup`에는 공연 단위 attempted/succeeded/failed/skipped, 실제 테이블별 `deleted_counts`, 삭제 시각/ID/건수, 상한 도달 여부, 종료 후 `remaining`, 날짜 문제 제외 건수를 기록합니다. 정리 대상 조회가 실패하면 잔여 수는 UNKNOWN으로 남기고 실패로 표시합니다. KOPIS 인증 확인은 cleanup 이후이므로 KOPIS 연결 실패가 이미 성공한 정리를 무효화하지 않습니다.

`concert_cleanup_events`는 HTTP 응답 유실 때 같은 operation UUID를 재시도해도 실제 삭제 건수를 되돌려주는 최소 운영 기록입니다. run/operation UUID·삭제한 공연 UUID/KOPIS ID·한국 기준일·삭제 시각·테이블별 행 수만 남깁니다. 공연 제목·OCR 원문·분석·후보·인용·검토 메모는 복제하지 않습니다. 서비스 키만 plan/delete RPC를 실행할 수 있고 일반 사용자는 실행·열람할 수 없습니다. SECURITY DEFINER 함수는 빈 search_path와 정규화한 객체명을 사용하며 service_role에 직접 DELETE 권한을 새로 부여하지 않습니다.

지난 날짜가 확인된 로컬 공연 대기·수집 재시도·touched 항목을 제거하고 삭제 대상 이미지의 OCR 키도 정리합니다. 새 OCR/분석 키에는 공연 소유 정보를 기록해 이후 삭제 때 정리할 수 있습니다. 전체 커서·정상 공연·대기 기간은 초기화하지 않습니다. 이전 버전이 남긴 소유자 불명의 분석 해시 키는 임의로 지우지 않습니다. 해당 키는 살아 있는 DB 이미지/현재 OCR에서 대상을 다시 생성할 때만 사용하므로 삭제된 공연을 재처리하지 않습니다. 같은 run에서 삭제한 공연은 목록/선택에서도 제외하고, 상세 저장 직전에 현재 KST 관람 범위를 다시 검증합니다. 이후 목록에 종료 공연이 있어도 지난 날짜는 저장하지 않습니다. 날짜가 실제 연장되어 미래 프로그램이 된 공연은 이후 정상 목록을 통해 다시 수집될 수 있습니다.

## 원격 읽기 전용 확인

2026-10-16 10:25:01 KST 최종 plan에서 다음 **8개 공연·이미지 URL 20개**가 삭제 대상이었습니다. 모두 종료일은 **2026-10-14**입니다. 종료일 문제 제외 0개, 상한 초과 잔여 0개입니다.

| KOPIS ID | 공연명 | 이미지 URL 수 |
| --- | --- | ---: |
| PF301763 | 제8회 브라보오페라앙상블 정기연주회 | 2 |
| PF300434 | Heritage Series; The Masters: 테너 이안 보스트리지 | 2 |
| PF302043 | 푸르지오 아트홀 수요 초대석 44. 문예진 피아노 독주회 | 2 |
| PF300769 | 큐리어스 (K'urius)의 피아노 스펙트럼 Ⅲ. 韻 (운); 빛과 어둠의 울림 Schubert & Rachmaninoff | 5 |
| PF301589 | 소프라노 조화영 독창회 | 2 |
| PF299391 | 제18회 서울국제음악제, 아르토 노라스와 김규연 리사이틀: 멋진 추억 | 2 |
| PF296572 | 프레디 켐프: 쇼팽 피아노 협주곡 | 3 |
| PF302080 | 박준선 작곡발표회, 머리카락 보일라 | 2 |

이 공연들에 종속된 `concert_image_ocr_results`, `concert_image_ocr_attempts`, `concert_program_analyses`, `concert_program_candidates`, `concert_program_reviews`는 각각 **0개**였습니다. 현재 자료에서 삭제 예정 행 합계는 28개이며, 공연 삭제 수 8개와 구분합니다. 오늘 종료 공연과 PF302595 등 미래 종료 공연은 대상이 아닙니다.

10:26:11 KST 추가 GET에서도 대상은 그대로 8개였으며, 해당 20개 이미지 ID를 참조하는 분석을 별도로 조회한 결과도 0개였습니다. 선택 공연의 OCR 결과·시도가 없고 이미지를 참조하는 외부 분석도 없어, 이번 대상에서 다른 공연과의 공유 참조는 발견되지 않았습니다. 이 추가 확인도 읽기 전용입니다.

최초 조회에는 cleanup 함수가 없었고 후속 조회에서 새 함수가 노출됐습니다. 이 구현 작업에서는 SQL 적용이나 원격 삭제 RPC를 실행하지 않았습니다. 후속 RPC로 실제 FK 10개의 부모/자식과 CASCADE/NO ACTION 구성을 확인했습니다. 작업 도중 적용한 SQL일 수 있으므로 **완료본 버전 확인 전에는 run이 시작되지 않도록** 처리했습니다. 읽기 전용 검증은 GET만 허용하는 fetch와 저장/체크포인트 호출을 차단한 local 어댑터로도 수행했습니다. 다른 실행이 보유한 기존 잠금·진행 파일은 건드리지 않았습니다.

10:25 최종 확인에서는 `cleanup_schema_ready: false`, `schema_version: null`, `migration_required: true`였습니다. 실제 서버용 repository의 run 스키마 점검도 읽기 전용으로 실행해 `CLEANUP_MIGRATION_REQUIRED`를 확인했습니다. 위 완료본 SQL 전체 재적용이 첫 작업입니다. 원격 plan 응답의 공유 관계/일관 스냅샷 필드도 아직 완료본으로 확인되지 않아 각각 null/false로 표시하며 성공으로 추정하지 않습니다. GET만 허용한 최종 점검은 DB GET 29회(추가 run 스키마 읽기 포함)·DB 쓰기/KOPIS/OCR/체크포인트 쓰기 0회였고, 메모리 상태와 기존 진행/결과 파일 해시도 전후 동일했습니다.

읽기 전용 SQL은 [expired_concert_cleanup.sql](../supabase/verification/expired_concert_cleanup.sql)입니다. 위 수치는 조회 시점 기준이며 다음 run에서는 DB가 날짜·관계를 다시 검증합니다.

## 검증 범위

로컬 PostgreSQL에서 어제/오늘/미래·기간형 날짜, UTC/KST 자정 경계, null/무한대/역전 날짜 제외, 조회 후 종료일 연장, 자식 삭제·고아 없음·독립 데이터/수동 상태 보존, 실패 롤백, HTTP 재시도용 삭제 기록 재사용, 재실행 0건, 상한/잔여, 공유 참조와 알 수 없는 FK 차단, 일반 사용자 실행 불가, 마이그레이션 적용/재적용 시 삭제 0건을 검증합니다. 배치 테스트는 정리 우선 순서·개별 실패 이후 진행·KOPIS 실패와 독립성·로컬 상태 선별 정리·과거 재적재 방지·plan 무쓰기를 검증합니다.

관련 테스트 20개, 전체 `npm test` **203개**, `npm run build`가 통과했습니다. PowerShell 상한 전달/경로/기존 예약 Preview 테스트도 전체 테스트에 포함됐습니다. 브라우저 빌드에 서버 비밀값과 삭제 RPC/배치 진입점이 포함되지 않는 것도 확인했습니다. `git diff --check`도 통과했습니다.

원격 실제 삭제·완료본 SQL 적용 후의 실제 통합 run·동시 세션의 행 잠금 경쟁·다음 Windows 예약 트리거는 이번에 실행하지 않았습니다.
