# 공연일 우선 처리와 30분 실행 프로필

기존 커서·대기열·재시도·성공 결과·수동 검토는 유지합니다. 새 SQL이나 환경변수는 필요 없습니다. 이번 구현에서 실제 run, 원격 DB 쓰기, 이미지 요청/OCR, 예약 변경은 하지 않습니다. 아래 처리량은 실제 30분 실행으로 검증되지 않은 시작 설정입니다.

## 우선순위와 분배

모든 단계에 동일한 날짜 구간을 적용합니다. `TODAY`·`TOMORROW`·`NEXT_7_DAYS`(오늘+2~7일)·`LATER`(8일 이후)·`UNKNOWN`은 겹치지 않습니다. 종료되었거나 현재 30일 범위와 겹치지 않는 알려진 날짜는 제외합니다. 날짜를 모르는 수집 ID는 UNKNOWN으로 남겨 기존 큐를 보존합니다.

시작일이 지난 기간형 공연은 오늘이 보유 기간과 겹친다는 하한만 사용합니다. `priority_date=오늘`, `date_basis=ONGOING_RANGE_NEXT_SESSION_UNKNOWN`은 **오늘 실제 회차가 있다는 뜻이 아닙니다**. 원본 시작/종료일도 함께 표시하며 정확한 다음 회차는 만들지 않습니다.

수집·이미지 확인/OCR은 5슬롯 중 4슬롯을 미처리/실패 복구, 1슬롯을 기존 성공 자료 변경 확인/한도 보류 재확인에 우선 배정합니다. 비어 있는 슬롯은 다른 그룹이 사용합니다. 캐시와 보류 재확인은 이미지 확인 상한을 소비하지만 새 OCR 상한은 소비하지 않습니다.

각 그룹의 날짜 순환은 **오늘 → 내일 → 오늘 → 2~7일 → 그 이후/UNKNOWN**입니다. 해당 구간이 비면 가장 가까운 남은 구간이 사용합니다. 그 이후/UNKNOWN도 전용 기회가 있어 가까운 자료의 지속 유입 때문에 무한히 밀리지 않습니다. 이는 모든 날짜를 엄격히 정렬하는 방식에 최소 진행 기회를 섞은 규칙입니다.

같은 그룹/날짜 구간에서는 가장 오래 슬롯을 받지 않은 공연을 먼저 선택하고, 같은 조건이면 가까운 날짜·KOPIS ID·이미지 순서·대상 키로 정렬합니다. 같은 공연의 두 번째 이미지보다 아직 처리하지 않은 다른 공연에 기회를 줍니다. 각 실행에서 분석이 필요한 이미지들도 같은 공연 분배를 사용하며, 유효한 동일 분석의 재사용은 새 처리 슬롯을 소비하지 않습니다.

`state.priority.collect/ocr/analysis`에 슬롯 순환 위치와 공연별 마지막 처리 순번을 추가합니다. 실제 처리 경계에서만 체크포인트에 반영하고, plan은 복제한 상태로 계산합니다. 기존 `collection`, `retries`, `touched`, `owners`, `lanes`를 초기화하지 않습니다. 종료 공연 정리 시 그 공연의 분배 메타데이터만 함께 제거합니다. 실패 대기·24시간 한도 보류는 우선순위보다 먼저 적용합니다.

목록 탐색은 대기열 크기와 무관하게 기존 `ListPages` 안에서 커서를 전진시킵니다. 이미 요청한 첫 페이지도 반드시 소비합니다. 한 순환이 끝나면 해당 실행의 추가 목록 조회를 멈추며 전체 최신 KOPIS 공연 수는 UNKNOWN입니다.

## 명시적 처리량 선택

| 프로필 | 수집 공연 | 새 OCR 시도 이미지 | 분석 이미지 | 이미지 확인 | 배치 시간 |
| --- | ---: | ---: | ---: | ---: | ---: |
| initial | 20 | 20 | 20 | 40 | 1,800초 |
| daily | 10 | 20 | 20 | 40 | 1,800초 |

