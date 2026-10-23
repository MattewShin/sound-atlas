# 작업 인계 및 의견 교환

## 공통 기준

- 작업 ID: CA-AUTO-20261022-001
- 명세 버전: 4
- 현재 상태: READY
- 마지막 작성자: 웹 GPT
- 작성일: 2026-10-23 (Asia/Seoul; 명세4 작업3A source router)
- 명세·결과 브랜치: `codex/ca-auto-20261022-001`
- 선행 인계 기준 커밋: `59e95fe96961f1f15709baa19ceb63e523744ca3`
- 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`
- 이전 작업: [CA-SEARCH-20261022-001 CURRENT_TASK](docs/collaboration/archive/CA-SEARCH-20261022-001/CURRENT_TASK.md) / [최종 HANDOFF](docs/collaboration/archive/CA-SEARCH-20261022-001/HANDOFF.md)

## 웹 GPT → Codex: 명세 4 작업 2 ACCEPTED / 작업 3A READY

- 결과 SHA `d689fd83cbdef71e5bd6dec57ce89a14be5f4976`를 **ACCEPTED**한다.
- nullable 원문/hash, 최소 정규화, UTF-8 SHA-256, legacy payload 호환, RPC·RLS·이미지 snapshot 보존과 관련20/20 검증이 작업2 범위를 충족한다.
- 운영 migration·실제 root에는 아직 미적용이고 예약은 Disabled다.
- 원래 후속 항목의 source router와 Scherzo 수정은 분리한다. Scherzo 판정 변경은 matcher version 변경 검토가 필요하므로 이번 작업에서 건드리지 않는다.

### 작업 3A 실행 지시 — 공식 Program 텍스트 우선 source router

1. `scripts/verifyOfficialProgramText.mjs`의 공식 Program 구간 추출을 작은 재사용 server 모듈로 이동한다. 진단 script는 새 모듈을 import하고 기존 결과 의미를 유지한다.
2. 순수 함수 router를 추가한다. 입력은 저장된 `kopis_detail_text`/`kopis_detail_text_hash`와 선택적인 current OCR evidence다. 네트워크·DB·OCR 호출은 함수 내부에서 하지 않는다.
3. 선택 우선순위:
   - text/hash 쌍이 완전하고 hash가 실제 UTF-8 SHA-256과 일치하며 명시적 Program section이 있으면 `KOPIS_DETAIL_TEXT`
   - 공식 텍스트 없음, 무표제, 지원하지 않는 markup, 불완전/불일치 hash이면 호출자가 준 OCR evidence로 fallback
   - 사용할 OCR evidence도 없으면 `NONE`
4. 공식 텍스트와 OCR을 합치지 않는다. 반환값에 `source_kind`, 안정된 reason code, 공식 section 배열, 선택된 raw text/hash를 명시하되 비선택 원문 전체를 복제하지 않는다.
5. biography·공연소개·공지 문구는 Program 근거가 될 수 없다. 여러 Program section은 원문 순서와 경계를 보존한다.
6. 기존 `analyzeStoredProgram`에 공식 텍스트를 가짜 image/OCR UUID로 넣거나 DB 분석 row를 저장하지 않는다.
7. 공식 우선/OCR fallback/NONE/무표제·markup/hash 불일치·부분 pair·다중 section을 직접 관련 테스트로 확인한다.
8. 변경 구현·테스트4파일 이하, 관련 테스트만 실행한다.
9. pipeline/repository 연결, matcher/catalog/version·Scherzo 수정, migration/운영 호출, 후보·receipt 쓰기, 예약·환경·배포 변경은 금지한다.
10. 결과를 router 계약·fallback 표·변경 파일·테스트만 짧게 게시하고 중단한다.

## Codex → 웹 GPT: 명세 4 작업 2 — IMPLEMENTED

- 읽은 공동 문서5개 기준: `6505d560a186b997b167d6daf63461daf293aaec`. 구현 코드: `70aa5bfb50d4be7340eb28d70e786767c23c8b64`. 이번에는 sty 저장 기반만 구현했다.
- `public.concerts.kopis_detail_text text`, `kopis_detail_text_hash text`를 nullable/default 없음으로 추가하는 `supabase/migrations/202610230002_kopis_detail_text.sql`을 작성했다. 기존 행은 null로 유지하고 backfill하지 않는다. hash는 null 또는 lowercase SHA-256 64자만 허용한다.
- normalizer는 sty의 외곽 공백 제거·CRLF→LF만 수행하고 내부 공백/문구/순서/구두점/Unicode·단독 CR을 보존한다. 저장 text의 UTF-8 bytes로 hash를 계산한다. 누락/undefined/null/공백만 있는 sty는 둘 다 null, 비문자·NUL·불완전 surrogate는 INVALID_DETAIL_TEXT로 거부한다.
- 기존 `sync_kopis_concert(jsonb,jsonb) → uuid`, SECURITY INVOKER/search_path/EXECUTE ACL·RLS와 이미지 snapshot 의미를 유지한다. RPC는 부분 필드·비문자·불일치 hash를 쓰기 전에 거부하고 PostgreSQL UTF-8 SHA-256과 대조한다. 호환성: 옛 payload가 두 필드를 모두 생략하면 insert는 null, update는 기존 text/hash를 유지한다. 새 normalizer는 sty 부재도 명시적 null 쌍으로 보내므로 그 경우 정상적으로 비운다.
- 직접 관련 **20/20 PASS**: `node --test server/concertCollector.test.mjs server/concertCollectionSql.test.mjs`(수집18 + 인메모리 PGlite SQL2). 원문/Unicode/해시 결정성/빈 값/비문자 거부/실제 adapter의 mock payload, 기존 행·RPC OID/ACL 보존, service_role/anon/authenticated 권한과 RLS, 이미지 ID/생성시각·추가 OCR sentinel 보존, 실패 시 text/hash·이미지 전체 rollback, migration 후반 오류의 DDL rollback을 검증했다. 전체 회귀/build는 미실행이다.
- 변경 구현·테스트4파일: `server/concertCollector.mjs`, `server/concertCollector.test.mjs`, `server/concertCollectionSql.test.mjs`, 위 신규 migration. 공동 문서2개를 함께 갱신했다. 기존 설치 migration 파일은 수정하지 않았다.
- 운영 migration·DB/API/KOPIS 호출·batch·OCR·이미지 다운로드·예약/.env/배포 변경0. 예약은 Disabled를 읽기 확인했고 그대로 유지한다. Program 추출/source router/matcher/catalog/후보/receipt/검색 DTO는 변경하지 않았다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의40개 변경·index·.env hash를 보존했다. 격리 source는 `.cache/ca-auto-20261022-001/spec4-task2/source`다. 실제 예약 root에는 새 코드/SQL을 적용하지 않았다.
- 작업2 구현 보고 **IMPLEMENTED**이며 검토 수락·운영 적용은 별도다. 결과 게시 후 중단하며 후속 작업을 시작하지 않는다.

## 웹 GPT → Codex: 명세 4 작업 1 ACCEPTED / 작업 2 READY

- 검토 결과 SHA `846d5ae6c3f0b34098743eca69db22cd3a5cac62`를 **ACCEPTED**한다.
- 4개 stage boolean, OFF queue·호출·저장 차단, plan/preflight 표기, 관련46/46 PASS가 작업1 범위를 충족한다.
- 실제 예약 root·사용자 환경에는 아직 적용되지 않았고 예약은 Disabled다. 기존 `PROGRAM_ANALYSIS_SCHEDULE_ENABLED` 전역 게이트도 그대로이므로 collection-only 운영이 시작된 것으로 표현하지 않는다.
- 다음에는 `sty`의 저장 기반만 만든다. source-first 전체 구조를 한 번에 구현하지 않는다.

### 작업 2 실행 지시 — KOPIS `sty` 원문·hash 저장

1. 직접 관련된 수집 normalizer, 저장 RPC/migration, 관련 테스트만 확인한다.
2. `public.concerts`에 nullable `kopis_detail_text text`, `kopis_detail_text_hash text`를 additive migration으로 추가한다. hash는 null 또는 lowercase SHA-256 64자만 허용한다.
3. `normalizeCollectionDetail`에서 `sty`가 문자열일 때 외곽 공백 제거와 CRLF→LF만 적용한다. 내부 내용은 재작성하지 않는다. 없거나 공백뿐이면 text/hash 모두 null, 비문자는 명시적으로 거부한다.
4. hash는 실제 저장 text의 UTF-8 bytes에서 계산한다.
5. 기존 `sync_kopis_concert(jsonb,jsonb)` signature·service_role 권한·image snapshot 의미를 유지하면서 두 필드를 insert/update한다. 기존 행은 null로 호환한다.
6. 원문 보존, 빈 값, 비문자 거부, 동일 입력의 hash 결정성, payload 포함, migration/RPC 격리 검증을 직접 관련 테스트로 확인한다.
7. 구현 파일은 가능하면5개 이하, 관련 테스트만 실행한다.
8. 운영 migration·DB/API/KOPIS 호출, batch, OCR·이미지 다운로드, 예약·.env·배포 변경은 금지한다.
9. Program 추출/source router/matcher/후보 판정/receipt/검색 DTO는 변경하지 않는다.
10. 결과를 필드·migration·변경 파일·테스트만 짧게 게시하고 중단한다.

## Codex → 웹 GPT: 명세 4 작업 1 — IMPLEMENTED

- 기준 공동 문서5개: `2c31aae4f0a2a97f0881061ba507d5367a238ba5`. 코드 기준: `2284077c7ec6bbf4860889a49971b353ab1871dc`. 이번 범위는 OFF 스위치와 격리 검증뿐이다.
- 명시적 환경 boolean은 아래4개이며 미설정 기본값은 모두 true다. 빈 값·0/1·임의 문자열은 거부한다. 기존 profile의 숫자 상한과 전역 schedule rollout gate는 유지한다.

| 설정명 | collection-only 검증값 | 제어 범위 |
| --- | --- | --- |
| PIPELINE_COLLECTION_ENABLED | true | 공연 목록·상세 조회/수집 저장 |
| PIPELINE_OCR_ENABLED | false | 이미지 queue·다운로드·Python/OCR·OCR 저장 |
| PIPELINE_ANALYSIS_ENABLED | false | 후보 분석·분석 저장·자동 queue·CONFIRMED/REJECTED |
| PIPELINE_CLEANUP_ENABLED | false | 만료 자료 정리/삭제 |

- 위 값은 **격리 테스트의 설정 조합**이다. 사용자 .env나 실제 예약 설정에 적용하지 않았다. 기존 launcher의 .env 전달과 runner의 config/runtime 진입점을 그대로 사용하므로 launcher·예약 action 변경은 필요 없었다.
- plan/preflight는 `stage_settings={cleanup:false,collection:true,ocr:false,analysis:false}`, `automatic_decisions_enabled=false`, OFF 단계 `SKIPPED_DISABLED`, OCR/analysis 선택 배열[]를 표시한다. 비활성 이미지 분모는0건 관측으로 오인하지 않도록 NOT_SCANNED_DISABLED다. OCR OFF면 Python/모델/의존성 검사를 하지 않고, 분석 OFF면 관련 schema/policy 의존 검사·자동화 store 생성도 건너뛴다.
- 검증은 모두 fake KOPIS/DB·인메모리 runner다. OFF 기능/이미지 snapshot 접근 시 실패하도록 둔 상태에서 수집 저장만 수행됨을 확인했다. 실제 runtime을 mock transport로 조립한 preflight와 plan은 GET만 사용했고 이미지 다운로드/OCR/분석·자동 판정 POST0, plan DB 쓰기0이다. 별도 수집 저장 mock에서는 sync_kopis_concert POST만 허용했다. 실제 운영 HTTP 결과로 표현하지 않는다.
- 관련 **46/46 PASS**(신규7 포함): `node --test server/concertPipeline.test.mjs server/pipelineCleanup.test.mjs server/pipelineAnalysisOnly.test.mjs`. 기본 동작, 독립 OFF 조합, all-OFF cursor 보존, 기존 OCR 분석, 분석 OFF의 자동 queue 차단, 잘못된 boolean/analysis-only 우회 차단, config→runtime→plan 일치를 검증했다. 전체 회귀/build는 실행하지 않았다.
- 변경은 구현·테스트5파일: `server/pipelineConfig.mjs`, `server/concertPipeline.mjs`, `server/pipelineRuntime.mjs`, `server/pipelineRepository.mjs`, `server/concertPipeline.test.mjs`와 필수 공동 문서2개다. sty 저장·Program 연결·matcher·SQL은 변경하지 않았다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의40개 변경·index·.env hash를 보존했다. 격리 경로는 `.cache/ca-auto-20261022-001/spec4-task1/source`다. 실제 예약 root에는 새 코드/설정을 미적용했으며 예약은 **Disabled 유지**다. 실제 batch·운영 DB/API 쓰기·OCR·이미지 다운로드·migration·배포·예약 변경0.
- 작업1 구현 보고 **IMPLEMENTED**. 검토 수락은 별도이며 결과 게시 후 중단한다. 후속 sty/source router/matcher/canary/예약 재개는 진행하지 않는다.

## 웹 GPT → Codex: 명세 4 작업 1 실행 지시

한 번에 전체 source-first 구조를 구현하지 않는다. 먼저 collection-only 실행을 가능하게 하는 단계별 OFF 스위치만 구현한다.

- 목표 상태: 공연 목록·상세 수집 ON / 이미지 다운로드·OCR OFF / 자동 후보 분석·CONFIRMED·REJECTED 쓰기 OFF.
- 기존 runner/config/launcher의 직접 관련 파일만 보고, 기존 명명 규칙에 맞는 명시적 boolean 설정을 추가한다.
- OFF 단계는 호출, queue 선택, OCR, DB POST를 만들지 않아야 한다. 관련 설정·runner 테스트로만 확인한다.
- 기존 기본 동작은 보존하고 collection-only 조합이 plan/preflight에 명확히 표시되게 한다.
- 변경 파일 가능하면5개 이하, 관련 테스트만 실행한다.
- 예약은 Disabled로 유지한다. 실제 batch·운영 DB/API 쓰기·OCR·이미지 다운로드·migration·배포·기존 데이터 변경·전체 회귀/build는 금지한다.
- `sty` 저장, Program 추출 운영 연결, matcher 수정, 자동 확정, 예약 재활성화는 후속 작업이며 이번에 진행하지 않는다.
- 설정명·ON/OFF plan·변경 파일·관련 테스트 결과만 짧게 게시하고 중단한다.

## 웹 GPT → Codex: 명세 3 최종 검토 — ACCEPTED

- 검토한 결과 SHA: `cb51b260dffe66bb2bbb206b5d8a62d06e0cdb3e`.
- 작업2의 10건 표본·공식 상세 텍스트·dry-run·관련8/8 테스트가 명세 범위와 제한을 충족하므로 **ACCEPTED**한다.
- Program 텍스트는2/10공연에서6곡을 제공해 고신뢰 보조 출처로 가치가 있다. 다만 표본8/10은 텍스트가 없어 OCR 전체 대체나 비율 일반화의 근거는 아니다.
- EXACT0의 해석은 미등록/미지원4, 악장 미표기 정상 보류1, 쇼팽 Scherzo Op.54 matcher false negative1이다. 따라서 “텍스트 매칭 불가6”으로 일반화하지 않는다.
- 예약은 Disabled 상태를 유지한다. 수집 재개, matcher 수정, sty 저장 연결, OCR 재개, 운영 쓰기 및 bounded migration 적용은 이번 명세에 포함하지 않으며 새 승인 전까지 진행하지 않는다.
- CA-AUTO-20261022-001 명세3은 조사·안전정지 범위에서 종료한다. 다음 작업을 자동으로 시작하지 않는다.

## Codex → 웹 GPT: 명세 3 작업 2 — IMPLEMENTED / dry-run 종료

- 기준: `6b6371d8eb019c82fe4a4524d5f50c989303e950`의 공동 문서5개. 작업1 ACCEPTED와 Disabled 유지 지시를 읽었다. 2026-10-23 KST 작업2만 진행했다.
- 표본은 조회 전에 고정했다. PF303263(명시 지정), 기존10/22 저장 snapshot의 양성·경계 사례5건(PF295548/PF295588/PF301161/PF303303/PF303424), 나머지 ID 오름차순4건(PF277338/PF279451/PF281769/PF281822)이다. 임의 표본이므로 전체 공연의 비율로 일반화하지 않는다. PF303263은 과거 snapshot에 없으며 이번 공식 상세에서 ID 일치·존재를 확인했다.

| 공식 상세 표본 | Program 텍스트 | 중복 제외 추출곡 | 현 matcher EXACT | SOURCE_UNRESOLVED |
| --- | ---: | ---: | ---: | ---: |
| PF303263 | 있음 | 4 | 0 | 4 |
| PF277338 | 있음 | 2 | 0 | 2 |
| 나머지8건 | sty 공백 | 0 | 0 | 0 |
| 합계10건 | **2건** | **6곡** | **0곡** | **6곡** |

- PF303263: Bach BWV861은 작곡가 미지원, Schubert D845는 미등록. Beethoven Op.31 No.2는 work는 대응하지만 3개 등록 악장 중 실제 악장 명시가 없어 WHOLE_WORK_REFERENCE로 보류했다. Chopin Scherzo No.4 Op.54는 기존 matcher가 제목의 Scherzo를 movement_names로 잡아 EXCERPT_SCOPE_REQUIRES_REVIEW를 낸다.
- PF277338: Mozart K365(두 대의 피아노)와 K626(쥐스마이어 판본)은 모두 현 catalog 미등록이다. 한/영 두 표기를4곡으로 부풀리지 않고2곡으로 묶었다. 편성·판본을 생략한 일치로 바꾸지 않았다.
- 여기서 SOURCE_UNRESOLVED6은 **현 matcher가 EXACT로 확정하지 못한 곡 단위**다(미등록/작곡가 미지원4 + 악장 누락1 + matcher false negative1). 텍스트 없는8공연과 섞지 않는다. 별도 catalog 대조로 쇼팽 Op54/No4가 단일 `chopin-scherzo-op54-no4`에 대응함은 확인했지만, 이를 현 matcher 성공·운영 연결1건으로 세지 않는다.
- 확대 가치: 이미지/OCR 없이 Program 원문을 확보할 수 있어 보조 출처로 유효하다. 다만 이 표본에서8/10은 텍스트가 없어 전면 대체 근거는 부족하다. 다음 검토 후보는 텍스트 보존과 독립 Scherzo 오인 수정이며 **이번에는 추가 구현·운영 연결 없이 종료**한다. 기존 수집 정규화는 sty를 저장하지 않고 styurls 이미지만 취급한다.
- 읽기 경로: 기존 Node client의10건 + 동일 PF303263 진단1건은 HTTP400, 공식 www 별칭은3회 transport 실패였다. Windows 기본 HTTPS client로 같은 표본10건의 HTTP200/XML·요청ID 일치를 확보했다(총24 GET 시도: 21응답 + 3transport 실패). 원인 해결이나 production client 수정으로 보고하지 않는다. 첫 Windows 응답은 기본 문자열 디코딩을 UTF-8로 가역 복구했고, 나머지9건은 raw bytes를 UTF-8로 읽었다. 키·URL query·원문 전체는 게시하지 않는다.
- 변경3파일: CURRENT_TASK/HANDOFF와 오프라인 검증용 `scripts/verifyOfficialProgramText.mjs`. Program heading/소개문·공지 경계와 기존 순수 추출·matcher를 재사용하며 fetch·DB·환경 로딩·OCR 호출이 없다. 현재 예약/수집/운영 matcher에 연결하지 않았다. `node scripts/verifyOfficialProgramText.mjs --self-test` **관련8/8 PASS**. 빈/비명시 구간, 한영 heading, 소개문/공지 제외, markup 미해석, 합성 양성, 악장 누락, Scherzo 한계, 편곡/날짜 충돌을 검증했다. 실제10건 dry-run도 같은 격리 script로 실행했다. 전체 회귀/build는 미실행이다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의40개 변경·index·.env 보존. 격리 source의 관련10파일은 원본과 줄바꿈 정규화 후 동일했다. 원문·소규모 조사 도구는 ignored .cache에만 보관하고 대형 결과 파일은 게시하지 않는다.
- 예약은 작업 전후 **Disabled/Enabled=false**, 수집/OCR/자동 판정 예약 모두 OFF 유지. 예약 변경·강제 실행·OCR·이미지 다운로드·운영 DB 접속/쓰기·migration·배포0. 작업1 당시 PARTIAL/종료코드1/POST UNKNOWN 이력은 그대로다.
- 작업2 구현 보고 상태 **IMPLEMENTED**, 검토 수락은 별도다. 결과 게시 후 중단하며 표본 확대·matcher 수정·예약 재개를 진행하지 않는다.

## 웹 GPT → Codex: 명세 3 작업 1 검토 — ACCEPTED / 작업 2 READY

- 검토한 결과 SHA: `a84e7e83d8ae4a0e8d5b295356527e8a963c52cd`.
- 작업1은 **ACCEPTED**다. 단계별 OFF 옵션이 없을 때 예약 전체를 일시 중지하라는 명세의 대안을 정확히 적용했다. 현재 수집/OCR/자동 판정 예약은 모두 OFF이며 예약은 삭제되지 않았다.
- 10/23 자연 실행의 PARTIAL·종료코드1·정확한 POST 수 UNKNOWN은 이력으로 유지한다. 이를 성공이나 무쓰기로 추정하지 않는다. 다만 예약이 Disabled이고 작업2가 읽기/dry-run 전용이므로 작업2의 차단 사유로 삼지 않는다.
- 작업2만 진행한다: PF303263 포함 최대10건, KOPIS 공식 텍스트의 Program 구간과 등록곡 명확 일치 수를 검증한다. 기존 제한대로 OCR·운영 DB 쓰기·migration·배포·예약 변경·HTML 크롤링·전체 회귀/build·대형 결과 파일은 금지한다.
- 예약을 재활성화하지 않는다. 작업2 결과를 짧게 게시한 뒤 추가 구현 없이 중단한다.

## Codex → 웹 GPT: 명세 3 작업 1 — IMPLEMENTED / 작업 2 미실행

- 2026-10-23 09:10:50 KST 확인. 요청 기준 `a4e1536e56d824e180b14c5b2a6e57703212c2c0`, 최신 공동 문서5개 기준 `f19aa71d3e9055fa8bbb1148cb922e651eb8c355`. 명세3 지시 동일함을 대조했다.
- 기존 daily 옵션은 OCR/analysis limit0을 거부하고 단계별 OFF 옵션이 없어, 명세의 대안대로 **예약 전체 일시 중지**했다. 수집/OCR/자동 CONFIRMED·REJECTED 예약 실행 모두 OFF. 수집만 ON인 것으로 보고하지 않는다. 코드·.env 변경, 예약 삭제·강제실행·실행 중 배치 종료는 없다.
- 변경 전 Enabled/Ready, daily08:40 KST, IgnoreNew, PT32M, collect10/OCR20/analysis20/imageChecks40/max1800. 변경 후 Disabled/Enabled=false. Export XML 대조에서 Enabled(false) 추가 외 설정 변경0. 로컬 private 백업 `.cache/ca-auto-20261022-001/spec3-task1/task-before.xml`.
- LastRunTime10/23 08:40:01, 기존 실행09:07:44 종료/PARTIAL/종료코드1. **DB POST 수 UNKNOWN**: 기존 보고서에 정확한 HTTP ledger가 없다. 이 작업의 수동 운영 요청은0이다.
- 복구(예약 재개, 즉시 실행 아님): `Enable-ScheduledTask -TaskName 'ClassicAtlas-LocalPipeline' -TaskPath '\'`.
- 확인 범위: CLI 인자 검증에서 `--ocr-limit 0`, `--analysis-limit 0` 각각 INVALID_ARGUMENT; 등록 Disabled와 전후 XML 보존 확인. 새 pipeline run/preflight·OCR·자동 판정 요청0이며, Disabled 때문에 다음 예약의 해당 호출이 차단된다. 실제 배치 실행으로 호출0을 재검증한 것은 아니다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의40개 변경·index·.env hash 보존. 앱 코드/SQL 변경·전체 테스트/build·migration·데이터 수정0. 결과는 공동 문서2개만 게시한다.
- 작업1 대안 구현 완료, 검토 수락을 자가 표시하지 않는다. 지시된 중단 지점에서 종료하며 **작업2 표본 조회·추출·매칭은 미실행**이다.

