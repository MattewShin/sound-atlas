# 작업 인계

- 작업 ID: CA-PWA-20261030-001 / 명세1
- 상태: IMPLEMENTED / HTTPS preview·실기기 설치 검증 대기
- 작성: 웹 GPT / 2026-10-30 KST
- 브랜치: codex/ca-pwa-20261030-001
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

로컬 Playwright 설치에 브라우저 바이너리가 없어 실제 Service Worker controller 검증은 실행하지 못했다. HTTPS Vercel preview에서 Manifest·Service Worker·375px 화면과 설치 가능 상태를 확인한 뒤 병합한다.

DB DDL/DML·migration·KOPIS/공연API 호출·예약 변경은 0이다. 이전 CA-CONCERT-RELIABILITY 작업 문서는 [보관본](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/main-before-pwa/HANDOFF.md)에 보존했다.

## 검토 요청

1. Vercel preview에서 manifest와 sw.js가 200이며 Service Worker가 activated인지 확인한다.
2. 375px에서 기존 화면이 유지되는지 확인한다.
3. 가능하면 iPhone Safari의 공유 > 홈 화면에 추가 또는 Android Chrome 설치에서 아이콘·이름·standalone 실행을 확인한다.
4. 통과하면 main 병합·production 배포 후 OPERATIONAL로 갱신한다.
