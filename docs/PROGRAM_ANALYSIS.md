# 저장된 OCR 프로그램 추출·작품 후보·수동 검토

2026-10-15 작품·악장 경계 수정: 현재 matcher는 **`stored-program-2`**입니다. 부모 미확인 목록의 번호·제목을 분리해 보존하며, PF300258 dry-run은 후보 8개·곡 ID 연결 0개입니다. [수정 내용·전후 비교·검증·명령](PROGRAM_ITEM_BOUNDARIES.md)을 참고하세요. 새 DB 마이그레이션은 필요하지 않으며 이번 수정에서는 원격 DB에 쓰지 않았습니다. 아래 초기 구현 검증과 표본 JSON은 v1 시점의 기록입니다.

먼저 **PF300258의 프로그램 후보와 원본 이미지**를 확인하세요. 마이그레이션 적용 전에도 다음 명령은 기존 OCR을 읽기만 합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas
npm run program:analyze -- analyze --dry-run --kopis-id PF300258
```

우선 확인할 근거는 `H. Villa-Lobos / Prelude No.1 전주곡 제7번`입니다. 영문과 한글 번호가 충돌합니다. 이미지가 안내하는 3개 회차와 프로그램의 관계도 확인해야 합니다. 저장된 OCR 문구를 임의로 1번이나 7번으로 고치지 않았습니다.

- [PF300258 프로그램·프로필·회차 안내 원본](http://www.kopis.or.kr/upload/pfmIntroImage/PF_PF300258_202609070110504591.jpg)
- [실제 표본 분석 기록](PROGRAM_ANALYSIS_SAMPLE_2026-10-15.json): 이미지·OCR·시도 ID, 출처 URL, 구간·제외 이유, 각 후보의 원문·좌표·판정 이유.

## 조사와 재사용

시작 브랜치는 `main`이며, 기존 미커밋 파일은 완료 보고서 `COMPLETION_REPORT_2026-10-15.md`였습니다. 브랜치 전환·병합은 하지 않았습니다.

곡 원본은 `src/data/manualRatings.js`, `tchaikovskySeasons.js`, 앱 조합은 `musicData.js`입니다. `workCatalog.js`가 기존 문자열 곡 ID에서 부모 작품과 악장 관계를 파생합니다. 예를 들어 `beethoven-sonata-op27-2-no14-m2`는 월광 2악장입니다. 별도의 Supabase 곡 테이블을 새로 만들거나 ID를 재발급하지 않았습니다.

기존 `composerPatterns`, `workTypePatterns`, `musicalKeysIn`, `identifyEntry`, `checkProgramContext`, `getTrackTarget`을 재사용했습니다. 기존 웹용 `extractProgram`은 제목 중심의 추출이며 저장된 OCR 좌표·검토 이력·최신성 처리가 없어, 이번 배치의 구간·근거 추출은 `server/programAnalysis.mjs`로 분리했습니다. 기존 검색·Tesseract 판정 경로는 변경하지 않았습니다.

`supabaseRest.mjs`의 서버 전용 인증·타임아웃·제한 재시도·오류 메시지 보호를 재사용합니다. 새 코드는 Python·이미지 다운로드·EasyOCR 설정을 import하지 않습니다. Python 가상환경·판독 모델·실행 캐시를 변경하거나 정리하지 않았습니다.

추가 파일은 `server/programAnalysis.mjs`, `server/supabaseProgramAnalysis.mjs`, `scripts/analyzeConcertPrograms.mjs`, `scripts/runProgramAnalysis.mjs`, 전용 Node/SQL 테스트와 `scripts/testProgramAnalysis.mjs`, 신규 마이그레이션·검증 SQL·이 안내서·표본 JSON입니다. `package.json`, 전체 테스트 진입점, README, 코드 구조 문서에 명령과 연결을 추가했습니다. 기존 수집·OCR 마이그레이션과 곡 DB는 변경하지 않았습니다.

## 동작과 판정

1. 저장된 공연의 상세 이미지와 OCR 결과·완료 시도를 ID 기준 페이지 조회합니다. 공연 수집 날짜 필터를 다시 적용하지 않아, 이미 수집한 과거 표본도 분석할 수 있습니다.
2. 활성 `DETAIL` 이미지에서 DB 기록 시각 `created_at`이 가장 최신인 시도가 성공했는지 확인합니다. 실패·미처리 이미지에는 과거 성공 결과를 대신 사용하지 않습니다. 판독 결과 ID가 다른 시도와 순서가 동률이면 제외합니다.
3. 원문 순서와 정확히 대응하는 detection의 bbox·confidence를 사용합니다. 대응하지 않는 좌표는 null로 남깁니다. 텍스트 위치는 0부터 시작하는 Unicode 코드 포인트 기준이며 끝 위치는 제외합니다.
4. 제목·프로필/경력·예매 안내를 구분하여 `PROGRAM`, `NON_PROGRAM`, `UNCERTAIN` 구간과 이유를 만듭니다. 명확한 제목 없는 작품 목록도 불확실 후보로 남깁니다. 날짜·시리즈 충돌이나 여러 날짜에 걸친 공연은 현재 회차의 곡목이라고 확정하지 않습니다.
5. 같은 구간·같은 이미지 단 안에서만 작곡가를 이어 적용합니다. 다른 작곡가나 알 수 없는 이름을 만나면 이전 문맥을 끊습니다. 두 단은 bbox의 좌우 위치로 구분하는 보수적 규칙이며 복잡한 레이아웃을 완전히 복원하지는 못합니다.
6. 작곡가·장르·작품번호·작품/곡 번호·조성·악장·편곡/발췌를 분리합니다. 충돌·OCR 숫자 모호성은 연결을 막습니다. 미등록 작품은 `track_id = null`로 남기며 비슷한 등록곡을 대입하지 않습니다.
7. 모든 자동 후보는 `REVIEW_REQUIRED`입니다. OCR 신뢰도로 자동 확정하지 않습니다.

관계는 `EXACT`, `WHOLE_WORK_REFERENCE`, `ARRANGEMENT_OR_EXCERPT`, `AMBIGUOUS`입니다. 부모 작품만 적힌 소나타는 등록된 악장 ID와 포함 관계를 제시할 수 있지만, **각 악장의 실제 연주를 뜻하지 않습니다**. 특정 악장 번호가 있으면 그 악장으로만 제한합니다. 악장명만 있고 구조화된 번호를 판단할 수 없으면 연결을 보류합니다. 수동 확정 후에도 이 관계 구분은 유지됩니다.

후보의 `outcome`은 `MATCHED`(등록곡 후보), `UNREGISTERED`, `AMBIGUOUS`, `CONFLICT`입니다. 이는 수동 `review_status`와 다른 항목입니다.

## DB와 외부 설정

신규 마이그레이션은 [202610150001_concert_program_analysis.sql](../supabase/migrations/202610150001_concert_program_analysis.sql)입니다. 기존 001·002가 적용된 Supabase 프로젝트의 **SQL Editor에서 신규 파일 전체를 실행**하세요. 기존 마이그레이션은 수정하지 않았습니다. Supabase CLI를 연결하지 않아도 됩니다.

2026-10-15 검증 시 신규 테이블 조회는 HTTP 404였습니다. 이번 세션에서는 이 마이그레이션을 원격 DB에 적용하지 않았으므로 실제 후보 저장·수동 검토 RPC의 원격 실행은 미검증입니다. 로컬 PostgreSQL에서는 세 마이그레이션과 실제 RPC를 실행해 검증했습니다.

| 구성 | 저장 항목 |
| --- | --- |
| `concert_program_catalogs` | 실제 카탈로그의 식별 입력 스냅샷·SHA-256. 카탈로그별 한 번 저장 |
| `concert_program_analyses` | 공연·이미지·OCR·원본 시도 ID, 이미지 revision, 공연 문맥, matcher 버전·카탈로그 hash, 구간·한계, 현재 분석 여부 |
| `concert_program_candidates` | 실제 곡/작품 ID 또는 null, 원문/정규화 식별자, 관계·결과·검토 상태, 복수 인용 근거·위치·이유, 검토 시각·메모 |
| `concert_program_reviews` | 수동 확정/반려의 누적 이력, 시각·메모·`LOCAL_SERVICE_ROLE_OPERATOR` |
| `concert_program_candidate_status` 뷰 | 원래 판정과 유효 판정, 오래된 근거 사유, 현재 유효한 확정 여부 |
| 기존 이미지의 `evidence_revision` | 비활성화·재활성화·출처/종류 변경 시 증가. 일반 재수집은 유지 |
| 기존 공연의 `program_context_revision` | 공연명·공연장·기간 변경 시 증가. 원래 값으로 돌아와도 과거 확정을 부활시키지 않음 |

서버 키로 실행한 검토를 로그인 사용자로 표시하지 않습니다. 추가 테이블은 RLS를 켜고 service_role 권한만 명시했습니다. anon/authenticated 공개 정책은 없으며, 기존 로그인·보관함 정책도 변경하지 않았습니다. 전체 OCR 원문을 새 테이블에 복제하지 않고 인용·위치와 원본 결과 FK를 보존합니다.

환경변수는 기존 프로젝트 루트 `.env`의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`만 사용합니다. **새 변수·KOPIS 호출·유료 API·Python 서버 설정은 필요하지 않습니다.** 키에 `VITE_` 접두사를 붙이지 마세요.

