# 로컬 통합 배치와 Windows 정기 실행

기존 수집·EasyOCR·분석·RPC를 묶었습니다. 자동 분석은 REVIEW_REQUIRED이며 확정·반려는 하지 않습니다. 배치 성공만으로 검색에 노출되지 않고, 기존 Supabase 검색의 유효한 CONFIRMED + EXACT 조건을 통과해야 합니다. 카탈로그·matcher_version(`stored-program-2`)·OCR 설정·검색 기본값은 변경하지 않았습니다.

**plan → 수동 1회 실행 → 결과 확인 → 예약 등록** 순서로 진행하세요. 이번 구현 검증에서는 실제 데이터의 plan과 읽기만 수행했습니다. 실제 통합 배치의 수집·OCR·DB 쓰기 및 작업 등록은 사용자가 실행할 단계입니다.

## 1. plan

Windows 10 PowerShell에서 먼저 프로젝트로 이동합니다. Node 22와 기존 루트 `.env`의 `KOPIS_SERVICE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 새 환경변수·마이그레이션·Supabase CLI 연결은 없습니다. `.venv`, 기반 `.cache/python-portable/`, `.cache/easyocr/models/`는 보존합니다.

```powershell
Set-Location 'C:\Users\CNXK\dev\sound-atlas'
.\scripts\Invoke-ConcertPipeline.ps1 -Mode plan
$LASTEXITCODE
```

plan은 DB와 로컬 파일만 읽습니다. KOPIS 호출·이미지 다운로드·OCR·DB 쓰기·잠금 생성·진행 상태/실행 결과 파일 변경을 하지 않습니다. JSON은 콘솔에만 출력합니다. 아직 수집하지 않은 공연 수와 원격 이미지 변경 여부, 실제로 필요한 새 OCR 수는 UNKNOWN으로 표시합니다. 기존 OCR `--dry-run`은 실제 판독을 수행하므로 plan과 다릅니다.

plan은 Node 버전·Python 실행 파일·모델 파일 존재·DB 접근·필요 테이블/RPC 노출 여부를 점검합니다. KOPIS 인증과 Python 의존성/모델 로딩은 plan에서 실행하지 않았다고 표시합니다. 실제 run은 첫 DB 쓰기 전에 Python 의존성/모델을 로컬에서 로딩해 확인하고 KOPIS 목록 요청으로 인증을 확인합니다. 모델 다운로드는 허용하지 않습니다.

## 2. 수동 1회 실행

plan의 환경 점검과 범위를 확인한 후 실행합니다.

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run
$LASTEXITCODE
```

기본 조건은 서울·서양음악(클래식)·예정/진행·Asia/Seoul 오늘~30일 후(양 끝 포함)입니다. 아래 상한은 성공 수가 아닌 **시도/처리 대상 수**를 제한하므로 실패도 소비합니다.

