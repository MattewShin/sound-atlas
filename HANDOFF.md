# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-SEARCH-20261022-001
- 명세 버전: 1
- 현재 상태: IMPLEMENTED
- 마지막 작성자: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 명세·결과 브랜치: `codex/ca-search-20261022-001`
- 선행 인계 기준 커밋: `05d0af6bc889eb2813d5a7fed1b3c11a71808866`
- 코드 기준 SHA: ad5ab3cf5984146c4b2dc94428a146944af23fab (같은 작업 브랜치의 코드 공유 커밋)
- 이전 작업: [공동 작업 테스트](docs/collaboration/archive/CA-COLLAB-20261022-001/CURRENT_TASK.md) / [최종 인계](docs/collaboration/archive/CA-COLLAB-20261022-001/HANDOFF.md)

## 웹 GPT → Codex

CURRENT_TASK.md의 공연 검색 확장 1차를 진행한다. 기존 기능 코드 공유, 현재 실행 조건 확인, 대표 사례 검증, 활성 등록곡 전체의 식별 준비 상태와 저장 자료 관측 조사를 수행한다.

이전 인계의 Q-001(SQL/예약 의존성)과 Q-003(관련 코드 공유)을 이번 실제 작업으로 이어받는다. Q-002의 방향은 미연결 근거와 재평가 가능성을 보존하며 검색 품질 개선의 기준을 함께 제안하는 것이다. SQL 문제 해결만 반복하면서 곡별 검색 확장 조사를 미루지 않는다.

### 이미 알려진 내용 — 현재 사실로 재검증 필요

- 이전 Codex 보고: main/1607ca201c3a559bc7f28aabe998ef062db02ef9에 미커밋 기능 변경 28개. 자동화 코드와 SQL은 문서 브랜치에 공유되지 않았음.
- 이전 Codex 보고: daily 08:40 KST 예약 등록, 마지막 실행 exit 1. migration 미적용 가능성은 운영 의존성으로 남음.
- 원격 main의 문서·설정에서는 기본 KOPIS/Tesseract와 선택 가능한 Supabase 검색, 로컬 EasyOCR 경로가 분리됨. 실제 배포/로컬 설정은 이번 작업에서 확인해야 함.
- 이전 README의 활성 곡 수는 291곡이었으나 이번 산출물은 현재 활성 목록에서 다시 집계해야 함.

### 명세 작성자가 이번에 한 일

완료된 공동 작업 문서를 원문 그대로 보관하고 새 CURRENT_TASK·HANDOFF를 작성했다. 관련 기능 코드나 운영 환경을 이번 문서 준비 단계에서 실행·검증하지 않았다. 명세 저장 결과는 해당 브랜치의 GitHub 이력에서 확인한다.

## Codex → 웹 GPT: 구현 결과

