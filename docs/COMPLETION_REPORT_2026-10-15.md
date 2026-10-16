# Classic Atlas 공연 수집·OCR 기반 구축 완료 보고

작성일: 2026-10-15 (Asia/Seoul)  
기준 브랜치·커밋: `main` / `d72d113` (`update 1015`)  
현재 DB 현황 확인: 2026-10-15 10:06:45 KST, 읽기 전용 조회

KOPIS 공연정보·이미지 URL 수집, 로컬 EasyOCR 배치와 Supabase 결과 저장, 공통 코드 정리 및 불필요한 파일 정리를 완료했습니다. 현재는 공연 자료와 OCR 원문을 확보하는 단계까지 구현됐습니다. 기존 웹 검색은 KOPIS·Tesseract 경로를 계속 사용합니다.

## 1. 완료 범위

| 구분 | 완료 내용 |
| --- | --- |
| 프로젝트 조사 | 기존 목록·상세 API, XML 파싱, 정규화, 검색·OCR 호출, 환경변수와 실행 구조 확인 |
| 공연 수집 | 서울 클래식 예정·진행 공연을 한국 시간 오늘부터 30일 후까지 수동 수집 |
| 날짜·페이지 처리 | 기간이 겹치는 진행 공연 포함, 페이지 순차 조회, 중복 ID 제거, 기본 성공 상한 10개 |
| 공연·이미지 저장 | KOPIS ID 기준 공연 upsert, 원본 URL 저장, 이미지 추가·비활성화·재활성화 |
| 로컬 OCR | 활성 상세 이미지에 한국어·영어 EasyOCR CPU 순차 적용, 기본 새 시도 상한 3장 |
| OCR 결과 저장 | 원문·텍스트 위치·신뢰도·이미지 해시·설정/엔진 버전·완료 시도 기록 저장 |
| 재실행·실패 처리 | 동일 이미지 내용의 성공 결과 재사용, 실패 후 계속 처리, 성공 결과 보존, 제한 재시도·타임아웃 |
| 접근 권한 | 서버 전용 키 사용, 새 테이블 RLS·명시적 권한, anon/authenticated 공개 정책 없음 |
| 코드 정리 | 공통 수집 조건·이미지 검증 분리, 두 OCR 엔진 설정 독립화, Node/Python 판독 설정 통합 |
| 파일 정리 | 미사용 실험 스크립트·스크린샷 삭제, 설치 잔여물 등 약 415MB 정리, Chrome 디버그 프로필 Git 추적 해제 |

관람 범위는 **오늘~30일 후의 양 끝을 포함한 31개 날짜**입니다. 2026-10-15 실행 기준 범위는 2026-10-15~2026-11-14입니다. 상세 소개 이미지는 `DETAIL` 출처로만 구분하며 프로그램 이미지라고 확정하지 않습니다. 피아노 전용 제한 없이 클래식 공연을 수집합니다.

다른 원격 브랜치의 예술의전당 조회 실험은 조사만 했으며 브랜치 전환·병합은 하지 않았습니다. 기준 커밋에서 작업 트리가 깨끗한 것을 확인한 후 본 보고서를 추가했습니다.

## 2. DB 구성과 현재 적재 현황

| 테이블 | 역할 | 확인 시점 행 수 |
| --- | --- | ---: |
| `public.concerts` | 공연 기본정보·기간·원본 수정 시각·수집 시각 | 10 |
| `public.concert_program_images` | 포스터/상세 원본 URL·순서·활성 여부 | 27 |
| `public.concert_image_ocr_results` | 성공한 OCR 원문·bbox·confidence·해시·버전 | 5 |
| `public.concert_image_ocr_attempts` | 완료된 OCR 성공/실패 시도 | 5 |

이미지 URL 27개는 모두 활성 상태였고, OCR 시도 중 `FAILED` 행은 0개였습니다. 이 수치는 작성 시점의 실제 DB 조회 결과입니다. 수집·OCR 데이터는 **제한된 표본**이며 전체 서울 클래식 공연이나 모든 이미지의 분석 완료를 의미하지 않습니다.

공연은 `kopis_id`, 이미지는 `(concert_id, source_url)`, OCR 성공 결과는 `(image_id, content_sha256, pipeline_version)`으로 중복을 방지합니다. 수집과 OCR 기록은 각각 RPC 트랜잭션으로 저장합니다. 상세 실패는 이미지 삭제/비활성화로 처리하지 않으며, OCR 실패는 이전 성공 결과를 덮어쓰지 않습니다.