| 옵션 | 기본값 | 의미 |
| --- | ---: | --- |
| `-CollectLimit` | 10 | 공연 상세 동기화 시도 수 |
| `-OcrLimit` | 3 | 새 OCR 시도 수. 다운로드/판독 실패도 시도에 포함 |
| `-AnalysisLimit` | 10 | 새 분석을 처리할 유효 OCR 결과 수 |
| `-ListPages` | 4 | KOPIS 목록 논리 페이지 요청 수. 인증 확인 요청 포함 |
| `-DbPages` | 20 | DB 테이블/관련 ID 묶음별 최대 페이지 수(페이지당 100행) |
| `-ImageChecks` | 10 | 원격 이미지 다운로드·해시 확인 수. OcrLimit보다 작으면 OcrLimit까지 올림 |
| `-MaxSeconds` | 900 | 전체 실행 제한(기본 15분). 요청/worker를 중단하고 PARTIAL 기록 |
| `-RecheckHours` | 24 | 정상 수집·이미지 해시 재확인의 최소 간격 |

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run -CollectLimit 20 -OcrLimit 5 -AnalysisLimit 20 -ListPages 6 -ImageChecks 15 -MaxSeconds 1200
```

각 HTTP 요청은 기존 타임아웃과 최대 3회 재시도를 사용합니다. 목록/상세 상한은 HTTP 재시도 전의 논리 요청 기준입니다. 분석·다운로드·상세 처리는 순차적입니다. 전체 제한이나 Ctrl+C는 새 작업을 중단하고 활성 HTTP/Python 작업도 취소합니다. Windows에서는 배치가 생성한 Python 실행기의 PID에 한해 자식 트리까지 종료하고 종료 처리를 기다립니다. 이미지명으로 다른 프로세스를 일괄 종료하지 않습니다. [Microsoft taskkill 문서](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)의 `/PID /T /F`를 사용합니다. 요청 취소 직전에 DB RPC가 커밋됐을 가능성은 다음 실행의 조회와 멱등성으로 처리합니다. 작업 스케줄러의 강제 종료 한도는 MaxSeconds보다 120초 길게 설정합니다.

기존 단건 명령의 이름은 `npm run collect:concerts`, `npm run ocr:batch`, `npm run program:analyze`입니다. 그대로 유지했습니다. 통합 실행기의 npm 대안은 다음과 같습니다.

```powershell
npm run pipeline -- plan
npm run pipeline -- run --collect-limit 20 --ocr-limit 5 --analysis-limit 20 --list-pages 6 --max-seconds 1200
npm run pipeline -- latest
```

## 대상 진행·재사용·실패

수집은 목록의 상태/페이지 커서와 발견한 공연 ID·기간을 로컬 진행 파일에 저장합니다. 같은 첫 페이지 10개로 되돌아가지 않습니다. 목록에서 새로 발견한 대기 대상과 DB의 오래된 synced_at 대상을 번갈아 선택합니다. 최근 24시간 내 성공한 공연은 생략하고, 기간을 벗어난 대기 공연도 제거합니다. 기본 10개면 두 종류가 모두 있을 때 각각 진행하며, 한쪽이 비면 나머지를 처리합니다. 매일 날짜가 바뀌어도 커서를 초기화하지 않습니다. API 목록은 실행 중 변경될 수 있으므로 완전한 스냅샷은 아니며, 마지막 페이지/상태 이후 다시 첫 페이지로 순환해 재탐색합니다.

OCR은 미처리/실패 재시도 이미지와 재확인 시각이 지난 성공 이미지를 번갈아 선택합니다. ImageChecks로 다운로드 탐색도 제한합니다. 현재 바이트의 SHA-256과 pipeline 버전이 같으면 성공 결과를 재사용합니다. 정상 캐시 재사용은 완료 시도나 수동 검토 상태를 바꾸지 않습니다. 중간에 실패/다른 결과가 기록된 경우에는 현재 바이트가 기존 성공 결과와 같음을 확인한 새 성공 시도만 기록하고 OCR 원문은 재판독하지 않습니다. 이 경우 새 시도에 대한 재분석·재검토가 필요하며 과거 확정을 자동 부활시키지 않습니다.

분석은 기존 유효성 검사로 현재 성공 OCR을 선택합니다. OCR 결과/완료 시도·이미지/공연 revision·공연 문맥·카탈로그 hash·matcher 버전이 같은 현재 분석은 **후보 0개도 재사용**합니다. 후보/수동 확정·반려 이력을 초기화하지 않습니다. 이미 다른 분석으로 교체된 동일 키는 재활성화하지 않고 보류 사유를 표시합니다. 원문·후보를 새로 만들기 위해 임의로 matcher 버전을 올리지 않습니다.

대상 하나의 실패는 다음 대상을 막지 않습니다. 로컬 실패 횟수에 따라 1→2→4→8→16→24시간으로 대기하고 최대 24시간 간격으로 재시도할 수 있게 됩니다. **`retry_at`은 재시도 대상에 다시 포함될 수 있는 시각이며 자동 실행 예약이 아닙니다.** 그 시각에 타이머나 별도 예약을 생성하지 않습니다. 이후 수동 또는 정기 배치가 실행될 때 범위·선택 순서·상한에 따라 처리합니다. 따라서 매일 09:00 예약만 등록했다면 10:00의 retry_at에 자동 재실행되지 않습니다. 대상당 한 실행에서 한 번만 시도하며, 네트워크 재시도도 최대 3회입니다(HTTP 400은 요청 내 즉시 재시도하지 않음). 기존 DB OCR 실패 기록의 대기 시간도 고려합니다. 수집 목록 실패에도 이전의 유효 OCR과 미처리 분석을 계속 처리하지만 전체 결과는 PARTIAL입니다. 인증 오류·초기 DB/실행 환경 오류는 FATAL입니다.

`coverage`, 각 단계의 `limit_reached`, `page_limit_reached`, `remaining`으로 확인 가능한 잔여 작업과 상한을 구분합니다. 목록 한 순회를 마쳤다는 사실이 전체 공연의 프로그램 확인 완료를 뜻하지 않습니다. 아직 보지 않은 KOPIS 자료와 원격 이미지의 변경 수는 미확정입니다. DB 페이지 상한 초과도 조용히 잘라 성공 처리하지 않고 DB_SCAN_LIMIT 오류로 보고합니다.

## 3. 결과와 검토 우선 후보 확인

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode latest
# 전체 JSON 직접 열기
Get-Content -LiteralPath '.cache\concert-pipeline\latest.json' -Raw
```

