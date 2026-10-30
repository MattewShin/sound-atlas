# 현재 작업

- 작업 ID: CA-PWA-20261030-001
- 명세 버전: 1
- 상태: IMPLEMENTED / preview·설치 검증 대기
- 브랜치: codex/ca-pwa-20261030-001
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
- Service Worker 실제 등록·설치 UI·iOS/Android 홈 화면 추가는 HTTPS preview 또는 production 실기기 검증 후 OPERATIONAL로 전환한다.

이전 안정성 작업의 main 문서는 [보관본](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/main-before-pwa/CURRENT_TASK.md)에 보존했다.
