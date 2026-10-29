# KOPIS 클래식 공연 탐색

CA-CONCERT-BROWSER-20261029-001 / 명세1. 시작 기준 main1db327cd38dfce778da543738f975b70789aed66. OCR fallback 브랜치 미병합.

## 사용자 흐름

공연 찾기 진입 시 마지막 지역(없으면 서울)·한국 시간 오늘~30일 후·CCCA·공연예정/공연중을 조회한다. 공연명 또는 공연장 검색, 날짜·지역 변경 후 조회,20건 단위 추가 표시와 mt20id 중복 제거를 제공한다. 종료된 공연은 제외하고 가까운 시작일순으로 정렬한다. 로딩·실패·빈 결과를 구분하며 실패를 캐시나 빈 성공으로 바꾸지 않는다. 추가 조회 실패 시에만 이전 목록임을 명시하고 재시도를 제공한다.

목록 카드에는 포스터·공연명·기간·공연장·지역·상태만 표시한다. 포스터는 lazy loading과 실패 placeholder를 사용한다. 상세는 독립 ConcertDetailScreen에서 선택 공연 GET만 호출하며 KOPIS가 제공한 시간·연령·가격·출연·주최/주관/기획·포스터·순서 유지 소개 이미지와 이름 있는 예매 링크를 표시한다. 링크 없는 경우에도 정상 화면을 제공한다. 외부 링크는 http(s)만 허용하고 새 창/noopener noreferrer를 사용한다.

## 서버·캐시 계약

- GET /api/concerts?region=서울&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&page=1
- GET /api/concerts/PF번호
- GET /api/concerts/status
- 공개 POST·옛 match-batch/program 경로와 선택곡 검색은 종료했다. CONCERT_SEARCH_BACKEND의 기존 supabase 값은 더 이상 DB 검색을 선택하지 않는다.

KOPIS 요청 범위는 최대31일, 목록은 cpage/rows100 이하·CCCA·상태01/02·시도코드를 적용한다. KOPIS 목록에는 total이 없어 날짜·지역별 목록 페이지를 서버에서 끝까지 수집해 중복 제거하고 성공한 목록만6시간 메모리 캐시한다. 상태당50페이지 상한에 닿으면 부분 성공 대신 조건 축소 오류를 반환한다. 정렬·제목/공연장 필터 후 정확한 조회 total과 페이지20건만 브라우저로 보낸다. 목록 중 상세 조회·이미지 다운로드·OCR은0이다. 캐시를 사용해도 자정 이후 종료 공연은 다시 제외한다. 브라우저는 페이지별 메모리 캐시만 사용하고 기존 OCR/곡 검색 localStorage 캐시는 읽지 않는다.

KOPIS key는 서버 closure에만 존재한다. upstream 오류 메시지·URL·응답 본문을 브라우저나 로그에 노출하지 않으며15초 timeout, 자동 재시도0이다. 상세/소개 이미지는 UI가 직접 lazy loading하며 서버가 이미지 bytes를 처리하지 않는다.

## 종료한 경로와 이력

EasyOCR/Tesseract·이미지 전처리·OCR 저장·Program 분석·곡 매칭·자동 CONFIRMED/REJECTED·Supabase 곡 검색·로컬 통합 배치와 관련 실행 스크립트/테스트를 제거했다. sharp는 서버의 이미지/OCR 처리만 참조했고 다른 기능 참조가 없어 tesseract.js와 함께 제거했다. PGlite도 제거된 SQL 실행 테스트 전용이었다. 음악 평가/추천/보관/취향/주간 소개 테스트는 보존했다.

supabase/migrations는 변경하지 않는다. 운영 DB DDL/DML·과거 데이터 정리·정책 변경을 하지 않는다. 배포 후 기존 ClassicAtlas-LocalPipeline 예약을 Disabled하고 대체 배치를 만들지 않는다. 과거 가이드와 SQL은 이력 보존용으로만 남긴다.

## 근거와 검증

[KOPIS 공식 OpenAPI 개발가이드 v5.0](https://kopis.or.kr/upload/openApi/%EA%B3%B5%EC%97%B0%EC%98%88%EC%88%A0%ED%86%B5%ED%95%A9%EC%A0%84%EC%82%B0%EB%A7%9DOpenAPI%EA%B0%9C%EB%B0%9C%EA%B0%80%EC%9D%B4%EB%93%9C.pdf)의 목록31일/100행과 상세 필드·relates 계약을 확인했다. 실제 운영 GET·전체 test/build·375px Chrome 및 DB digest·예약 결과는 CURRENT_TASK/HANDOFF에 실행 시각·SHA와 함께 기록한다. OCR 원문·실제 이미지 URL·비밀값은 검증 문서에 넣지 않는다.