실행마다 `.cache/concert-pipeline/runs/<run_id>.json`, 최신 결과 `latest.json`, Supabase 프로젝트별 `state-<hash>.json`을 기록합니다. KST 시작/종료·소요 시간, 조건/상한, 단계별 성공/실패/재사용/생략, 잔여/대기, 오류 코드와 retry_at을 포함합니다. 콘솔에도 진행 요약과 최종 JSON을 출력합니다. `.cache/`는 기존 Git 제외 규칙이 적용됩니다. plan·latest는 파일을 쓰지 않습니다.

새 KOPIS HTTP 실패에는 `errors[].http`에 실제 상태, 허용된 Content-Type, 고정 endpoint 경로, 쿼리 파라미터 이름만 추가합니다. 키·쿼리 값·인증 헤더·응답 본문은 기록하지 않습니다. 기존 실행 로그에는 소급 추가하지 않으므로 과거 오류 본문은 복원할 수 없습니다.

`review.new_candidates`, `new_linked_candidates`는 새로 관측한 분석 ID의 후보만 집계하며 RPC 성공 횟수를 신규 행 수로 세지 않습니다. 로컬 잠금은 같은 프로젝트의 통합 실행기끼리 적용되므로 다른 PC/개별 CLI를 동시에 실행하면 관측 신규 수의 경계가 달라질 수 있습니다. `total_review_required`는 현재 카탈로그/matcher의 유효한 검토 필요 후보 수입니다. `priority`에는 현재 수집 범위의 등록곡 연결 후보를 최대 20개 표시하며, 공연명·곡명·기간·후보 UUID·정확한 `npm run program:analyze -- show <UUID>` 명령을 제공합니다. 확인과 확정은 계속 수동입니다.

| 종료 코드 | 상태 | 조치 |
| --- | --- | --- |
| 0 | SUCCESS / PLAN_READY | 오류 없이 완료. 상한과 잔여 작업은 별도로 확인 |
| 1 | PARTIAL / 중단·시간 초과 | 오류·retry_targets를 확인하고 대기 이후 같은 run 재실행 |
| 2 | FATAL | 환경·인증·DB/마이그레이션·로컬 파일 문제를 해결한 뒤 plan |
| 3 | DUPLICATE_SKIPPED | 정상 실행이 잠금을 갖고 있어 건너뜀. 기존 실행 확인 |

