# Supabase 확정 공연 검색 미리보기

기본 검색은 기존 KOPIS/Tesseract입니다. 서버 전용 `CONCERT_SEARCH_BACKEND=supabase`를 지정한 경우에만 DB 검색을 사용합니다. 현재 루트 `.env`는 변경하지 않았고 공개 배포·후보 확정도 실행하지 않았습니다.

## 로컬 실행과 화면 경로

먼저 루트 `.env`의 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 확인하세요. 기존 SQL 마이그레이션 3개가 적용되어 있다면 **새 마이그레이션은 필요 없습니다.** 기존 dev 서버는 Ctrl+C로 종료합니다.

Windows Git Bash:

```bash
cd /c/Users/CNXK/dev/sound-atlas
CONCERT_SEARCH_BACKEND=supabase npm run dev
```

터미널에 표시된 주소를 열고 브라우저도 새로고침합니다. `공연 찾기` → 곡 검색 `Schubert Impromptu Op.90 No.2` → **슈베르트 즉흥곡 D.899 Op.90 No.2** 선택 → 서울 / 2026-10-15~2026-11-14 → `공연 찾기` 순서입니다. 검색 조건에 `확인된 공연 미리보기` 안내가 표시됩니다.

기본 검색으로 돌아가려면 서버를 종료하고 `npm run dev`로 재시작한 뒤 브라우저를 새로고침하세요. 루트 `.env`에 영구 설정한다면 `CONCERT_SEARCH_BACKEND=kopis` 또는 `supabase`를 사용합니다. 미지정은 `kopis`, 빈 문자열을 포함한 그 외 값은 설정 오류입니다. 이 변수와 서버 키에 `VITE_` 접두사를 붙이지 마세요.

프로덕션 로컬 실행은 `npm run build` 후 `CONCERT_SEARCH_BACKEND=supabase npm start`입니다. Vercel의 기존 `api/index.js`에도 같은 선택을 연결했습니다. 향후 배포 시 서버 환경변수에 같은 설정과 Supabase 연결 정보를 넣어야 합니다. 이번에는 배포·원격 설정 변경을 하지 않았습니다.

## 검증 후보를 직접 확인·확정하는 순서

2026-10-15 16:27 KST 실제 DB 재조회 결과, 후보 `fcfa75b3-f064-4a60-8d7b-fd8326c6497a`는 `MATCHED / EXACT / REVIEW_REQUIRED`입니다. `stale_reason=null`, 현재 분석·카탈로그·`stored-program-2` 호환, 검토 이력 0건을 확인했습니다.

