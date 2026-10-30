# 작업 인계

- 작업 ID: CA-CONCERT-RELIABILITY-20261029-001 / 명세3
- 상태: OPERATIONAL / production 정상 조회·모바일 확인 완료
- 작성: Codex / 2026-10-30 Asia/Seoul
- 읽은 브랜치: codex/ca-concert-reliability-20261029-001
- 읽은 공동 문서·코드 SHA: bd76fb23766c10a8be903a8a579036f2ef8ea424
- 기존 main·production: 7cc7f7b88274db228748cd5aa7fa8775fd5db64a

## 구현

server/concertCache.mjs의 서버 전용 Supabase REST adapter가 별도 concert_browser_cache 테이블만 읽고 쓴다. list key는 지역/기간/CCCA/상태의 SHA256, detail key는mt20id다. 저장 payload는 공개 필드만 양의 목록으로 추출한다. 원문/XML·upstream query·인증정보를 저장하지 않는다. 단일 목록은 전체01/02 pagination이 끝나야 한 번 POST upsert한다. 페이지별 저장·기존 OCR/Program 테이블 재사용은 없다.

server/kopis.mjs는 memory→Supabase→KOPIS 순서로 캐시를 읽는다.6h 미만 fresh, 정확한6h부터 갱신을 시도하고 실패 시24h 이내(정확한24h 포함) stale를 원래 timestamp로 반환한다.24h+1ms와 미래 timestamp는 거부한다. 복구 시 새 완전한 응답으로 갱신한다. 상세 캐시는 별도 key다. 같은 instance의 진행 중 조회를 합치고 자동 retry는 하지 않는다.

src/data/concertSearch.js도 stale를 fresh로 재사용하거나 새 시각으로 바꾸지 않는다. 알고 있는 page/상세에 대한 서버 함수 실패는24h 이내만 browser-cache로 명시하며, 응답을 기다리다 만료된 경우도 다시 검사한다. 목록의 기존 KST 날짜별 key를 유지해 날짜가 바뀐 브라우저 페이지를 새 날짜의 정상 결과로 취급하지 않는다. 서버는 영구 전체목록에서 종료 공연을 재필터한다. hook이 상세 metadata를 보존하고 ConcertScreens는 stale일 때만 지정 문구·실제KST시각을 표시한다.

API X-Request-ID와 upstream 로그의 requestId를 연결한다. 로그 필드는 httpStatus/stage/page/upstreamType/durationMs/requestId뿐이다. timeout/connect/HTTP/XML/부분페이지 및 cache read/write 단계를 구분하며 URL/query/예외본문/예매URL은 로그에 없다. 함수가 실행되지 못한 플랫폼 실패는 앱 로그가 생길 수 없고 플랫폼 로그 및 client 오류와 구분한다.

## 실제 검증

| 검증 | 결과 |
| --- | --- |
| 직접 관련 최종 |26/26 PASS·fail0/skip0 |
| 전체 npm test 최종 |109/109 PASS·fail0/skip0·25.316초 |
| production build 최종 |PASS·5.17초, 기존 큰 bundle 경고 유지 |
| SQL 격리 |PGlite0.3.14, table1개·RLS·최소권한·기존 history·원자 upsert·제약 통과 |
| 장애 fixture |timeout/HTTP503/XML/network/부분페이지 실패에서 원래 snapshot 불변, DB갱신0 |
| 경계·복구 |6h-1ms fresh/6h exact 갱신/24h exact stale/24h+1ms 거부/미래시각 거부/대기 중 만료/복구 정상 |
| cold start |격리 목록·상세 통과, 실제 Supabase 새instance 재사용도 통과 |
| 모바일375px |목록20→40·상세·지역선택 모두 overflow0/잘린버튼0, stale 원래시각 유지 |
| 음악 회귀 |전체 추천·보관·취향·주간 테스트 통과, 모바일 보관/취향 직접 통과 |

실행 횟수를 구분한다. 첫 직접25개 중 신규 SQL의 자동 생성 constraint 이름과 명시적 이름이 충돌해24PASS/1FAIL이었다. 운영 적용 전에 신규 migration의 constraint 이름을 보정했고25PASS를 확인했다. 이후 대기 중24h 만료 검증을 추가해 최종26PASS다. 전체 test/build는 만료 보정 전108PASS/build PASS 각각1회, 최종109PASS/build PASS 각각1회로 **총각2회**다. 최종 변경 뒤 통과한 결과만 배포 기준으로 사용한다. 첫 실패를 성공으로 감추지 않는다.

## 운영 migration과 정상 GET

**202610300001_concert_browser_cache.sql을2026-10-30 09:22:24 KST에1회 commit 적용**했다. 파일SHA256: 545bd5d5f9e8d226380996dc58ec7cad265093ef7008dd6d3deaebcb38e71964. 신규table 미존재·CREATE권한 확인 후 transaction 안에서 기존13개 테이블 hash, RLS, service_role SELECT/INSERT/UPDATE만 허용, anon/authenticated 접근0을 검증했다. 기존866행 내용 hash가 동일하다. 과거 migration 재적용0, 기존업무 DML0, 새RPC0, 새서비스0다. 원래 Supabase migration ledger는 없었고 새 ledger table도 만들지 않았다.

