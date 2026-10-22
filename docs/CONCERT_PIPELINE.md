# 공연 검색과 수집 코드 구조

기존 웹 검색과 로컬 수집·OCR 배치는 각각 실행 진입점을 가지며, 공통 조건과 이미지 검증을 재사용합니다. 키는 서버/로컬 프로세스 환경에서 읽고, 로컬에서는 루트 `.env`를 사용합니다.

## 실행 흐름

| 작업 | 명령 / 진입점 | 실행 모듈 |
| --- | --- | --- |
| 기본 웹 검색 | `npm run dev`, `npm start`, Vercel `api/index.js` | `concertSearchService.mjs` → `server/api.mjs` → `kopis.mjs` → 필요할 때 `programOcr.mjs`(Tesseract) |
| DB 검색 미리보기 | 같은 진입점, 서버 설정 `CONCERT_SEARCH_BACKEND=supabase` | `supabaseConcertSearch.mjs` → `supabaseRest.mjs` → 기존 비공개 유효성 뷰 GET |
| 공연 수집 | `npm run collect:concerts` / `scripts/collectConcerts.mjs` | `concertCollector.mjs` → `supabaseCollector.mjs` |
| 로컬 OCR | `npm run ocr:batch` / `scripts/runEasyOcrBatch.mjs` | `easyOcrBatch.mjs` → `easyOcrWorker.mjs` → `python/easyocr/worker.py`, 저장은 `supabaseOcr.mjs` |
| 저장 OCR 분석·검토 | `npm run program:analyze` / `scripts/runProgramAnalysis.mjs` | `supabaseProgramAnalysis.mjs` → `programAnalysis.mjs`, 저장·검토는 전용 RPC |
| 로컬 통합 배치 | `npm run pipeline -- plan/run/latest` / `scripts/Invoke-ConcertPipeline.ps1` | `concertPipeline.mjs` → 기존 수집/OCR/분석 모듈, 로컬 커서·재시도·실행 잠금 |

수집·OCR 배치가 웹 요청이나 브라우저에서 자동 실행되지는 않습니다. 기본 웹 검색은 기존 KOPIS/Tesseract 경로입니다. [DB 검색 미리보기](SUPABASE_CONCERT_PREVIEW.md)는 유효한 확정 EXACT 결과만 반환하며 OCR·재분석·DB 쓰기나 다른 경로로의 우회를 수행하지 않습니다. 확정 근거는 수동 또는 `program-auto-1` 자동 receipt이며 같은 작품 식별·원본 유효성 검사를 통과해야 합니다.

[통합 배치와 Windows 예약 안내](LOCAL_PIPELINE.md)는 plan → 수동 실행 → 결과 확인 → 예약 등록 순서입니다. `.cache/concert-pipeline/`의 진행/결과는 Git에서 제외됩니다. [지난 공연 정리](EXPIRED_CONCERT_CLEANUP.md)는 `pipelineCleanup.mjs`와 서버 전용 정리 RPC를 사용하며 신규 마이그레이션 `202610160001`이 필요합니다. 기존 예약은 재등록 없이 기본 cleanup 상한 100개를 적용합니다. 현재 daily/analysis-only는 분석 뒤 자동 결정을 실행하며 `202610210001` identity와 `202610220001` automation RPC를 사전 검사합니다. 후보의 확정·미연결·재시도와 입력 변경 재평가는 [자동 처리 안내](PROGRAM_AUTOMATION.md)를 참조하세요. 코드 게시와 운영 SQL 적용은 별개입니다.

## 모듈별 책임

| 모듈 | 담당 |
| --- | --- |
| `src/data/concertSearchConfig.js` | 브라우저/서버가 공유하는 지역 코드·한국 날짜·검색 기간 검증. 비밀키나 네트워크 코드 없음 |
| `server/concertCollectionConfig.mjs` | 수집·DB 후보 조회에서 공유하는 서울/클래식/예정·진행/30일 조건 |
| `server/kopisData.mjs` | XML 해석과 공연 데이터 정규화. OCR 의존성 없음 |
| `server/collectionHttp.mjs` | 로컬 배치의 제한 재시도·타임아웃·비밀값 없는 오류 |
| `server/supabaseRest.mjs` | 서버 Supabase 연결과 인증. 수집기와 OCR 저장기가 재사용 |
| `server/ocrImageConfig.mjs` | 두 OCR 엔진의 공통 이미지 용량·픽셀·다운로드 시간 제한 |
| `server/kopisImageSource.mjs` | 허용 KOPIS 이미지 출처 확인과 용량 제한 스트림 읽기 |
| `server/kopisImageDownload.mjs` | EasyOCR용 다운로드 재시도·PNG 변환·원본 해시 |
| `server/ocrConfig.mjs` | 기존 Tesseract 검색의 worker·캐시·판독 시간 설정 |
| `server/easyOcrConfig.mjs` | 로컬 Python·모델 경로·EasyOCR 시간 제한·CLI 옵션 |
| `python/easyocr/pipeline.json` | Node와 Python이 함께 읽는 파이프라인 버전·엔진 버전·언어·타일·판독 설정 |
| `server/easyOcrBatch.mjs` | 후보 순회와 상한·집계. 이미지 한 장의 다운로드/캐시/판독/기록 처리는 내부 함수로 구분 |

