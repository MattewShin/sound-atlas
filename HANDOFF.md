# 작업 인계

- 작업 ID: CA-CONCERT-RELIABILITY-20261029-001 / 명세1
- 상태: BLOCKED / Gate A
- 작성: Codex / 2026-10-29 Asia/Seoul
- 읽은 공동 문서5개·코드 기준: main / 7cc7f7b88274db228748cd5aa7fa8775fd5db64a
- 브랜치: codex/ca-concert-reliability-20261029-001
- 사용자 실행 지시의 원인 미확정 시 중단 조건에 따라 기존 production을 변경하지 않았다.

## 확인된 사실

사용자가 알려준11:04:53/11:04:58 KST 화면 오류는 정확한 요청 시각이 아닌 관측 시각이며, 브라우저 확장 오류는 공연 API 근거가 아니라고 명시했다. 이를 기준으로 Vercel production 요청 로그10:55~11:15를 읽었다.

| 실제 요청 시각 KST | 목록 GET HTTP | requestId |
| --- | --- | --- |
| 11:04:53.479 | 502 | 7zzsg-1793239493479-5b85ca858b77 |
| 11:04:58.388 | 502 | w2dgb-1793239498388-dd2a9714d2a5 |

두 요청은 동일 production deployment에서 확인됐고, 앱 내부 목록 실패를 검증했다. Vercel CDN cacheResult=MISS도 있었으나 이것은 서버 Map 캐시의 hit/miss나 cold start 증거가 아니다. 당시 runtime 로그는 보존기간 제한으로 조회가 거절됐다. 현재30분 runtime 조회는 성공했지만 로그0건이며 start type·duration 등 필요한 invocation 자료가 없다. **HTTP502는 확인했으나 KOPIS HTTP 오류/timeout/connect/XML 실패 중 원인, 실패 state/page, cold start 여부는 확인하지 못했다.**

기존 server/kopis.mjs는 fetch/network·timeout·non-2xx 등을 공통 오류로 바꾸고 page/HTTP/duration/cause를 보존하지 않는다. 과거 502의 upstream 상태나 실패 페이지를 현재 코드만으로 복원할 수 없다. 메모리 Map만 존재하고 만료 후 실패 시 과거 성공을 반환하는 경로도 없다. 이 구조적 취약점은 확인했지만 이를 이번 두 실패의 트리거 원인으로 단정하지 않는다.

## 이번 실제 호출과 검증

- production 앱 **GET4/업무POST0**: status200/690ms, 서울10/29~11/28·CCCA 목록200/303건/cache334ms, refresh200/4028ms·303건, PF281769 상세200/cache227ms·예매링크4/소개1장. 원문/실제 URL은 기록하지 않았다.
- 직접 KOPIS **GET13**: 목록3회×각4페이지(01:100/100/84행,02:19행), 상세PF2817691회. 전부200/XML 정상,208~414ms. 키·전체 query·본문·예매 URL 대신 kind/state/page/HTTP/행 수/시간만 저장했다. 고정3개 독립 검증이며 한 요청 내 자동 재시도0이다. 이번에는 실패 재현0이다.
- production 내부 KOPIS 호출 수는 기존 계측 부재로 **미확정**이다. 위4 앱 GET과13 직접 GET을 내부 호출까지 포함한 upstream 전체 수로 보고하지 않는다.
- Vercel CLI 로그 읽기 조회9회(최신/retention 범위 보정/과거 구간). 최근 요청 로그에는 공연 API9건 모두200, 사용자 시각의 과거 구간에는 위502 두 건이 있었다. raw log/메시지/클라이언트 정보/예매URL/전체 query는 저장0이다. CLI 내부 HTTP method 수는 계측하지 않았으며 앱/DB 업무POST 수와 구분한다.
- **DB GET0/업무POST0·DDL/DML0, OCR/Program/자동판정 요청·쓰기0.** 실제 장애 주입0, migration 작성/적용0, 정책 변경0, 새 예약0이다.
- 격리 fixture5/5 PASS: fresh 메모리 재사용, 새instance에서 이전 성공 재사용 불가,7시간 전 성공에 대한 장애 fallback 부재, 부분페이지 실패 시 기존 정상 Map 불변, HTTP/timeout/connect 예외 분류 합침. 이 결과는 현재 취약점 진단이며 fallback 구현 성공이 아니다.
- 변경하지 않은 main baseline **npm test93/93 PASS·fail0/skip0·24.169초**, production build PASS 각1회. 이 통과를 아직 만들지 않은 영구 캐시/24시간 stale/cold start 내구성 검증으로 표현하지 않는다. 기존500kB chunk 경고 유지다.

## 보존·미완료·정확한 재개점

기능 코드·음악 추천/보관/취향/주간UI·기존 DB 이력/적용 migration은 수정0. main/production SHA 7cc7f7b88274db228748cd5aa7fa8775fd5db64a 유지, main 병합/배포0. ClassicAtlas-LocalPipeline Disabled/Enabled=false를 읽기 전용 확인했고 action·trigger 변경0이다. 원본 local main/1607ca201c3a559bc7f28aabe998ef062db02ef9의40개 파일/index/.env hash를 시작/종료 대조해 보존했다.

**Gate A / ROOT_CAUSE_UNDETERMINED**에서 중단한다. Gate B의 별도 영구 cache table·fresh6h/stale24h·업데이트 시각 안내·fallback 상세/20건·375px 검증은 미구현/미검증이다. 원인 미확정 상태로 migration이나 캐시 업무POST를 먼저 수행하지 않았다. [안전한 증거 JSON](docs/CONCERT_RELIABILITY_DIAGNOSIS_2026-10-29.json).

재개에는 보존기간 내 실패 요청의 upstream 단계·state/page·시간·HTTP/XML 결과와 cold start 정보를 묶을 수 있는 관측 근거가 필요하다. requestId 두 개는 확보했지만 이미 지워진 함수 로그를 제공된 것처럼 취급하지 않는다.

## 구현자 기술 의견 — 아직 실행하지 않은 권장안

1. 기존 오류를 유지한 채 추정으로 원인을 정하지 말고,5개 허용 단계 코드와 안전한 숫자 metadata만 남기는 최소 진단 계측을 격리/preview에서 검증해 관측 방법을 먼저 정한다. HTTP 상태·page/state·duration·correlation은 원문/query 없이 연결해야 한다. 이번에는 진단 코드를 production에 배포하지 않았다.
2. Map은 instance-local이므로 Gate B의 cold start 내구성을 만족하지 못한다. Gate A 재개 후 별도 kopis browser cache table만 사용하고 기존 OCR/Program/receipt 테이블·정책은 건드리지 않는 설계가 적합하다.
3. 동일 지역/날짜 key의 전체01/02 페이지 검증 성공만 atomic 저장하고 상세는mt20id key로 저장한다.6h fresh/실패 시24h 이내 stale, source/fetchedAt/stale를 분리하며 부분 성공·다른 날짜 캐시로 덮어쓰지 않는다. 브라우저가 stale를 새 성공 시각으로 캐시하지 않도록 원래 fetchedAt을 유지해야 한다. 이 항목은 구현/검증 결과가 아닌 다음 단계 의견이다.

새 명세·결과 문서만 작업 브랜치에 게시한다. 최종 상태를 OPERATIONAL이나 ACCEPTED로 표시하지 않는다. 이전 main 인계는 docs/collaboration/archive/CA-CONCERT-BROWSER-20261029-001에 보관했다.
