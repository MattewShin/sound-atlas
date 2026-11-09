# 작업 인계 — OCR 영구 폐기 준비

- 작업 ID: **CA-OCR-RETIRE-20261109-001 / 명세1**
- 상태: **IMPLEMENTED / 검토 전(ACCEPTED 아님)**
- 작성일: 2026-11-09 Asia/Seoul
- 결과 브랜치: **codex/ca-ocr-retire-20261109-001**
- 기능·migration 전체 SHA: **e8e204e31d0bf5c401fec2e12641c8183a0fb219**
- 시작 main 및 재확인한 실제 production SHA: **2552f5b021238b65a8c4d2e235a342b12e498cde**
- 문서 저장 HEAD는 GitHub 브랜치/PR의 커밋 이력에서 확인한다. 코드 커밋 뒤 문서만 보완하며 기능 코드 추가 미커밋 변경은 없다.
- 원래 IDE branch **codex/ca-social-20261106-001 / 8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e** 및 사용자 미커밋/비추적 변경, 실제 .env/모델 보존. 별도 worktree **.cache/ocr-retire-20261109**에서 작업했다.

## 결과와 검토 위치

사용자의 새 정책에 따라 OCR 확정3건과 모든 OCR 이력을 보존하지 않는 삭제 migration을 준비했다. 이는 과거 감사의 보존 권장안을 대체한 명시적 제품 정책이다. **운영에는 아직 적용하지 않았다.**

- [삭제/유지 전체 목록·코드 경로·운영 적용/backup/rollback/lock·모델 안내](../../../../OCR_RETIREMENT.md)
- [실제 운영 사전 관측과 격리 적용 전후를 분리한 증거 JSON](../../../../OCR_RETIREMENT_VERIFICATION_2026-11-09.json)
- [명시적 migration](../../../../../supabase/migrations/202611090001_retire_ocr.sql), [typed manifest](../../../../../supabase/retirement/ocr-20261109-manifest.json)
- [읽기 전용 preflight](../../../../../supabase/retirement/ocr-20261109-preflight.sql), [읽기 전용 postflight](../../../../../supabase/retirement/ocr-20261109-postflight.sql)

삭제 예정은 **테이블5·view1·trigger1·함수22·FK11**이다. 다섯 테이블의 현재601행/확정3건을 포함해 적용 시 모든 행을 삭제하며 보존 테이블로 옮기지 않는다. 현재 대상 할당량3,792,896 bytes(3.62 MiB), 앱 구조는26→21 table,65→43 function,4→3view,38→27FK,15→14앱 trigger가 된다. 이 수치는 운영 적용 후 관측이 아니라 기대 구조와 격리 실제 결과다.

## 운영 재검증과 safety

10:21~10:28 KST 운영 카탈로그/COUNT와 문자열 본문 이름 참조/호출·다른 schema 참조를 재조회해 감사 대비 새 의존성이 없음을 확인했다. 실제 main/production도 기준 SHA와 같았다. **11:02:34 KST 최종 preflight SQL 자체를 운영 READ ONLY transaction으로 실행해 PASS**를 확인했다. SQL 파일 SHA256도 증거에 저장했다. 테이블/본문·API 쓰기·관리 RPC는 실행하지 않았다. 데이터는 count/크기/유효성 집계만 다뤘고 접속정보·키·토큰·Auth UUID·사용자 본문은 문서/로그/커밋에서 제외했다.

정확한 table/열/view/함수·procedure 정의/trigger/RLS 정책·전체 constraint와 FK 계약을 검사한다. 다른 schema의 문자열 함수/view 참조, RLS/compiled dependency 및 새로운 inbound FK도 차단한다. CRLF→LF만 정규화한 함수 지문은 동일 코드의 Windows 줄끝 때문에 오판하지 않도록 한 것이며, 운영 함수나 정책을 재작성하지 않는다. 실제 공개 RLS role 배열은 PG catalog text 표현으로 고정한다. 예상 schema 차이는 IF EXISTS로 무시하지 않으며 source와 무관한 새 앱 객체도 별도 검토를 요구할 수 있다.

