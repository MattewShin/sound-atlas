# 공연 검색 지원 현황 — 2026-10-22

작업 CA-SEARCH-20261022-001 / 명세 1. 조사·최소 검증 완료이며 운영 자동화 적용 완료가 아니다.

- 고정 코드: [ad5ab3cf5984146c4b2dc94428a146944af23fab](https://github.com/MattewShin/sound-atlas/tree/ad5ab3cf5984146c4b2dc94428a146944af23fab)
- 곡별 결과: [JSON](CONCERT_SEARCH_COVERAGE_2026-10-22.json)
- 대표 사례: [격리 DB·HTTP·DOM 결과](CONCERT_SEARCH_REPRESENTATIVE_2026-10-22.json)
- 운영 선행 조건과 적용 준비: [절차](CONCERT_SEARCH_OPERATIONS_2026-10-22.md)
- 원본 로컬: main / 1607ca201c3a559bc7f28aabe998ef062db02ef9 + 기능 변경 28개. 공동 문서 5개까지 포함한 시작 시 미커밋 파일 33개를 보존했다. 원본 branch/HEAD/index를 변경하지 않고 별도 소스 공간에서 작업했다.

## 조사 범위와 분모

활성 목록 `src/data/musicData.js:tracks`에서 **291 track / 252 work**를 다시 집계했다. 291이라는 이전 README 수치를 입력 상수로 쓰지 않았다. 악장은 개별 track이며 상위 work 식별만으로 악장 연주를 확인하지 않았다.

DB 원본 조회 시작은 2026-10-22 10:58:31 KST, 공개 API 조회는 10:58:45 KST 이후다. 최종 JSON은 그 저장 snapshot을 재사용해 생성했으며 `generatedAt`과 `snapshotGeneratedAt`을 구분한다. 관측 조건은 **서울, 2026-10-22~2026-11-21(31일)**이다. 그래프는 날짜가 겹치는 서울 공연 전체를 읽고 검색 단계에서 공연예정/공연중·기간·현재성·EXACT·receipt·identity·버전을 적용했다. 개별 GET 사이의 DB 변경을 원자적으로 고정하지 않았으므로 조회 중 경쟁 변경 가능성은 남는다.

| 단위 | 조회 수 |
| --- | ---: |
| 고유 저장 공연 | 47 |
| 이미지 | 113 |
| OCR 결과 / 시도 | 53 / 64 |
| 분석 / 후보 | 92 / 246 |
| 검토 receipt | 2 |
| 검색 유효성 view 행 | 246 |
| 현재 사용할 OCR이 있는 이미지 | 53 |
| 현재 성공 OCR이 없는 이미지 | 60 |
| 현재 OCR 재파싱 후보 / 후보 생성 이미지 | 151 / 26 |
| 사용 가능 OCR이나 후보가 없는 이미지 | 27 |

53개 사용 가능 이미지 중 26개는 후보를 만들고 27개는 만들지 않았다. 이는 프로그램이 없는 포스터와 추출 실패를 아직 구별하지 않은 이미지 집계다. 이를 모두 추출 버그라고 판정하지 않았다. 60개도 원격에 아직 존재할 다른 OCR까지 없다는 뜻이 아니라 조사 snapshot에서 현재 성공 OCR이 없다는 뜻이다.

원격 요청은 **Supabase GET 27회 + 공개 서비스 GET 4회, 원격 쓰기 0회**다. 이후 재집계·대표 사례 검증은 이 snapshot을 재사용하여 원격 요청이 없다. 원문 OCR·포스터·환경값·전체 private graph는 게시하지 않았다. 로컬 비공개 graph SHA-256은 `4c188a06894de4a35063ebb3dfe67b4f6f216e6e2faa307007ee04dbea38f830`이다.

## 두 축의 전곡 결과

| 식별 준비 상태: 등록 표시명 + 명시 악장 정적 probe | 곡 수 |
| --- | ---: |
| READY | 279 |
| UNSUPPORTED_NOTATION | 12 |
| 합계 | 291 |

READY는 해당 등록 표시명을 정규화 matcher에 넣었을 때 그 track으로 EXACT가 나왔다는 합성 정적 검사다. 실제 포스터·OCR의 모든 별칭을 처리하거나 공연 검색이 성공했다는 의미는 아니다. 작품번호를 일괄 필수로 만들지 않았다. 예를 들어 사티는 작곡가·제목·명시 번호로 준비 여부를 판단한다. metadata의 권/모음곡·opus member·악장 요건은 JSON의 `requiredIdentityRules`와 `identityFields`에 있다.

UNSUPPORTED_NOTATION 12곡은 차이콥스키 사계 전체다. 등록 표시명 `차이콥스키 사계 Op.37a : 6월`과 같은 월 표기를 쓰면 `ITEM_NUMBER_REQUIRED`로 매칭되지 않았다. 대조 합성 검사에서 같은 metadata의 명시 `No.1~12` 표기는 **12/12**가 해당 track으로 매칭됐다. 따라서 metadata 자체가 없거나 이 12곡 전체를 어떤 표기로도 식별할 수 없다는 결론은 아니다. 실제 공연 자료에서의 월 표기 검증은 추가로 필요하다.

처음 작성한 조사 probe는 parent work의 마지막 악장 영문 제목과 대문자 Movement 라벨을 조합해 잘못된 정적 실패를 만들었다. 도구에서 각 track의 변경하지 않은 한글 표시명과 명시 악장으로 바로잡았으며, 최종 수치는 수정된 고정 코드 기준이다. 서비스 matcher를 이 과정에서 고치지는 않았다.

| 저장 자료 관측 단계 | 곡 수 |
| --- | ---: |
| CONFIRMED_FOUND | 2 |
| UNCONFIRMED | 2 |
| AMBIGUOUS: 상위 작품만 있고 악장 근거 없음 | 3 |
| NO_EVIDENCE_IN_INSPECTED_DATA | 284 |
| 합계 | 291 |

CONFIRMED_FOUND는 실제 DB view snapshot을 검색 서비스에 재현해 현재 검색 필터를 통과한 결과다. 모든 291곡에 공개 HTTP 요청을 보내지는 않았다. 쇼팽 발라드 4번과 리스트 사랑의 꿈 3번의 공개 서비스 응답도 대조했으며 각 PF295548 1건이다. **2 track–concert 연결 / 고유 공연 1개**로 중복을 제거했다.

UNCONFIRMED는 브람스 Op.118 No.2(PF295548)와 쇼팽 환상즉흥곡 Op.66(PF295588)다. 쇼팽 발라드 4번에는 이미 검색되는 공연 외에 PF301161의 현재 OCR 후보도 있다. AMBIGUOUS 3곡은 베토벤 월광 1~3악장이며 저장 후보가 상위 작품만 가리켜 개별 악장으로 확장하지 않았다. 증거 ID와 공연 ID는 곡별 JSON에 있다.

284곡은 **이번 범위에서 해당 track에 귀속할 후보/재파싱/확정 근거 미발견**이다. 해당 곡의 공연 부재·전국 미지원·수집 완료를 뜻하지 않는다. OCR이 없거나 후보 생성 실패한 자료를 특정 track의 실패 원인으로 임의 배정하지 않았다. `PROGRAM_EXTRACTION_FAILED`·`MATCH_FAILED` 같은 track별 단계를 근거 없이 채우지 않았다. 같은 곡에 확정·미확정 후보가 함께 있으면 주 단계와 별도로 reasons/evidenceRefs에 모두 남겼다.

현재 OCR 재파싱 151개 논리 후보에서 자동 규칙을 통과한 후보는 5개(4 track / 3 공연), 미연결 조건은 146개다. 5개에는 기존 확정과 중복되는 후보가 포함되므로 신규 연결 성과가 아니다. reason 집계는 다중 값이므로 더해 151개와 비교하지 않는다. `CATALOG_TARGET_MISSING` 89, `PROGRAM_EVIDENCE_MISSING` 46, 날짜 범위 모호 53, 작곡가 미확인 24 등이 겹쳐 있다. 같은 원문을 재파싱한 것은 독립된 2차 관측이 아니다.

## 현재 실행 조건

- Node 22.18.0 / npm 10.9.3 / Windows PowerShell. 고정 코드의 `stored-program-3`, `program-auto-1` 사용.
- 로컬 `npm start`용 .env 설정과 Vite development 설정 모두 backend=kopis. Vite의 write/review/search 버전은 stored-program-3, scheduleEnabled=true로 읽혔다. 실제 프로세스를 재시작하거나 원격 상태와 동기화하지 않았다.
- 공개 `sound-atlas.vercel.app`의 상태 API는 HTTP 200, backend=supabase, analysisVersion=stored-program-3. 배포 commit SHA는 **UNKNOWN**이다. 상태 버전을 이번 공유 코드의 배포 증거로 간주하지 않는다.
- service-role OpenAPI와 실제 테이블/view GET은 성공했다. v3 저장, identity 검토, rematch 함수는 파라미터 이름·형식을 대조했다. view에는 검색이 사용하는 6개 identity/현재성 필드가 있다. 파라미터/필드는 JSON의 environment에 기록했다.
- 자동화 5 RPC(decide/queue/input_hash/finish/defer)는 현재 service-role API에서 **NOT_EXPOSED_TO_SERVICE_ROLE**다. 자동화 column들도 OpenAPI에 없다. 현재 코드 preflight는 `PROGRAM_AUTOMATION_MIGRATION_REQUIRED`로 중단한다. 이는 접근 성공 시의 노출 상태이며 단순 401/403을 migration 부재로 바꾼 판정이 아니다. DB 내부 함수 존재·직접 SQL 권한은 독립 조회하지 못했다. OpenAPI에 없는 scalar 반환형도 추정하지 않고 null로 남겼다.
- version policy 테이블은 읽기 성공했으나 0행이다. 공유 코드의 preflight는 해당 버전이 명시적으로 disabled가 아니면 허용하며, SQL 권한 전반의 증명은 아니다.
- 실제 예약은 원본 로컬 프로젝트를 가리킨다. daily 08:40 KST, 다음 2026-10-23 08:40, PT32M/1,800초, OCR 20·분석 20·이미지 확인 40, IgnoreNew, 마지막 결과 1. 등록 조건 대조 RuntimeVerified=true는 등록 설정에 한정되며 배치 실행 성공이 아니다. 원본 로컬 HEAD는 여전히 이전 SHA + 미커밋 코드다.

## 대표 사례 — 완료 단계와 한계

| 사례 / 환경 | 실제 결과 |
| --- | --- |
| 브람스 intermezzo Op.118 No.2 / PF295548, 실제 저장 snapshot → 로컬 PGlite | OCR 재분석 → EXACT 작품 식별 → 새 자동 receipt 1개. 기존 receipt 2개 보존, 미연결 12개, 재시도/실패 0 |
| 같은 격리 DB → 실제 HTTP handler /api/concerts, 서울 10/22~10/27 | HTTP 200, PF295548 1건. 기존 쇼팽·리스트도 각 1건 |
| 위 HTTP 응답 → 실제 React ConcertCard / JSDOM | 카드 1개, 실제 공연 제목·브람스 표시 확인. 실제 브라우저 시각 검사·전체 App 검색 입력 흐름은 미검증 |
| 격리 DB의 동일 공연을 10/21 종료로 바꾸고 rollback | 검색 0건. 실제 데이터 기반의 **로컬 변이**이며 운영 DB는 변경 안 함 |
| 격리 DB의 근거 이미지 비활성 후 rollback | 검색 0건. 오래된/유효하지 않은 근거 차단 |
| 합성 텍스트: Brahms Op.119 No.2 / Beethoven Op.13 상위 작품 / four hands 편곡 | 세 경우 모두 자동 확정 거절. 합성 fixture이며 실자료 양성과 구분 |
| 운영 DB·공개 API의 브람스 | HTTP 200이나 0건. 양성 성공으로 세지 않음. 신규 자동화 적용 및 원격 확정은 미완료 |

검증 원문과 입력·ID·버전·쿼리는 대표 사례 JSON에 있다. 포스터를 사람이 매번 확정하는 운영을 추가하지 않았다. 이번 검증은 개발 품질 확인이다.

## 다음 개선 대상 3개

1. **작성된 자동화의 운영 선행 조건 정리**: 직접 관측된 미확정 track 2개와 새 공연 근거가 있는 쇼팽 track 1개, 5개 규칙 통과 후보를 대상으로 준비한다. 예상 파일은 기존 automation SQL·preflight·운영 안내다. 현재 RPC/column 상태를 SQL 권한과 함께 확인하고 적용 후 제한 검증에서 identity/원문/악장·만료 차단을 유지해야 한다. 완료 기준은 필요한 함수·파라미터·권한·필드 일치, 제한 사례의 실제 receipt와 검색 결과 대조, 같은 입력 재실행의 새 쓰기 0이다. 신규 운영 적용은 이번 범위 밖이다. 로컬 통과 5개를 예상 운영 신규 연결 수로 발표하지 않는다.
2. **자료·추출 병목의 구분 계측**: 113개 이미지 중 현재 성공 OCR 없음 60, 사용 가능 OCR 53 중 후보 없음 27을 구분해야 한다. 284곡의 근거 미발견과 관계는 UNKNOWN이며 이 수 전체를 OCR 문제 영향 곡 수로 간주할 수 없다. 예상 파일은 coverage 진단·programAnalysis의 구간/탈락 이유·보고서다. PF295588, PF301161, PF295548처럼 이미 저장된 유효 근거와 대조하고, 후보 없음 자료 중 실제 프로그램/홍보/해설/프로필을 구별하는 제한된 개발 표본으로 원인을 좁힌다. 완료 기준은 이미지별 단계·제외 이유와 attributable track 연결을 기록하고 biography·날짜·다른 작품/악장 오연결 회귀 0을 확인하는 것이다. 전체 재수집/OCR은 시작하지 않는다.
3. **사계 월 표기 12곡의 제한적 정규화**: 동일 catalog metadata의 1~12월을 작품의 명시 item 번호와 대조하는 개선을 제안한다. 예상 파일은 `programMatchingNormalization.mjs`, `programItemBoundaries.mjs`, 관련 테스트이며 필요 시 분석 버전을 갱신한다. 완료 기준은 Op.37a+작곡가+사계 맥락의 월 이름/한국어 월 표기 12곡, No.N 대조, 영문월/오타의 추가 실자료 검증이다. 공연 날짜의 6월을 곡 6번으로 오인하지 않고 다른 작곡가 사계·모음곡 전체·번호 충돌은 계속 차단해야 한다. 현재 12/12 명시 No 대조는 합성이며 이번 저장 범위에 이 표기의 실제 프로그램은 아직 없다. 새 연결 효과는 UNKNOWN이다.

## 재현과 검증

코드와 관련 운영 문서·의존 파일을 같은 코드 커밋에 게시했다. 게시된 32개 코드/관련 문서 blob이 검증한 소스와 일치함을 확인했다. 원격 기준의 나머지 코드도 원본 HEAD와 동일함을 tree로 대조했다. .env·캐시·node_modules·원문 graph는 제외했다.

```powershell
# 고정 코드 checkout과 의존 설치 후. 실제 .env 값은 게시하지 않는다.
npm.cmd test
npm.cmd run build
npm.cmd run diagnose:concert-coverage -- --code-ref=ad5ab3cf5984146c4b2dc94428a146944af23fab
# 실제 자료가 있는 환경에서 GET 복사 → 로컬 격리 DB / HTTP / DOM 확인
npm.cmd run verify:program-auto
# 이미 읽은 비공개 snapshot 재사용 시 (원격 GET 0)
node scripts/diagnoseConcertSearchCoverage.mjs --offline=true --code-ref=ad5ab3cf5984146c4b2dc94428a146944af23fab
node scripts/verifyProgramAutomation.mjs PF295548 --snapshot=.cache/search-coverage/private-graph.json
```

실제 실행 결과: **전체 365/365 통과**, 실패/skip 0. 프로덕션 build 성공(56 modules, 기존 500 kB 초과 chunk 경고 유지). 대표 사례 도구 성공, 동일 입력 두 번째 실행의 쓰기 0. coverage의 291 ID 유일성·252 work·두 축 합계 일치 확인. 공개 API 4회 외 실제 브라우저 검사, 운영 PostgreSQL 다중 세션 경쟁 부하, 배포, SQL 적용, 자동 확정 원격 쓰기, 실제 통합 배치 run은 실행하지 않았다.

실데이터 재현에는 권한과 해당 시점 자료가 필요하다. private graph를 게시하지 않아 임의의 외부 검토자가 원문 없이 같은 실자료 결과를 재현할 수 있다는 뜻은 아니다. 고정 코드의 합성/격리 회귀 테스트는 운영 권한 없이 재현 가능하다.