공연 원본에 `updatedate`가 없으면 `kopis_updated_at`은 null입니다. 한국 현지 시각으로 해석한 원본 수정 시각과 마지막 수집 성공 기록인 `synced_at`을 구분합니다.

마이그레이션:

- [202610140001_concert_collection.sql](../supabase/migrations/202610140001_concert_collection.sql): 공연·이미지·인덱스·RLS·동기화 함수.
- [202610140002_concert_image_ocr.sql](../supabase/migrations/202610140002_concert_image_ocr.sql): OCR 성공 결과·완료 시도·RLS·기록 함수.

현재 연결된 프로젝트에서 두 단계의 실제 저장 동작을 확인했습니다. 코드·파일 정리 후 추가 마이그레이션은 필요하지 않습니다.

## 3. 주요 구현 파일

| 영역 | 주요 파일 |
| --- | --- |
| 공연 수집 | `scripts/collectConcerts.mjs`, `server/concertCollector.mjs`, `concertCollectionConfig.mjs`, `kopisData.mjs` |
| 공통 통신·DB | `server/collectionHttp.mjs`, `supabaseRest.mjs`, `supabaseCollector.mjs`, `supabaseOcr.mjs` |
| 이미지 검증 | `server/ocrImageConfig.mjs`, `kopisImageSource.mjs`, `kopisImageDownload.mjs` |
| OCR 배치 | `scripts/runEasyOcrBatch.mjs`, `server/easyOcrBatch.mjs`, `easyOcrWorker.mjs`, `easyOcrConfig.mjs` |
| Python 판독 | `python/easyocr/worker.py`, 공통 설정 `pipeline.json`, `requirements.txt`, Windows CPU 환경 lock 파일 |
| 자동 검증 | 수집·OCR 단위 테스트, 메모리 PostgreSQL 통합 테스트, Python 보조 테스트, 기존 웹/API 테스트 |
| 기존 코드 연계 | `server/kopis.mjs`, `ocrConfig.mjs`, `programOcr.mjs`에서 공통 모듈 재사용 |
| 설정·안내 | `.env.example`, `.gitignore`, `package.json`, README와 단계별 문서 |

원본 이미지와 모델을 Supabase Storage에 복제하지 않습니다. OCR 시 필요한 검증된 PNG는 로컬 임시 파일로 사용하고 처리 후 제거합니다. Python에는 Supabase·KOPIS 비밀키를 전달하지 않습니다.

로컬 환경은 Python 3.12.15, EasyOCR 1.7.2, torch 2.14.1+cpu, torchvision 0.29.1+cpu로 검증했습니다. Node와 Python이 함께 읽는 파이프라인 설정은 `python/easyocr/pipeline.json`입니다.

## 4. 검증 결과

| 검증 | 결과 |
| --- | --- |
| 전체 자동 테스트 | 최종 코드 정리 후 **151개 모두 통과** |
| 수집 전용 테스트 | 11개 통과, 전체 테스트에 포함 |
| EasyOCR 배치·SQL 테스트 | 13개 통과, 전체 테스트에 포함 |
| Python 보조 테스트 | 별도 3개 통과 |
| 웹앱 프로덕션 빌드 | 성공, 불필요한 파일 정리 후에도 재확인 |
| Python 의존성 검사 | `pip check` 정상, 파일 정리 후에도 재확인 |
| 브라우저 비밀값 검사 | 서버 키 변수명·설정된 비밀값·로컬 배치 진입점 미포함 확인 |
| 파일 정리 후 연결 | 실제 Supabase OCR 후보 조회 정상, DB 쓰기 0 |

초기 전체 테스트에서 실패하던 홈 DOM 검증은 과거의 ‘최고 점수 곡만 선택’ 기준을 검사하고 있었습니다. 현재 키워드 추천 후보 정책에 맞게 테스트를 수정하여 해결했습니다. 앱의 추천 로직과 화면 동작은 변경하지 않았습니다.

실제 데이터 재실행 검증:

