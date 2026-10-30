# 작업 인계

- 작업 ID: CA-PWA-20261030-001 / 명세2
- 상태: OPERATIONAL / main 병합·production 배포 완료
- 작성: 웹 GPT / 2026-10-30 KST
- 브랜치: codex/ca-pwa-20261030-001-safe-area
- 시작 기준: main / 18bb76573609e8c60229f847d437e74eff20ba9e

## 구현 결과

MY PIANO MOOD를 홈 화면에 설치할 수 있도록 Manifest, production Service Worker, iOS 메타태그와 앱 아이콘을 추가했다. 아이콘은 텍스트 없이 음표와 나침반을 조합하고 기존 네이비·크림·골드 및 포인트 브라운 색을 사용했다. Android/Chromium any 192·512, maskable 512, iOS 180, SVG favicon을 제공한다.

Service Worker는 /api/ 요청과 외부 origin을 즉시 제외한다. navigation은 network-first이며 실패할 때만 offline.html을 표시한다. 해시된 /assets/, /composers/, /icons/, manifest만 cache-first로 재사용한다. 따라서 Supabase 6시간 fresh/24시간 stale 공연 캐시, 최신 추천·보관 데이터와 충돌하지 않는다.

Vercel은 /sw.js를 max-age=0/must-revalidate로 제공하고 Service-Worker-Allowed=/를 설정한다. Manifest는 application/manifest+json MIME을 사용한다. production에서만 등록하므로 개발 서버에는 Service Worker가 남지 않는다.

## 검증

| 항목 | 결과 |
| --- | --- |
| PWA 직접 테스트 | 4/4 PASS |
| 전체 npm test | 113/113 PASS, fail0/skip0, 약9.18초 |
| production build | PASS, 약1.11초 |
| manifest | standalone, start/scope=/, any·maskable 아이콘3개 |
| 아이콘 | PNG signature와 192/512/512/180 실제 크기 PASS, SVG 포함 |
| Service Worker | node syntax PASS, /api/ 제외·offline navigation fixture PASS |
| 로컬 preview | manifest·sw.js·512 PNG HTTP200 |
| 기존 기능 | 음악·보관·취향·공연 안정성 전체 회귀 통과 |

실행 환경 Node24에서 package engine Node22 경고가 있었지만 테스트와 build는 통과했다. Vercel production은 Node22 설정을 유지한다. 기존 500kB 초과 bundle 경고는 유지되며 이번 PWA 변경에서 번들 의존성을 추가하지 않았다.

로컬 Playwright 설치에 브라우저 바이너리가 없어 실제 Service Worker controller 검증은 실행하지 못했다. 대신 HTTPS production에서 Manifest·Service Worker·아이콘 HTTP 200, Manifest MIME, sw.js 재검증 및 허용 scope 헤더, HTML 연결 메타데이터를 확인했다. cloud browser는 Service Worker API를 노출하지 않아 controller 값만 직접 읽지 못했다.

PR #5를 main에 병합했고 production SHA는 `b2f6b5033c7b7dbdefd734544a352e3df82ee70f`다. Vercel 배포 상태는 success이며 production 공연 화면에서 서울 305건 중 첫 20건이 정상 표시됐다. 실제 iPhone/Android 홈 화면 추가는 사용자 기기의 최종 smoke test로 남지만 코드·배포 기준 상태는 OPERATIONAL이다.

DB DDL/DML·migration·KOPIS/공연API 호출·예약 변경은 0이다. 이전 CA-CONCERT-RELIABILITY 작업 문서는 [보관본](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/main-before-pwa/HANDOFF.md)에 보존했다.

## 사용자 최종 확인

1. iPhone은 Safari에서 공유 > 홈 화면에 추가를 선택한다.
2. Android는 Chrome 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택한다.
3. `Piano Mood` 아이콘으로 실행했을 때 브라우저 주소창 없는 standalone 화면인지 확인한다.

## 명세 2 사용자 확인과 수정

사용자가 iPhone 홈 화면 추가와 앱 아이콘 생성을 확인했다. standalone 실행에서 하단 내비게이션이 Safari보다 낮아 보이는 현상은 iOS 홈 인디케이터 영역을 위한 viewport 선언과 standalone 전용 최소 높이 보정으로 수정한다. 일반 브라우저 모드에는 전용 규칙을 적용하지 않는다.

추가로 공연 찾기의 시작일·종료일 date input이 검색 패널 오른쪽을 넘는 현상을 수정한다. 패널·form·날짜 grid·label에 `min-width: 0`과 100% 최대 너비를 적용하고, iOS date input에는 물리 너비와 논리 너비를 함께 제한한다. 패널은 최종 안전장치로 넘친 native input 영역을 자른다.

`viewport-fit=cover`를 추가했고 679px 이하 `display-mode: standalone`에서만 하단 내비게이션의 위쪽 10px, 아래쪽 `10px + max(10px, safe-area)`, 버튼 최소 높이 60px을 사용한다. 앱 본문 하단 여백도 132px+safe-area로 맞춰 마지막 콘텐츠가 내비게이션에 가려지지 않게 했다.

| 명세 2 검증 | 결과 |
| --- | --- |
| PWA·모바일 직접 테스트 | 8/8 PASS |
| 전체 `npm test` | 114/114 PASS, fail0/skip0, 약 9.67초 |
| production build | PASS, 약 1.27초 |
| 영향 범위 | index viewport, standalone 모바일 CSS, 회귀 테스트 |
| 비변경 | 일반 Safari·Android/desktop 규칙, DB·API·예약·Service Worker |

production 배포 후 기존 홈 화면 아이콘으로 앱을 완전히 종료·재실행해 하단 네 메뉴의 높이·홈 인디케이터 간격과 공연 찾기 날짜 입력이 패널 내부에 들어오는지 확인한다. CSS/HTML 갱신이 보이지 않으면 iOS 캐시 반영을 위해 앱을 종료한 뒤 다시 열고, 그래도 동일하면 홈 화면 아이콘을 한 번 제거·재추가한다.

PR #6을 main에 병합했고 production SHA는 `3244388d7aada347d1603702c011b557666abaa6`다. Vercel status success 후 production HTML에서 `viewport-fit=cover`, 배포 CSS에서 standalone media와 날짜 input 논리 너비 제한을 확인했다. DB·API·예약 변경은 0이다.
