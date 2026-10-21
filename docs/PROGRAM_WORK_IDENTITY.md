# 확정 공연 검색과 곡 단위 식별 hash

2026-10-21 구현·검증 기록. **운영 SQL 적용, 원격 backfill, 배포는 하지 않았다.**

## 원인과 변경 정책

기존 `server/supabaseConcertSearch.mjs`는 DB 조회와 응답 재검사 양쪽에서
`analysis.catalog_hash === CATALOG_HASH`를 요구했다. `CATALOG_JSON`은
`server/programAnalysis.mjs`에서 전체 works, targets, 작곡가·작품 유형 패턴으로
생성한다. 분석 캐시/저장 키에도 이 전체 hash가 들어간다.

2026-10-20 카탈로그 추가 전후 작품은 86→150개, target은 115→189개가 됐다.
전체 hash는 `71e7924a…`→`a239a933…`으로 바뀌었지만 PF295548의 두 확정 곡 자체는
바뀌지 않았다. DB의 기존 view에서는 여전히 유효한 확정이었고, 서버의 전체
hash 조건 때문에 검색에서 제외됐다. PF300523은 10월 20일 종료로 별도 제외된다.

새 정책은 다음을 모두 요구한다.

1. 선택한 검색 버전의 `CONFIRMED + EXACT + MATCHED` 후보.
2. 현재 카탈로그에 해당 work/track이 존재하고, 확정 영수증의 곡 식별 hash가 현재와 일치.
3. 최신 검토 이벤트와 후보 상태가 일치하고, 확정 당시 근거 fingerprint가 현재와 일치.
4. 현재 이미지·OCR·회차/공연 context와 근거 revision이 유효하고 matcher/pipeline이 호환.
5. 공연 상태·지역·날짜 필터가 유효하고 공연이 종료되지 않음.

전체 `catalog_hash`는 삭제하지 않았다. 분석 출처·캐시·payload 검증과 미확정 후보의
재매칭 필요 여부에 계속 사용한다. 관계없는 곡 추가/충돌 가능성만으로 사람이
확정한 work ID를 다른 ID로 바꾸지 않는다. matcher 의미가 바뀌면 호환 버전을
명시적으로 올려야 한다.

## 곡 식별의 포함·제외 필드

`server/programWorkIdentity.mjs`, schema `work-identity-1`:

| 구분 | 포함 필드 |
|---|---|
| work | id, composer, title, titleEn, alias, aliases, type, cycleId, monthEn, opus, opusPart, opusSuffix, number, bookNumber, catalogue, catalogueNumber, musicalKeys, arrangement, instrumentation, excerpt |
| 해당 work의 targets | trackId, workId, title, alias, movement, movementNumber, arrangement, instrumentation, excerpt |

다른 작품/작곡가의 항목, 전체 정규식 사전, 감정 점수, Energy, Summary, Background,
감상 포인트, YouTube/재생 구간, 이미지, UI 순서, 추천 필드는 제외한다.
`musicalKeys`는 실제 matcher가 사용하므로 포함한다. 설명문 변경으로부터 파생되는
조성 정보 자체가 달라지면 이는 식별정보 변경으로 취급한다.

NFKC, 유니코드 하이픈, ASCII 공백만 정규화한다. 대소문자는 보수적으로 보존한다.
객체 키는 UTF-8 순서, 배열은 정규화 후 중복 제거·정렬, 누락 scalar는 null,
aliases/musicalKeys는 빈 배열로 고정해 SHA-256을 계산한다. OCR 원문은 수정하지 않는다.
SQL과 JS가 현재 150개 작품 및 null/공백 경계 사례에서 같은 hash를 생성하는 것을 검증했다.

## 저장·권한·근거 보호

새 SQL: `supabase/migrations/202610210001_program_work_identity.sql`.
이미 적용된 `supabase/drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql`이 선행 조건이다.
새 migration은 하나의 트랜잭션이며 데이터 backfill을 자동 실행하지 않는다.

- 기존 review 이벤트에 식별 snapshot/hash, 출처, Git commit, attestation 시각,
  matcher/pipeline, 근거 fingerprint를 추가한다.
- 이벤트 ID·메모·상태·검토 시각은 변경할 수 없다. legacy null→검증된 attestation만
  전용 RPC에서 한 번 허용한다. attestation 이후에는 수정할 수 없다.
- 근거 fingerprint에는 후보 관계/identity/인용문/bbox, 분석의 OCR·시도·revision·context,
  OCR 원문의 SHA-256·이미지 content hash·detections·settings·해상도·pipeline을 묶는다.
