# 로컬 EasyOCR 배치와 Supabase 결과 저장

1단계에서 수집한 활성 상세 소개 이미지(`DETAIL`)를 로컬에서 내려받아 한국어·영어 EasyOCR로 판독합니다. 기본은 **새 OCR 시도 최대 3장**, CPU 순차 처리입니다. 포스터는 기본 대상에 포함하지 않습니다. 소개 이미지가 프로그램인지 분류하거나 작품을 매칭하지 않으며, 기존 검색 화면·Tesseract OCR·캐시를 바꾸지 않습니다. 큐·Cron·Python 웹 서버·외부 배포는 없습니다.

## 지금 실행할 순서

1. 아직 새 마이그레이션을 적용하지 않은 환경에서는 Supabase의 기존 프로젝트 **SQL Editor**에서 `supabase/migrations/202610140002_concert_image_ocr.sql` 전체를 한 번 실행하세요. 이 SQL은 1단계 테이블이 이미 존재하는 것을 전제로 합니다. 기존 `202610140001`을 재실행하지 않습니다. 현재 연결된 프로젝트에서는 새 OCR 테이블과 실제 기록 RPC 동작까지 확인했습니다.
2. 프로젝트 루트 `.env`의 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. OCR 배치에는 KOPIS API 키가 필요하지 않습니다. 이미지 원본 URL은 DB에서 읽습니다. 비밀키를 Python에 전달하지 않습니다.
3. Windows Git Bash에서 아래 명령을 실행하세요. `.venv` 기본 경로를 사용하면 별도 activate는 필요하지 않습니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas

# 후보 목록만: Python/모델/새 OCR 테이블 없이도 실행 가능
npm run ocr:batch -- --list

# 실제 이미지 다운로드·OCR 실행, DB에는 쓰지 않음
npm run ocr:batch -- --dry-run

# 최대 3장의 새 OCR 성공/실패 기록 저장
npm run ocr:batch

# 같은 내용의 성공 결과는 재사용하고, 다음 미처리 이미지를 이어서 분석
npm run ocr:batch

# 이미지 시도 상한 변경
npm run ocr:batch -- --limit 5

# 기존 성공 내용도 강제 판독 (동일 내용/버전의 저장 결과는 보존)
npm run ocr:batch -- --force --limit 1

# 모델이나 실제 DB 없이 Node/로컬 SQL 검증
npm run test:easyocr

