# OCR 시간 예산과 analysis 예약

daily/initial의 등록 인자와 전체 MaxSeconds=1800은 그대로 사용합니다.
`scripts/runConcertPipeline.mjs`가 `performance.now()` 기반 전체 deadline을 만들고,
일반 통합 배치에 아래 코드 기본 정책을 적용합니다. 새 환경변수는 없습니다.
analysis-only에는 OCR 예약 정책을 적용하지 않습니다.

| 항목 | 기본값 |
|---|---:|
| analysis 및 종료 예약 | 180초 |
| OCR stage 종료 목표 | 전체 시작 +1620초 |
| 새 이미지 시작/진행 중 작업 취소 경계 | 전체 시작 +1615초 |
| 소유 Python 트리 종료 유예 | 5초 |
| 전체 deadline 이후 종료 정리 관측 유예 | 10초 |

OCR의 시작 예산은 `max(0, 전체 monotonic deadline - 180초 - 5초 - 현재 monotonic 시각)`입니다.
선행 단계가 사용한 시간을 자동으로 빼며 고정 sleep이나 이미지당 예상 시간을 사용하지 않습니다.
타이머가 일찍 깨어나도 monotonic 시각을 다시 검사합니다. 벽시계 변경은 deadline을 바꾸지 않습니다.
선행 단계가 이미 예약 구간을 사용했다면 OCR을 시작하지 않고 남은 전체 예산으로 analysis에 진입합니다.

Python 의존성 로딩은 OCR을 실제 시작할 때 수행합니다. OCR용 요청에는 별도 signal을 전달하고,
그 signal은 전체 취소와 OCR stage 만료를 모두 반영합니다. 진행 중 Python은 런타임이 생성한
ChildProcess 객체만 대상으로 기존 `taskkill /PID <owned pid> /T /F` 경로로 정리합니다.
프로세스 이름 검색이나 Vite/무관한 Python 종료는 없습니다.

예산 취소는 FAILED attempt, failure backoff 또는 완료 체크포인트를 만들지 않습니다.
`ocr.time_budget_reached=true`, `termination_reason=OCR_STAGE_BUDGET_EXHAUSTED`,
`budget_cancelled_images`, `remaining.known_unprocessed`, `deferred_targets`에 남기고 analysis로 이어집니다.
실제 EASYOCR_TIMEOUT/이미지 오류는 기존 FAILED 및 cooldown 정책을 유지합니다.
예산 소진으로 미처리 대상이 남으면 전체 결과는 PARTIAL/exit 1이며, 이미지 오류로 집계하지 않습니다.

성공한 OCR은 즉시 저장합니다. 저장 응답이 취소된 경우에도 서버에 이미 커밋된 성공은
새 DB snapshot에서 다시 읽어 같은 실행의 분석 대상으로 사용할 수 있습니다.
완료되지 않은 취소 작업에는 새 FAILED 기록을 만들지 않습니다.

`time_budget`, `ocr.time_budget`, `worker_shutdown_ms`,
`analysis.remaining_total_budget_ms_at_start`에서 실제 배분을 확인할 수 있습니다.
launch 영수증에도 time_budget과 OCR 예산 소진 여부를 기록합니다.
작업 종료는 기존 finally/원자적 latest·run 기록/잠금 해제/절전 해제/출력 drain을 유지합니다.

예: 선행 단계 80초, OCR 최대 1535초, worker 종료 최대 5초이면
analysis 시작 목표는 전체 1620초 이내입니다. 분석 23초와 종료 정리 10초라면 약 1653초입니다.
1800초 안에 끝내는 것이 목표이며 10초 정리 유예는 PT32M(1920초)보다 앞섭니다.
OS 스케줄링 지연·native 이미지 변환·파일 I/O까지 강제 종료 시각을 보장하는 것은 아닙니다.
실제 예약 실행의 총시간과 종료 유예 초과 여부는 별도 관측해야 합니다.
