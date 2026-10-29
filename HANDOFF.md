# 작업 인계

- 작업 ID: CA-CONCERT-BROWSER-20261029-001 / 명세1
- 상태: IMPLEMENTED (production 전환 전)
- 작성: Codex / 2026-10-29 Asia/Seoul
- 시작 SHA: main / 1db327cd38dfce778da543738f975b70789aed66
- 브랜치: codex/ca-concert-browser-20261029-001
- 기존 OCR fallback 브랜치 미병합. main의 공동 문서5개를 같은 SHA에서 읽고 이전 작업을 docs/collaboration/archive/CA-AUTO-20261022-001에 보관했다. 새 명세는 사용자 직접 지시다.

## 구현과 보존

useConcertSearch·ConcertScreens·서버 KOPIS 프록시/메모리 캐시를 재사용해 선택곡 없는 날짜·지역 클래식 목록으로 전환했다. 최초20건/추가20건·mt20id 중복 제거·공연명/공연장 텍스트 검색·정확한 total/표시 수·정렬·로딩/오류/빈 결과/재시도를 제공한다. 목록의 상세 선조회0, 표시된 카드만 DOM에 생성하고 포스터를 lazy load한다. 독립 ConcertDetailScreen에 실제 제공 필드·포스터·순서 유지 소개 이미지·이름 있는 안전한 예매 링크/링크 없음·placeholder·KOPIS 출처를 표시한다.

곡 상세와 보관함의 공연 찾기 버튼, 선택곡 검색, Tesseract/EasyOCR/Python worker·OCR 저장·Program 분석·곡 매칭·자동 판정·Supabase 곡 검색·수집/통합배치/검증 스크립트·관련 미사용 테스트를 제거했다. 참조를 확인해 OCR 전용 sharp/tesseract.js와 SQL 테스트 전용 PGlite를 제거했다. 음악 데이터291곡·점수2619개·기존ID·저장키·추천/보관/취향/주간소개 코드는 보존했다. 적용 migration 파일과 DB 이력은 수정/삭제0이다. 과거 SQL·기술 보고서는 이력으로 보존한다.

공개 API는 GET 목록/선택 상세/status만 제공한다. 옛 POST match-batch는405, program 경로404, targetTrackId 검색400이다. 기존 CONCERT_SEARCH_BACKEND=supabase 환경값도 DB 검색을 선택하지 않는다. KOPIS key는 서버 closure에만 있고 브라우저에 전달하지 않는다.

## 실제 검증

- 직접23/23 PASS(신규서버6·클라이언트2·UI2·등록곡/소수점/모바일13), fail0/skip0. 조정한 카탈로그 테스트의 줄바꿈 오류1개를 직접 단계에서 수정한 뒤 통과했다.
- **최종 npm test93/93 PASS, fail0/skip0,23.3607초; production build PASS3.38초**. 각각1회 실행했다. 제거한 기능 테스트를 통과 수에 포함하지 않는다. 기존500kB chunk 경고는 유지(JS579.83kB)된다.
- **375px 실제 headless Chrome PASS**: 목록20/추가40·상세·지역 dialog scrollWidth375, 가로 overflow0/잘린 버튼0. 상세 포스터/소개2장/새 창 링크와 목록 복귀·region 저장, 추천→보관→취향9축 클릭을 확인했다. 합성 API POST0이며 실제 KOPIS 데이터 검증과 구분한다.
- **실제 KOPIS10:31:07 KST**: 서울10/29~11/28·CCCA·상태01/02·rows100·cpage 끝까지 목록303건/최초20건. PF281769 상세200/XML·정규화, 포스터/소개1장/안전한 이름 있는 예매처4개·시간/가격/주최정보를 확인했다. 최초 시도는 목록 통과 후 상세KOPIS_UNAVAILABLE이었다. 코드/timeout/자동재시도 변경 없이 별도 수동 확인에서 통과했으며 최초 근본 원인은 미확정이다. 누적 목록GET8·상세GET2·OCR/서버 이미지GET/DB 업무POST0. 실제 이미지URL·원문·키·연결정보를 게시하지 않았다.
- **관리자 READ ONLY SQL PASS**: 시작/최종13개 base table866행과 모든 digest 불변. review65행/공식receipt2행을 포함해 OCR/분석/후보/CONFIRMED/REJECTED 이력을 보존했다. 이번 DBDDL/DML·migration 적용·cleanup0. 예약은 배포 전 Ready/Enabled 유지다.
- 원본 local main/1607ca201c3a559bc7f28aabe998ef062db02ef9의40개 변경·index·.env hash 보존. 격리clone만 변경했다.

## 기술 의견과 다음 단계

KOPIS 목록 응답에는 total이 없어 날짜·지역의 upstream 페이지를 서버에서 끝까지 조회·중복 제거한 성공 목록으로 count를 산출한다. 브라우저에는20개씩만 보내고 목록에서 상세를 호출하지 않는다. 상태당50페이지 상한 도달/HTTP/XML 실패는 부분 성공으로 위장하지 않는다. 새 배치를 둘 필요가 없다.

검토 ACCEPTED는 자체 선언하지 않는다. 다음 단계는 이 검증 코드의 main 병합·production 배포 확인 후 기존 ClassicAtlas-LocalPipeline Disabled, production 목록·상세·예매 링크와 실제 SHA를 기록하는 것이다. [설계](docs/CONCERT_BROWSER.md), [실제 검증 JSON](docs/CONCERT_BROWSER_VALIDATION_2026-10-29.json).
