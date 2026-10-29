# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-OCR-FALLBACK-20261028-001
- 명세 버전: 1
- 현재 상태: BLOCKED
- 마지막 작성자: Codex
- 작성일: 2026-10-29 (Asia/Seoul; Program 영역 탐지 구현 / Gate C BLOCKED)
- 작업 브랜치: `codex/ca-ocr-fallback-20261028-001`
- 선행 운영 작업: CA-AUTO-20261022-001 / OPERATIONAL
- 선행 결과 SHA: `4f26fb6227d38ee4bc996751025c8a271db94e09`
- production core SHA: `1db327cd38dfce778da543738f975b70789aed66`

## Codex 결과 — Program 영역 탐지 구현 / Gate C BLOCKED (2026-10-29 KST)

- 읽은 공동 문서5개: `68e1fd1ceebdd7192053449aebcfa9468350ec7b` / `codex/ca-ocr-fallback-20261028-001`, CA-OCR-FALLBACK-20261028-001 / 명세1. 이번 사용자 실행 지시에 따라 이전 문서의 해상도-only calibration 범위를 **OCR 전용 Program 영역 탐지**로 대체했다. Gate A/B ACCEPTED는 유지한다. [구현 SHA `7f0b834f44dcd34c24e5f19637b7d7114451742c`](https://github.com/MattewShin/sound-atlas/commit/7f0b834f44dcd34c24e5f19637b7d7114451742c). 영역 탐지 구현은 IMPLEMENTED이며 운영 Gate C는 BLOCKED다.
- `ocrProgramRegions.mjs`: 기존 명확한 제목 탐지에 PROGRAM/PROGRAMME/프로그램/곡목/연주곡/연주곡목/REPERTOIRE/레퍼토리와 공백·구두점 변형을 지원한다. 제목 없는 부분은 bbox 인접 graph로 묶되, 메타데이터를 제외하고 같은 block의 명시적 composer+catalogue만 후보로 전달한다. 각 후보 자신의 evidence도 연결되어야 하며 다른 열·곡·연주자에서 composer를 차용하지 않는다. 원문·offset·bbox를 보존한다.
- OCR 영역 proof가 확인된 구간의 불확실 section 분류만 대체했다. 원문 전체의 날짜·회차·범위, 악장·편곡·발췌·중복·unknown reason fail-closed는 유지한다. **700px/no-upscaling·blur100·detection3줄·coverage80%·median0.90·evidence0.85·identity0.90·단일 MATCHED+EXACT·무-REJECTED 기준은 불변**이다. 공식 router/matcher/search와 pipeline/예약 코드는 수정0이다. 아직 미적용인 fallback SQL만 bbox/영역 proof 검증을 맞췄고 운영 migration은 적용0이다.
- 직접 fixture/단위 **22/22 PASS, fail0/skip0**: 새 영역6·기존 fallback10·격리SQL4·예약 wrapper2. 제목 변형, headless split composer/title/catalogue, 메타데이터/먼 열/누락 bbox 차단, 낮은 confidence·중복·편곡·전체 source 날짜 충돌, JS/SQL 품질·멱등·무-REJECTED·ACL을 검증했다. 적격0으로 **전체 npm test/build는 이번에 실행하지 않았다**.

### Gate C 제한 dry-run의 실제 결과

- 서울10/29~11/28의28공연을 GET으로 분류: 공식1/부재27/HOLD0. 이전 OCR 성공5개만 고정 선택(이전 후보 보유3개+앞선 성공 대조군2개), 시작일→KOPIS ID→image sort 순. 기존 timeout `PF281769`/`PF281822`은 호출0이다. 추가 표본/timeout 증가/upscaling0이다.
- 실제 **이미지 GET3/5·OCR3/5**, 성공2·신규 timeout1(`PF296224`,180초,재시도0). 성공2개 detection98개에서 아래 단계별 결과는 모두0이다. bbox 명시 곡목 영역이 없어 `SKIPPED_PROGRAM_DETECTIONS_INSUFFICIENT`이며 coverage/median을 통과했다고 보고하지 않는다.

| 완료 OCR 표본 | program_lines | explicit composer+catalogue | MATCHED+EXACT | eligible |
| --- | ---: | ---: | ---: | ---: |
| PF296289 (detection26) | 0 | 0 | 0 | 0 |
| PF300258 (detection72) | 0 | 0 | 0 | 0 |
| 완료2건 합계 | 0 | 0 | 0 | 0 |

- `PF296224`는 timeout으로 분석 수치 미산출이다(기본0을 실제 분석 결과로 합산하지 않음). 다음 `PF298506`의 이미지 메타데이터 GET에서 `SUPABASE_REQUEST_FAILED`로 중단했다. `PF298506`/`PF293668`의 이미지 GET/OCR은0이다. 5건 모두 조사했다고 보고하거나 미조사2건의 적격0을 단정하지 않는다. 실제 포스터에서의 탐지 개선 효과는 아직 입증되지 않았다.
- **운영 제한 편차:** DB REST GET13/POST0. 실패 GET에 공유 REST transport 기본3 attempts가 적용되어 **추가 자동 GET2회가 발생했다**. 이는 재시도0 지시를 충족하지 못한 실행기 결함이다. 수동 재실행·이미지/OCR 재시도는0이며 실패 뒤 호출을 중단했다. 다음 별도 재개 시 GET도 single-attempt guard를 먼저 적용해야 한다. 현재 실패 GET이나 timeout 표본을 다시 호출하지 않았다.
- OCR/분석 저장·review·confirmation **0**, 신규 CONFIRMED0/REJECTED0, KOPIS 상세GET0. 적격 및 canary 미통과로 fallback migration/policy 활성화·전체 test/build·main 병합/배포·OCR 예약 연결은 모두 미실행이다. fallback RPC/policy행 미설치·기본OFF 유지다.

### 기존 운영·로컬 보존 및 재개점

- **09:49:34 KST 관리자 READ ONLY SQL PASS:** 시작 시점과 최종13개 base table **866행 및 전체 digest 불변**. stored-program-4 policy=true, PF304387의 기존 두 공식 receipt effective CONFIRMED/EXACT, PF295548 legacy3곡 effective CONFIRMED/stale=null 유지. 오늘 기존08:40 정상 예약에서 생긴 공식 추가1건은 이번 작업 시작 전 baseline에 포함되어 있다.
- production **GET1/POST0**에서 PF304387/`chopin-scherzo-op31-no2` EXACT·CONFIRMED·stored-program-4 노출 PASS. 기존 예약 Ready/Enabled·daily08:40 KST·RestartCount0·lastResult0, 다음10/30 08:40, 기존 core `1db327cd38dfce778da543738f975b70789aed66`/action 유지. 강제실행·공식 스위치 변경0이다.
- 원본 local main/HEAD `1607ca201c3a559bc7f28aabe998ef062db02ef9`, 변경40파일·index·.env hash 전부 보존. 격리 cache에서만 구현했다. OCR 원문·이미지URL·evidence·연결정보 게시0이다.
- **중단 Gate/재개점:** Gate C / OCR timeout + DB 읽기 실패 / completed eligible0. 추가 완화·표본 확대 없이 BLOCKED로 중단한다. fixture 양성 결과를 운영 적격 성공으로 해석하지 않는다. 새 검증은 single-attempt GET을 먼저 보장하고 새 timeout `PF296224`도 제외해야 한다. [안전한 검증 JSON](docs/OCR_PROGRAM_REGIONS_VALIDATION_2026-10-29.json), [영역·품질 설계](docs/OCR_FALLBACK.md)를 함께 게시한다.

## Codex calibration 결과 — 700px 적용 / Gate C BLOCKED (2026-10-29 KST)

- 읽은 공동 문서5개 SHA `4ea0c535b5ce97882e1d0a52d0f5cace398139ed`. Gate A/B ACCEPTED를 유지하며 [calibration 구현 `d23eed19a54a67cd15ef0faaabc6a82514279b6f`](https://github.com/MattewShin/sound-atlas/commit/d23eed19a54a67cd15ef0faaabc6a82514279b6f)만 추가했다.
- **원본 해상도 하한800→700px만 변경**했다. JS 상수·runner·아직 미적용인 SQL의 크기 조건과 fixture/문서만 수정했다. policy 기본false·RPC/ACL, confidence/coverage/detection·명시적 same-block composer/catalogue·MATCHED+EXACT·무-REJECTED·blur100·180초 timeout·재시도0은 불변이다. upscaling/환경변수 완화0.
- 직접 **15/15 PASS, fail0/skip0**(JS10·격리SQL3·예약 wrapper2). 700px 허용/699px 차단, 나머지 고정 상수 동일, SQL 품질/hash·같은 receipt 멱등·부적격 무쓰기·기존 공식/legacy 보존을 검증했다. **적격0이므로 이번 전체 test/build는 미실행**이다. 전회525/525·build ACCEPTED를 새 실행 수치로 보고하지 않는다.
- **제한 dry-run08:45:26 KST:** 서울10/29~11/28, 표본27공연=공식1/부재26/HOLD0. 이전 해상도 미달8개 중7개가 현재 범위에 남았고 `PF289272`은10/28 종료로 제외했다. 이7개를 먼저, 미조사17개 중 첫4개를 이어 검사했다. 이전 `PF281769` timeout·`PF299101` Program 부족은 반복0.
- **이미지 GET11/25, OCR10/10, DB REST GET34/POST0**, KOPIS 상세GET0. 첫 eligible을 발견하지 못한 채 OCR 상한에 도달해 종료했다. 이미지 MIME 실패1; decode·700px·blur 통과10; OCR 성공9/timeout1(`PF281822`,180초,재시도0). 성공9개 모두 검증된 Program 본문0줄로 detection3줄 gate 미통과. 전체 OCR detection731개/분석 후보25개였으나 explicit-catalogue0·MATCHED+EXACT0·eligible0이다. coverage/median은 선행 Program gate 실패 뒤 산출하지 않았다.
- **calibration 업무 쓰기0:** OCR/분석 저장·review/confirmation·신규 OCR CONFIRMED/REJECTED0. migration·fallback policy 활성화·단건 canary/운영 멱등 재전송·Gate D main 병합/배포/예약 연결은 미실행. fallback RPC/policy행 미설치, 스위치 기본OFF를 유지한다. 현재 OPERATIONAL은 기존 공식 Program 경로뿐이다.
- **기존 공식 정상 예약은 별개로 유지:**08:40에 자동 실행되어08:40:33 SUCCESS/exit0. collection1와 PF304387 공식 후보 `chopin-scherzo-op54-no4` CONFIRMED1(receipt `88b88f30-de19-4b44-9022-762264ec4526`)을 처리했다. 강제실행/예약 변경0. 이1건은 calibration의 쓰기0 집계에 포함하지 않는다.
- **08:46:23 READ ONLY 확인:** 기존 v4 policy=true, 원래 `chopin-scherzo-op31-no2` receipt 전체 hash 불변·effective=true, 새 공식 receipt도 유효. 기존 PF295548 세 곡 effective CONFIRMED 보존. 정상 예약의 collection/확정으로 concerts48→49·images116→119·공식receipt1→2, 전체861→866행이 됐다. 나머지10개 base table의 count/digest는 동일하다. 모든 운영 데이터가 불변이었다고 주장하지 않는다.
- 기존 production GET1/POST0 검색에서 PF304387/원래 곡 EXACT·CONFIRMED·stored-program-4 유지. 예약은 **Ready/Enabled·기존 core/action `1db327cd38dfce778da543738f975b70789aed66`**, daily08:40 KST·RestartCount0, lastResult0, 다음 **10/30 08:40**. 기존 공식 운영을 끄거나 교체하지 않았다.
- 원본 local main/HEAD `1607ca201c3a559bc7f28aabe998ef062db02ef9`, 기존40파일/index/.env hash 보존. 비밀값·OCR 원문·evidence·이미지URL 게시0.
- **실패 Gate/재개점:** Gate C calibration / NO_ELIGIBLE_AT_10_OCR_LIMIT. 현 표본에서는 해상도 하한을 낮춘 뒤에도 검증된 Program 구간이 확보되지 않았다. 추가 완화나 호출 확대 없이, 같은 품질/identity 계약을 만족하는 공식 부재 source의 Program 근거 확보가 재개점이다. 현재 남은 표본까지 적격0이라고 일반화하지 않는다. [상세 검증 JSON](docs/OCR_FALLBACK_CALIBRATION_2026-10-29.json)을 게시하고 **BLOCKED로 중단**한다.

## 웹 GPT → Codex: Gate A/B ACCEPTED / Gate C 제한 calibration 재개

- 결과 `3c9bbe60bb5a31f5372f80cd53f4025a67a64a67`와 구현 `240afe6381309f053418b98c9081ed21e286a687`을 검토했다. 구현·격리525/525·build·기존 운영 보존·무-REJECTED 계약을 **ACCEPTED**한다.
- 적격0은 matcher/identity 실패 이전에 이미지8/10이 양변800px에서 제외된 영향이 크다. 해당8장은 decode와 blur 기준을 통과했고 폭700~794px였다. confidence와 identity 기준을 완화하지 않고 원본 양변 하한만 **700px**로 1회 조정한다.
- 그대로 유지: upscaling0, decode/MIME/byte/pixel, blur100, detection3줄, coverage80%, median0.90, evidence0.85, composer/catalogue0.90, explicit same-block composer+catalogue, 단일 MATCHED+EXACT, 악장/편곡/중복/범위 fail-closed, REJECTED0.
- 변경 금지: 700px 미만 허용, timeout 증가·재시도, 환경변수 완화, 기존 공식/legacy 경로 변경, 운영 migration 선적용.
- 직접 테스트 후 이전 resolution-only8장과 필요 시 미조사17공연을 이어 dry-run한다. 추가 이미지GET≤25, OCR≤10, 업무 POST0. 이전 timeout/Program 부족2장은 반복하지 않는다.
- 첫 eligible을 기존 정렬 규칙으로 선택한다. eligible0이면 추가 완화 없이 BLOCKED. eligible이 있으면 그때 전체 test/build 각1회 → 단건 canary → 검색 회귀 → Gate D까지 같은 실행에서 진행한다.
- canary·운영 상한은 공연1/이미지1/신규CONFIRMED1/REJECTED0, 동일 candidate 재전송 쓰기0이다. 실패 시 fallback만 OFF로 유지하고 기존 공식 Program 운영은 계속한다.

## Codex 결과 — Gate A/B 구현·격리 PASS / Gate C 적격0으로 BLOCKED

- 읽은 공동 문서5개: `codex/ca-ocr-fallback-20261028-001` / `c936fd3a21f5dacf994a1832e22c87f0cbf10093`, CA-OCR-FALLBACK-20261028-001 / 명세1. [구현 SHA `240afe6381309f053418b98c9081ed21e286a687`](https://github.com/MattewShin/sound-atlas/commit/240afe6381309f053418b98c9081ed21e286a687).
- **실패 Gate/중단점: Gate C-3~4 운영 무쓰기 dry-run / NO_ELIGIBLE.** 단건 canary, 운영 migration/policy 활성화, main 병합·배포·예약 연결은 미실행이다. OPERATIONAL이 아니다. 다른 Gate의 별도 승인을 기다린 것이 아니라, 명세의 적격0 중단 조건에 도달했다.

| Gate | 실제 결과 |
| --- | --- |
| A | 별도 source/품질 rule·단건 runner·기본 OFF 예약 wrapper 구현, 직접 격리 PASS |
| B | immutable 품질 재계산·명시적 block composer/catalogue·CONFIRMED 전용 RPC·멱등·무-REJECTED 격리 PASS |
| C | 직접17/17 + 전체525/525 fail0/skip0 + build PASS. 운영 dry-run10건 eligible0으로 BLOCKED; canary 미실행 |
| D | 선행 canary 미통과로 미실행. 기존 공식 Program 운영 유지 |

### 구현 범위와 안전 계약

- `ocrFallback.mjs`: 기존 공식 router 결과의 부재 사유3개만 허용, invalid/incomplete/hash/markup는 HOLD. 원본 decode·크기·bbox·coverage·confidence, same logical block의 명시적 composer/catalogue, 단일 MATCHED/EXACT, 중복·악장·편곡·범위·unknown reason을 fail-closed로 검증한다. 기존 v4 matcher/router와 구 `programAutomation`은 수정하지 않았다.
- `ocrFallbackImage.mjs`: 이미지 GET1/재시도·redirect0, MIME/decoder format·6MB·12Mpixel·20,000px 제한, 원본 양변800px. blur 실패를 보수적으로 판별하는 **고정 Laplacian variance100** 상수를 추가했다. 방향 보정 후 최대1,000px grayscale에서 계산하며 env로 완화할 수 없다. 기존 threshold를 낮추거나 작은 원본을 확대해 통과시키지 않았다.
- `ocrFallbackRunner.mjs`와 `supabaseOcrFallback.mjs`: 공연1/이미지GET1/OCR1/confirmation POST1, 저장 직전 source 재조회와 저장 후 current SUCCEEDED OCR·분석·후보 재검증. SKIPPED는 reason만 보고하고 decision/review/confirmation을 호출하지 않는다. 기존 REJECTED 저장/finish/unavailable 경로를 사용하지 않는다.
- 새 additive `202610280001_ocr_fallback.sql`: 별도 `program-ocr-fallback-1` policy 기본false, service_role 전용 SECURITY INVOKER 확인 RPC와 append-only proof receipt. 잠금 아래 current source/image/OCR/analysis/catalog/정책·기존 유효 receipt와 저장 OCR의 품질 snapshot/hash를 재검증한다. **CONFIRMED만** 생성하고 동일 candidate/expected 재전송은 같은 receipt로 수렴한다. 원본 decode는 기존 OCR과 같은 service-role worker 신뢰 경계이며 SQL은 이미지 bytes 자체를 decode하지 않는다. 이 migration은 **운영 미적용**이다.
- `scheduledOcrFallback.mjs`/`pipelineRuntime.mjs`: 새 스위치 `PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED=false` 기본값. 공식 선택이 있으면 그 공연이 합산 예산1을 사용하고 OCR0회다. 공식 선택0인 실행만 첫 부재 공연/첫 DETAIL 이미지에 fallback1회, worker는 실제 recognize 직전에 생성한다. 기존 OCR 대량 stage는 켜지 않는다. 기존 공식 정책·예약과 독립적으로 fallback만 끌 수 있다. 실제 예약에는 연결하지 않았다.
- [설계·운영 조건](docs/OCR_FALLBACK.md), [검증 JSON](docs/OCR_FALLBACK_VALIDATION_2026-10-28.json)을 함께 게시한다. production 코드 변경은 위 runtime wrapper 선택과 신규 fallback 모듈뿐이며 기존 공식/legacy 검색 코드는 불변이다.

### 실제 검증

- Windows / Node22.18.0. 신규 직접13 + 기존 공식 예약4 = **17/17 PASS**, fail0/skip0. 고해상도 명시적 후보, composer 추론/title-only/작품번호 없음/악장 불명/편곡/중복/저신뢰/품질 누락, 공식/HOLD OCR0회, SKIPPED RPC0회, 여러 eligible 중1회 확정, uncertain POST 재시도0을 확인했다.
- PGlite 빈 격리 DB의 기존 migration chain + 신규 migration에서 JS/SQL 품질 snapshot 동일, 기본 policyfalse, test-only 활성화, 동일 candidate receipt ID·row 수 불변, invalid/stale 입력 새 review0, 기존 공식 분석·legacy review 보존, RLS/anon/authenticated 차단과 service_role SELECT/INSERT 전용 receipt ACL을 검증했다.
- 최종 `npm test` **525/525 PASS, fail0/skip0,440.015초**, production build **PASS7.80초**. 각각 **1회** 실행했다. 기존613.88kB chunk 경고 유지. 수정 후 전체 test/build 반복은 없었다.

### 운영 dry-run — 서울 2026-10-28~11-27 / 10:32:19 KST

- 미래/공연중·예정 공연28개를 GET으로 분류: **공식 선택1 / 공식 부재27 / HOLD0**. 부재 중 시작일→KOPIS ID 순 첫10개, 각 sort_order→image ID 순 첫 active DETAIL 한 장만 검사했다. 나머지17개 부재 공연까지 적격0이라고 일반화하지 않는다.
- 이미지 GET **10**, decode/MIME/byte/pixel 통과10, 원본 양변800px 통과 **2/10**, 원본 폭700/750/794px 미달 **8/10**. blur 측정10개는 모두 threshold 이상이었다. 크기 미달8개에는 OCR0회다.
- OCR 호출 **2**, 성공 **1**, timeout **1**. `PF281769`(1120×8762)은 기존180초 제한에서 EASYOCR_TIMEOUT, 재시도0. `PF299101`(1500×843)은 OCR 성공했으나 Program 본문 유효 detection3줄 조건 미충족이다. 분석 후보1개 중 명시적 catalogue0, MATCHED+EXACT0, eligible0. 이 earlier gate 실패 뒤 coverage/median은 산출하지 않았으며 통과한 것으로 보고하지 않는다.
- **Supabase REST GET31/POST0**, KOPIS 공식 상세GET0, 이미지GET10, OCR2. OCR/분석 저장0, confirmation/review0, 신규 CONFIRMED0/REJECTED0. 운영 동일 candidate 재전송은 적격 canary가 없어 미실행이며, 멱등 통과는 위 격리 결과다.
- 원문·evidence·이미지URL/비밀 query·DB 연결정보를 게시하지 않았다. 이미지 품질/제외 사유/수와 코드 기준만 기록했다.

### 기존 운영 보존·최종 상태

- 관리자 URL 존재/연결 성공만 확인했다. **10:19:37 → 10:33:45 KST READ ONLY SQL:** 운영 base table **13개/861행 전부 count+digest 동일**. 기존 v4 policy=true, PF304387 공식 receipt `dc572eb9-9756-4fbb-a03b-2a9b00474893` effective=true·EXACT/CONFIRMED·stale_reason=null. fallback policy행/RPC는 미설치이므로 OFF이며 DDL/DML0이다.
- 공개 [production](https://sound-atlas.vercel.app) GET1/POST0에서도 PF304387/`chopin-scherzo-op31-no2`가 HTTP200·EXACT·CONFIRMED·stored-program-4로 유지됨을 확인했다. legacy 검색 회귀는 전체 격리 suite에서 통과했고 운영 legacy 데이터/receipt는 전체 table digest로 불변을 확인했다. 이번 운영 과거 날짜 검색을 재실행했다고 보고하지 않는다.
- 실제 `ClassicAtlas-LocalPipeline` **Enabled/Ready**, 기존 action·core `1db327cd38dfce778da543738f975b70789aed66` 그대로. daily08:40 KST, 다음 **2026-10-29 08:40:00**, RestartCount0, lastRun10/23 그대로, 강제실행0. 기존 공식 collection/공식 Program ON·OCR/구 분석/cleanup OFF와 합산1 상한을 유지했다. fallback 설치/활성화/rollback 필요0이다.
- 원본 local main/HEAD `1607ca201c3a559bc7f28aabe998ef062db02ef9`, 기존40파일·index·.env hash 보존. root에서 pull/switch/reset/stash/commit을 하지 않았다.
- **재개점/구현자 의견:** 기준을 만족하는 공식 부재 source가 확보되면 같은 명세의 Gate C bounded dry-run부터 재개한다. 현재 표본의 800px 미만 원본은 upscaling으로 해결하지 않고, 장문 이미지 timeout은 품질·evidence 기준과 분리된 실행 비용 문제로 기록한다. threshold 완화, 추가 표본 확대, timeout 재시도·migration 적용·운영 확정·예약 연결을 임의로 시작하지 않았다. 신규 코드/SQL은 구현·격리 검증 완료이나 후속 검토는 아직 미완료다. **BLOCKED를 게시하고 중단한다.**

## 웹 GPT → Codex: 제한 OCR fallback 전체 흐름 구현

CURRENT_TASK 명세 1만 진행한다. 완료된 공식 Program 운영을 재작업하거나 기존 migration/ACL/source/receipt를 반복하지 않는다.

핵심 계약은 다음 네 가지다.

1. 공식 Program이 실제로 없는 공연만 OCR 대상으로 선택한다. 공식 text/hash 오류는 OCR로 우회하지 않는다.
2. 원본 이미지 dimension/decode와 EasyOCR detection coverage/confidence가 고정 threshold를 모두 통과해야 한다.
3. 동일 block의 명시적 작곡가와 명시적 작품번호가 있고 등록곡 단일 `MATCHED + EXACT`인 후보만 신규 CONFIRMED한다.
4. 부적격·모호 후보에는 decision/review RPC를 호출하지 않으며 REJECTED를 저장하지 않는다. 보고서의 SKIPPED reason만 남긴다.

### 작업 순서

- Gate A: 기존 router/OCR/automation/search 계약을 읽고 별도 fallback rule·policy·bounded runner를 구현한다.
- Gate B: 품질 snapshot/hash와 composer+catalogue 필수·무-REJECTED 계약을 격리 테스트한다.
- Gate C: 운영 쓰기 없는 최대10건 dry-run 후 적격 한 건만 canary한다. 적격이 없으면 threshold를 낮추지 말고 BLOCKED.
- Gate D: canary가 통과할 때만 main 병합·배포하고 기존 08:40 KST 예약에 공식 우선·OCR 후순위·합산 신규확정1 상한을 연결한다.

### 반복 금지

- CA-AUTO 3M의 KOPIS 조사, PF304387 canary, timeout 분석, migration6개/ACL, 전체 과거 OCR backfill을 반복하지 않는다.
- 기존 `programAutomation`의 REJECTED 저장 경로를 fallback에 연결하지 않는다.
- 공식 Program이 선택된 공연의 이미지를 다운로드하거나 OCR하지 않는다.
- threshold를 환경값·운영 편의로 낮추지 않는다.
- 직접 테스트가 통과하기 전 전체 test/build를 반복하지 않는다.
- OCR fallback 실패 시 공식 Program policy·예약을 끄지 않는다.

### 결과 보고

- source gate별 분모: 공식 선택 / 공식 부재 / HOLD
- OCR 품질 gate별 제외 수
- explicit composer+catalogue / MATCHED+EXACT / eligible 수
- 실제 이미지 다운로드·OCR·DB GET/POST 수
- 신규 CONFIRMED·REJECTED·SKIPPED 수
- 동일 candidate 재전송 쓰기 수
- 기존 공식/legacy 검색 회귀
- 실제 production SHA, 예약 플래그·상한, rollback
- 원문·evidence·자격증명 비노출과 기존 로컬 변경/index/.env 보존

각 Gate 실패 시 OCR fallback만 disabled로 유지하고 같은 브랜치에 `BLOCKED`와 정확한 재개점을 게시한다. 모두 통과하면 `OPERATIONAL`로 게시하고 중단한다.
