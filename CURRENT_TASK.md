# 현재 작업

- 작업 ID: CA-CONCERT-BROWSER-20261029-001
- 명세 버전: 1
- 상태: IMPLEMENTED
- 요청자: Theo / 실행: Codex / 검토: 웹 GPT
- 작성일: 2026-10-29 Asia/Seoul
- 작업 브랜치: codex/ca-concert-browser-20261029-001
- 시작 SHA: main / 1db327cd38dfce778da543738f975b70789aed66
- 명세 근거: 사용자 직접 실행 지시. 기존 OCR fallback 브랜치 미병합.

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

[검증 JSON](docs/CONCERT_BROWSER_VALIDATION_2026-10-29.json). 다음은 동일 검증 코드를 main에 병합·production 배포 확인하고 예약을 Disabled한 뒤 production 목록/상세/링크를 다시 확인하는 단계다.
