# PWA 상단 상태바 운영 반영 결과

- 작업: CA-PWA-TOP-SAFE-AREA-20261111-001 / 명세2
- 상태: **DEPLOYED / IOS_CONFIRMATION_PENDING** — 운영 배포 완료 / 실제 iOS PWA 사용자 확인 대기
- 기록: 2026-11-11 13:59:00 KST
- [기능 PR #28](https://github.com/MattewShin/sound-atlas/pull/28): Ready 전환 후 병합 완료, 2026-11-11 13:49:20 KST
- 기능·기존 검증 SHA: `b8b15cf25f5c80ac3dd3f36eb4f5971c49303c20`
- 검토된 최종 PR HEAD: `3a2cf97b93b17fa5dd79e0c7a3ad1ea20e2e04ad`
- 운영 코드·merge/main·Vercel 배포 SHA: `de4f78d2b00edae6166348194e1a648c8d0e184a`
- 결과 문서 브랜치: `codex/ca-pwa-top-safe-area-20261111-001-production` (문서 커밋 SHA는 해당 브랜치 Git 이력/최종 보고로 확인; 자기 SHA를 본문에 넣기 위한 재귀 커밋 없음)

## 병합·배포 근거

open/Draft·expected HEAD·기준 main·미해결 review thread 없음·Preview success를 확인하고 기존 merge commit 방식을 사용했다. merge tree는 검토된 PR tree와 동일하다. 추가 runtime 수정은 없다. Vercel Production **READY**, deployment `dpl_jqX7U1ctQUg8Gw4eNq3xKFic1ntK`, 배포 SHA와 main 일치, 운영 도메인 alias 정상이다. GitHub Vercel success도 확인했다. Production Ready를 통해 배포 build 완료를 확인했으며 주요 앱/자원에서 새 빌드 오류를 발견하지 않았다. 원래 IDE 작업 트리의 미커밋 변경과 다른 브랜치를 유지했다.

## 실제 운영에서 확인한 항목

운영 도메인 HTTP200. 브라우저 Service Worker를 거치지 않은 직접 HTTP 요청(no-store/no-cache)에서 status-bar-style=default, black-translucent 부재, viewport-fit=cover 유지를 확인했다. CSS 바이트 SHA256은 승인 build와 일치한다. Manifest/SW/offline HTML/JS 모두200이며 소스와 일치한다(Windows CRLF/LF만 정규화). Vercel alias SHA·새 meta·CSS 일치로 이전 설치본 캐시가 아닌 현재 배포 응답임을 확인했다. CDN HIT 표시는 이전 릴리스라는 뜻으로 해석하지 않았다. 기존 SW는 network-first navigation이며 해당 소스에 변경이 없다.

| viewport | 운영 익명 화면 | 결과 |
| --- | ---: | --- |
| 320px | 13 | PASS |
| 375px | 13 | PASS |
| 390px | 13 | PASS |

총39/39: 홈·음악 추천 결과·보관함·공연 찾기·음악 이야기와 #profile, #profile/records, #profile/taste, #profile/settings, #profile/edit, #profile/preview, #profile/blocked, #profile/privacy 직접 접근. 프로필은 로그인 안내로 확인했으며 로그인 후 화면을 검증했다고 주장하지 않는다. 익명 자료 노출/상단 잘림/이중 여백/가로 넘침/헤더 blur·mask/치명적 JS 오류를 발견하지 않았다. 헤더/제목 위치·top padding은 승인된 Chromium 일반 조건과 일치한다. 불투명 크림색 canvas, 하단 메뉴5개·44px touch·28px 아이콘, 하단 높이·여백을 확인했다. 추천은 화면에서 키워드를 선택해 접근했고 자료를 쓰지 않았다. 공연 찾기는 화면 진입 검사이며 공연 검색의 새로운 전수 검증이 아니다. 익명 social_feed 읽기 응답만 확인했으며 인증 RLS 검증으로 대체하지 않는다.

신규 격리 익명 context에서 SW ready/controller와 캐시 생성은 확인했다. context.setOffline 후에도 worker가 앱을 반환해 네트워크 단절을 입증하지 못했으므로 **오프라인 대체 화면 진입은 미검증**이다. 초기 검사 문구 대기는 이 모사 한계로 timeout했으며, 실제 앱 실패로 단정하거나 fallback PASS로 바꾸지 않았다. SW/manifest/offline 자원200과 기존 소스 보존만 PASS다.

[운영 검증 JSON](PWA_TOP_SAFE_AREA_PRODUCTION_VERIFICATION_2026-11-11.json) · 익명 설정 화면 [320px](pwa-top-production-20261111/anonymous-settings-320.png) / [375px](pwa-top-production-20261111/anonymous-settings-375.png) / [390px](pwa-top-production-20261111/anonymous-settings-390.png). 화면은 새 익명 context이며 실제 iPhone 캡처가 아니다.

## 기존 합성 검증과 미검증 범위

승인 SHA의 전체171/171·PWA 정적5/5·모바일78/78·production build PASS 증거와 로그 checksum을 확인했다. 코드 변화가 없어 전체 테스트/build를 재실행하지 않았다. 모바일78은 일반 Chromium39 + standalone CSS 시뮬레이션39이며 실제 iOS/Safari/Android 설치형이 아니다. 이번 운영39건도 Windows Chromium viewport다. 상단 env 추가 없이 default를 우선 적용했고, 기존 하단 safe-area/헤더 디자인/Auth/추천·보관함·공연·SNS 로직을 유지했다.

실제 iPhone 설치형 상태바/흐림 해결, native insets·노치/Dynamic Island·홈 인디케이터·방향 전환·실기기 IME, 실제 Safari/Android 설치형, Google OAuth·인증 PostgREST/RLS·다중 창 Realtime는 미검증이다. 실제 사용자의 세션·자료를 사용하거나 변경하지 않았다. 사용자 확인 전 CLOSED/실제 iOS PASS로 처리하지 않는다.

## 사용자 iPhone 확인

1. 기존 PWA를 앱 전환 화면에서도 완전히 종료한다.
2. 다시 실행해 상단 상태를 확인한다.
3. 기존 설치본에서 변화가 없으면 홈 화면의 Sound Atlas PWA를 삭제한다.
4. Safari에서 [운영 주소](https://sound-atlas.vercel.app/)를 연다.
5. 공유 → 홈 화면에 추가를 선택한다.
6. 새로 설치한 PWA를 실행한다.
7. 내 프로필 → 설정으로 이동한다.
8. 흐릿한 그라데이션 제거, 상단 링크 선명도, 제목 잘림 없음, 과도한 빈 공간 없음, 자연스러운 색상 경계, 정상 하단 메뉴를 확인한다. 캡처를 공유한다면 이메일과 개인 자료를 가린다. 원본 캡처는 저장소/공개 PR에 올리지 않는다.

사용자가 해결을 확인한 뒤에만 CLOSED로 변경한다. 기존 흐림만 지속되고 새 회귀가 없으면 DEPLOYED / IOS_FIX_UNCONFIRMED로 기록하고 실제 safe-area 측정 후속 작업으로 분리한다. 임의의 DB/환경/설정을 변경하지 않는다.

## 변경 통제·복구

DB 작업·migration·환경변수·Supabase/RLS/RPC/Realtime/OAuth/Vercel 설정·사용자 자료 변경 **0건**. 추가 기능 코드 변경0, 결과는 문서·JSON·익명 화면3개·명세1 보관 쌍과 공동 문서에만 기록한다. 결과 문서 PR 생성/병합은 별도 승인 전까지 하지 않는다. 비밀값·사용자 이메일/본문/세션·개인 브라우저 정보·실제 백업 경로를 문서에 포함하지 않는다.

Production not Ready/SHA 불일치/black-translucent 잔존/상단 악화·이중 여백/하단 safe-area 회귀/주요 화면 장애/개인 자료 노출이면 완료로 처리하지 않는다. 즉시 복구가 필요한 코드 회귀는 별도 브랜치에서 `git revert -m 1 de4f78d2b00edae6166348194e1a648c8d0e184a`을 생성해 main 반영 후 Production Ready/alias를 확인한다. 강제 push/history rewrite/DB rollback은 하지 않는다. 현재는 해당 회귀가 관찰되지 않아 revert를 실행하지 않았다.