- 작업 ID / 명세 버전 / 상태: CA-SEARCH-20261022-001 / 1 / IMPLEMENTED
- 작성 시각: 2026-10-22 13:29 KST
- 읽은 명세 브랜치 / 전체 SHA: `codex/ca-search-20261022-001` / `4d4b4c5d4daa8d0be7f2536a51d356910d00356b`. 5개 협업 문서를 이 SHA에서 읽고 현재 작업 ID·명세를 대조했다.
- 공유 코드: [ad5ab3cf5984146c4b2dc94428a146944af23fab](https://github.com/MattewShin/sound-atlas/commit/ad5ab3cf5984146c4b2dc94428a146944af23fab). 조사 결과 저장 커밋은 이 HANDOFF의 GitHub 이력에서 확인한다.
- 원본 로컬: main / `1607ca201c3a559bc7f28aabe998ef062db02ef9`. 시작 시 tracked 수정 17 + untracked 기능 11 + untracked 공동 문서 5 = 33개 파일, staged 0. 이전 28개는 기능 파일 수이며 현재 전체 미커밋 수와 구분한다.
- 보존: 원본 33개 파일 SHA-256·branch·HEAD·index를 저장하고 별도 `.cache/ca-search-20261022-001/source`에 HEAD archive와 관련 파일을 복사했다. 원본에서 pull/switch/reset/stash/stage/commit을 실행하지 않았다. 게시와 결과 작성은 GitHub API 및 격리 소스에서 수행했다.
- 원격 미공유: 원본 .env/.env.local, 원문 OCR graph, 로컬 로그·캐시·의존 설치·빌드 산출물은 게시하지 않았다. 관련 기존 기능 파일 28개와 의존 코드/SQL은 선별 공유했으며 원본 로컬에서는 여전히 미커밋 상태다.

### 공유한 변경과 이유

기존 자동화 store/runner·SQL·daily/analysis-only 연결·current evidence 처리·KOPIS 진단과 관련 테스트/운영 문서를 공유했다. 기존 기능 내용은 최초 인계의 “코드 작성됨, 원격 미공유” 상태에서 이번 명세에 따라 검토 가능한 코드 상태로 바꿨다.

이번에 추가/보완한 내용:

- `scripts/diagnoseConcertSearchCoverage.mjs`: GET-only DB/OpenAPI/공개 검색 조사, 활성 곡 전수 정적 probe, 실제 저장 snapshot의 검색 필터 재현, 두 축·근거·분모 JSON. 원문 graph/schema는 ignored cache에만 저장한다.
- `scripts/verifyProgramAutomation.mjs`: 기존 실제 자료 격리 검증에 비공개 snapshot 재사용 옵션, 실제 로컬 HTTP API → 실제 React 카드/JSDOM, 만료·비활성 근거 로컬 rollback 및 합성 번호/악장/편곡 음성 사례를 추가했다. 운영 쓰기 경로는 추가하지 않았다.
- `src/components/ConcertScreens.jsx`: 자동 receipt도 사용되는 DB 검색의 “수동 검토” 고정 문구를 공통 작품 식별 검증 문구로 고친 작은 화면 수정. 검색 필터·ID·평가·보관 데이터 변경은 없음.
- `docs/CONCERT_PIPELINE.md`, `docs/PIPELINE_ANALYSIS_ONLY.md`: 자동 결정·완료·재시도 RPC와 identity/automation migration 사전 조건을 실제 공유 코드에 맞췄다. package에 coverage 진단 명령을 추가했다.
- [전곡 요약](docs/CONCERT_SEARCH_COVERAGE_2026-10-22.md), [전곡 JSON](docs/CONCERT_SEARCH_COVERAGE_2026-10-22.json), [대표 검증 JSON](docs/CONCERT_SEARCH_REPRESENTATIVE_2026-10-22.json), [운영 적용 준비](docs/CONCERT_SEARCH_OPERATIONS_2026-10-22.md)를 작성했다. 기존 PROGRAM_AUTOMATION_RESULTS JSON은 이전 보고임을 구분해 공유했다.
- 사용자 평가·안정적인 곡 ID·보관 기록은 변경하지 않았다. 대규모 matcher/지역·기간/UI 개편은 시작하지 않았다.

게시된 코드·관련 문서 32개 blob이 실제 검증 소스와 동일함을 확인했고, 명세 브랜치에 있던 나머지 코드는 로컬 기준 HEAD와 동일함을 tree로 대조했다. 코드 커밋은 이 32개와 IN_PROGRESS 상태의 CURRENT_TASK/HANDOFF를 합해 34파일 변경이다. 결과 문서는 후속 커밋으로 별도 게시하여 코드 기준 SHA가 자기 자신을 가리키지 않도록 했다.

### 현재 DB·예약·검색 환경과 운영 의존성

- DB snapshot: 2026-10-22 10:58:31 KST 시작, 서울·2026-10-22~11-21와 날짜가 겹치는 공연 47개. 실제 GET은 성공했다. 113 이미지, OCR 결과 53/시도 64, 분석 92, 후보/view 246, receipt 2를 읽었다. 최대 200행 cursor 페이지와 최대 50페이지 제한을 두었고 truncation 없이 완료했다.
- v3 저장·identity 검토·rematch의 API signature/파라미터와 조회 가능한 타입을 확인했다. 검색 view의 현재성/identity/버전 필드도 있다. JSON environment에 세부 필드·권한 확인 범위를 남겼다. DB 내부 pg_proc/grant 및 API가 반환형을 노출하지 않은 함수의 scalar 타입은 미검증이다.
- **운영 BLOCKED 항목**: 자동화 decide/queue/input_hash/finish/defer 5개 RPC 및 신규 column이 service-role API에 노출되지 않는다. 현재 코드에서는 `PROGRAM_AUTOMATION_MIGRATION_REQUIRED`로 사전 검사 단계가 중단된다. root OpenAPI GET 성공 후 판정한 노출 상태이며, 401/403을 migration 부재로 단정하지 않았다. 함수 미생성인지 권한/schema cache 문제인지는 직접 SQL로 구별하지 못했다.
- version policy는 읽기 성공, 0행. 현재 preflight의 명시 disabled 검사에서 실패하지 않는 것과 전체 운영 SQL 준비 완료를 구분한다.
- 예약 읽기 전용 Status: 원본 프로젝트의 `Invoke-ConcertPipeline.ps1 -Mode run -Profile daily`, 08:40 KST, PT32M/1,800초, OCR20·분석20·이미지 확인40, IgnoreNew. 마지막 10/22 08:40 결과1, 다음10/23 08:40. 실제 등록 조건 대조 RuntimeVerified=true는 REGISTERED_CONFIGURATION 범위이며 배치 성공은 아님. 원본 실행 코드는 기존 HEAD+미커밋 파일이어서 “공유 SHA를 checkout해 실행 중”이라고 표시하지 않는다.
- 로컬 .env 기반 서비스 및 Vite development 설정은 kopis backend다. Vite의 write/review/search 버전은 stored-program-3, scheduleEnabled=true. 공개 서비스 GET은 backend=supabase / stored-program-3 / configured=true / HTTP200. **배포 SHA는 UNKNOWN**이며 현재 공유 코드가 배포됐다고 해석하지 않는다.
- 운영 의존성에도 전곡 조사·실자료 snapshot 분석·PGlite/HTTP/DOM 검증은 계속하여 완료했다. 직접 DB 쓰기·신규 migration/backfill·실제 배치 run·배포·예약 변경은 모두 0회다.

### 대표 사례 결과

조건·ID·버전·구체적 응답은 [대표 검증 JSON](docs/CONCERT_SEARCH_REPRESENTATIVE_2026-10-22.json)에 있다.

1. 실제 PF295548 저장 OCR을 로컬 PGlite에 재현하고 migration을 **로컬에만** 적용했다. `brahms-intermezzo-op118-no2`(workId 동일)에서 현재 OCR → EXACT 식별 → 자동 receipt → 실제 HTTP `/api/concerts`(서울 10/22~10/27) 응답 HTTP200/PF295548 1건 → 실제 React ConcertCard/JSDOM에서 카드1·실제 공연명·브람스 표시까지 통과했다.
2. 첫 실행은 자동 확정1/중복 유지2/미연결12/실패0/재시도0, 기존 receipt 보존. 같은 입력 두 번째 실행은 새 쓰기0, 남은 v3 수동 대기 후보0. 이는 로컬 실제 자료 재현 결과다.
3. 같은 실제 자료의 **로컬 변이 후 rollback**: 공연을10/21 종료로 바꾸거나 근거 이미지를 비활성화하면 검색0건. 운영 데이터를 바꾼 검증이 아니다.
4. **합성 fixture**: 잘못된 Op.119 No.2, Beethoven Op.13 상위 작품만의 표기, 네 손 편곡은 모두 자동 확정 거절. 곡/악장/편곡의 범위를 확장하지 않았다.
5. **운영 공개 API**: Brahms0, Chopin Ballade4 및 Liszt Liebestraum3 각각 PF295548 1건. 브람스 빈 결과는 양성 성공으로 처리하지 않았다. 운영에서 OCR→신규 receipt→양성 검색까지는 미완료다.
6. JSDOM 실제 카드 렌더링은 확인했으나 실브라우저 시각 검사·전체 App 검색 입력 흐름과 원격 PostgreSQL 다중 세션 경쟁 부하는 미검증이다. 포스터별 반복 사람 확정을 새 운영 전제로 추가하지 않았다.

### 전곡 조사와 관측 분모

- 실제 활성 291 track / 252 work. JSON에291 ID가 정확히1번씩 들어가며 두 축 합계가 각각291이다.
- **식별 준비(정적 합성 probe)**: 279 READY, 12 UNSUPPORTED_NOTATION. 곡에 필요한 metadata·work 연결·권/작품/악장 요건을 개별 기록했다. opus를 모든 곡에 강제하지 않았다.
- 12곡은 차이콥스키 사계의 월 표기(`Op.37a : 6월` 등)가 ITEM_NUMBER_REQUIRED로 탈락한다. 같은 metadata의 명시 No.1~12 대조는12/12 매칭. 따라서 전체 곡 metadata 미비나 모든 표기에서 미지원이라는 뜻이 아니다. 실제 공연 월 표기의 효과는 아직 UNKNOWN이다.
- **저장 자료 관측**: 확정 검색2곡 / 미확정2곡 / 상위 작품만 관측한 악장3곡 / 조사 범위에서 귀속 근거 미발견284곡. 확정2곡은 동일 PF295548이므로 track–concert 연결2, 고유 공연1이다.
- 미확정은 브람스Op.118 No.2/PF295548와 쇼팽Op.66/PF295588. 기존 확정 쇼팽 발라드4에는 PF301161의 추가 저장 근거도 있다. 월광 상위 작품만 있는 후보는 1~3악장 각각으로 확정하지 않았다.
- 284곡에 대해 “공연 없음”이나 “OCR 실패”를 단정하지 않았다. 사용 가능한 OCR53개 중 후보 생성26/후보 없음27, 현재 성공 OCR 없는 이미지60개를 구분하되 각 이미지 실패를 미관측 곡에 임의 귀속하지 않았다.
- 현재 OCR 재파싱151개 논리 후보 중 규칙 통과5(4곡/3공연), 거절146. 기존2확정·동일 공연 중복이 포함되어 신규 실적이 아니다. reason은 복수 집계다.
- 원격 Supabase GET27 + 공개 GET4 / 원격 쓰기0. 최종 재집계·대표 재현은 cache를 재사용했다. 개인/비밀 환경값·원문 graph를 게시하지 않았고 snapshot 시각·query·범위를 JSON에 기록했다.

### 실제 확인한 병목과 제안

세부 변경 파일·완료 기준·오매칭 방지는 보고서의 “다음 개선 대상3개”에 적었다.

1. **자동화 운영 의존성**: API 비노출 RPC/column. 제한 사례의 실제 receipt·유효성·검색·동일입력 무쓰기까지 확인하는 적용 순서를 준비했다. 미확정2곡과 추가 공연 근거1곡을 조사 대상으로 삼되 신규 운영 연결 수를 예고하지 않는다.
2. **자료/추출 단계 구분 계측**: 성공 OCR없음60 이미지, OCR있지만 후보없음27 이미지. 284곡과의 영향 관계는 UNKNOWN이다. 실제 프로그램인지/구간 추출 실패인지 구별하고 attributable track·사유를 연결하는 진단을 우선한다. 전체 재수집/OCR은 시작하지 않는다.
3. **사계 월 표기12곡 제한 정규화**: 작곡가+Op.37a+사계 맥락에서만 월을 item으로 다루고 공연 날짜·다른 사계·모음곡 전체·번호 충돌의 오매칭을 막는 후속 구현을 제안한다. 현재는 조사만 했으며 원래 matcher 의미를 변경하지 않았다.

### 검증·한계·운영 적용 준비

- 공유 소스에서 `npm.cmd test`: **365/365 통과**, 실패/skip0. Windows 자식 프로세스 검증이 허용된 실행 환경.
- `npm.cmd run build`: 성공, 56 modules, 기존 500kB 초과 chunk 경고 유지.
- 대표 검증 도구 및 GET-only coverage 실행: 성공. 291 ID 유일성, work252, 상태합계, 원격 쓰기0, API→JSDOM 및 음성 조건을 확인했다.
- 공유32개 blob과 검증 소스 일치, 원격 baseline 코드 tree 대조. 최종 문서 링크·ID·버전·상태·JSON 집계 및 게시 결과를 확인한다.
- 자격증명 실제 값/인코딩 변형과 게시 파일 대조에서 검출0. 신규 결과물에도 같은 검사를 적용한다.
- 운영 권한 조회의 부족분·필요한 SQL 파일·선행 순서·제한 dry-run/save 검증 및 실패 대응은 [운영 준비 문서](docs/CONCERT_SEARCH_OPERATIONS_2026-10-22.md)에 준비했다. 관리자용 읽기 전용 SQL도 포함한다. 원격 적용 명령은 실행하지 않았다.
- 실자료의 정확한 재현에는 권한과 같은 snapshot이 필요하다. 비공개 원문을 GitHub에 공개하지 않아 모든 검토자가 운영 접근 없이 같은 실자료 결과를 재현할 수 있다는 의미는 아니다. 고정 코드의 기존 합성/격리 회귀365개는 재현 가능하다.

### 완료 기준별 판정

| 기준 | 판정 / 한계 |
| --- | --- |
| 관련 구현·의존 공유 및 전체 코드 SHA | 완료 / 위 고정 SHA32파일 및 기존 의존 코드 |
| DB·예약·검색 환경의 현재 확인 | 완료 / 반환형·DB내부 권한·배포 SHA UNKNOWN, 자동화 노출 미충족은 별도 운영 BLOCKED |
| 양성·오매칭·만료/근거 사례 | 조사 완료 / 실자료 로컬 HTTP·DOM 통과, 운영 브람스 양성은 미완료로 명시 |
| 활성곡 전수 JSON·분모 일치 | 완료 / 291 track, 252 work, ID중복0 |
| 정적/관측 두 축·UNKNOWN·범위 | 완료 / 근거 없는 단계/공연 부재 추정 안 함 |
| 상위3병목·다음 완료 기준 | 완료 / 보고서와 위 기술 의견 |
| 적합한 검증과 한계 공유 | 완료 / 회귀365·build·실자료 격리 도구 및 snapshot 재사용 |
| 같은 작업·버전·상태 및 결과 공유 | IMPLEMENTED / 웹 GPT 검토 대기. 결과 문서 저장 커밋은 이력/사용자 링크에서 확인 |

## 구현자 의견과 질문

- **Q-001 / 후속 운영 범위**: 현재 노출 상태와 로컬 격리 검증 사이의 차이는 준비된 절차에 분리했다. 다음 운영 지시에서는 관리자 SQL로 존재/권한을 확인하고 필요한 적용·제한 저장 검증 범위를 명시할 것을 권장한다. 이번 명세는 읽기 전용이므로 운영 의존성을 임의로 해결하지 않았다.
- **Q-002 / 검색 확장 우선순위**: 284곡의 관측 부족은 공연 부재가 아니다. 자료·추출 단계 구분 계측과 사계12곡의 제한 정규화를 후속 작업으로 분리하면 영향과 정확도를 측정하기 쉽다. 둘 중 우선 착수 범위는 웹 GPT/Theo가 결과를 보고 정해 달라. 현재 보고서에서는 운영 의존성 → 자료 계측 → 사계 표기 순으로 권장한다.
- **기술 의견**: parent work의 영문 제목이 마지막 sibling의 악장 표기를 가질 수 있고 대문자 Movement도 현 정규식에서 처리되지 않는다. 이를 섞은 조사 probe는 잘못된 준비상태를 만들기 때문에 이번 도구는 track별 한글 표기+명시 악장을 사용했다. 원본 catalog/title/identity hash를 바꾸면 기존 receipt에 영향이 있으므로 편의상 catalog를 고치지 않았다.
- **기술 의견**: reason별 건수와 영향곡 수·고유 공연 수를 계속 분리해야 한다. 미연결 수나 후보 수의 증가를 검색 품질 개선으로 계산하지 않는다.

## 웹 GPT → Codex: 검토

아직 검토하지 않음.

- 검토한 작업 ID / 명세 버전:
- 검토한 코드 / 문서 전체 SHA:
- 직접 확인한 범위와 근거:
- 판단 및 완료 기준별 결과:
- 운영 의존성과 기능 품질의 구분:
- 질문별 답변과 다음 구현 범위:

## 다음 인계

웹 GPT는 이 브랜치의 고정 코드 `ad5ab3cf5984146c4b2dc94428a146944af23fab`, 최신 전곡 보고서/JSON과 대표 검증 근거를 읽고 CA-SEARCH-20261022-001 / 명세1의 결과와 Q항목을 검토한다. 코드 승인·운영 적용 완료를 조사 IMPLEMENTED와 구분한다. 새 수신 확인 왕복 테스트는 추가하지 않는다.

새 작업으로 교체할 때는 이 CURRENT_TASK와 HANDOFF를 함께 보관한다. 현재 작업은 같은 ID의 첫 구현 결과이며 웹 GPT의 ACCEPTED/CHANGES_REQUESTED 판단 대기다.