- backfill/새 확정 시 immutable 분석 snapshot(또는 rematch snapshot)과 후보 필드를
  대조하고, 저장 OCR의 인용 구간을 재검증한다. 근거가 없는 v2 snapshot은 자동
  backfill하지 않으며 재분석/수동 재검토가 필요하다.
- null identity hash는 항상 `CONFIRMATION_IDENTITY_MISSING`으로 검색 제외한다.
  전환 기간 무기한 허용이나 전체 hash로의 fallback은 없다.
- 전체 catalog만 달라진 새 분석이 생성돼도 OCR/시도/revision/context가 모두 같다면
  예전 확정의 근거는 유지한다. 기존 후보·검토 이력을 덮어쓰지 않는다.
- view의 `is_effectively_confirmed`는 DB가 검증할 수 있는 영수증/근거 상태이다.
  실행 중인 카탈로그와의 최종 hash 비교는 서버 검색과 `show`에서 수행한다.
  따라서 view만 직접 조회한 결과를 최종 공개 검색 판정으로 사용하면 안 된다.
- reviews RLS를 명시하고 PUBLIC/anon/authenticated 접근을 차단한다. service_role은
  SELECT/INSERT만 가지며 legacy UPDATE는 검증된 SECURITY DEFINER RPC 내부에서만 한다.
  모든 새 함수는 기본 PUBLIC execute를 제거하고 필요한 service_role execute만 부여한다.
  trigger 직접 execute와 기존 hash-only review RPC는 service_role에도 허용하지 않는다.
  SECURITY DEFINER의 search_path는 빈 값이다. 새 테이블/sequence는 없다.
- cleanup 소유 그래프로의 새 inbound FK를 만들지 않는다. rematch는 원본과 같은
  analysis에만 속하며 기존 analysis cascade가 두 행을 소유한다.

`show`는 확정/현재 work hash, 일치 여부, 전체 hash 차이, 전체 hash가 제외 원인인지,
최종 `is_effectively_confirmed`와 구체적인 stale reason을 보여준다. 만료도 별도 판정한다.

## 저장된 후보만 재매칭

`program:analyze rematch`는 저장된 작곡가–작품 identity와 모든 언어 variant에 기존
matcher를 적용한다. OCR/이미지/KOPIS는 호출하지 않는다. 기존 원문·bbox를 보존하며
새 후보는 항상 `REVIEW_REQUIRED`이다.

검토 이력이 있는 후보와 동일 근거의 다른 수동 검토 후보는 보호한다. 오래된/종료된
근거는 건너뛴다. 새 행은 원본 후보+전체 catalog hash로 유일하고 완전한 rematch payload
hash를 검사한다. 같은 입력 재실행은 같은 ID를 재사용하며 결과가 달라지면 version
guard가 차단한다. 원본 후보와 분석 snapshot, 기존 검토 이벤트를 수정하지 않는다.
새로운 재매칭 결과가 같은 원본의 미검토 결과를 대체해도 수동 확정/반려는 보존한다.

목록은 review version을 유지하면서 `matching_catalog_hash`와 `rematch_required`를
표시한다. 새 SQL 없는 실행은 분석 저장/배치 preflight에서
`PROGRAM_WORK_IDENTITY_MIGRATION_REQUIRED`로 중단한다. **이 코드가 로컬 예약에 사용되는
동안 SQL을 아직 적용하지 않았다면 다음 예약 run도 실제 처리 전에 중단된다.**
예약 설정과 환경변수는 이번 작업에서 변경하지 않았다.

## 실제 자료로 확인한 결과

고정 Git 근거: `30e8e8d6fca45a0d97248c2b784513d4d93aeeba`.
이 commit으로 재구성한 전체 카탈로그 hash가 DB의 과거 snapshot과 정확히 일치한다.
Git checkout/fetch 없이 임시 로컬 모듈로 읽고 처리 후 정리했다.

| 후보 | 곡 | 과거 Git / 저장 snapshot / 현재 식별 비교 | backfill |
|---|---|---|---|
| 47de9d71-3fcb-4fce-9d52-a557d5584cce | chopin-ballade-op52-no4 | 모두 동일 | 가능 |
| 22949f59-855a-4755-a136-2091f0783f3b | liszt-liebestraum-s541-no3 | 모두 동일 | 가능 |

