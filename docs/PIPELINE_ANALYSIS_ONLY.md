# 저장 OCR 분석 전용 catch-up

`analysis-only`는 수집·cleanup·이미지 다운로드·Python/OCR을 생성하거나 실행하지 않습니다.
서버 전용 Supabase 연결을 재사용하며, HTTP 쓰기는 기존
`save_concert_program_analysis_v3`와 자동 처리의 결정·완료·재시도 RPC만 허용합니다.
현재 구현에는 `202610210001_program_work_identity.sql` 및
`202610220001_program_automation.sql`의 선행 identity/automation 함수가 필요합니다.
자동화 RPC가 노출되지 않으면 run의 사전 검사에서 중단합니다. plan은 운영 DB를 쓰지 않습니다.
일반 `daily`/`initial` 프로필과 등록된 Windows 작업은 변경하지 않습니다.

분석 대상은 `program-ocr-manifest-2` 형식의 명시적인 manifest로 고정해야 합니다.
각 항목에는 `kopis_id`, `image_id`, `ocr_result_id`, `source_attempt_id`,
`image_revision`, `concert_revision`이 필요합니다. DB/로컬 analysisSelection에서
현재 준비된 대상만 선택하고, plan에서 개수와 OCR UUID 집합을 검증합니다.
현재 근거가 변경되거나 차단된 항목이 있으면 저장 전에 전체 실행을 중단합니다.
manifest는 최대 analysisLimit개이며, 현재 지원 상한은 기존 manifest 검증에 따라 100개입니다.

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode plan -Profile analysis-only -OcrManifest '.cache\approved-ocr-manifest.json'
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run -Profile analysis-only -OcrManifest '.cache\approved-ocr-manifest.json'
```

기본값은 analysisLimit=40, maxSeconds=600입니다. 다른 단계의 limit을 0으로
해석하는 방식이 아니라 `SKIPPED_ANALYSIS_ONLY`로 표시하고 호출 경로를 분리합니다.
plan은 DB/로컬 읽기만 수행하며 checkpoint/latest/DB를 저장하지 않습니다.
run은 통합 배치와 같은 잠금·실행 식별자·절전 방지·원자적 영수증·latest를 사용합니다.
동일 키가 이미 저장돼 있으면 기존 결과를 재사용하고 검토 이력을 초기화하지 않습니다.
개별 실패는 기존 backoff를 유지하고, 시간 제한은 진행 중 요청을 취소하여
완료 결과만 보존합니다. 취소 및 파일 정리 시간은 제한 이후에 추가될 수 있습니다.
부분 완료 후 자동 재실행하지 말고 새 plan으로 남은 대상을 확인해야 합니다.

`activity`에는 실행 중 Supabase 읽기/분석 저장/자동 처리 저장 호출 수와 금지 단계의 0회 값이 기록됩니다.
검토를 위해 나중에 원본 이미지를 여는 작업은 분석 실행과 구분해 별도 집계합니다.

분석 이후 `program-auto-1` 규칙을 적용합니다. 충분한 작품·악장 근거는 자동 확정하고,
모호하거나 부족한 근거는 이유와 함께 미연결로 종료하며 입력 변경 시 재평가합니다.
사람의 반복 승인 대기열을 만들지 않습니다. [자동 처리 안내](PROGRAM_AUTOMATION.md)를 참조하세요.
