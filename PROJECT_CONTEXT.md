# 내비게이션·내 프로필 운영 반영 — 2026-11-10

CA-NAV-PROFILE-IA-20261110-001 / 명세2 / IMPLEMENTED. 사용자 승인 후 PR #24 Ready→main 병합·Vercel READY, main/운영 SHA `3e588ebc8dacdd5cf3cd648229ff31bd5553a4ef`. 승인 코드/166·5·4·36·build 증거를 확인하고 새 전체 테스트/DB 검증 없이 실제 익명 스모크18/18 PASS. 320/375/390px의 메뉴/제목/보관함/프로필/기존 딥링크를 읽기로 확인했다. DB/설정/자료·계정 전환/로그아웃 변경0. Google chooser·실 OAuth/다중 창 Realtime/실기기 IME는 미검증이다. 이 결과 문서 브랜치의 [운영 결과](docs/NAV_PROFILE_IA_PRODUCTION_2026-11-10.md)와 CURRENT_TASK/HANDOFF가 최신이며, 아래 명세1의 미배포 문구는 준비 이력이다.

# 내비게이션·내 프로필 통합 — 2026-11-10

CA-NAV-PROFILE-IA-20261110-001 / 명세1 / IMPLEMENTED. 기준 main `465173d2e2e41ee58f387b18b6897a3e29cbaff9`, 기능·테스트 `1a03ca832329a356fa15a615af568958244c911e`, 브랜치 `codex/ca-nav-profile-ia-20261110-001`. 음악 이야기는 공개 탐색으로 단순화하고 공개 프로필·내 기록·기존 음악 취향·활동·계정을 내 프로필로 통합했다. 아이콘 전용 메뉴와 기존 딥링크/세션/권한을 유지한다. PR #24 검토 보완으로 프로필의 일괄 normal 선언을 제거하고 실제 글자 좌표/줄 높이 검증, 나만 보기·공개 중의 배타적 필터를 적용했다. 전체166/SNS5/통합4/모바일36·build PASS. migration 불필요, 운영 DB/병합/배포 미실행. 실 OAuth/PostgREST/Realtime·실기기는 미검증이다. [구현 결과](docs/NAV_PROFILE_IA.md) 및 CURRENT_TASK/HANDOFF를 따른다. 아래 OCR 운영 이력은 완료된 이전 작업이다.

# OCR 영구 폐기 운영 완료 — 2026-11-09

CA-OCR-RETIRE-20261109-001 / 명세2. 사용자 승인 후 PR #22 병합·Vercel READY, 운영 적용 당시 main/production `52869c77338d7d343ca7ce204c67d3a466b6da3c`. 새 전체 논리 백업과 직전 READ ONLY preflight 후 16:30:20 KST 승인 migration 한 파일 적용 완료. OCR table5/View1/함수22/Trigger1/FK11 제거, 유지21개 데이터 지문/권한·Auth 사용자·공식 text 확정2건 보존. 실제 PostgREST/익명 앱 읽기 PASS. Windows 예약Disabled/frozen 비활성/모델2개 보존. 실 OAuth·모바일 전체·live Realtime 다중창·백업 실복원은 미검증이다. 문서 마감은 기능·migration 변경 없이 운영 결과를 main에 반영한다. 최신 문서 SHA는 문서 PR 이력과 구분하며, 운영 결과는 [보고서](docs/OCR_RETIREMENT_PRODUCTION_2026-11-09.md)와 CURRENT_TASK/HANDOFF를 따른다. 아래 명세1의 운영 미실행 문구는 당시 준비 기록이다.

# OCR 영구 폐기 준비 — 2026-11-09

CA-OCR-RETIRE-20261109-001 / 명세1. 사용자는 OCR 재사용·확정3건/이력 보존을 폐기하고 공식 Program text/현 서비스를 유지하도록 지시했다. 기준 main/운영2552f5b021238b65a8c4d2e235a342b12e498cde, 실제 schema를 재조회해 새 의존성 부재와 READ ONLY preflight PASS를 확인했다. 새 브랜치에서 명시적 RESTRICT 삭제 migration과 text-only CLI·격리 검증을 준비한다. 운영 migration·main 병합·배포·예약/설정·로컬 model 삭제는 아직 하지 않는다. 최신 [폐기 안내](docs/OCR_RETIREMENT.md)와 CURRENT_TASK/HANDOFF를 따른다. 아래 과거의 OCR 보존/자동화 목표는 이번 제품 정책을 제한하지 않는다.

# 음악 기록 SNS 운영 반영 — 2026-11-06

피드 상단 작성자 별명/아이디와 곡 정보를 같은 높이의 한 줄로 정렬했다. 긴 정보는 헤더 말줄임/title·프로필/곡별 전체 정보 접근으로 처리한다. 코드 e569b568f66d22aae35e4317f3fae5a5fef70fc6 / 운영 success. 짧은/긴 합성 응답×320/375/390/520px 각각 한 줄·44px 헤더·겹침/넘침 없음·전체 정보 이동, 기존 typography 8개/SNS DOM 회귀 통과. 실제 사용자 자료·DB 변경 없음. 자세한 최신 결과는 HANDOFF를 따른다.