기존 custom 기본값과 기존 예약의 고정 인자는 자동 변경하지 않습니다. `-Profile initial/daily` 또는 Node `--profile initial/daily`를 명시적으로 선택합니다. 별도로 전달한 기존 상한 인자가 프로필보다 우선합니다. `ListPages=4`, `DbPages=20`, `RecheckHours=24`, `CleanupLimit=100`은 그대로입니다.

목록은 페이지당 100행, 최대 4페이지의 원본 목록 행을 확인할 수 있습니다. DB는 각 테이블 또는 관계 ID 묶음당 페이지 100행×20이며, 넘으면 `DB_SCAN_LIMIT`로 명시적으로 중단합니다. 현재 확인된 39개 공연·58장 이미지·80개 수집 대기 수준은 DB 상한에 걸리지 않습니다. 이미지/공연 유입량에 따른 전체 확보 실행 횟수는 아직 UNKNOWN입니다.

수동 점검과 실행 명령은 다음과 같습니다. **실제 run은 사용자가 별도로 실행하고 결과를 확인하는 단계입니다.**

```powershell
Set-Location 'C:\Users\CNXK\dev\sound-atlas'
.\scripts\Invoke-ConcertPipeline.ps1 -Mode plan -Profile initial
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run -Profile initial
.\scripts\Invoke-ConcertPipeline.ps1 -Mode latest
```

initial의 기존 인자 표현은 다음과 같습니다.

```powershell
.\scripts\Invoke-ConcertPipeline.ps1 -Mode run -CollectLimit 20 -OcrLimit 20 -AnalysisLimit 20 -ImageChecks 40 -MaxSeconds 1800
```

시간 상한은 새 작업 시작과 다운로드 후 OCR 진입 등의 경계에서 확인하고, CLI 타이머는 진행 중인 HTTP/Python 작업도 기존 취소 신호로 중단합니다. 이미 저장된 완료 결과와 체크포인트를 보존합니다. 미완료 슬롯은 분배 순환을 진행시키거나 완료 표시/실패 재시도 상태로 바꾸지 않습니다. 종료 정리와 체크포인트 저장은 배치 시간 이후 예약의 120초 유예 안에서 마무리합니다. 강제 OS 종료까지 포함한 실제 최악 실행 시간은 미검증입니다.

## plan/latest 관측

- `known_backlog`: 마지막 DB 스냅샷과 체크포인트 기준의 확인된 작업량. collection은 공연 단위, OCR/분석은 이미지 단위입니다. 날짜별 new·recheck·cooldown·held·ready/blocked를 표시합니다. held는 보류 총수로 cooldown/recheck와 겹칠 수 있습니다. 후보 수와 검색 가능한 공연 수로 해석하지 마세요.
- `priority_selection`: 단계별 후보의 KOPIS ID·이미지/결과 ID·보유 날짜·날짜 구간·날짜 근거·새 처리/변경 확인·선택 이유. plan의 OCR 목록은 이미지 확인 상한까지의 순서이며 새 OCR 상한·해시 결과에 따라 실제로는 먼저 멈출 수 있습니다. run/latest에서는 실제 진입한 대상만 표시하고, 단계 상태가 INTERRUPTED면 마지막 대상은 미완료일 수 있습니다.
- `stages.<단계>.started_at/finished_at/duration_ms`: 단계별 시간. plan의 preflight/cleanup 시간은 읽기 점검 시간이며 실제 수집/OCR/분석 시간은 아닙니다. `NOT_RUN` 단계의 0은 실행 시간을 측정하지 않았다는 뜻입니다.
- 수집 `new_processed/rechecked`: 성공 저장한 새 공연/갱신 공연. OCR `new_processed/rechecked`: 새 처리 그룹/변경 확인 그룹에서 처리 경계를 마친 이미지 확인 수이며 실패를 포함합니다. 실제 새 OCR 시도는 `attempted`, 성공 저장은 `succeeded`, 캐시는 `reused`, 동일 보류는 `held_unchanged/held_skipped`로 구분합니다. 분석 새 저장은 `succeeded`, 기존 완료 재사용은 `reused`입니다.
- `limit_reached`, OCR의 `ocr_limit_reached/image_check_limit_reached`, 수집의 `page_limit_reached`, `remaining`, 최상위 `time_limit_reached`와 `status/exit_code`: 처리/조회 상한과 시간 중단 여부. 중단 시에는 `remaining`이 null일 수 있어 `known_backlog`도 확인합니다.
- 외부 조회 전의 신규 목록 규모·원본 변경·실제 새 OCR 필요 수는 UNKNOWN입니다. 수동 확정이나 검색 노출 건수를 처리량으로 추정하지 않습니다.

