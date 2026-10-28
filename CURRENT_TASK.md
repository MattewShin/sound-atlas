# 현재 작업

- 작업 ID: CA-OCR-FALLBACK-20261028-001
- 명세 버전: 1
- 제목: 공식 Program 부재 공연의 제한 OCR fallback·안전 자동 확정
- 상태: READY
- 요청자: Theo
- 명세 작성자 / 후속 검토자: 웹 GPT
- 실행 담당: Codex
- 작성일: 2026-10-28 (Asia/Seoul)
- 작업·명세 브랜치: `codex/ca-ocr-fallback-20261028-001`
- 기준 운영 결과: `CA-AUTO-20261022-001 / OPERATIONAL`
- 기준 결과 문서: `4f26fb6227d38ee4bc996751025c8a271db94e09`
- main·production·예약 core SHA: `1db327cd38dfce778da543738f975b70789aed66`

## 웹 GPT 검토 — Gate A/B ACCEPTED / Gate C 해상도 calibration 재개

결과 SHA `3c9bbe60bb5a31f5372f80cd53f4025a67a64a67`와 구현 SHA `240afe6381309f053418b98c9081ed21e286a687`의 Gate A/B 구현·격리 결과를 **ACCEPTED**한다. 기존 공식 Program 운영 보존, 525/525·build, 무-REJECTED 계약도 수락한다.

첫 dry-run은 이미지10장 모두 decode/MIME/byte/pixel·blur 기준을 통과했지만, 폭700/750/794px인8장이 고정 양변800px gate에서 OCR 전에 제외됐다. 해상도는 품질의 보조 지표이며 실제 품질은 이후 detection coverage/confidence와 명시적 identity gate가 다시 검증한다. 따라서 정확도 핵심 기준을 유지하면서 해상도 하한만 아래처럼 1회 calibration한다.

### 허용 변경

1. 원본 width·height 최소값만 **800px → 700px**로 변경한다. upscaling은 하지 않는다.
2. decode/MIME/6MB/12Mpixel/20,000px, Laplacian variance100, Program detection3줄, coverage80%, median confidence0.90, candidate evidence0.85, composer/catalogue evidence0.90을 모두 그대로 유지한다.
3. explicit same-block composer+catalogue, 단일 MATCHED+EXACT, movement/arrangement/excerpt/duplicate/scope fail-closed와 무-REJECTED 계약을 변경하지 않는다.
4. threshold를 환경변수로 만들거나 700px 아래로 낮추지 않는다. timeout을 늘리거나 동일 이미지 OCR을 재시도하지 않는다.
5. 기존 migration SQL의 policy default=false와 RPC/ACL 계약은 유지한다. 아직 운영 적용하지 않는다.

### Gate C calibration dry-run

1. 700px 상수·fixture·직접 테스트만 수정하고 직접 관련 테스트를 먼저 실행한다. 이 단계에서 전체525 suite/build를 반복하지 않는다.
2. 이전에 resolution만으로 제외된8장을 원래 정렬 순서로 검사하고, 필요하면 아직 조사하지 않은 공식 부재17공연을 이어 검사한다.
3. 이번 추가 상한은 이미지 GET 최대25, OCR 호출 최대10, Supabase/KOPIS 업무 쓰기0이다. 이전 timeout `PF281769`과 Program detection 부족 `PF299101`은 반복하지 않는다.
4. 첫 eligible 발견 전까지 진행하며, 대상 선택은 전체 조사 순서의 시작일→KOPIS ID→image sort 순을 유지한다. 원문·evidence는 게시하지 않는다.
5. eligible이 0이면 더 완화하지 않고 다시 BLOCKED한다.
6. eligible이 1건 이상이면 최종 후보 코드로 전체 `npm test`와 production build를 각각1회 실행한 뒤 기존 Gate C 단건 canary를 진행한다.
7. canary는 공연1·이미지1·신규 CONFIRMED 최대1·REJECTED0, 동일 candidate 재전송 쓰기0, production 검색·기존 공식/legacy 검색 보존을 모두 확인한다.
8. canary 통과 시 같은 실행에서 Gate D의 migration 적용·main 병합·배포·공식 우선/OCR 후순위 제한 예약 연결까지 진행하고 `OPERATIONAL`로 게시한다.
9. OCR fallback 실패 시 fallback policy/스위치만 disabled로 유지하며 기존 공식 Program policy·예약은 변경하지 않는다.

## 실행 결과 — Gate A/B 구현·격리 PASS / Gate C 적격0으로 BLOCKED

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