잠금은 `.cache/concert-pipeline/lock.json`의 PID·무작위 소유 토큰으로 관리합니다. 정상 종료·오류·Ctrl+C의 finally에서 자신의 잠금만 해제합니다. 강제 종료 후 PID가 사라졌으면 다음 run이 직렬화된 복구 절차로 잠금을 회수합니다. **시간이 오래됐다는 이유로 살아 있는 PID의 잠금을 제거하지 않습니다.** PID 재사용이나 권한 부족으로 생존 여부가 불명확하면 보수적으로 실행을 막습니다.

파일이 깨졌거나 소유자 기록 직전에 종료된 경우에는 자동 삭제하지 않습니다. 아래에서 정확한 PID와 프로세스를 확인하고, 기존 통합 Node/Python 실행이 없음을 확인한 뒤 해당 잠금 파일만 직접 제거합니다. `lock-recovery.json`이 남은 경우도 같은 확인이 필요합니다. 확인 전에는 삭제하지 마세요.

```powershell
Get-Content -LiteralPath '.cache\concert-pipeline\lock.json' -Raw
# 위 JSON의 실제 PID를 사용 (변수 $PID는 PowerShell 예약 변수이므로 사용하지 않음)
$ownerProcessId = 12345
Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "ProcessId=$ownerProcessId" | Select-Object ProcessId,CreationDate,ExecutablePath,CommandLine
# 프로세스가 없거나 해당 배치의 소유자가 아님을 확인한 경우에만:
# Remove-Item -LiteralPath '.cache\concert-pipeline\lock.json'
```

강제 종료 당시 최신 결과가 RUNNING이면 해당 실행 기록은 미완료입니다. 실제 DB 저장 여부는 다음 plan/조회로 확인합니다. 기존 개별 CLI는 별도 잠금을 갖지 않으므로 예약 통합 실행과 동시에 실행하지 마세요. 진행 파일을 삭제하면 탐색 커서·실패 대기 상태가 초기화됩니다. 재수집 시 DB 중복은 기존 RPC가 막지만 커서 보존을 권장합니다.

## 4. 작업 스케줄러 등록

수동 run의 JSON·검토 후보·종료 코드를 확인한 뒤, 아래 Preview로 설정을 검토하고 직접 등록하세요.

```powershell
Get-TimeZone
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Preview
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Register

# 기본 09:00 대신 매일 10:30으로 등록하려면 위 Register 대신:
# .\scripts\Manage-ConcertPipelineTask.ps1 -Action Register -Time '10:30'
```

현재 PC는 **Korea Standard Time(UTC+09:00)**이므로 기본 매일 09:00은 한국 시간입니다. 스크립트는 다른 PC 시간대면 등록을 중단하며 시스템 시간대를 변경하지 않습니다. 현재 사용자가 로그인한 상태에서 Interactive/Limited로 실행하고 관리자 권한·암호 저장을 기본 요구하지 않습니다. StartWhenAvailable로 놓친 예약을 조건이 충족되는 이후 시점에 실행하도록 준비했습니다. 로그아웃·절전·전원/배터리 조건에 따라 실제 실행 가능 시점은 달라집니다. 시스템 전원 설정이나 WakeToRun은 변경하지 않습니다. [Microsoft 작업 설정 문서](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset)와 [실행 사용자 문서](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)를 기준으로 구성했습니다.

작업에는 절대 PowerShell/Node 경로·프로젝트 작업 디렉터리·비밀값 없는 숫자 인자만 저장합니다. .env는 프로젝트 절대 경로로 읽고 Python은 기존 EASYOCR_PYTHON 또는 `.venv/Scripts/python.exe`를 사용합니다. NoProfile이므로 가상환경 수동 활성화에 의존하지 않습니다. 동일 예약의 중복은 IgnoreNew, 수동/예약 통합 배치의 중복은 로컬 잠금으로 막습니다. 기존 같은 이름의 작업을 자동 덮어쓰지 않습니다.

