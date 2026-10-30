# 현재 작업

- 작업 ID: CA-CONCERT-RELIABILITY-20261029-001
- 명세 버전: 2 / 사용자 Gate A 이후 재개 지시
- 상태: BLOCKED / Gate B / SERVER_CACHE_STORAGE_REQUIRED
- 브랜치: codex/ca-concert-reliability-20261029-001
- 읽은 공동 문서 5개: 3e7222c25143356dae9f32c421ebab6b36c1b2fc
- main·production 코드 기준: 7cc7f7b88274db228748cd5aa7fa8775fd5db64a
- 확인 시각: 2026-10-29 14:58~15:00 KST / Asia/Seoul

## 현재 유효한 명세

사용자 최신 지시로 과거 11:04 HTTP502 원인 추적은 종료한다. 로그 보존기간 만료와 원인 미확정은 더 이상 중단 조건이 아니다. Gate A를 반복하지 않고 마지막 정상 데이터 fallback만 진행한다.

전체 페이지가 검증된 성공 목록만 저장한다. 정상 캐시는6시간, KOPIS 또는 서버 함수 실패 시 마지막 성공24시간 이내만 stale fallback으로 반환한다.24시간 초과는 기존 오류 화면이다. stale/fetchedAt/source를 제공하고 화면에는 “KOPIS 연결이 지연되어 마지막으로 확인된 정보를 표시합니다”와 갱신 시각을 표시한다. HTTP상태·실패단계·upstream유형·처리시간·요청ID는 비밀값 없이 계측한다.

무제한 재시도·OCR·곡매칭·DB이력 변경·예약 재활성화를 금지한다. 기존 OCR/Program/receipt 테이블은 캐시에 재사용하지 않는다. 감정추천·보관함·취향·주간UI는 유지한다. 정상/timeout/HTTP5xx/XML오류/부분페이지/cold start/24시간 초과와 모바일 목록·상세를 검증하고, 직접 테스트 후 전체 test/build가 통과하면 배포·production 정상 조회·격리 fallback을 검증한다.

**범위 확대 또는 새 migration이 필요하면 적용하지 않고 BLOCKED로 보고한다.** 이전 명세의 additive migration 허용은 최신 지시로 대체됐다.

## Gate B 확인 결과와 재개점

서버와 브라우저 공연 캐시는 Map뿐이다. 서버 영구 캐시 adapter가 없으며 브라우저는20건 응답만 보유한다. 운영 DB 카탈로그 SELECT2회에서 public 기본 테이블13개가 모두 기존 공연/Program/OCR 이력용임을 확인했다. 이름에 cache/kopis가 있는 관계는 기존 unique index 하나뿐이며 캐시 테이블은 없다. Vercel GET3회로 production 환경변수 이름만 확인했으며 별도 KV/Redis/Blob/S3 등 저장소 설정0개다. 연결정보·환경변수 값은 출력/기록하지 않았다.

따라서 새 instance가 기존 완전한 성공 목록을 읽을 서버 영구 저장소가 현재 없다. 이를 충족하려면 독립 캐시 테이블을 위한 새 migration 또는 별도 저장소 도입이 필요하다. 기존 DB 이력 재사용이나 브라우저 일부 페이지 캐시를 서버 전체목록/cold start fallback으로 취급하지 않는다.

**BLOCKED / SERVER_CACHE_STORAGE_REQUIRED**: 독립 서버 캐시 저장소를 사용할 수 있는 지점에서 재개한다. 새 migration 작성/적용0, 기능 코드 변경0, 업무POST0, main 병합/배포0이다. 과거502 재조사0, KOPIS 호출0이다. 새 기능 테스트/build·모바일·fallback 검증은 미실행이며 이전 baseline 통과를 이번 보완의 검증으로 보고하지 않는다.

ClassicAtlas-LocalPipeline은 읽기 전용 확인 결과 Disabled/Enabled=false이다. 원본 local main/1607ca201c3a559bc7f28aabe998ef062db02ef9의40개 변경 파일/index/.env hash 보존을 확인했다. [근거](docs/CONCERT_RELIABILITY_STORAGE_2026-10-29.json), [인계](HANDOFF.md).

## 이전 명세1 기록 — 아래 중단 조건은 현재 적용하지 않음

# 현재 작업

- 작업 ID: CA-CONCERT-RELIABILITY-20261029-001
- 명세 버전: 1
- 상태: BLOCKED
- 요청자: Theo / 실행: Codex / 후속 검토: 웹 GPT
- 작성일: 2026-10-29 Asia/Seoul
- 브랜치: codex/ca-concert-reliability-20261029-001
- 기준 main·production SHA: 7cc7f7b88274db228748cd5aa7fa8775fd5db64a
- 명세: 사용자 직접 지시. 기존 로컬40파일·index·.env 보존, 별도clone에서 수행.

## 목표와 Gate

