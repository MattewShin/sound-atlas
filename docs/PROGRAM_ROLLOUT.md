# 프로그램 분석 단계적 전환

2026-10-20 기준 실행 준비 문서입니다. 아래 운영 명령은 이번 작업에서 실행하지 않았습니다. SQL 초안은 미적용이며 canary·저장 재분석·검토 결정·예약 작업 변경도 하지 않았습니다. 이전 문서의 단일 matcher 선택 및 SQL 적용 후 예약 안내를 이 문서로 대체합니다.

## 선택을 분리한 위치와 기본값

이전에는 `programAnalysis.mjs`의 `MATCHER_VERSION`이 생성, 캐시, 검토 목록/RPC, 사용자 검색, 통합 배치의 버전을 함께 결정했습니다. 이제 `programRollout.mjs`에서 역할을 분리합니다.

| 서버 전용 환경변수 | 기본값 | 역할 / 허용값 |
|---|---|---|
| PROGRAM_ANALYSIS_WRITE_VERSION | stored-program-3 | 생성·저장. 현재 구현은 v3만 지원하며 새 파서를 v2로 표시할 수 없음 |
| PROGRAM_REVIEW_VERSION | stored-program-3 | 검토 목록·수동 결정의 버전. v2 또는 v3 |
| PROGRAM_SEARCH_VERSION | stored-program-2 | 사용자 DB 검색의 유일한 버전. v2 또는 v3 |
| PROGRAM_ANALYSIS_SCHEDULE_ENABLED | false | 통합 run의 실행 허용. true 또는 false |

변수가 **없는 경우만** 기본값을 씁니다. 빈 값·미지원 버전·latest·잘못된 boolean은 오류이며 최신 버전을 임의 선택하지 않습니다. 설정에 비밀값이나 VITE_ 접두사를 넣지 않습니다. 구현 식별자인 `MATCHER_VERSION`은 계속 v3이며 캐시·payload·후보 출처를 식별합니다. 검색은 이 상수를 직접 참조하지 않습니다.

이번에 로컬 `.env`를 읽은 `config` 출력도 위 기본값과 같았습니다. `.env` 자체를 수정하지 않았습니다. 실제 API에는 재시작/재배포 시 반영됩니다. CLI/예약 Node는 시작마다 프로젝트 `.env`를 읽습니다. 상속된 프로세스 환경변수가 파일보다 우선하므로 아래 helper는 두 곳을 함께 설정합니다.

```powershell
Set-Location "$env:USERPROFILE\dev\sound-atlas"
npm.cmd run program:analyze -- config
```

SQL 초안의 view도 **이미지+버전 내부** 현재 분석을 선택하도록 바꿨습니다. v2와 v3는 각각 현재 근거를 가질 수 있지만 소비자는 버전 하나만 조회합니다. v3 canary·REVIEW_REQUIRED·CONFIRMED 생성은 v2의 현재 플래그나 수동 검토를 바꾸지 않습니다. 기존 v2 확정 결과가 여전히 활성 이미지·현재 OCR·공연 조건을 만족하면 v2 검색에 계속 나옵니다. 실제 근거가 오래되거나 종료된 공연까지 강제로 유지하지는 않습니다.

검색 결과의 `analysisVersion`, 각 공연의 `programAnalysisVersion`, `/api/concerts/status`의 `analysisVersion`으로 선택을 확인합니다. 검토 list에는 `review_version`과 각 후보의 `matcher_version`, UUID show에는 실제 후보 버전과 설정된 `review_version`이 나옵니다. v3가 없으면 정상 빈 목록이며 v2 UUID show는 유지됩니다. 검색과 검토의 기본 버전은 자동 합쳐지지 않습니다.

## 예약 게이트와 수동 저장 조건