```powershell
# 등록·최근/다음 실행·LastTaskResult 조회
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Status

# 향후 예약 비활성화 (이미 실행 중인 작업은 계속됨)
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Disable

# 실행 중인 예약 작업 강제 중지. 이후 잠금/미완료 결과 확인
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Stop

# 예약 삭제 (DB/결과 파일은 삭제하지 않음)
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Remove
```

이 PC에서 확인한 실행 정책은 CurrentUser RemoteSigned입니다. 스크립트에 ExecutionPolicy Bypass·정책 변경·관리자 승격을 넣지 않았습니다. 회사 정책/다운로드 차단으로 실행이 거부되면 원인을 먼저 확인하고 조직에서 허용하는 서명/등록 절차를 사용하세요. 배치 자체는 `npm.cmd run pipeline -- plan` 등 Node 명령으로 실행할 수 있습니다. 등록 권한 오류도 자동으로 승격하지 않으며 수동 작업 스케줄러의 허용된 현재 사용자 설정으로 검토해야 합니다.

## 실제 검증 범위

2026-10-16 08:20 KST, 한국 날짜 2026-10-16~2026-11-15 기준 읽기 전용 plan:

- 범위 내 저장 공연 3개·활성 상세 이미지 8개.
- 해시 확인 대상 5장·최근 처리로 생략 3장. 실제 새 OCR 필요 수는 미확정.
- 분석 필요 5개·동일 근거 재사용 1개·현재 성공 OCR 없는 이미지 2개.
- DB GET 17회(추가 후보 상태 조회 포함), KOPIS/이미지 다운로드/OCR/DB 쓰기/체크포인트 변경 모두 0회.
- 실행 전후 진행 디렉터리가 생성되지 않았고 상태 값도 동일했습니다.
- 기존 검증 후보 `fcfa75b3-f064-4a60-8d7b-fd8326c6497a`는 사용자가 확정한 CONFIRMED·현재 유효 상태 그대로 확인했습니다. 이번 작업에서 확정·반려하지 않았습니다.
- 최종 PowerShell plan도 08:28 KST에 같은 공연/이미지·분석 건수로 통과했고 진행 디렉터리는 생성되지 않았습니다. 실제 run 미실행이므로 latest는 NO_RUNS를 반환합니다. 최종 브라우저 빌드에도 서버 비밀값·통합 배치 진입점은 포함되지 않았습니다.

전용 테스트 12개와 기존 전체 테스트(총 191개), 프로덕션 빌드가 통과했습니다. 순서·상한·페이지/대상 진행·실패/재시도·OCR/빈 분석 재사용·수동 상태 보존·잠금/죽은 소유자 복구·plan 무쓰기·로그 비밀값 차단·Windows 공백 경로/환경 파일/종료 코드·예약 Preview·배치 소유 프로세스 트리 종료를 검증했습니다. Windows Preview는 로컬 객체/문자열 준비만 수행했습니다. 실제 작업 등록·09:00 트리거·예약 누락 후 실행·로그온/전원 조건·예약 강제 종료 동작과 실제 통합 run의 추가 수집/OCR/DB 저장은 미검증입니다.

새 파일: `scripts/runConcertPipeline.mjs`, 두 PowerShell 스크립트, `server/concertPipeline.mjs`, `pipelineConfig.mjs`, `pipelineLocal.mjs`, `pipelineRepository.mjs`, `pipelineRuntime.mjs`, `pipelineSelection.mjs`, `pipelineProcess.mjs`, 전용 Node/Windows 테스트입니다. 기존 수집 클라이언트·공연 정규화·collector RPC, EasyOCR runner/worker·이미지 검증·저장 RPC, 프로그램 분석/유효성·저장 RPC를 재사용했습니다. 기존 HTTP/DB/이미지 모듈에는 선택적 취소 signal, OCR runner에는 선택적 캐시 재사용 callback, worker에는 선택적 종료 hook과 종료 대기를 추가하여 단건 CLI의 기본 동작을 유지했습니다.