삭제 순서는 view/identity trigger/명시적 RESTRICT 함수22 → FK11 → 테이블5이며, 단일 BEGIN/COMMIT과 전후 유지 지문 검증을 사용한다. DROP CASCADE/TRUNCATE는 없다. 기존 plan/delete cleanup을 호출하지 않는다. 대상5개 ACCESS EXCLUSIVE NOWAIT, 다른 lock 대기3초/statement30초이며 공유 부모/catalog 경합 가능성이 있어 무중단을 보장하지 않는다. 실제 다중 session lock 시간은 미검증이다.

## 유지·코드 정리와 구현자 의견

공연/이미지 URL 메타데이터/catalog/version policy/text3개/cleanup 영수증8개와 현 서비스13개 테이블, 공유 identity4개 함수 및 text 저장/후보 조회/확정/불변 trigger·수집 sync/helper를 유지했다. migration은 이 데이터/ACL/RLS를 변경하지 않는다. 격리21개 table의 모든 합성 행 지문·유지 함수 정의/ACL·정책·trigger가 전후 같고 기존 text 확정2건도 유효했다. 삭제 후 신규 KOPIS sync→text save→confirm까지 성공했다.

기준 main은 이미 worker/인식 pipeline/Python·인식 dependency를 제거한 상태다. 따라서 과거 제거를 이번의 신규 삭제로 보고하지 않는다. 이번에는 그때 빠진 공식 text 순수 코어/수집을 frozen SHA1db327cd38dfce778da543738f975b70789aed66에서 **server/programText/**로 분리하고 이미지 fallback·인식 config/engine import·legacy 검토/재매칭 진입점을 제거했다. 새 운영자 text CLI는 명시적 scope/default dry-run, daily 별도 enable, collection/coordinator/새 confirmation 각1회 제한을 유지한다. 일일 dry-run도 기존 공식 source를 분석하되 GET만 한다. 기존 v4 합성6개 payload/catalog hash 일치로 의미 변경을 검증했다. 과거 숫자 모호성 reason enum은 호환 상수로 유지했으며 engine이 아니다.

삭제 테이블·RPC/view/trigger 이름의 app/server/script/test 직접 참조0, 인식 npm dependency0/Python 코드0이다. guard/manifest·격리 역사 fixture·옛 migration/audit는 실행 경로와 구분한다. OCR 수동 SQL7개는 원문100% 그대로 history의 .sql.txt로 옮겼고 옛 실행 문서에 폐기 안내를 붙였다. old App/곡 ID/평가 데이터·현재 KOPIS API/cache를 덮어쓰지 않았다. text CLI/운영 scripts/SQL/test helper/fixtures를 Vercel 입력에서 제외했고 실제 API 번들 입력8개에 text/인식 경로가 없다.

삭제 함수 중 cleanup5개는 OCR graph에 결합된 폐기 배치다. 이를 남기면 삭제 table의 문자열 참조와 깨진/불필요한 삭제 RPC가 남으므로 함께 제거하도록 제안/구현했다. 사용자 요구의 cleanup 영수증·공유 date helper2개는 유지하며 공식 text에서 이 cleanup5개를 쓰지 않는다. 이 결정과 전체 이름/인자는 상세 안내/manifest에서 검토한다.

## 실제 예약·설정·모델

Windows ClassicAtlas-LocalPipeline은 Disabled/Enabled=false, 마지막2026-10-29 08:40 KST/결과0이다. frozen320개 hash 동일, OCR/analysis/cleanup=false와 공식 text/collection=true를 재확인했다. 실제 task/launcher/verify도 실행/변경하지 않았다. **옛 target을 그대로 재활성화하지 말고 별도 승인 단계에서 새 text CLI checkout으로 retarget 후 검증해야 한다.** 현재 원래 WIP와 ignored frozen release는 보존돼 있으며 배포물에 포함되지 않는다.

실제 DB cron/pgagent·Vercel cron 없음. Vercel production/preview의 PROGRAM_SEARCH_VERSION, 로컬 PROGRAM_SEARCH_VERSION/PROGRAM_ANALYSIS_SCHEDULE_ENABLED는 이름만 확인했고 이번에 실제 값을 수정/제거하지 않았다. 새 코드에 사용처가 없으며 운영 정리 목록이다. 저장소 env 예시는 text 전용 schedule=false만 추가했다.

모델 **.cache/easyocr/models/craft_mlt_25k.pth**(83,152,330 bytes), **korean_g2.pth**(16,081,533 bytes), 합계94.64 MiB를 확인했고 인식 Python process 관측0이다. 모델/가상환경은 삭제하지 않았다. 별도 파일 단위 로컬 정리 명령은 상세 안내에 준비했다. 다른 PC의 수동 사용은 확인 불가다.

## 최종 검증

환경: Windows PowerShell, Node22.18.0, 기존 lockfile 기반 npm ci, PGlite/JSDOM, mock HTTP/SDK, 실제 JSX/esbuild/Vite. 운영 사용자 자료 대신 합성 데이터만 사용했다.

| 명령 | 결과 |
| --- | --- |
| npm test | **162/162 PASS**, fail/skip0. 기존 보관함·기록·공유·검색·cache·Auth/session/API/Realtime 계약·모바일 typography 포함 |
| npm run test:social | **5/5 PASS**, fail/skip0. 기존 SNS SQL은 폐기 후 schema에서 회귀 |
| npm run test:retirement | **15/15 PASS**, fail/skip0. 실제 격리 삭제/10유형 schema·참조 차단/late rollback/text 유효성·신규 확정/TOC ACL·RLS 누락 거부 |
| npm run verify:retirement | **PASS**. source119개·삭제 객체 직접 이름 참조0, API 번들8개·인식/text CLI 포함0, 금지 DDL0 |
| npm run build | **PASS**.106 modules, JS875.48 kB/gzip224.84 kB, 기존500 kB chunk 경고 유지 |
| 게시 검사 | 실제 env 비밀/접속값·JWT 패턴/최종 로그 제외, UTF-8·신규 링크·고정 SHA 근거, 원래 파일52개 hash/HEAD/문서 보존, 보호 UI/API/cache/평가/lockfile 무변경 PASS |

처음 격리 fixture의 date 표현·실패 주입/비교 기준·정책 role 배열 직렬화와 Windows 줄끝 차이에서 나온 검사 실패를 바로잡고 최종 결과를 위처럼 확인했다. safety 검사를 생략해 통과시키지 않았다. 기존162개 회귀를 다른 미커밋 worktree의 과거 결과로 대신하지 않았다.

실제 OAuth/클라우드 PostgREST/Realtime/모바일 실기기 검증, 새 논리 backup/실제 archive 복원, 운영 삭제 및 post-migration 관측·다중 session lock 실측은 **미검증**이다. 이번 mock/격리 결과를 실제 클라우드 검증으로 표현하지 않는다. Docker/별도 cloud project는 설치/생성하지 않았다.

## Backup/rollback·남은 운영 단계

운영 적용 직전 새 logical archive·checksum/TOC 및 격리 OCR-only restore 확인이 필요하다. 준비한 TOC selector는 tables/data5·function/ACL22·view1·trigger1·FK11·PK/UNIQUE8·secondary index5·ROW SECURITY5·relation ACL6을 요구하며 유지 사용자 table data를 제외한다. **기존11월6일 private archive의 목록95개 선별만 검증했고 새 backup이나 restore는 하지 않았다.** PGHOST/PGPASSWORD 등 안전한 session과 제한 ACL, 실제 적용/복구 명령은 상세 안내에 있다.

COMMIT 전 오류는 전체 rollback, COMMIT 후 데이터는 자동 복구되지 않는다. 우선 text 작업 정지/범위 확인과 수정으로 해결하고, OCR graph 복원이 꼭 필요하면 별도 승인으로 검토된 OCR-only TOC를 단일 transaction restore한다. 현재 Auth/원본/공유/SNS를 과거 snapshot으로 전체 덮어쓰거나 RLS/불변 trigger를 해제하지 않는다. backup은 제한된 임시 복구물이며 별도 서비스 보존본을 만들지 않는다.

**이번 실행은 새 브랜치·코드/SQL·test/build·문서·Draft PR 게시까지만이다. 운영 DDL/DML/migration, main 병합, 운영 배포, 실제 예약/환경변수 변경, 모델 삭제 모두 미실행.** 다음 검토자는 전체 삭제/공유 유지 경계와 strict manifest, backup 실복원 및 잠금/retarget 운영 절차를 검토해야 한다. Draft PR 검토 후 별도 운영 승인을 받는다.

이전 CA-OCR-DB-AUDIT-20261109-001/명세1의 [명세·인계 보관](../../CA-OCR-DB-AUDIT-20261109-001/spec1)과 SNS 명세2 보관본을 함께 포함했다. 과거 정책/운영 승인을 이번 삭제 승인으로 혼동하지 않는다.
