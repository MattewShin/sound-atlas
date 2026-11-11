# iOS PWA 상단 상태바 보완 — 2026-11-11

**CA-PWA-TOP-SAFE-AREA-20261111-001 / 명세1 / IMPLEMENTED**. 기능·검증 SHA `b8b15cf25f5c80ac3dd3f36eb4f5971c49303c20`, 기준 main `3e4e163fbc77577354dddc783d174ccb2893258a`, 브랜치 `codex/ca-pwa-top-safe-area-20261111-001`. [검증 JSON](PWA_TOP_SAFE_AREA_VERIFICATION_2026-11-11.json) · [모바일 비교 실측](PWA_TOP_SAFE_AREA_MOBILE_2026-11-11.json) · [HANDOFF](../HANDOFF.md). 자체 구현 완료이며 검토자의 ACCEPTED나 실제 iOS PWA 수정 확인을 뜻하지 않는다. main 병합·운영 배포는 수행하지 않았다.

## 원인 판단과 근거

요청된 실제 iPhone PWA 증상은 상태바 아래 흐림과 프로필 헤더 잘림이다. 기존 HTML은 viewport-fit=cover와 black-translucent를 사용하고, 일반 페이지 헤더에는 별도 top inset 처리가 없었다. [Apple의 보관된 Safari meta 문서](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)는 default/black에서 웹 콘텐츠를 상태바 아래에 배치하고 translucent 모드에서는 화면 전체에 배치해 상태바가 일부를 가릴 수 있다고 설명한다. 이는 겹침의 원인 후보와 변경 방향을 뒷받침하지만, 보관 문서만으로 현재 iPhone OS의 흐림 효과를 단정하지 않는다. **실제 기기에서 원인을 재현·확정하거나 수정 후 해결을 확인하지 않았다.**

페이지 헤더와 상위 canvas에서 blur/backdrop-filter/mask를 찾지 못했다. 기존 하단 메뉴의 blur(10px), 공연 헤더의 의도된 색상 그라데이션, 상세 모달의 그라데이션/상단 inset은 별개여서 유지했다. 기존 html(:root)은 회색 #e4e1da, body/#root는 투명했고 앱 내부만 #f7f3eb여서 노출되는 canvas 배경을 크림색으로 통일했다.

## 변경 내용과 이중 여백 방지

| 대상 | 변경 |
| --- | --- |
| index.html | apple-mobile-web-app-status-bar-style를 **default**로 변경. viewport-fit=cover와 기존 theme-color/manifest/icon 연결은 유지 |
| src/styles.css | html(:root)의 배경을 #f7f3eb로 변경하고 body/#root에도 불투명 #f7f3eb 지정 |
| 홈 브랜드 링크 | 기존 텍스트 크기보다 작은 클릭 영역을 투명한 44px 높이 pseudo element로 확장. 텍스트/헤더 배치와 기본 padding은 유지 |
| 일반 페이지 top inset | **추가하지 않음**. default 모드가 제공하는 시스템 영역 분리에 추가 padding을 겹치지 않도록 함 |
| 하단 메뉴/홈 인디케이터 | 관련 CSS·safe-area-inset-bottom·아이콘/높이/여백 변경 없음 |

44px는 공통 터치 목표 크기이며 상태바/노치 높이 보정값이 아니다. 기종별 높이, 고정 상단 padding, UA 분기, standalone 전용 top padding을 추가하지 않았다. 기존 하이라이트 모달의 safe-area-inset-top은 수정하지 않았고 정적 검증도 이 모달만 예외로 인정한다. 일반 Safari/Chrome/Android에 새 상단 여백을 주는 규칙이 없다.

header 색상·원형 장식·의도된 공연 배경·첫 링크/제목의 위치 관계를 보존했다. 페이지 바깥의 desktop canvas도 회색에서 크림색으로 바뀌지만, 헤더와 앱 내부 디자인은 유지한다. 시스템 상태바의 실제 색상·렌더링은 iOS가 결정하며 이 CSS가 그 색상을 강제한다고 주장하지 않는다. 실제 기기에서 default 이후에도 중첩이 관측될 때만 새 증거를 바탕으로 standalone/env(safe-area-inset-top) 보정 필요성을 검토한다.

## 화면 범위와 검증

| 화면 | 비교 대상 |
| --- | --- |
| 홈 | .top-header |
| 음악 추천 전체 결과 | .recommendation-list-header |
| 보관함 | .library-header |
| 공연 찾기 | .concert-coming-header |
| 음악 이야기 | .social-heading |
| 내 프로필 홈·내 기록·취향·설정 | #profile, #profile/records, #profile/taste, #profile/settings |
| 프로필 수정·미리보기·차단·개인정보 | #profile/edit, #profile/preview, #profile/blocked, #profile/privacy |

각 프로필 주소를 새 문서로 직접 열었다. 기존 main의 HTML/CSS와 수정 HTML/CSS를 같은 합성 App/데이터로 렌더링해 13화면×320/375/390px×두 CSS 조건에서 비교했다. 기준78건과 수정78건이다. 외부 네트워크를 차단했고 실제 Supabase/Google/운영 서비스 요청은 하지 않았다. 본문/이메일이 있는 원본 iPhone 화면을 가져오거나 저장·커밋하지 않았다. 합성 인증 fixture에서도 이메일과 Google 개인 이름은 제거했다.