적용 도구의 첫 호출은 PowerShell UTF16 로그를 UTF8로 읽어 테스트 결과 확인 단계에서 중단됐고 DDL 실행0/rollback이었다. 도구의 판독만 고친 뒤 적용했다. 실제 migration SQL 실행·commit은1회다. rollback 시 table 삭제를 하지 않는다.

정상 KOPIS GET만 실행했다. 서울2026-10-30~11-29·CCCA305건, 최초20/추가40/중복0. PF281769 상세 포스터·소개1장·예매링크4개다. 실제 이미지/예매URL과 XML은 저장/게시하지 않았다. KOPIS GET5(목록4페이지+상세1), Supabase cache GET4/POST2, 기존 업무POST0/기존13개table쓰기0/OCR·Program·자동판정 요청·쓰기0. 새instance가 Supabase의 목록/상세를 fresh로 읽었고 추가upstream GET0, 원래timestamp 유지다. 실패 주입은 격리 fixture에서만 수행했다.

## 보존·배포 상태

원본 local main/1607ca201c3a559bc7f28aabe998ef062db02ef9의40개 변경 파일/index/.env hash를 대조해 보존했다. ClassicAtlas-LocalPipeline은 Disabled/Enabled=false이며 변경0/새예약0이다. 추천·보관·취향·주간UI 코드는 수정하지 않았다.

main 병합·production 배포와 정상 조회를 완료했다. 구현 코드 SHA는 05a62ab04f098f110d21cf06753a1c1c2359e9bd, 실제 main·production SHA는 18bb76573609e8c60229f847d437e74eff20ba9e다. 이 최종 인계는 production commit을 부모로 작업 브랜치에 게시하는 문서 결과이며, production에 코드 변경을 추가하지 않는다. self-review ACCEPTED로 표시하지 않는다. [이전 명세2 인계](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/spec2/HANDOFF.md), [안전한 검증 요약](docs/CONCERT_RELIABILITY_RESULT_2026-10-30.json).

## 최종 배포와 실제 확인

[PR4](https://github.com/MattewShin/sound-atlas/pull/4)를 head 05a62ab04f098f110d21cf06753a1c1c2359e9bd로 병합했다. main·production SHA **18bb76573609e8c60229f847d437e74eff20ba9e**, Vercel Production deployment7427562404는2026-10-30 09:28:58 KST success다. https://sound-atlas.vercel.app 의 최종 JS asset SHA256이 검증 build와 일치하고 서버 캐시 설정6h/24h·Supabase enabled가 확인됐다.

2026-10-30 09:29:24 KST production 직접검증: status/서울10-30~11-29목록/page2/PF281769상세 **API4GET** 및HTML/JS2GET, 합계6GET/POST0이다. 목록305건20→40/중복0, 목록/상세 모두 stale=false/source=supabase-cache이며09:23에 저장한원래 fetchedAt을 유지했다. 포스터·소개1·예매링크4가 유효한 공개 HTTP(S) 링크로 제공됐다. source가 cache임을 확인했으며 이 검증을 강제장애 결과로 보고하지 않는다.

09:29:40 KST 실제 Chrome375px: API3GET/POST0, 목록20/추가40/상세(포스터1·소개1·예매4), 안전한새창링크, 각화면scrollWidth375/viewport375·잘린버튼0·pageError0·금지API0을 확인했다. fresh에서 stale안내가 나오지 않는다. 장애 fallback과 원래시각 표시/만료는 격리fixture 및모바일fixture에서만검증했고 production장애주입0이다.

이번 검증의 직접 KOPIS GET5·cache REST GET4/POST2는 배포 전 새cache 정상검증의 계측된 호출 수다. 배포 후직접/브라우저 검증은 API7GET+정적2GET/POST0이며 내부DB호출 전체 수는 별도transport계측하지 않아 합산 확정하지 않는다. production응답의 cache source로 기존snapshot 재사용을 확인했다. 기존13개업무table쓰기0·OCR/Program/자동판정요청/쓰기0이다. 최종SQL읽기전용 대조에서13개table866행hash동일·새cache list1/detail1·RLS/최소ACL유지를 확인했다.

**OPERATIONAL**로게시한다. ClassicAtlas-LocalPipeline Disabled/Enabled=false·새예약0, 원본40개변경·index·.env 해시동일을최종확인했다. 비밀값·upstream query/XML·이미지/예매URL의로그/Git게시0이다. 별도기능확장이나과거502추적은재개하지않았다. 캐시는배포rollback시삭제하지않고비사용으로남긴다. 웹GPT의별도검토를대신해ACCEPTED를선언하지않는다.