OCR 배치와 DB 어댑터는 조건을 얻기 위해 KOPIS 수집기 전체를 불러오지 않습니다. EasyOCR 설정은 Tesseract 전용 캐시나 판독 제한과 독립적입니다.

## 변경할 때 확인할 지점

- 수집 범위 변경: `concertCollectionConfig.mjs`. 기존 브라우저 검색의 사용자 선택 조건은 `concertSearchConfig.js`에서 관리합니다.
- 두 엔진의 이미지 제한·허용 출처 변경: `ocrImageConfig.mjs`, `kopisImageSource.mjs`.
- EasyOCR 언어·타일·판독 방식 변경: `pipeline.json`에서 바꾸고 `pipelineVersion`도 올립니다. 기존 성공 결과와 새 설정 결과를 구분해야 합니다.
- OCR 기록 방식 변경: `supabaseOcr.mjs`와 신규 SQL 마이그레이션. 이미 적용한 마이그레이션은 그대로 보존합니다.
- 저장 OCR의 작품 추출·매칭: `programAnalysis.mjs`에서 변경하고 `MATCHER_VERSION`을 올립니다. [분석·검토 안내](PROGRAM_ANALYSIS.md)를 참고하세요.

## 검증 명령

```bash
npm run test:collection
npm run test:easyocr
npm test
npm run build
./.venv/Scripts/python.exe -m unittest discover -s python/easyocr -p test_worker.py
```

실제 DB를 변경하지 않고 연결·후보 조회를 확인하려면 `npm run ocr:batch -- --list`를 사용합니다. 실제 판독까지 확인하는 `--dry-run` 역시 DB에 쓰지 않습니다. 각 단계의 환경 설정과 실행 결과는 [공연 수집](CONCERT_COLLECTION.md), [EasyOCR 배치](EASYOCR_BATCH.md)에 있습니다.

코드 정리 과정에서 기존 홈 DOM 테스트의 추천 기준도 현재 키워드 후보 정책에 맞췄습니다. 추천 로직·화면 동작·DB 스키마·기존 OCR 파이프라인 버전은 변경하지 않았습니다.

2026-10-15 정리 후 전체 테스트 151개, Python 보조 테스트 3개와 웹앱 빌드가 통과했습니다. 홈 테스트는 현재 키워드 추천 후보에 포함되는지를 검증하며, 개별 추천 정책의 점수·후보·가중치 검증은 기존 추천 모듈 테스트에서 수행합니다.

실제 상세 이미지 1장(PF300258)도 새 공통 설정으로 dry-run하여 766자·32개 영역을 판독했고 실패와 DB 쓰기는 0이었습니다. 웹 빌드 산출물에 서버 키·배치 진입점이 포함되지 않는 것도 확인했습니다.

## 로컬 파일 정리

참조 없는 일회성 실험 스크립트 `probeSacCalendar.mjs`, `probeProgramOcr.mjs`와 루트 디버그 스크린샷을 제거했습니다. 현재 수집·OCR 실행기와 재사용 가능한 검증 명령은 유지합니다. Chrome 디버그 프로필 `.chrome-debug/`는 로컬에 보존하되 Git 추적에서 제외합니다.

설치 압축 파일·패키지 다운로드 캐시·이전 HEAD 비교용 사본·임시 로그는 사용 후 삭제할 수 있습니다. 현재 Python 가상환경의 기반 실행 파일은 `.cache/python-portable/`에 있으므로 이 디렉터리와 `.venv/`, `.cache/easyocr/models/`, `.cache/ocr/`는 유지해야 합니다. `.cache` 전체를 일괄 삭제하면 현재 로컬 실행 환경이 깨질 수 있습니다. 실제 수집·OCR 검증 요약 JSON도 보존합니다.