## 목표

현재 운영 중인 공식 Program 경로를 그대로 유지하면서 다음 전체 흐름을 제한적으로 완성한다.

1. 공식 Program이 **없는 공연만** OCR 대상으로 삼는다.
2. 이미지 품질과 OCR 신뢰도가 기준 이상일 때만 작품 분석으로 넘긴다.
3. 작곡가와 작품번호가 모두 명시된 등록곡의 단일 `MATCHED + EXACT`만 자동 `CONFIRMED`한다.
4. 모호하거나 기준 미달인 후보는 confirmation/review를 호출하지 않으며 DB에 `REJECTED`를 만들지 않는다.

최종 흐름은 `KOPIS 수집 → 공식 Program 우선 → 공식 Program 부재 시 제한 OCR → 안전 후보 1건 CONFIRMED → 공연 검색`이다.

## 고정 안전 조건

- 기존 공식 Program v4 source/router/matcher/receipt/search와 현재 production 검색 결과를 변경하지 않는다.
- 공식 Program 텍스트가 선택되는 공연은 OCR을 다운로드·분석·확정하지 않는다.
- OCR fallback은 공식 판정 사유가 `OFFICIAL_TEXT_ABSENT`, `OFFICIAL_PROGRAM_ABSENT`, `OFFICIAL_PROGRAM_EMPTY`인 경우만 허용한다.
- 공식 text/hash 불완전·불일치·invalid·지원하지 않는 markup은 OCR로 우회하지 않고 `HOLD`한다.
- 기존 legacy OCR receipt와 검색 연결은 보존한다. 기존 REJECTED 행을 수정·삭제·재해석하지 않는다.
- 새 migration이 필요하면 additive이며 policy 기본값은 disabled다. 이미 적용된 migration을 수정·재적용하지 않는다.
- OCR fallback 실패는 공식 Program policy·공식 예약·기존 검색을 끄지 않는다.
- 운영 연결정보, OCR 원문 전체, evidence quote, 이미지 URL의 비밀값은 Git에 기록하지 않는다.

## Gate A — 제한 OCR source·품질 계약 구현

### 대상 선택

- 미래/공연중·공연예정, 기존 수집 범위, active `DETAIL` 이미지 한 장만 대상으로 한다.
- current image revision/content hash와 current `SUCCEEDED` OCR attempt/result가 일치해야 한다.
- 한 실행당 공연 최대 1건, 이미지 다운로드 최대 1회, OCR 호출 최대 1회다.
- 공식 Program 가능 공연이 항상 우선이며, 한 실행의 공식+OCR 합산 신규 CONFIRMED 상한은 1건이다.

### 이미지·OCR 품질 gate

기존 EasyOCR 결과와 원본 이미지에서 아래를 검증하고, 검증값을 불변 snapshot/hash로 confirmation 직전 재확인한다.

- 이미지 decode 성공, 기존 MIME/byte/pixel 안전 제한 통과
- 원본 width·height 각각 800px 이상
- OCR Program 구간에서 bbox/confidence가 있는 유효 detection 3줄 이상
- Program 구간의 비어 있지 않은 행 중 detection 대응 비율 80% 이상
- Program 구간 detection confidence 중앙값 0.90 이상
- 자동 확정 후보의 모든 evidence confidence 0.85 이상
- 작곡가 evidence와 작품번호 evidence confidence는 각각 0.90 이상
- confidence/bbox/dimension/quality 값이 없거나 비정상 형식이면 fail-closed

필요 시 OCR 저장 계약에 width·height·품질 snapshot/hash를 additive로 추가한다. threshold는 환경변수로 느슨하게 바꾸지 못하게 코드 상수와 테스트로 고정한다. 기존 OCR 결과 중 필수 품질값이 없는 행은 자동 확정에 사용하지 않는다.

## Gate B — 자동 확정 자격과 무-REJECTED 계약

자동 `CONFIRMED`는 아래를 모두 만족할 때만 허용한다.

- 작곡가가 동일 logical work block의 명시적 OCR evidence로 존재하며, 공연명·이전 행·다른 작품에서 추론하지 않음
- 작품번호가 `Op.`, `BWV`, `K.`, `D.`, `S.`, `R`, `Hob.` 등 명시적 catalogue family+number evidence로 존재
- Classic Atlas 등록 target과 `track_id + work_id`가 정확히 하나로 수렴
- outcome `MATCHED`, relation `EXACT`, 동일 track/work 중복 후보 없음
- movement track이면 악장 번호도 명시적 evidence로 일치
- arrangement·transcription·excerpt·four hands·scope/date/session 충돌·unknown review reason 없음
- 현재 source/image/OCR/analysis/catalog/policy가 confirmation 직전에도 동일
- 기존 유효 confirmation이 없을 때만 신규 receipt 최대 1건

