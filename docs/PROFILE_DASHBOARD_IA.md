# 내 프로필 대시보드 구현 — 2026-11-10

게시: [Draft PR #26](https://github.com/MattewShin/sound-atlas/pull/26) · 브랜치 `codex/ca-profile-dashboard-ia-20261110-001`. 원격에 반영했으며 main은 병합하지 않았다.

**CA-PROFILE-DASHBOARD-IA-20261110-001 / 명세1 / IMPLEMENTED**. 기능·테스트 SHA는 `fda3efa7c750eaed9e9b3793b0fc18f887aceae0`, 기준 main은 `fe73abfccd4aafa62dedadbbaed3e1fa4abe099d`다. 브랜치 `codex/ca-profile-dashboard-ia-20261110-001`에서 구현했다. [검증 JSON](PROFILE_DASHBOARD_IA_VERIFICATION_2026-11-10.json), [모바일 실측 JSON](PROFILE_DASHBOARD_MOBILE_2026-11-10.json), [HANDOFF](../HANDOFF.md)를 함께 읽는다. 자체 구현 완료이며 검토자의 ACCEPTED는 아니다.

## 기존 문제와 신규 구조

이전 내 프로필은 공개 프로필·수정 폼·전체 기록·취향 차트·차단 목록·개인정보·계정을 한 화면에 쌓았다. 기록은 처음 받은 10개에만 필터를 적용했고 별도 공유 게시물 목록도 있었다. 이제 홈은 공개 프로필 요약, 세 개의 진입 메뉴, 기록 개수와 최근 최대 3개로 제한한다. 폼·전체 목록·계정 관리 화면은 명시적으로 이동할 때만 마운트한다.

```text
#profile                         요약 홈
├─ records[/private|public]       전체 / 나만 보기 / 공개 중, 10개씩
├─ taste                         기존 감정 성향·추천
└─ settings                      관리 메뉴 + 최하단 계정 영역
   ├─ edit                       공개 프로필 편집
   ├─ preview                    기존 공개 프로필 헤더 미리보기
   ├─ blocked                    차단 목록·해제
   └─ privacy                    개인정보 처리 안내
```

## 기능 이동·보존

| 기존 기능 | 새 위치와 동작 |
| --- | --- |
| 프로필 이미지·공개 닉네임·@아이디 | 홈 상단. 이미지 없음은 기존 기본 아바타. Google 이름·이메일은 이 영역에서 사용하지 않는다. |
| 팔로워·팔로잉 개수 | 홈에 비대화형 텍스트로 표시한다. 숫자에는 링크·버튼·tabindex가 없고 관계 목록 기능은 추가하지 않았다. 공개 프로필 미리보기는 별도 명시적 링크로만 제공한다. |
| 공개 프로필 만들기·수정 | 홈의 버튼/설정 메뉴 → `#profile/edit`. 기본 화면에 폼 없음. 기존 고정 닉네임·아이디 형식/중복 검증·이미지 URL 처리는 유지한다. 저장 실패 시 폼 입력을 유지한다. |
| 타인에게 보이는 프로필 확인 | 홈 링크/설정 메뉴 → `#profile/preview`. 기존처럼 공개 헤더와 범위 안내를 표시하며 다른 방문자 권한을 가장하지 않는다. |
| 내 기록 개수·최근 기록 | 홈에 전체/나만 보기/공개 중 개수와 최근 최대 3개. 곡명으로 기존 상세를 열 수 있다. 본문 미리보기는 최대 80자다. |
| 전체 개인 기록 | `#profile/records`. 기본 10개, ‘기록 더 보기’로 10개씩. 기록이 많아도 홈 길이는 늘지 않는다. |
| 곡 상세·기록 생성/수정/삭제 | 내 기록에서 기존 선택·검증·실패 초안 유지·revision 충돌 처리·삭제 확인을 유지한다. 곡 상세 내부의 기록 기능도 유지한다. |
| 선택한 기록 공유 | 기존 공유 준비·기본 나만 보기·미리보기·범위 확인·동의 단계를 재사용한다. 개인 기록을 자동 공개하지 않는다. |
| 공유본 본문·공개 범위 관리 | 해당 기록의 ‘공유 내용 수정’ 또는 ‘공개 범위 변경’. 선택한 공유본 한 건만 조회한다. 별도 공유본 본문을 수정해도 원본은 바뀌지 않고, 원본 수정도 공유본을 바꾸지 않는다. 저장 실패 시 작성 내용을 유지한다. |
| 공유본 확인·링크 복사·공유 취소 | 해당 기록에 유지. 링크 복사는 범위를 바꾸지 않는다. 공유 취소는 원본을 보존하며 원본 삭제는 기존 DB 정책대로 공유본도 삭제한다. |
| 내가 공유한 게시물 | 중복 메뉴 제거, 내 기록의 ‘공개 중’으로 통합. `#profile/posts` 호환 경로도 동일하게 연결한다. 비공개로 전환한 공유본은 ‘나만 보기’에서 관리한다. |
| 기존 나의 음악 취향 | 홈 메뉴에 기존 상위 감정과 많이 보관한 작곡가 최대 2명을 요약. 취향이 없으면 곡 보관 시작 안내. `#profile/taste`에서 기존 차트·추천/탐색 버튼을 제공한다. 별도 취향 설정 알고리즘은 추가하지 않았다. |
| 차단한 사용자 관리 | 설정 → `#profile/blocked`. 이 화면에 들어갈 때만 목록 조회, 기존 해제 기능·빈 상태·오류 재시도 유지. |
| 개인정보 처리 안내 | 설정 → `#profile/privacy`, 기존 안내 재사용. |
| Google 계정 전환·로그아웃·계정 삭제 | 설정 최하단 계정 영역의 기존 AccountPanel 재사용. 로그아웃은 여백·중립적 점선으로 구분한다. 삭제 확인과 별도 경고 영역도 유지한다. |
| 하단 전역 메뉴·음악 이야기 | 기존 접근성 이름/활성 상태가 있는 아이콘 전용 5개 메뉴와 피드 단순화를 유지한다. |

‘나만 보기’는 기존 승인된 분류대로 **공유본 없음 또는 공유본 visibility=private**, ‘공개 중’은 **followers/public**이다. private 공유본을 어느 필터에서도 잃지 않고 두 상태가 전체를 빠짐없이 배타적으로 나누도록 유지했다. 원본은 어느 경우에도 비공개다. 이 UI 분류는 DB visibility나 공유 취소 의미를 바꾸지 않는다.

## 주소·이동 호환

| 주소 | 결과 |
| --- | --- |
| `#profile` | 홈 |
| `#profile/records` | 내 기록 전체 |
| `#profile/records/private`, `#profile/records/public` | 해당 필터를 첫 페이지부터 복원 |
| `#profile/posts` | `replaceState`로 `#profile/records/public`에 정규화. 뒤로 가기에서 옛 주소와 반복 이동하지 않음 |
| `#profile/taste`, `#profile/settings` | 해당 하위 화면 직접 진입 |
| `#profile/edit`, `preview`, `blocked`, `privacy` | 각각 독립 주소. 네 관리 하위 화면의 주 복귀 링크는 ‘← 설정’ → `#profile/settings`. 나머지 기록/취향/설정 화면은 ‘내 프로필 홈’으로 복귀 |
| 알 수 없는 프로필 하위 주소 | 홈으로 안전하게 표시 |
| `#music/post/...`, `#music/track/...`, `#music/profile/...`, 기존 story 링크 | 기존 SNS/공유 경로 유지. 자신의 SNS 프로필 링크는 기존처럼 홈으로 이동 |

App의 hash 해석은 첫 하위 조각만 읽던 방식에서 전체 하위 경로를 읽도록 조정했다. DOM 검사와 실제 Chromium에서 뒤로/앞으로 가기·새로고침·필터 직접 주소를 확인했다. 하위 화면 진입 시 제목에 키보드 초점을 옮기고 상단으로 이동한다.

## 요청 범위·성능·권한

| 진입/동작 | 요청 범위 |
| --- | --- |
| 비로그인 내 프로필 | 로그인 안내와 진입 버튼만. 기록·공유 목록 요청 없음 |
| 홈 | 기존 `social_me` + `social_profile`의 내 공개 메타데이터. `user_music_journal`은 소유자 조건·exact count·기존 정렬·range(0,2), 본문 최대 3건만. `list_my_music_shares`는 소유자용 id/source/visibility/날짜 메타데이터만 |
| 기록 하위 화면 | 소유자용 공유 메타데이터와 journal 10개. 공개 중은 공개 source ID의 IN, 나만 보기는 동일 ID의 NOT IN을 **서버 SELECT에 적용**하고 exact count를 받는다. 필터 변경 때 첫 페이지로 초기화하고 다음 10개도 같은 조건을 사용한다. |
| 공유본 수정 | 사용자가 선택한 공유본 1개만 기존 `social_feed(post=...)`로 조회하고 기존 edit RPC 사용. 전체 개인 피드·공유 본문 목록은 가져오지 않는다. |
| 취향 | App에서 이미 계산한 추천 프로필/보관 곡을 재사용. 추가 취향 데이터 쿼리나 추천 점수 변경 없음 |
| 설정·차단 | 설정은 프로필 메타데이터만. 실제 차단 목록은 차단 하위 화면에서만 조회 |

기존 publication quota와 소유자 목록 RPC 한도가 모두 100이므로 제한된 메타데이터만으로 전체 공유 상태를 얻는다. 이 상한을 바꾸는 후속 작업은 요약/필터의 완전성도 함께 검토해야 한다. 홈은 전체 개인 기록 본문·전체 공유 본문·차단 목록을 가져오지 않으며 전역 피드 Realtime 구독을 생성하지 않는다. owner 메타데이터 조회는 원래 원본 ID를 허용한 인증 전용 API이며 익명 응답 계약을 바꾸지 않는다.

계정과 sessionVersion으로 기존 App 경계를 재마운트하고, 요청 순서/활성 여부로 지연 응답을 무시한다. 기록 편집 초안도 사용자 키에 귀속된다. 기존 로그아웃 전 로컬 계정 사본 정리·Google chooser·실패 시 redirect 중단 로직을 수정하지 않았다. 목록/요약은 메모리에만 보관한다. 페이지 재진입/앱 focus/visibility 복귀·내 작업 완료 시 다시 조회한다. 편집 중 focus 갱신은 초안을 지우지 않도록 건너뛴다. 기존 SNS의 Realtime 채널/권한 처리 코드는 그대로다.

요약은 기존 두 API를 병렬 조회하므로 서로 다른 순간의 쓰기에 대한 원자적 집계는 아니다. 공유 수가 전체 수보다 많아지는 불일치는 숫자를 임의 보정하지 않고 재시도 안내로 처리한다. 페이지 도중 다른 기기에서 추가/삭제·범위를 바꾸면 기존 offset 정렬 특성상 재진입/새로고침이 필요할 수 있다. 새 DB 함수나 계약 변경은 하지 않았다. 메타데이터 조회 실패 시 분류를 추측하지 않고 필터를 막고 재시도를 제공하며, ‘전체’의 비공개 원본은 계속 읽을 수 있다.

## 검증 결과

2026-11-10 Asia/Seoul, 위 기능 SHA와 동일한 최종 코드·테스트 트리에서 실행했다. 개인 자료나 운영 요청 없이 격리된 합성 전송 계층을 사용했다.

| 검증 | 결과 | 환경/내용 |
| --- | --- | --- |
| `npm test` | **170/170 PASS**, fail/skip0 | 공연/KOPIS/cache, Program text, 보관함·추천, 원본·공유, Auth/API/Realtime 관련 기존 SQL·클라이언트·DOM 회귀 + 새 대시보드/쿼리 검증 포함 |
| `npm run test:social` | **5/5 PASS** | 기존 SNS SQL/클라이언트/DOM 검증 |
| `node scripts/testProfileIa.mjs` | **8/8 PASS** | 기존 분류, 실제 SDK 요청 구성, 라우트, 전체 기능 이동, 프로필 생성, 전환 실패, 상태 행렬, history/지연 응답 격리 |
| `node scripts/testProfileMobile.mjs` | **69/69 PASS** | 기존 로컬 Chromium 실행 파일 사용, 320/375/390px 각각 23개 상태, 외부 네트워크 차단 |
| `npm run build` | **PASS** | Vite production build. 기존 500 kB chunk 경고는 남아 있음 |
| 안전/정적 검사 | **PASS** | diff 공백·링크·JSON/인코딩·비밀값·범위 검사, 원래 IDE 파일 52개 및 HEAD/문서 보존, 보호 대상 계약 파일 변경0 |

프로필 DOM 검증은 0/1/3/23개 기록, 공개 프로필 없음/있음, private 공유본·public·followers 혼합 및 비공개만 있는 상태, 취향 없음/있음, 차단 있음/없음, API 오류/재시도/로딩을 포함한다. 최초 10개에 없는 11번째 공개 기록이 필터에서 즉시 나오는지, 23개를 10→20→23개로 읽는지, 원본/공유본의 독립 편집과 공유 취소의 원본 보존, 설정에서 전환·로그아웃·삭제 취소, 늦은 이전 계정 요청/초안·취향이 새 계정에 섞이지 않는지도 확인했다. 실제 사용자 계정 삭제는 수행하지 않았다.

모바일 검증은 긴 합성 닉네임/24자 아이디·기록 본문·공유 초안, 빈/설정 전/비로그인 홈, 채워진 취향 차트, 기록/공유본/프로필 편집 focus, 설정·차단·개인정보·삭제 확인을 포함한다. 독립적인 **문자별 Range 좌표**로 실제 줄 수를 세고 computed line-height를 비교했다. 한 줄 normal, 여러 줄 글자 크기의 1.5배, Pretendard, -0.03em, 최소12px 짝수 크기·가로 넘침 없음·프로필 터치44px/전역 메뉴48px 이상을 확인했다. textarea/input은 폰트·크기·자간·focus 배치를 검사했고 실기기 키보드 동작을 대신하지 않는다. 여러 줄 문구를 강제로 normal로 바꾼 잘못된 대조군 3개도 독립 측정으로 구분했다. 문서의 PASS는 data-text-lines 속성 존재만 보고 판단한 결과가 아니다.

### 화면 증거

모두 실제 자료가 없는 합성 화면이다. 홈은 검토하기 쉬운 **실제 viewport** 캡처이며 기록/설정은 해당 화면의 첫 viewport다. 긴 내용은 스크롤해 읽고, 문서 하단까지 스크롤했을 때 계정 삭제 버튼이 고정 메뉴 위에 드러나는 것을 별도로 측정했다.

| 너비 | 홈 | 내 기록 | 설정 |
| --- | --- | --- | --- |
| 320px | [홈](profile-dashboard-20261110/home-320.png) | [내 기록](profile-dashboard-20261110/records-320.png) | [설정](profile-dashboard-20261110/settings-320.png) |
| 375px | [홈](profile-dashboard-20261110/home-375.png) | [내 기록](profile-dashboard-20261110/records-375.png) | [설정](profile-dashboard-20261110/settings-375.png) |
| 390px | [홈](profile-dashboard-20261110/home-390.png) | [내 기록](profile-dashboard-20261110/records-390.png) | [설정](profile-dashboard-20261110/settings-390.png) |

## 미검증·적용 제한

- 실제 Google OAuth 로그인 완료·계정 선택/전환은 미검증이다. 호출 순서·prompt·실패·로컬 정리만 합성 Auth로 검증했다.
- 실제 클라우드 PostgREST/RLS와 Realtime 다중 접속·재연결은 이번 작업에서 호출하지 않았다. 기존 SQL/계약/클라이언트·DOM 검증과 실제 운영 검증을 구분한다.
- 실제 모바일 기기 IME·가상 키보드 높이·iOS Safari/PWA는 미검증이다. Chromium viewport/focus 검사는 실기기 인증이나 IME 검사가 아니다.
- 팔로워/팔로잉 개수는 비대화형 요약이다. 개별 관계 목록 제공은 이번 구현 범위에 추가하지 않았다.
- 동시 쓰기에 대한 원자적 통계와 offset 페이지 사이 변경 해결은 기존 API 범위의 한계로 남긴다.

**DB migration 불필요·추가0.** user_music_journal/music_record_publications schema·RLS·RPC·공유 링크 ID·삭제/cascade 정책·Realtime publication·OAuth provider/환경변수 변경0. 운영 DB 접속/자료 생성·공개·수정·삭제, main 병합, 운영 배포를 실행하지 않았다. 사용자 자료의 실제 API 검증이나 배포는 별도 승인 범위다. 기존 운영 완료 보고는 [이전 보고서](NAV_PROFILE_IA_PRODUCTION_2026-11-10.md), 이전 CURRENT_TASK/HANDOFF는 [명세2 보관](collaboration/archive/CA-NAV-PROFILE-IA-20261110-001/spec2/CURRENT_TASK.md)에서 확인한다.

## 검토 요청·되돌리기

홈의 정보 우선순위, 하위 화면 이동, private 공유본을 포함한 기존 배타적 분류, 공개 글 관리 기능 보존을 검토해달라. 변경은 UI·인증된 소유자 SELECT 조합뿐이다. 문제가 있으면 이 작업의 기능 커밋을 되돌려 이전 UI로 복구할 수 있고 DB 역 migration은 필요 없다. 기능 SHA 이후의 추가 커밋은 문서·검증 증거만 포함하며 최종 PR HEAD는 GitHub PR 메타데이터와 완료 응답에 기록한다.

## PR #26 명세1 검토 보완 — 2026-11-10 16:34:43 KST

검토 기준 HEAD는 5e32e6d04255ff1a32ccba7bb8762a2e6243598c, 최초 구현 SHA는 45f31bff938b820d1cda81b0a28af5d688b0211f, 이번 수정 SHA는 fda3efa7c750eaed9e9b3793b0fc18f887aceae0다. 관계 숫자 링크로 목록 진입을 오해할 수 있다는 검토를 반영해 숫자를 비대화형 span으로 바꿨다. 별도의 ‘다른 사용자에게 보이는 내 프로필 확인’ 링크는 유지했다. 관계 목록/API는 추가하지 않았다.

설정의 edit/preview/blocked/privacy 네 관리 화면은 상단 주 복귀를 ‘← 설정’/`#profile/settings`로 통일했다. 관리 화면을 홈에서 직접 열었어도 주 복귀 목적지는 설정이며, 실제 이전 방문 화면은 브라우저 뒤로/앞으로 가기로 그대로 돌아간다. 링크에 별도 history 차단 처리를 넣지 않았다. 전역 ‘내 프로필’ 메뉴로 홈에도 이동할 수 있다. 복귀 링크의 좌우 padding을 조정해 제목과 왼쪽 시작점을 맞췄고 44px 터치 영역을 유지했다.

기존 전체170/170·SNS5/5·프로필8/8·production build를 이 수정 코드에서 다시 실행해 PASS(fail/skip0). 기존 mobile69/69도 재실행했고, 네 화면×세 너비의 별도12건에서 링크 텍스트/href·44px 영역·제목과 왼쪽 정렬·수직 비중첩·설정 복귀·실제 브라우저 뒤로/앞으로를 확인했다. 관계 숫자에 링크/버튼/role=link/tabindex가 없고 명시적 미리보기 링크가 남아 있는지 DOM과 실제 Chromium 양쪽에서 검사했다. 기존 타이포그래피/넘침 검증을 유지했다. 안전 검사와 원래 IDE52개 보존 검사를 다시 통과했다.

| 관리 화면 | 320px | 375px | 390px |
| --- | --- | --- | --- |
| 프로필 수정 | [화면](profile-dashboard-20261110/back-edit-320.png) | [화면](profile-dashboard-20261110/back-edit-375.png) | [화면](profile-dashboard-20261110/back-edit-390.png) |
| 공개 프로필 미리보기 | [화면](profile-dashboard-20261110/back-preview-320.png) | [화면](profile-dashboard-20261110/back-preview-375.png) | [화면](profile-dashboard-20261110/back-preview-390.png) |
| 차단 관리 | [화면](profile-dashboard-20261110/back-blocked-320.png) | [화면](profile-dashboard-20261110/back-blocked-375.png) | [화면](profile-dashboard-20261110/back-blocked-390.png) |
| 개인정보 안내 | [화면](profile-dashboard-20261110/back-privacy-320.png) | [화면](profile-dashboard-20261110/back-privacy-375.png) | [화면](profile-dashboard-20261110/back-privacy-390.png) |

검증은 로컬 합성 환경이며 실제 OAuth/클라우드 PostgREST·Realtime/실기기 IME 미검증은 그대로다. DB migration/운영 DB/설정/실제 사용자 자료·main 병합·운영 배포 변경0. 같은 PR #26과 기존 작업 브랜치에 반영한다.
