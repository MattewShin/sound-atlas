# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-OCR-FALLBACK-20261028-001
- 명세 버전: 1
- 현재 상태: READY
- 마지막 작성자: 웹 GPT
- 작성일: 2026-10-28 (Asia/Seoul)
- 작업 브랜치: `codex/ca-ocr-fallback-20261028-001`
- 선행 운영 작업: CA-AUTO-20261022-001 / OPERATIONAL
- 선행 결과 SHA: `4f26fb6227d38ee4bc996751025c8a271db94e09`
- production core SHA: `1db327cd38dfce778da543738f975b70789aed66`

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