공연은 PF295548, 종료일 2026-10-27이다. 기존 review/analysis와 immutable snapshot의
후보 내용, OCR 인용문, 시도 content hash/pipeline, 현재 revision을 확인했다.
외부 원본 이미지 바이트는 내려받지 않았으므로 원격 URL의 현재 바이트까지 새로
확인했다는 뜻은 아니다.

실제 DB의 두 공연 자료(공연 2, 이미지 4, OCR 2, 시도 2, 분석 4, 후보 23, 검토 3)를
GET으로 읽어 격리 PGlite에 복제했다. migration과 두 대상 backfill을 **로컬에서만**
실행하고 각각 반복 호출해 멱등성을 검증했다.

| 2026-10-21 기준 검색 | 로컬 migration 직후/null proof | 로컬 검증 backfill 후 |
|---|---|---|
| 쇼팽 발라드 | 0개 | PF295548, 1개 |
| 리스트 사랑의 꿈 | 0개 | PF295548, 1개 |
| PF300523 | 종료로 제외 | 계속 제외 |

복구 예상은 연결 2건, 고유 미래 공연 **1개**이다. 검토 이벤트는 3건 그대로이고
기존 ID·메모·검토 시각을 보존했다. 원격에는 backfill을 실행하지 않았다.

현재 v3 전체 후보 메모리 재매칭은 처리 83, 재사용 0, 제외 22, 실패 0, 새 연결 1이다.
새 연결은 PF295548의 `6598e70e-94df-44c6-b043-ad7358048c0b`에서
`brahms-intermezzo-op118-no2`로 나왔다. 저장/확정하지 않았으며 공개 검색에 포함되지 않는다.
이 숫자는 2026-10-21 조회 시점의 값이고 이후 유입/갱신에 따라 달라질 수 있다.

GET-only 강제 guard로 backfill/rematch dry-run 12회와 실제 자료 복제 9회의 Supabase
GET을 사용했다. 원격 DB 쓰기, 이미지 다운로드, OCR, 배치 실행은 모두 0회다.
진단 JSON은 Git에서 제외된 `.cache/program-identity-20261021/`에 있다.

## 별도 승인 후 적용 순서와 명령

이번에는 아래 쓰기/배포 명령을 **실행하지 않았다**. 실행 직전에 최신 근거로 다시
dry-run해야 한다. 과거 manifest를 맹목적으로 적용하지 않는다.

1. 테스트 및 이 문서와 SQL을 검토한다. 원격 v3 draft 적용 여부를 확인하고 새 migration
   **한 파일 전체만** SQL Editor 또는 기존 관리 연결에서 트랜잭션으로 적용한다.
   v3 draft 자체를 재실행하거나 migration 전체를 무작정 push하지 않는다.
2. 새 서버 코드를 사용하는 로컬 CLI로 읽기 전용 preflight와 dry-run을 다시 실행한다.

```powershell
Set-Location C:\Users\CNXK\dev\sound-atlas
npm.cmd run program:analyze -- preflight
npm.cmd run program:analyze -- identity-backfill --dry-run --kopis-id PF295548 --git-ref 30e8e8d6fca45a0d97248c2b784513d4d93aeeba
```

승인할 JSON manifest는 npm 배너가 섞이지 않도록 직접 Node CLI 출력으로 UTF-8 저장한다.
PowerShell 기본 `>`는 UTF-16이 될 수 있으므로 아래 방식을 사용한다.