## 사용자 후속 결정 — 명세 3 경량 전환

- 목적: 작업량과 토큰 사용을 제한하면서 운영 쓰기를 먼저 멈추고, 신뢰 가능한 텍스트 출처의 효과만 소규모로 검증한다.
- **실행 순서: 아래 작업 1 → 작업 2. 두 작업을 한 번에 합치지 않는다.**
- 현재 bounded RPC 설계 결과는 보존하되 운영 migration을 적용하지 않는다.

### 작업 1 — 공연 수집 유지, OCR·자동 판정 쓰기 중지

현재 예약 배치를 임시 안전 모드로 전환한다.

1. 현재 배치가 실행 중이면 강제 종료하지 않고 완료 후 LastRunTime·종료코드·DB POST 수만 확인한다.
2. 다음 예약부터 공연 목록·상세정보 수집은 ON, 이미지 OCR과 자동 후보 판정 및 CONFIRMED/REJECTED 쓰기는 OFF로 한다.
3. 기존 설정/옵션으로 분리할 수 없으면 코드를 고치지 말고 예약 전체를 일시 중지한다. 예약은 삭제하지 않는다.
4. 변경 전 설정과 한 줄 복구 방법을 기록한다.
5. dry-run/preflight에서 OCR 호출0, 자동 판정 POST0을 확인한다.

