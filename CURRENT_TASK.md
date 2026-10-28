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