- 공연: `PF302595`, 다니엘 델 피노 피아노 리사이틀 [서울], 2026-10-17, 클래시카 서울.
- 곡: `schubert-impromptu-d899-op90-no2`.
- 현재 분석: `1a44ffcf-a4fe-4293-9718-5f1e371ddbcd`.
- [원본 PROGRAM 이미지](https://www.kopis.or.kr/upload/pfmIntroImage/PF_PF302595_202610060408245420.jpg): `F. Schubert / Two Impromptus, Op.90 / No.2 in E flat major`. D.899는 원본 표기가 아닌 카탈로그 정보입니다.

아래 show로 다시 조회하고 원본·공연 적용 범위를 **직접 확인한 경우에만** confirm을 실행하세요. 근거가 오래됐거나 analysis_id가 바뀌었다면 그대로 확정하지 마세요. 메모는 실제 확인 내용으로 입력합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas

# 1. 상세·근거 유효성·현재 분석 확인
npm run program:analyze -- show fcfa75b3-f064-4a60-8d7b-fd8326c6497a

# 2. 직접 검토한 뒤 단건 확정
npm run program:analyze -- confirm fcfa75b3-f064-4a60-8d7b-fd8326c6497a \
  --analysis-id 1a44ffcf-a4fe-4293-9718-5f1e371ddbcd \
  --note '원본 PROGRAM과 공연일·공연장을 직접 확인함. F. Schubert / Op.90 / No.2 / E flat major 일치. No.2는 곡 번호이고 D.899는 카탈로그 정보임. 편곡·발췌 표기 없음.'

# 3. 확정 결과 재조회
npm run program:analyze -- show fcfa75b3-f064-4a60-8d7b-fd8326c6497a
```

확정 후 `review_status=CONFIRMED`, `effective_status=CONFIRMED`, `is_effectively_confirmed=true`, `stale_reason=null`, `local_version_current=true`를 확인하세요. `list`는 검토 필요 후보 전용이므로 확정 후보가 목록에서 빠지는 것이 정상입니다.

확정 전 웹 검색은 HTTP 200과 빈 배열이며 “선택한 조건에서 확인된 공연이 아직 없어요.”를 표시합니다. 확정 후 같은 조건으로 검색 버튼을 다시 누르면 카드가 표시되어야 합니다. 원격 확정 후의 실제 표시는 사용자가 직접 확인해야 합니다. 이번에는 실제 후보를 확정하거나 테스트용 확정 데이터를 원격 DB에 만들지 않았습니다.

DB에는 시작·종료 날짜만 저장하므로 19:00을 응답에 만들어 넣지 않습니다. 2026-10-17이 지나면 이 공연은 확정되어도 종료일 조건으로 제외됩니다. 기간형 공연에는 기간과 정확한 회차 확인 안내를 표시합니다.

## API와 공개 범위

기존 경로 `GET /api/concerts/status`, `GET /api/concerts?targetTrackId=<등록 ID>&region=<지역>&from=YYYY-MM-DD&to=YYYY-MM-DD`를 재사용합니다.

응답은 `{ backend, query, targetTrackId, concerts, fetchedAt, fromCache, cacheTtlMs }`입니다. DB 모드의 backend는 `supabase`, cacheTtlMs는 0이며 매 검색마다 유효성을 다시 읽습니다. 각 공연은 다음 필드만 명시적으로 만듭니다.

- `id`, `kopisId`, `title`, `venue`, `region`, `dateFrom`, `dateTo`, `performanceStatus`.
- `sourceUrl`, `sourceLabel`, `fetchedAt`, `searchBackend`, `programStatus`, `programVerification`, `programWorkIds`, `programTrackIds`.
- `targetMatch`: `targetTrackId`, `workId`, `status`, `evidenceKind`, `relation`, `reviewStatus`, `completed`, `reason`, `evidenceSourceUrl`.

공연 fetchedAt은 마지막 수집 성공 시각, 최상위 fetchedAt은 이번 검색 시각입니다. OCR 원문·인용문·bbox·검토 메모·후보 UUID·전체 후보 행은 응답하지 않습니다. 원본 이미지와 KOPIS 상세 링크를 제공합니다. 같은 공연의 근거는 카드 하나로 합치며, 악장 연결은 선택 악장만 표시합니다.

서버는 기존 비공개 `concert_program_candidate_status` 뷰와 concerts 조인에서 필요한 열만 GET으로 읽습니다. 실제 곡/작품 ID, `CONFIRMED`, `EXACT`, `MATCHED`, 현재 유효한 확정/분석, stale 없음, 현재 matcher/catalog hash, 지역·기간 겹침·한국 날짜 기준 미종료·예정/진행 상태를 필터합니다. 활성 DETAIL 이미지·OCR 시도·이미지/공연 revision은 기존 뷰의 유효성 함수를 재사용합니다. SQL 필터와 서버 검사를 함께 적용합니다.

새 테이블·뷰·RPC·권한·공개 정책은 없습니다. 브라우저는 Supabase에 직접 연결하지 않으며 키는 서버의 기존 supabaseRest에서만 사용합니다. 잘못된 인자는 HTTP 400, 서버 설정/DB 오류는 안전한 메시지의 HTTP 503입니다. 빈 결과나 오류에서 KOPIS 검색으로 우회하지 않습니다. DB 모드에서 match-batch·상세 프로그램 경로는 HTTP 405로 차단합니다.

검색은 KOPIS·이미지 다운로드·OCR·프로그램 재분석·DB 쓰기를 실행하지 않습니다. 유효성은 **DB에 마지막으로 기록된 수집 상태와 OCR 시도**의 범위입니다. 같은 URL의 원격 바이트가 바뀌었지만 새 수집/OCR 기록이 없으면 감지하지 못합니다. 원본 링크는 사용자가 별도로 열 수 있습니다.

## 검증과 변경 파일

- 전체 `npm test` 179개 통과, `npm run build` 성공.
- 새 테스트는 상태·버전·곡/작품·관계·지역/날짜/공연 상태 필터, 페이지 처리·중복 제거, 공개 필드 제한, 오류/빈 결과, 기본 경로·잘못된 설정·Vercel rewrite를 검증합니다. 기존 SQL 테스트에서 실제 stale/이미지 활성·수동 이력 로직도 통과했습니다.
- React DOM에서 빈 결과·카드·상세·기간 안내·선택 악장만 표시·오류 표시와 GET 검색 외 호출 0회를 검증했습니다. 기존 검색 테스트도 유지했습니다.
- 빌드 산출물 3개에서 서버 키 변수명·설정된 실제 비밀값·서버 저장 진입점 미포함을 확인했습니다.
- 실제 Supabase 검색 API는 HTTP 200, 공연 0건입니다. 후보가 REVIEW_REQUIRED이므로 정상입니다. 검색 동안 유효성 뷰 GET 1회, KOPIS/이미지/OCR/재분석/쓰기 0회를 확인했습니다. 후보 상태와 검토 이력은 그대로입니다.
- 같은 설정으로 실제 로컬 Vite와 Node 프로덕션 서버도 각각 실행하여 HTTP 200·DB 검색·0건을 확인하고 종료했습니다. Vite의 HTML도 정상 응답했습니다. 두 검사 역시 원격 DB 쓰기 0건입니다.
- 실제 후보의 원격 확정 후 표시·공개 배포·실브라우저 시각 검사는 수행하지 않았습니다. 확정 결과 반환·표시는 로컬 합성 데이터로 검증했습니다.

새 구현은 `server/supabaseConcertSearch.mjs`, 서버 선택은 `server/concertSearchService.mjs`입니다. Vite·Node·Vercel 진입점, 기존 브라우저 검색 클라이언트/hook·결과/상세 화면을 연결했습니다. 테스트는 `server/supabaseConcertSearch.test.mjs`, `scripts/dbConcertDomTest.mjs`, 기존 검색 테스트에 추가했습니다. `.env.example`, README, 코드 구조 문서와 이 안내서를 갱신했습니다. 카탈로그·매칭 규칙·OCR 설정·Python 환경은 변경하지 않았습니다.