## 재실행과 근거 수명

동일 OCR·원본 시도·이미지/공연 revision·공연 문맥·카탈로그 hash·matcher 버전은 같은 분석 ID를 반환하며 수동 확정·반려를 덮어쓰지 않습니다. 같은 키에 다른 출력이 생기면 matcher 버전을 올리라는 오류를 냅니다. 새로운 버전/근거의 저장은 **그 이미지의 이전 분석만** 과거 상태로 바꿉니다. 후보가 0개인 새 분석도 동일하게 처리합니다. 다른 공연·미분석 이미지는 일괄 비활성화하지 않습니다. 이미지별 저장 전체는 RPC 한 트랜잭션입니다.

최신 OCR 실패·새 결과/시도·이미지 비활성화·재활성화·공연 문맥 변경·분석 교체 시 과거 수동 기록을 남긴 채 `is_effectively_confirmed = false`, `effective_status = REVIEW_REQUIRED`로 표시합니다. 성공 결과가 다시 같아져도 이전 확정이 자동 부활하지 않습니다. 재분석 후 새 후보를 다시 검토해야 합니다. 이미지의 활성 상태는 최신 조회 시점에 판정하므로 저장 후 비활성화되어도 자동 반영됩니다.

DB 뷰는 로컬 파일 변경을 알 수 없습니다. 현재 카탈로그·matcher 버전에 맞는 사용은 **두 버전 필터도 함께 적용**해야 합니다. `list`는 현재 이미지 분석 및 현재 로컬 버전을 필터하고, `show`는 `local_version_current`를 표시하며, 검토 명령은 버전이 다른 후보를 거절합니다.

