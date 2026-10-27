# 현재 작업

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 4
- 제목: 명확한 공연 프로그램 후보의 운영 자동 확정 활성화 및 단계적 확대
- 상태: BLOCKED
- 요청자: Theo
- 명세 작성자 / 후속 검토자: 웹 GPT
- 실행 담당: Codex
- 작성일: 2026-10-22 (Asia/Seoul)
- 작업·명세 브랜치: `codex/ca-auto-20261022-001`
- 선행 인계 기준: `59e95fe96961f1f15709baa19ceb63e523744ca3`
- 선행 작업: CA-SEARCH-20261022-001 / ACCEPTED
- 고정 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`

## 명세 4 작업 3M — 공식 Program 공연 연결 최종 운영 전환 / BLOCKED

작업 3L 결과 SHA `77bd9ead8e3f766538916a509b5418fe78c8722e`와 구현 SHA `78db45b77667634acf372a28e991344c66dbaa83`를 **ACCEPTED**한다. legacy v2·v3 source read/backfill과 신규 v4 output/write가 분리됐고, unknown source fail-closed·v4 RPC/policy gate·기존 receipt 불변을 유지한 직접 테스트 53/53을 확인했다.

이번 작업 하나에서 잔여 회귀 정비부터 실제 운영 전환까지 끝낸다. 같은 원인을 다시 조사하거나 선행 작업을 재구현하지 않는다. 각 Gate가 통과할 때만 다음 Gate로 진행하며, 실패하면 예약 Disabled와 자동 정책 disabled를 유지하고 **BLOCKED**로 종료한다.

### 완료 상태

아래가 모두 충족될 때만 최종 상태를 `OPERATIONAL`로 기록한다.

- 전체 `npm test`: fail 0·skip 0이며 3A~3L 직접 suite가 기본 runner에 중복 없이 포함됨
- production build 통과
- 운영 migration 6개가 COMPLETE
- 공식 Program 텍스트 공연 단건 canary에서 신규 CONFIRMED 최대 1건, 동일 입력 재실행 신규 쓰기 0
- 해당 곡의 공개 공연 검색에서 canary 공연 노출
- 운영 배치는 공식 Program 경로만 1공연/신규확정 1건 상한으로 활성화
- OCR·이미지 다운로드·OCR 기반 분석/자동판정과 cleanup은 OFF

### 작업 3M timeout 재개 결과 — 보정 완료 / Gate C 즉시 재실행 BLOCKED (2026-10-27 KST)

- 공동 문서5개/시작 코드 `61bc0f6798f55154b986994190911d0633e4bcc0`, 구현 [`ea6e9270b0a1f307292e30954f6dd858ee87080c`](https://github.com/MattewShin/sound-atlas/commit/ea6e9270b0a1f307292e30954f6dd858ee87080c). 저장된 PF304387 source·분석 `6999ba97-d340-434e-8414-3094c9bb26b3`·후보18개를 재사용했다. KOPIS/source sync/분석 save/기존 migration6개/ACL 반복0.
- READ ONLY EXPLAIN/ANALYZE에서 223,048byte snapshot, 후보18개, 공통 canonical 식이 candidate projection에6회 나타나며 기존 실행13,747ms임을 확인했다. 단독 canonical123ms 대비 반복 비용이었다. 새 CTE는 해당 analysis 공통 검증을1회 materialize한다. 실제 저장18행의 구/신 전체 JSON 동등, SELECT14,812→657ms, 새 EXPLAIN183ms/계산식1회 확인.
- 신규 `202610270002_program_text_candidate_status_read.sql`1개로 analysis UUID 전용 `read_concert_program_text_candidate_status_v4(uuid)`를 추가했다. SECURITY INVOKER/STABLE, service_role EXECUTE만 허용. 기존 view/검증/ACL/RLS/timeout 설정은 그대로다. reader는 GET RPC를 쓰고 coordinator는 전체 payload hash가 같은 기존 분석을 읽어 재사용한다.
- 직접26/26 PASS. 전체 **npm test512/512, fail0/skip0(301.96s)**와 **build PASS(3.23s)**를 각각1회 실행했다. 큰 snapshot/19후보, 구/신 JSON 동등성, policy on/off·stale·중복·모호 fail-closed·RLS/ACL을 격리 검증했다. 기존613.88kB chunk 경고 유지.
- 신규 migration만 운영1회 commit. 기존 모든 데이터/함수/view/ACL/RLS/default ACL/membership/policy 불변을 commit 전후 확인했다. policy=false에서 새 GET은 HTTP200, **18행/Content-Range0-17/18,1,824ms**로 통과했다.
- **Gate C SAVE 통과:** 기존 분석/후보 재저장0. planning-ready4개 중 coordinator가 UUID 순 첫 후보를1회 확정했다. `PF304387 / chopin-scherzo-op31-no2`, receipt `dc572eb9-9756-4fbb-a03b-2a9b00474893`, EXACT/MATCHED/CONFIRMED1, REJECTED0. 이 시점에는 effective=true였다.
- **실패 Gate C / IMMEDIATE_RERUN:** 기존 확정1·남은 ready3을 읽은 뒤 두 번째 candidate 확정을 시도했다. 전체 canary 상한을 지키기 위해 전송 전에 차단했다. 실제 추가POST0/신규DB쓰기0이나 결과는 기대한 ALREADY_CONFIRMED가 아닌 FAILED/CONFIRMATION_FAILED여서 멱등 검증 미통과다.
- 즉시 v4 policy=false 복구. 15:34:11 KST 분석1/후보18/receipt1 및 모든 원본 row hash 보존 확인. 새 receipt는 append-only로 보존했고 policy OFF에 따라 effective=false/VERSION_POLICY_DISABLED_OR_MISSING이다. 15:34:24 KST 예약 Disabled/Enabled=false, action 변경/강제실행0.
- 이번 REST GET46/POST1(확정1), 분석 저장POST0. policy UPDATE는 on1/off1. 공개/release 검색·기존3곡 검색 및 Gate D PR/main 병합·배포·예약 활성화는 미실행이다.
- **재개점:** timeout은 새 단건 경로에서 해결됐다. 동일 source/payload/analysis의 유효 receipt가 이미 있는 다중 ready 후보 재실행 계약을 먼저 보정·격리 검증한 뒤 Gate C의 즉시 재실행→검색부터 재개한다. 신규 확정·source/분석 저장·migration/ACL을 반복하지 않는다. timeout만의 현재 범위를 넘겨 확정 정책을 임의 변경하지 않고 BLOCKED를 게시한다.
- 원본main/HEAD·40파일/index/.env 보존. 자격증명·운영 원문/evidence 기록0. 아직 OPERATIONAL이 아니다.

### 작업 3M Gate C candidate-status timeout 최소 보정·canary 재개 지시 / 실행 후 BLOCKED

결과 SHA `c74d36553b6146ff87220bcb153a46d98e7861ff`의 bounded source 준비와 실패 후 안전 중단을 **ACCEPTED**한다. `PF304387`의 공식 원문/hash 저장, 분석 1행·후보 18행은 보존하며 KOPIS 상세 56건 조사, source sync, 분석 save, 기존 migration 6개와 ACL 보정을 반복하지 않는다. 현재 신규 CONFIRMED 0건이므로 아직 OPERATIONAL은 아니다.

1. 먼저 policy=false·예약 Disabled를 유지하고 정확히 `PF304387` / 분석 `6999ba97-d340-434e-8414-3094c9bb26b3`에 한정해 READ ONLY `EXPLAIN (FORMAT JSON, COSTS, VERBOSE)`와 안전한 범위의 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`으로 57014의 실행 지점을 확인한다. 실행계획·행수·시간만 기록하고 공식 원문, evidence quote, 자격증명은 기록하지 않는다.
2. 현재 후보 view가 analysis-level source/context/payload/catalog 검증을 후보별로 반복하는지 확인한다. 추측만으로 index나 timeout을 바꾸지 않는다. 전역 `statement_timeout` 상향, 검증 생략, policy 우회, service-role 권한 확대는 금지한다.
3. 근거가 확인되면 **새 additive migration 1개와 필요한 최소 adapter/test 변경만** 허용한다. 이미 적용한 migration 파일을 수정·재적용하지 않는다. 구현은 기존 view의 의미를 유지하는 최적화 또는 analysis UUID를 받는 service-role 전용·SECURITY INVOKER·STABLE 단건 GET RPC 중 더 작은 쪽을 택한다. 공통 analysis 검증은 한 번만 계산하고 18개 candidate의 기존 필드·stale/exclusion/automatic-ready 의미는 byte/JSON 동등하게 유지한다. 기존 view는 호환성을 위해 보존한다.
4. 격리 DB에서 기존 view와 새 경로의 결과 동등성, 큰 공식 snapshot과 18개 이상 후보의 bounded 완료, RLS/ACL, policy false/true, stale·중복·모호 후보 fail-closed를 검증한다. 직접 관련 테스트 후 전체 `npm test`와 production build를 한 번 실행한다.
5. 새 migration만 운영에 1회 적용하고, policy=false에서 해당 analysis 단건 조회가 timeout 없이 완전한 18행을 반환하는지 확인한다. 다른 migration/ACL/source/analysis를 재적용·재저장하지 않는다.
6. 같은 실행에서 Gate C를 재개한다. 정확히 한 v4 policy 행만 활성화하고 기존 저장 source/analysis를 재사용해 coordinator SAVE를 1회 실행한다. 신규 공식 CONFIRMED는 최대 1건, REJECTED 0건이어야 한다. 즉시 같은 입력을 다시 실행해 신규 분석·후보·receipt 쓰기 0을 확인한다.
7. 공개/release 검색에서 `PF304387`의 확정 곡과 기존 PF295548의 쇼팽·리스트·브람스 연결을 확인한다. 예상 밖 후보, 57014 재발, 결과 불일치, 신규 확정 2건 이상, 기존 검색 소실이면 policy를 false로 복구하고 같은 3M을 BLOCKED로 게시한다.
8. Gate C가 모두 통과하면 중단하지 말고 기존 3M Gate D대로 main 병합·배포·검색 재확인·제한 예약 활성화까지 진행한다. 예약은 collection ON, 공식 Program 단일 공연 ON, OCR/구 OCR 판정/cleanup OFF, 회당 공연 1개·신규 확정 1건, 매일 08:40 KST다. 배포 SHA·rollback·실제 예약 설정을 기록하고 최종 상태를 `OPERATIONAL`로 게시한다.

### 작업 3M Gate C 재개 결과 — source 준비 완료 / PLAN_READ_FAILED로 BLOCKED (2026-10-27 KST)