| 실행 | 결과 | 검증 범위 |
| --- | --- | --- |
| node --test scripts/pwa.test.mjs | **5/5 PASS** | default 태그 유일성, HTML에 black-translucent 없음, cover/기존 bottom inset 유지, 기종별 미디어/새 일반 top inset 없음, manifest/SW/보안 연결 |
| npm test | **171/171 PASS**, fail/skip0 | 기존 전체 회귀 + 추가 PWA 정적 검증 |
| node scripts/testPwaTopMobile.mjs | **수정78/78 PASS**, 기준78건과 비교 | 아래 일반39·standalone CSS39, 화면별 위치/색상/장식·bottom 치수/터치/타이포그래피 비교 |
| npm run build | **PASS** | production build. 기존 500kB chunk 경고는 남음 |
| 안전·변경 범위 검사 | **PASS** | 비밀값/링크/JSON, 원래 IDE52개 파일/HEAD 보존, 보호된 Auth/DB/추천/설정 파일 변경0 |

수정 후 html/body/#root 모두 불투명 rgb(247,243,235), 첫 헤더 텍스트/링크와 제목이 viewport 밖으로 나가지 않음, 가로 넘침 없음, 기존 main과 헤더 위치·높이·기본 padding·원형 장식 동일, 새 blur/mask/의도하지 않은 gradient 없음, 하단 메뉴의 높이·padding·28px 아이콘·버튼 배치 동일을 확인했다. 주요 헤더 버튼/복귀 링크와 하단 메뉴의44px 이상 영역, 브랜드 pseudo element의 실제 hit 영역을 검사했다. 첫 텍스트/제목은 문자별 Range 좌표로 실제 줄 수를 세고 computed line-height와 비교해 Pretendard/-0.03em/최소12px 짝수 크기·한 줄 normal/여러 줄1.5를 확인했다.

### 일반 브라우저와 standalone의 구분

- **일반 조건39/39**: Windows Chromium 모바일 viewport. 실제 Safari 브라우저 chrome/상태바를 재현하지 않는다.
- **standalone CSS 조건39/39**: 기존 standalone media rule만 테스트 서버에서 활성화한 CSS 조건 시뮬레이션이다. 기준/수정 양쪽에 동일하게 적용해 기존 하단 규칙이 유지되고 상단 이중 여백이 생기지 않는지 비교했다. 사용한 Chromium의 CDP display-mode 에뮬레이션은 실제 matchMedia를 바꾸지 못해 설치형 동작으로 포장하지 않았다. 테스트 코드는 CSS 조건 변환을 명시한다.
- 실제 Safari/iOS/설치형 Android PWA, OS 상태바와 노치/Dynamic Island, 실기기 홈 인디케이터 inset은 **미검증**이다. 호스트의 safe-area 값이0인 비교를 실제 기기의 값으로 해석하지 않는다.

### 합성 화면 증거

| 너비 | 프로필 홈·일반 | 설정·일반 | 설정·standalone CSS 시뮬레이션 |
| --- | --- | --- | --- |
| 320px | [화면](pwa-top-safe-area-20261111/profile-browser-320.png) | [화면](pwa-top-safe-area-20261111/settings-browser-320.png) | [화면](pwa-top-safe-area-20261111/settings-standalone-css-320.png) |
| 375px | [화면](pwa-top-safe-area-20261111/profile-browser-375.png) | [화면](pwa-top-safe-area-20261111/settings-browser-375.png) | [화면](pwa-top-safe-area-20261111/settings-standalone-css-375.png) |
| 390px | [화면](pwa-top-safe-area-20261111/profile-browser-390.png) | [화면](pwa-top-safe-area-20261111/settings-browser-390.png) | [화면](pwa-top-safe-area-20261111/settings-standalone-css-390.png) |

## 배포 후 실제 iPhone 확인 안내 — 아직 실행하지 않음

이 PR은 Draft 검토 단계이며 운영 배포는 별도 승인 후 진행한다. 그 이후 사용자가 실제 iPhone에서 다음 순서로 확인한다. iOS가 이전 설치 시점의 설정이나 화면 상태를 유지할 가능성을 구분하기 위한 절차다.

1. PWA를 앱 전환 화면에서도 완전히 종료한다.
2. 다시 실행해 상단을 확인한다.
3. 기존 아이콘에서 계속 같은 현상이 나타나면 홈 화면의 PWA를 삭제한다.
4. Safari에서 운영 주소 https://sound-atlas.vercel.app/ 를 다시 연다.
5. ‘홈 화면에 추가’로 새로 설치한다.
6. 설정 화면에서 상단 흐림·첫 복귀 링크/제목 잘림과 불필요한 이중 여백을 재확인한다.

가능하면 OS 버전·일반 Safari와 설치형의 차이·재설치 전후·개인정보 없는 상단 영역을 확인한다. 실제 iPhone 검증 전에는 **iOS PWA PASS로 기록하지 않는다**. default 이후에도 문제가 남으면 헤더 좌표/viewport·safe-area 계산 증거를 확인한 뒤 상단 보정을 별도로 판단한다.

## 적용 제한·인계

DB migration 불필요·추가0. 운영 DB·환경변수·Supabase/OAuth/Vercel 설정·사용자 자료 변경0. App/Auth/개인 기록/공유/RLS/Realtime/추천 알고리즘·service worker/manifest 파일을 변경하지 않았다. 실제 OAuth·PostgREST/Realtime·iOS/Safari/Android 설치형 및 실기기 IME/키보드 검증은 하지 않았다. 원래 dirty worktree와 이전 작업 브랜치를 보존했다.

main 병합·운영 배포는 명세1에서 실행하지 않는다. 기능 SHA 이후 추가 커밋은 문서/안전 JSON/합성 화면뿐이며 최종 PR HEAD는 PR 메타데이터와 완료 보고에서 확인한다. 이전 프로필 대시보드 작업은 [명세2 보관](collaboration/archive/CA-PROFILE-DASHBOARD-IA-20261110-001/spec2/CURRENT_TASK.md)에 함께 보존했다.
