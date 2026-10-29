# 현재 작업

- 작업 ID: CA-CONCERT-BROWSER-20261029-001
- 명세 버전: 1
- 상태: OPERATIONAL
- 요청자: Theo / 실행: Codex / 검토: 웹 GPT
- 작성일: 2026-10-29 Asia/Seoul
- 작업 브랜치: codex/ca-concert-browser-20261029-001
- 시작 SHA: main / 1db327cd38dfce778da543738f975b70789aed66
- 명세 근거: 사용자 직접 실행 지시. 기존 OCR fallback 브랜치 미병합.

## 운영 전환 완료 — OPERATIONAL (2026-10-29 10:49:04 KST)

- [구현 SHA 965a55daa4c6e04cb57a43e87730e3f2c729a6c5](https://github.com/MattewShin/sound-atlas/commit/965a55daa4c6e04cb57a43e87730e3f2c729a6c5), [PR #3](https://github.com/MattewShin/sound-atlas/pull/3) main 병합 완료. **실제 main/production SHA [7cc7f7b88274db228748cd5aa7fa8775fd5db64a](https://github.com/MattewShin/sound-atlas/commit/7cc7f7b88274db228748cd5aa7fa8775fd5db64a)**. OCR fallback 브랜치는 병합하지 않았다. GitHub Production 배포10:42:20 KST SUCCESS와 실제 공개 번들 hash가 검증한 로컬 빌드와 같음을 확인했다.
- **[production](https://sound-atlas.vercel.app) 10:43:54 KST GET 검증 PASS**: configured=true·kopis·CCCA·pageSize20. 서울10/29~11/28 목록303건, 최초20/추가40건 및 중복0. PF281769 상세의 포스터·소개이미지1장·이름 있는 예매 링크4개 확인. 이 검증 GET6/POST0이며 upstream 실제 GET8+상세2의 배포 전 검증과 구분한다.
- **배포 확인 후10:45:00 KST 기존 ClassicAtlas-LocalPipeline을 Disabled/Enabled=false로 전환했다.** 기존 action·08:40 trigger·마지막 실행08:40/exit0는 보존, 강제실행/삭제/대체 배치0. 새 공연 탐색은 KOPIS 실시간 GET+캐시를 사용한다. 다른 ClassicAtlas 예약은 없음을 조회했다.
- **10:45:56 KST 실제 production375px Chrome PASS**:20→40건·상세·소개이미지·예매링크4개, 모든 링크 새 창/noopener noreferrer. 목록/추가/상세 scrollWidth375·가로 overflow0·잘린 버튼0, page error0, API GET3/POST0, OCR/Program/선택곡/RPC 요청0.
- 배포·예약 변경 이후 관리자 READ ONLY에서 **13개 테이블866행의 전체 digest 불변**, review65/공식receipt2 포함 모든 이력 보존을 재확인했다. 이번 운영 DB DDL/DML·migration 적용/수정/삭제·OCR·분석 save·신규 CONFIRMED/REJECTED·정리0이다. 기존 정책/RPC/과거 row는 그대로이며 새 코드와 Disabled 예약이 이를 사용하지 않는다.
- 전체 npm test93/93·fail0/skip0 및 production build 각1회 PASS. 직접23/23와 로컬375px 추천·보관·취향 클릭 회귀도 PASS. 코드/문서/빌드 실제 비밀값 검사0건. 원본 main/1607ca201c3a559bc7f28aabe998ef062db02ef9의40개 로컬 변경/index/.env hash 최종 보존.
- 제거 파일152개·패키지3개와 종료 기능·보존 이력·초기 상세 실패/수동 정상화·검증 한계는 [검증 JSON](docs/CONCERT_BROWSER_VALIDATION_2026-10-29.json)과 아래 인계에 기록했다. 동일 검증 코드를 다시 수정하거나 전체 test/build를 반복하지 않았다. 작업 브랜치의 이 마지막 변경은 운영 결과 문서뿐이며 main/production 기능 SHA는 위 값을 유지한다. 작업을 종료한다.

## 목표와 범위

기존 선택곡 공연 검색·OCR·Program 곡 매칭 자동화를 종료하고, 공연 찾기를 KOPIS 서양음악(클래식) 날짜·지역 탐색으로 전환한다. 감정·기분 추천, 음악 탐색, 보관함·나의 취향은 보존한다.

1. 화면의 선택곡/보관곡 공연 검색과 곡 상세/보관함의 공연 찾기 버튼, OCR·분석·자동 판정 코드/패키지/실행 스크립트/사용하지 않는 테스트를 참조 확인 후 제거한다. 기존 DB 테이블·적용 migration·receipt·CONFIRMED/REJECTED 이력은 삭제/수정하지 않는다. 운영 DROP/대량 DELETE/과거 데이터 정리/테스트 DB 쓰기0.
2. KOPIS 서버 프록시·캐시와 useConcertSearch/ConcertScreens를 재사용한다. 키는 서버 전용이다. 기본 CCCA·오늘~30일 후·공연예정/공연중·마지막 지역 또는 서울·가까운 시작일순. 피아노/작곡가/등록곡 분석·필터0.
3. 최초20건, 더 불러오기20건, mt20id 중복 제거, 지역·날짜·공연명/공연장 검색, 전체/표시 수, 로딩/오류/빈 결과/재시도, lazy poster. 종료 공연 제외.
4. 독립 ConcertDetailScreen은 선택 공연만 조회한다. KOPIS 제공 공연명·기간/시간·공연장/지역·연령·가격·출연·주최/주관/기획·포스터·세로 소개 이미지·예매처명/URL·출처만 표시한다. 이미지 placeholder, 안전한 새 창 링크와 예매 링크 없음 상태를 제공한다.
5. upstream 범위 최대31일/페이지100건 이하. 브라우저 DOM은 표시된 페이지만 생성한다. 목록 조회의 상세 API 선호출0. API 실패는 정상 빈 배열/캐시로 위장하지 않는다. OCR/matcher/confirmation/review RPC0.

## 검증·전환 Gate

직접 fixture/단위·UI 테스트 → 전체 npm test와 production build 각1회 → 실제 KOPIS 서울/30일/CCCA 목록·상세1건 GET, DB 쓰기0 확인. 곡 상세/보관함 버튼 제거·선택곡 없는 진입·20건/중복·이미지/예매 링크(없음 포함)·추천/보관/취향 회귀·375px overflow/버튼·비밀정보 미기록을 확인한다.

모두 통과하면 main 병합·production 배포를 확인한 뒤 기존 ClassicAtlas-LocalPipeline을 Disabled한다. 다른 배치로 대체하지 않는다. production 목록/상세/예매 링크·실제 SHA·예약·보존 이력을 기록해 OPERATIONAL로 종료한다. 실패가 남으면 병합/배포/예약 변경 없이 정확한 재개점을 BLOCKED로 게시한다.

## 이력

main의 이전 CURRENT_TASK/HANDOFF/PROJECT_CONTEXT는 docs/collaboration/archive/CA-AUTO-20261022-001에 함께 보관했다. 과거 조건을 이번 작업으로 재실행하지 않는다.

## 배포 전 검증 결과 — IMPLEMENTED

직접23/23 PASS, 최종 npm test93/93 fail0/skip0(23.36초), production build PASS(3.38초)를 확인했다. 전체 test/build는 각각1회 실행했다.375px Chrome의 목록/40건/상세/지역 창은 scrollWidth375·가로 overflow0·잘린 버튼0이고 추천/보관/취향 클릭 회귀를 통과했다. 실제 KOPIS 서울10/29~11/28·CCCA 목록303건/최초20건, PF281769 상세의 포스터·소개1장·예매처4개를 검증했다. 최초 상세 실패 후 별도 수동 검증은200이었으며 근본 원인은 미확정이다. 실제 누적 목록GET8/상세GET2, DB 업무POST0이다.13개 테이블866행 및 전체 digest 불변, review65/공식receipt2 보존. 적용 migration 변경/DBDDL/DML0. 기존 예약은 배포 전 Ready/Enabled 유지다.

[검증 JSON](docs/CONCERT_BROWSER_VALIDATION_2026-10-29.json). 위 운영 전환 결과에서 main 병합·production 배포·예약 Disabled·production 재확인을 완료했다.
