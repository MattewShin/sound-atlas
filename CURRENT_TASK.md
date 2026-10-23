# 현재 작업

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 4
- 제목: 명확한 공연 프로그램 후보의 운영 자동 확정 활성화 및 단계적 확대
- 상태: IMPLEMENTED
- 요청자: Theo
- 명세 작성자 / 후속 검토자: 웹 GPT
- 실행 담당: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 작업·명세 브랜치: `codex/ca-auto-20261022-001`
- 선행 인계 기준: `59e95fe96961f1f15709baa19ceb63e523744ca3`
- 선행 작업: CA-SEARCH-20261022-001 / ACCEPTED
- 고정 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`

## 명세 4 작업 3C — v4 분석 저장 RPC migration·격리 검증 / IMPLEMENTED

작업 3B 결과 SHA `c6a46ba70b287afd52448a6f317a172f1eeb61a5`를 **ACCEPTED**한다. Scherzo 최소 수정, `stored-program-4` 분리, v2/v3 기본 선택 보존과 v4 저장 fail-closed가 관련52/52 테스트로 확인됐다.

이번 작업은 v4 분석 결과를 저장할 수 있는 DB 계약을 작성하고 격리 PostgreSQL에서 검증하는 것까지만 한다. migration은 운영에 적용하지 않으며 v4 정책은 기본 disabled다.

### 작업 3C 구현 결과

- additive `202610230003_program_analysis_v4.sql`에 v4 분석 저장 RPC를 추가했다. 새 policy는 enabled=false, 기존 operator 설정은 보존한다. v4 label/후보 세대/logical 1:1·기존 공통 catalog/evidence 저장 계약과 전체 snapshot 비교를 강제한다.
- 신규 SQL·직접 관련 preflight **6/6 PASS**. 테스트 안에서만 활성화해 Scherzo v4 저장·동일 ID 재시도/행 증가0·변조 거부·v2/v3 current/receipt digest·migration rollback·ACL/RLS를 확인했다.
- 변경2파일과 필수 공동 문서2개. 운영 migration/호출/쓰기0, 예약 Disabled 및 원본40개 변경/index/.env 보존. 작업3B suite 재실행·운영 활성화·후속 rematch/자동화/router 연결 없이 IMPLEMENTED로 게시 후 중단한다. 세부 결과는 HANDOFF 참조.

### 허용 범위

1. additive migration으로 `save_concert_program_analysis_v4(jsonb,text)`를 추가한다.
2. RPC는 다음을 모두 강제한다.
   - `matcher_version=stored-program-4`
   - 모든 candidate의 `generation_version=stored-program-4`
   - 기존 v3와 같은 logical snapshot·candidate 1:1·catalog/evidence 검증
   - `concert_program_version_policy`의 v4 행이 정확히 존재하고 `enabled=true`
3. migration은 v4 policy 행을 `enabled=false`로 생성한다. 운영자가 별도로 활성화하기 전에는 저장할 수 없어야 한다.
4. 기존 공통 저장 함수·버전별 current 분리 구조를 재사용하고 v2/v3 analysis·candidate·review·receipt를 변경하거나 재해석하지 않는다.
5. 동일 입력 재시도는 같은 analysis ID를 반환하고, 같은 version key의 다른 payload는 거부한다.
6. RPC 권한은 service_role만 유지하며 anon/authenticated/public 실행을 허용하지 않는다.
7. 격리 PostgreSQL에서 migration rollback, 기본 disabled 차단, 임시 enabled 후 Scherzo v4 저장, 재시도 무증가, payload 변경 거부, v3 보존, ACL/RLS를 검증한다.

### 제한

- migration 작성·격리 검증만 하며 운영 DB에는 적용하지 않는다.
- `save_concert_program_rematch_v4`와 v4 자동 판정 RPC/queue는 이번 작업에서 만들지 않는다.
- source router·공식 텍스트를 DB analysis 저장 경로에 연결하지 않는다.
- 운영 KOPIS/DB 호출, OCR, 후보·receipt·CONFIRMED/REJECTED 쓰기, 예약·환경·배포 변경은 하지 않는다.
- 전체 회귀/build 없이 신규 migration SQL 테스트와 직접 관련 preflight 테스트만 실행한다.
- 결과는 migration, 기본 policy 상태, 격리 저장 결과, 변경 파일·테스트만 게시하고 중단한다.

## 명세 4 작업 3B — Scherzo false negative 수정·matcher v4 격리 / IMPLEMENTED

작업 3A 결과 SHA `beb7b2c5ec01b3acd2153c24b7df616a214a7609`를 **ACCEPTED**한다. 공식 텍스트 우선/OCR fallback/NONE 계약, 출처 비혼합, hash·경계 검증과 관련19/19 테스트가 명세를 충족한다.

이번 작업은 쇼팽 Scherzo false negative를 수정하되 기존 `stored-program-3`의 저장 의미를 바꾸지 않도록 새 구현 버전으로 격리한다. 운영 저장·자동 확정은 하지 않는다.

### 작업 3B 구현 결과

- 공식 Scherzo Op.54/No.4 표본을 MATCHED + EXACT로 수정하고 별도 Scherzo 악장·잘못된 identity·편곡/발췌의 보수적 판정을 유지했다.
- implementation/write=v4, review=v3, public search=v2, schedule=false. v4 cache/payload/provenance를 분리하고 전용 RPC·명시적 enabled policy 없이는 POST 전에 차단한다. v4 migration/RPC는 미작성으로 save는 대기한다.
- matcher/version/rollout/preflight 직접 관련52/52 PASS. 변경10파일·저장 blocker·검증 한계는 HANDOFF 참조. 작업3A 재실행·운영 호출/쓰기0, 예약 Disabled와 원본40개 변경/index/.env 보존.
- 작업3B IMPLEMENTED로 게시 후 중단한다. 후속 migration·router 운영 연결·canary·예약 재개는 진행하지 않는다.

### 허용 범위

1. `Scherzo No.4 in E Major, Op.54`처럼 Scherzo가 **작품 종류이자 제목인 같은 줄**을 악장명으로 중복 해석하지 않도록 최소 수정한다.
2. 작품명 다음 별도 줄의 `Scherzo` tempo/악장 표시는 기존처럼 악장 근거로 유지한다.
3. 구현 identity를 `stored-program-4`로 올린다. 기본 write version은 v4, review 기본은 v3, public search 기본은 v2, schedule 기본은 false를 유지한다.
4. v4 저장 RPC가 아직 없으면 preflight에서 POST 전에 fail-closed한다. v3 RPC로 v4 payload를 보내거나 v3 결과를 덮어쓰지 않는다.
5. v2/v3 기존 row·receipt·검색·review 선택은 그대로 읽을 수 있어야 한다.
6. 다음을 관련 테스트로 검증한다.
   - 공식 표본의 쇼팽 Scherzo No.4 Op.54가 `MATCHED + EXACT`
   - 잘못된 Op./No., 작곡가 누락·충돌, 편곡·발췌는 EXACT가 아님
   - 소나타 등의 별도 Scherzo 악장 표기는 작품 제목으로 승격되지 않음
   - v4 cache/payload/provenance가 v3와 분리됨
   - v4 RPC 부재·정책 미확인은 저장 전 차단

### 제한

- 이번 작업에서는 v4 저장 migration/RPC를 만들거나 적용하지 않는다.
- source router를 pipeline/repository에 연결하지 않는다.
- 운영 DB/KOPIS 호출, OCR, 후보·receipt·CONFIRMED/REJECTED 쓰기, 예약·환경·배포 변경은 하지 않는다.
- public search/review 기본 버전을 v4로 전환하지 않는다.
- 전체 회귀/build 없이 matcher·version·preflight 직접 관련 테스트만 실행한다.
- 결과는 수정 규칙, 버전 상태, 저장 차단 상태, 변경 파일, 관련 테스트만 게시하고 중단한다.

## 명세 4 작업 3A — 공식 Program 텍스트 우선 source router / IMPLEMENTED

작업 2 결과 SHA `d689fd83cbdef71e5bd6dec57ce89a14be5f4976`를 **ACCEPTED**한다. 원문·hash 정규화, additive migration, 기존 RPC 호환성과 관련20/20 검증이 명세를 충족한다. 운영 migration은 아직 미적용이며 예약은 Disabled다.

기존 후속 순서의 “source router + Scherzo 수정”은 분리한다. Scherzo 수정은 matcher 의미와 버전이 바뀌는 작업이므로 이번에는 공식 텍스트 우선 선택 규칙만 순수 모듈로 만든다.

### 작업 3A 구현 결과

- 순수 routeProgramSource: 검증된 공식 Program → 호출자 검증 current OCR → NONE. 출처/reason/공식 section/선택 raw text·hash를 반환하며 비선택 원문은 복제하지 않는다.
- 추출기 이동·router·관련 테스트·진단 import4파일, 직접 관련19/19 PASS. 계약·fallback 표와 검증 한계는 HANDOFF 참조.
- 운영 연결·matcher/version·Scherzo·migration·운영 호출0, 예약 Disabled와 원본40개 변경/index/.env 보존. 작업2 재실행·후속 작업 없이 게시 후 중단한다.

### 허용 범위

1. 진단 script에 있던 공식 Program 구간 추출을 재사용 가능한 server 모듈로 옮긴다.
2. 저장된 `kopis_detail_text`와 `kopis_detail_text_hash`를 받아 다음 우선순위를 결정하는 순수 source router를 만든다.
   - hash가 일치하고 명시적 Program 구간이 있으면 `KOPIS_DETAIL_TEXT`
   - 공식 텍스트가 없거나 Program 구간이 없거나 지원하지 않는 markup이면, 호출자가 전달한 **이미 검증된 현재 OCR evidence**로 fallback
   - 둘 다 없으면 `NONE`
3. 공식 텍스트와 OCR을 한 결과로 합치지 않고, 선택한 출처·선택/보류 reason·Program section들을 명시한다.
4. hash 불일치·부분 text/hash·비문자 입력은 공식 근거로 사용하지 않는다. 이때 OCR evidence가 있으면 안전하게 fallback하고 없으면 `NONE`으로 둔다.
5. 기존 최대10건 검증 script는 새 모듈을 import하며 결과 의미를 유지한다.
6. 공식 우선, OCR fallback, biography/무표제 제외, markup fallback, hash 불일치, 다중 section 순서를 관련 테스트로 검증한다.

### 제한

- 변경 구현·테스트 파일은 가능하면4개 이하로 한다.
- 실제 pipeline/repository/DB 저장 경로에는 아직 연결하지 않는다.
- matcher·catalog·`PROGRAM_IMPLEMENTATION_VERSION`·Scherzo 판정은 변경하지 않는다.
- migration 작성·운영 적용, DB/KOPIS 호출, OCR 실행, 후보·receipt·CONFIRMED/REJECTED 쓰기, 예약·환경·배포 변경은 하지 않는다.
- 전체 회귀/build는 실행하지 않고 직접 관련 테스트만 실행한다.
- 결과는 router의 입력·출력·fallback 규칙, 변경 파일, 관련 테스트만 게시하고 중단한다.

## 명세 4 작업 2 — KOPIS `sty` 원문·hash 저장 / IMPLEMENTED

작업 1 결과 SHA `846d5ae6c3f0b34098743eca69db22cd3a5cac62`를 **ACCEPTED**한다. 단계별 OFF 스위치와 collection-only 격리 검증은 명세를 충족한다. 단, 실제 예약 root·환경에는 아직 미적용이고 예약은 Disabled다. 기존 `PROGRAM_ANALYSIS_SCHEDULE_ENABLED` 전역 게이트도 유지되므로 수집이 재개된 상태로 표현하지 않는다.

이번 작업은 공식 상세 응답의 `sty`를 향후 source-first 처리의 입력으로 보존하는 것까지만 한다.

### 작업 2 구현 결과

- nullable text/hash2필드, 원문 최소 정규화·UTF-8 SHA-256, 기존 signature의 RPC 교체를 additive migration으로 구현했다. 상세 호환성과 변경4파일은 HANDOFF 참조.
- 관련 수집/PGlite SQL20/20 PASS. 운영 migration/DB/API/KOPIS/batch/OCR 호출0, 예약 Disabled 및 원본40개 변경/index/.env 보존. 실제 예약 root 미적용.
- 작업2 결과 게시 후 중단한다. Program/router/matcher/후보·receipt/검색 변경 및 후속 작업은 미실행이다.

### 허용 범위

1. 수집 normalizer와 `sync_kopis_concert` 저장 경로에 아래 nullable 필드를 추가한다.
   - `kopis_detail_text`: `sty`의 외곽 공백과 줄바꿈(CRLF→LF)만 정규화한 현재 원문. 내부 문구·순서·구두점은 바꾸지 않는다.
   - `kopis_detail_text_hash`: 저장된 UTF-8 텍스트의 lowercase SHA-256 hex.
2. `sty`가 없거나 공백뿐이면 두 값 모두 null로 저장한다. 비문자·불완전 입력을 임의 문자열로 변환하지 않는다.
3. 기존 행을 보존하는 additive migration과 같은 RPC signature의 교체 함수를 작성한다. 기존 image snapshot·권한·RLS 동작은 바꾸지 않는다.
4. 원문/빈 값/해시 결정성/RPC payload/기존 행 호환성을 관련 단위·격리 SQL 테스트로 확인한다.

### 제한

- 변경 구현 파일은 가능하면 5개 이하로 한다.
- Program 구간 추출, source router, matcher·catalog 수정, OCR fallback, 후보·receipt·CONFIRMED/REJECTED 쓰기, 공개 DTO 변경은 하지 않는다.
- migration 운영 적용, 실제 KOPIS/운영 DB 호출, batch·OCR·이미지 다운로드, 예약·환경·배포 변경은 하지 않는다.
- 전체 회귀/build는 실행하지 말고 직접 관련 테스트만 실행한다.
- 결과는 필드·migration·변경 파일·관련 테스트만 짧게 게시하고 중단한다.

## 명세 4 작업 1 — 배치 단계별 OFF 스위치 / IMPLEMENTED

목표는 예약을 재활성화하기 전에 **공연 목록·상세 수집만 ON, 이미지 OCR와 자동 판정 쓰기는 OFF**로 실행할 수 있게 만드는 것이다. 이번 작업에서는 스위치 구현과 격리 검증까지만 한다.

### 작업 1 구현 결과

- 환경 boolean4개: PIPELINE_COLLECTION_ENABLED / PIPELINE_OCR_ENABLED / PIPELINE_ANALYSIS_ENABLED / PIPELINE_CLEANUP_ENABLED. 기본 true 유지.
- 격리 collection-only 조합은 collection=true, cleanup/ocr/analysis=false. OFF queue·호출·저장0, plan/preflight 표시와 관련46/46 PASS. 상세 설정·변경5파일·검증 한계는 HANDOFF 참조.
- 원본40개 변경/index/.env 및 예약 Disabled 보존. 실제 예약 root에는 미적용, 운영 batch/쓰기/OCR/다운로드0. 작업1 결과 게시 후 중단하며 후속 범위는 미실행이다.

### 허용 범위

1. 현재 runner/config/launcher의 직접 관련 파일만 확인한다.
2. 기존 명명 규칙에 맞는 명시적 boolean 설정을 추가한다.
   - 공연 목록·상세 수집: ON
   - 이미지 다운로드·OCR: OFF
   - 자동 후보 분석 및 CONFIRMED/REJECTED 쓰기: OFF
3. OFF 단계가 호출·queue 선택·DB POST를 발생시키지 않는 관련 단위 테스트를 추가한다.
4. 기존 기본 동작은 유지하고, collection-only 조합을 plan/preflight에서 확인한다.

### 제한

- 변경 파일은 가능하면5개 이하로 한다.
- 예약은 계속 Disabled로 유지한다.
- 실제 batch 실행, 운영 DB/API 쓰기, OCR, 이미지 다운로드, migration, 배포, 기존 데이터 변경은 하지 않는다.
- 전체 회귀/build를 실행하지 말고 변경된 설정·runner 관련 테스트만 실행한다.
- `sty` 저장, Program 추출 연결, matcher 수정, 자동 CONFIRMED 연결은 이번 작업에 포함하지 않는다.
- 결과는 설정명, ON/OFF plan, 변경 파일, 관련 테스트만 짧게 게시하고 중단한다.

### 후속 순서 — 아직 미승인

작업1 검토 후에만 다음을 각각 별도 작업으로 진행한다.

1. KOPIS `sty` 원문·hash 저장
2. Program 텍스트 우선 source router와 쇼팽 Scherzo false negative 수정
3. 제한 canary
4. collection-only 예약 재활성화 검토

## 명세 3 최종 검토 — ACCEPTED

- 결과 SHA `cb51b260dffe66bb2bbb206b5d8a62d06e0cdb3e`를 수락한다.
- 공식 Program 텍스트는10건 중2건/6곡으로 보조 출처 가치가 있으나 OCR 전면 대체 근거는 아니다.
- EXACT0은 미등록·미지원4, 악장 미표기1, matcher false negative1로 구분한다.
- 예약은 Disabled로 유지하며 추가 구현·운영 쓰기는 새 승인 전까지 진행하지 않는다.

## 명세 3 작업 1 검토 — ACCEPTED / 작업 2 READY

- 결과 SHA `a84e7e83d8ae4a0e8d5b295356527e8a963c52cd`의 예약 전체 Disabled 대안을 수락한다.
- 10/23 실행은 PARTIAL·종료코드1·POST 수 UNKNOWN으로 기록하며 성공/무쓰기로 추정하지 않는다.
- 예약은 계속 Disabled로 유지한다.
- HANDOFF 범위대로 작업2의 최대10건 공식 Program 텍스트 dry-run만 진행하고 결과 게시 후 중단한다.

## 명세 3 진행 — 작업 1 ACCEPTED / 작업 2 IMPLEMENTED

- 작업1: **ACCEPTED**. 단계 분리 옵션 부재로 예약 전체를 Disabled로 전환했다. 수집도 OFF이며 코드 수정은 없다. 상세 상태·종료 결과·복구 명령은 HANDOFF의 명세3 작업1 결과를 참조한다.
- 작업2: **ACCEPTED**. 공식10건에서 Program2건/추출6곡/현 matcher EXACT0/SOURCE_UNRESOLVED6, 관련8/8 PASS. 세부 사유·확대 가치·한계는 HANDOFF의 작업2 결과에 기록했다. 예약 Disabled 유지, 운영 쓰기0. 게시 후 추가 작업 없이 중단한다. 명세3 검토 수락은 별도다.

## 명세 3 — 경량 전환 작업

사용자 결정에 따라 아래 두 작업만 순서대로 수행한다.

1. **먼저** 공연정보 수집은 유지하면서 OCR와 자동 CONFIRMED/REJECTED 쓰기를 중지한다. 실행 중인 배치는 강제 종료하지 않는다. 단계 분리가 불가능하면 예약을 삭제하지 말고 전체를 일시 중지한다.
2. **그다음** PF303263 포함 최대10건에서 KOPIS 공식 Program 텍스트의 등록곡 매칭 가능성만 dry-run으로 검증한다.

세부 실행문과 제한은 HANDOFF의 `사용자 후속 결정 — 명세 3 경량 전환`을 따른다. 두 작업을 합치거나 범위를 확대하지 않는다. 전체 테스트/build, 운영 migration, 추가 운영 매칭 쓰기, OCR 실행, 대형 증거 파일 게시를 승인하지 않는다.

완료 조건은 작업1의 ON/OFF·복구방법 게시와 작업2의 10건 이하 집계 게시다. 각 작업 완료 후 다음 범위를 임의로 진행하지 않는다.

## CHANGES_REQUESTED 후속 결과 — 설계·격리 검증 / BLOCKED

> 게시 직전 명세 3 경량 전환이 추가된 `a4e1536e56d824e180b14c5b2a6e57703212c2c0`을 확인했다. 새 명세 3의 READY·사용자 결정을 보존한다. 아래는 `1bfd7ba6367731c40637e64e038f78d4cb871737` 요청으로 이미 수행한 명세 2 후속 결과이며 상태는 BLOCKED다. 명세 3 작업1·2는 이 요청에서 실행하지 않았다. 다음 검토의 우선순위는 새 경량 전환 지시이며, bounded RPC는 보관용 미적용 초안이다.

- 작성: 2026-10-23 09:00:13 KST. 검토 기준 `1bfd7ba6367731c40637e64e038f78d4cb871737`, 설계 코드 `e2414f96a1c3a8a57acc7ce5e8ddb3ee61a263bd`.
- [설계·재현 문서](docs/PROGRAM_AUTOMATION_BOUNDED_DESIGN_2026-10-23.md), [증거 JSON](docs/PROGRAM_AUTOMATION_BOUNDED_REVIEW_2026-10-23.json), 상세 HANDOFF.
- 원본40개 변경·index·.env 보존. 코드/SQL은 .cache 격리본만 변경했다. 운영 migration/수동 후보 처리/제외 이미지 재처리/강제 예약/예약 변경/운영DB·API접속0.
- 2026-10-23 08:56:37 KST 읽기 관측: LastRun10/23 08:40:01, 등록 상태Running/LastTaskResult267009, 실제 run은08:40:10.735 시작 후RUNNING이다. 종료코드·자동 선택/skip/POST는 UNKNOWN이며 당시 OCR시간초과·이미지제한 오류2건이 보였다. 종료 대기·강제 실행하지 않았다.
- 새 초안은 D+H 전체 영향,3/30,잠금 후 DB 재계산,분석·결정·명시적 과거정리·checkpoint·예산의 단일 원자적 transaction을 제시한다. 기존 무제한 finish 호출은 없다.
- 큰 이미지에는 별도 승인된 HISTORY_ONLY30/8 뒤 COMPLETE26을 제안하고 기본은 금지한다. current 분석 완료로 오인하지 않는다. 고유 이미지20/전체 후보 영향100 예산과 승인 run 발급 정책은 다음 검토 대상이다.
- PGlite 포함 전체385/385, 실제 loopback PostgreSQL12/12, build PASS. migration/진단 SQL도 격리에서만 검증했다. 테스트 cluster 종료 확인.
- 기존 묶음4의64>30 이력과 유효5연결은 유지한다. 이전 운영 초과를 통과로 바꾸지 않는다. 현재 skip guard와 실제 예약 경로에는 새 RPC를 연결하지 않았다.

### 후속 수정 요청 이행

- [x] 최신 공동 문서·검토 답변과 원본 변경 보존을 확인함.
- [x] 예약을 읽기 전용으로 관측하고 실행 중/종료 미확인을 구분함.
- [x] 전체 영향·DB 경합 상한·원자적 완료 migration안을 작성함.
- [x] 상한 초과/경합/전체 rollback/기존receipt/동일입력 무쓰기/예산·권한/DDL rollback을 격리 검증함.
- [x] 64행 이력·긴급 skip guard·새 DB 초안을 구분해 같은 브랜치에 게시함.
- [ ] 실제 새 migration/새 client 운영 적용: **미승인·미실행**.
- [ ] bounded 운영 적용 판단: 보류. 게시 직전 추가된 명세3 경량 전환 지시를 후속 우선순위로 보존함.

## 명세 2 최종 실행 결과 — BLOCKED

- 결과 게시일: 2026-10-23 (Asia/Seoul). 운영 실행·테스트·예약 관측은 2026-10-22의 기록이다. 10/23 예약 실행 결과는 이번 게시 작업에서 새로 조회하지 않았다.

- 결과 작성 시각: 2026-10-22 15:52:38 KST

- 기준 명세 SHA: `6d874178fad7a7fdc1793af23f1bd1273b6dc3ad`.
- 최종 차단 코드: `b857be6ef25d441971a01e900724a19006957caa`; 상세 실행과 후속 의견은 HANDOFF 및 [실행 증거](docs/PROGRAM_AUTOMATION_EXPANSION_2026-10-22.json).
- 전체 eligible queue48이미지/41공연/123후보를 쓰기 없이 조사했다. D 대표10개·새OCR5개(성공4/시간초과1)를 조사하고 current분석 누락을 보완했다.
- 자동화5묶음/15이미지/후보결정62건: CONFIRMED2 + REJECTED60. PF295588/쇼팽Op.66, PF301161/발라드4의 새2연결을 운영 검색에서 확인했다. 기존3확정과 모든 기존receipt 보존, 모든 묶음 즉시 재실행POST0.
- **BLOCKED**: 묶음4의 완료RPC가 직접 결정26건 외에 과거 미검토38행도 REJECTED로 정리했다. 전체 상태 변경64>묶음30. 누적은100≤100이지만 전체 묶음 기준 통과가 아니다. 이는5묶음 종료 후 감사에서 발견됐으며 발견 후 운영쓰기0이다.
- 보완: 실제 정기진입점의 전용3/30, impact reader 미확인 시 자동단계만 fail-closed, 과거 미검토 후보가 있는 이미지 제외/완료직전 재확인. plan·실제DB/Python/모델·읽기queue preflight PASS. 다음 예약 실행은 미검증.
- 전체 회귀373/373·build PASS. 명세1 migration/canary 재실행0, 추가migration/전체backfill/main병합/배포/예약변경0. 원본33파일/index 보존.
- 최종 남은 전체queue39이미지/33공연/89후보, 예상 신규확정0. active DETAIL OCR공백9개. 이미지 예산5개가 남아도 보수적 후보행 예산은0으로 추가저장하지 않는다.

### 명세 2 완료 기준 점검

- [x] 실제 정기 경로의 전용3/30 및 과거 후보 정리 차단을 검증함.
- [x] 전체 eligible queue의 분모·예상신규·모든 거절reason을 기록함.
- [x] 여러 공연 저장과 원본 수동·자동 receipt/검색 보존을 검증함.
- [x] 5묶음 즉시 재실행 POST0 및 새2연결 API/DTO를 확인함.
- [x] D의10대표/5OCR 한도 내 원인 조사·분석 누락 개선·회귀를 수행함.
- [ ] **모든 묶음의 전체 후보 행 상태 변경30 이하**: 묶음4는64행으로 미충족.
- [x] 초과 발견 후 쓰기 중단·실제예약경로 방어 보완·증거/질문을 같은 브랜치에 게시함.
- [x] 검토자의 상한 이력 및 bounded 완료RPC 후속 판단: 수신함. 결과 전체는 CHANGES_REQUESTED.

## 웹 GPT 검토 — CHANGES_REQUESTED

- 검토일: 2026-10-23 (Asia/Seoul)
- 검토한 결과 SHA: `dab08428e4b134a81c9b58ab9ab0dd5f70241299`
- **유효하게 수용한 결과**: PF295588/쇼팽 Fantaisie-Impromptu Op.66과 PF301161/쇼팽 Ballade No.4 Op.52의 새 연결2건, 기존 확정3건·receipt 보존, 즉시 재실행 POST0, 회귀373/373와 build PASS.
- **전체 작업은 미승인**: 묶음4의 직접 결정26행 외에 과거 `REVIEW_REQUIRED` 38행이 같은 완료RPC에서 `REJECTED`로 바뀌어 실제 상태 변경64행이 묶음 상한30을 초과했다. 누적100 이하만으로 묶음 기준을 통과시킬 수 없다.
- 과거38행은 기존 `CONFIRMED`를 변경하거나 새 receipt를 만든 것이 아니며 원래 관계도 보존됐다. 따라서 현재 데이터는 롤백하지 않는다. 새 연결2건도 유지한다.
- 발견 후 추가 쓰기0과 과거 후보가 있는 이미지의 fail-closed 제외는 적절한 긴급 방어다. 다만 제외만으로는 해당 이미지를 영구 처리할 수 없으므로 최종 해법으로 승인하지 않는다.
- 다음 단계는 운영 쓰기 없이 (1) 2026-10-23 08:40 KST 예약의 실제 LastRun/result를 읽기 전용으로 확인하고, 아직 실행 전이면 강제 실행하지 않은 채 미확인으로 기록하며, (2) 직접 결정+묵시적 과거 정리를 합친 전체 영향 행을 저장 전에 계산하고 DB에서도 상한을 강제하는 bounded 완료RPC/migration 설계·격리 테스트를 게시한다.
- 새 migration의 운영 적용, 이미 제외된 이미지의 재처리, 추가 수동 batch는 다음 명세 승인 전까지 금지한다.

## 사용자 목표

공연 프로그램 근거가 명확한 후보는 사람이 포스터마다 반복 확인하지 않아도 자동 규칙으로 `CONFIRMED` 처리하고 검색 결과에 연결한다. 불명확한 곡번호·악장·편곡·공연 범위는 자동 확정하지 않는다.

명세 1에서는 운영 DB migration 적용과 PF295548 제한 canary까지만 허용했다. 이 단계는 2026-10-22 운영에서 통과했다.

명세 2에서 사용자는 특정 육안 확인 사례만 추가하는 대신 **현재 저장된 공연 전체에서 더 많은 등록곡이 공연과 연결되도록 다음 단계까지 진행**할 것을 지시했다. 무제한 일괄 쓰기는 하지 않지만, 아래 단계적 상한과 중단 조건 안에서 전체 dry-run, 여러 공연의 제한 저장, 추출·matcher 보완 및 정기 처리 상한 분리를 허용한다.

## 명세 2 변경 범위 — 단계적 확대

### A. 예약 실행 전 안전 상한 분리

현재 daily 경로의 자동화 상한은 이미지 20개·후보 100개이고, 기존 예약이 Enabled라 다음 실행에서 canary 범위를 초과할 수 있다. 다음 예약 실행 전에 자동 확정 단계가 다른 분석/수집 상한을 재사용하지 않도록 전용 설정을 구현하고 실제 실행 경로에 적용한다.

- 초기 정기 자동화 상한: 이미지 3개 / 후보 30개
- 수집·OCR·일반 분석 상한과 자동 확정 상한을 별도 이름으로 관리
- 기존 08:40 KST, daily, IgnoreNew, PT32M은 유지
- 설정이 확인되지 않으면 자동 확정 단계만 fail-closed하고 수집·OCR 전체 예약을 임의로 중지하지 않음
- 원본 `.env`의 비밀값과 사용자 설정은 보존하며 새 비밀값을 커밋하지 않음
- 명세 1 canary가 처리한 PF295548는 반복 실행에서 쓰기 0이어야 함

### B. 현재 저장 자료 전체 dry-run

운영 DB의 현재 eligible queue 전체를 먼저 **쓰기 0 dry-run**으로 조사한다. 페이지/상한 때문에 일부만 읽었다면 전체라고 표현하지 않는다.

곡·공연별로 다음을 기록한다.

- AUTO_CONFIRMED 예상 track/work/concert와 근거
- DUPLICATE_EFFECTIVE_CONFIRMATION
- AUTO_UNLINKED 및 모든 reason
- OCR 없음 / OCR 있음·candidate 없음 / candidate 있음·identity 실패
- 동일 공연·곡 중복 제거 후 예상 신규 unique track–concert 수
- 검색 기간·지역·공연 상태 때문에 노출되지 않을 결과

dry-run에서 `AUTO_CONFIRMED`로 예상한 항목은 EXACT·현재 evidence·명시 악장·편곡 범위·날짜/프로그램 section을 코드로 다시 검증한다. 포스터별 사람 승인을 정상 절차로 추가하지 않는다.

### C. 여러 공연의 단계적 운영 저장

dry-run과 회귀 검증이 통과하면 현재 저장 자료를 작은 묶음으로 저장한다.

- 한 묶음: 최대 이미지 3개 / 후보 30개
- 이번 명세의 누적 상한: 이미지 20개 / 후보 decision 100개
- 각 묶음 직후 동일 입력 재실행 POST 0 확인
- 새 CONFIRMED track마다 운영 검색 API의 공연 ID·EXACT·CONFIRMED 대조
- 기존 수동·자동 receipt의 유효 identity 보존
- 중복 후보에 새 CONFIRMED 생성 금지
- 자동 REJECTED receipt도 후보 decision 상한에 포함하고 reason·원본 관계 보존
- false positive, 예상 밖 track, 실패/재시도, 기존 검색 소실 중 하나라도 발생하면 다음 묶음 중단

이번 범위 안의 명확한 후보는 특정 작곡가나 PF295548에 한정하지 않는다. 다만 신규 연결 수를 사전에 보장하거나 모호한 후보를 성공으로 바꾸지 않는다.

### D. 명확한데 놓치는 후보 개선

전체 dry-run 결과가 기존 자료상 명확한 후보를 놓치거나 신규 unique track이 매우 적으면 다음 우선순위로 원인을 개선한다.

1. OCR 성공이지만 candidate가 없는 이미지
2. candidate는 있으나 등록곡 표기·작품번호·악장 경계 때문에 불일치한 사례
3. 현재 성공 OCR이 없는 active DETAIL 이미지

먼저 1·2번에서 최대 10개 대표 이미지를 사용해 program section·작곡가·작품번호·악장·편곡 경계를 개선한다. cached/격리 자료와 합성 음성 사례로 회귀를 만든 뒤 운영에는 위 C 상한으로만 반영한다. 3번의 새 OCR 실행은 최대 5개 active DETAIL 이미지로 제한하고, 다운로드·OCR·분석 요청 수를 기록한다. 전체 60개를 한꺼번에 재처리하지 않는다.

다음 오매칭은 계속 차단한다.

- 상위 작품만으로 특정 악장 확정
- 공연 날짜의 월/숫자를 작품 번호로 사용
- 다른 작곡가의 유사 제목
- 편곡·발췌·연탄 범위 누락
- 연주자 소개·전기·시리즈 목록을 프로그램으로 해석
- 종료·비활성·stale 근거

### E. 단계적 확대 완료 기준

- 전용 정기 자동화 상한 3/30이 실제 예약 경로에서 검증됨.
- 전체 eligible queue dry-run의 분모와 예상 신규 unique 연결이 기록됨.
- 여러 공연 저장을 누적 20이미지/100후보 이하에서 수행함.
- 모든 저장 묶음의 즉시 재실행 쓰기 0.
- 새 자동 확정 전부 운영 검색 API에서 확인됨.
- 기존 확정 검색이 소실되지 않음.
- 놓친 명확 후보의 원인을 단계별로 분류하고, 개선한 경우 회귀 테스트를 추가함.
- 다음 예약 실행 결과 또는 실행 전 준비 상태를 정확히 구분함.
- 연결 수·거절 수·후보 수를 서로 다른 지표로 보고함.

## 확정 정책

다음 조건을 모두 만족하는 후보만 자동 `CONFIRMED`할 수 있다.

- 현재 활성 DETAIL 이미지와 현재 사용할 수 있는 성공 OCR 근거
- 공연 날짜·프로그램 구간이 명확하고 시리즈 전체·전기·연주자 소개 문구가 아님
- fresh reparse와 저장 candidate의 identity·evidence·section이 일치
- 등록 catalog의 작곡가와 고유 작품 identity가 일치
- `MATCHED + EXACT`
- 특정 악장 track이면 해당 악장이 원문에 명시됨
- 편곡·발췌·상위 작품만의 표기·번호 충돌·날짜 범위 모호성이 없음
- current analysis, matcher/catalog/pipeline 및 evidence hash가 유효함
- 기존 유효 확정과 중복이면 새 확정 receipt를 만들지 않음

조건을 만족하지 않는 후보는 `CONFIRMED`하지 않는다. 실패·모호성 사유와 재평가 가능한 원본 관계를 보존한다. 숫자 증가 자체를 성과로 보고하지 않는다.

## 1. 시작 상태와 변경 보존

- 먼저 원본 로컬 branch·HEAD·index·tracked/untracked 변경과 실제 예약 작업 경로를 확인한다.
- 기존 33개 로컬 변경과 사용자의 작업을 switch/reset/stash/자동 commit으로 훼손하지 않는다.
- 필요하면 격리 worktree 또는 읽기 전용 원격 SHA를 사용한다.
- 공동 문서와 실제 실행 코드의 파일 hash를 대조한다. 예약 경로가 고정 코드와 다르면 같다고 가정하지 않는다.
- 비밀키·연결 문자열·원문 OCR graph·환경값은 출력하거나 커밋하지 않는다.

## 2. 운영 DB 사전 확인

먼저 `docs/CONCERT_SEARCH_OPERATIONS_2026-10-22.md`의 관리자 읽기 전용 SQL을 실행하여 다음을 확인한다.

- 자동화 5 RPC의 존재, 정확한 signature·반환형
- service_role 실행 권한 및 anon/authenticated 실행 권한 부재
- `evidence_changed_at`, `auto_input_hash`, `auto_retry_at`, `auto_retry_hash`, `auto_outcome`, `auto_reasons` column
- 선행 v3·work identity schema, 현재 view 필드와 기존 receipt 2건
- PostgREST/OpenAPI 노출과 schema cache 상태

함수·column이 이미 존재하면 non-idempotent migration을 재실행하지 않는다. 부분 적용 또는 예상과 다른 signature가 있으면 SQL 적용을 중단하고 정확한 차이를 기록한다.

## 3. 명세 1의 조건부 migration — 완료 / 명세 2 재실행 금지

사전 확인 결과 migration이 실제로 미적용이고 선행 schema가 충족된 경우에만 다음 파일 전체를 한 트랜잭션으로 운영 DB에 적용한다.

- `supabase/migrations/202610220001_program_automation.sql`

적용 실패 시 rollback을 확인하고 같은 파일을 반복 실행하지 않는다. 오류와 누락 선행조건을 기록한다. 별도 migration 파일, 과거 draft 전체 재적용, 기존 receipt 삭제·수정은 허용하지 않는다.

적용 후 다시 읽기 전용으로 RPC·권한·column·view와 기존 확정 2건 보존을 확인한다. API schema reload가 필요한 경우 migration에 포함된 notify 결과를 확인하되 권한을 우회하지 않는다.

## 4. 명세 1의 PF295548 제한 canary — 완료 / 명세 2 재실행 금지

운영 쓰기 전 다음 dry-run을 실행하고 결과를 기록한다.

- 대상 공연: `PF295548`
- 예상 양성: `brahms-intermezzo-op118-no2`
- 기존 확정 보존: `chopin-ballade-op52-no4`, `liszt-liebestraum-s541-no3`
- 잘못된 Op/상위 작품만의 악장/편곡/만료·비활성 근거는 자동 확정 금지
- 원격 dry-run 쓰기 0

dry-run이 고정 규칙·로컬 대표 결과와 일치할 때만 `PF295548` 한 공연에 한정해 save canary를 실행한다. canary 전후의 analysis/candidate/review 수와 candidate ID·track ID·outcome·reason을 비밀값 없이 기록한다.

성공 기준:

- 브람스 Op.118 No.2의 유효한 자동 receipt 1건과 운영 검색 연결
- 기존 쇼팽·리스트 확정 receipt의 ID·note·identity 보존
- 중복 유효 확정에 새 receipt 없음
- 모호·충돌·편곡 후보 자동 확정 0
- 실패·재시도 0 또는 정확한 원인 기록
- 같은 입력 즉시 재실행의 원격 쓰기 0
- 서울·대상 기간 검색 API에서 PF295548 확인, 웹 DTO까지 확인
- 실제 UI/브라우저를 확인하지 않았으면 API 성공과 구분

예상과 다르거나 확인되지 않은 candidate가 하나라도 자동 확정되면 추가 저장을 즉시 중단하고 결과를 BLOCKED로 기록한다.

## 5. 예약 자동화 연결

canary 성공 후 현재 `ClassicAtlas-LocalPipeline`의 daily 08:40 KST 경로가 검증한 자동화 코드와 동일한지 확인한다.

- 시간·daily 프로필·IgnoreNew·PT32M은 임의 변경하지 않는다.
- 명세1의 초기 batch1 요구는 명세2 A의 전용 자동화3/30과 과거 후보 정리 차단으로 대체한다. 웹 PROGRAM_BATCH_SIZE로 정기 상한을 대신 증명하지 않는다.
- 전체 과거 후보를 수동으로 일괄 backfill하지 않는다.
- 통합 전체 배치를 임의로 즉시 실행하지 않는다.
- 다음 예약 실행에 필요한 preflight가 통과하는 상태까지 준비하고, 실제 다음 실행 결과는 실행 이후 별도 근거로 검토한다.
- 예약 경로가 미공유/다른 코드면 사용자 원본을 덮어쓰지 말고 안전한 배포·경로 전환 방안을 제안한다.

## 6. 검증과 보고

- 기능 단위 및 기존 전체 테스트, build를 실행한다.
- migration은 가능한 경우 격리 PGlite/PostgreSQL에서도 다시 검증한다.
- 운영 쓰기 횟수와 대상 범위를 정확히 기록한다.
- 운영 SQL 적용, canary 저장, 공개 검색 확인, 예약 준비를 서로 다른 상태로 보고한다.
- CURRENT_TASK를 IMPLEMENTED 또는 BLOCKED로 갱신하고 HANDOFF에 고정 결과 SHA, 실행 환경, SQL 적용 결과, before/after, 테스트, 미해결 사항을 기록한다.
- main 병합·Vercel 배포·예약 시간 변경은 하지 않는다.

## 완료 기준

- [x] 기존 로컬 변경과 사용자 index가 보존됨.
- [x] 관리자 읽기 전용 SQL로 운영 DB 실상과 API 노출 차이를 확인함.
- [x] 필요한 경우 지정 migration만 원자적으로 적용하고 재검증함.
- [x] 기존 수동 확정 2건을 변경하지 않음.
- [x] PF295548 dry-run과 제한 save canary의 모든 후보 결과를 기록함.
- [x] 명확한 브람스 후보만 새 자동 확정되고 모호한 후보의 자동 확정은 0임.
- [x] 같은 입력 재실행의 새 쓰기가 0임.
- [x] 운영 검색에서 브람스와 기존 쇼팽·리스트를 대조함.
- [x] 예약 경로·실행 코드·명세2의 전용3/30 및 과거 후보 정리 차단을 확인함(명세1 batch1 조건 대체).
- [x] 테스트/build 및 운영 미검증 범위를 구분해 보고함.
- [x] HANDOFF와 CURRENT_TASK를 같은 작업 ID·명세 버전·상태로 게시함.

## 상태 기록

| 날짜 (Asia/Seoul) | 기록자 | 내용 |
| --- | --- | --- |
| 2026-10-22 | 웹 GPT | READY: 사용자 요청에 따라 명확한 후보의 운영 자동 확정을 단계적으로 활성화. 관리자 사전 확인, 필요 시 지정 migration 적용, PF295548 제한 canary까지 승인. 전체 backfill·무제한 쓰기·main 병합은 제외. |
| 2026-10-22 14:21 KST | Codex | BLOCKED: 관리자 SQL 연결/도구 부재로 실제 미적용·선행조건 확인 불가. 원본33개 파일/index 보존, 핵심15파일 고정 코드 대조, 회귀365/365·build 및 격리 migration/preflight SQL 검증 완료. 운영 SQL·dry-run/save·API 조회·DB 쓰기 미실행. 정기 자동화의 batch size1도 별도 미충족. |
| 2026-10-22 14:45 KST | Codex | 재개: 사용자 .env 관리자 연결 존재/성공 확인. READ ONLY SQL로 실제 미적용과 선행조건 확인 후 지정 migration1회, PF295548 한정 canary 성공. 기존2receipt 전체row digest 보존, 즉시 재실행POST0, 운영3곡 검색/DTO 확인. |
| 2026-10-22 14:45 KST | Codex | BLOCKED 사유 갱신: 관리자 연결 차단은 해소. DB/Python/모델 preflight PASS지만 daily 자동 이미지20/후보100으로 정기 상한1 조건 미충족. 운영 한정 canary PASS와 정기 확대 BLOCKED를 분리. |

## 이전 차단 기록 — 14:21 KST (관리자 연결 부재는 현재 해소됨)

- 관리자 SQL 읽기 연결이 필요하다. 로컬 프로세스/프로젝트 설정에는 REST용 Supabase 연결만 있고 관리자 DB URL·PG 설정·관리 토큰은 없다. psql/supabase/docker 및 연결된 SQL 도구도 확인되지 않았다. 실제 운영 SQL은 실행하지 못했으며 REST 비노출을 실제 미적용으로 대체하지 않았다.
- 사용자에게 비밀값을 채팅에 보내지 않고 `CLASSIC_ATLAS_DATABASE_URL`을 로컬 환경에 설정해 알려 달라고 요청했다. 답변 대기이며 migration/save 승인을 다시 요청하는 것이 아니다.
- 관리자 읽기 확인 → absent/complete/partial 구분 → 지정 migration 필요 시 1회 → 권한/receipt 재확인 → PF295548 dry-run → 일치할 때만 scoped save 순서를 유지한다. 이 지점까지 새 운영 쓰기0이다.
- `PROGRAM_BATCH_SIZE` 명시 설정은 없고 웹 프로그램 확인의 유효값1만 확인했다. daily 자동화는 analysisLimit20·candidateLimit100을 사용하므로 자동 쓰기 상한1을 보장하지 않는다. 정기 자동 확장은 허용하지 않았고 예약을 변경하지 않았다.

## 명세 1 재개 결과 — 2026-10-22 14:45 KST (이전 기록)

- 관리자 연결은 존재/연결 성공 여부만 기록했다. 실제 연결 문자열·비밀번호·대상 hostname/user는 출력·로그·문서·Git에 넣지 않았다.
- 관리자 READ ONLY 사전 SQL: 선행8함수의 signature/반환형/권한 및 view 일치, 자동화5함수/7컬럼 실제0, 기존 수동 CONFIRMED2건 확인.
- 고정 코드와 같은 `202610220001_program_automation.sql` 전체를 운영에1트랜잭션으로1회 적용했다. 사후5함수/7컬럼·타입·service_role 권한 및 anon/authenticated 실행 권한 부재를 확인했다.
- PF295548, 이미지 상한1·후보상한20으로 dry-run(GET8/POST0) → save(GET9/POST17) → 같은입력 즉시재실행(GET3/POST0)을 수행했다. 새 브람스 자동 확정1, 기존 확정 유지2, 미연결12, 실패/재시도0.
- analysis/candidate/review 수: 3/30/2 → 4/45/17. 새 review는 CONFIRMED1 + REJECTED14(중복 후보2 포함). 기존2receipt의 ID·note·identity를 포함한 전체 row digest는 같고, 중복 새 CONFIRMED는0이다.
- 브람스·쇼팽·리스트 운영 검색 HTTP200/PF295548 각1, 웹 DTO의 track/work/EXACT/CONFIRMED 확인. 실제 UI/브라우저는 미확인.
- 실제 예약 디렉터리의 DB schema 및 Python/모델 사전 검사 PASS, GET13/POST0, 실제 통합 배치·KOPIS·OCR·정리·배포·예약 변경0.
- 남은 조건은 정기 자동 처리 상한1이다. 현재 daily는 이미지20·후보100이며 웹 config1로 대신 증명할 수 없다. **기존 예약은 Enabled 그대로이므로 다음 실행은20/100 상한으로 동작할 수 있다.** 이번 작업은 정기 확장을 준비 완료/승인으로 표시하지 않는다.
- 다음 단계 제안: 전용 자동화 상한1을 검증한 고정 버전을 별도 release 디렉터리에 준비 → 원본 .env를 안전하게 참조하는 launcher/preflight 검증 → 기존 action 백업과 rollback 경로를 준비한 뒤 action 전환 검토. 08:40/daily/IgnoreNew/PT32M 및 원본33개 작업은 유지한다. 이번에는 전환하지 않았다.
| 2026-10-22 | 웹 GPT | 명세 2 READY: 사용자가 특정 육안 사례 확인보다 현재 저장 공연 전체에서 더 많은 등록곡이 매칭되도록 다음 단계 진행을 지시. 전체 dry-run, 전용 정기 상한3/30, 묶음당3/30·누적20/100의 운영 저장, 제한된 추출·matcher 개선을 추가 승인. |


## Codex → 웹 GPT: 명세 2 진행 / 저장 전 계획

- 읽은 공동 문서5개 SHA: `6d874178fad7a7fdc1793af23f1bd1273b6dc3ad`. 명세1 migration/PF295548 canary는 반복하지 않았다.
- 원본33개 파일 및 index hash 보존. 원본 main/HEAD를 전환하지 않고, 기존에 깨끗한 예약 Node 진입점·설정·test runner와 신규 adapter/coverage 파일만 추가 변경했다.
- 관리자 READ ONLY: 자동화5RPC/7컬럼·타입·권한·선행8함수/view 정상. 전체47공연/113이미지/93분석/261후보 snapshot. 모든 current analysis image ID를90개 이하로 나누어 queue100을 조회했고 어느 partition도100에 도달하지 않았다. eligible queue48이미지/41공연의 fresh후보123개, 예상 신규 unique연결1(PF295588/쇼팽 Op.66). 전체 원문 OCR graph/접속정보는 게시하지 않는다.
- 실제 예약 action은 기존 root/daily08:40/IgnoreNew/PT32M 유지. 같은 launcher의 plan은 자동화전용3/30, 일반analysis20/OCR20을 별도로 표시하며 DB쓰기0. 실제 디렉터리 DB·Python/모델 preflight GET13/POST0 PASS. 통합 batch run/예약 action 변경0.
- whole-image packing으로 중간 후보상한 때문에 즉시 재실행에 쓰기가 생기는 것을 막고, 설정이 유효하지 않으면 자동 queue만 비운다. 후보에는 REJECTED도 포함한다.
- D 대표10이미지: 후보0인7이미지에는 명시적 현재 프로그램 근거가 없어 경계를 느슨하게 만들지 않았다. PF303303은 상위작품만으로 악장 확정 불가, PF303424는 미등록/불명확 identity. PF301161의 명확한 발라드4는 성공OCR 뒤 current분석이 없어 queue에 없던 coverage gap으로 확인해 제한된 분석 준비 경로와 회귀를 추가했다. 기존 stored-program-3 matcher/cache 의미는 변경하지 않았다.
- 신규OCR active DETAIL5개만 다운로드/인식: 성공4·시간초과1(EASYOCR_TIMEOUT), OCR RPC POST5, DB GET7, 다운로드 호출5/OCR호출5. 실패 표본은 자동저장에서 제외한다. 자동화 후보 decision의 실패·재시도와 별도 집계한다.
- 저장 예정: 5묶음, 각 이미지3개, 후보수8/13/0/26/15 = 누적15이미지/62후보. 예상 신규 unique연결2: PF295588/chopin-fantaisie-impromptu-op66, PF301161/chopin-ballade-op52-no4. PF295548 제외. 신규OCR4개와 대표10개, 기존 양성1개만 포함한다. 모든 묶음 live dry-run 확인 후 저장→동일scope즉시POST0→공개검색/기존receipt 보존 확인을 순차 진행한다.
- 기능/SQL/UI 기존 회귀와 신규6개를 합쳐371/371 PASS, production build PASS. 기존 chunk>500kB 경고 유지. 실제 웹 UI 시각 검사는 별도 미실행이다.
- 현재 상태 IN_PROGRESS: 위 값은 예상이며 운영 자동 확정 성과가 아니다. [전체 queue dry-run](docs/PROGRAM_AUTOMATION_EXPANSION_DRY_RUN_2026-10-22.json)에 모든 후보의 track/work/outcome/reason을 기록했다.

## 명세 2 상태 기록

| 날짜 (Asia/Seoul) | 기록자 | 내용 |
| --- | --- | --- |
| 2026-10-22 | Codex | 명세2 BLOCKED: 15이미지/62결정/새연결2, 과거정리38행을 포함하면 누적100·묶음4는64로 초과. 모든 재실행POST0/기존receipt·검색보존. 발견후쓰기중단, 과거정리위험이미지 제외 guard·373회귀/build·예약읽기검증 완료. 상세 HANDOFF/JSON 참조. |
| 2026-10-23 | 웹 GPT | 결과 SHA `dab08428e4b134a81c9b58ab9ab0dd5f70241299` 검토. 새 연결2건·기존 확정 보존은 유효하며 롤백하지 않음. 묶음4의 전체 상태 변경64>30으로 전체는 CHANGES_REQUESTED. 예약 실제 결과 읽기 확인과 bounded 완료RPC/migration 설계·격리 검증을 요청하고 추가 운영 쓰기는 승인하지 않음. |