false이면 통합 run 전체가 **SQL/자격증명/Python 검사보다 앞에서** `SKIPPED_ROLLOUT_GATE`, exit 0으로 끝납니다. cleanup·KOPIS 수집·이미지 확인/OCR은 NOT_RUN, 분석은 SKIPPED_ROLLOUT_GATE입니다. DB 읽기/쓰기와 수집 커서·재시도·체크포인트 저장을 하지 않습니다. 로컬 실행 영수증/latest만 원자적으로 저장합니다. 실패 재시도 상태를 만들지 않으며 성공 배치로 표시하지 않습니다. PowerShell launch 영수증도 같은 SKIPPED 상태와 rollout 설정을 기록합니다. Windows 예약 트리거 자체를 비활성화하는 설정은 아닙니다.

앞 단계까지 멈추는 이유는 통합 배치에서 분석 전 단계가 cleanup 삭제·수집 저장·OCR 시도 기록을 만들기 때문입니다. canary 전환 대기 중 그 부분만 반복 실행하지 않도록 전체 단위를 멈춥니다. true가 되면 기존 통합 처리·시간 상한·우선순위가 그대로 적용됩니다.

수동 v3 저장은 예약 설정과 독립적이지만 다음을 모두 요구합니다.

- `analyze --save --version stored-program-3 --ocr-manifest <정확한 파일>`
- manifest UUID 중복/개수/형식 검증, 각 대상의 현재 활성 이미지·성공 OCR·근거 확인
- 저장 전 GET-only SQL/RPC preflight 통과, v3 제외 정책 없음

manifest 없는 저장은 예약 활성화 후에도 거부합니다. 파일을 지정해도 명시적 v3가 없으면 거부합니다. 예약 활성화가 사용자 검색 버전을 바꾸지는 않습니다. canary는 기존 v1 manifest를, 전체 재처리는 아래 v2 manifest를 사용합니다. v2 manifest는 OCR·이미지·성공 시도·이미지/공연 revision까지 고정합니다. 이후 근거가 바뀌면 다른 OCR로 대체하지 않고 제외 사유와 종료 코드 1을 반환합니다. 부분 성공 후 같은 명령 재실행은 동일 키를 재사용합니다.

## 운영용 설정 helper — 아직 실행하지 않음

아래 함수는 프로젝트 루트에서만 사용합니다. 비밀값을 출력하지 않고 네 설정만 갱신합니다. 서버 배포 환경에도 같은 값을 설정하고 API를 재시작/재배포해야 합니다. Vite나 다른 Node 프로세스를 종료하는 명령은 포함하지 않습니다.

```powershell
function Set-ProgramRolloutValue([string]$Name, [string]$Value) {
  $allowed = @('PROGRAM_ANALYSIS_WRITE_VERSION','PROGRAM_REVIEW_VERSION','PROGRAM_SEARCH_VERSION','PROGRAM_ANALYSIS_SCHEDULE_ENABLED')
  if ($Name -notin $allowed) { throw 'Unexpected rollout setting' }
  $rolloutPath = Join-Path (Get-Location).Path '.env'
  $rolloutText = if (Test-Path -LiteralPath $rolloutPath) { [IO.File]::ReadAllText($rolloutPath) } else { '' }
  $rolloutText = [regex]::Replace($rolloutText, '(?m)^' + [regex]::Escape($Name) + '=[^\r\n]*(?:\r?\n|$)', '')
  $rolloutText = $rolloutText.TrimEnd() + "`r`n$Name=$Value`r`n"
  [IO.File]::WriteAllText($rolloutPath, $rolloutText, (New-Object Text.UTF8Encoding($false)))
  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}
```

## 1. 전환 안전장치 배포

```powershell
Set-ProgramRolloutValue PROGRAM_ANALYSIS_WRITE_VERSION stored-program-3
Set-ProgramRolloutValue PROGRAM_REVIEW_VERSION stored-program-3
Set-ProgramRolloutValue PROGRAM_SEARCH_VERSION stored-program-2
Set-ProgramRolloutValue PROGRAM_ANALYSIS_SCHEDULE_ENABLED false
npm.cmd run program:analyze -- config
```

