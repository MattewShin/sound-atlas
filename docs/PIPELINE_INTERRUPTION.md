# Windows 예약 중단과 RUNNING 기록 복구

## 2026-10-19 읽기 전용 진단

실제 작업 `ClassicAtlas-LocalPipeline`의 XML·기본값을 포함한 설정·최근 실행 정보, 로컬 로그/잠금, 관련 프로세스, Task Scheduler/System/Application 이벤트를 조회했습니다. 예약이나 이벤트 로그 설정은 변경하지 않았습니다. DB·KOPIS·이미지·실제 OCR/통합 배치는 실행하지 않았습니다.

| 항목 | 실제 등록값 |
| --- | --- |
| 실행 | Windows PowerShell `-NoProfile -NonInteractive -WindowStyle Hidden` → `Invoke-ConcertPipeline.ps1 -Mode run` |
| 상한 | 수집 10 / OCR 3 / 분석 10 / 이미지 확인 10 / MaxSeconds 900 / RecheckHours 24 |
| 작업 제한 | `PT17M` = 1,020초, 배치 제한+120초 |
| 로그인/권한 | InteractiveToken / Limited, 현재 사용자 로그인 필요 |
| 배터리 | DisallowStartIfOnBatteries=true, StopIfGoingOnBatteries=true |
| 강제 종료 | AllowHardTerminate=true |
| 유휴 | RunOnlyIfIdle=false, StopOnIdleEnd=true, IdleDuration 10분, WaitTimeout 1시간, RestartOnIdle=false |
| 기타 | StartWhenAvailable=true, IgnoreNew, WakeToRun=false, RunOnlyIfNetworkAvailable=false, RestartCount=0 |
| 다음 예약 | 2026-10-20 09:00 KST |
| 마지막 결과 | Ready / LastRunTime 2026-10-19 09:00:01 / 3221225786 (`0xC000013A`) |

수동 initial `f8930c00-a841-4433-b1da-f54740dca99b`는 08:34:51~08:58:53 KST, PARTIAL, 1,442.031초로 종료됐습니다. 로그상의 실행 구간은 오전 9시 예약과 겹치지 않습니다. 예약 run `84e77080-8232-433e-a889-530589e4697a`는 09:00:05.263 시작, 마지막 기록은 09:00:32.637입니다. 잠금 PID 39948은 조회 시 존재하지 않았습니다. 마지막 완료 단계는 collection(PARTIAL, 수집 실패 11건)이며 OCR에서 캐시 재사용 1건 뒤 기록이 끝났습니다.

**확인된 사실과 미확정 원인:**

- [MS-ERREF](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55)는 `0xC000013A`를 `STATUS_CONTROL_C_EXIT`로 정의합니다. 기존 배치가 정상적인 부분 실패에 사용하는 1과 다릅니다. 이 코드만으로 사용자가 실제 Ctrl+C를 눌렀다고 단정할 수 없습니다.
- 현재 설정에는 17분 작업 제한·배터리 전환 중지·강제 종료 허용이 있습니다. [AllowHardTerminate 문서](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-allowhardterminate)는 Task Scheduler가 WM_CLOSE 후 필요시 TerminateProcess를 사용할 수 있음을 설명합니다. [배터리 중지 설정](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-stopifgoingonbatteries)도 실행 중단 조건입니다. **이번에 어느 조건이 실제 발동했는지는 미확정**입니다. RunOnlyIfIdle=false이므로 StopOnIdleEnd=true만으로 유휴 종료를 원인으로 삼지 않습니다.
- Task Scheduler Operational 로그는 **비활성화**되어 과거 실행의 종료 이벤트·주체·정확한 종료 시각을 확인할 수 없습니다. 08:50~09:45 범위에서 조회한 System 전원/재시작 이벤트와 Application의 관련 실행 파일 오류 이벤트에서도 대응 근거를 찾지 못했습니다. 이는 배터리 전환·로그오프·사용자 중단이 없었다는 증거가 아닙니다.
- 수집 HTTP 400은 저장된 별도 오류입니다. 그 이후 OCR 캐시 확인까지 진행했으므로 HTTP 400 자체가 프로세스를 종료시켰다는 근거가 없습니다. 원격 재현 요청은 하지 않았습니다.
- 기존 PowerShell `& $NodePath @nodeArguments`는 이미 동기 대기였고 `$LASTEXITCODE`를 반환했습니다. 따라서 부모가 Node 시작만 하고 기다리지 않았다는 결론은 근거가 없습니다. 과거 stdout/stderr 및 부모/자식 종료 영수증이 없어 PowerShell 자체 중단과 자식에서 반환한 제어 종료 코드를 분리할 수 없습니다.

## 확인된 코드 결함과 수정