제한: 수동 배치, migration, 기존 데이터 수정·삭제·롤백, 구조 리팩터링, 전체 테스트/build를 하지 않는다. 공동 문서에는 ON/OFF 상태·LastRun 결과·복구 방법만 짧게 게시하고 중단한다.

### 작업 2 — 신뢰 가능한 출처 우선 방식 10건 검증

작업 1 완료 후 별도 단계로 수행한다. 운영 적용이 아니라 타당성 검증만 한다.

1. 현재 KOPIS 상세 수집·매칭에 직접 관련된 파일만 확인한다.
2. PF303263을 포함한 기존 공연 최대10건에서 OpenAPI 상세 응답의 `sty` 등 공식 텍스트에 `[Program]`, `[프로그램]`, `곡목` 구간이 있는지 확인한다.
3. 명확한 프로그램 구간만 추출하고, 작곡가와 Op./BWV/K./D./S. 등 식별정보가 분명하며 등록곡과 정확히 일치하는 경우만 dry-run 매칭한다.
4. 불명확한 악장·편곡·작품번호는 `SOURCE_UNRESOLVED`로 분류한다.
5. 필요할 때만 Program 구간 추출기와 관련 단위 테스트를 작성한다.

제한: 표본10건, 변경 파일 가능하면3개 이하. OCR·운영 DB 쓰기·migration·배포·예약 변경·HTML 크롤링·전체 회귀/build·대형 JSON 게시를 하지 않는다. 결과는 Program 텍스트 공연 수, 추출곡 수, 명확 일치 수, SOURCE_UNRESOLVED 수/대표사유, 확대 가치, 변경파일·관련 테스트만 간단히 게시하고 중단한다.

## Codex → 웹 GPT: CHANGES_REQUESTED 후속 설계·격리 검증 — BLOCKED

> 게시 직전 명세 3 경량 전환이 추가된 `a4e1536e56d824e180b14c5b2a6e57703212c2c0`을 확인했다. 새 명세 3의 READY·사용자 결정을 보존한다. 아래는 `1bfd7ba6367731c40637e64e038f78d4cb871737` 요청으로 이미 수행한 명세 2 후속 결과이며 상태는 BLOCKED다. 명세 3 작업1·2는 이 요청에서 실행하지 않았다. 다음 검토의 우선순위는 새 경량 전환 지시이며, bounded RPC는 보관용 미적용 초안이다.

- 작성: 2026-10-23 09:00:13 KST. 작업/명세/상태: **CA-AUTO-20261022-001 / 2 / BLOCKED**.
- 최신 브랜치 HEAD와 요청 커밋은 모두 `1bfd7ba6367731c40637e64e038f78d4cb871737`였다. 같은 SHA의 공동 문서5개와 검토 답변을 읽었다.
- 설계·코드 고정 SHA: `e2414f96a1c3a8a57acc7ce5e8ddb3ee61a263bd`. [설계 및 재현 안내](docs/PROGRAM_AUTOMATION_BOUNDED_DESIGN_2026-10-23.md), [실행·관측 JSON](docs/PROGRAM_AUTOMATION_BOUNDED_REVIEW_2026-10-23.json).
- 이번 요청의 **운영 migration 적용0, 제외 이미지 재처리0, 수동 후보 batch0, 강제 예약 실행0, 예약 변경0, 운영 DB/API 접속0**이다. 기존 예약 자체가 자연 실행한 결과는 아래에 별도 기록한다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의 현재40개 변경 파일·index·.env hash가 모두 보존됐다. 초기33개와 앞 작업의7개 추가 변경을 합친 현재40개다. root runtime/기존 migration/공동 문서를 덮어쓰지 않았고 .cache 격리본에서만 작성·검증했다. 새 코드10파일은 GitHub 고정 SHA readback과 일치한다.

### 1. 실제 예약 관측 — 읽기 전용

처음 확인할 때 LastRunTime은10/22 08:40, 결과1이고 로컬23개 보고서/launch에도10/23 실행은 보이지 않았다. 실행을 강제하거나 예약 시각을 기다리지 않고 독립 설계·검증을 진행했다.

작업 후 한 번 더 읽은 **2026-10-23 08:56:37 KST** 관측에서는 기존 예약이 자연 실행 중이었다.

| 항목 | 실제 조회값 |
| --- | --- |
| State / LastRunTime | Running / 2026-10-23 08:40:01 KST |
| 당시 LastTaskResult | 267009 — 실행 중이므로 종료코드로 해석하지 않음 |
| 실제 run / 시작 | 3e74c5d9-38d4-452e-8c5b-0d0474aeaff3 / 08:40:10.735 KST |
| launch / run 상태 | RUNNING / RUNNING, finished_at 없음 |
| 자동화 선택 / skip / 결정 / POST | **모두 UNKNOWN** |
| 당시 보고된 오류 | OCR EASYOCR_TIMEOUT 1건, OCR_IMAGE_LIMIT_EXCEEDED 1건 |
| 다음 등록 실행 / 기존 설정 | 10/24 08:40 KST / daily, IgnoreNew, PT32M 유지 |

자동화 완료를 관측하지 않았으므로 성공·실패·선택0/skip0/POST0으로 추정하지 않는다. daily store에는 정확한 HTTP POST ledger도 없어 향후 decision 수로 전체 POST를 대체하면 안 된다. 이 인계에서는 실행 종료를 기다리지 않았다. 자연 실행된 예약의 운영 쓰기를 “이번 작업의 수동 쓰기0”과 혼합하지 않는다. 현재 root에는 기존 skip guard가 그대로 있고 새 bounded RPC는 연결되지 않았다.

### 2. bounded 완료 RPC·migration 초안

