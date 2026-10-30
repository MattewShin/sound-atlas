# 현재 작업

- 작업 ID: CA-PWA-20261030-001
- 명세 버전: 2 / iPhone standalone 하단 내비게이션 보정
- 상태: IMPLEMENTED / production 배포 검증 대기
- 브랜치: codex/ca-pwa-20261030-001-safe-area
- 시작 main SHA: 18bb76573609e8c60229f847d437e74eff20ba9e
- 요청: 모바일 브라우저에서 홈 화면에 설치하고 앱 아이콘으로 standalone 실행할 수 있는 PWA 적용

## 범위

1. 기존 React19/Vite6 앱에 표준 Web App Manifest와 production Service Worker를 추가한다.
2. 앱 이름은 현재 화면 제목인 MY PIANO MOOD, 짧은 이름은 Piano Mood로 사용한다.
3. 아이콘은 기존 네이비·크림·골드 색상에 음표와 나침반을 결합한 새 자산으로 제공한다.
4. Android/Chromium용 192·512·maskable 512 PNG와 iOS용 180 PNG, SVG favicon을 제공한다.
5. display=standalone, start_url/scope=/, 기존 theme color를 사용한다.
6. Service Worker는 동일 origin의 정적 빌드 자산·작곡가 이미지·아이콘만 runtime cache하고 /api/와 외부 이미지·예매 링크는 캐시하지 않는다.
7. navigation network 실패에는 전용 offline 화면만 제공한다. 공연·추천 데이터를 오프라인 성공으로 위장하지 않는다.
8. sw.js는 Vercel에서 항상 재검증하고 Manifest MIME을 명시한다.
9. DB·Supabase migration·KOPIS 캐시·OCR/Program·예약 상태는 변경하지 않는다.

## 구현·검증

- index.html에 manifest, SVG favicon, apple-touch-icon, iOS standalone metadata, 설명을 연결했다.
- src/main.jsx는 production에서만 /sw.js를 scope=/로 등록한다.
- public/manifest.webmanifest, sw.js, offline.html과 5개 아이콘 자산을 추가했다.
- 전용 PWA 테스트 4/4, 전체 npm test 113/113 fail0/skip0, production build PASS.
- build 결과에 manifest, sw, offline, PNG/SVG 자산이 포함되고 로컬 preview에서 manifest standalone/아이콘3개와 sw·512 PNG HTTP200을 확인했다.
- PR #5를 main에 병합하고 production SHA b2f6b5033c7b7dbdefd734544a352e3df82ee70f로 배포했다.
- production에서 manifest·sw.js·아이콘이 HTTP 200이고 전용 MIME·cache/service-worker 헤더가 적용된 것을 확인했다.
- production 공연 화면에서 서울 305건·첫 20건 표시를 확인해 기존 목록 기능 회귀가 없음을 확인했다.
- 실제 iOS/Android 홈 화면 추가는 사용자 기기의 최종 smoke test로 남긴다. 코드·배포 기준 PWA 상태는 OPERATIONAL이다.

## 명세 2 추가 범위

- 사용자가 iPhone 홈 화면 설치와 아이콘 생성을 확인했다.
- standalone 실행 시 하단 `음악 탐색/공연 찾기/보관함/나의 취향` 영역이 Safari보다 낮아 보이는 현상을 보정한다.
- viewport에 `viewport-fit=cover`를 선언하고 standalone 모바일에서만 홈 인디케이터 최소 여백·내비게이션 높이를 추가한다.
- 일반 Safari·Android·데스크톱 레이아웃과 기존 기능은 변경하지 않는다.
- 공연 찾기의 시작일·종료일 입력이 iPhone에서 검색 패널 오른쪽을 넘지 않도록 입력과 grid의 논리 너비를 제한한다.

## 명세 2 구현·검증

- viewport에 `viewport-fit=cover`를 추가해 iOS standalone의 실제 safe-area 값을 사용한다.
- 679px 이하 standalone에만 하단 내비게이션 최소 여백과 60px 버튼 높이, 콘텐츠 겹침 방지 여백을 적용했다.
- PWA·모바일 직접 테스트 8/8, 전체 테스트 114/114 fail0/skip0, production build가 통과했다. 날짜 입력 overflow 회귀도 포함한다.
- 기존 bundle 크기 경고 외 신규 오류는 없다. 실제 iPhone 표시 높이와 날짜 박스는 production 배포 후 사용자 기기에서 재확인한다.

이전 안정성 작업의 main 문서는 [보관본](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/main-before-pwa/CURRENT_TASK.md)에 보존했다.