코드와 이 값을 API 서버 환경에도 반영한 뒤 기존 운영 방식으로 API를 재시작/재배포합니다. 로컬 API 시작 명령은 `npm.cmd start`입니다. 확인: write/review=v3, search=v2, schedule=false. 이 중 하나라도 다르거나 오류이면 중단합니다. 실제 배치를 테스트 삼아 실행하지 않습니다.

## 2. v3 SQL/RPC 적용

별도 승인된 운영 절차로 [SQL 초안 전체](../supabase/drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql)를 적용합니다. CLI를 쓰는 경우 별도로 준비한 DB 연결 환경변수와 psql이 필요합니다. 연결 문자열을 출력하지 않습니다.

```powershell
psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f .\supabase\drafts\PROGRAM_ANALYSIS_V3_DRAFT.sql
if ($LASTEXITCODE -ne 0) { throw 'SQL application failed' }
npm.cmd run program:analyze -- preflight
```

Supabase SQL Editor에서 파일 전체를 적용하는 방법도 가능합니다. 이미 적용된 초안이라면 다시 실행하지 말고 적용 이력과 스키마를 확인합니다. 확인: `rpc_ready=true`, v3, schedule=false. 적용 실패·RPC 누락·정책 disabled이면 저장하지 않습니다. SQL 적용은 예약 게이트 값을 바꾸지 않습니다.

## 3. OCR 17건 canary 저장

```powershell
npm.cmd run program:analyze -- analyze --dry-run --version stored-program-3 --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
if ($LASTEXITCODE -ne 0) { throw 'Canary evidence needs inspection' }
npm.cmd run program:analyze -- analyze --save --version stored-program-3 --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
if ($LASTEXITCODE -ne 0) { throw 'Inspect partial canary before continuing' }
```

17 UUID는 이전 initial 실행과 같은 집합입니다. 2026-10-19의 17/62/3/2는 기대값이며 이번에는 DB를 다시 조회하지 않았습니다. 현재 시점 cleanup·OCR 변경으로 근거가 사라졌다면 실패/제외를 조사하고 멈춥니다. 새 OCR을 임의로 manifest에 채워 넣지 않습니다.

## 4. 분석 17건·후보 62건 확인

```powershell
npm.cmd run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json --version stored-program-3
npm.cmd run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json --version stored-program-2
```

기대값: 새 분석 17, 후보 62, 연결 후보 3, 고유 catalog ID 2, REVIEW_REQUIRED 62, 빈 OCR 6, full snapshot 보존. v2 분석·후보·검토 이력도 보존되어야 합니다. 신규 행이 없는 재실행에서는 UUID/행 수가 유지되어야 합니다. 근거가 달라졌거나 수치·내용이 다르면 멈춥니다. `saved`는 저장/재사용 성공 호출 수이며 신규 행 수가 아닙니다.

## 5. 연결 후보 3건 수동 검토

```powershell
npm.cmd run program:analyze -- list --version stored-program-3
npm.cmd run program:analyze -- show <candidate-uuid>
npm.cmd run program:analyze -- confirm <candidate-uuid> --analysis-id <show의-analysis-uuid> --note "직접 확인한 원본 근거와 판정 사유"
```

UUID 자리표시는 실제 값으로 바꿉니다. 각 source/variant·작곡가·작품번호·조성·편성·bbox를 검토하고, 반려가 타당하면 기존 `reject` 명령을 사용합니다. 세 후보를 일괄 확정하지 않습니다. 미확정/오연결 의심/근거 stale이면 해당 후보를 확정하지 않고 후속 전환을 중단합니다. 원본 확인은 운영자의 후속 작업이며 이번 구현에서는 이미지 요청을 하지 않았습니다.

## 6. v2 사용자 검색 유지 확인

```powershell
npm.cmd run program:analyze -- config
Invoke-RestMethod 'http://127.0.0.1:3000/api/concerts/status'
$baselineTrackId = '기존-v2-확정-track-id로-교체'
$searchUrl = 'http://127.0.0.1:3000/api/concerts?region=' + [uri]::EscapeDataString('서울') + '&from=2026-10-20&to=2026-11-18&targetTrackId=' + [uri]::EscapeDataString($baselineTrackId)
Invoke-RestMethod $searchUrl
```

