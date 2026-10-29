# Classic Atlas 프로젝트 맥락

- 문서 버전: 5 / 2026-10-29 Asia/Seoul
- 현재 작업: CA-CONCERT-BROWSER-20261029-001 / 명세1
- 브랜치: codex/ca-concert-browser-20261029-001
- 시작 기준: main / 1db327cd38dfce778da543738f975b70789aed66
- OCR fallback 브랜치는 병합하지 않는다.

감정·기분으로 클래식 피아노 음악291곡을 탐색하고 보관하며 나의 취향을 확인한다. 공연 찾기는 등록곡과 독립된 KOPIS 클래식 공연 목록·상세 탐색으로 전환한다.

React19/Vite6/Node22, 추천·음악 데이터·보관함·취향·주간 소개를 유지한다. src/components/useConcertSearch.js와 ConcertScreens.jsx, server/kopis.mjs의 기존 프록시·캐시 구조를 재사용한다. 서버는 KOPIS GET만 수행한다. 상세는 독립 ConcertDetailScreen이며 사용자가 선택한 공연만 조회한다. 선택곡·Program matcher·OCR·자동 확정·DB 검색 의존성을 제거한다.

기존 DB 테이블·적용 migration·review·receipt 이력은 보존한다. 이번 작업은 DB migration/DDL/DML을 수행하지 않는다. 새 기능 배포 확인 전 기존08:40 예약은 변경하지 않으며, 배포 후 기존 OCR/Program 자동 처리 예약만 Disabled 처리한다. 대체 배치는 만들지 않는다. 실제 전환 상태는 CURRENT_TASK/HANDOFF를 따른다.

이전 방향과 운영 기록은 [CA-AUTO 보관본](docs/collaboration/archive/CA-AUTO-20261022-001/PROJECT_CONTEXT.md)을 참고한다. 과거 가이드·SQL은 이력이며 새 기능의 실행 절차가 아니다.
