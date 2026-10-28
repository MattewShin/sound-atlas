# 2026-10-22 예약 배치 KOPIS HTTP 400 후속 진단

최종 판정: **일부 해결**. 실패했던 목록 1건·상세 10건은 현재 모두 정상 파싱·정규화됐습니다. 확인된 진단 정보 누락을 수정했습니다. 다만 최초 HTTP 400은 재현되지 않았고 당시 응답 본문이 없어 근본 원인은 미확정입니다. 요청 자체의 원인을 수정했다고 표현하지 않습니다.

## 대상과 호출 경로

- run ID: `2fd1ea6f-d2c4-4dab-8153-aee931acffd9`, 2026-10-22 08:40 예약 실행.
- 보고서: `.cache/concert-pipeline/runs/2fd1ea6f-d2c4-4dab-8153-aee931acffd9.json`.
- launch 영수증·stdout: `.cache/concert-pipeline/launches/0abeb95a-a081-4396-8df8-c450a3f9dfee.{json,stdout.log}`.
- Windows 예약 → `Invoke-ConcertPipeline.ps1` → 절대 경로 `.env`를 지정한 Node → `runConcertPipeline.mjs` → `createPipelineRuntime` → `createCollectionKopisClient` → `requestWithRetry` → Node fetch.
- 호스트 `https://kopis.or.kr`, GET, 목록 경로 `/openApi/restful/pblprfr`, 상세 경로 `/openApi/restful/pblprfr/{ID}`. 상세에는 service만 전달합니다.
- 목록 조건: stdate=20261022, eddate=20261121, signgucode=11, shcate=CCCA, prfstate=01, cpage=1, rows=100. service는 비공개입니다. `URLSearchParams`로 한 번 인코딩합니다.
- 원래 로그에는 목록의 상태·페이지 값이 없었습니다. 종료 후 보존된 cursor(state=1/page=1), 상태 배열(02/01), 실패 시 cursor를 전진시키지 않는 코드로 01/1을 재구성했습니다. 원본 요청 URL을 기록한 증거와 구분합니다.

## 확인된 사실과 미확정 원인

최초 11건은 실제 fetch가 받은 HTTP 400 / text/html입니다. 이 클라이언트에는 오류 응답 캐시가 없으며 로컬 retry cooldown은 외부 응답 캐시가 아닙니다. 기존 HTTP 클라이언트가 non-2xx 본문을 버려, 당시 HTML의 오류 내용은 복원할 수 없습니다.

2026-10-22 **09:35 KST**, 수정 전 기존 경로로 목록 1건·PF302483 상세 1건을 각각 한 번 호출했습니다. 모두 HTTP 200 / application/xml이었고 목록 100행·상세 요청 ID 일치·수집 정규화가 통과했습니다.

재현 프로세스는 예약과 같은 프로젝트 작업 디렉터리에서 `--env-file-if-exists=C:\Users\CNXK\dev\sound-atlas\.env`를 사용했습니다. 키는 설정돼 있고 앞뒤/내부 공백이나 이미 인코딩된 패턴이 없으며 실제 로딩 값이 `.env`와 일치합니다. 현재 shell·Windows User/Machine에 별도 KOPIS 키가 없고, `.env` 수정 시각은 예약 이전인 10월 21일 11:16:57 KST입니다. 현재 프로세스의 프록시 변수·Node proxy 옵션·NODE_OPTIONS도 없습니다. 종료된 예약 프로세스의 전체 환경은 별도로 기록돼 있지 않습니다.