기존 latest는 저장 JSON을 그대로 반환하고, 실행 중 exit_code를 0으로 초기화했습니다. 잠금에는 PID·토큰·생성 시각만 있고 OS 프로세스 생성 정보나 run_id가 없었습니다. 강제 종료로 finally가 실행되지 않으면 RUNNING 기록과 잠금이 남으며, PID가 재사용되면 다른 프로세스를 배치 소유자로 오인할 수 있었습니다.

새 실행은 run_id·PID·OS 생성 시각 식별자·잠금 토큰을 함께 기록합니다. `last_progress_at`, `last_completed_stage`, 단계 시작/진행 시간이 체크포인트에 포함됩니다. 15초마다 잠금의 `heartbeat_at`을 갱신하지만 **하트비트가 오래됐다는 이유로 살아 있는 실행을 중단 처리하지 않습니다**. 실행 중 `exit_code=null`입니다.

Windows에서는 `Get-Process`의 생성 시각 ticks를 읽습니다. 접근 실패는 UNKNOWN이며, 프로세스 부재와 구분합니다. 조회 대상의 PID와 생성 정보만 확인하고 프로세스를 종료하지 않습니다. 생성 시각이 다른 동일 PID는 원래 실행의 생존 증거가 아닙니다. 새 잠금/복구 가드는 완성된 JSON 임시 파일을 exclusive hard-link로 게시하여 불완전한 초기 JSON 노출을 피합니다. 진행/결과/하트비트는 임시 파일→원자적 교체를 사용합니다.

### 읽기 전용 latest와 다음 실행 시 확정

조회 때마다 원본을 고치는 방식은 기존 latest의 읽기 전용 계약과 감사 근거 보존을 깨고, 조회와 실행의 쓰기 경쟁을 만듭니다. 따라서 다음 두 단계를 결합했습니다.

1. **latest 조회:** 원본 JSON은 유지하고 실행 생존 정보를 대조한 결과를 반환합니다. run_id·잠금 토큰·PID·OS 생성 정보가 모두 일치하고 살아 있을 때만 RUNNING입니다. 프로세스 부재/재사용이 확인되면 INTERRUPTED·exit_code 1입니다. 정보 부족/권한 오류/살아 있는 레거시 PID/잠금 불일치이면 RUNNING_UNVERIFIED·exit_code null로 표시하며 거짓 종료를 확정하지 않습니다.
2. **다음 정상 run:** 새 실행이 안전하게 잠금을 확보한 뒤 이전 중단 기록을 per-run/latest에 원자적으로 확정합니다. DB와 체크포인트 데이터·완료된 단계 결과는 수정하지 않습니다. 죽은 소유자나 재사용된 PID의 잠금과 죽은 복구 가드를 회수합니다. 시간 경과만으로 살아 있는/확인 불가 소유자의 잠금은 지우지 않습니다. 기존 PID-only 잠금이 살아 있으면 누구의 프로세스인지 확정할 수 없어 보수적으로 차단합니다.

per-run 기록은 latest보다 먼저 저장됩니다. 두 파일 교체 사이 강제 종료가 발생해도 더 최신인 같은 실행의 per-run 완료 기록을 우선 사용하며, 이미 완료된 결과를 INTERRUPTED로 덮어쓰지 않습니다.

강제 종료가 finally까지 막으면 정확한 종료 시각은 새 코드도 직접 기록할 수 없습니다. 이때 `finished_at_source=LIVENESS_CHECK_OBSERVATION`, `termination.actual_exit_at=null`로 구분하고, finished_at은 중단 감지 시각입니다. duration_ms도 실제 실행 시간이 아닌 감지까지의 범위임을 `duration_ms_basis`로 표시합니다. 새 PowerShell 영수증에 측정된 Node 종료 시각이 있으면 `NODE_EXIT_RECEIPT`를 사용합니다. 완료 단계와 오류·누적 카운트는 보존합니다.