이미지 URL의 현재 바이트는 이번 명령으로 확인하지 않습니다. 현재성은 **마지막으로 DB에 기록된 OCR 시도와 수집 상태의 범위**입니다. 동일 URL의 원격 내용이 조용히 바뀌었지만 새 시도가 없으면 감지할 수 없습니다. 또한 새 이미지가 추가되더라도 공연의 다른 이미지 전체 분석 완료를 의미하지 않습니다. 이 단계는 공연 전체 프로그램 확정이나 검색 공개 단계가 아닙니다.

## Windows Git Bash 실행 순서

먼저 맨 위의 특정 공연 dry-run과 원본 이미지 확인을 진행한 뒤, Supabase SQL Editor에 신규 마이그레이션을 적용하세요. 이후 다음 순서로 실행합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas

# 1. 대상/누락 사유 조회, 전체 저장 OCR 표본 분석 (DB 쓰기 없음)
npm run program:analyze -- targets
npm run program:analyze -- analyze --dry-run
npm run program:analyze -- analyze --dry-run --kopis-id PF296289

# 2. 먼저 확인한 한 공연의 분석 저장
npm run program:analyze -- analyze --save --kopis-id PF300258
# 필요하면 현재 저장 OCR 표본 전체를 저장
npm run program:analyze -- analyze --save

# 3. 검토 필요 후보 조회
npm run program:analyze -- list --kopis-id PF300258

# 4. 목록의 실제 UUID를 입력해 상세·원본 링크·analysis_id 확인
CANDIDATE_ID='목록에 표시된 후보 UUID'
npm run program:analyze -- show "$CANDIDATE_ID"