## 예약 반영 순서 — 수동 실행 결과 확인 이후

Preview는 **제안 인자와 작업 시간 제한**, `Registered`에는 **현재 실제 등록값**을 표시합니다. Status는 실제 Actions·Triggers·배치 MaxSeconds·작업 ExecutionTimeLimit·호환 여부·최근/다음 실행을 표시합니다. 권한 문제나 미등록이면 조회 불가 상태를 표시하며 기본값을 실제 등록값으로 가장하지 않습니다.

```powershell
# 1. 새 daily 제안값과 현재 등록값을 비교합니다. 여기까지는 읽기 전용입니다.
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Preview -Profile daily -Time '09:00'
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Status

# 2. 수동 initial 결과를 확인하고, 작업이 Running이면 끝날 때까지 기다립니다.
# 3. 예약 반영을 결정한 뒤에만 기존 작업을 교체합니다.
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Remove
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Register -Profile daily -Time '09:00'

# 4. 실제 인자와 시간 제한을 다시 확인합니다.
.\scripts\Manage-ConcertPipelineTask.ps1 -Action Status
```

daily 등록값은 수집 10 / OCR 20 / 분석 20 / 이미지 확인 40 / 배치 1,800초이고, 작업 스케줄러 제한은 **1,920초(`PT32M`)**입니다. 현재 900초/17분 예약을 그대로 둔 채 명령 인자만 1,800초로 바꾸지 마세요. 기본 09:00 시각과 Interactive/Limited·중복 실행 방지는 유지합니다. Remove/Register는 체크포인트를 삭제하지 않습니다. 이번 구현에서는 위 변경 명령을 실행하지 않습니다.

## 2026-10-16 검증 결과

전체 로컬 테스트 220개, 관련 우선순위/통합 테스트 26개, Windows 테스트 4개, 수집 12개, OCR/SQL 15개, Python 보조 테스트 3개와 빌드가 통과했습니다. 테스트는 합성 이미지·가짜 OCR·로컬 SQL·모의 예약 조회를 사용하며 운영 예약을 등록/삭제하지 않습니다. 브라우저 번들에 서버 키 이름이나 배치 선택 모듈이 포함되지 않았습니다.

실제 DB의 initial 읽기 전용 plan은 **11:17:52 KST**, `PLAN_READY`(27.049초)였습니다. 저장 공연 39개·활성 상세 이미지 58장·분석 준비 0장·현재 분석 완료 재사용 17장입니다. 확인된 수집 미처리 80개는 오늘 0·내일 4·2~7일 15·이후 61개, OCR 미처리 그룹 40장은 오늘 19·내일 2·2~7일 4·이후 15장이었습니다. 오늘 19장에는 다음 회차를 모르는 기간형 공연 이미지 2장이 포함됩니다. 별도 실패 대기 1장·운영 보류 0장이고, 미탐색 KOPIS 규모와 실제 새 OCR 필요 수는 UNKNOWN입니다.

기존 대기열 71번째 PF302521(10월 17일)이 수집 계획 첫 번째로 선택됐습니다. 다음은 PF302795·PF302946이며, PF303210까지 내일 공연 네 건이 첫 여섯 슬롯에 포함됩니다. 5번째 슬롯에는 이후 날짜 공연이 배정되어 먼 날짜의 진행도 유지합니다. 이것은 외부 목록 조회 전의 계획이며 실제 수집 뒤 새로 알려진 자료가 순서를 바꿀 수 있습니다.

plan은 DB GET 22회(읽기 전용 정리 계획 RPC 포함), KOPIS/이미지 요청·OCR·DB 쓰기 0회였으며 운영 JSON 파일 9개와 메모리 체크포인트 값도 동일했습니다. 실제 예약 Preview에서는 새 제안 1,800초/32분과 현재 등록 900초/17분을 함께 확인했습니다. 운영 run·30분 실행 성능·예약 교체 후 실행은 미검증입니다.