- 공동 문서5개·실행 release 기준 `cfb73a24ddb6a311b8af253d88061f6891a11179`. production 코드/설정/테스트 변경0. 기존 Gate A 전체510/510·build PASS와 Gate B6개/ACL ACCEPTED를 유지하며 이번에는 test/build·migration·ACL을 재실행하지 않았다.
- READ ONLY 기존 미래26공연 + 현재 수집조건의 추가30공연을 조사했다. KOPIS 공식 상세GET56/60, 목록GET2, 이미지 다운로드/OCR0. 공식 Program15공연, MATCHED+EXACT2공연 중 시작일→KOPIS ID 순 첫 대상 `PF304387`(2026-10-29)을 선택했다.
- policy=false에서 완전한 detail/image snapshot을 sync RPC **1회 POST**했다. 다른 공연/receipt/review/OCR/분석 테이블의 row 수·digest 불변과 대상의 예상 metadata/image membership 변경만 확인했다. 저장 source를 다시 GET해 동일한 후보18개·MATCHED+EXACT4개를 검증했다.
- coordinator DRY_RUN은 동일 source/payload hash, 후보18개(MATCHED5/UNREGISTERED12/AMBIGUOUS1), DB쓰기0으로 통과했다. 대표 EXACT track은 `chopin-scherzo-op39-no3`이며 확정된 track이 아니다.
- 정확히 한 v4 policy 행을 활성화한 뒤 SAVE를1회 실행했다. 공식 분석 `6999ba97-d340-434e-8414-3094c9bb26b3`와 후보18개 저장 후 **PLAN_READ_FAILED**로 실패했다. 단건 확인 RPC 호출0, 신규 CONFIRMED0/REJECTED0. policy를 즉시 false로 복구했다.
- 최소 READ ONLY 사후 확인에서 `concert_program_text_candidate_status`의 해당 공연 조회가 **HTTP500 / SQL57014 / statement timeout**이었다. 15:00:05 KST 실제 text 분석1/후보18/confirmation0 및 v4 policy=false 확인. 저장 source/분석은 삭제하거나 재저장하지 않았다.
- 15:00:17 KST 예약 Disabled/Enabled=false, action 변경/강제실행0. 이번 Supabase REST GET24/POST2(source sync1 + 분석 save1), confirmation POST0. policy UPDATE는 활성화1·복구1. 즉시 재실행/공개 검색 검증 및 Gate D main 병합·배포·예약 활성화는 미실행이다.
- **실패 Gate C / 재개점:** 해당 공식 candidate status 조회의57014 timeout을 해결·검증한 뒤 저장된 `PF304387` source/분석을 재사용해 Gate C SAVE부터 재개한다. source 수집·sync1회·migration6개/ACL을 반복하지 않는다. 아직 canary·무쓰기 재실행·검색 검증을 통과하지 않았으므로 OPERATIONAL이 아니다.
- 원본main/HEAD·40파일/index/.env 보존. 원문/evidence/자격증명 기록0. 코드/SQL·timeout 설정을 임의 변경하지 않고 BLOCKED를 게시한 뒤 중단한다.

### 작업 3M Gate C 공식 텍스트 단건 준비·canary 재개 지시 / 실행 후 BLOCKED

결과 SHA `2337b2efc55d8f43adc1f819ca34b6276fd99398`을 검토했다. Gate B와 ACL 보정은 **ACCEPTED**한다. migration 6개와 ACL 보정을 다시 적용하지 않는다. `apply-one 2`는 실제 미실행이므로 재시도 대상이 아니며, READ ONLY 사후 검증 결과를 기준으로 한다.

현재 대상 0건은 migration 적용 전 수집된 기존 공연에 `sty` 저장 컬럼이 없었던 초기 상태다. Gate C에 필요한 source 한 건을 아래 제한 안에서 준비한다.

1. policy와 예약을 disabled로 유지한 채 운영 DB의 미래 공연 최대 30건을 ID·기간·상태만 READ ONLY로 조회한다.
2. 해당 KOPIS ID의 **공식 상세 XML만 GET**하여 `sty`를 기존 collector와 동일하게 정규화·hash하고, release 코드의 official router와 v4 분석기로 로컬 DRY_RUN한다. 이미지 다운로드·OCR·이미지 분석은 0회다.
3. 기존 미래 공연에서 대상이 없을 때만 현재 수집 조건의 추가 공연을 목록/상세 GET으로 최대 30건 더 조사한다. 전체 상세 조회 상한은 60건이다.
4. canary target은 미래 공연·`KOPIS_DETAIL_TEXT`·유효 text/hash·등록곡 `MATCHED + EXACT`를 모두 만족해야 한다. 여러 건이면 공연 시작일→KOPIS ID 순 첫 건을 선택한다. 원문이나 evidence quote는 로그·문서에 남기지 않는다.
5. 대상이 확인된 뒤에만 기존 `sync_kopis_concert` RPC로 **그 공연 한 건의 완전한 detail/image snapshot만 1회 저장**한다. policy=false 상태를 유지한다. source 준비 단계의 운영 POST 상한은 1회다.
6. 저장 전후 기존 receipt/review, 다른 공연, OCR/분석 테이블은 불변이어야 한다. 대상 공연은 공식 text/hash와 KOPIS 최신 metadata/image membership의 예상 변경만 허용한다.
7. 저장된 text/hash·context를 다시 GET하여 local dry-run과 동일한 `MATCHED + EXACT`가 나오는지 확인한다. 다르면 policy를 켜지 말고 BLOCKED.
8. 일치하면 기존 Gate C를 그대로 실행한다.
   - coordinator DRY_RUN
   - v4 policy 정확히 한 행 enabled=true
   - SAVE 신규 CONFIRMED 최대 1건·REJECTED 0
   - 동일 입력 즉시 재실행 신규 쓰기 0
   - release 검색 adapter에서 해당 track의 canary 공연 노출 및 기존 3곡 유지
9. Gate C가 모두 통과하면 중단하지 말고 기존 Gate D의 병합·production 배포·공개검색 재확인·OCR-off 제한 예약 활성화까지 계속한다.
10. 상세 GET 상한 내 대상이 없거나 수집 저장/DRY_RUN/canary 검증이 실패하면 policy·예약 disabled를 유지하고 정확한 실패 지점만 BLOCKED로 게시한다.

### 작업 3M ACL 재개 결과 — Gate B PASS / Gate C BLOCKED (2026-10-27 KST)