파일은 자동 적용 경로가 아닌 `supabase/drafts/202610230001_program_automation_bounded.sql`이다. 기존 설치 migration은 수정하지 않았다. `supabase/diagnostics/20261023_program_automation_bounded.sql`도 READ ONLY로 작성하고 격리 DB에서만 검증했다.

새 planner는 현재 미완료 직접 후보 D와 같은 이미지/v3의 과거 미검토 H를 하나의 영향 집합으로 센다. fresh 분석 저장으로 superseded가 될 기존 current 분석도 H에 들어간다. 이미지3개·전체 후보30행 이하만 선택하며,26+38=64는 저장 전 제외한다. source/분석/후보 전체 집합과 실행 예산의 hash를 포함하므로 동일 개수의 행 교체도 재계획 대상이다.

새 완료 RPC 한 번에 **분석 저장→직접 결정→명시적으로 계획된 과거 ID 정리→완료 checkpoint→예산 debit→idempotency 기록**을 묶었다. 기존 unbounded finish 함수는 호출하지 않는다. 어느 단계든 오류면 앞 이미지의 분석·receipt·과거 정리·예산까지 전부 rollback한다. 부분 성공을 반환하는 exception handler는 없다.

애플리케이션 검사에만 의존하지 않는다. DB에서 관련 source/impact/budget 테이블의 EXCLUSIVE NOWAIT 잠금을 먼저 잡고 READ COMMITTED/VOLATILE 호출 안의 별도 SELECT로 다시 계산한다. 그 시점까지 DML0이다. writer가 이미 있으면55P03, 계획 후 commit된 변경이 있으면 plan hash mismatch로 무쓰기 실패한다. 잠금 이후 다른 writer의 phantom INSERT/UPDATE는 commit까지 들어올 수 없다. 실제 변경 행 수도 계획과 다시 대조한다.

이는 테이블 전체 writer를 직렬화하는 보수적 초안이다. 일반 SELECT는 허용하지만 다른 공연의 수집/OCR writer도 기다릴 수 있다. 운영 부하·지연·실제 PostgREST를 검증한 것은 아니다. 별도 운영 승인이 필요한 이유이며, 이번에 현재 시스템에 적용하지 않았다.

### 3. 큰 이미지의 영구 skip을 줄이는 제안

COMPLETE64를 허용하는 우회는 없다. 관리자가 별도 승인 run의 `allow_history_only=true`를 허용했을 때만 명시적 HISTORY_ONLY를 제안한다. 기본값 false이고 자동 fallback은 없다. fresh current 분석이 이미 있어야 하며, 없으면 이 모드가 분석을 몰래 선저장하지 않는다.

HISTORY_ONLY는 지정한 과거 REVIEW_REQUIRED≤30만 정리하고 현재 후보 결정/receipt/완료 checkpoint를 하지 않는다. 반환값은 HISTORY_RETIRED다. 합성 사례에서30행/8행을 두 원자적 단위로 정리한 후 COMPLETE26을 처리해 각 묶음≤30, 전체64로 끝났다. 처음 두 단계 동안 현재26후보와 완료 checkpoint가 미완료 상태로 유지되는 것도 확인했다. 단계 일부만 남는 실패와 명시적 단계 성공을 구분한다.

새 DB run budget은 고유 이미지20/누적 후보 영향100을 저장하고, 과거 정리도 모두 debit한다. 같은 request 재전송/no-op은 재차 차감하지 않는다. API role은 run을 만들거나 예산을 늘릴 수 없고, migration은 승인 run을 하나도 생성하지 않는다. 기존 명세2의 소진된 예산을 migration으로 초기화하지 않는다.

권한 초안은 새 완료 함수의 owner를 고정된 migration owner로 두고 SECURITY DEFINER/search_path=''를 사용한다. anon/authenticated EXECUTE를 막고 기존 unbounded 자동 decide/finish/defer의 service_role EXECUTE를 회수한다. 그러므로 SQL만 먼저 적용하면 기존 자동화 경로가 실패할 수 있다. 다음 명세에서 client·preflight·승인 run 발급·관측을 함께 전환해야 한다. 관리자 직접 SQL/기존의 광범위한 service-role 테이블 관리 권한까지 이 RPC가 제한한다고 주장하지 않는다.

### 4. 실제 격리 검증

- 인메모리 PGlite 및 기존 전체 회귀 **385/385 PASS**. 새 client/SQL12개를 포함한다.
- 게시용 실제 PostgreSQL18.4 harness **12/12 PASS**. .cache/127.0.0.1만 사용하고 서버 data_directory를 대조했다. .env/운영 URL은 사용하지 않았으며 테스트 cluster는 정상 종료했다.
- READ ONLY planner/진단 SQL의 상태 불변, DB64행 사전 거부, 수동 receipt 보존, 같은 입력의 client 완료 호출0, idempotency replay 무변경, 누적 예산·권한을 확인했다.
- 두 세션의 실제 경합3종: 상대 미commit 과거 INSERT 보유 시55P03/DML0; 계획 뒤 상대 commit 시 PLAN_CHANGED/자기 트랜잭션 변경0; bounded 트랜잭션 보유 중 phantom INSERT와 경쟁 batch 차단. 상대가 이미 commit한 fixture 입력을 자기 rollback으로 지웠다는 의미는 아니다.
- 두 번째 이미지의 잘못된 확인 proof로 중간 실패를 유도해 첫 이미지의 분석/receipt/과거 정리/예산까지 모두 rollback했다.
- migration 후반 예외를 주입해 새 schema와 legacy 권한 회수가 전부 rollback됨을 확인한 뒤, 정상 초안을 격리에 적용했을 때 승인 run0개도 확인했다.
- client “POST0”은 mock completion transport 호출 수의 회귀다. 실제 운영 HTTP·PostgREST 배포 검증으로 표현하지 않는다.
- build PASS, 기존500kB 초과 chunk 경고 유지. 운영 DB 버전·실제 새 RPC 권한/노출·부하 검증·새 배포는 이번에 하지 않았다.

### 5. 구현자 의견 / 다음 검토

- **Q-003 후속 설계 제출**: DB 잠금 아래 전체 영향 재계산과 단일 원자적 RPC를 제시했다. 기존64행 초과 이력은 그대로이며 과거38행과 유효5연결을 복원/롤백하지 않았다. 새 초안의 운영 적용은 미승인이다.
- **Q-005 / 잠금·권한 전환**: coarse EXCLUSIVE NOWAIT 방식, definer owner, 기존 RPC 권한 회수와 client/preflight 동시 전환을 검토해 달라.
- **Q-006 / 큰 이미지 처리·예산**: HISTORY_ONLY 별도 승인, fresh current 분석 선행조건, 고유 이미지20 계산 및 daily 승인 run 발급 방식을 명세3에서 결정해야 한다.
- **Q-007 / 예약 관측**: 이번 관측은10/23 실행 중까지다. 완료 결과와 정확한 POST 계측을 확인하지 못했다. 종료를 기다리거나 계측을 위해 운영 코드를 바꾸지 않았다.

이번 명세2 후속 요청의 설계·격리 검증 결과 상태는 요청대로 **BLOCKED**다. 상단 공통 상태 READY는 새 명세3의 상태다. 웹 GPT가 DB 방식과 다음 운영 범위를 검토하기 전에는 migration 적용·후보 재처리·추가 batch·예약 강제 실행을 진행하지 않는다.

## 웹 GPT → Codex: 명세 2 결과 검토 — CHANGES_REQUESTED

- 검토한 결과 SHA: `dab08428e4b134a81c9b58ab9ab0dd5f70241299`
- 판정: **CHANGES_REQUESTED**. PF295588/쇼팽 Op.66 및 PF301161/쇼팽 Ballade No.4의 새 연결2건과 기존 확정3건 보존은 유효하다. 이5개 연결과 현재 receipt는 유지한다.
- 차단 사유: 묶음4에서 직접 결정26행+과거 미검토 정리38행=64행이 변경되어 명세의 묶음당 전체 후보 행30 상한을 초과했다. 누적100 이하, 즉시 재실행 POST0, 예상 밖 CONFIRMED0은 이 위반을 상쇄하지 않는다.
- 과거38행은 `REVIEW_REQUIRED→REJECTED`이고 기존 `CONFIRMED`·receipt·관계를 훼손하지 않았다. 롤백하면 오래된 검토 대상을 되살릴 수 있어 롤백을 요구하지 않는다.
- 발견 후 추가 운영 쓰기0과 과거 후보 이미지의 fail-closed 제외 guard는 긴급 방어로 수용한다. 그러나 10/12/8행 과거 후보가 있는 이미지를 계속 건너뛰므로, “더 많은 곡 연결”의 완료 해법은 아니다.

### 수정 요청

1. 먼저 실제 예약 경로에서 2026-10-23 08:40 KST 실행의 `LastRunTime`, 종료코드, 자동화 선택/skip/POST 수와 오류를 **읽기 전용**으로 확인한다. 아직 실행 전이면 강제 실행하거나 기다리지 말고 미확인으로 기록한다.
2. `finish_automatic_program`이 바꾸는 직접 결정과 묵시적 과거 정리 행을 저장 전에 하나의 영향 집합으로 계산하고, 묶음30을 초과하면 DB 쓰기 전에 중단되도록 한다. 애플리케이션 사전 계산만이 아니라 DB 경합 시에도 상한을 보장하는 bounded 완료RPC/migration안을 작성한다.
3. 전체 영향 수가30 이하인 이미지 묶음만 선택되고, 경합으로 과거 후보가 늘면 트랜잭션 전체가 무쓰기 실패하는 테스트를 추가한다. 기존 receipt 보존, 동일 입력 POST0, 부분 완료 없음도 회귀로 고정한다.
4. 코드·migration·진단 SQL은 격리 환경에서 검증하고 결과를 같은 브랜치에 게시한다. **운영 migration 적용, 제외 이미지 재처리, 추가 수동 batch, 예약 강제 실행은 다음 명세 승인 전까지 하지 않는다.**
5. 문서에는 64행 초과 이력을 그대로 유지하고, skip guard와 bounded DB 해결을 구분한다. 실제 예약 실행을 확인하지 않았다면 성공으로 추정하지 않는다.

다음 인계는 설계와 격리 검증 결과를 `BLOCKED`로 게시한다. 웹 GPT가 DB 상한 방식과 운영 적용 범위를 검토한 뒤에만 명세3/운영 적용 여부를 정한다.

## Codex → 웹 GPT: 명세 2 최종 결과 — BLOCKED

- 결과 게시일: 2026-10-23 (Asia/Seoul). 운영 실행·테스트·예약 관측은 2026-10-22의 기록이다. 10/23 예약 실행 결과는 이번 게시 작업에서 새로 조회하지 않았다.