```powershell
$planText = & node --env-file-if-exists=.env scripts/runProgramAnalysis.mjs identity-backfill --dry-run --kopis-id PF295548 --git-ref 30e8e8d6fca45a0d97248c2b784513d4d93aeeba
if ($LASTEXITCODE -ne 0) { throw 'identity dry-run failed' }
[IO.Directory]::CreateDirectory((Join-Path $PWD '.cache\program-identity-20261021')) | Out-Null
[IO.File]::WriteAllText((Join-Path $PWD '.cache\program-identity-20261021\approved-backfill.json'), ($planText -join "`n"), [Text.UTF8Encoding]::new($false))
```

3. JSON의 eligible=2, 위 두 candidate/review UUID와 세 식별 hash의 동일성을 직접 확인한다.
   불일치·만료·새 OCR·식별 변경이면 중단하고 수동 재검토한다. 승인 후 이 2건만 backfill한다.

```powershell
npm.cmd run program:analyze -- identity-backfill --save --identity-manifest .cache/program-identity-20261021/approved-backfill.json
npm.cmd run program:analyze -- show 47de9d71-3fcb-4fce-9d52-a557d5584cce
npm.cmd run program:analyze -- show 22949f59-855a-4755-a136-2091f0783f3b
```

4. `show`에서 hash 일치, 최종 유효성, 검토 이력 보존을 확인한다. Preview에 별도 승인 후
   배포하여 서울/2026-10-21~2026-10-27, 위 두 곡 각각 PF295548 1개와 비밀정보 비노출을
   검증한다. 통과한 동일 소스만 별도 승인 후 Production에 배포한다.
5. 미확정 후보 재매칭은 별도 dry-run/승인을 거친다. 공개 검색 복구에 필수인 단계는 아니다.

```powershell
npm.cmd run program:analyze -- rematch --dry-run
npm.cmd run program:analyze -- targets --kopis-id PF295548
```

저장할 때는 targets 출력에서 운영자가 승인한 OCR만 `program-ocr-manifest-2`로 고정한다.
필수 필드는 `schema_version`, `expected_count`, `targets[]`이고 각 target은
`kopis_id`, `ocr_result_id`, `image_id`, `source_attempt_id`, `image_revision`,
`concert_revision`이다. 1~100개, OCR 중복 금지이며 파일을 직접 검토한다.
파일 경로를 실제 승인 파일로 바꾼 후에만 다음을 실행한다.

```powershell
npm.cmd run program:analyze -- rematch --dry-run --version stored-program-3 --ocr-manifest .cache/approved-rematch.json
npm.cmd run program:analyze -- rematch --save --version stored-program-3 --ocr-manifest .cache/approved-rematch.json
npm.cmd run program:analyze -- list --kopis-id PF295548 --version stored-program-3
```

기존 initial canary manifest는 종료/변경된 근거가 포함될 수 있으므로 전체 rematch용으로
자동 재사용하지 않는다. 새 연결은 별도로 원본 검토 후에만 사람이 확정할 수 있다.
재확정, 검색 버전/예약 게이트 변경, matcher 버전 변경은 이번 수정의 필수 절차가 아니다.

## 변경 파일과 검증

- `server/programWorkIdentity.mjs`: 곡 단위 canonical identity와 최종 유효성.
- `server/programIdentityBackfill.mjs`: 고정 Git 증명, null receipt의 명시적 backfill 계획/실행.
- `server/programRematch.mjs`: 저장 identity만 사용하는 멱등 재매칭.
- `server/supabaseProgramAnalysis.mjs`, `scripts/analyzeConcertPrograms.mjs`: CLI/검토/진단·guard.
- `server/supabaseConcertSearch.mjs`: 공개 검색의 곡별 proof 및 DTO 비노출.
- `server/pipelineRepository.mjs`, `server/concertPipeline.mjs`: schema preflight·재매칭 검토 집계.
- 새 SQL, identity 단위/SQL 테스트, 기존 검색·rollout·버전·cleanup·CLI fixture와
  `scripts/testProgramAnalysis.mjs`: 새 proof 모델에 맞는 회귀 검증.

실행할 검증은 `npm.cmd run test:program`, `npm.cmd test`, `npm.cmd run build`,
`git diff --check`와 브라우저 bundle/수정 파일의 실제 비밀값 검사다.
SQL 테스트는 전부 격리 PGlite이며 anon/authenticated의 내부 테이블·RPC 접근 차단,
service_role의 직접 review 수정 차단, trigger의 불변성, 재시도·payload 충돌을 검증한다.

최종 확인: 관련 테스트 109개, 전체 테스트 331개 통과, 프로덕션 빌드 성공,
`git diff --check` 통과. 500 kB chunk 크기 경고는 남아 있다. 수정/신규 파일 19개와
브라우저 산출물 18개에서 실제 로컬 비밀값을 검사해 유출 0건, 클라이언트의 서버 전용
환경변수 참조 0건이다. `.env`는 계속 Git 제외 상태이며 HEAD는
`f03f636a5c8d445098f1c47fd4e6e2ea4393a934` 그대로다.

운영 API를 GET 3회로 다시 확인했으며 Supabase / stored-program-3, 두 곡 모두 여전히
0건이었다. 이번 작업으로 운영 검색을 바꾼 것은 아니다. 로컬에서 복구 가능성을
검증한 상태이며 승인된 SQL·backfill·배포가 별도로 필요하다.

공개 검색 코드를 새 SQL 없이 배포하면 필요한 view 필드가 없어 503으로 안전하게
실패한다. 새 코드만 먼저 운영에 배포하지 않는다. SQL 적용만으로 legacy null proof가
자동 복구되는 것도 아니다. 반드시 검증된 backfill과 새 검색 코드가 함께 필요하다.
