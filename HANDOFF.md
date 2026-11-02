# 작업 인계

- 작업 ID: CA-REFERENCE-TRACK-SEARCH-20261102-001 / 명세1
- 상태: IMPLEMENTED / main 병합·production 배포·읽기 전용 화면 검증 완료
- 브랜치: codex/ca-reference-track-search-20261102-001
- 코드 기준 main SHA: `3783d41334240d91ec1fcd9a378092f944549dfd`
- 결과 코드/production SHA: `ada2c17f3d9b3829a847b4e77ff2fc5bc0fa5507` / [PR #17](https://github.com/MattewShin/sound-atlas/pull/17).
- production tree: `c67e17b39d0ec16497ef45910663d27c316c6796`. 최종 로컬 검증 tree와 동일하다.
- 시작 시 worktree/index 변경 없음. 이전 작업 브랜치·로컬 커밋 보존.

## 변경

- App: 홈 상단 초보자/숙련자 전환, 초보자 입력/숙련자 기준곡 세션 유지, 기존 상세/보관 callback 재사용. 숙련자 화면에서는 숨겨진 초보자 추천의 노출 기록을 쌓지 않는다. 나의 취향 추천 진입은 초보자 경로로 이동한다.
- ReferenceTrackExplorer: 한·영 통합 검색·검색 예시·20곡 추가·명시적 기준곡 선택·변경·추천 이유·보관/상세 연결. 검색/기준곡 선택은 DB 쓰기나 KOPIS 호출을 발생시키지 않는다.
- referenceTrackSearch: Unicode/대소문자/공백 정규화, 작곡가 영문 alias, Op와 No/번 구분 및 숫자 완전 일치, 악장 구분. 원본 평가·목록·ID 불변.
- 추천: 정규화 9축 벡터의 cosine 65% + RMS 거리 유사도 35%. 기준 작품 전체 제외, 동일 작품 중복 제외, 작곡가당 최대 2곡, 상위 점수 0.15 이내에서 최대 6곡. 멜로디/음원/화성/난이도 분석은 아니다. 개인 기록/검색 이력/공개 글은 사용하지 않는다.
- 모바일: minmax(0,1fr) 모드 선택, 16px 검색 입력, 44px 이상 터치, 긴 제목 줄바꿈과 375px 이하 여백.
- 이전 작업 CURRENT_TASK/HANDOFF 동시 보관. DB·SQL·개인 기록·공연 API·캐시·예약·PWA manifest/service worker 변경 없음.

## 검증

- 전체 npm test 140/140 PASS, fail 0·skip 0. 신규 데이터/CSS 7개 및 통합 DOM 1개 추가.
- 실제 291곡 전체를 기준곡으로 순회하며 자기 작품 제외·동일 작품 중복 없음·작곡가 최대 2곡·유한 점수·안정 정렬 검증.
- DOM: 초보자 평안한 선택 → 숙련자 → 영문 20/40곡 추가 → 빈 결과 → 한글 단건 → 사용자 기준곡 선택 → 추천곡 보관 → 기존 상세/비공개 기록 → 초보자 입력 복원 → 기준곡 변경/포커스 → 악장 결과 구분 → 보관함 반영. 외부 fetch 0회.
- npm run build PASS. 기존 500kB 번들 warning은 유지되며 새 네트워크 의존성은 추가하지 않았다.
- 환경: 로컬 Node24; 프로젝트/배포 engine Node22. 운영 migration/DB 쓰기 0회.
- Vercel production 배포 상태 success를 병합 SHA 기준으로 확인했다.
- production 브라우저에서 초보자 평안한 선택 → 숙련자 → ‘Chopin Op.52’ / ‘쇼팽 발라드 4번’ 동일 1곡 검색 → ‘이 곡으로 추천’ → 기준곡과 다른 6곡 및 추천 근거 표시 → 초보자 평안한 선택 유지 → 숙련자 기준곡 복원을 확인했다.
- 운영에서 보관·개인 기록·공개 게시 쓰기는 하지 않았다. 실기기 iPhone PWA 폭/터치는 검증하지 않았으며 DOM/CSS 검증과 구분한다.
- 마무리 변경은 CURRENT_TASK.md / HANDOFF.md / PROJECT_CONTEXT.md 문서 3개뿐이다. 기존 140개 테스트/build 결과는 위 production 코드 tree 기준이며 이번 문서 변경으로 재실행하지 않았다. 미해결 구현 blocker 없음.

## 구현자 의견/한계

- 명칭은 사용자 확정안 그대로이며 두 경로는 연주 실력 판정이 아니다.
- 검색 범위는 등록된 평가 완료 곡이다. 미등록곡·동의어의 모든 번역·오타 보정·음성 검색은 지원하지 않는다.
- 유사도는 기존 수동 감정 점수 기반의 탐색 도구이며 음악학적 유사성의 보장은 아니다. 유사도 퍼센트는 과도한 정밀도로 오해하지 않도록 표시하지 않는다.
- 이전 공유 기능의 실제 게시/공유 취소 운영 canary는 이번에도 수행하지 않았다. 실제 개인 글을 테스트로 공개하지 않는다.