위 조건 중 하나라도 실패하면 결과 보고서에 `SKIPPED_<REASON>`만 기록한다. 자동 decision/review RPC를 호출하지 않고 `CONFIRMED`와 `REJECTED`를 모두 생성하지 않는다. OCR result와 immutable analysis/candidate snapshot 저장은 허용하지만 후보의 review status는 기존 `REVIEW_REQUIRED`에서 변경하지 않는다.

기존 `programAutomation`의 “부적격 후보를 REJECTED로 저장” 경로를 이 fallback에서 재사용하지 않는다. 새 규칙/version은 의미가 분명한 별도 이름(예: `program-ocr-fallback-1`)으로 구분하고, 기존 OCR 자동판정의 동작을 암묵적으로 변경하지 않는다.

## Gate C — 격리·dry-run·단건 canary

1. 다음 fixture를 포함한 직접 테스트를 작성한다.
   - 공식 Program 존재 → OCR 0회
   - 공식 source invalid/incomplete → HOLD, OCR 0회
   - 고해상도·고신뢰·명시적 composer+catalogue → eligible
   - 저해상도, blur/decode 실패, detection coverage 부족, confidence 미달 → SKIPPED
   - composer 추론, title-only, catalogue 누락, 악장 불명, 편곡/발췌, 중복/모호 → SKIPPED
   - 모든 SKIPPED에서 REJECTED/confirmation RPC 0회
   - 동일 eligible candidate 재실행 receipt 증가 0
   - 공식 Program 기존 검색과 legacy OCR 검색 불변
2. 직접 관련 테스트를 먼저 실행하고, 최종 후보 코드가 고정된 뒤 전체 `npm test`와 production build는 각각 1회만 실행한다.
3. 운영 쓰기 없이 현재 미래 공연 중 공식 Program 부재 공연 최대 10건·상세/이미지 GET 최대 10건으로 dry-run한다. 이미지·OCR 품질 분모, 단계별 제외 수와 eligible 후보만 기록하며 원문/evidence는 기록하지 않는다.
4. eligible 후보가 없으면 threshold를 느슨하게 하지 않고 `BLOCKED`로 게시한다.
5. eligible 후보가 있으면 시작일→KOPIS ID→image sort 순 첫 한 건만 canary로 사용한다. OCR fallback policy만 활성화하고 공연 1·이미지 1·신규 CONFIRMED 최대 1, REJECTED 0을 확인한다.
6. 동일 candidate/expected 재전송 신규 쓰기 0, production 공연 검색 노출, 기존 PF304387와 legacy 연결 보존을 확인한다.
7. 예상 밖 후보·REJECTED 생성·공식 공연에 OCR 호출·상한 초과·기존 검색 소실 시 OCR fallback policy/예약만 disabled로 복구한다. 공식 Program 운영은 유지한다.

## Gate D — 배포·제한 예약

Gate A~C가 모두 통과할 때만 main 병합·production 배포한다.

운영 순서와 상한:

1. collection ON
2. 공식 Program 경로 우선
3. 공식 Program으로 신규 확정이 없고 적격 공식 source가 없는 경우에만 OCR fallback
4. OCR 대상 공연 1·이미지 다운로드/OCR 각 최대 1·신규 확정 최대 1
5. 공식+OCR 합산 신규 확정 최대 1
6. cleanup OFF, 구 OCR 대량 automation/backfill/rematch OFF
7. 자동 재시도 없음, daily 08:40 KST 유지

배포 후 production 검색과 실제 예약 설정·rollback을 기록한다. 기존 로컬 변경/index/.env를 보존한다. 첫 정상 예약 실행 전 강제 실행하지 않는다.

## 완료 기준

아래가 모두 충족될 때만 `OPERATIONAL`이다.

- 공식 Program 우선순위와 기존 검색 불변
- 공식 Program 부재 공연에만 OCR 호출
- 품질 gate와 명시적 composer+catalogue+EXACT 단일 등록곡 계약 통과
- 부적격 후보 REJECTED 0
- 단건 canary·동일 candidate 멱등·production 검색 통과
- 공식+OCR 합산 회당 공연1·신규 확정1 상한
- OCR fallback만 독립적으로 disable/rollback 가능