- 공동 문서5개 기준 `c303cd0b042bee1a526716726f18a924620b6369`, ACL 구현 [`da470fcde89624f0f09a4048ab6782a4e1786828`](https://github.com/MattewShin/sound-atlas/commit/da470fcde89624f0f09a4048ab6782a4e1786828). 기존 migration 1~3 재적용0. 원본main/HEAD·40파일/index/.env 보존.
- 두 text table의 과다 권한이 service_role 직접 ACL임을 READ ONLY로 확인했다. owner/superuser/상속 원인이 아니었다. 빈 DB용 원본 migration ACL1줄과 신규 `202610270001_program_text_analysis_acl.sql`만 수정/추가했다.
- 격리 PGlite: 빈 DB 전체6개 chain, 원본1~3→데이터 있는 upgrade, 보정2회차 불변을 검증했다. 신규2 + 기존 저장SQL4 = **6/6 PASS, fail0/skip0**. Gate A의 전체 npm test510/510·build PASS(4.66s)는 직전 수락 결과를 유지하며 이번에는 재실행하지 않았다.
- 운영 보정 migration1회 commit. service_role SELECT/INSERT/UPDATE만 true, DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN false. public/anon/authenticated 무권한·RLS=true. 두 테이블0행/digest, 기존 RPC 본문/signature/EXECUTE, 다른 ACL/default ACL/membership, v4 policy=false를 commit 전후 확인했다.
- 이어 migration4→5→6을 각각1회 적용하고 매번 SQL·REST/OpenAPI GET으로 COMPLETE를 확인했다. PostgreSQL17/18의 named NOT NULL 표현만 정규화했으며 column NOT NULL은 계속 검증했다.

| Gate B migration | 최종 상태 |
| --- | --- |
| 202610230002_kopis_detail_text.sql | COMPLETE — 기존 적용 유지 |
| 202610230003_program_analysis_v4.sql | COMPLETE — 기존 적용 유지 |
| 202610260001_program_text_analysis_v4.sql | COMPLETE — 신규 ACL 보정 후 SQL/REST 확인, 원본 재적용0 |
| 202610260002_program_text_status.sql | COMPLETE — 이번1회 적용 |
| 202610260003_program_text_confirmation.sql | COMPLETE — 이번1회 적용 |
| 202610260004_program_text_confirmation_status.sql | COMPLETE — 이번1회 적용 |

- **실패 Gate C / 2026-10-27 14:46:25 KST:** 전체47공연 중 공식 text/hash 저장0, 미래26공연 중 저장pair0, 적격 MATCHED+EXACT 공연0. `NO_STORED_OFFICIAL_PROGRAM_MATCHED_EXACT`. policy 활성화·DRY_RUN/SAVE canary·신규 CONFIRMED/REJECTED·canary 쓰기 모두0.
- 14:46:25 KST v4 policy=false, 14:46:50 KST 예약 Disabled/Enabled=false. 이번 Gate B REST GET10/POST0. KOPIS/OCR/수집·예약 강제 실행·action 변경0. Gate D·main 병합·production 배포·예약 활성화는 미실행.
- **재개점:** 저장된 공식 Program 원문/hash와 v4 MATCHED+EXACT가 있는 미래 공연을 준비한 뒤 Gate C 단건 DRY_RUN→SAVE→무쓰기 재실행→공개검색 검증부터 재개한다. 최초 공식 텍스트 적재의 허용 범위는 후속 명세에서 정한다. migration6개와 ACL 보정은 다시 적용하지 않는다. 모든 Gate가 통과하기 전에는 OPERATIONAL이 아니다.

### 작업 3M Gate B 권한 정비 재개 지시 / 완료

결과 SHA `115cedf8cf968c6121951c3a2bb821db674860d2`의 Gate A PASS와 Gate B 안전 중단을 수락한다. 이미 적용된 migration 1~3은 재적용하지 않는다.

#### 확정 원인과 수정 범위

`202610260001_program_text_analysis_v4.sql`은 두 테이블 생성 후 public/anon/authenticated의 권한만 제거하고 service_role에는 SELECT·INSERT·UPDATE를 grant했다. 운영 DB의 CREATE TABLE 기본 ACL로 service_role에 이미 부여된 DELETE가 명시적으로 회수되지 않아 남았다.

1. **미래의 빈 DB용 수정:** 기존 `202610260001_program_text_analysis_v4.sql`의 ACL 구문이 service_role의 기존 table privileges를 먼저 전부 REVOKE한 뒤 SELECT·INSERT·UPDATE만 다시 GRANT하도록 최소 수정한다. SQL 함수·테이블·검증 로직은 변경하지 않는다.
2. **이미 적용된 운영 DB용 보정:** 새 additive migration `202610270001_program_text_analysis_acl.sql`을 만든다. 대상은 아래 두 테이블로 한정한다.
   - `public.concert_program_text_analyses`
   - `public.concert_program_text_candidates`
3. 보정 SQL은 transaction 안에서 두 테이블에 대해 service_role의 table privileges를 REVOKE ALL 후 SELECT·INSERT·UPDATE만 GRANT한다. public/anon/authenticated의 ALL REVOKE와 RLS enabled를 재확인한다.
4. 전역 `ALTER DEFAULT PRIVILEGES`, role membership, 다른 table/function/schema 권한은 변경하지 않는다. 사전 조회에서 DELETE가 직접 ACL이 아니라 owner/superuser/상속 role 때문에 생긴 것으로 판명되면 부모 역할을 변경하지 말고 BLOCKED로 중단한다.
5. 신규 migration은 적용 전 빈 DB 전체 chain과 “원본 3개 적용 상태→ACL 보정” upgrade fixture 양쪽에서 검증한다. 보정 migration 2회차는 권한 변화 없이 성공하는 idempotent 계약이어야 한다.
6. 운영에는 신규 ACL 보정 migration만 한 번 적용한다. 이미 적용된 `202610260001`을 다시 실행하지 않는다.
7. 사후 기준:
   - service_role: SELECT/INSERT/UPDATE=true
   - service_role: DELETE/TRUNCATE/REFERENCES/TRIGGER=false
   - public/anon/authenticated: table privilege 없음
   - 두 테이블 RLS enabled
   - 기존 row 수·digest, RPC signature/EXECUTE, v4 policy disabled 상태 불변
8. 위 기준을 SQL과 REST GET으로 확인하면 세 번째 migration을 COMPLETE로 재판정하고, 기존 Gate B의 migration 4→6을 순서대로 적용한 뒤 Gate C→D를 계속한다.
9. 권한 정비 외 문제가 발생하거나 기존 데이터·함수·policy가 변하면 policy/예약 Disabled를 유지하고 해당 지점에서 BLOCKED로 종료한다.

### 작업 3M 재개 결과 — Gate B / BLOCKED (2026-10-27 KST)

- 기준 `facdd5cf95d3d746db19870f7fb301fc223fcf7f`, mock 수정 [`af7dca1d8ae7e95d829297c57ababab508866752`](https://github.com/MattewShin/sound-atlas/commit/af7dca1d8ae7e95d829297c57ababab508866752). production 검색 코드는 변경하지 않았다.
- **Gate A PASS:** 두 SQL suite2/2 → 영향107/107 → 전체 npm test510/510, fail0/skip0 → build PASS(4.66s). 직접 suite14개는 기본 runner에 각1회 포함된다.
- **Gate B BLOCKED:** 아래 순서1~3을 각각1회 적용·commit했다. 세 번째의 두 새 테이블은 `service_role.DELETE=true`로, 격리 기준false와 불일치한다. 권한을 임의 변경하거나 후속 migration을 적용하지 않았다.

| migration | 최종 판정 |
| --- | --- |
| 202610230002_kopis_detail_text.sql | COMPLETE(SQL/REST 확인) |
| 202610230003_program_analysis_v4.sql | COMPLETE(SQL/REST 확인) |
| 202610260001_program_text_analysis_v4.sql | INCOMPATIBLE — SQL commit 후 두 테이블 DELETE 권한 불일치 |
| 202610260002_program_text_status.sql | ABSENT |
| 202610260003_program_text_confirmation.sql | ABSENT |
| 202610260004_program_text_confirmation_status.sql | ABSENT |

- PostgreSQL17의20개 NOT NULL column은 실제 존재하며, PostgreSQL18의 named constraint 표현 차이와 실제 DELETE 권한 차이를 구분했다. 세 번째 REST 확인 전 중단했다.
- 2026-10-27 13:55:25 KST 예약 Disabled/Enabled=false, v4 policy enabled=false. 실패 보호 확인에서 추가 policy/예약 변경0. Gate B REST GET4/POST0; Gate C/D·canary·main 병합·배포·예약 활성화 미실행.
- **재개점:** 두 테이블(`concert_program_text_analyses`, `concert_program_text_candidates`)의 service_role DELETE 권한을 검토된 조치로 기준에 맞춘 뒤 PostgreSQL17에 맞는 SQL·REST 계약을 재검증한다. 이미 commit된 세 번째 migration은 재적용하지 않는다. COMPLETE 확인 후에만 Gate B 순서4→6, Gate C→D로 진행한다.
- 원본40파일/index/.env 및 production 검색 byte 보존. 적용된 additive schema/receipt 삭제 없이 BLOCKED를 게시하고 중단한다.

### 작업 3M 재개 지시 — Gate A의 mock 2건 수정 후 Gate B→D 계속 / READY

결과 SHA `cd757e27625a0d0ae9da5a4418dee63e2318650d`의 안전한 중단을 수락한다. 새 작업 번호를 만들지 않고 동일한 3M을 아래 지점에서 재개한다.

- 실패 원인은 production 검색 계약이 아니라 공용 `searchFixture`가 URL의 PostgREST 필터를 적용하지 않아, 실제 요청에서는 제외될 미확정·미연결·다른 track 행까지 반환한 것이다.
- production `supabaseConcertSearch.mjs`의 완전조회·재조회·source 우선·fail-closed 계약은 변경하거나 완화하지 않는다.
- `server/testSupport/searchFixture.mjs`가 status 행의 `track_id/work_id`, matcher/status/relation/outcome, boolean, null/hash 조건과 embedded concert의 날짜·상태·지역 조건을 실제 요청대로 적용한 뒤 keyset·정확한 `Content-Range`를 계산하게 최소 수정한다.
- 먼저 실패한 `programWorkIdentitySql.test.mjs`와 `programAutomationSql.test.mjs`만 확인한다. 통과하면 Gate A 영향 테스트를 실행하고, 이어 기본 runner의 전체 `npm test` fail0/skip0과 build를 확인한다.
- Gate A가 통과하면 멈추지 말고 기존 CURRENT_TASK의 Gate B→C→D를 그대로 계속한다. migration·canary·배포·예약 조건을 축소하거나 새로 해석하지 않는다.
- 두 mock 수정 외 새로운 production 변경이 필요하거나 어느 Gate든 실패하면 그 지점에서만 BLOCKED로 종료한다.

### 작업 3M 중단 — Gate A / BLOCKED (2026-10-27 KST)

- 기준 `9a4eec3acafa35d16ff423961239ba4ba9d88517`, Gate A 작업 코드 [`2adb97edd60df7a53841beae4c75c9007c1aa48f`](https://github.com/MattewShin/sound-atlas/commit/2adb97edd60df7a53841beae4c75c9007c1aa48f).
- 영향 테스트 **107개:105 PASS /2 FAIL /skip0**. 실패: `server/programWorkIdentitySql.test.mjs`, `server/programAutomationSql.test.mjs`의 검색 검증 `DB_SEARCH_UNAVAILABLE`.
- 전체 `npm test`·build와 Gate B→D는 미실행. 운영 migration/canary/main 병합/production 배포/예약 활성화0.
- 예약은2026-10-27 13:35:45 KST **Disabled/Enabled=false**. 별도 최소 READ ONLY 확인에서 v4 policy 행 없음(비활성); policy 변경0. 원본40파일/index/.env 보존.
- **재개점:** Gate A의 위2개 SQL 검색 mock 응답 계약을 수정·확인한 뒤 영향 테스트 → 전체 npm test fail0/skip0 → production build. 그 전에는 Gate B로 진행하지 않는다. 기본 OFF 예약 연결과 미통과 Gate A 변경은 검토용이며 운영 준비 완료가 아니다.

### Gate A — 잔여 회귀와 최소 예약 연결

1. 3K에 남은 기존 실패를 다시 장시간 조사하지 말고 기록된 분류대로 수정한다.
   - search mock: 공식 status/source 재조회, 정확한 `Content-Range`
   - v3 SQL fixture: 명시적 v3 payload와 재계산 hash
   - v4 pipeline fixture: v4 RPC와 정확히 한 행의 enabled policy
2. 3J supplemental 13개와 3L 신규 source-version suite를 `scripts/test.mjs`에 한 번씩만 편입한다.
3. 기존 단건 coordinator를 예약 경로에 최소 연결한다. 별도 명시적 switch는 기본 false로 두고, 켜졌을 때 공식 `KOPIS_DETAIL_TEXT` 대상 중 한 공연만 선택해 coordinator를 한 번 호출한다. 한 실행당 신규 CONFIRMED는 기존 coordinator 상한인 최대 1건이다.
4. OCR source와 NONE은 이 예약 경로에서 처리하지 않는다. OCR fallback·REJECTED 생성·전체 backfill·rematch는 실행하지 않는다.
5. 영향 테스트 후 전체 `npm test` 한 번과 production build 한 번을 실행한다. 하나라도 fail/skip이면 이후 운영 Gate를 실행하지 않는다.
6. 구현·test·runner·필수 설정 문서 외의 리팩터링, dependency/lock 변경은 금지한다.

### Gate B — 운영 migration 적용

Gate A 통과 후 `CLASSIC_ATLAS_DATABASE_URL`을 사용한 관리자 read-only preflight로 아래 6개를 다시 판정한다.

1. `202610230002_kopis_detail_text.sql`
2. `202610230003_program_analysis_v4.sql`
3. `202610260001_program_text_analysis_v4.sql`
4. `202610260002_program_text_status.sql`
5. `202610260003_program_text_confirmation.sql`
6. `202610260004_program_text_confirmation_status.sql`

- 각 항목이 ABSENT 또는 COMPLETE일 때만 진행한다. PARTIAL/INCOMPATIBLE이면 적용하지 않고 BLOCKED.
- ABSENT만 위 순서로 각 migration 전체를 한 번씩 적용하고 매번 관리자 SQL과 REST/OpenAPI GET으로 COMPLETE를 확인한다.
- 연결 문자열·host·user·비밀번호·운영 원문은 출력하거나 Git에 기록하지 않는다.
- v4 policy는 canary 직전까지 disabled로 유지한다.

### Gate C — 공식 텍스트 단건 canary

1. 미래 공연이며 공식 Program 원문/hash가 저장되고, v4에서 `MATCHED + EXACT`인 등록곡이 있는 대상 한 건만 선택한다. 후보가 없으면 임의로 OCR을 사용하지 말고 BLOCKED.
2. policy를 정확히 한 행 `enabled=true`로 전환한 뒤 동일 대상에 `DRY_RUN → SAVE` 순서로 실행한다.
3. 신규 CONFIRMED는 최대 1건, REJECTED 0건이어야 한다. 예상 밖 후보·기존 receipt 변경·두 번째 확정·오류가 있으면 즉시 policy를 disabled로 되돌리고 중단한다.
4. 같은 입력을 즉시 다시 실행해 신규 DB 쓰기 0을 확인한다.
5. 해당 track의 공개 검색 API에서 canary 공연이 `EXACT + CONFIRMED`로 노출되고 기존 쇼팽·리스트·브람스 연결이 유지되는지 확인한다. 원문·evidence 본문은 결과 문서에 적지 않는다.

### Gate D — 배포와 제한 예약 활성화

Gate C 통과 후에만 진행한다.

1. 최종 코드 SHA로 versioned release 디렉터리를 만들고 원본 로컬 40개 변경·index·`.env`를 보존한다.
2. main 반영 전 비교에서 이번 명세 외 예상하지 않은 파일이 없고 CI/build/canary가 모두 통과한 경우에만 PR을 생성·병합하고 production 배포 상태를 확인한다. 권한·충돌·배포 실패 시 병합을 우회하지 말고 예약 Disabled로 BLOCKED.
3. production 공개 검색에서 canary 공연이 다시 확인된 뒤 예약 action을 검증된 release로 전환한다.
4. 실제 운영 설정은 다음으로 고정한다.
   - collection=true
   - 공식 Program 단건 처리=true
   - OCR=false
   - 기존 OCR 분석/자동판정=false
   - cleanup=false
   - 공연 1건/신규 CONFIRMED 최대 1건/실행
   - 기존 daily 08:40 KST·IgnoreNew·시간 제한 유지
5. 예약을 Enabled로 전환한 뒤 등록 action·설정·다음 실행 시각만 읽기 확인한다. 즉시 전체 batch를 수동 실행하지 않는다.
6. rollback은 예약 Disabled → v4 policy disabled → 예약 action을 이전 값으로 복원하는 순서로 준비한다. 이미 정확히 생성된 canary receipt나 additive migration을 임의 삭제하지 않는다.

### 최종 보고 제한

- 이전 3A~3L 내용을 다시 길게 요약하지 않는다.
- 변경 파일, 전체 test/build 수치, migration 6개 상태, canary KOPIS ID/track ID와 신규 쓰기 수, 공개 검색 결과, 배포 SHA, 예약 상태·다음 실행 시각, rollback 준비 여부만 간결하게 기록한다.
- 자격증명·운영 원문·후보 전체 목록은 기록하지 않는다.
- 모든 Gate가 통과하면 `OPERATIONAL`; 그렇지 않으면 실패 Gate와 재개점만 적어 `BLOCKED`로 게시하고 추가 작업 없이 중단한다.

## 명세 4 작업 3L — legacy source 읽기와 v4 신규 쓰기 계약 분리 / IMPLEMENTED

작업 3K 결과 SHA `e55144b0b9b91ae750e480923d1b22adbc03d0d2`를 **BLOCKED 결과로 수락**한다. 103개 영향 테스트에서 21개 실패를 재현했고, production·test·runner 및 운영 상태를 변경하지 않은 중단 절차가 정확하다.

3B에서 확정한 계약은 “신규 구현·write는 v4, 기존 v2/v3 상세·receipt 읽기는 유지”다. 그런데 현재 identity backfill과 rematch는 legacy source의 버전을 현재 write 버전과 직접 비교해 v3만 배제한다. 이번 작업은 **입력 source의 지원 버전과 신규 출력/write 버전을 분리**하는 최소 production 수정만 수행한다. 3K의 나머지 fixture 정비와 runner 편입은 하지 않는다.

### 확정 정책

- 신규 분석·후보 생성·저장 버전은 계속 `stored-program-4`만 허용한다. v3 write 또는 v4 결과의 v3 재라벨링은 금지한다.
- 이미 저장된 `stored-program-2`·`stored-program-3` 근거는 source provenance를 보존한 채 읽기·identity backfill 입력으로 사용할 수 있다. 기존 evidence/currentness/pipeline/catalog/Git/identity/공연기간 검증을 모두 통과해야 한다.
- rematch는 지원되는 legacy source를 읽을 수 있지만 새 후보는 항상 현재 v4로 생성하며 `REVIEW_REQUIRED`로 남긴다. 저장 시 v4 전용 RPC·enabled policy 검증을 그대로 거친다.
- 알 수 없는 버전과 누락 버전은 fail-closed로 제외한다.

### 허용 범위

1. source read/backfill 지원 버전과 current write/output 버전을 명시적으로 분리한다. 중복 문자열을 흩뿌리지 말고 한 곳의 상수 또는 작은 helper로 표현한다.
2. `planIdentityBackfill`이 유효한 v2·v3·v4 source를 동일한 기존 안전 조건 아래 평가하도록 수정한다. 버전 이외의 검증 순서·사유는 완화하지 않는다.
3. `rematchProgramCandidates`에서 source matcher 검증과 output version 검증을 분리한다. 호출자가 선택할 수 있는 output/write는 계속 현재 v4 하나뿐이며, 생성 candidate의 `generation_version`도 v4여야 한다.
4. 기존 PF295548 v3 identity 양성, v2/v4 control, unknown-version 음성, legacy source→v4 rematch, v3 output/write 거부를 직접 테스트한다.
5. 직접 관련 테스트만 실행해 fail 0·skip 0을 확인한다. 3K의 나머지 19개 예상 실패를 고치거나 전체 `npm test`를 실행하지 않는다.
6. 변경 파일은 version 계약 production 모듈과 직접 관련 test로 제한한다. migration·SQL·search adapter·pipeline coordinator·runner는 변경하지 않는다.

### 금지 및 중단 조건

- public search 기본 v2, review 기본 v3, write v4, schedule disabled 역할을 변경하지 않는다.
- matcher 판정, source 우선순위, receipt 유효성, policy/RPC gate, ACL/RLS, pagination fail-closed를 완화하지 않는다.
- 운영 DB/REST/KOPIS/OCR 호출·쓰기, migration 적용, policy/예약/배포/병합 변경을 하지 않는다.
- legacy source를 현재 버전으로 덮어쓰거나 기존 receipt를 재확정하지 않는다.
- 위 최소 분리 외 production 변경이 필요하거나 직접 테스트가 하나라도 실패하면 BLOCKED로 게시하고 중단한다.

### 작업 3L 구현 결과 — 2026-10-27 KST / IMPLEMENTED

- 공동 문서5개/코드 시작 기준 `2a8cbe7a71b1c61027da1eaeed276130ec4b2903`, 구현 SHA [`78db45b77667634acf372a28e991344c66dbaa83`](https://github.com/MattewShin/sound-atlas/commit/78db45b77667634acf372a28e991344c66dbaa83). legacy source read/backfill 지원 버전(v2·v3·v4)을 공통 상수/helper로 정의하고 current output/write v4와 분리했다.
- identity backfill의 버전 gate만 교체했다. 기존 PF295548 v3 양성·v2/v4 control은 적격이며 unknown/누락 버전은 거부한다. evidence/currentness/pipeline/catalog/Git/identity/기간·review 검증과 순서를 유지한다.
- rematch adapter는 지원 source 버전을 모두 GET하고, orchestration은 원본 matcher/evidence를 유지하며 새 후보를 v4/REVIEW_REQUIRED로만 생성한다. 결과에 source_matcher_version을 별도로 기록한다. v2/v3 output은 builder/실행기에서 거부하며 v3 결과를 v4로 재라벨링하지 않는다.
- SAVE 시작부터 기존 v4 전용 RPC·enabled policy preflight를 요구한다. 기존 v2/v3·버전 없는 rematch ID를 v4 결과로 재사용하지 않고, 명시적 v4 generation/snapshot만 재사용한다. 기존 receipt 재확정0.
- 직접 관련3파일: `node --test server/programWorkIdentity.test.mjs server/programSourceVersion.test.mjs server/programVersion.test.mjs` → **53/53 PASS, fail0/skip0/cancel0**, exit0. 실제 운영이 아닌 순수 함수/모의 store·REST 검증이다.
- production4파일/test2파일 변경. migration/SQL/search adapter/pipeline coordinator/runner/dependency 변경0. 원본main/HEAD·40파일/index/.env 보존, 관련 없는301파일 byte 동일. 운영 호출·쓰기·policy/예약/환경/배포·병합0.
- 작업3K의 다른19개 예상 실패 정비·13개 runner 편입·전체 npm test/build는 시작하지 않았다. 통합release 통과/운영 적용 완료를 뜻하지 않는다. CURRENT_TASK/HANDOFF에 기록하고 같은 브랜치 게시 후 중단한다.

### 완료 보고

변경 파일, source별 허용/거부 결과, output version, 직접 테스트 수치와 운영 호출 0을 CURRENT_TASK·HANDOFF에 기록하고 같은 브랜치에 게시한 뒤 중단한다. 3K 재개는 웹 GPT의 후속 검토 전 시작하지 않는다.

## 명세 4 작업 3K — v4 전환 통합 회귀 정비 / BLOCKED

작업 3J 결과 SHA `78985de7a836ddf43d48863f44067f076421af25`를 **BLOCKED 결과로 수락**한다. release snapshot·build·격리 migration chain·운영 read-only preflight는 정상이나 전체 `npm test` 408개 중 21개가 실패했으므로 운영 적용은 계속 금지한다. 운영 6개 migration은 모두 ABSENT이고 PARTIAL/INCOMPATIBLE은 없으며 예약은 Disabled다.

실패는 신규 검색의 완전조회 계약을 반영하지 않은 mock과, v4 분석을 v3 RPC fixture에 암묵적으로 전달한 기존 테스트가 주된 원인으로 보인다. 이번 작업은 **운영 코드를 느슨하게 하거나 v4를 되돌리지 않고 테스트 fixture와 기본 test runner만 현재 계약에 맞게 정비**한다. 실제 운영 코드 수정이 필요하다고 판명되면 수정하지 말고 BLOCKED로 중단한다.

### 작업 3K 조사 결과 — 2026-10-27 KST / BLOCKED

- 공동 문서5개·release 코드 기준: `80418afd3c01e2b3a9b5c2ec664c486798837849`. 별도 detached snapshot에서 원본main/HEAD·기존40파일/index/.env를 보존했다. production/server/src/migration·test/fixture·runner 변경0이다.
- 3J 실패가 있는 파일은 명세의9개와 달리 실제 **10개**다. 해당10파일을 수정 전 한 번 실행해 **103개 중82PASS/21FAIL/skip0**을 재현했다. 검색 mock3건, v3 SQL fixture12건, legacy rematch/backfill2건, v4 pipeline mock/기대4건으로 분류했다.
- **중단 근거:** `programWorkIdentity.test.mjs`의 PF295548 legacy v3 양성 검증은 현재 `planIdentityBackfill` production 버전 gate와 충돌한다. 동일한 유효 fixture의 matcher만2/3/4로 비교하면 eligible=1/0/1이며 v3만 MATCHER_VERSION_CHANGED다. 이 fixture는 v4 기본 분석 payload를 잘못 넘긴 경우가 아니므로 v3 명시·payload 재계산으로 해결되지 않는다.
- production `programIdentityBackfill.mjs:36`은 [stored-program-2,MATCHER_VERSION]만 허용하고 현재 MATCHER_VERSION=stored-program-4다. rematch도 v3 source를 기본 실행에서 skip하고 explicit v3는 WRITE_VERSION_NOT_IMPLEMENTED로 거부한다. v3 positive를 v2/v4로 바꾸거나 거부를 기대하도록 뒤집어 통과시키지 않았다.
- 사용자의 “production 코드 수정이 필요하면 수정하지 말고 BLOCKED” 및 본 명세의 중단 조건에 따라 test/fixture 수정·13개 runner 편입에 들어가기 전에 중단했다. **최종 전체 npm test는 미실행**이며 fail0/skip0 달성을 주장하지 않는다. build도 재실행하지 않았다. production 포함306개 비공동문서 파일은3J byte hash와 동일하므로3J build PASS만 인용한다.
- 운영DB/REST/KOPIS/OCR·migration/DDL/DML/POST·policy/예약/환경/배포/병합 변경0. 이번 예약 상태 재조회0이며 Disabled는3J 당시 확인값이다. 버전 gate의 지원범위/별도 수정 명세 검토가 필요하다. 자세한 재현과 영향은 HANDOFF 최신3K 결과에 기록하고 같은 브랜치 게시 후 중단한다.

### 허용 범위

1. 3J의 실패 21건을 해당 9개 test 파일 단위로 먼저 재현하고 아래 범주로 확정한다.
   - 검색 mock의 신규 공식 status/source 재조회·정확한 `Content-Range` 계약 누락
   - v4 기본 분석 payload를 v3 전용 SQL/RPC에 넣은 fixture 버전 불일치
   - pipeline mock의 v4 RPC·명시적 enabled policy 계약 누락
   - legacy v3 rematch/identity 검증에 v4 candidate를 사용한 fixture 불일치
2. 검색 관련 테스트는 production 검색 코드를 완화하지 않는다. mock이 OCR status와 공식 confirmation status, concert source/context GET, 재조회, `Prefer: count=exact`와 정확한 `Content-Range`를 실제 계약대로 반환하도록 수정한다.
3. v3 보존을 검증하는 SQL/identity/automation 테스트는 분석·candidate의 matcher/generation version을 명시적으로 `stored-program-3`으로 만들고 payload hash를 다시 계산한다. v3 RPC가 v4 payload를 허용하도록 SQL이나 production validator를 완화하지 않는다.
4. 현재 v4 pipeline을 검증하는 테스트는 v4 save RPC path, v4 policy 정확한 1행 `enabled=true`, 현재 matcher/version 기대값을 명시한다. migration/policy 부재·disabled를 검증하는 음성 테스트는 계속 실패하도록 보존한다.
5. 기존 v2 검색, v3 review/history, v4 공식 분석·확정의 역할 분리는 유지한다. searchVersion 기본 v2, reviewVersion 기본 v3, writeVersion v4와 schedule disabled 기본값을 바꾸지 않는다.
6. 3J에서 기본 `npm test`에 누락된 직접 테스트 13개를 `scripts/test.mjs`의 명시적 import 목록에 한 번만 포함한다. 중복 import·중복 실행이 없어야 한다.
7. 수정 가능 파일은 실패한 test/fixture와 `scripts/test.mjs`로 제한한다. production `server/*.mjs`, `src` 구현, migration SQL은 변경하지 않는다.
8. 먼저 영향받은 test 파일만 실행해 원인을 확인한 뒤, 최종 고정 snapshot에서 전체 `npm test`를 한 번 실행한다. 최종 기준은 fail0/skip0이며 새로 편입한 13개 직접 suite도 같은 runner 결과에 포함되어야 한다.
9. production source가 byte 단위로 동일하면 build는 재실행하지 않고 3J의 PASS를 그대로 인용한다. production source 변경이 불가피하면 이번 작업에서 변경하지 말고 원인과 필요한 별도 명세를 기록해 BLOCKED로 끝낸다.

### 제한

- 테스트 통과를 위해 matcher/version/policy/source 우선순위, eligibility, ACL/RLS, pagination fail-closed를 완화하지 않는다.
- production 코드·migration·package dependency/lock을 수정하지 않는다.
- 운영 DB/REST/KOPIS/OCR 호출, migration·DDL/DML·POST, policy/예약/환경/배포·병합 변경을 하지 않는다.
- 기존 3A~3I 직접 테스트의 기대 결과를 약화하거나 삭제하지 않는다.
- 관계없는 테스트 포맷 정리·리팩터링을 하지 않는다.
- 최종 전체 테스트가 하나라도 실패하면 BLOCKED로 게시하고 운영 적용으로 넘어가지 않는다.
- 결과를 같은 브랜치의 공동 문서에 게시하고 중단한다.

## 명세 4 작업 3J — 통합 회귀·운영 읽기 전용 preflight / BLOCKED

작업 3I 결과 SHA `ef09461350ca0bb5ff03952f9f461ae91c3af661`와 구현 SHA `e89f98a0b2380948dd747fc80dd1192424c73c31`를 **ACCEPTED**한다. DRY_RUN 무쓰기, SAVE 전 전체 prerequisite 확인, 공식 source 전용 처리, 기존 receipt 재확정 차단, 신규 confirmation 최대 1회 고정과 격리 14/14 검증을 확인했다.

이번 작업은 새 기능을 추가하지 않고 **3A~3I 전체를 하나의 release 후보로 검증하고, 운영 DB가 어떤 migration 상태인지 읽기 전용으로 판정**한다. 운영 적용 순서와 공연 1건 canary 대상을 확정하되 migration 적용·policy 활성화·POST는 다음 작업으로 남긴다.

### 작업 3J 검증 결과 — 2026-10-27 KST / BLOCKED

- 공동 문서5개와 release 기준 SHA: `8c32de828c458d4fc288103f5ee3cea848a0231a`. 3A~3I 구현9커밋을 포함한 전체308파일 snapshot의 Git blob/sha256·누락/중복/추가0을 확인했고 검증 후308파일 hash도 모두 같다. [release manifest](docs/collaboration/CA-AUTO-20261022-001/SPEC4_TASK3J_RELEASE_MANIFEST.json)에 전체 경로/hash와 단계별 구현 SHA를 게시한다.
- 전체 `npm test`: **408개 중387 PASS /21 FAIL**, skip0. 실패를 수정·재실행하지 않았다. 기본 test에 빠진 직접 테스트13파일은 한 번 추가 실행하여 **83/83 PASS**, 실패/skip0이다. production build는 **PASS**(npm exit0, Vite6.4.3,56 modules,7.08s); JS613.88kB의 기존 chunk>500kB 경고가 있다.
- 새 빈 disposable PostgreSQL18.4에서 선행6파일 후 지정6개 migration을 각각1회/지정 순서로 적용했다. RPC signature/ACL, RLS, view security_invoker, 기본v4 enabled=false, 기존OCR schema/fixture rows 불변, coordinator DRY_RUN GET1/POST0을 확인했다. 격리 DB는 종료했다.
- 운영 관리자 연결 존재·성공, `BEGIN READ ONLY`/`transaction_read_only=on`/ROLLBACK 확인. 지정6개 migration은 **모두 ABSENT**다. 기존 sync 함수는 CRLF 정규화 후 선행본문·서명·권한과 일치하고 공식 텍스트 컬럼/constraint가 없다. PARTIAL/INCOMPATIBLE0. v4 policy 행 없음(활성 상태로 취급하지 않음).
- 운영 REST/OpenAPI **GET9/POST0**: OpenAPI200, 기존sync만 노출, 신규3RPC·3view 비노출. source column GET400/42703, 신규3table·3view GET404/PGRST205, v4 policy GET200/빈배열. SQL 판정과 REST 비노출을 구분했다. anon key 미설정으로 anon HTTP probe 미실행이며 권한 우회를 하지 않았다.
- 2026-10-27 08:34:39 KST 예약 읽기: `ClassicAtlas-LocalPipeline` State=Disabled/Enabled=false. 공식 원문/hash 저장 계약 미준비로 운영 canary **미선정/미실행**이다. 운영DDL/DML/migration/POST·KOPIS/OCR·batch/예약 실행·변경·배포·병합0.
- 원본main/HEAD `1607ca201c3a559bc7f28aabe998ef062db02ef9`, 기존40파일/index/.env 보존. 구현/migration/test 변경0. **전체 회귀21실패로 release BLOCKED**이며 개별3A~3I 수락을 통합release 통과로 대체하지 않는다. 실패 목록·후속 조건부 적용/rollback 순서·구현자 의견은 HANDOFF 최신3J 결과를 참조한다. 결과 문서 게시 후 중단한다.

### 허용 범위

1. 원본 로컬 변경·index·`.env`를 보존한 격리 release snapshot에서 현재 브랜치의 3A~3I 구현을 모두 포함했는지 파일·commit manifest를 만든다. 누락·중복·예상 밖 파일이 있으면 중단한다.
2. release snapshot에서 전체 `npm test`와 production build를 실행한다. 3A~3I 직접 테스트가 기본 test에 포함되지 않으면 해당 테스트만 추가로 한 번 실행하고 중복 재실행하지 않는다.
3. 빈 disposable PostgreSQL에 선행 schema부터 다음 migration을 정확한 순서로 한 번 적용해 통합 검증한다.
   - `202610230002_kopis_detail_text.sql`
   - `202610230003_program_analysis_v4.sql`
   - `202610260001_program_text_analysis_v4.sql`
   - `202610260002_program_text_status.sql`
   - `202610260003_program_text_confirmation.sql`
   - `202610260004_program_text_confirmation_status.sql`
4. 격리 DB에서 RPC signature·ACL/RLS·view security_invoker·기본 v4 policy disabled·기존 OCR schema/data 보존과 coordinator DRY_RUN POST0을 확인한다. 테스트 fixture 외의 CONFIRMED/REJECTED는 만들지 않는다.
5. 로컬에 설정된 `CLASSIC_ATLAS_DATABASE_URL`을 사용할 수 있으면 운영 관리자 **READ ONLY transaction**으로 위 6개 migration의 object/column/function/view/policy 상태를 조회한다. 연결 문자열·host·user·비밀번호·원문은 출력하거나 문서에 기록하지 않는다.
6. 운영 상태를 각 migration별 `ABSENT | COMPLETE | PARTIAL | INCOMPATIBLE`로 판정한다. PARTIAL/INCOMPATIBLE이면 적용 계획을 만들지 말고 BLOCKED로 끝낸다.
7. 운영 REST/OpenAPI도 GET만 사용해 필요한 column/view/RPC 노출 여부와 권한 응답을 확인한다. 404를 migration 부재의 유일한 근거로 사용하지 않고 관리자 SQL 결과와 구분한다.
8. 공식 Program 원문/hash가 이미 운영에 저장되어 있고 읽기 계약이 가능할 때만 coordinator `DRY_RUN`을 공연 한 건에 실행한다. 후보 원문·곡명·evidence는 게시하지 않고 concert UUID/KOPIS ID, source/payload hash, 후보·outcome/reason 집계만 기록한다. 조건이 없으면 canary 대상 미선정으로 명시한다.
9. 최종 보고에는 전체 test/build, 격리 migration chain, 운영 6개 migration 상태, v4 policy/예약의 읽기 상태, GET/POST 수, canary 대상과 다음 작업의 정확한 적용·rollback 순서를 짧게 기록한다.

### 제한

- 구현 코드·migration·테스트를 수정하지 않는다. 검증 실패를 이번 작업에서 고치지 말고 BLOCKED로 보고한다.
- 운영 migration 적용·DDL/DML, policy 활성화, 분석/receipt/CONFIRMED/REJECTED 쓰기와 모든 POST를 금지한다.
- KOPIS/OCR/API 수집, 이미지 다운로드, batch/queue/예약 실행·수정, 배포·브랜치 병합을 하지 않는다.
- 운영 원문·후보 상세·자격증명·환경값을 공동 문서나 로그에 남기지 않는다.
- 이미 통과한 개별 테스트를 불필요하게 반복하지 않는다.
- 결과를 같은 브랜치의 공동 문서에 게시하고 운영 적용 없이 중단한다.

## 명세 4 작업 3I — 공식 Program 단일 공연 제한 실행기 / IMPLEMENTED

작업 3H 결과 SHA `48b9667d0f90223b0bccf5723ddfb80c92dc9590`와 구현 SHA `6964e88ec0dac047dc60f605c03316d2576308da`를 **ACCEPTED**한다. 공식 receipt의 live 유효성 재검증, 공식 Program 선택 공연의 OCR 대체 노출 차단, 기존 검색 DTO 유지와 격리 14/14 검증을 확인했다.

이번 작업은 이미 구현된 공식 텍스트 source 선택·분석·저장·계획·단건 확정을 새 판정 규칙 없이 조합해, **공연 ID 한 건과 회당 신규 확정 최대 1건만 처리하는 제한 실행기**를 만든다. 아직 운영 배치나 예약에는 연결하지 않는다.

### 작업 3I 구현 결과

- 공동 문서 기준 `44c960966db397187e457784dd679c10f2100eea`, 구현 코드 `e89f98a0b2380948dd747fc80dd1192424c73c31`. `createProgramTextCoordinator(...).run({concert_id,mode})`를 서버 내부용으로 추가했다. 정확한 UUID 한 건과 DRY_RUN/SAVE 두 필드만 허용하며 기존 부품을 그대로 조합한다.
- 공식 source만 기존 분석/payload builder로 처리한다. DRY_RUN은 source/payload hash·후보 수·outcome/reason 집계만 반환하고 POST0이다. OCR/NONE은 SKIPPED이며 OCR endpoint/matcher/review 호출0이다.
- SAVE는 기존3E/3G preflight와3F/3H view 존재·GET probe 및 명시적 v4 policy를 첫 POST 전에 모두 확인한다. 기존3E 저장 후3F plan을 동일 분석/source/hash에 묶고3H receipt를 읽어 ALREADY_CONFIRMED/HOLD_EXISTING_RECEIPT를 구분한다.
- 새 planning-ready 후보만 UUID 순으로 고르며 confirmation은 한 호출당 최대1 POST다. 환경/입력으로 확대할 수 없고 confirmation HTTP/네트워크/응답 실패도 재전송·다른 후보·OCR/v3 fallback 없이 즉시 중단한다. 남은 후보는 pending이며 REJECTED는 만들지 않는다.
- mock9 + PGlite coordinator SQL5, **14/14 PASS**, 실패/skip0. DRY_RUN·preflight 무쓰기, SAVE 순서/상한, 단일 후보 재실행 무증가, stale receipt hold, 응답 유실 후 기존 receipt 재발견, 원문 비노출을 확인했다.
- 신규 구현·테스트3파일, migration0. 기존3A~3H source 및 로컬40개 변경/index/.env를 보존했다. 운영 적용/호출/쓰기·batch/queue/예약/pipeline/UI/API 연결·policy/환경/배포/병합 변경0, 선행 suite·전체 회귀/build 재실행0이다. 2026-10-26 KST **작업3I IMPLEMENTED**로 같은 브랜치에 게시하고 중단한다.

### 허용 범위

1. 서버 내부용 coordinator를 새 파일로 추가한다. 입력은 정확한 `concert_id`, 실행 모드 `DRY_RUN | SAVE`이며 한 호출에서 공연 한 건만 허용한다.
2. SAVE의 첫 POST 전에 기존 3E 저장 RPC, 3F status view, 3G 확인 RPC, 3H confirmation status view와 v4 policy enabled=true를 모두 preflight한다. 하나라도 부재·비활성이면 분석·receipt·REJECTED 쓰기 0으로 중단한다.
3. concert를 GET해 기존 `routeProgramSource`를 그대로 사용한다. `KOPIS_DETAIL_TEXT`만 처리하며 OCR 또는 NONE이면 명확한 SKIPPED 결과로 끝내고 OCR endpoint·matcher·review 경로를 호출하지 않는다.
4. 공식 source는 기존 `analyzeSelectedProgramSource`와 `buildProgramTextAnalysisPayload`만 사용한다. 새 정규화·matcher·eligibility 규칙을 만들지 않는다.
5. DRY_RUN은 분석 결과의 source hash·payload hash·후보 수와 outcome/reason 집계만 반환하고 POST를 한 번도 하지 않는다. 원문·quote·snapshot·비밀값은 반환·로그하지 않는다.
6. SAVE는 기존 3E adapter로 분석을 저장한 뒤 3F reader로 동일 source/hash의 현재 plan을 다시 읽는다. 공식이 아니거나 pending/stale/policy disabled이면 confirmation을 호출하지 않는다.
7. 기존 3H confirmation status를 읽어 이미 receipt가 있는 후보를 구분한다. effective receipt는 `ALREADY_CONFIRMED`, stale/invalid receipt는 `HOLD_EXISTING_RECEIPT`로 두며 재확정하거나 새 receipt를 만들지 않는다.
8. 새 `planning_ready=true` 후보만 candidate UUID 오름차순으로 처리하고, 한 호출에서 기존 3G 단건 RPC 호출은 **최대 1회**다. 나머지는 pending 수로 보고한다. 이 상한은 환경값이나 입력으로 확대할 수 없게 고정한다.
9. confirmation 실패 시 즉시 중단하며 다른 후보, OCR/v3, review RPC로 fallback하지 않는다. 어떤 경로에서도 REJECTED를 생성하지 않는다.
10. 결과는 mode/source/reason, 분석 ID·hash, 전체/ready/already/hold/pending 수, 새 receipt ID 최대 1개만 포함한다. 원문·evidence·identity snapshot은 포함하지 않는다.
11. mock/격리 테스트로 DRY_RUN POST0, migration/policy preflight 실패 POST0, official-only, SAVE 순서, 신규 확정 최대1, 재실행 무증가, stale receipt hold, 실패 즉시 중단, 원문 비노출을 확인한다.

### 제한

- 구현·테스트 파일은 가능하면 3개 이하로 하고 새 migration은 만들지 않는다.
- 3A~3H 기존 구현과 검색·OCR 계약을 수정하지 않는다.
- 운영 migration 적용, 운영 DB/KOPIS/OCR/API 호출, 실제 분석·receipt·CONFIRMED/REJECTED 쓰기를 하지 않는다.
- batch/queue/예약/기존 pipeline·UI·API route에 연결하지 않는다.
- policy 활성화, 환경·배포·브랜치 병합을 하지 않는다.
- 전체 회귀/build 없이 coordinator 직접 관련 테스트만 실행한다.
- 결과를 같은 브랜치의 공동 문서에 게시하고 후속 운영 적용 없이 중단한다.

## 명세 4 작업 3H — 공식 텍스트 확정의 유효 상태·공연 검색 연결 / IMPLEMENTED

작업 3G 결과 SHA `b72eeb80e56bbce6fd6be5c1258d79fce498f8b7`와 구현 SHA `905021d2f7698e732a25f3bf1ac25bf16d39dfb7`를 **ACCEPTED**한다. 단건 RPC가 policy → concert → analysis → candidates 순서로 잠그고 현재 원문·context·snapshot·catalog·eligibility를 재검증하며, 적격 후보에만 append-only CONFIRMED receipt를 만들고 부적격 후보에는 REJECTED도 만들지 않는 계약과 격리 12/12 검증을 확인했다.

이번 작업은 공식 텍스트 receipt 자체를 영구적인 검색 권한으로 신뢰하지 않고, **현재도 유효한 공식 확정만 기존 공연 검색 결과에 읽기 전용으로 합치는 단계**다. 외부 검색 응답 형식과 기존 OCR 확정 데이터는 유지하며 공식 Program이 선택되는 공연에서는 OCR 결과가 대신 노출되지 않게 한다.

### 작업 3H 구현 결과

- 공동 문서 기준 `5b1ba8264d3057b2e2b53b16f2f7ad13ed25f7d6`, 구현 코드 `6964e88ec0dac047dc60f605c03316d2576308da`. additive `concert_program_text_confirmation_status`와 기존 Supabase 공연 검색의 읽기 전용 병합을 구현했다. 원문·quote·identity snapshot은 신규 view/검색 응답에 노출하지 않는다.
- view가 현재 source/context·saved-current·analysis/candidate/evidence/catalog/work identity·receipt verification hash·안전한 후보 scope/reason/중복 부재·명시적 v4 policy를 재검증한다. 불일치는 receipt/후보를 수정하지 않고 false와 stale reasons로 표시한다.
- 서버 내부에서 현재 공식 원문을 router로 판정해 공식 Program 선택 공연의 OCR을 억제한다. 공식 receipt 부재/stale에도 OCR fallback하지 않으며 유효 공식 결과를 우선해 같은 KOPIS/곡1건으로 합친다. 기본 OCR 검색 버전·외부 DTO·정렬·날짜/지역/상태 경계는 유지했다.
- exact Content-Range/count와 keyset pagination(페이지100/상한50)을 확인하고, 반환 전 status/source/context를 재조회한다. 신규 view 부재·잘못된 형식·부분 페이지·읽기 한도·관측된 상태 변경은 전체 503이며 다른 source/review 경로로 재시도하지 않는다.
- 검색/API 직접 테스트10 + PGlite SQL4, **14/14 PASS**, 실패/skip0. 공식/OCR-only·source 우선·stale·중복 제거·원문 비노출·ACL/RLS·migration rollback·기존 데이터/정의 보존을 확인했다. 실제 운영 PostgREST·운영 DB 검증은 하지 않았다.
- 변경 구현·테스트4파일 및 공동 문서2개. 기존3G RPC/table·3F planner/view·source router/matcher·저장/OCR review 계약과 원본40개 변경/index/.env를 보존했다. 운영 migration/호출/쓰기·policy/예약/환경/배포 변경0, 선행 suite·전체 회귀/build 재실행0이다. 2026-10-26 KST **작업3H IMPLEMENTED**로 게시 후 중단한다.

### 허용 범위

1. additive migration으로 공식 텍스트 receipt 전용 유효 상태 view를 추가한다. 이름은 `concert_program_text_confirmation_status` 또는 의미가 동등하게 명확해야 하며 `security_invoker=true`, service_role SELECT 전용으로 둔다.
2. view는 receipt만 믿지 않고 현재 concert·analysis·candidate·catalog·v4 policy와 다시 대조한다. 최소한 다음이 모두 일치할 때만 `is_effectively_confirmed=true`다.
   - receipt가 CONFIRMED이고 matcher/decision/source kind가 정확함
   - 현재 공식 원문/hash의 실제 UTF-8 SHA-256, context/revision과 saved-current analysis가 일치함
   - analysis payload·candidate snapshot·evidence·catalog·work identity·receipt verification hash가 일치함
   - 후보가 여전히 MATCHED+EXACT, 등록 track/work, 안전한 scope/reason, 중복 없음
   - v4 policy가 명시적으로 enabled=true
3. 불일치는 row를 수정하거나 REJECTED로 바꾸지 않고 `is_effectively_confirmed=false`와 안정적인 stale reason으로만 표현한다. 원문·quote·identity 전체를 검색 view에 노출하지 않는다.
4. `server/supabaseConcertSearch.mjs`가 기존 OCR status와 신규 공식 status를 각각 읽고 같은 검색 DTO로 합치게 한다. 공식 결과도 정확한 track/work, 날짜·지역·공연 상태와 현재 identity hash를 서버에서 재검증한다.
5. source 우선순위는 기존 `routeProgramSource`와 동일해야 한다. 현재 공연에서 공식 Program이 선택되면 그 공연의 OCR 확정은 공식 receipt가 없거나 stale이어도 검색 결과로 fallback하지 않는다. 필요한 원문 읽기는 서버 내부 판정에만 쓰고 응답·로그에 포함하지 않는다.
6. 같은 KOPIS 공연·곡이 양쪽에 있으면 공식 텍스트 결과를 우선해 한 건만 반환한다. 정렬, pagination 한도, 날짜/지역 경계와 기존 외부 응답 필드는 유지한다.
7. 신규 view 부재·잘못된 응답·부분 pagination·상태 변경은 fail closed로 처리하고 OCR/v3 또는 다른 review 경로로 조용히 fallback하지 않는다.
8. 격리 SQL·mock 검색 테스트로 공식 유효/원문·context·snapshot·identity·policy stale, 공식 우선과 OCR fallback, 중복 제거, 기존 OCR-only 검색, ACL/RLS, 원문 비노출을 확인한다.

### 제한

- 변경 구현·테스트 파일은 가능하면 5개 이하로 한다.
- 운영 migration 적용, 운영 DB/KOPIS/OCR/API 호출과 이미지 다운로드를 하지 않는다.
- 3G confirmation RPC/table, 3F planner/view, source router·matcher·저장 RPC와 기존 OCR review/receipt/status를 수정하지 않는다.
- 새 쓰기, batch/queue/runner, 자동 REJECTED, UI·라우트·외부 DTO 변경을 하지 않는다.
- v4 policy 활성화, 예약·환경·배포 변경을 하지 않는다.
- 전체 회귀/build 없이 신규 status/search 직접 관련 테스트만 실행한다.
- 결과는 유효성 판정, source 우선순위, 검색 합치기, 변경 파일·테스트만 같은 브랜치에 게시하고 중단한다.

## 명세 4 작업 3G — 공식 텍스트 단건 자동 CONFIRMED 계약·격리 검증 / IMPLEMENTED

작업 3F 결과 SHA `722b8b4cf56cea55b32558404e7c5254771a541a`와 구현 SHA `27ceba06b5b622887e086f5f6300805c408b9622`를 **ACCEPTED**한다. 공식 status view의 live freshness, source 우선순위, 공식 분석 pending, 중복·모호 후보 제외, GET 전용 planner와 기존 OCR/review/search 보존이 격리 10/10 테스트로 확인됐다.

이번 작업은 3F plan을 쓰기 권한으로 신뢰하지 않고, DB 잠금 안에서 조건을 다시 검증해 **공식 텍스트의 명확한 후보 한 건만 자동 CONFIRMED receipt로 기록할 수 있는 계약**을 작성·격리 검증한다. 부적격 후보에는 REJECTED row를 만들지 않는다.

### 작업 3G 구현 결과

- 공동 문서 기준 `2dfe0df1921cc4cfd18f373c76a3c68493f29bc4`, 구현 코드 `905021d2f7698e732a25f3bf1ac25bf16d39dfb7`. 공식 텍스트 전용 append-only `concert_program_text_confirmations`와 단건 `confirm_concert_program_text_candidate_v4(jsonb,text) → uuid`, 전용 adapter 및 격리 테스트를 추가했다.
- policy → concert → analysis → candidate 순서로 잠그고 현재 원문/hash/context/revision·전체 snapshot/payload/catalog·MATCHED+EXACT·등록 track/work·명확한 scope/reason·중복 부재를 DB에서 재검증한다. 3F plan은 입력받거나 쓰기 권한으로 신뢰하지 않는다.
- 적격 한 건에만 CONFIRMED receipt를 추가하고 같은 candidate/판정 버전·동일 검증 snapshot 재시도는 같은 ID/행 증가0이다. 부적격·정책 변경·stale·변조·중복은 오류와 receipt0으로 끝나며 REJECTED row나 기존 공식/OCR 후보·review 변경을 만들지 않는다.
- receipt는 출처/분석/후보/공연/track/work·각 hash·matcher/판정 버전·evidence hash·검증된 catalog work identity snapshot/hash를 보존하며 전체 원문은 복제하지 않는다. adapter는 전용 RPC·명시적 enabled policy를 매번 GET preflight한 뒤 이 RPC에만 단건 POST한다.
- mock4 + PGlite SQL5 + 전용 loopback PostgreSQL18.4 다중 연결3, **12/12 PASS**, 실패/skip0. 동시 요청은 receipt1건으로 수렴하고 잠금 중 policy/source/analysis/candidate 변경·후보 phantom INSERT가 차단됐다. 테스트 서버는 중지했다. 세부 계약·테스트는 HANDOFF 참조.
- 변경 구현·테스트5파일 및 공동 문서2개. 작업3F suite 재실행·운영 migration/호출/쓰기0, 기존 source/planner/view/저장·OCR 계약 및 정책/예약/환경/배포 변경0. 원본40개 변경/index/.env를 보존했다. 2026-10-26 KST **작업3G IMPLEMENTED**로 같은 브랜치에 게시하고 중단한다.

### 허용 범위

1. additive migration으로 공식 텍스트 후보 전용 append-only confirmation/review table과 단건 RPC를 추가한다. 이름은 `confirm_concert_program_text_candidate_v4` 또는 의미가 동등하게 명확해야 한다.
2. RPC 입력은 최소한 candidate ID, analysis ID, expected source hash, payload hash, catalog hash, matcher version과 자동 판정 버전을 포함한다. 클라이언트가 전달한 track/work/outcome을 신뢰하지 않고 잠근 DB snapshot에서 다시 읽는다.
3. 하나의 transaction 안에서 policy → concert → analysis → candidate를 일관된 순서로 잠그고 다음을 전부 재검증한다.
   - v4 policy가 정확히 존재하고 enabled=true
   - 공식 analysis가 text namespace의 saved-current이며 현재 원문/hash/실제 UTF-8 SHA-256/context/revision과 일치
   - 전체 analysis/candidate snapshot·payload/catalog hash와 expected 값이 일치
   - candidate가 `MATCHED + EXACT`, 등록된 track/work, REVIEW_REQUIRED
   - 충돌·모호·악장 범위·편곡·발췌·알 수 없는 review reason이 없음
   - 같은 analysis 안에 동일 track 또는 work 후보가 중복되지 않음
4. 모든 조건을 통과한 경우에만 CONFIRMED receipt 한 건을 추가한다. 부적격·stale·중복·정책 비활성 후보는 오류/보류로 끝내고 CONFIRMED뿐 아니라 REJECTED row도 추가하지 않는다.
5. receipt에는 candidate/analysis/concert/track/work, source hash, payload/catalog hash, matcher version, 자동 판정 버전, evidence hash와 검증한 identity snapshot/hash를 보존한다. 원문 전체나 비밀값은 복제하지 않는다.
6. 같은 candidate와 동일한 검증 snapshot·판정 버전의 재시도는 같은 receipt ID를 반환하고 행 증가 0이어야 한다. 같은 idempotency key에 다른 snapshot/hash를 보내면 거부한다.
7. 기존 OCR analysis/candidate/review/receipt/status/search와 공식 text analysis/candidate row를 수정하거나 재해석하지 않는다. 공식 confirmation table만 append-only로 사용한다.
8. RPC는 service_role만 실행할 수 있고 public/anon/authenticated 실행·조회와 RLS 우회를 허용하지 않는다.
9. 전용 adapter는 명시적 RPC·policy preflight 후 이 단건 RPC에만 POST한다. OCR review/automation RPC나 v3 RPC로 fallback하지 않는다.
10. 격리 PostgreSQL·mock adapter 테스트로 성공1건, 모든 부적격 무쓰기, idempotent retry, stale source/context·snapshot 변조·중복·정책 변경, transaction rollback, 동시 잠금 계약, ACL/RLS와 기존 OCR 데이터 보존을 확인한다.

### 제한

- 변경 구현·테스트 파일은 가능하면 5개 이하로 한다.
- 운영 migration 적용, 운영 DB/KOPIS/OCR/API 호출과 이미지 다운로드를 하지 않는다.
- 3F planner/view, source router·matcher, 3E 저장 RPC와 기존 OCR 계약을 수정하지 않는다.
- 다건 batch·queue·runner 연결, 자동 REJECTED 처리, public search·UI 노출은 하지 않는다.
- 운영 후보·receipt·CONFIRMED/REJECTED 쓰기, v4 policy 활성화, 예약·환경·배포 변경을 하지 않는다.
- 전체 회귀/build 없이 신규 단건 RPC·adapter의 직접 관련 테스트만 실행한다.
- 결과는 receipt 계약, 잠금·재검증, 무쓰기 제외 결과, 변경 파일·테스트만 게시하고 중단한다.

## 명세 4 작업 3F — 공식 텍스트 상태 조회·source 우선순위 계획 / IMPLEMENTED

작업 3E 결과 SHA `5c0a843105e57037681e6ae4a2de0546c82f8cb9`와 구현 SHA `0653d763d854d1504c5bfdf67d13c99719265ea5`를 **ACCEPTED**한다. 공식 텍스트 전용 table/RPC, 현재 원문·hash·context 잠금 검증, Unicode code-point evidence 검증, idempotency, 기존 OCR/review/receipt 보존과 격리 8/8 테스트가 명세를 충족한다.

이번 작업은 저장된 공식 텍스트 후보의 현재성·유효성을 읽고, 3A의 source 우선순위에 따라 **어느 후보 집합을 후속 판단 대상으로 사용할지만 읽기 전용으로 계획**한다. review·자동 확정·검색 노출·운영 적용은 하지 않는다.

### 작업 3F 구현 결과

- 공동 문서 기준 `1a9494dd6cfe52455a958a8b8f71811e65f536dd`, 구현 코드 `27ceba06b5b622887e086f5f6300805c408b9622`. 공식 전용 analysis/candidate status view 2개와 GET 전용 source-priority read adapter/planner를 additive 4파일로 추가했다. analysis 단위 view는 후보0인 fresh 분석과 미분석을 구별하기 위한 읽기 helper다.
- saved-current와 실제 원문 UTF-8 SHA-256·현재 hash/context/revision·matcher/catalog 및 전체 snapshot 일치를 구분하고, 명시적 enabled policy까지 충족할 때만 effective current다. MATCHED+EXACT·등록 track/work·안전한 review/scope 조건과 중복 제외를 통과한 경우에만 planning readiness를 제공하며 상태를 확정하지 않는다.
- 공식 선택 시 같은 hash의 공식 후보만 읽고 OCR을 조회·혼합하지 않는다. fresh current 분석 부재는 `OFFICIAL_ANALYSIS_PENDING`; fresh 분석의 후보0은 정상 빈 결과다. OCR fallback은 실제 OCR ID/text와 기존 v4 status만 확인하며 NONE은 후보0이다.
- mock adapter6 + 격리 SQL4, **10/10 PASS**, 실패/skip0. GET pagination·상태 변경 보류·policy missing/disabled·stale 원문/context/snapshot·중복·ACL/RLS와 기존 OCR/review/search 정의·행 보존을 확인했다. 세부 선택 결과·검증 한계는 HANDOFF 참조.
- 작업3E suite 재실행·운영 migration/DB/KOPIS/OCR/API 호출·운영 쓰기0. 기존 source/router/matcher/저장 RPC·OCR status/review/search·runner·정책/예약/환경/배포를 변경하지 않았으며 원본40개 변경/index/.env를 보존했다. 2026-10-26 KST **작업3F IMPLEMENTED**로 같은 브랜치 게시 후 중단한다.

### 허용 범위

1. additive migration으로 공식 텍스트 후보 전용 status view를 추가한다. 기존 `concert_program_candidate_status`와 public search view는 교체하거나 수정하지 않는다.
2. status view는 각 공식 후보에 대해 다음을 계산한다.
   - analysis가 텍스트 namespace의 current인지
   - 현재 concert의 `kopis_detail_text_hash`와 source hash가 일치하고 실제 원문 SHA-256도 일치하는지
   - concert context/revision과 matcher/catalog가 저장 snapshot과 일치하는지
   - v4 policy가 명시적으로 enabled인지
   - 위 조건을 반영한 stale reason과 effective current 여부
3. view는 candidate snapshot의 track/work, outcome, relation, review reasons를 읽기 필드로 제공하되 상태를 CONFIRMED/REJECTED로 바꾸지 않는다. 자동 판정 준비 여부는 최소한 current·fresh·policy enabled·`MATCHED + EXACT`·track/work 존재·충돌/편곡/발췌 사유 없음일 때만 true다.
4. service_role 전용 read adapter/planner를 추가해 `routeProgramSource`의 선택을 그대로 따른다.
   - `KOPIS_DETAIL_TEXT`: 현재 source hash와 일치하는 공식 텍스트 status만 선택하고 OCR 후보를 섞지 않는다.
   - `OCR`: 기존 OCR v4 status만 선택하고 공식 텍스트 후보를 섞지 않는다.
   - `NONE`: 빈 후보와 `NO_USABLE_SOURCE`를 반환한다.
5. 공식 텍스트가 선택됐지만 아직 해당 hash의 fresh analysis가 없으면 OCR로 임의 fallback하지 않고 `OFFICIAL_ANALYSIS_PENDING`으로 반환한다.
6. 같은 source에서 중복 track/work 후보가 나오면 자동 준비 대상으로 합치지 않고 중복/충돌 reason으로 제외한다.
7. adapter는 GET만 사용하며 POST/RPC write를 호출하지 않는다. 출력에는 selected source, source hash, matcher version, 전체 후보 수, 준비 가능 수, 제외 reason을 포함한다.
8. 격리 PostgreSQL·mock adapter 테스트로 current/stale 원문·context, policy disabled, 공식 우선/OCR fallback/NONE, 공식 분석 pending, 중복 후보 제외, ACL/RLS와 기존 OCR status 보존을 확인한다.

### 제한

- 변경 구현·테스트 파일은 가능하면 5개 이하로 한다.
- 운영 migration 적용, 운영 DB/KOPIS/OCR/API 호출과 이미지 다운로드를 하지 않는다.
- source router·matcher·3E 저장 RPC와 기존 OCR 저장/review/status 계약을 수정하지 않는다.
- review·receipt·자동 판정 RPC, CONFIRMED/REJECTED 쓰기, public search·UI·runner/batch 연결은 하지 않는다.
- v4 policy 활성화, 예약·환경·배포 변경을 하지 않는다.
- 전체 회귀/build 없이 신규 status view·read adapter의 직접 관련 테스트만 실행한다.
- 결과는 view freshness 규칙, source별 선택 결과, 변경 파일·테스트만 게시하고 중단한다.

## 명세 4 작업 3E — 공식 Program 텍스트 저장 계약·격리 검증 / IMPLEMENTED

작업 3D 결과 SHA `ba78881f9c7e0fd5ba45b4208b21fd62851bfd31`와 구현 SHA `bac81a063d86a8bfa687d6358372a00c1cff6613`를 **ACCEPTED**한다. 공식 section 독립 분석, 전체 원문 좌표, 출처 비혼합, 기존 OCR 8표본 snapshot·payload·cache 보존과 직접 관련 58/58 테스트가 명세를 충족한다.

이번 작업은 공식 Program 텍스트 분석 결과를 이미지/OCR row로 위장하지 않고 저장할 수 있는 **전용 DB 계약과 adapter를 작성해 격리 PostgreSQL에서 검증하는 것까지만** 한다. 운영 migration 적용과 pipeline 연결은 하지 않는다.

### 작업 3E 구현 결과

- 공식 텍스트 전용 분석/후보 table과 `save_concert_program_text_analysis_v4`를 additive migration으로 추가했다. image/OCR/attempt ID 없이 현재 concert 원문/hash/context를 잠금·검증하며 기존 OCR row·current·review·receipt를 보존한다.
- 전용 adapter가 UTF-16을 Unicode code-point로 변환하고 SQL이 모든 quote를 직접 대조한다. v4 policy는 생성·활성화·변경하지 않고, 부재/비활성은 저장 전에 차단한다.
- adapter·격리 SQL **8/8 PASS**, 변경4파일. rollback·Unicode/변조·stale·재시도/원문 복귀·기존 OCR 보존·ACL/RLS를 확인했다. 상세 계약과 검증 한계는 HANDOFF 참조.
- 2026-10-26 KST 작업3E IMPLEMENTED. 작업3D suite 재실행·운영 적용/호출/쓰기0, 예약 Disabled·로컬40개 변경/index/.env 보존. 같은 브랜치 게시 후 중단하며 후속 연결·활성화는 진행하지 않는다.

### 허용 범위

1. additive migration과 전용 RPC `save_concert_program_text_analysis_v4(jsonb,text)` 또는 의미가 동등한 명확한 이름을 추가한다.
2. 공식 텍스트 분석은 `source_kind=KOPIS_DETAIL_TEXT`로 식별하고, image/OCR/attempt ID를 요구하거나 생성하지 않는다. 기존 OCR 분석 row는 계속 OCR 근거로 구분돼야 한다.
3. 저장 시 concert row를 잠그고 아래를 모두 검증한다.
   - 현재 `concerts.kopis_detail_text`와 `kopis_detail_text_hash`가 존재하며 payload의 source hash와 일치
   - 저장 원문 자체의 UTF-8 SHA-256이 hash와 일치
   - concert context/revision이 현재 값과 일치
   - 모든 evidence quote가 현재 전체 원문 안의 선언된 위치와 정확히 일치
4. DB가 직접 검증하는 공식 evidence 좌표는 PostgreSQL substring과 일치하는 **Unicode code-point [start,end)**로 저장한다. 3D의 UTF-16 좌표가 필요하면 adapter에서 code-point 좌표로 결정적으로 변환하고, 원래 UTF-16 좌표는 진단 metadata로만 보존한다. 신뢰 판정에는 DB 검증 좌표를 사용한다.
5. 공식 텍스트의 current/idempotency 범위는 최소한 concert + source kind + matcher version + source hash + catalog hash + concert revision/context를 포함한다. 공식 텍스트 저장이 같은 concert의 OCR v2/v3/v4 current row를 supersede하거나 삭제하면 안 된다.
6. v4 policy가 없거나 `enabled=true`가 아니면 저장 전에 차단한다. migration은 기존 v4 policy를 생성·활성화·변경하지 않는다.
7. candidate는 v4 generation label, logical work 1:1, catalog membership, REVIEW_REQUIRED 초기 상태와 전체 snapshot 일치를 강제한다. 동일 payload 재시도는 같은 analysis ID·행 증가 0, 같은 key의 변경 payload는 거부한다.
8. RPC는 service_role만 실행할 수 있고 public/anon/authenticated 접근과 RLS 우회를 허용하지 않는다.
9. 격리 PostgreSQL 테스트로 migration rollback, 기본 disabled 차단, 테스트 내 임시 enabled 저장, Unicode/CRLF/emoji evidence 검증, 변조·stale hash/context 거부, idempotent retry, OCR/v2/v3/review 보존, ACL/RLS를 확인한다.

### 제한

- 변경 구현·테스트 파일은 가능하면 5개 이하로 한다.
- 운영 migration을 적용하지 않고 운영 DB/KOPIS/OCR/API를 호출하지 않는다.
- source router·matcher 의미를 다시 수정하지 않는다. 필요한 것은 저장 adapter와 신규 계약뿐이다.
- 기존 OCR용 `save_concert_program_analysis_v4`를 공식 텍스트용으로 우회 사용하지 않는다.
- candidate status view, review/자동 판정 RPC, public search, runner/repository/batch 연결은 이번 작업에 포함하지 않는다.
- 후보·receipt·CONFIRMED/REJECTED 운영 쓰기, 정책 활성화, 예약·환경·배포 변경을 하지 않는다.
- 전체 회귀/build 없이 신규 adapter·migration의 직접 관련 테스트만 실행한다.
- 결과는 schema/RPC, offset 변환·검증, 격리 테스트와 변경 파일만 게시하고 중단한다.

## 명세 4 작업 3D — source router와 matcher의 읽기 전용 연결 / IMPLEMENTED

작업 3C 결과 SHA `2cc00f47c3368d1a424ca11dbb3f6cca3ecb5ced`와 구현 SHA `f31655183ce02526978206028387e50d0171e9de`를 **ACCEPTED**한다. v4 저장 RPC의 기본 disabled, 정책 잠금, 버전·snapshot·evidence 검증, service_role 전용 권한과 격리 6/6 테스트가 명세를 충족한다. 운영 migration은 아직 적용하지 않았고 예약은 Disabled다.

이번 작업은 3A의 source router가 선택한 공식 Program 텍스트 또는 current OCR을 3B의 v4 matcher에 전달하는 **순수 읽기 전용 분석 경로**까지만 구현한다. 공식 텍스트 결과를 기존 이미지/OCR 저장 RPC에 억지로 넣지 않는다.

### 작업 3D 구현 결과

- 순수 분석 core와 route 결과용 읽기 전용 진입점을 연결했다. 공식 section별 독립 분석·전체 원문 UTF-16 evidence 좌표를 보존하며, OCR은 원래 snapshot과 Unicode code-point 좌표를 유지한다. NONE은 후보0이다.
- 출처/hash/선택·fallback reason/v4를 명시하고, 공식 결과는 기존 이미지/OCR 저장 계약과 비호환임을 표시한다. 저장 호출·가짜 image/OCR ID는 추가하지 않았다.
- 직접 관련58/58 PASS; 지정 SHA의 리팩터링 전 OCR8표본 snapshot/payload/cache가 그대로 일치한다. 변경 구현·테스트/fixture4파일과 세부 계약은 HANDOFF 참조.
- 작업3C 재실행·운영 DB/KOPIS/OCR 호출·migration/운영 쓰기0, 예약 Disabled·원본40개 변경/index/.env 보존. 작업3D IMPLEMENTED로 게시 후 중단한다.

### 허용 범위

1. 기존 `analyzeStoredProgram`의 텍스트 분석 핵심을 재사용 가능한 순수 함수로 분리한다. 기존 OCR 입력의 payload·candidate·cache 의미와 테스트 결과는 바꾸지 않는다.
2. `routeProgramSource` 결과를 받는 읽기 전용 진입점을 추가한다.
   - `KOPIS_DETAIL_TEXT`: 선택된 Program section만 분석한다.
   - `OCR`: 이미 검증된 current OCR만 기존 의미대로 분석한다.
   - `NONE`: 후보를 만들지 않고 `NO_USABLE_SOURCE`로 종료한다.
3. 공식 텍스트 evidence의 quote와 start/end는 저장된 전체 `kopis_detail_text` 원문의 정확한 범위를 가리켜야 한다. CRLF·Unicode를 임의 정규화한 좌표를 저장하지 않는다. bbox/confidence는 null로 둔다.
4. 서로 다른 공식 section을 하나의 곡으로 합치거나 공식 텍스트와 OCR을 혼합하지 않는다.
5. 읽기 전용 결과에 source kind, text hash, 선택·fallback reason과 matcher version v4를 명시한다. 현 이미지 중심 DB 계약으로 저장할 수 없는 공식 텍스트 결과는 저장 가능하다고 표시하거나 기존 v4 RPC에 전달하지 않는다.
6. 직접 관련 테스트로 다음을 확인한다.
   - 공식 Scherzo No.4 Op.54가 `MATCHED + EXACT`
   - 다중 Program section 순서와 원문 offset 보존
   - biography·notice 제외 및 section 간 곡 합성 방지
   - 공식 텍스트 부재/불일치 시 current OCR fallback
   - 양쪽 모두 없으면 후보·POST 요청 0
   - 작곡가·Op./No. 충돌, 편곡·발췌는 EXACT가 아님
   - 기존 OCR 분석 snapshot/hash의 회귀 없음

### 제한

- 변경 구현·테스트 파일은 가능하면 5개 이하로 한다.
- DB schema·migration·RPC를 추가하거나 수정하지 않는다.
- pipeline runner·repository·batch 저장 경로에 연결하지 않는다.
- 운영 DB/KOPIS/OCR 호출, 이미지 다운로드, 후보·receipt·CONFIRMED/REJECTED 쓰기, 정책 활성화, 예약·환경·배포 변경은 하지 않는다.
- 전체 회귀/build 없이 source router·matcher 직접 관련 테스트만 실행한다.
- 결과는 source별 입력·출력, offset 기준, 변경 파일과 관련 테스트만 게시하고 중단한다.

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