- **공연 수집:** 2026-10-14에 동일 조건으로 두 번 실행했습니다. 공연 10개·이미지 URL 27개·실패 0이었고, 재실행 후 행 수가 그대로 유지됐습니다. 기존 ID·생성 시각 유지와 마지막 수집 시각 갱신을 확인했습니다.
- **OCR dry-run:** 실제 상세 이미지 3장의 판독에 성공했고 DB에는 쓰지 않았습니다.
- **OCR 저장:** 2026-10-15에 유효한 상세 이미지 3장으로 성공 결과 3개·완료 시도 3개를 저장했습니다. 같은 3장 재실행에서는 모두 재사용했고 새 Python 판독은 0회, 결과·시도 행 수는 각각 3개로 유지됐습니다.
- **코드 정리 후 판독:** 실제 이미지 1장을 다시 dry-run하여 766자·32개 영역을 판독했고, 실패·DB 쓰기는 0이었습니다.

위 재실행 검증은 초기 표본 결과이며, 현재 DB의 OCR 성공 결과 5건과 구분합니다. 실제 저장에는 가짜 공연·가짜 OCR 결과를 사용하지 않았습니다. 타임아웃·실패·롤백·권한 오류를 강제로 발생시키는 검증은 운영 DB와 분리된 로컬 테스트에서 수행했습니다.

## 5. 파일 정리와 보존 항목

- 참조가 없는 일회성 `scripts/probeSacCalendar.mjs`, `scripts/probeProgramOcr.mjs`, `local-debug.png`를 삭제했습니다.
- 설치 압축 파일·패키지 다운로드 캐시·이전 HEAD 비교 사본·임시 로그 등 약 415MB를 삭제했습니다.
- Chrome 디버그 프로필 188개는 Git 추적에서 제외하고 로컬 세션은 보존했습니다.
- 실행 코드·마이그레이션·검증 명령·판독 모델·실제 검증 요약 JSON을 유지했습니다.

현재 환경에서는 `.venv`의 기반 Python이 `.cache/python-portable/`에 있습니다. `.venv/`, `.cache/python-portable/`, `.cache/easyocr/models/`, `.cache/ocr/`는 로컬 실행에 사용하므로 보존해야 합니다.

## 6. 운영 명령과 환경변수

Windows Git Bash에서 프로젝트 루트로 이동한 뒤 실행합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas

# 공연: 기본 성공 최대 10개
npm run collect:concerts -- --dry-run
npm run collect:concerts
npm run collect:concerts -- --limit 25

# OCR: 후보 조회 / DB 무쓰기 판독 / 기본 새 시도 최대 3장
npm run ocr:batch -- --list
npm run ocr:batch -- --dry-run
npm run ocr:batch
npm run ocr:batch -- --limit 5

# 검증
npm test
npm run build
```

일반 OCR 배치를 재실행하면 같은 내용의 성공 결과는 재사용하고 다음 미처리·변경된 이미지로 진행합니다. `--limit`은 새 시도 수 상한이며, 실패도 시도 수에 포함됩니다. dry-run은 실제 OCR을 수행하지만 DB에 쓰지 않습니다.

기존 루트 `.env`의 `KOPIS_SERVICE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 재사용합니다. 서버 비밀키에 `VITE_` 접두사를 사용하지 않으며 실제 키는 Git에서 제외합니다. 별도 Supabase CLI 연결이나 Python 웹 서버는 필요하지 않습니다.

상세 안내:

- [공연 수집 설정·실행](CONCERT_COLLECTION.md)
- [EasyOCR 배치 설정·실행](EASYOCR_BATCH.md)
- [공연 코드 구조](CONCERT_PIPELINE.md)
- [공연·이미지 확인 SQL](../supabase/verification/concert_collection.sql)
- [OCR 결과 확인 SQL](../supabase/verification/concert_image_ocr.sql)

## 7. 아직 수행하지 않은 작업

1. OCR 원문에서 실제 프로그램 구간과 프로필·경력·다른 날짜 공연 안내를 구분.
2. 작곡가·작품번호·곡번호·악장을 근거로 기존 곡 DB와 매칭하고 확인 필요 상태 관리.
3. 매칭 근거 문구·원본 이미지·곡 ID·판정 상태의 DB 저장.
4. 기존 검색 화면을 Supabase의 확인된 결과 조회로 전환.
5. 수집·OCR 작업 큐, Cron·자동 실행과 필요 시 외부 실행 환경 구성.

다음 구현 범위는 **프로그램 구간 추출·작품 매칭·근거 저장**입니다. 현재 저장된 OCR 원문에는 오탈자가 있으며, OCR 성공이나 평균 신뢰도만으로 해당 작품의 실제 연주 여부를 확정하지 않습니다. 자동화나 검색 화면 전환 전에는 표본 자료로 이 판정 흐름을 검증해야 합니다.