실제 중단 기록의 읽기 전용 확인 결과(09:33:13 KST)는 INTERRUPTED / PROCESS_NOT_FOUND / 마지막 완료 단계 collection / 마지막 진행 09:00:32였습니다. 이 09:33:13은 실제 프로세스 종료 시각이 아닙니다. 원본 실행 기록·잠금·체크포인트 등 JSON 14개는 SHA-256이 같았습니다. 원본 latest.json은 다음 정상 run 전까지 RUNNING일 수 있으므로 현재 상태는 아래 조회 명령으로 확인합니다.

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode latest
```

## PowerShell·자식 프로세스와 로컬 영수증

실제 run에서만 .NET Process로 Node를 실행합니다. UseShellExecute=false·CreateNoWindow=true로 콘솔 의존성을 줄이고 표준 입력은 닫습니다. stdout/stderr는 독립적인 비동기 스트림으로 동시에 비워 pipe-buffer 교착을 막으며, Node의 실제 종료 및 두 출력 스트림 완료까지 기다립니다. 종료 후 같은 출력을 부모 stdout/stderr에도 전달합니다. run 도중 출력은 로컬 로그에서 볼 수 있습니다. plan/latest/help는 기존 읽기 전용 실행 경로를 유지하며 영수증을 만들지 않습니다.

`.cache/concert-pipeline/launches/<launch_id>.json`, `.stdout.log`, `.stderr.log`에 부모 PID, Node PID/시작·종료 시각, 원시 signed/unsigned 종료 코드, 출력 경로와 분류를 남깁니다. launch_id는 내부 환경으로 자동 전달되어 실행 JSON의 execution과 연결되며 사용자가 추가 환경변수를 설정할 필요는 없습니다. 원자적 영수증 교체는 Windows PowerShell의 명시적 null 문자열을 사용합니다.

종료 코드 0/1/2/3은 SUCCESS/PARTIAL/FATAL/DUPLICATE_SKIPPED로 구분하고, `0xC000013A`는 EXTERNAL_CONTROL_TERMINATION으로 별도 기록합니다. 부모는 실제 Node 종료 코드를 그대로 반환합니다. 부모까지 강제 종료되면 영수증이 RUNNING으로 남을 수 있고, latest는 부모 영수증만으로 생존을 판단하지 않습니다. Node가 실제 살아 있으면 잠금/생성 정보를 확인해 RUNNING으로 표시하고 자체 시간 상한을 유지합니다.

Python은 기존 Node worker가 직접 생성하고 stdin/stdout 프로토콜로 순차 판독합니다. 취소/시간 상한/close 시 소유한 ChildProcess만 종료하고 종료를 기다립니다. 같은 ChildProcess의 중복 종료 요청은 하나의 Promise를 공유합니다. 이미 종료한 자식에게 다시 taskkill을 보내거나 이름으로 Node/Python을 일괄 종료하지 않습니다. Vite 프로세스는 대상이 아닙니다.

## 예약 설정 준비 — 현재 작업은 변경하지 않음

Status는 실제 Principal과 TerminationSettings까지 표시합니다. Preview는 제안값과 Registered의 현재 설정을 함께 표시합니다. 기존 ac-only 기본 정책은 보존하고, 배터리 전환으로 중단하지 않으려는 경우에만 `-PowerPolicy allow-battery`를 명시합니다. 유휴 조건은 사용하지 않고 StopOnIdleEnd도 명시적으로 끕니다. 마지막 강제 종료 수단은 유지합니다. 로그인 방식·권한·09:00 시각·중복 실행 방지는 변경하지 않습니다.

```powershell
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Status
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Preview -Profile daily -PowerPolicy allow-battery
```

실제 Preview에서 제안 배치 1,800초 / 작업 PT32M / 배터리 중지 false와, 현재 등록 900초 / PT17M / 배터리 중지 true를 함께 확인했습니다. 이 비교는 배터리가 이번 원인으로 확정됐다는 뜻이 아닙니다. 기존 예약 교체는 수동 결과를 확인한 뒤 [우선순위·예약 안내](PIPELINE_PRIORITY.md)의 별도 절차로 진행합니다. 이번에는 등록·삭제·재등록·History 활성화를 수행하지 않았습니다.

## 검증 범위

로컬 테스트는 생존/부재/조회 불가/PID 재사용, 오래 살아 있는 동일 실행, 레거시 잠금, 원자적 두 파일 저장 중단, 다음 실행의 잠금 회수·중단 확정, 실제 OS에서 강제 종료한 가짜 Node, 출력 버퍼보다 큰 stdout/stderr, 부분 실패 1과 native 제어 종료 코드 전달, 무관한 Node 보존을 확인합니다. 모든 프로세스 종료 실험은 임시 fixture에 한정합니다.

실제 09:00 예약의 외부 중단 주체·정확한 종료 시각, 개선된 예약의 다음 09:00 실행, 배터리 전환/로그오프/작업 시간 제한에 의한 전체 예약 트리 종료는 미검증입니다. 과거 stdout/stderr와 비활성 History 이벤트를 소급 복원하지 않습니다.

최종 검증: 전체 로컬 테스트 **229개**와 프로덕션 빌드가 통과했습니다. 실제 `node scripts/runConcertPipeline.mjs latest`도 09:41 KST에 INTERRUPTED / exit_code 1 / PROCESS_NOT_FOUND를 반환했습니다. 이 조회의 finished_at은 조회 시 감지 시각이며, 원본 latest·해당 run·수동 initial run·잠금의 SHA-256은 최초 진단값과 같았습니다. 원격 DB 요청/쓰기·KOPIS/이미지 요청·실제 OCR/운영 배치·예약/History 설정 변경은 0회입니다.
