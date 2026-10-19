# Windows 배치 절전 대응

`Invoke-ConcertPipeline.ps1 -Mode run`은 Node 시작 직전에 전용 스레드에서 `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)`를 요청합니다. Node 종료와 stdout/stderr 저장을 기다린 다음 `finally`에서 같은 스레드가 `ES_CONTINUOUS`로 해제됩니다. 화면 켜짐은 요청하지 않으므로 기존 3분 화면 꺼짐을 유지합니다. 요청은 래퍼 프로세스 수명에 속하며 프로세스 강제 종료 시 Windows가 회수합니다. 전역 전원 정책이나 다른 Node 프로세스는 변경하지 않습니다. plan/latest/help에는 요청·영수증 쓰기가 없습니다.

활성화 실패는 배치를 막지 않고 안전한 `SYSTEM_AWAKE_REQUEST_FAILED` 경고를 stderr 로그에 남깁니다. `.cache/concert-pipeline/launches/<launch_id>.json`의 `system_awake`에서 활성화 결과·오류 코드·시각, 해제 결과·시각, `display_required=false`를 확인합니다. 강제 종료로 finally가 실행되지 않았다면 해제 확인 필드는 null일 수 있습니다. 이는 Windows의 프로세스 종료 시 자동 회수와 구분합니다. 실행 상태 복구·잠금 검증은 기존 [중단 복구](PIPELINE_INTERRUPTION.md)를 유지합니다.

daily 제안값은 수집 10 / 새 OCR 20 / 분석 20 / 이미지 확인 40 / 배치 1,800초이며 예약 제한은 PT32M입니다. `-PowerPolicy allow-battery`로 등록하면 두 배터리 제한은 false이고 WakeToRun=true, RunOnlyIfIdle=false, StopOnIdleEnd=false, StartWhenAvailable=true, MultipleInstances=IgnoreNew입니다.

```powershell
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Preview -Profile daily -PowerPolicy allow-battery
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Status -Profile daily -PowerPolicy allow-battery
.\scripts\Invoke-ConcertPipeline.ps1 -Mode latest
Get-ChildItem .cache\concert-pipeline\launches\*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

Preview에는 제안 WakeToRun과 Registered의 실제 값이 함께 나오고 Status에는 실제 TerminationSettings.WakeToRun과 ProposedWakeToRun이 나옵니다. **RuntimeVerified는 REGISTERED_CONFIGURATION 범위**에서 실행 파일·명시적 인자·작업 폴더·사용자·트리거·시간 및 전원 제한의 일치 여부입니다. ConfigurationDifferences가 차이를 표시합니다. **BatchExecutionVerified=false**는 실제 배치를 실행해서 검증한 결과가 없다는 뜻입니다. 다음 예약의 실제 처리 시간·전원/로그인 조건·깨우기 성공은 별도로 확인해야 합니다.

예약 교체는 Ready 재확인 → `.cache/concert-pipeline/task-backups`에 원본 XML·상태 백업 → Remove → daily Register → 실제 Status/다음 실행 확인 순서입니다. 실행 중이면 제거하지 않습니다. 등록 실패 시 원본 XML로 복구합니다. 전역 전원 설정이나 예약 즉시 실행은 포함하지 않습니다.