실제 운영 API 주소·관람 기간·기존 v2 확정 결과를 알고 있는 track ID로 바꿔 사용합니다. 아직 v2 확정이 없는 canary 곡을 골라 빈 결과만 확인해서는 보존을 검증할 수 없습니다. backend=supabase, `analysisVersion=stored-program-2`, 기존의 유효한 v2 확정 공연이 유지되는지 확인합니다. 기간 만료·실제 근거 변경과 버전 전환에 의한 누락을 구분합니다. v3 후보가 검색에 섞이거나 버전이 달라지면 중단합니다.

## 7. 현재 유효한 저장 OCR 전체를 명시적 manifest로 v3 재분석

통합 배치·OCR 재실행을 사용하지 않습니다. 현재 활성 DETAIL 이미지의 최신 성공 OCR만 읽습니다. 과거/실패/교체된 OCR은 저장 RPC의 근거 조건에 맞지 않아 제외됩니다. 아래는 DB 읽기와 로컬 파일 생성 단계입니다.

```powershell
New-Item -ItemType Directory -Force .cache\program-v3-rollout | Out-Null
node --env-file-if-exists=.env scripts/runProgramAnalysis.mjs targets | Out-File -Encoding utf8 .cache\program-v3-rollout\targets.json
if ($LASTEXITCODE -ne 0) { throw 'Target discovery failed' }
$rolloutScope = Get-Content -Raw -Encoding UTF8 .cache\program-v3-rollout\targets.json | ConvertFrom-Json
$rolloutTargets = @($rolloutScope.targets)
for ($offset = 0; $offset -lt $rolloutTargets.Count; $offset += 50) {
  $last = [Math]::Min($offset + 49, $rolloutTargets.Count - 1)
  $items = @($rolloutTargets[$offset..$last] | Select-Object kopis_id,ocr_result_id,image_id,source_attempt_id,image_revision,concert_revision)
  $manifest = @{ schema_version='program-ocr-manifest-2'; expected_count=$items.Count; targets=$items }
  $manifestPath = Join-Path (Get-Location).Path ('.cache\program-v3-rollout\ocr-{0:D4}.json' -f [int]($offset / 50 + 1))
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
}
```

`targets.json`의 skipped 사유와 각 manifest UUID/개수를 직접 확인합니다. 이전 작업의 shard 파일이 같은 디렉터리에 남아 있으면 별도로 보존하거나 비어 있는 새 디렉터리를 사용하세요. 확인이 끝난 **이번에 생성한 파일만** 차례로 실행합니다. 범위 없는 `analyze --save`는 계속 금지됩니다.

```powershell
$manifestPath = '.cache/program-v3-rollout/ocr-0001.json' # 확인한 파일 하나
npm.cmd run program:analyze -- analyze --dry-run --version stored-program-3 --ocr-manifest $manifestPath
if ($LASTEXITCODE -ne 0) { throw 'Inspect manifest drift' }
npm.cmd run program:analyze -- analyze --save --version stored-program-3 --ocr-manifest $manifestPath
if ($LASTEXITCODE -ne 0) { throw 'Inspect partial save; retry same manifest after diagnosis' }
npm.cmd run program:analyze -- snapshots --version stored-program-3 --ocr-manifest $manifestPath
```

기존 canary와 같은 키는 재사용됩니다. 대상 전체 개수와 생성 후보 수는 새 읽기 결과에 따라 정하며 17/62로 추정하지 않습니다. drift/실패·예상 밖 후보·원문 손실이 있으면 다음 shard를 실행하지 않습니다. schedule=false, search=v2를 유지합니다.

## 8. v3 확정 데이터와 검색 결과 검증