[KOPIS 공식 개발가이드 v5.0](https://kopis.or.kr/upload/openApi/%EA%B3%B5%EC%97%B0%EC%98%88%EC%88%A0%ED%86%B5%ED%95%A9%EC%A0%84%EC%82%B0%EB%A7%9DOpenAPI%EA%B0%9C%EB%B0%9C%EA%B0%80%EC%9D%B4%EB%93%9C.pdf)의 필수 service/stdate/eddate/cpage/rows, 31일 범위·최대 100행, 상세 ID 경로 계약과 대조했습니다. 요청 조건·호스트·인코딩·환경변수를 바꿀 근거는 확인되지 않았습니다. 인증, 요청 형식, 외부 일시 오류 중 하나로 단정하지 않습니다.

## 최소 수정

- `server/kopisDiagnostics.mjs`: HTTP 상태/허용 Content-Type, 고정 origin·GET·경로, 비밀값을 제외한 실제 목록 조건, 구조화된 오류 코드·메시지/HTML 제목, 본문 fingerprint를 로컬 진단에 제공합니다.
- 응답 진단 읽기는 최대 16 KiB입니다. 원문·헤더·키 포함 URL을 저장하지 않습니다. 읽기 실패/초과 시 표시만 남기고 원래 HTTP 오류·재시도 정책을 유지합니다. 오류 메시지의 환경 비밀값·인코딩/이중 인코딩 값·URL·긴 토큰을 마스킹합니다.
- `server/concertCollector.mjs`: 기존 요청 경로에 진단을 연결하고 HTTP 200 API 오류/비정상 XML의 HTTP 상태와 API 오류를 구분합니다. standalone 수집 실패 보고에도 연결합니다.
- `server/concertPipeline.mjs`: 기존 HTTP 진단을 유지하면서 클라이언트가 생성한 안전한 진단만 `errors[].kopis`에 전달합니다.
- `server/concertCollector.test.mjs`, `server/concertPipeline.test.mjs`: 400 단일 호출·마스킹·HTTP 200 오류와 정상 0건·읽기 실패/상한·기존 상태/검토 보존 회귀 검증.

요청 구성·필터·400 재시도·upsert·중복 방지·cooldown 정책을 변경하지 않았습니다. 예약 08:40, PT32M, 배치 1,800초/OCR 예산, OCR 20건·개별 timeout·이미지 정책·잠금/worker 로직도 유지했습니다.

## 수정 후 원래 실패 요청 재검증

2026-10-22 **09:39:58~09:40:01 KST**에 기존 클라이언트·동일 의미의 조건으로 검증했습니다. 먼저 목록 1·상세 1 통과 후 나머지 상세 9건을 각 한 번 호출했습니다. HTTP 200만으로 성공 처리하지 않고 기존 XML 파서와 정규화 함수까지 실행했습니다.

| 요청 | ID/조건 | 수정 전 예약 결과 | 수정 후 | 파싱·정규화 |
|---|---|---|---|---|
| 목록 | 서울/클래식, 20261022~20261121, 01, page 1, rows 100 | 400 / text/html | 200 / application/xml | 100행 통과 |
| 상세 | PF302483 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF277435 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF280938 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF302860 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF296892 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF300200 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF303231 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF283070 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF296182 | 400 / text/html | 200 / application/xml | ID 일치·통과 |
| 상세 | PF303298 | 400 / text/html | 200 / application/xml | ID 일치·통과 |

전체 실제 KOPIS 요청은 최초 재현 2회 + 수정 후 11회 = **13회**입니다. 추가 외부 요청은 하지 않았습니다. 저장 경로 변경이 없어 실제 DB 저장은 수행하지 않았습니다. 위 결과는 파싱·저장 입력 정규화까지의 검증이며 저장 복구 완료를 의미하지 않습니다. 원래 배치 보고서·launch·latest·state는 SHA-256 전후 동일합니다. 전체 배치, OCR, analysis, 이미지 다운로드, DB 쓰기는 0건입니다.

## 검사와 다음 예약

관련 테스트 **40개**, 전체 자동 테스트 **357개**, 프로덕션 빌드와 `git diff --check`를 통과했습니다. tracked 236개·변경 6개 파일, 빌드 산출물 18개, 재현/재검증 JSON 2개의 실제 비밀값·인코딩 변형 검사에서 검출 0건입니다. 서버 전용 진단 코드의 브라우저 유입도 없습니다. 기존 500 kB chunk 경고는 남습니다. 외부 API를 호출하는 자동 테스트는 추가하지 않았습니다. 실제 재검증 결과는 `.cache/kopis-400-20261022/reproduce.json`, `revalidate.json`에 있습니다.

현재 확인한 수집 통신·파싱 기준으로는 다음 단계 진행이 가능합니다. 다만 최초 400의 원인 해결 완료나 실패 10건의 저장 복구 완료를 뜻하지 않습니다. 다음 **2026-10-23 08:40 KST** 예약에서는 수집 성공/실패 수, 같은 조건에서 400이 재발하는지와 새 `errors[].kopis` 진단을 확인해야 합니다. 400이 재발하면 실제 상태·본문 오류 라벨을 근거로 원인을 좁힙니다. 코드 수정은 로컬 작업 트리에 있으며 commit/push는 수행하지 않았습니다.