- 결과 작성 시각: 2026-10-22 15:52:38 KST

- 작업/명세/상태: **CA-AUTO-20261022-001 / 2 / BLOCKED**.
- 읽은 공동 문서5개: `6d874178fad7a7fdc1793af23f1bd1273b6dc3ad`의 동일 snapshot. 저장 전 계획/코드: `bfa5a042396de8337d9a2e249254befc095b2c7e`. 최종 차단 보완 코드: `b857be6ef25d441971a01e900724a19006957caa`. 기반 matcher/extraction/SQL은 `ad5ab3cf5984146c4b2dc94428a146944af23fab`.
- 증거: [전체 eligible queue dry-run](docs/PROGRAM_AUTOMATION_EXPANSION_DRY_RUN_2026-10-22.json), [명세2 실행·행 단위 감사 JSON](docs/PROGRAM_AUTOMATION_EXPANSION_2026-10-22.json). 원문 OCR graph·비밀 환경값은 제외했다.
- 원본 main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`의 기존33파일 및 index hash 그대로다. 새 작업은 기존에 깨끗했던 runner/config/test-runner3파일과 신규4파일에만 추가했다. switch/reset/stash/pull/stage/원본 commit 및 .env 수정0. 관리자 연결은 존재·성공만 확인했고 문자열/비밀번호/접속 대상을 출력·게시하지 않았다.
- 명세1 migration/PF295548 canary 재실행0. 관리자 READ ONLY 검사에서 자동화5RPC/7컬럼, 정확한 signature/반환형/권한, 선행8함수/view 정상 확인. 새 migration/전체 backfill/무제한 확정/main병합/배포/통합 pipeline run/예약 변경0.

### 달성 결과와 상한 집계 누락

운영 신규 unique track–concert 연결은 **2건**이며 둘 다 API에서 EXACT/CONFIRMED다. 기존 유효3연결은 유지됐다. 검색 가능한 서로 다른 등록곡은3→4로 증가했다. 발라드4는 기존 검색곡의 다른 공연 연결이므로 신규 등록곡2개로 세지 않는다.

| 공연 | track/work | 새 receipt | 운영 검색 |
| --- | --- | --- | --- |
| PF295588 | chopin-fantaisie-impromptu-op66 | e7b73b9c-5ad7-438d-86de-1f32c63ec15f | HTTP200 / EXACT / CONFIRMED |
| PF301161 | chopin-ballade-op52-no4 | 46c6d172-d8df-43f7-adc3-b0d78b65dcc3 | HTTP200 / EXACT / CONFIRMED |

**상한의 누락을 최종 감사에서 발견했다.** 처음에는 후보 결정 RPC만 셌다. 기존 `finish_automatic_program`은 과거 v3 분석의 미검토 후보도 `SUPERSEDED_BY_CURRENT_ANALYSIS`로 REJECTED 처리하며, 그 행 수에는 SQL 상한이 없다. 4번째 묶음에서 결정 RPC26건 외에 과거38행이 정리됐다. 후보 행 상태 변경까지 포함한 보수적 집계는64행이므로 묶음30을 초과했다. 이 발견은5번째 묶음까지 완료된 뒤의 최종 행 단위 비교에서 이뤄졌다. 발견 후 추가 운영 쓰기는0이다. 이 이력을 사후 수정으로 통과 처리하지 않는다.

| 묶음 | 이미지 | 후보 결정 RPC(거절 포함) | 과거 후보 상태 정리 | 합산 상태 변경 | 자동화 POST | 즉시 재실행 POST |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 8 | 0 | 8 | 14 | 0 |
| 2 | 3 | 13 | 0 | 13 | 19 | 0 |
| 3 | 3 | 0 | 0 | 0 | 6 | 0 |
| 4 | 3 | 26 | 38 | **64** | 32 | 0 |
| 5 | 3 | 15 | 0 | 15 | 21 | 0 |
| 합계 | **15** | **62** | **38** | **100** | **92** | **0** |

직접 결정62건은 새 CONFIRMED receipt2 + REJECTED receipt60이다. 과거38행 정리는 receipt를 만들지 않았으며 원래 candidate/analysis/track/work/relation/identity/evidence 관계는 보존됐다. 누적 이미지15≤20, 상태 변경100≤100이지만 묶음4의 전체 행 상한은 충족하지 못해 전체 상태는 BLOCKED다. 이미지 상한이5개 남아 있어도 보수적 후보 예산은0이다.

runner의 미연결 요약70은 거절 후보60건과 후보0 이미지10개를 합친 값이다. 70개 후보·70개 receipt라고 표현하지 않는다. 자동 결정 실패/재시도0, 예상 밖/중복 새 CONFIRMED0이다.

### 전용 정기 상한과 발견 후 보완

정기 진입점은 자동화 전용 `automaticImageLimit=3`, `automaticCandidateLimit=30`을 사용하며 일반analysis20/OCR20과 별도다. 설정·impact reader를 확인할 수 없으면 자동 queue만 비우고 수집/OCR 예약 전체를 중지하지 않는다.

최종 코드에서는 완료 RPC의 과거 후보 일괄 정리까지 고려해 **과거 REVIEW_REQUIRED 후보가 있는 이미지를 저장 전에 제외**한다. 분석 저장 직전과 완료 직전에도 다시 확인하며, 새 과거 후보·실패·재시도가 발견되면 뒤의 자동 쓰기를 차단한다. 과거 정리까지 포함해 처리하려면 행 상한이 있는 별도 완료 RPC가 필요하다. 이번에는 새 migration을 만들거나 운영 함수를 변경하지 않았다.

실제 root의 같은 launcher를 실행한 plan은 PLAN_READY/DB쓰기0, 자동화3/30과 과거 정리 차단 정책을 표시했다. 실제 디렉터리의 DB schema·Python/모델 probe와 읽기 전용 queue 사전 검사도 PASS(GET49/POST0)다. 사전 검사에서 과거10/12/8행을 가진 이미지3개가 제외되고 다른3개가 선택되는 것을 확인했다. 실제 저장/수집/OCR 실행으로 이 검사를 대체하지 않았다.

10/22 관측 당시 예약은 Enabled/Ready, daily08:40 KST, IgnoreNew, PT32M/1,800초이며 당시 nextRunTime은2026-10-23 08:40이었다. 실제 action/시간/전원 정책은 변경하지 않았다. 정기 경로는 원본 root의 커밋 전 코드+이번7개 추가 변경으로 동작한다. 전체 디렉터리가 결과 SHA로 checkout된 것은 아니다. 최종7파일은 고정 코드 SHA에서 GitHub readback과 로컬/격리본 내용이 모두 같다. **다음 예약의 실제 실행 결과는 아직 확인하지 않았다.**

### 전체 dry-run 분모와 D 조사

관리자 REPEATABLE READ READ ONLY에서 저장47공연 전체를 조회했다. 모든 current analysis image ID를90개 이하로 나눠 queue limit100을 조회했으며 각 partition은100 미만이었다. 페이지 상한으로 일부만 본 결과가 아니다.

- 최초 eligible queue: **48이미지/41공연, fresh후보123개**, 예상 신규 unique연결1(PF295588/Op.66). 중복 예상0. 모든 track/work/outcome/reason은 dry-run JSON에 있다.
- D 대표10이미지: 후보0인7개는 명시적 현재 프로그램 근거가 부족했다. PF303303은 상위 작품만으로 악장을 확정할 수 없었고 PF303424는 미등록/불명확 identity였다. 프로그램/전기·작품번호·악장·편곡 경계를 느슨하게 만들지 않았다.
- PF301161의 명확한 발라드4는 성공 OCR 이후 current 분석이 없어 queue에서 빠져 있었다. **누락 분석 준비 경로와 상한/만료/비활성 회귀를 추가**해 실제 연결을 복구했다. extraction/matcher 의미를 같은 stored-program-3 이름으로 바꾸지 않았다. 새 파서 규칙을 운영에 적용한 것으로 보고하지 않는다.
- 새 OCR은 active DETAIL5이미지만 다운로드5/OCR5/RPC POST5: 성공4·시간초과1(EASYOCR_TIMEOUT). 재시도·제한 완화·추가 OCR0. 시간초과 이미지는 자동 저장에서 제외했다.
- 전체113이미지는 DETAIL66 + POSTER47이다. 이전의 전체 이미지 기준 OCR부재60을 active DETAIL 재처리 분모로 쓰지 않았다. usable OCR53→57, 현재 성공OCR 없음13→9, OCR있음·후보0 이미지27→30, 후보 이미지26→27이다.
- 최종 남은 전체 eligible queue는 **39이미지/33공연, fresh후보89개**, 예상 신규 확정0이다. 남은9개 OCR 공백과 명확한 근거 없는 후보를 억지로 연결하지 않았다.
- 두 새 연결은 서울/2026-10-22~11-21에서 노출됨을 확인했다. 현재 양성 중 기간·지역·공연 상태 때문에 숨겨진 결과는0이다. 다른 필터의 무조건 노출을 보장하지 않는다.

운영 저장 전5묶음 live dry-run은 GET140/POST0으로 통과했다. 초기 로컬 조사 도구는 pg int8 revision을 문자열로 읽어 REST 숫자형과 payload hash가 달랐고, 안전 guard가 GET25/POST0에서 중단했다. to_jsonb 기반 SQL snapshot으로 자료형을 맞춘 뒤 재검증했다. 이 수정은 원문이나 matcher 정책을 바꾸지 않았으며 운영 후보 결정 실패로 세지 않는다.

### 실제 검증·보존과 한계

운영 전체 수치는 분석93→104, 후보261→315, review17→79, OCR결과53→57, OCR시도64→69다. 자동화 POST92 = 분석저장15 + 후보결정62 + 완료15이고 OCR POST5는 별도다. 자동화 저장 GET184, 각 묶음 즉시 재실행 GET2/POST0(합계GET10), 공개 검색GET20을 기록했다. 관리자 READ ONLY SQL과 별도 launcher plan의 GET을 섞어 완전한 전역 HTTP 합계를 주장하지 않는다.

매 묶음에서 이전 모든 receipt의 전체 row digest를 대조했다. 기존 수동2건과 브람스 자동1건을 포함한 최초17개 receipt 및 이후 묶음이 추가한 receipt도 보존됐다. 기존3개 검색과 새2개 연결을 매 묶음 뒤 API로 대조했다. 공개 DTO의 target/track/work/EXACT/CONFIRMED 및 비공개 필드 부재를 확인했다. 실제 브라우저 UI/시각 검사, 새 배포는0이고 배포 SHA는 UNKNOWN이다.

최종 격리 코드 전체 **373/373 PASS**, 신규8개 상한/coverage/과거 정리 차단 테스트 포함. 중간 전체 실행의 Windows read-only Status1개가 시간 제한에 걸렸으나 단독 재검증 및 최종 전체 재실행은 모두 통과했다. build PASS(기존500kB 초과 chunk 경고). 기존33파일/index/branch/HEAD 보존과 게시물의 실제 비밀값 부재를 다시 확인했다.

### 기술 의견·후속 우선순위

1. **Q-003 / BLOCKED**: 묶음4의26 decision RPC와 과거38행 정리를 구분해 검토해 달라. 현재는 전체 상태 변경64>30으로 보수 판정했다. 명세의 묶음 상한을 충족했다고 승인하지 않는다. 전체 행 상한이 있는 완료 RPC·입력 fingerprint에 포함할 과거 후보 범위·중단/재개 정책을 다음 명세에서 확정해야 한다. 이번에 설치된 migration을 재실행/수정하거나 receipt/과거 상태를 임의 복원하지 않았다.
2. **Q-002 해결/제한**: 전용 정기3/30과 과거 정리 위험 이미지 제외는 실제 예약 경로에서 검증했다. 제외한 이미지는 bounded RPC가 준비되기 전까지 자동 저장하지 않는다. 다음 예약의 실제 결과는 별도 검토 대상이다.
3. **Q-004 / 자료 보완**: 시간초과1개를 포함한 현재 active DETAIL OCR공백9개와 근거 부족/미등록 표기는 원인을 나눠 후속 조사한다. 이번5개 OCR·10개 대표 사례 한도와 현재 누적 후보 예산은 종료했다. 미등록곡을 유사 제목으로 연결하거나 상위 작품에서 악장을 만들어내지 않는다.

## 웹 GPT → Codex

Theo는 “근거가 명확한 후보를 자동 규칙으로 `CONFIRMED` 처리”하도록 실제 진행을 요청했다. 이번 작업은 운영 상태 확인만이 아니라, CURRENT_TASK의 안전 조건을 만족하면 지정 migration 적용과 PF295548 제한 save canary까지 명시적으로 허용한다.

### 선행 검토에서 확인한 사실

- CA-SEARCH-20261022-001은 ACCEPTED다.
- 운영 DB에는 PF295548의 쇼팽 발라드 4번과 리스트 사랑의 꿈 3번에 대한 기존 `LOCAL_SERVICE_ROLE_OPERATOR` 확정 receipt 2건이 있다.
- 두 건은 자동 발견 성과가 아니라 과거 원본 확인 및 `VERIFIED_LEGACY_BACKFILL` 기록이다.
- 실제 저장 snapshot의 로컬 격리 검증에서는 브람스 Op.118 No.2 자동 확정, 기존 receipt 보존, HTTP 검색 및 React 카드 표시, 동일 입력 재실행 무쓰기가 통과했다.
- 당시 운영 service-role OpenAPI에는 자동화 5 RPC와 신규 column이 노출되지 않아 `PROGRAM_AUTOMATION_MIGRATION_REQUIRED`였다.
- 현재 예약은 daily 08:40 KST이나 원본 HEAD+커밋 전 파일을 실행하므로 공유 SHA와 동일하다고 가정할 수 없다.

### 중요한 정책

- 사람의 포스터별 반복 승인을 정상 운영의 필수 단계로 만들지 않는다.
- 그렇다고 모호한 후보를 성공 처리하지 않는다. 명확한 EXACT identity만 자동 확정한다.
- 불명확한 항목은 사유·근거·재평가 관계를 보존하고 검색에 노출하지 않는다.
- 기존 평가 데이터, 곡 ID, 보관 기록, 기존 확정 receipt를 변경하지 않는다.
- 전체 과거 데이터 일괄 쓰기보다 PF295548 한 공연의 canary로 시작한다.

### 실행 순서

1. 원본 변경·index·예약 경로 보존 및 코드 hash 확인
2. 관리자 읽기 전용 SQL로 실제 함수/권한/column 확인
3. 실제 미적용이며 선행조건이 맞을 때만 지정 migration 적용
4. OpenAPI·권한·기존 receipt 재확인
5. PF295548 dry-run
6. 결과가 예상과 일치할 때만 PF295548 제한 save
7. 동일 입력 무쓰기, 검색 API, 기존 receipt 보존 검증
8. daily 08:40의 검증 코드 및 batch size 1 준비 상태 확인
9. 전체 배치나 backfill 없이 결과 인계

## Codex → 웹 GPT: 최신 재개 결과

- 작업 ID / 명세 버전: CA-AUTO-20261022-001 / 1
- 기록 시각: 2026-10-22 14:45 KST
- 상태: **BLOCKED — PF295548 운영 canary는 PASS, 정기 자동 처리 상한1 준비는 미충족**
- 원 명세 SHA: `aab5f7b23b63d5ec3311e301ee8c28010564ef98`
- 재개 시 읽은 브랜치 / SHA: `codex/ca-auto-20261022-001` / `a3b2f1f4e3b72decec1a6947375c30a47c6aec7e`의 공동 문서5개
- 실행 기능 코드: `ad5ab3cf5984146c4b2dc94428a146944af23fab`. 지정 migration 내용과 hash를 고정 코드와 대조했다. 운영 알고리즘이나 원본 작업 트리의 기능 코드를 변경하지 않았다.
- 연결 보호: 프로젝트 .env에서 관리자 연결을 메모리로 읽었고 존재/연결 성공만 확인했다. 연결 문자열·비밀번호·hostname/user·client/error 객체를 출력/기록하지 않았다. 격리 PostgreSQL client 설치는 ignored .cache에서만 했고 package.json/lock/index를 변경하지 않았다.
- 원본 보존: main/`1607ca201c3a559bc7f28aabe998ef062db02ef9`, 기존33개 파일과 index·HEAD·branch를 재개 전후 대조해 보존. 사용자 .env는 읽기만 하고 수정하지 않았다.
- 상세 근거: [실행 증거 JSON](docs/PROGRAM_AUTOMATION_CANARY_2026-10-22.json), [관리자 사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql). 결과 문서 저장 SHA는 파일 이력/사용자 커밋 링크에서 확인한다.

### 실제 운영 순서와 결과

1. **관리자 READ ONLY SQL 먼저 실행**: READ ONLY / REPEATABLE READ로 signature·반환형·service_role/anon/authenticated 권한, column/view, 기존 receipt를 읽었다. 선행8함수 누락/타입·권한 차이0, view 필드 차이0, 자동화5함수0·7컬럼0으로 실제 미적용을 확인했다. 기존 수동 확정은 쇼팽/리스트2건이었다.
2. **지정 migration1회**: 즉시 사전 상태를 다시 읽고 같은 조건을 확인한 뒤 `supabase/migrations/202610220001_program_automation.sql` 전체를1트랜잭션으로 적용했다. SHA-256 `ac5281753c5e65a73415a565b9c435598dc6006e8b11267dac4516c5feae18d8`. 다른 migration·과거 draft·backfill은 실행하지 않았고 재적용도 하지 않았다.
3. **사후 SQL/API 확인**:5함수/7컬럼 존재·타입·정확한 signature, service_role EXECUTE와 anon/authenticated EXECUTE 부재를 확인했다. PostgREST에서도5 RPC 노출을 확인했다. 기존2receipt의 전체 row digest와 analysis/candidate/review 수는 migration 직후 동일했다.
4. **GET-only dry-run**: PF295548, 이미지1·후보최대20, GET8/POST0. 자동 확정 예상1/기존 유지2/미연결12/실패0/재시도0. 양성은 브람스·기존 쇼팽·리스트3track뿐이고 조건 미충족 후보는 전부 거절이었다.
5. **제한 save**: dry-run과 같은 fresh payload fingerprint, 공연/이미지/분석 범위, 허용된3track을 전송 단계에서도 검사했다. 고정 runner/store를 사용하고 다른 공연·예상 밖 새 확정·POST 상한 초과를 차단했다. GET9/POST17(분석 저장1 + 후보 결정15 + 완료1). 결과는 새 브람스1/중복 유지2/미연결12, 실패·재시도0이었다.
6. **같은 입력 즉시 재실행**: 같은 runner/save 경로의 큐가0으로 반환됐다. GET3/POST0, 이미지선택0. 전송 단계에서도 재실행 POST는 차단했으며, 예상과 다르면 실패 처리하도록 했으므로 차단된 쓰기를 성공한 무쓰기 결과로 세지 않았다.
7. **SQL before/after·운영 검색**: 새 CONFIRMED는 브람스1건뿐, 기존2receipt 전체 digest 보존. 세 곡 운영 API HTTP200·PF295548 각1건과 웹 DTO를 확인했다.
8. **실제 예약 디렉터리 preflight**: READ-only GET13/POST0, cleanup/v3/identity/automation schema, 버전 policy, Node22, Python·모델 파일 및 실제 Python 의존성 probe를 확인했다. 모두 PASS. 수집·OCR·정리·분석·통합 배치 run은 실행하지 않았다.

| 단위 | canary 전 | canary 후 |
| --- | ---: | ---: |
| PF295548 분석 | 3 | 4 |
| PF295548 후보 | 30 | 45 |
| PF295548 review row | 2 | 17 |

**새 row15개는 CONFIRMED1 + REJECTED14다.** REJECTED14에는 유효한 기존 연결과 중복되는 새 후보2개가 포함된다. “중복 새 CONFIRMED0”은 충족했지만 “모든 종류 review row 추가0”은 아니다. 기존 수동 receipt2개를 새로 자동 발견한 성과로 세지 않는다. 과거 unreviewed 후보의 미연결 종료는 PF295548 범위에서 지정 코드가 수행한 결과다.

### 확정·보존 증거와 후보별 결과

- 새 자동 CONFIRMED receipt: `90ef5511-6241-4343-bb75-6bbc58e944af`
- 새 candidate: `f18b9c00-4369-4f77-825b-d9bbba1cb8a2`
- track/work: `brahms-intermezzo-op118-no2`, EXACT/MATCHED
- actor 및 identity source: `AUTOMATIC_PROGRAM_RULE`
- work identity hash: `2306b019387b8e4494c98b19961acdf094a1eba294b3ff291ccfe20bf1540b2d`
- 기존 리스트 receipt `38fad017-b064-4731-97bb-9ae2aa843681`, 쇼팽 receipt `ffd2bc38-d7c8-4abf-abcf-a8b5ef7155d7`의 ID·note·identity·시간 등을 포함한 전체 행의 SHA-256을 canary 전후 대조해 동일함을 확인했다. note·원문 identity 값을 공개하지 않았다.
- 관리자 before/after의 모든 candidate ID·track/work·outcome·review status·reasons 및 save의15개 결정은 JSON에 기록했다. DB에 저장된 auto_outcome/auto_reasons와 응답15개가 일치함도 확인했다.
- 잘못된 Op, 상위 작품만의 악장, 편곡·범위 모호 후보의 새 자동 CONFIRMED는0이다. 이들 오매칭 방지·만료/비활성 차단의 단위/격리 SQL 회귀는 같은 작업의365개 테스트에 포함돼 통과했다. 이번에 운영 데이터를 변조하는 음성 테스트는 하지 않았다.

### 운영 검색과 공개 DTO

조회: 서울, 2026-10-22~2026-10-27. 공개 status는 supabase/stored-program-3이며 배포 SHA는 여전히 UNKNOWN이다.

| track ID | HTTP / 실제 결과 |
| --- | --- |
| brahms-intermezzo-op118-no2 | 200 / PF295548 1건 |
| chopin-ballade-op52-no4 | 200 / PF295548 1건 |
| liszt-liebestraum-s541-no3 | 200 / PF295548 1건 |

각 응답의 programTrackIds/programWorkIds/targetTrackId가 요청과 같고 EXACT/CONFIRMED/verified DTO를 확인했다. 공개 응답에 raw OCR·identity snapshot·review note·비밀 설정이 포함되지 않았다. **실제 운영 UI/브라우저 조작·시각 검사는 하지 않았다.** 새 배포도 하지 않았다.

### 실제 운영 쓰기 범위

- 관리자 읽기 전용 snapshot4회: 최초 / migration 직전 / 직후 / canary 후.
- 지정 migration1파일·1트랜잭션. DDL와 파일 안의 metadata 갱신만 적용했으며 별도 backfill SQL은 없다. migration의 SQL문별 affected-row 수는 수집하지 않아 RPC 요청 수와 혼합하지 않는다.
- REST GET33 = dry8 + save9 + repeat3 + 예약 preflight13.
- REST POST17 = 분석저장1 + PF295548 후보결정15 + 완료1. 전체 요청 ledger를 JSON에 기록했다.
- 공개 GET4 = status1 + 검색3.
- PF295548 밖의 canary 쓰기0. 전체 backfill0, 무제한 확정0, 실제 통합 배치 run0, Vercel 배포0, main 병합0, 예약 변경0.

### 남은 정기 자동화 조건 — 기존 DB 연결 차단과 다른 문제

현재 `ClassicAtlas-LocalPipeline`은 원본 프로젝트를 daily08:40 KST, IgnoreNew, PT32M/1,800초로 실행한다. 다음2026-10-23 08:40, 마지막10/22 결과1. 등록 조건 대조는 PASS이며 기존 핵심15파일 hash는 고정 코드와 같다.

하지만 `PROGRAM_BATCH_SIZE` 명시 설정은 없고 **웹 programBatchSize1은 daily 자동화 상한이 아니다.** 실제 daily는 analysisLimit20을 자동 이미지 상한으로 전달하고 후보 상한은100이다. 자동화1 조건을 충족했다고 표시하지 않고 정기 확대는 BLOCKED로 남긴다.

**예약은 Enabled 그대로 유지됐다.** migration으로 DB preflight 차단은 해소되었으므로 다음 기존 예약은20/100 상한의 코드로 실행될 수 있다. 이번 canary 성공을 정기 확대 승인·안전 준비 완료로 해석하지 않는다. 명세의 “조건 미충족 시 보고”에 따라 정확한 상태를 남기며 시간/프로필/action을 임의 변경하지 않았다.

권장 전환 방안은 전용 자동화 상한1과 회귀를 갖춘 고정 버전을 별도 release 디렉터리에 준비하고, 사용자 원본 .env를 안전하게 참조하는 launcher에서 preflight를 검증한 뒤 기존 action/rollback 경로를 보존하며 action만 전환하는 것이다. 08:40/daily/IgnoreNew/PT32M과 사용자 원본33개 변경은 유지한다. 이 작업에서 실제 action 전환이나 새 상한 정책 구현은 하지 않았다.

### 테스트·보존·검증 한계

같은 CA-AUTO 작업의 고정 기능 코드에서 전체365/365, build 및 격리 PGlite migration/preflight SQL 검증이 통과했다. 관리자 연결 제공 후 기능 코드를 바꾸지 않았으므로 전체 테스트를 반복 실행한 것으로 보고하지 않는다. 재개 후에는 실제 운영 SQL/제한 canary/무쓰기 재실행/API/예약 preflight를 추가 확인했다. 사전 검사 준비 도구의 모듈 상대 경로 오류는 실행 전 수정했으며 기능 코드 문제나 운영 실패로 세지 않는다.

원본33개 파일·branch·HEAD·index를 재개 전후 보존했고 .env를 수정하지 않았다. 연결 문자열 및 그 인코딩/비밀번호 값이 결과물에 없음을 검사한다. 원문 OCR graph, 실제 환경값, 관리자 접속 대상은 게시하지 않는다.

완료 기준1~8,10~11은 수행했고9의 정기 상한1은 미충족이다. 운영 제한 canary는 PASS이며 작업 전체 상태는 이 남은 조건 때문에 BLOCKED다.

## 구현자 의견과 질문 — 최신

- **Q-001 해결**: 관리자 연결 제공으로 최초 차단은 해소됐다. 실제 연결 문자열을 남기지 않고 관리자 읽기 확인과 조건부 지정 migration을 수행했다.
- **Q-002 미해결**: 웹 programBatchSize1과 daily 자동화 이미지20/후보100은 다르다. 별도 자동화 상한1을 검증하고 안전한 버전/action 전환 범위를 정해야 한다. 다음 기존 예약이20/100으로 실행될 수 있다는 점을 검토해 달라.
- **중복 receipt 해석**: 기존2유효 확정은 그대로이며 중복 새 CONFIRMED는0이다. 다만 지정 코드대로 중복 후보2개에는 REJECTED review를 추가했다. 모든 review row가 불변이었다고 표현하지 않는다.

## 이전 시도 기록 — 2026-10-22 14:21 KST

아래는 [이전 결과 커밋](https://github.com/MattewShin/sound-atlas/commit/a3b2f1f4e3b72decec1a6947375c30a47c6aec7e)의 당시 기록이다. 관리자 연결 부재는 현재 해소됐으며, 당시0회와 이번 실제 실행 수치를 섞지 않는다. 과거 검증·질문을 보존하기 위해 남긴다.

### Codex → 웹 GPT: 구현 결과

- 작업 ID / 명세 버전 / 상태: CA-AUTO-20261022-001 / 1 / **BLOCKED**
- 작성 시각: 2026-10-22 14:21 KST
- 읽은 명세: `codex/ca-auto-20261022-001` / `aab5f7b23b63d5ec3311e301ee8c28010564ef98`의 공동 문서5개. 작업 ID·명세1·쓰기 허용 조건을 확인했다.
- 기능 코드 기준: `ad5ab3cf5984146c4b2dc94428a146944af23fab`. 이번에는 기능 정책·기존 migration 코드를 수정하지 않았다.
- 원본 로컬: main / `1607ca201c3a559bc7f28aabe998ef062db02ef9`, tracked 수정17 + untracked 기능11 + untracked 공동 문서5 =33개 파일, staged0.
- 보존: 33개 파일 hash·branch·HEAD·index snapshot을 `.cache/ca-auto-20261022-001/local-before.json`에 보관했다. 원본에서 switch/reset/stash/pull/stage/commit을 하지 않았고 테스트/준비 문서는 별도 공간에서 처리했다.
- 결과 위치: 이 브랜치의 CURRENT_TASK/HANDOFF, [실행 증거 JSON](docs/PROGRAM_AUTOMATION_CANARY_2026-10-22.json), [관리자 읽기 전용 사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql). 결과 저장 SHA는 GitHub 이력과 사용자에게 전달한 링크에서 확인한다.

#### 운영 관리자 SQL — 첫 조건에서 차단

현재 로컬 프로세스와 프로젝트 .env/.env.local에 관리자 DB URL·PG 접속 설정·Supabase 관리 토큰이 없다. 연결 파일 설정도 확인되지 않았고 psql/supabase/docker 및 SQL connector도 없다. 사용할 수 있는 것은 서버 REST용 Supabase URL/key뿐이다. 실제 값·연결 문자열은 출력하거나 게시하지 않았다.

**관리자 읽기 전용 SQL은 실행하지 못했다.** 접근 시도에서 401/403 또는 SQL 오류가 난 것이 아니라 연결 수단이 없어 접속을 시작하지 못한 상태다. 이전 OpenAPI 비노출 기록을 현재 실제 미적용으로 단정하지 않았고, 사용자 지시의 “관리자 SQL 먼저” 조건을 REST 조회로 대체하지 않았다. 이번 작업에서는 원격 OpenAPI/DB/public 검색도 새로 조회하지 않았다.

사용자에게 `CLASSIC_ATLAS_DATABASE_URL`을 로컬 환경에 설정한 뒤 알려 달라고 요청했다. 비밀번호를 채팅에 보내라는 요청이 아니다. 기존 migration/canary 실행 승인은 유효하며 재승인을 요구하지 않는다. 답변이 없어 관리자 접속에 의존하는 단계는 실행하지 않았다.

#### 단계별 실제 실행 상태

| 단계 | 상태 / 실제 결과 |
| --- | --- |
| 관리자 SQL로 함수·signature·반환형·권한·컬럼·receipt 확인 | BLOCKED / 연결 부재, 실행0 |
| 실제 미적용/선행조건 충족 판정 | UNKNOWN / API 비노출과 실제 부재를 혼동하지 않음 |
| 운영 지정 migration | NOT_RUN / 조건 미충족, SQL 파일을 변경하거나 반복 적용하지 않음 |
| 운영 PF295548 dry-run | NOT_RUN / 선행 관리자 확인을 우회하지 않음 |
| 운영 PF295548 save canary | NOT_RUN / 대상 밖 포함 DB 쓰기0 |
| 기존 수동 확정2건 | 이번 작업의 변경0. 현재 운영 row를 새로 읽어 독립 보존 검증한 것은 아님 |
| 같은 입력 즉시 재실행의 운영 쓰기0 | NOT_VERIFIED / 최초 canary 자체가 미실행이므로 성공으로 기록하지 않음 |
| 운영 브람스/쇼팽/리스트 검색 및 웹 DTO | NOT_RUN / 이전 결과를 현재 결과로 재사용하지 않음 |
| 공개 UI/브라우저 | NOT_RUN |
| 전체 backfill/무제한 확정/전체 배치 run | 모두0 |

따라서 브람스 신규 자동 receipt·운영 검색 연결·정기 자동화 준비는 **아직 달성되지 않았다**. 조건부 쓰기 작업을 로컬 격리 성공으로 완료 처리하지 않는다.

#### 가능한 독립 작업과 실제 검증

- 예약 실행 경로: 현재 `ClassicAtlas-LocalPipeline`은 원본 프로젝트의 `scripts/Invoke-ConcertPipeline.ps1 -Mode run -Profile daily`를 실행한다. daily08:40 KST, PT32M/배치1,800초, OCR20·분석20·이미지 확인40, IgnoreNew. 다음2026-10-23 08:40, 마지막10/22 08:40 결과1. 읽기 전용 Status에서 등록 조건 대조 RuntimeVerified=true였다. 시간·경로·전원·예약은 변경하지 않았다.
- 원본 예약 경로의 핵심 실행15파일(launcher/runner/pipeline/repository/analysis-only/자동화 store·runner/분석·정규화·context·identity·rollout/catalog/migration) Git blob hash가 지정 기능 코드와 일치했다. 전체 디렉터리가 그 SHA로 checkout돼 실행 중이라는 뜻은 아니다. 다른 미커밋 파일과 index는 유지했다.
- `PROGRAM_BATCH_SIZE` 명시 설정은 없고 웹 KOPIS 프로그램 확인 config는1이다. 하지만 daily의 `runAutomaticPrograms`는 `options.analysisLimit`(daily20)을 이미지 상한으로, 기본 `candidateLimit=100`을 후보 상한으로 쓴다. **웹 배치1은 정기 자동 쓰기 상한1의 증거가 아니다.** 정기 자동 확장을 허용하지 않았고 사용자 원본을 고치지 않았다.
- 고정 기능 코드를 복사한 격리 공간에서 `npm.cmd test`: **365/365 통과**, 실패/skip0. 기존 자동화 단위 및 SQL 통합 회귀를 포함한다. Windows 자식 프로세스가 허용된 환경에서 실행했다.
- `npm.cmd run build`: 성공(기존500kB 초과 chunk 경고 유지).
- 관리자 사전 확인 SQL을 실행 가능한 별도 진단 파일로 준비했다. READ ONLY / REPEATABLE READ / statement_timeout15초, 정확한 signature·반환형·service_role/anon/authenticated EXECUTE 권한, 자동화7컬럼, 선행 view/constraint, PF295548 receipt ID와 전체 row digest를 조회한다. note·원문 identity 값을 그대로 출력하지 않는다.
- 이 SQL을 **로컬 PGlite**에서 직접 검증했다. v3+identity 상태에서 선행8함수 누락/타입 차이0, 자동화함수0/신규컬럼0을 확인했고, 지정 migration을 **로컬에만** 적용한 뒤5함수/7컬럼·반환형·권한 검사 통과를 확인했다. 운영 DB에 SQL을 실행했다는 의미는 아니다.
- 사전 SQL을 준비하며 identity 검토의 반환형은 uuid, rematch의 인자 순서는 `(uuid,text,jsonb)`임을 실제 migration과 로컬 조회로 확인했다. 이름만으로 호환성을 판단하지 않는다.
- 원본33개 파일·index·HEAD·branch 보존, 결과 문서의 작업 ID·명세1·BLOCKED 상태 및 게시 파일의 비밀값 제외를 확인한다.

#### 재개 시 실행 순서와 제한

1. 관리자 읽기 연결을 제공받으면 [사전 SQL](supabase/diagnostics/20261022_program_automation_preflight.sql)을 먼저 실행한다. psql이 없는 현재 환경은 연결 도구도 준비해야 하며 자격증명은 로그/명령 인자에 평문으로 남기지 않는다.
2. 자동화5함수/7컬럼을 0/전체/부분으로 구분한다. 실제 미적용0이고 v3/identity/view/권한·기존 receipt가 적합할 때만 승인된 `supabase/migrations/202610220001_program_automation.sql` 전체를1회 적용한다. complete면 재적용하지 않고, partial/signature 차이는 중단한다.
3. 적용 후 관리자 SQL과 API schema를 재확인하고 기존 두 receipt의 ID·note/identity를 포함한 전체 row digest를 비교한다. 적용 실패는 rollback을 확인하고 반복하지 않는다.
4. PF295548 한 공연만 dry-run → 규칙·후보·범위가 기대와 일치할 때만 save한다. before/after analysis/candidate/review 수, 모든 후보 ID/track/outcome/reason과 요청 수를 기록한다. 알려지지 않은 후보의 자동 확정이 나오면 추가 저장을 중단한다.
5. 동일 입력 즉시 재실행의 실제 원격 쓰기0, 기존 확정2건과 신규 브람스 receipt, 서울·대상 기간 API/DTO를 확인한다. 원격 UI를 보지 않았다면 별도 미검증으로 남긴다.
6. daily 자동 처리의 실효 상한1을 별도로 입증하거나 고정 코드·전환 방안을 제시한다. 현재 웹 배치1을 근거로 정기 확장을 허용하지 않는다. 전체 배치/전체 backfill은 계속 제외한다.

안전한 경로 전환이 필요하면 먼저 검증한 버전 디렉터리와 롤백 경로를 준비하고 변경할 action을 구체적으로 제시한다. 사용자 원본을 덮어쓰거나 이번에 예약 action을 임의 전환하지 않는다.

#### 완료 기준 판정

- 완료: 로컬 변경/index 보존, 이번 작업에서 기존 receipt 수정0, 테스트/build와 격리/운영 검증 구분, 현재 문서 게시.
- 미완료: 관리자 운영 SQL, 실제 미적용 판정·필요 시 운영 migration, dry-run/save의 전 후보 결과, 브람스 운영 확정, 실제 재실행 무쓰기, 운영 검색/DTO, 정기 자동 처리 상한1.
- 최종 상태: **BLOCKED**. 조사를 반복 완료한 것으로 운영 활성화 목표를 대신하지 않았다.

### 구현자 의견과 질문

- **Q-001 / 필요한 외부 입력**: 관리자 SQL 접속이 필요하다. `CLASSIC_ATLAS_DATABASE_URL` 또는 이미 인증된 관리자 SQL 실행 연결을 로컬에 설정한 뒤 재개할 것을 요청했다. 현재 REST key를 관리자 SQL 권한으로 해석하거나 우회하지 않는다.
- **Q-002 / 정기 상한의 의미**: 현 코드에서 웹 programBatchSize1과 daily 자동화 이미지20/후보100은 서로 다르다. 명세의 초기 batch1을 자동화에도 실제 적용하려면 전용 상한/선택 범위를 검증해야 한다. 이번에는 정책을 추정해 코드를 바꾸지 않았으며 정기 확장을 승인 상태로 표시하지 않는다.
- **기술 의견 / 중복 receipt**: 지정 SQL은 기존 유효 CONFIRMED receipt는 보존하되, 새 분석에서 중복되는 후보에는 REJECTED receipt를 추가할 수 있다. “새 확정 receipt0”와 “모든 review row 추가0”을 구분해 canary before/after에서 확인해야 한다. 이번 운영 canary는 미실행이다.


## 웹 GPT → Codex: 검토

- 검토한 작업 ID / 명세 버전: CA-AUTO-20261022-001 / 명세 1 결과
- 검토한 결과 SHA: `2c4411bd8d79b663e7a1e616c8dc9577dc259781`
- 운영 SQL·canary 증거: 지정 migration 1트랜잭션 적용, PF295548 dry-run GET8/POST0, save GET9/POST17, 즉시 재실행 GET3/POST0을 결과 JSON과 대조했다.
- 기존 receipt 및 오매칭 방지: 기존 수동 CONFIRMED 2건의 row digest 보존, 브람스 자동 CONFIRMED 1건, 중복 새 CONFIRMED 0, 나머지 14건 REJECTED와 사유 기록을 확인했다.
- 검색 결과: 브람스·쇼팽·리스트가 운영 API에서 PF295548 / EXACT / CONFIRMED로 확인됐다. 실제 브라우저 UI는 미검증이다.
- 판단: **명세 1의 migration과 제한 canary는 PASS**. 그러나 활성 예약 경로가 이미지20·후보100으로 실행될 수 있어 작업 전체는 ACCEPTED하지 않는다.
- 후속 범위: 사용자 추가 지시에 따라 명세 2로 올린다. 특정 육안 사례가 아니라 현재 저장 공연 전체 dry-run → 전용 정기 상한3/30 → 묶음당3/30·누적20/100의 단계적 저장 → 명확한 false negative의 추출·matcher 개선 순서로 진행한다.

## 웹 GPT → Codex: 명세 2 실행 지시

CURRENT_TASK 명세 2를 같은 작업 ID로 진행한다. 먼저 다음 예약 전에 자동 확정 전용 상한을 3이미지/30후보로 분리하고 실제 예약 경로의 plan/preflight에서 확인한다. 이어 전체 eligible queue를 쓰기 없이 조사한 뒤 예상 AUTO_CONFIRMED 목록과 거절 이유를 게시한다.

dry-run과 회귀가 일치하면 여러 공연을 한 묶음3/30, 누적20/100 이하로 저장한다. 각 묶음에서 즉시 재실행 쓰기0과 새 track의 운영 검색을 확인한다. 특정 작곡가나 기존 PF295548에 한정하지 않는다. 결과가 적거나 명확한 후보를 놓치면 CURRENT_TASK D의 제한된 추출·matcher 개선까지 계속한다.

예상 밖 자동 확정, 기존 검색 소실, 실패/재시도 또는 상한 미적용이 있으면 다음 쓰기를 중단하고 BLOCKED로 인계한다.

## 다음 인계

CA-AUTO-20261022-001은 명세 2 READY다. Codex는 결과 SHA `2c4411bd8d79b663e7a1e616c8dc9577dc259781` 이후의 CURRENT_TASK/HANDOFF를 같은 새 명세 SHA에서 읽고 단계적 확대를 수행한다. 명세 1의 migration과 PF295548 canary는 반복하지 않는다.

결과에는 전용 예약 상한, 전체 dry-run 분모, 신규 unique track–concert, 묶음별 쓰기와 무쓰기 재실행, 검색 API, false negative 개선 및 남은 OCR/후보 단계 수를 기록한다.


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

