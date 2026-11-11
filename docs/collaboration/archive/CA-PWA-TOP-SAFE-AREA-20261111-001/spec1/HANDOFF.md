# PWA 상단 상태바 보완 인계

- 작업 ID: CA-PWA-TOP-SAFE-AREA-20261111-001 / 명세1
- 상태: IMPLEMENTED (검토자의 ACCEPTED·실제 iOS PWA PASS 아님)
- 브랜치: codex/ca-pwa-top-safe-area-20261111-001
- 코드 기준 전체 SHA: b8b15cf25f5c80ac3dd3f36eb4f5971c49303c20
- 기준 main: 3e4e163fbc77577354dddc783d174ccb2893258a
- 기록 시각: 2026-11-11 13:36:42 KST

## 변경·결과

index.html의 apple-mobile-web-app-status-bar-style를 default로 변경하고 cover를 유지했다. src/styles.css의 html(:root)/body/#root 배경을 불투명 #f7f3eb로 통일했다. 일반 헤더 top padding/env 보정은 추가하지 않았다. 기존 하이라이트 모달 top inset/하단 inset·아이콘 메뉴/헤더 색상·원형·공연 배경 장식은 그대로다. 비교 과정에서 작은 홈 브랜드 링크를 확인해 문구 위치를 움직이지 않고44px 투명 hit 영역만 추가했다. 44px는 터치 기준이지 노치/상태바 높이 보정이 아니다.

변경 파일: index.html, src/styles.css, scripts/pwa.test.mjs, scripts/pwaTopMobileEntry.jsx, scripts/testPwaTopMobile.mjs 및 공동 문서/보고서/JSON/합성 화면9개·이전 작업 보관 쌍. App/Auth/DB·RLS/RPC/Realtime/추천·SW/manifest/설정 파일 변경0. 원래 IDE dirty worktree·HEAD와 파일52개를 보존했다. 원본 iPhone 화면/이메일/실제 사용자 자료를 저장·커밋하지 않으며 합성 화면의 이메일/Google 개인 이름도 제거했다.

## 검증·한계

전체171/171, 정적PWA5/5, production build PASS(fail/skip0). 수정78건을 기준 main78건과 비교했다:13화면×320/375/390px×일반/standalone CSS조건. 헤더 텍스트·제목·간격/장식 및 하단 높이/여백의 baseline 일치, canvas 불투명크림색·넘침/잘림 없음·computed typography·44px 주요 touch/hit 검증 PASS. 기존 build chunk 경고는 남는다.

일반 조건은 Windows Chromium 모바일 viewport이고 실제 Safari가 아니다. standalone CSS는 테스트 서버가 기존 media rule을 활성화한 조건 시뮬레이션이다. CDP display-mode가 실제 matchMedia를 바꾸지 못해 설치형으로 주장하지 않는다. 실제 iOS PWA/Safari/Android 설치형·OS 상태바/노치/Dynamic Island/native insets·실기기 IME/방향 전환, 실제 OAuth/PostgREST/Realtime는 미검증이다.

## 구현자 의견·다음 검토

Apple 보관 문서상 translucent 모드의 상태바 중첩 가능성이 원인 후보다. 실제 최신 iOS 흐림 원인을 단정하거나 해결을 확정하지 않는다. default만 우선 적용하고 실제 중첩이 확인될 때만 standalone/env 보정을 후속으로 판단한다. 페이지 배경색은 시스템 상태바 색상을 강제하지 않는다.

[구현 문서](../../../../PWA_TOP_SAFE_AREA.md)에 실제 iPhone의 완전 종료→재실행→필요시 홈 화면 PWA 삭제→Safari로 운영 주소→홈 화면에 추가→설정 상단 재확인 절차를 기록했다. 배포 승인 후 실기기 확인이 필요하다. [검증 JSON](../../../../PWA_TOP_SAFE_AREA_VERIFICATION_2026-11-11.json), [실측](../../../../PWA_TOP_SAFE_AREA_MOBILE_2026-11-11.json), [합성 화면](../../../../pwa-top-safe-area-20261111)을 검토해달라.

DB migration 불필요. 운영 DB/환경변수/Supabase·OAuth 설정/사용자 자료·main 병합·운영 배포는 실행하지 않았다. Draft 게시 후 문서/증거만 추가하며 최종 PR HEAD는 GitHub 메타데이터와 완료 응답으로 확인한다. 별도 작업 트리에는 게시 후 커밋 전 변경을 남기지 않는다.
