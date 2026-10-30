# 현재 안정성 작업 — 명세3 / 2026-10-30

CA-CONCERT-RELIABILITY-20261029-001, codex/ca-concert-reliability-20261029-001. 최신 사용자 지시로 기존 Supabase의 캐시 전용 additive table1개를 허용했다. server/concertCache.mjs/202610300001_concert_browser_cache.sql로 목록·상세를 분리 저장하며 기존13개 이력 table과 분리했다. fresh6h/갱신 실패 시24h 이내 stale, 원래시각·안내문구·안전metadata계측·cold start 재사용을 구현했다. 운영migration1회 적용·최종test109PASS/buildPASS·모바일375px통과, production 배포 검증 대기다. 이전 명세2 저장소 blocker는 해제됐다. 예약은 Disabled다. 아래는 이전 기록이다.

# 현재 안정성 작업 — 명세2 / 2026-10-29

CA-CONCERT-RELIABILITY-20261029-001, codex/ca-concert-reliability-20261029-001. 읽은 SHA3e7222c25143356dae9f32c421ebab6b36c1b2fc, main·production7cc7f7b88274db228748cd5aa7fa8775fd5db64a 유지. 사용자 지시로 과거502 추가 추적과 원인 미확정 중단 조건을 해제했다.

Gate B에서 서버 영구 캐시 부재를 확인했다. 운영 DB13개 기존 테이블에는 별도 cache가 없고 Vercel에도 별도 저장소 설정이 없다. 새 migration 또는 별도 저장소 도입이 필요하므로 최신 금지조건에 따라 BLOCKED / SERVER_CACHE_STORAGE_REQUIRED다. 기능코드·운영DB·예약·production 변경0이며 Disabled 예약을 유지한다. CURRENT_TASK/HANDOFF의 명세2 재개점을 따른다.

## 이전 맥락 — 이력

# Classic Atlas 프로젝트 맥락

## 명세1 안정성 작업 기록 — 당시 상태 (최신 지시로 대체됨)

CA-CONCERT-RELIABILITY-20261029-001 / 명세1, 브랜치 codex/ca-concert-reliability-20261029-001. 코드·production 기준7cc7f7b88274db228748cd5aa7fa8775fd5db64a. 두 목록 HTTP502를 확인했으나 upstream 유형/페이지/cold start 원인은 미확정이어서 Gate A BLOCKED다. 기능·DB·예약은 변경하지 않았다. 영구 캐시/새 migration은 아직 없으며 현재 운영의6시간 메모리 캐시만 유지된다. CURRENT_TASK/HANDOFF의 재개점을 따른다.

## 기존 공연 브라우저 구조

- 문서 버전: 5 / 2026-10-29 Asia/Seoul
- 현재 작업: CA-CONCERT-BROWSER-20261029-001 / 명세1
- 브랜치: codex/ca-concert-browser-20261029-001
- 시작 기준: main / 1db327cd38dfce778da543738f975b70789aed66
- OCR fallback 브랜치는 병합하지 않는다.

감정·기분으로 클래식 피아노 음악291곡을 탐색하고 보관하며 나의 취향을 확인한다. 공연 찾기는 등록곡과 독립된 KOPIS 클래식 공연 목록·상세 탐색으로 전환한다.

React19/Vite6/Node22, 추천·음악 데이터·보관함·취향·주간 소개를 유지한다. src/components/useConcertSearch.js와 ConcertScreens.jsx, server/kopis.mjs의 기존 프록시·캐시 구조를 재사용한다. 서버는 KOPIS GET만 수행한다. 상세는 독립 ConcertDetailScreen이며 사용자가 선택한 공연만 조회한다. 선택곡·Program matcher·OCR·자동 확정·DB 검색 의존성을 제거한다.

기존 DB 테이블·적용 migration·review·receipt 이력은 보존한다. 이번 작업은 DB migration/DDL/DML을 수행하지 않는다. 새 기능 배포 확인 전 기존08:40 예약은 변경하지 않으며, 배포 후 기존 OCR/Program 자동 처리 예약만 Disabled 처리한다. 대체 배치는 만들지 않는다. 실제 전환 상태는 CURRENT_TASK/HANDOFF를 따른다.

이전 방향과 운영 기록은 [CA-AUTO 보관본](docs/collaboration/archive/CA-AUTO-20261022-001/PROJECT_CONTEXT.md)을 참고한다. 과거 가이드·SQL은 이력이며 새 기능의 실행 절차가 아니다.
