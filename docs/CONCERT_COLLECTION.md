# KOPIS → Supabase 공연 수집 1단계

로컬 Node.js 22.18 이상에서 수동 실행하는 수집기입니다. 서울의 클래식 예정·진행 공연 기본정보, 포스터와 상세 소개 이미지의 **원본 URL만** 저장합니다. 기본 상한은 성공한 공연 10개이며, 전체 공연을 대표하는 표본은 아닙니다. `DETAIL`은 소개 이미지라는 출처만 뜻하며 프로그램 이미지 여부는 판단하지 않습니다.

이미지 다운로드·Storage 복제, EasyOCR, 작품 분석, 큐, Cron, Python 배포는 포함하지 않습니다. 기존 브라우저 검색/API/OCR 흐름과 보관함은 그대로 사용합니다.

## 먼저 사용자가 할 일

1. **Supabase Dashboard에서 사용할 기존 프로젝트를 선택하고 SQL Editor를 여세요.** `supabase/migrations/202610140001_concert_collection.sql` 전체를 한 번 실행하세요. 이 저장소에서는 기존 Supabase 연결·마이그레이션이 발견되지 않아 새 수집 테이블 두 개와 동기화 함수를 추가했습니다. 이 SQL은 트랜잭션이며 기존 로그인·보관함 정책을 변경하지 않습니다.
2. 프로젝트의 URL과 서버 키를 확인하세요. Project URL과 API keys 위치는 [Supabase 공식 안내](https://supabase.com/docs/guides/api/api-keys)를 참고하세요. 서버 키는 기존 `service_role` JWT 또는 서버용 `sb_secret_` 키를 사용합니다. anon/publishable 키는 사용할 수 없습니다.
3. Windows Git Bash에서 아래 명령을 실행하세요. 이미 존재하는 `.env`는 유지합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas
node --version
npm ci
[ -f .env ] || cp .env.example .env
```

4. 프로젝트 루트 `.env`를 편집기로 열고 아래 세 변수에 실제 값을 입력하세요. 현재 로컬 `.env`의 `KOPIS_SERVICE_KEY`는 재사용합니다. 키를 명령줄 인자·Git·브라우저에 입력하지 마세요. CLI는 `.env`와 실행 프로세스의 환경변수를 읽으며, 프로세스에 이미 설정된 값이 우선합니다.

| 변수 | 입력 위치와 역할 |
| --- | --- |
| `KOPIS_SERVICE_KEY` | 루트 `.env`: KOPIS 승인 서비스키. dry-run에도 필요 |
| `SUPABASE_URL` | 루트 `.env`: 해당 프로젝트의 HTTPS URL, 경로 없이 입력 |
| `SUPABASE_SERVICE_ROLE_KEY` | 루트 `.env`: 해당 프로젝트의 서버 키. 실제 저장 시 필요 |

`.env.example`에는 빈 변수와 설명만 있습니다. 서버 비밀키에 `VITE_`를 붙이지 않습니다. 이번 수집기를 쓰기 위해 Vercel에 서버 키를 추가할 필요는 없습니다.

5. 아래 순서로 dry-run, 저장, 같은 조건 재실행을 진행하세요.

```bash
# API 조회·정규화만: DB 키/연결 없이 실행 가능
npm run collect:concerts -- --dry-run

# 서울 / 오늘~30일 후 / 성공 최대 10개 저장
npm run collect:concerts

# 같은 명령 재실행: 동일 KOPIS ID와 이미지 URL은 기존 행 갱신
npm run collect:concerts

# 상한 변경 예시 (실제 DB 쓰기)
npm run collect:concerts -- --limit 25

# 상한 변경을 DB 쓰기 없이 확인
npm run collect:concerts -- --dry-run --limit 25

# 비밀키·네트워크 없이 수집기와 로컬 SQL 검증
npm run test:collection
```

6. Dashboard Table Editor 또는 SQL Editor에서 아래 확인 항목을 검토하세요. SQL 확인문은 `supabase/verification/concert_collection.sql`에 있습니다. 같은 날 두 번 실행했을 때 동일 공연·URL의 `id`와 `created_at`은 유지되고 `synced_at`/`updated_at`이 갱신됩니다. 원본 이미지가 바뀌면 새 URL 행이 추가되므로 전체 이미지 수가 항상 같아야 하는 것은 아닙니다.

## 수집 조건과 날짜 처리

검토한 공식 문서는 [KOPIS OpenAPI 개발가이드 v5.0](https://kopis.or.kr/upload/openApi/공연예술통합전산망OpenAPI개발가이드.pdf) 1~4페이지와 [공통코드](https://kopis.or.kr/upload/openApi/공연예술통합전산망OpenAPI공통코드.pdf) 1·3페이지입니다. 지역은 `signgucode=11`, 장르는 `shcate=CCCA`, 상태는 `prfstate=02`(공연중)와 `01`(공연예정)입니다.

- 기존 `getInitialConcertPeriod()`를 재사용하여 **Asia/Seoul의 오늘~30일 후, 양 끝 포함 31개 날짜**로 고정합니다. 2026-10-14 실행 시 2026-10-14~2026-11-13입니다. 한 실행 안에서는 자정이 지나도 조건을 바꾸지 않습니다.
- `pblprfr`에 `stdate`, `eddate`, 위 코드, `cpage`, `rows=100`을 보냅니다. `afterdate`는 등록/수정 필터이므로 관람 기간 필터 대신 사용하지 않습니다.
- 공식 문서의 날짜 필드 이름만으로 시작일 하한 조건을 추정하지 않았습니다. 2026-10-14 실제 API에서 같은 기간을 조회했을 때 2026-09-15 시작 PF300258, 2026-08-02 시작 PF296289 등 기간이 겹치는 진행 공연이 반환됨을 확인했습니다.
- 목록과 상세의 날짜는 실제 달력 날짜인지 검사하고, 상세는 `start_date <= 수집 종료일 AND end_date >= 오늘`로 검증합니다. `start_date >= 오늘` 조건을 넣지 않습니다. 상세 지역·장르·상태도 다시 검증하며 빠진 ID·잘못된 날짜·상태는 값을 추정하지 않고 실패로 기록합니다.
- 진행 상태부터 조회하고 예정 상태를 이어서 조회합니다. 각 상태에서 페이지를 순서대로 읽고 성공 상한 또는 마지막 페이지에 도달하면 종료합니다. 상태 간 ID는 중복 처리하지 않습니다. 상한이 작으면 진행 상태 일부만 수집할 수도 있습니다.
- 상세는 순차 처리합니다. HTTP 요청은 각 시도에 15초 타임아웃, 네트워크 오류·429·5xx 등에 최대 3회 시도와 지연을 적용합니다. 인증 오류·기타 4xx·잘못된 공연 데이터는 반복하지 않습니다. KOPIS 호출 사이에는 150ms 간격이 있습니다.

`updatedate`가 없으면 `kopis_updated_at=NULL`입니다. 공식 예시는 초 단위이나 실제 응답은 `2026-09-29 18:00:00.063448`처럼 소수 초도 있어 최대 6자리까지 보존합니다. 시간대 없는 KOPIS 시각은 한국 현지 시각으로 해석하여 `+09:00`을 명시합니다. 수집 성공 기록인 `synced_at`과 분리합니다.

공연 기간은 개별 회차 일정이나 잔여 좌석을 보장하지 않습니다. 출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS).

## DB 확인 항목과 권한

| 테이블 | 확인할 컬럼 |
| --- | --- |
| `public.concerts` | `id`, UNIQUE NOT NULL `kopis_id`, `title`, `venue`, 정규화 지역 `region`, date 타입 `start_date`/`end_date`, `performance_status`, `poster_url`, nullable `kopis_updated_at`, `synced_at`, `created_at`, `updated_at` |
| `public.concert_program_images` | `id`, FK `concert_id`, `source_url`, `image_type`(POSTER/DETAIL), `sort_order`, `is_active`, `created_at`, `updated_at` |

`concert_program_images`의 `(concert_id, source_url)`은 UNIQUE입니다. 포스터는 순서 0, 상세는 원본 `styurl` 배열의 0부터 시작하는 순서를 저장합니다. 같은 URL이 포스터와 상세에 모두 있으면 하나의 POSTER 행을 유지합니다. 기존 URL 행을 삭제하거나 새 ID로 교체하지 않습니다.

지역·기간 검색을 위해 `(region, start_date)`, `(region, end_date)` 인덱스를 추가했습니다. 두 테이블에 RLS를 활성화하고 PUBLIC/anon/authenticated의 테이블 권한과 함수 실행 권한을 회수했습니다. 공개 정책은 없습니다. 수집 전용 `service_role`에 SELECT/INSERT/UPDATE와 `sync_kopis_concert(jsonb,jsonb)` 실행 권한을 명시했습니다. Supabase의 서버 권한·RLS 동작은 [공식 RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)를 참고하세요.

서버 어댑터는 Supabase REST RPC를 직접 사용합니다. `sync_kopis_concert`는 SECURITY INVOKER이며 공연 upsert와 이미지 반영을 하나의 트랜잭션으로 처리합니다. 공연 행의 충돌 갱신이 같은 공연의 동시 수집을 직렬화합니다. 성공한 상세만 전달하므로 상세 실패에는 어떤 이미지 변경도 하지 않습니다. 성공한 응답에서 빠진 URL만 `is_active=false`, 다시 등장한 URL은 같은 ID로 `true`로 바꿉니다. 저장 도중 오류가 나면 공연정보와 이미지 변경 모두 롤백됩니다. 응답 유실 후 재시도해도 UNIQUE 키 기준으로 갱신됩니다.

RPC는 이번 수집 필드만 명시적으로 갱신합니다. 추후 별도로 추가할 OCR 필드·결과 테이블을 재수집 시 덮어쓰지 않습니다. 이번에는 OCR용 컬럼/테이블을 만들지 않았습니다.

## 로그 읽기

종료 결과는 JSON이며 신규/갱신 건수를 추정해 표시하지 않습니다.

| 필드 | 의미 |
| --- | --- |
| `conditions`, `limit`, `limitedSample` | 지역·장르·상태·KST 날짜 범위, 상한, 제한된 표본 표시 |
| `listRows` | 받은 목록 행 수. 중복 및 상한 이후 같은 페이지의 미처리 행도 포함 |
| `uniqueConcerts` | 상세 처리 대상으로 검토한 고유 유효 ID 수. 실패 포함 |
| `pages` | 성공적으로 받은 페이지 수 |
| `saved` | DB upsert 성공 공연 수. dry-run은 0 |
| `normalized` | 성공적으로 처리된 공연 수. dry-run에서는 저장 예정 수 |
| `imageCount` | 성공 공연의 현재 이미지 URL 수. dry-run에서는 저장 예정 수 |
| `preview` | 최대 3개 공연과 이미지의 정규화 결과 |
| `failures`, `failedConcerts` | 공연 ID별 오류 코드·원인, 목록의 상태·페이지·행 위치와 공연 실패 수. ID 누락은 null |
| `pageFailures`, `failedPages` | 페이지 조회 실패와 수. 해당 상태를 중단하고 다른 상태는 계속 시도 |
| `failed` | 공연 실패와 페이지 실패의 합계 |
| `limitReached`, `allPagesExhausted` | 성공 상한 도달 여부, 모든 상태의 마지막 페이지까지 오류 없이 완료했는지 여부 |

실패가 있으면 부분 성공 결과를 출력한 뒤 종료 코드 1을 반환합니다. 환경변수가 없거나 인자가 잘못되면 요청 전에 오류로 종료합니다. HTTP 오류에는 코드만 남기며 키가 포함된 요청 URL·응답 본문·원문 예외를 로그에 남기지 않습니다. Supabase 404는 마이그레이션/RPC 적용 여부와 프로젝트를, 401/403은 서버 키와 프로젝트 일치를 확인하세요.

## 변경 파일과 기존 코드 구분

- `server/kopisData.mjs`: 기존 XML 파서·날짜/지역 정규화·오류 타입을 OCR 의존성 없이 추출. 수집 경로는 개별 행을 검증하므로 잘못된 ID 하나로 페이지 전체를 버리지 않습니다.
- `server/kopis.mjs`: 공용 모듈을 import/re-export하여 기존 검색 API와 테스트의 import 경로를 유지.
- `server/concertCollector.mjs`, `server/collectionHttp.mjs`: 조건·CLI 인자·전체 페이지 순회·상세 검증·URL 정규화·재시도·집계.
- `server/supabaseCollector.mjs`: 서버 전용 환경변수와 RPC 저장 어댑터. 브라우저에서 import하지 않음.
- `scripts/collectConcerts.mjs`: 수동 CLI 진입점. 기존 로컬 방식인 Node `--env-file-if-exists=.env` 사용.
- `supabase/migrations/202610140001_concert_collection.sql`: 테이블·인덱스·RLS·권한·트리거·원자적 동기화 함수.
- `supabase/verification/concert_collection.sql`: 실제 저장 후 사용자가 실행할 읽기 전용 확인문.
- `server/concertCollector.test.mjs`, `server/concertCollectionSql.test.mjs`, `scripts/testConcertCollection.mjs`: 단위/통합 검증. `scripts/test.mjs`에도 연결.
- `package.json`, `package-lock.json`: CLI 명령과 SQL 검증용 개발 의존성 `@electric-sql/pglite` 추가. PGlite는 로컬 메모리 PostgreSQL 테스트에만 사용하며 운영 경로에 포함되지 않음.
- `.env.example`, `README.md`, 이 문서: 설정과 실행 안내.

조사 시작 시 `main` 작업 트리는 깨끗했습니다. 다른 브랜치 `origin/experiment/sac-calendar-probe`에는 `server/sac.mjs`, `scripts/probeSacCalendar.mjs` 예술의전당 실험이 있으나 Supabase 수집 구현은 없었습니다. 브랜치 전환·병합은 하지 않았습니다. 기존 검색은 `src/data/concertSearch.js` → `server/api.mjs` → `server/kopis.mjs`이며, OCR은 `matchBatch()` → `server/programOcr.mjs`에서 호출합니다. 수집기는 해당 OCR 모듈을 import/실행하지 않습니다. 보관함은 `src/data/storage.js`의 localStorage를 사용하며 저장소에 기존 Supabase 로그인·보관함 테이블 정의는 없었습니다.

## 이번 검증 결과

- `npm run test:collection`: 11개 통과. KST 경계, 날짜 오류, 페이지 이동/중복, 실패 후 계속 진행, dry-run 무쓰기, 제한된 재시도, 상세 실패 시 이미지 유지, 실제 마이그레이션/RPC의 중복 방지·이미지 갱신·롤백·RLS/권한 검증을 포함합니다.
- SQL 검증은 [PGlite](https://pglite.dev/docs/)의 격리된 메모리 DB에서 수행했습니다. 운영 테이블에 가짜 공연을 넣지 않았습니다.
- 실제 API dry-run: 2026-10-14~2026-11-13, 목록 13행 수신, 그중 고유 공연 10개와 이미지 URL 27개 정규화, 실패 0, 상한 도달. DB 쓰기는 0입니다. 전체 공연 수집 결과가 아닙니다.
- `npm run build`: 성공. 생성된 브라우저 번들에 서버 키 변수명·설정된 비밀값·수집 RPC가 없음을 확인했습니다.
- `npm test`: 138개 중 137개 통과, 기존 홈 탐색 DOM 검증 1개 실패(`scripts/homeDiscoveryDomTest.mjs:83`, “기존 감정 최고 적합도 유지”). 변경 전 HEAD를 별도 로컬 캐시에 추출하여 같은 실패가 발생함을 확인했습니다. 이번 범위의 홈 화면/테스트 코드는 변경하지 않았습니다.
- 실제 Supabase 검증 완료(2026-10-14 16:52 KST): 사용자 환경변수 설정 후 기존 마이그레이션이 적용된 프로젝트에 REST로 연결했습니다. 실제 KOPIS 데이터 기본 10개 표본을 같은 조건으로 두 번 수집했고, 두 실행 모두 공연 10개·이미지 URL 27개·실패 0이었습니다. 테이블 행 수는 수집 전 0/0 → 첫 수집 후 10/27 → 재수집 후 10/27로 유지됐습니다. 동일 공연/이미지의 `id`와 `created_at` 유지, `synced_at` 갱신, 중복 없음도 확인했습니다. 비밀값 없는 결과 요약은 Git 제외 경로 `.cache/collection-live-verification.local.json`에 저장했습니다. 상세 실패·저장 롤백·접근 차단의 강제 오류 검증은 위 로컬 SQL 테스트에서 수행했으며, 실제 Supabase에 오류나 가짜 데이터를 주입하지 않았습니다.
