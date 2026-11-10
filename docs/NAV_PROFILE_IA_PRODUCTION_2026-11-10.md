# 내비게이션·내 프로필 통합 운영 결과 — 2026-11-10

**CA-NAV-PROFILE-IA-20261110-001 / 명세2 / IMPLEMENTED**. 사용자의 운영 승인에 따라 PR #24를 Ready for review로 전환·main 병합했고 Vercel 운영 Ready와 실제 익명 읽기/화면 스모크를 확인했다. [검증 JSON](NAV_PROFILE_IA_PRODUCTION_VERIFICATION_2026-11-10.json), [HANDOFF](../HANDOFF.md), [명세1 구현·모바일 검증](NAV_PROFILE_IA.md)을 구분해 읽는다. 구현자의 완료 보고이며 검토자의 ACCEPTED를 대신하지 않는다.

## 기준과 배포

| 항목 | 결과 |
| --- | --- |
| PR | [#24](https://github.com/MattewShin/sound-atlas/pull/24), Ready 전환 후 병합 |
| 승인 HEAD | `2cfb28ffd0587a3f481029561b0ac8ff12dbd677` |
| 승인 기능·테스트 SHA | `1a03ca832329a356fa15a615af568958244c911e` |
| 적용 전 main / 실제 production | `465173d2e2e41ee58f387b18b6897a3e29cbaff9`, 동일 |
| 최종 main / 운영 배포 SHA | **`3e588ebc8dacdd5cf3cd648229ff31bd5553a4ef`** |
| Vercel deployment | `dpl_93i4kUeQpqhYuyE9sHsWTtivt73M` / production **READY** |
| 운영 앱 | https://sound-atlas.vercel.app |
| 사전 gate | 2026-11-10 10:22:45 KST PASS |
| main 병합 | 2026-11-10 10:24:07 KST |
| 운영 스모크 완료 | 2026-11-10 10:25:09 KST |

원격 main/승인 HEAD를 다시 확인했고 main의 새 변경이나 충돌이 없었다. expected_head_sha를 고정해 Ready 전환 후 merge했다. 병합 main의 전체 tree는 승인 HEAD와 같고, 승인 기능 SHA 이후 차이는 문서뿐이다. 별도 기능 수정 커밋은 필요하지 않았다.

결과 문서는 `codex/ca-nav-profile-ia-20261110-001-production`에 문서 전용 커밋으로 게시한다. 운영 코드/main은 위 SHA를 유지하고 문서 저장 SHA는 해당 브랜치 이력을 따른다. main에 병합된 명세1의 “운영 미실행/Draft 검토 전”은 준비 당시 이력이며, 이 문서 브랜치의 CURRENT_TASK/HANDOFF와 본 보고서가 명세2 결과다.

## 승인 테스트 근거 확인

전체 **166/166**, SNS **5/5**, 프로필 통합 **4/4**, 모바일 **36/36**, production build **PASS**를 기존 로그 및 승인 검증 JSON과 대조했다. 로그의 fail/skip0과 build 완료를 확인했고, 승인 기능 SHA→승인 HEAD→merged main의 기능 파일 차이0을 확인했다. 승인 검증 JSON SHA-256은 `e622523ad29bb59333a9da94ec501c1746b56fb9ff5e25f5c60e104ccc391f7d`다. 실제 글자 Range 측정/대표 대상16/잘못된 normal 대조군4는 명세1의 합성 로컬 검증이며 운영 스모크 횟수로 더하지 않는다. 기존 build의500 kB chunk 경고는 유지된다.

**변경 없는 전체 테스트/build와 DB 검증은 이번에 재실행하지 않았다.** 이번 새 실행은 main/배포/승인 증거 읽기와 아래 운영 익명 스모크다.

## 실제 운영 스모크

기존 사용자 브라우저와 분리한 새 익명 Chromium context에서 320/375/390px 각각 다음6개 화면, 총 **18/18 PASS**를 확인했다.

| 읽기 화면 | 확인 |
| --- | --- |
| 음악 이야기 | MUSIC STORIES / 음악 이야기, 실제 익명 social_feed200, 피드·개인 원본·내 프로필·로그아웃 탭 없음 |
| 보관함 | 보관함 제목·빈 보관곡 안내, 기록 전환/전체 기록 목록 없음 |
| 내 프로필 | MY PROFILE / 내 프로필 진입, 나의 음악 취향, 비로그인 Google 로그인 안내 및 활성 버튼 |
| 기존 게시물 링크 | 익명 공개 피드에서 얻은 기존 ID로 #music/post 진입·게시물1개 표시 |
| 기존 곡 링크 | 같은 공개 글의 기존 곡 ID로 #music/track 진입·곡별 제목과 글 표시 |
| 기존 타인 프로필 링크 | 같은 공개 작성자의 profile ID로 #music/profile 진입·공개 프로필과 글 표시 |

전 화면에서 하단 아이콘5개, aria-label/title(음악 탐색·공연 찾기·보관함·내 프로필·음악 이야기), 올바른 단일 aria-current=page, 화면 텍스트 레이블0, SVG aria-hidden/28px, 버튼48px 이상·동일 너비·중앙 정렬, 가로 넘침0을 확인했다. 페이지 오류0, 읽기 API15회 모두200, 비읽기 요청0이다. 로그인 버튼의 존재/활성만 확인했으며 클릭하지 않았다. 보관함은 익명의 새 로컬 보관함 기준이므로 로그인 계정의 저장곡 내용을 확인한 것으로 표현하지 않는다.

게시물·곡·작성자 식별자는 공개 피드 응답에서 메모리 안에서만 참조했다. 공개 문서/JSON·로그에 실제 ID나 닉네임/본문/이메일을 저장하지 않았다. 전체 DOM이나 실제 글 화면을 스크린샷으로 공개하지 않았다. 스모크 브라우저는 GET/HEAD/OPTIONS와 read-only social_feed/social_profile RPC만 허용하고 그 외 요청을 차단하도록 구성했다.

앱의 기존 Realtime 연결을 통한 익명 피드 초기 읽기는 정상 진입했다. 범위 변경·차단·공유 취소를 일으켜 다중 창 무효화나 연결 복구를 시험하지 않았으므로 해당 검증은 별도 미검증이다.

## 보존과 변경하지 않은 범위

- DB 접속/SQL/검증0, migration 추가/적용0. Supabase 설정·RLS·Realtime publication·OAuth provider·환경변수 변경0.
- baseline main→운영 main의 supabase/api/server/src/data/src/lib/package/lockfile/vercel.json 차이0. 기존 원본·공유본 구조/링크 ID/계정 삭제 cascade와 서버 권한 계약은 그대로다.
- 실제 기록 생성/수정/삭제/공개0, 계정 전환/로그아웃/삭제0. 기존 사용자 세션을 재사용하지 않아 다른 사용자를 로그아웃시키지 않았다.
- 원래 IDE branch/HEAD/미커밋·비추적 변경과 실제 .env는 보존했다. 작업은 승인 구현 worktree와 별도 결과 문서 worktree에서 진행했다.

처음 Vercel 직접 읽기가403을 반환했으나 기존 설치 CLI의 **inspect 읽기 명령**이 만료된 로컬 로그인 토큰을 정상 갱신해 해결했다. 이후 실제 production alias SHA/READY를 API로 확인했다. 이는 로컬 Vercel CLI 인증 갱신이며 프로젝트 설정·Google OAuth provider·환경변수 변경이 아니다. CLI 원문 출력이나 토큰/인증 파일 경로는 공개하지 않는다.

## 미검증과 다음 확인

실 Google OAuth 인증 완료/Google 계정 선택 화면은 **수동 미검증**이다. 자동 계정 전환·로그아웃을 실행하지 않았다. 로그인된 실제 개인 기록/공개 프로필 CRUD·계정 삭제, Realtime 다중 창 무효화/재연결, 실제 iOS/Android IME·하드웨어 safe-area도 미검증이다. 운영 스모크는 익명 읽기·화면 확인 범위이며 이전 합성 테스트를 실환경 검증으로 바꾸어 보고하지 않는다.

롤백이 필요하면 승인 전 UI 코드로 되돌리는 별도 앱 배포를 검토한다. 이번에는 DB 구조·자료 변경이 없어 DB restore/down migration은 필요하지 않으며 실행하지 않았다. 현재 운영 오류가 확인돼 기능을 추가 수정한 내역은 없다. 명세1/검토 보완 [명세·인계 보관](collaboration/archive/CA-NAV-PROFILE-IA-20261110-001/spec1/)과 운영 증거를 함께 검토하면 된다.
