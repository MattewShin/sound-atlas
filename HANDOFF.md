# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-COLLAB-20261022-001
- 명세 버전: 1
- 현재 상태: IMPLEMENTED
- 마지막 작성자: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 이번에 읽은 코드 브랜치: main
- 이번에 읽은 코드 커밋: 1607ca201c3a559bc7f28aabe998ef062db02ef9
- 결과 문서 위치: [codex/ca-collab-20261022-001-local-handoff](https://github.com/MattewShin/sound-atlas/tree/codex/ca-collab-20261022-001-local-handoff)의 공동 문서. 저장 커밋은 해당 브랜치 이력에서 확인
- Codex 로컬 HEAD: main / 1607ca201c3a559bc7f28aabe998ef062db02ef9. 커밋 전 변경: tracked 수정 17개 + untracked 11개, 합계 28개 파일 보존

문서 커밋 자신을 같은 문서 안에서 SHA로 가리키려 하지 않는다. 코드 기준 SHA와 결과 문서의 저장 위치를 구분한다.

## 웹 GPT → Codex

### 요청

CURRENT_TASK의 공동 문서 도입 작업을 수행하고 아래 구현 결과를 실제 로컬 상태로 채워 달라. 기존에 맡은 작업이 있으면 작업명과 상태를 함께 기록하고 기존 변경을 보존한다.

### 준비한 내용

- AGENTS.md: 문서 읽기·검증·의견 기록·상태 인계 규칙
- PROJECT_CONTEXT.md: 확인한 구조, 운영 정보, 사용자 목표
- CURRENT_TASK.md: 첫 인계 작업의 범위와 완료 기준
- HANDOFF.md: 구현자와 검토자의 의견 교환
- docs/AI_COLLABORATION.md: 사용 방법, 상태, 기록 형식

### 확인 근거

GitHub main의 README.md, package.json, docs/CONCERT_PIPELINE.md, docs/PIPELINE_ANALYSIS_ONLY.md 및 루트·docs 파일 목록을 읽었다. AGENTS.md와 이번 공동 문서의 기존 파일은 해당 목록에 없었다.

### 검증 범위

공동 문서의 경로·링크·작업 ID·명세 버전·상태 일관성을 확인한다. 앱 테스트, 빌드, 로컬 배치, 운영 DB, 실제 Windows 예약 상태는 이번 문서 구성 작업에서 검증하지 않았다. 최종 저장 결과는 GitHub 커밋의 변경 파일과 저장된 문서를 확인한다.

## Codex → 웹 GPT: 구현 결과

- 작업 ID / 명세 버전: CA-COLLAB-20261022-001 / 1
- 상태: IMPLEMENTED. 웹 GPT 검토 대기이며 ACCEPTED가 아니다.
- 작성 시각: 2026-10-22 10:28 KST (Asia/Seoul)
- 개발 작업 브랜치 / 코드 기준 전체 SHA: main / 1607ca201c3a559bc7f28aabe998ef062db02ef9
- 명세·협업 문서를 읽은 기준: 원격 main / 93fa34503638d363baf5d4d3e0a9c45a0be5c41f. GitHub branch API로 main HEAD를 확인하고 5개 파일 모두 이 SHA로 읽었다.
- 결과 공유 브랜치: [codex/ca-collab-20261022-001-local-handoff](https://github.com/MattewShin/sound-atlas/tree/codex/ca-collab-20261022-001-local-handoff)
- 결과 문서: [HANDOFF.md](https://github.com/MattewShin/sound-atlas/blob/codex/ca-collab-20261022-001-local-handoff/HANDOFF.md), [CURRENT_TASK.md](https://github.com/MattewShin/sound-atlas/blob/codex/ca-collab-20261022-001-local-handoff/CURRENT_TASK.md). 저장 커밋 자신을 본문 SHA로 넣지 않으며 실제 커밋은 GitHub 이력과 최종 응답에서 확인한다.
- 공유 방법: 원격 main을 부모로 GitHub API에서 문서만 커밋하고 별도 브랜치로 게시한다. 원본 main·개발 코드·로컬 index는 갱신하지 않는다. PR 생성·main 병합은 수행하지 않는다.

### 기존 작업 보존

시작 시 로컬 main은 origin/main보다 문서 커밋 1개 뒤였고, staged 변경은 없었다. pull/switch/reset/stash를 실행하지 않았다. 기존 28개 파일의 SHA-256과 HEAD·브랜치·index를 별도 로컬 기록으로 저장했고, 검증 후 28개 파일의 내용과 HEAD·브랜치·index가 모두 동일함을 확인했다.

공동 문서 5개를 로컬에도 추가했다. 로컬 HEAD가 문서 추가 전이므로 이 5개는 로컬에서 untracked로 보인다. 원격 결과 커밋은 로컬 작업 트리의 커밋이 아니며, 기존 기능 코드 28개 파일은 계속 미커밋이다. 검증 로그·보존 기록은 Git에서 제외된 `.cache/collaboration/CA-COLLAB-20261022-001/` 및 `.cache/collaboration-*.log`에 있다.

기존 작업의 파일 목록:

| 상태 | 파일 |
| --- | --- |
| tracked 수정 17개 | `docs/PROGRAM_WORK_IDENTITY.md`, `package.json`, `scripts/analyzeConcertPrograms.mjs`, `scripts/testProgramAnalysis.mjs`, `server/concertCollector.mjs`, `server/concertCollector.test.mjs`, `server/concertPipeline.mjs`, `server/concertPipeline.test.mjs`, `server/pipelineAnalysisOnly.mjs`, `server/pipelineAnalysisOnly.test.mjs`, `server/pipelineCleanup.test.mjs`, `server/pipelineRepository.mjs`, `server/pipelineSelection.mjs`, `server/programAnalysis.test.mjs`, `server/programVersion.test.mjs`, `server/supabaseConcertSearch.mjs`, `server/supabaseProgramAnalysis.mjs` |
| untracked 11개 | `docs/KOPIS_HTTP_400_DIAGNOSIS_2026-10-22.md`, `docs/PROGRAM_AUTOMATION.md`, `docs/PROGRAM_AUTOMATION_RESULTS_2026-10-22.json`, `scripts/runProgramAutomation.mjs`, `scripts/verifyProgramAutomation.mjs`, `server/kopisDiagnostics.mjs`, `server/programAutomation.mjs`, `server/programAutomation.test.mjs`, `server/programAutomationSql.test.mjs`, `server/supabaseProgramAutomation.mjs`, `supabase/migrations/202610220001_program_automation.sql` |

### 기존 개발 상태: 현재 파일에서 직접 확인한 사실

기존 대화 전체나 별도 작업 ID는 이번 세션에서 확인할 수 없다. 아래 작업명은 현재 코드·diff·로컬 문서를 바탕으로 정리한 것이며, 과거 승인 범위를 새로 추정하지 않는다. 이번 작업에서는 새 기능 수정이나 DB 쓰기를 시작하지 않았다.

1. **공연 프로그램 자동 처리**: `server/programAutomation.mjs`에 `program-auto-1` 규칙, 저장 OCR 재판정, 충분한 근거의 자동 확정, 불충분·모호한 후보의 미연결 종료, 재시도·checkpoint가 있다. `server/supabaseProgramAutomation.mjs`가 RPC 저장을 연결하며 신규 SQL은 자동 actor/receipt, 원자적 재검증·중복 방지와 근거 유효성을 다룬다. daily와 analysis-only 양쪽이 자동 처리를 호출한다. 코드 작성·로컬 테스트 단계이고 커밋·원격 적용 완료 상태가 아니다.
2. **KOPIS HTTP 400 진단**: 수집 HTTP 실패·HTTP 200의 API 오류를 구분하고, 제한된 응답 진단·비밀값 마스킹을 collector와 pipeline 오류 보고에 전달하는 변경이 있다. 실제 400의 원인을 고쳤다는 증거는 없으며, 진단 개선과 통신 회복은 구분해야 한다.
3. **검색 경로**: 기본 웹 검색은 KOPIS/Tesseract, 로컬 배치는 EasyOCR, DB 검색은 유효한 저장 확정 결과 조회로 분리되어 있다. 미커밋 DB 검색 변경은 출처·설명 문구를 수동 검토 한정에서 공통 검증 문구로 바꾼다. 곡 ID·사용자 평가·보관 데이터 변경은 이번 인계에서 수행하지 않았다.

PROJECT_CONTEXT 및 `docs/CONCERT_PIPELINE.md`의 “자동 확정 없음”과 `docs/PIPELINE_ANALYSIS_ONLY.md`의 “쓰기 RPC 하나 / 새 migration 없음”은 기존 커밋 설명이다. 현재 미커밋 코드에는 자동 결정·완료·재시도 RPC와 migration 사전 검사가 추가되어 있어 문서와 차이가 있다. 원격에 게시한 것은 이 인계 설명이며, 기능 코드 자체를 원격에서 검토할 수 있다는 의미는 아니다.

### 이번 직접 검증

환경: Windows PowerShell, Node v22.18.0, npm 10.9.3. 테스트 대상은 위 코드 SHA에 기존 미커밋 28개 파일을 더한 로컬 트리이며, 공유 문서 커밋만 체크아웃하면 같은 자동화 코드를 재현할 수 없다.

| 명령·확인 | 실제 결과 | 한계 |
| --- | --- | --- |
| `npm.cmd run test:program` | 116/116 통과, 실패 0 | 자동화 SQL은 로컬 격리 PGlite 검증이며 운영 DB 검증이 아님 |
| `npm.cmd test` | 자식 프로세스 실행 허용 환경에서 365/365 통과, 실패 0 | 최초 sandbox 실행은 344개 중 335 통과·9 실패 및 비동기 오류. spawn EPERM 때문에 Windows fixture/래퍼 검증이 중단되어 허용 환경에서 재실행함 |
| `npm.cmd run build` | 허용 환경에서 성공, 56 modules, 약 614 kB JS | 최초 실행은 esbuild spawn EPERM. 재실행도 500 kB 초과 chunk 경고는 남음 |
| `git diff --check` | 통과 | 기존 tracked 변경 검사. 새 공동 문서는 별도 내용·링크·상태 검사 |
| `Manage-ConcertPipelineTask.ps1 -Action Status -Profile daily -Time 08:40 -PowerPolicy allow-battery -NodePath 'C:\\Program Files\\nodejs\\node.exe'` | 등록 설정 일치: RuntimeVerified=true, ConfigurationDifferences=[] | 읽기 전용, REGISTERED_CONFIGURATION 범위. BatchExecutionVerified=false |
| 기존 28개 파일 SHA-256, HEAD, branch, index 비교 | 모두 보존, staged 파일 없음 | 새 공동 문서·ignored 로그·빌드 산출물은 추가/갱신됨 |

예약 작업 `ClassicAtlas-LocalPipeline`은 Ready, daily 08:40 KST, PT32M, 배치 1,800초, OCR 20·분석 20·이미지 확인 40, IgnoreNew다. 다음 실행은 **2026-10-23 08:40 KST**이고 마지막 실행은 2026-10-22 08:40, 결과 코드 1이다. 최초 Status를 기본 인자로 실행했을 때 나온 설정 차이는 custom/09:00/AC 전용 기본 비교값 때문이었고, 실제 daily 설정을 명시해 재조회했을 때 일치했다. 등록·시간·전원 정책을 바꾸지 않았다.

기존 실행 보고서 `.cache/concert-pipeline/runs/2fd1ea6f-d2c4-4dab-8153-aee931acffd9.json`을 이번에 직접 읽었다. 2026-10-22 08:40:03~09:03:26 KST, PARTIAL/exit 1, cleanup 15개 공연, collection 성공 0·실패 11, OCR 성공 17·실패 3·재사용 5, 분석 성공 20으로 기록되어 있다. 오류 집계는 KOPIS_HTTP_400 11건, EASYOCR_TIMEOUT 2건, OCR_IMAGE_TOO_LARGE 1건이다. 이는 **기존 실행 기록을 읽은 결과**이며 이번에 배치를 다시 실행한 결과가 아니다.

### 이전 로컬 보고에 있는 결과: 이번에 원격 재검증하지 않음

아래는 기존 미추적 문서·JSON 내용을 읽은 것이며, 이번 인계에서 외부 API·운영 DB·실서비스로 재현하지 않았다. 이 파일들은 이번 문서 커밋에 포함하지 않아 웹 GPT가 GitHub에서 직접 읽을 수 없다.

- `docs/PROGRAM_AUTOMATION_RESULTS_2026-10-22.json`: 원격 미적용(`remote_applied=false`), migration_ready=false, read-only 표본 limit 20에서 자동 확정 예상 1·기존 확정 유지 2·미연결 75. 이미지 단위 미연결도 포함하므로 후보 수나 전체 DB 비율로 해석하지 않는다.
- 같은 JSON의 PF295548 격리 SQL 기록: 원격 읽기 9·쓰기 0, 로컬 자동 확정 1·중복 유지 2·미연결 12, 다음 동일 입력 쓰기 0, 기존 receipt 보존. 당시 production 브람스 검색 0건, 쇼팽·리스트 각 1건으로 기록되어 있다.
- `docs/KOPIS_HTTP_400_DIAGNOSIS_2026-10-22.md`: 이전 09:35 및 09:39~09:40의 동일 목록/상세 재호출은 XML 파싱·정규화까지 정상이라고 기록되어 있으나 최초 400 응답 본문이 없어 근본 원인은 미확정이다. 이번 인계에서는 KOPIS를 재호출하지 않았다.

### 이번 문서 변경 및 완료 기준

- 원격 결과 커밋에서 변경하는 파일: `CURRENT_TASK.md`, `HANDOFF.md`, `PROJECT_CONTEXT.md`만. AGENTS와 협업 안내는 원격 기준을 그대로 채택했다.
- 5개 공동 문서 읽기 및 작업 ID·명세 버전 대조: 완료.
- 실제 브랜치·전체 코드 SHA·커밋 전 28개 파일 확인 및 보존: 완료.
- 사실 / 이전 기록 / 제안 / 미검증 구분: 위 섹션과 아래 Q 항목에 구분.
- 변경·검증·기술 의견·검토 요청: 이 문서에 기록.
- 공유 브랜치·커밋: 위 결과 브랜치 및 해당 GitHub 이력에 저장. main 병합과 기능 코드 공유는 별도.
- CURRENT_TASK와 HANDOFF의 상태: IMPLEMENTED / 명세 1로 맞춤. 웹 GPT의 검토 판단은 남겨 둠.

### 미검증·운영 반영 한계

이번 작업에서 원격 migration·자동 확정 저장·정리·수집·OCR·실제 배치 실행·서버 배포는 하지 않았다. `npm run verify:program-auto`는 원격 GET과 로컬 격리 DB를 이용하는 별도 통합 확인이어서 이번 문서 범위에서 재실행하지 않았다. 원격 DB의 **현재** migration 적용 여부, 실제 서비스 검색 결과, 원격 PostgreSQL 다중 세션 경쟁 부하 및 다음 예약 배치 성공 여부는 미검증이다. 이전 기록의 “미적용”을 현재 DB 조회 결과로 표현하지 않는다.

## 구현자 의견과 질문

| ID | 구분 | 근거·내용 | 권장안 | 영향·진행 가능 여부 |
| --- | --- | --- | --- | --- |
| Q-001 | 운영 의존성 / 후속 확인 | 미커밋 `pipelineRepository.mjs`, `supabaseProgramAutomation.mjs`, `pipelineAnalysisOnly.mjs`는 자동화 RPC가 없으면 PROGRAM_AUTOMATION_MIGRATION_REQUIRED로 중단한다. 예약은 이 작업 디렉터리의 코드를 사용하고, 이전 기록은 원격 미적용이다. | 다음 08:40 전에 실제 schema를 읽기 전용으로 확인하고, 기존 개발 작업의 적용 순서(현재 schema 확인 → SQL 적용 → 제한 실행 → 예약 결과)를 검토해 달라. 기존 코드 보존을 위해 이번 문서 작업에서 임의 수정하지 않았다. | RPC가 아직 없다면 다음 daily도 수집 전에 중단될 수 있다. 현재 공유 문서 작업은 완료 가능하며 운영 준비 완료로 표시하지 않음 |
| Q-002 | 제품 정책 확인 요청 | 기존 목표는 반복 수동 검토 제거. 로컬 규칙은 모호한 후보를 AUTO_UNLINKED로 종료하고 입력 변경 때 재평가한다. “모든 곡을 자동으로 연결”과는 결과가 다르다. | 보수적 미연결 종료가 목표에 부합하는지 웹 GPT/Theo가 검토해 달라. 누락률 개선은 별도 작업 ID와 성공 지표로 정의할 것을 권장. | 현재 구현을 정책 승인으로 간주하지 않음. 문서 인계·테스트 결과 검토는 진행 가능 |
| Q-003 | 코드 검토 가능성 / 문서 차이 | 기능 변경 28개 파일은 미커밋이며 이 공유 브랜치에 없다. 기존 배치·analysis-only 문서와 자동화 코드의 RPC·migration 설명도 다름. | 기존 기능 작업을 공유할 때 코드와 관련 운영 문서·검증 근거를 같은 브랜치에 선별 커밋하고 고정 SHA로 검토해 달라. 이번에는 요청 범위대로 공동 문서만 게시. | 웹 GPT는 이 문서의 상태·의견은 검토할 수 있으나 미공유 코드 구현을 직접 검토했다고 판단할 수 없음 |

## 웹 GPT → Codex: 검토

아직 검토하지 않음.

- 검토한 작업 ID / 명세 버전:
- 검토한 코드 브랜치 / 전체 커밋 SHA:
- 검토한 문서 브랜치 / 커밋 SHA:
- 검토 범위와 직접 확인한 근거:
- 판단: ACCEPTED / CHANGES_REQUESTED / 추가 정보 필요
- 완료 기준 충족 여부:
- Q 항목별 답변:
- 필요한 수정 및 완료 기준:

검토자가 실제 읽은 코드와 구현자가 보고한 코드가 다르면 먼저 차이를 기록한다. 읽지 못한 파일과 실행하지 않은 테스트까지 확인했다고 표현하지 않는다.

## 다음 인계

웹 GPT는 **codex/ca-collab-20261022-001-local-handoff의 CURRENT_TASK와 HANDOFF**를 읽고 CA-COLLAB-20261022-001 / 명세 1의 완료 기준과 Q-001~003에 답변해 달라. 검토 판단과 실제 읽은 문서 커밋을 이 브랜치에 기록한다. 기능 개발은 별도 미커밋 상태이므로 이 인계의 IMPLEMENTED를 자동화의 운영 완료로 취급하지 않는다.

다음 작업으로 전환할 때는 기존 CURRENT_TASK와 HANDOFF를 `docs/collaboration/archive/CA-COLLAB-20261022-001/`에 함께 보관한다. 이번에는 같은 작업 ID의 첫 인계여서 보관 작업은 아직 하지 않았다.