# 5. 원본 이미지와 공연/회차, 작품 번호, 관계를 직접 확인한 경우에만 단건 결정
ANALYSIS_ID='show에 표시된 analysis_id UUID'
npm run program:analyze -- confirm "$CANDIDATE_ID" --analysis-id "$ANALYSIS_ID" --note '원본 및 회차·작품·연주 범위를 직접 확인한 내용'
# 잘못된 후보라고 확인한 경우에는 대신 반려
npm run program:analyze -- reject "$CANDIDATE_ID" --analysis-id "$ANALYSIS_ID" --note '원본에서 확인한 반려 사유'

# 검증
npm run test:program
npm test
npm run build
```

`analyze`는 `--save`를 지정해야 쓰며 기본은 dry-run입니다. dry-run은 Supabase 읽기·텍스트 분석만 수행합니다. 이미지 다운로드·OCR 실행·DB 쓰기를 하지 않습니다. `list`의 오래된 근거 후보는 재분석 대상이며 그대로 확정할 수 없습니다. 미등록/null 곡이나 모호한 연결도 확정할 수 없습니다. 일괄 확정은 제공하지 않습니다. 현재 실제 표본의 곡 ID는 모두 null이므로 **그대로 confirm을 실행할 대상은 없습니다**.

Supabase 확인용 읽기 SQL은 [concert_program_analysis.sql](../supabase/verification/concert_program_analysis.sql)입니다.

## 실제 표본과 검증 범위

실제 DB의 공연 10개·상세 이미지 17개 중 성공 OCR 5개를 읽었습니다. 미처리 상세 이미지 12개는 제외했으며, 공연 수집/재판독은 실행하지 않았습니다. 세부 수치와 원문은 동봉한 표본 JSON의 `checked_at` 시점 기준입니다.

- `PF296289`: 프로그램 영역의 5개 작품 후보. 멘델스존/프로코피예프는 `IlI`·`No.lin` 숫자 판독 모호성, 생상스·프랑크·리스트 협주곡은 현 카탈로그 미등록. 뒤의 학력·음반·경력은 제외합니다. 회차별 곡목의 연결은 불확실합니다.
- `PF300258`: 프로그램 영역의 6개 작품 후보. 빌라로보스의 영문/한글 번호 충돌과 기타 5개 미등록 작품. ARTIST 이후 프로필·관람 안내는 제외합니다. 여러 회차의 연주 범위는 별도 확인이 필요합니다.
- 나머지 3개 OCR은 행사 소개·회차 포스터 등으로 식별 가능한 작품 목록이 없어 연결 후보를 만들지 않습니다.

총 **11개 후보 중 등록곡 연결 0개, 미등록 8개, 모호성 3개**입니다. 프로그램 제목이 있는 2개 구간도 회차 문맥 때문에 `UNCERTAIN`입니다. 이는 제한된 표본 결과이며 정확도 백분율이나 일반적인 자동 확정 가능성을 의미하지 않습니다. 원문의 `G mninor`, `No.lin`, `제7번` 등을 수정하거나 보이지 않는 곡을 추정하지 않았습니다.

로컬 테스트는 프로필/과거 공연 제외, 날짜/시리즈 충돌, 작곡가/번호/조성 충돌, 전곡/악장/편곡, 미등록 보류, 읽기 전용 dry-run, 중복 방지, 수동 이력 보존, 최신 실패/내용 변경/활성 변경의 확정 무효화, 다른 이미지 보존, 원문 인용 검증, 트랜잭션 롤백, RLS/권한을 검증합니다. 실제 DB에서는 읽기만 했고 확정·반려 테스트는 로컬 fixture에서만 수행했습니다.

최종 검증은 전체 `npm test` **164개 통과**(신규 전용 13개 포함), `npm run build` 성공입니다. 브라우저 빌드 결과에 서버 비밀값과 분석·검토 진입점이 포함되지 않는 것도 확인했습니다. Python 환경과 OCR 엔진을 변경하지 않아 Python 보조 테스트와 실제 재판독은 이번에 재실행하지 않았습니다.

아직 부족한 경우는 모호한 한 단어 작품명/작곡가, OCR 글자 누락·잘못된 숫자, 여러 단/복잡한 읽기 순서, 특정 악장의 이름만 있는 표기, 한 프로그램 안의 복잡한 작품집·악장 범위, 카탈로그 밖 장르/작곡가입니다. 이런 경우 후보를 놓치거나 보수적으로 보류할 수 있습니다. 웹 화면 전환·자동 실행·큐·외부 배포는 구현하지 않았습니다.