# Python 보조 로직 검증 (모델 불필요)
./.venv/Scripts/python.exe -m unittest discover -s python/easyocr -p test_worker.py
```

실패가 있으면 나머지 이미지를 계속 처리한 뒤 종료 코드 1을 반환합니다. Ctrl+C는 현재 worker를 종료하며 취소 코드는 130입니다. 중단된 이미지는 성공으로 기록하지 않습니다. 실행 중 상태를 DB에 올리지 않으므로 종료 후 잠긴 작업이나 PENDING 행이 남지 않습니다.

## Python 환경과 설치

Windows에서는 Python 3.12 가상환경을 사용합니다. 이번 PC의 PATH에는 실행 가능한 Python이 없어 프로젝트 안에만 환경을 준비했습니다. 전역 Python·PATH 설정은 바꾸지 않습니다. 로컬 배포판은 `.cache/python-portable`, 실행 환경은 `.venv`에 두며 둘 다 Git에서 제외됩니다. `.venv`는 그 기반 Python 디렉터리가 있어야 실행됩니다.

다른 PC에서 새로 준비할 때는 Python 3.12를 설치한 뒤 프로젝트 루트에서 `py -3.12 -m venv .venv`로 환경을 생성하세요. 그 다음 아래 순서로 설치합니다. EasyOCR 공식 안내는 Windows에서 PyTorch/torchvision을 먼저 설치하도록 안내하며, 이번 배치는 CPU를 사용합니다. [EasyOCR 설치 안내](https://github.com/JaidedAI/EasyOCR), [PyTorch 공식 설치 안내](https://pytorch.org/get-started/locally/).

```bash
./.venv/Scripts/python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
./.venv/Scripts/python.exe -m pip install -r python/easyocr/requirements.txt
./.venv/Scripts/python.exe -m pip check
```

`python/easyocr/requirements.txt`는 EasyOCR 1.7.2를 명시합니다. 실제 검증한 환경은 Python 3.12.15, EasyOCR 1.7.2, torch 2.14.1+cpu, torchvision 0.29.1+cpu입니다. `pip check`가 통과했습니다. Windows CPU 환경의 전체 버전은 `python/easyocr/requirements-windows-cpu.lock.txt`에 기록했습니다. 동일 환경 복원 시 다음처럼 설치합니다.

```bash
./.venv/Scripts/python.exe -m pip install --extra-index-url https://download.pytorch.org/whl/cpu -r python/easyocr/requirements-windows-cpu.lock.txt
```

한국어 인식 모델과 CRAFT 모델은 EasyOCR의 공식 배포 URL에서 최초 실행 때 내려받고, 다음 실행부터 `.cache/easyocr/models`를 재사용합니다. 필요하면 [EasyOCR 공식 모델 허브](https://www.jaided.ai/easyocr/modelhub/)에서 모델을 준비할 수 있습니다. EasyOCR는 배포 모델의 내장 체크섬도 검사합니다. 모델은 브라우저나 Supabase Storage에 업로드하지 않습니다.

## 선택 환경변수

새 비밀키는 필요하지 않습니다. 기존 Supabase 서버 키를 `.env`에서 재사용하며 `.env.example`에는 설명과 선택 변수만 추가했습니다.

| 변수 | 기본값 / 역할 |
| --- | --- |
| `EASYOCR_PYTHON` | Windows `.venv/Scripts/python.exe`, 그 외 `.venv/bin/python`. 다른 가상환경이면 실행 파일 경로 지정 |
| `EASYOCR_CACHE_DIR` | `.cache/easyocr`. 로컬 모델·일시 이미지 디렉터리 |
| `EASYOCR_TIMEOUT_MS` | 이미지당 180000ms. 1000~900000 허용, 첫 모델 초기화 시간 포함 |
| `OCR_MAX_IMAGE_BYTES` | 기존 설정 재사용. 기본 6000000바이트 |
| `OCR_MAX_IMAGE_PIXELS` | 기존 설정 재사용. 기본 12000000픽셀 |
| `OCR_DOWNLOAD_TIMEOUT_MS` | 기존 설정 재사용. 기본 다운로드 시도당 10000ms |

다운로드·DB 요청에는 기존 제한 재시도 모듈을 재사용합니다. 이미지 하나의 OCR 타임아웃이 나면 해당 Python worker를 종료하고 다음 이미지에서 새 worker를 시작합니다. 다운로드 오류·OCR 실패는 이번 단계의 FAILED 시도이며, 다음 수동 실행에서 다시 시도할 수 있습니다.

## 데이터와 재실행 규칙

배치는 서울·오늘~30일 후에 기간이 겹치는 예정/진행 공연의 `is_active=true`, `image_type=DETAIL` 이미지만 고릅니다. 한국 시간과 기간 겹침 규칙은 1단계와 같습니다. UUID 순서로 전체 후보 페이지를 순회하며, 시도 상한 또는 마지막 후보에서 종료합니다.

성공 결과 재사용 전에 **원본 URL에서 현재 바이트를 다시 다운로드**하여 SHA-256을 계산합니다. 따라서 URL이 같아도 실제 내용이 달라졌으면 새 결과를 만듭니다. 변하지 않은 성공 결과는 Python에 보내지 않으며 새 OCR 상한을 소비하지 않습니다. 예를 들어 17개 후보 중 3개가 이미 성공했다면 다음 실행은 그 3개를 재사용하고 다음 미처리 3개를 분석할 수 있습니다. 모두 성공한 상태에서는 다운로드/해시 확인만 하고 새 DB 행을 만들지 않습니다.

| 테이블 | 내용 |
| --- | --- |
| `public.concert_image_ocr_results` | 성공한 OCR 원문 `raw_text`, 텍스트별 `detections`(bbox·confidence), `mean_confidence`, 이미지 크기, `content_sha256`, 엔진·PyTorch·파이프라인 버전, 설정, 처리 시각 |
| `public.concert_image_ocr_attempts` | 완료된 시도의 `SUCCEEDED`/`FAILED`, 이미지 ID, 성공 결과 ID, 오류 코드, 시작/종료 시각, 소요 시간. 작업 큐 아님 |

성공 결과의 `(image_id, content_sha256, pipeline_version)`은 UNIQUE입니다. 같은 내용/버전의 성공 결과는 강제 재실행해도 기존 ID와 원문을 보존하고 시도만 추가합니다. 새 내용이나 새 파이프라인 버전은 새 결과 행으로 보관합니다. 실패는 성공 결과를 덮어쓰지 않습니다. 다운로드 전 실패는 hash가 null일 수 있으며, OCR 후 실패는 계산된 hash를 기록합니다.

각 저장 요청에는 고유한 시도 UUID를 사용합니다. 같은 HTTP 저장 요청이 재시도되어도 완료 기록이 중복되지 않습니다. `record_concert_image_ocr` RPC가 결과와 시도를 하나의 트랜잭션으로 기록하므로 중간 DB 오류는 전부 롤백됩니다. 이미지가 OCR 도중 비활성화되거나 출처가 달라졌으면 저장을 거부합니다. 1단계 재수집은 OCR 테이블을 갱신하지 않고 기존 이미지 ID를 보존합니다.

두 새 테이블은 RLS가 활성화되어 있고 PUBLIC/anon/authenticated 권한과 공개 정책이 없습니다. 서버 역할에 SELECT/INSERT와 기록 함수 실행 권한만 부여합니다. 기존 로그인·보관함·공연 수집 정책은 변경하지 않습니다.

## 이미지 처리와 결과 해석

- 기존 OCR과 같은 KOPIS `/upload/` 호스트만 허용하며 리디렉션은 따라가지 않습니다. 크기 제한은 스트림을 읽는 동안에도 적용하고 실제 이미지 디코딩·픽셀 수·페이지 수를 확인합니다.
- 원본 이미지 해시는 원본 바이트 기준입니다. Python에는 Node가 검증한 PNG의 일시 파일만 전달합니다. 파일은 이미지 처리 후 제거하며 영구 이미지 저장소는 만들지 않습니다.
- 한 Python 프로세스에서 Reader를 한 번 초기화해 재사용합니다. `ko,en`, CPU, PyTorch 스레드 2개, EasyOCR workers 0, batch size 1입니다.
- 긴 이미지는 높이 1600px·겹침 128px 타일로 나눕니다. bbox는 전체 이미지 좌표로 복원하고, 같은 위치에서 겹쳐 읽은 동일 문자열은 더 높은 confidence 하나를 유지합니다. 서로 다른 위치의 반복 문구는 유지합니다.
- 결과의 confidence는 엔진이 반환한 텍스트 판독 신뢰도입니다. 평균값이 프로그램 이미지 여부나 작품 일치 확률을 뜻하지 않습니다. 출력은 원문이며 잘못 읽은 글자를 작품 DB를 이용해 보정하지 않습니다. 텍스트가 없는 이미지도 빈 문자열·빈 detections·null 평균으로 성공할 수 있습니다.
- 파이프라인 식별자는 `easyocr-1.7.2-ko-en-cpu-tiles-v1`입니다. Node와 Python은 `python/easyocr/pipeline.json`의 동일 설정을 읽습니다. 모델·언어·타일·전처리·판독 설정이나 잠긴 엔진 의존성 변경 시 이 파일의 식별자도 올려 이전 결과와 구분해야 합니다. 공통 모듈의 역할은 [공연 코드 구조](CONCERT_PIPELINE.md)에 있습니다.

## 로그와 확인 방법

최종 JSON에는 조건·파이프라인·상한, `scanned`(검토 후보), `cached`(재사용), `attempted`(새 시도), `recognized`(OCR 성공), `saved`(성공 결과 DB 저장 완료), `failures`(이미지/공연 ID별 단계·코드), `limitReached`, `cancelled`, 최대 3개 판독 미리보기를 표시합니다. dry-run은 실제 OCR을 수행하지만 `saved=0`입니다. 성공 시도와 실패 시도의 전체 행은 DB의 attempts 테이블에서 확인할 수 있습니다.

실제 저장 후 `supabase/verification/concert_image_ocr.sql`을 SQL Editor에서 실행하면 원문·confidence·시도·중복 검사를 확인할 수 있습니다. 이는 읽기 전용입니다. 새 마이그레이션이 없으면 실제 저장 모드는 `OCR_MIGRATION_REQUIRED`로 OCR 시작 전에 중단합니다. 후보 목록과 dry-run은 1단계 테이블만으로 작동합니다.

오류 코드 예:

| 코드 | 확인할 사항 |
| --- | --- |
| `EASYOCR_PYTHON_UNAVAILABLE` | Python 실행 파일과 `.venv` 위치 |
| `EASYOCR_DEPENDENCY_FAILED` | EasyOCR 1.7.2, CPU torch/torchvision, `pip check` |
| `EASYOCR_MODEL_INIT_FAILED` | 모델 다운로드 연결과 `.cache/easyocr/models` |
| `EASYOCR_TIMEOUT` | 이미지 크기와 CPU 처리 시간, 최초 모델 준비 시간 |
| `OCR_SOURCE_BLOCKED`, `OCR_IMAGE_TOO_LARGE`, `OCR_IMAGE_INVALID` | 이미지 출처·용량·해상도·형식 |
| `SUPABASE_HTTP_400/403/404` | 마이그레이션·권한·RPC·서버 키가 같은 프로젝트인지 |

Python에는 DB/KOPIS 비밀키를 넘기지 않고, 원문 예외·요청 헤더·키 포함 URL을 로그에 출력하지 않습니다. 브라우저 빌드에는 로컬 배치 모듈과 비밀키를 포함하지 않습니다.

## 구현 파일

- `server/easyOcrConfig.mjs`, `easyOcrBatch.mjs`, `easyOcrWorker.mjs`: 설정·순차 배치·일시 파일과 Python 프로토콜·결과 검증.
- `server/kopisImageDownload.mjs`: KOPIS 원본 다운로드·용량/이미지 검증·원본 해시.
- `server/supabaseRest.mjs`, `supabaseOcr.mjs`: 서버 전용 공용 REST 어댑터·후보/결과 조회·기록 RPC. 1단계 `supabaseCollector.mjs`도 공용 연결 처리를 재사용.
- `scripts/runEasyOcrBatch.mjs`: 로컬 CLI. `python/easyocr/worker.py`: EasyOCR 전용 프로세스.
- `supabase/migrations/202610140002_concert_image_ocr.sql`, `supabase/verification/concert_image_ocr.sql`: DB 변경과 확인문.
- `server/easyOcrBatch.test.mjs`, `easyOcrSql.test.mjs`, `scripts/testEasyOcr.mjs`, `python/easyocr/test_worker.py`: 자동 검증. 기존 `npm test`에도 Node/SQL 테스트 연결.
- `.gitignore`, `.env.example`, `package.json`, 문서: 로컬 환경 제외·설정·명령 안내.

## 검증 기록

- `npm run test:easyocr`: 13개 통과. 실패 후 계속, 상한, 실제 내용 해시 캐시, dry-run 무쓰기, 후보 페이지, subprocess 타임아웃·종료·비밀키 차단, 실제 로컬 SQL의 중복 방지·성공 보존·오류 롤백·RLS 권한을 검증했습니다.
- Python 보조 테스트: 3개 통과. 타일 범위, 전체 이미지 bbox, 겹침 중복 제거를 검증했습니다.
- 기존 수집 테스트 11개 통과. 웹앱 빌드 성공, 브라우저 번들에 서버 비밀값과 로컬 OCR 진입점이 없음을 확인했습니다.
- 전체 테스트 151개 중 150개 통과. 기존 홈 탐색 DOM 테스트의 “기존 감정 최고 적합도 유지” 실패 1개는 이전 단계에서 변경 전 HEAD에서도 재현한 동일 문제이며 관련 UI 코드는 수정하지 않았습니다.
- 후속 코드 정리(2026-10-15): 홈 DOM 테스트를 현재 키워드 후보 정책에 맞춰 수정한 후 전체 151개 테스트가 모두 통과했습니다. 앱 추천 로직은 변경하지 않았습니다.
- 실제 dry-run(2026-10-14 KST): 상세 이미지 3장 판독 성공, 실패 0, DB 쓰기 0. 각각 829·402·2889자를 읽었습니다. 판독문에는 오탈자가 있으며 이 검증은 텍스트 처리 경로의 확인이고 작품 식별 정확성 검증은 아닙니다.
- 실제 DB 저장·재실행(2026-10-15 01:11 KST): 날짜가 바뀌어 새 범위인 2026-10-15~2026-11-14의 활성 이미지에서 3장을 골랐습니다. 실제 OCR 성공 결과 3개와 완료 시도 3개를 저장했고 실패는 0이었습니다. 원문 길이는 766·1962·288자입니다. 같은 3장으로 재실행하자 3개 모두 hash/버전 기준으로 재사용했고 Python 판독 호출은 0, 결과와 시도 행은 각각 3개로 유지됐습니다. 원문·ID·생성 시각도 바뀌지 않았습니다. 결과 요약은 Git 제외 경로 `.cache/easyocr-live-verification.local.json`에 있습니다.
- 기존 공연·이미지 수집 테이블은 변경하지 않았으며 실제 검증에는 운영 테이블의 가짜 공연이나 가짜 OCR 결과를 사용하지 않았습니다. 타임아웃·실패·롤백·권한 오류 주입은 로컬 테스트에서만 수행했습니다.
