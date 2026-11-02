# 현재 기록 목록·선택 공유 작업 — 2026-11-02

CA-MUSIC-RECORD-SHARING-20261102-001, codex/ca-music-record-sharing-20261102-001. 보관함의 내 음악 기록 전체 목록과 공개용 닉네임·미리보기·명시적 공개·공유 취소를 구현했다. 원본은 비공개로 유지하며 공개본은 별도 snapshot이다. 공개본의 계정/원본 식별 열은 column privileges로 차단하고, 게시/취소는 본인 RPC만 허용한다. 원본 수정은 공개본을 바꾸지 않고 원본/계정 삭제는 공유본도 삭제한다. 전체 132개 테스트/build PASS. 004 SQL 운영 적용 전이라 production 배포는 하지 않는다. CURRENT_TASK/HANDOFF를 따른다.

# 완료된 비공개 음악 기록 작업 — 2026-11-02

CA-PRIVATE-MUSIC-JOURNAL-20261102-001, PR #15, production SHA `79666d9ff257118d7b47e7752f472ade0886f224`. 비공개 곡별 날짜·유형·텍스트 기록과 RLS/소유자 RPC를 배포했다. 전체 128개 테스트/build 통과. 운영 저장·수정·재조회·로그아웃 미노출·재로그인 복원을 확인했다. 사용자가 검증용 기록을 직접 삭제하고 새 기록 작성·보관 해제 후 유지까지 확인했다고 보고하여 종료했다. 이력은 보관본을 따른다.

# 완료된 개인정보·보안 작업 — 2026-11-02

CA-PRIVACY-SECURITY-20261102-001, PR #12, production SHA `875a6bec7440fa34225341e9fd8024bc92c63fc9`. 로그아웃 로컬 격리, 본인 계정 삭제, 직접 DML 회수, 보안 헤더, 개인정보 안내를 배포했고 전체 124개 테스트·build·production dependency audit가 통과했다. 문의처와 Supabase Sydney 지역을 반영했으며, 기존 로그아웃 뒤 남아 있던 3곡과 취향이 production에서 0개로 정리되는 것을 확인해 OPERATIONAL로 완료했다. 최신 CURRENT_TASK/HANDOFF를 따른다.

# 완료된 Google 개인화 작업 — 2026-11-02

CA-GOOGLE-PERSONALIZATION-20261102-001. Google 로그인, 사용자별 보관함 동기화, 기존 localStorage 최신값 병합, 기존 9축 취향 개인화를 구현·배포했다. production에서 비회원 1곡과 계정 2곡의 병합 및 새로고침 유지를 확인했다. 결과는 [보관본](docs/collaboration/archive/CA-GOOGLE-PERSONALIZATION-20261102-001/CURRENT_TASK.md)을 따른다.

# 이전 PWA 작업 — 2026-10-30

CA-PWA-20261030-001, 브랜치 codex/ca-pwa-20261030-001. MY PIANO MOOD를 모바일 홈 화면에 설치하고 standalone으로 실행할 수 있도록 Manifest, Service Worker, iOS metadata와 전용 아이콘을 추가한다. Service Worker는 정적 자산과 offline 안내만 캐시하고 /api/를 제외해 Supabase 공연 캐시와 충돌하지 않는다. DB·KOPIS·OCR·예약은 변경하지 않는다. 최신 CURRENT_TASK/HANDOFF를 따른다.

# 이전 안정성 작업 — 명세3 / 2026-10-30

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
