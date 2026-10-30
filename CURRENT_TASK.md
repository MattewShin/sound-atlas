# 현재 작업

- 작업 ID: CA-CONCERT-RELIABILITY-20261029-001
- 명세 버전: 3 / 2026-10-30 사용자 Gate B 재개 지시
- 상태: OPERATIONAL / main 병합·production 정상 조회 완료
- 브랜치: codex/ca-concert-reliability-20261029-001
- 읽은 공동 문서5개·코드 SHA: bd76fb23766c10a8be903a8a579036f2ef8ea424
- 시작 main·production 기준: 7cc7f7b88274db228748cd5aa7fa8775fd5db64a
- 실제 production·main SHA: 18bb76573609e8c60229f847d437e74eff20ba9e
- 구현 코드 SHA: 05a62ab04f098f110d21cf06753a1c1c2359e9bd
- PR: https://github.com/MattewShin/sound-atlas/pull/4 (merged)

## 유효 범위

과거502 원인 조사/Gate A와 저장소 선택 검토는 반복하지 않는다. 기존 Supabase에 독립 공연 브라우저 cache table 하나만 추가하는 최소 additive migration을 허용한다. Redis/KV/Blob 등 신규 서비스는 만들지 않는다. 이전 명세2의 새 migration 금지와 저장소 blocker는 이번 사용자 지시로 대체됐다.

목록/상세 구분, 고유 key, 공개 payload, fetched_at/updated_at을 저장한다. 서버 service_role에 SELECT·INSERT·UPDATE만 허용하고 anon/authenticated/PUBLIC은 접근하지 못한다. 키·전체 upstream query·인증정보·XML/로그 원문은 저장하지 않는다. 목록은01/02의 모든 pagination/XML 검증 성공 후 단일 원자 upsert로 저장한다. 일부 성공으로 마지막 정상 결과를 덮어쓰지 않는다.

age<6h는 fresh, age>=6h는 먼저 KOPIS 갱신, 실패 시0<=age<=24h만 stale다.24h 초과·미래 timestamp는 반환하지 않는다. 원래 fetchedAt,stale,source를 응답하며 stale를 새 성공 시각으로 바꾸지 않는다. stale일 때만 “KOPIS 연결이 지연되어 마지막으로 확인된 정보를 표시합니다”와 실제 갱신 시각(KST)을 안내한다. cold start는 Supabase 캐시를 읽는다. 안전한 HTTP상태·실패단계·페이지·upstream유형·시간·requestID만 로그에 남긴다.

기존 OCR/Program/receipt/곡매칭 데이터·migration과 추천·보관함·취향 UI는 유지한다. OCR·자동판정 복구/새 예약/무제한 retry0, ClassicAtlas-LocalPipeline Disabled 유지. 배포 rollback에도 additive table은 삭제하지 않고 비사용 상태로 남긴다.

## 검증·적용 결과

- 최종 직접 관련26/26 PASS, 전체 npm test109/109 PASS·fail0/skip0(25.316초), production build PASS(5.17초).
- 격리 SQL: 새 table 한 개, 기본 권한이 넓은 환경에서도 revoke/최소 grant·RLS·anon/authenticated 차단·upsert·제약·기존 history 보존을 확인했다.
- fresh/timeout/HTTP503/잘못된XML/network/부분페이지/cold start/정확한6h·24h/24h+1ms/미래시각/대기 중24h 만료/복구와 목록·상세 분리를 검증했다.
- 375px 목록20→40/상세/지역선택 overflow0·잘린버튼0, stale 원래시각·포스터/소개/예매·보관/취향 통과.
- migration **202610300001_concert_browser_cache.sql 적용1회 완료**, RLS·ACL 검증, 기존13개 테이블866행 hash 보존. Supabase migration ledger는 원래 없었고 별도 ledger table을 만들지 않았다.
- 실제 정상 GET: 서울2026-10-30~11-29·CCCA305건,20→40/중복0, PF281769 포스터·소개1·예매4. KOPIS GET5, cache REST GET4/POST2(전용 cache만), 기존 업무POST/쓰기0. 새instance의 목록/상세는 Supabase에서 fresh 재사용, 추가KOPIS GET0.
- production 장애주입0. PR4 main 병합·production 배포 완료, 실제SHA 18bb76573609e8c60229f847d437e74eff20ba9e를 확인했다. 상세 실행 횟수와 초도 격리 실패 보정은 HANDOFF에 구분했다.

이전 명세2 CURRENT_TASK/HANDOFF는 [보관본](docs/collaboration/archive/CA-CONCERT-RELIABILITY-20261029-001/spec2/CURRENT_TASK.md)에 함께 보존했다.

## 최종 production 확인 — 2026-10-30 09:29~09:31 KST

Vercel Production deployment7427562404 success, 실제 alias의 자산 SHA256이 최종 검증 build와 일치한다. production API4GET(status/목록/추가/상세)+HTML/JS2GET=6GET·POST0이다. 서울305건20→40/중복0, 목록·PF281769 상세 모두 stale=false/source=supabase-cache, 원래 fetchedAt 유지다. 포스터·소개1·예매4를 확인했다. 별도 실제 Chrome375px는 API3GET/POST0, 목록20→40·상세·예매링크·overflow0/잘린버튼0/pageError0/OCR·Program요청0이다. 격리 fallback26/26 및 실제 정상 조회를 혼동하지 않았다. 최종DB13개table hash 보존·RLS/ACL 통과·예약Disabled 유지·원본40파일/index/.env 보존이다.