전체 재처리 후 `list --version stored-program-3`, `show`, 개별 수동 결정을 반복하고 각 manifest의 snapshots를 확인합니다. 실제 확정된 것만 검색 대상이며 모든 후보를 성공으로 취급하지 않습니다. 검색 preview를 아래처럼 격리 프로세스에서 실행합니다. 기존 API 환경·예약 게이트는 바꾸지 않습니다.

```powershell
cmd /d /c "set CONCERT_SEARCH_BACKEND=supabase&& set PROGRAM_SEARCH_VERSION=stored-program-3&& set HOST=127.0.0.1&& set PORT=3001&& npm.cmd start"
```

다른 터미널에서 3001의 status와 단계 6 검색 URL을 조회합니다. v3만 조회하고 REVIEW_REQUIRED/반려/오래된 근거가 나오지 않는지, 수동 확정 곡·공연·기간이 정확한지 확인합니다. 이 preview API만 정상 종료합니다. 기존 API/Vite/다른 Node를 종료하지 않습니다. 잘못된 검색·누락·연결이 있으면 공개 전환하지 않습니다.

## 9. public search version을 v3로 전환

```powershell
Set-ProgramRolloutValue PROGRAM_SEARCH_VERSION stored-program-3
npm.cmd run program:analyze -- config
```

실제 API 배포 환경에도 적용하고 API를 재시작/재배포합니다. 단계 6 status/검색 명령에서 analysisVersion=v3와 검증된 확정 결과를 확인합니다. 실패 시 search를 v2로 되돌린 뒤 API를 재시작/재배포합니다. write 버전을 v2로 낮추지 않습니다. 예약 게이트는 아직 false입니다.

## 10. scheduled v3 save 활성화

```powershell
Set-ProgramRolloutValue PROGRAM_ANALYSIS_SCHEDULE_ENABLED true
npm.cmd run program:analyze -- config
npm.cmd run program:analyze -- preflight
```

write/review/search=v3, schedule=true, RPC 준비·정책 허용을 확인한 뒤 기존 예약을 그대로 둡니다. 예약 시간·인자·Windows 작업 재등록은 필요 없습니다. 즉시 배치를 실행하지 않고 다음 예약을 기다립니다. 이후 확인 명령은 `npm.cmd run pipeline -- latest`이며 rollout과 단계 결과·새 후보·실패·보류를 확인합니다. 첫 실제 예약 처리 시간/처리량은 아직 검증하지 않았습니다.

## 중단·되돌리기

```powershell
Set-ProgramRolloutValue PROGRAM_ANALYSIS_SCHEDULE_ENABLED false
Set-ProgramRolloutValue PROGRAM_SEARCH_VERSION stored-program-2
npm.cmd run program:analyze -- config
```

API 환경에도 search=v2를 반영하고 재시작/재배포합니다. 이 변경은 다음 실행부터 적용되며 이미 실행 중인 프로세스를 종료하지 않습니다. v2/v3 데이터는 삭제하지 않습니다. 필요하면 별도 승인하에 SQL version policy로 v3 저장 자체를 금지할 수 있지만, 기본 되돌리기는 검색 선택과 예약 게이트만 바꾸면 됩니다. 그 경우에도 review version은 운영자가 명시적으로 선택합니다.

## 이번 검증 범위

mock HTTP와 로컬 PGlite·Windows fixture로 검증합니다. 운영 DB 조회/쓰기·운영 SQL·실제 canary/재분석·OCR·KOPIS/이미지 요청·실제 배치·예약 작업 변경은 수행하지 않습니다. 기존 17건 진단을 다시 저장하거나 확정하지 않습니다.

최종 결과: 관련 `test:program` **81개**, 전체 `test` **293개**, 프로덕션 빌드와 `git diff --check` 모두 통과했습니다. 로컬 SQL과 실제 검색 모듈을 함께 사용해 v3 생성 후 v2 확정 조회 유지, v2 행·후보·검토 이력 보존을 검증했습니다. Windows fixture는 launch 영수증의 SKIPPED 상태와 exit 0도 확인했습니다. 실제 운영 canary·SQL·배치는 검증하지 않았습니다.