후속 메뉴 표기 요청으로 하단 SNS 메뉴를 **음악 이야기** 한 줄로 바꿨다. 코드 SHA de661b53ec9cdaa7d679b062dd8c94b6acc9ccd3 / 운영 success. 320/375/390/520px 한 줄·넘침 없음·44px 이상 메뉴 터치 및 이동, 관련 typography 8개 통과. 아래 전체 운영 검증 기록은 그 이전 78a1dbb 기준이다.

CA-SOCIAL-20261106-001 / 명세 2. 사용자 명시 승인 후 운영 논리 백업/복구 읽기 검사, SNS 202611060001→002 적용·기존 내용 보존, PR #21을 merge SHA 6bd183ca21efc53ea3c842c942cece96af0af03e로 병합했다. 운영에서 발견한 small 10px/메뉴 40px만 CSS로 보완한 최종 기능 SHA는 78a1dbb65a515ae583687e2e19d1389c2a59fd0f이며 production Ready/운영 alias 확인. 실제 Auth/API/WS 16항목·브라우저 13항목·관련 typography 8개 PASS, 320/375/390px 확인. 합성 계정/자료만 사용·정리했고 기존 평가 7/닉네임 1 보존. 기존 세션/원본/닉네임/공유 ID를 재사용하고 공개 식별자를 분리하며 기존 REST도 권한을 적용한다. 실제 Google 인증 완료·실기기 IME/PWA·신고 일일 작업/외부 알림·DB 실복원은 미검증/미설정이다. 변경 없는 전체 테스트/별도 스테이징/Docker 설치는 반복하지 않았다. [운영 결과](docs/MUSIC_SOCIAL_PRODUCTION.md)와 CURRENT_TASK/HANDOFF를 따른다.

# 완료된 숙련자 검색 UX 개선 — 2026-11-02

CA-REFERENCE-SEARCH-UX-20261102-001. 검색 입력 중 텍스트 자동완성만 표시하고 곡명 선택/단일 결과 Enter로 FOR YOU 대표 카드를 확정한다. 상세는 대표 카드에서 열고 랜덤/추천/전체 목록은 대표 카드 선택으로 연결한다. 초보자와 공통 MORE TO EXPLORE 가로 추천 섹션 및 기존 전체 추천 목록을 재사용한다. DB·SQL·공연·평가는 변경하지 않는다. 로컬 140개 테스트/build PASS. 사용자 명시적 승인 후 PR #19를 main SHA `bb797f40b23b6184f81428e9e07f904d5c91b970`로 병합했다. Vercel success와 운영 텍스트 자동완성·Enter 대표 카드·공통 MORE TO EXPLORE·추천곡의 대표 카드 전환·대표 카드 상세 열림을 확인했다. 상세 상태는 CURRENT_TASK/HANDOFF를 따른다.

# 완료된 초보자·숙련자 UI 정리 — 2026-11-02

CA-EXPLORER-UI-20261102-001. 작은 단일 토글·숙련자 검색 예시 제거·검색 전 랜덤 카드·검색 곡의 공통 FOR YOU 대표 카드와 검색 음악/내 취향 전환을 구현한다. 검색 후보 직접 선택과 기존 보관/상세/미리듣기/음악 기록을 유지하며 DB·SQL·공연·평가는 변경하지 않는다. 전체 140개 테스트/build PASS. PR #18 main SHA `bfec1d6261035c01f29dea38e9802c7713850760` 배포 success 및 운영 토글·랜덤 카드·대표 카드/취향 전환·기준곡 복원을 확인했다. 상세는 CURRENT_TASK/HANDOFF를 따른다.

# 완료된 초보자·숙련자 탐색 작업 — 2026-11-02

CA-REFERENCE-TRACK-SEARCH-20261102-001. 사용자 확정 명칭 초보자/숙련자로 홈을 분기한다. 초보자는 기존 느낌·기분 추천, 숙련자는 등록곡 한·영 통합 검색 → 직접 기준곡 선택 → 기존 9축 감정 분포·강도 유사 추천이다. 곡 상세·미리듣기·보관·음악 기록·공유를 재사용하며 DB/SQL·평가·곡 ID·공연·예약 변경은 없다. 전체 140개 테스트/build PASS. PR #17을 main SHA `ada2c17f3d9b3829a847b4e77ff2fc5bc0fa5507`로 병합했고 Vercel success를 확인했다. production에서 한·영 검색·기준곡 선택·6곡 추천·초보자 선택 유지·숙련자 기준곡 복원을 읽기 전용으로 검증했다. 실제 사용자 보관·기록·공개 게시 쓰기와 실기기 iPhone PWA 검증은 수행하지 않았다. 상세는 CURRENT_TASK/HANDOFF를 따른다.

# 이전 기록 목록·선택 공유 작업 — 2026-11-02

CA-MUSIC-RECORD-SHARING-20261102-001, PR #16, production SHA `27dda4f971d5ccb54d97fbcaadd01f5338e8dc68`. 사용자 004 SQL 적용 보고 후 내 음악 기록 목록·선택 공유를 배포했다. 전체 132개 테스트/build PASS. production에서 보관 해제 곡의 기록 조회·닉네임/공유 상태 읽기·미게시 미리보기·공개 0건 목록을 확인했다. 실제 게시/공유 취소는 개인정보 보호를 위해 미실행이며 격리 SQL/DOM으로만 검증했다. 원본은 비공개 유지, 공개본은 별도 snapshot이며 원본/계정 삭제 시 공유본도 삭제한다. CURRENT_TASK/HANDOFF를 따른다.

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