운영 중인 KOPIS 공연 브라우저를 다시 만들지 않고 간헐적 조회 실패의 원인과 안정성만 다룬다. Gate A는 status·서울/오늘~30일/CCCA 목록·상세1건·Vercel cold start/함수 로그·upstream HTTP/시간/XML·실패 페이지를 확인한다. 오류 로그는 KOPIS_CONNECT_FAILED / KOPIS_TIMEOUT / KOPIS_HTTP_ERROR / KOPIS_XML_INVALID / KOPIS_PAGE_INCOMPLETE만 사용하며 키·전체 query·원문·예매 URL은 기록하지 않는다.

Gate B는 필요 시 기존 OCR/Program/receipt와 분리된 서버 영구 캐시를 additive migration의 별도 테이블에 둔다. 전체 pagination 검증 성공만 저장, 일부 성공 덮어쓰기 금지, fresh6시간·실패 시 마지막 성공24시간 이내 stale fallback,24시간 초과는 오류다. 응답 fetchedAt/stale/source, stale 문구와 업데이트 시각, 목록20건/추가20건/중복0·상세/이미지/예매 링크를 유지한다. 무제한 retry나 새 예약을 만들지 않으며 upstream 복구 시 정상 갱신한다.

OCR·Program·매칭·CONFIRMED/REJECTED 복구0, 기존 DB/migration/receipt 수정/삭제0, ClassicAtlas-LocalPipeline Disabled 유지, 추천/보관/취향/주간소개 UI 변경0이다. 키는 서버에만 둔다. 디자인 변경은 상태 안내 최소 범위다.

직접 테스트 후 전체 npm test/build 각1회, fresh/timeout/HTTP/XML/부분페이지/24h 만료/cold start/20건/상세/stale 안내/업무POST/375px/비밀값을 검증한다. 모두 통과하면 main 병합·배포·production fresh 목록/상세를 확인하고 OPERATIONAL이다. **원인 불명 또는 안전한 fallback 미구현 시 기존 production을 변경하지 않고 BLOCKED**라는 중단 조건을 따른다. production 장애 주입은 하지 않는다.

## Gate A 결과와 중단점

- 사용자 제공11:04:53/11:04:58 KST 관측에 맞춰10:55~11:15 Vercel 요청 로그를 조회했다. **11:04:53.479와11:04:58.388의 목록 GET이 실제 HTTP502**였다. 앱 내부 요청 실패임을 확인했으며 확장 프로그램 콘솔 메시지는 근거에서 제외했다.
- 당시 함수 로그 조회는 retention 제한으로 거절됐다. 현재30분 runtime 조회는 성공했으나 로그0건/start type 정보 없음이다. cold start 여부, upstream HTTP/timeout/connect/XML 유형, 실패한 pagination state/page는 **미확정**이다. CDN MISS를 앱 메모리 cache miss로 해석하지 않는다.
- 이번 production GET4는 모두200. 목록 cache334ms·refresh4028ms/303건, 상세227ms·예매4/소개1장. 직접 KOPIS 목록3회(각4페이지)와 동일 PF281769 상세1회=**13GET**, 모두200/XML 정상208~414ms다. 실패를 재현하지 못했다. production 내부 upstream 호출 수는 기존 계측이 없어 추정 집계하지 않는다.
- 직접 격리 진단5/5 PASS: instance별 Map 비공유,6시간 후 stale 부재, HTTP/timeout/connect 오류 합침, 부분 페이지 실패 시 정상 메모리 snapshot 불변을 확인했다. 이는 기존 동작 진단이며 보완 완료가 아니다.
- 변경하지 않은 main 기준 **전체 npm test93/93 fail0/skip0(24.169초), production build PASS**, 각각1회. 영구 캐시/fallback·stale UI·cold start 내구성 검증은 미실행이다.
- **Gate A / ROOT_CAUSE_UNDETERMINED로 BLOCKED**. Gate B 구현·migration·캐시 업무POST·main 병합·배포0. 기존 production SHA와 Disabled 예약 유지, 기존 DB/migration/음악UI 무변경, 원본40파일/index/.env hash 보존. [상세 증거](docs/CONCERT_RELIABILITY_DIAGNOSIS_2026-10-29.json).

## 재개점

새 실패의 보존기간 내 함수/요청 증거와 upstream 단계·state/page·시간·HTTP 결과를 함께 확보해 Gate A를 재개한다. 기존 코드의 예외 통합으로 사라진 과거 세부 원인을 추정 복원하지 않는다. 필요한 최소 진단 계측과 검증 방안은 HANDOFF의 구현자 의견에만 기록했다. Gate B를 완료했다고 표시하거나 운영을 바꾸지 않고 중단한다.

이전 main의 CURRENT_TASK/HANDOFF는 docs/collaboration/archive/CA-CONCERT-BROWSER-20261029-001에 함께 보관했다. 전 작업 최종 OPERATIONAL 인계는 별도 브랜치 결과60c5cecb4b9aed05edf78c8a5195a17b94009231이며, 이번 코드 기준은 지정 main 7cc7f7b88274db228748cd5aa7fa8775fd5db64a다.
