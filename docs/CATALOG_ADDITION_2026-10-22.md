# 2026-10-22 메피스토 왈츠 No.4 S.216b 등록

기준: main `501c04767973f81fdba5d31bf52b04042fd00818`. 앞서 보류한 입력 94행을 별도 작품으로 등록하라는 사용자 확인에 따른 후속 작업입니다.

- 이번 요청 1곡, 신규 1곡, 중복 제외 0곡, 보류 0곡. 앞서 제공된 102곡의 등록을 모두 완료했습니다.
- 생성 ID: `liszt-mephisto-waltz-s216b-no4`. 카탈로그는 총 291 track / 252 work / 감정 점수 2,619개입니다.
- 기존 `liszt-mephisto-waltz-s216-no3`와 ID·catalogueNumber·곡 번호가 모두 다릅니다. 작곡가·제목/별칭·catalog·곡 번호·악장 기준 기존 중복이 없습니다.
- 작곡가 리스트, type=mephisto-waltz, catalogue=S, catalogueNumber=`216b`, number=4, opus/movementNumber=null. 기존 필드에 접미사를 포함한 번호 전체를 문자열로 보존했습니다. 기존 숫자 값은 변경하지 않았습니다.
- 점수는 입력 순서대로 3 / 3.5 / 3 / 2 / 1.5 / 2.5 / 3.5 / 4 / 2.5입니다. 요약·배경·감상 포인트도 원문과 동일합니다. Energy·조성·편곡·별칭을 추측해서 추가하지 않았습니다.
- YouTube `8e5IgoQc7S4`, 0:00–2:58, 출처 `Leslie Howard / Leslie Howard - Topic`. 외부 영상 요청이나 실제 청취는 수행하지 않았습니다.

## 식별값과 매칭

기존 `catalogueNumber`는 JSON identity에 문자열도 보존할 수 있습니다. 신규 필드나 SQL 변경 없이 `216b`를 저장하고 두 matcher에서 숫자 216과 접미사 b를 모두 비교합니다. S.216 / S.216b / S.216c, 곡 번호, 편곡을 혼동하지 않는 회귀 검증을 추가했습니다. 영문·한글 및 S./S, No./Nr. 표기를 확인했습니다.

| 항목 | 값 |
|---|---|
| 이전 catalog_hash | 5809fffe954f1720640817622ef03a4f3385fa289d83ed2d041f2ca2b09e0e50 |
| 새 catalog_hash | 61269baa91498e00440c8c5b194d654a5117d8ff4d7390ab99472fab6163b8d6 |
| 쇼팽 Op.52 No.4, 전후 동일 | 026e153a8a968462987a5cbce385390ef1be4c763917ca0df8c676a37655e9f7 |
| 리스트 S.541 No.3, 전후 동일 | 62315d1698920755c0fbb7c27e4b86b23f62b478cb152bd27ca19dd2c3a8dbfe |

기존 290곡의 평가·설명과 251개 work identity hash를 모두 보존했습니다. 새 곡만 제거하면 이전 전체 hash를 정확히 재구성합니다. 새 곡의 접미사를 바꾸면 그 작품 hash만 바뀝니다. 격리된 PGlite에서 현재 SQL 함수와 JS의 전체 작품 hash가 일치하는지 확인하며, 실제 Supabase에는 SQL을 실행하지 않습니다. 검색 버전은 stored-program-3을 유지합니다.

## 저장 자료 읽기 전용 검증

Supabase REST GET만 허용하는 guard를 적용했습니다. 저장 후보 251건 중 100건을 메모리 재매칭하고, 151건은 근거 변경 48 / 종료 공연 99 / 수동 검토 보호 4로 제외했습니다. 실패는 없습니다. 현재 유효 저장 OCR 18건도 원문으로 메모리 재분석했습니다. 신규 S.216b 연결 가능 후보는 0건이므로 보고할 공연·candidate·OCR 식별자나 EXACT/신뢰도/중복/REVIEW_REQUIRED 목록은 없습니다.

실제 DB를 조회하는 로컬 HTTP API에서 서울 / 2026-10-21~27 / backend=supabase / analysisVersion=stored-program-3 조건으로 쇼팽·리스트 각각 PF295548 1건을 확인했습니다. 빈 결과·DB 오류에서 외부 fallback이 없고 OCR 경로는 405입니다.

실제 DB 쓰기, 분석·후보 저장, confirm/reject, OCR 실행, KOPIS·이미지 요청은 모두 0건입니다. 예약 배치·환경변수·키·기존 확정·migration은 변경하지 않았습니다.

## 검증과 배포

전체 자동 테스트 354개, 프로덕션 빌드, git diff --check를 통과했습니다. tracked 파일·변경 파일·브라우저 번들 실제 비밀값 검출은 0건입니다. 별도 commit과 일반 push 1회를 수행합니다. 전체 테스트에는 입력 점수·영상 대조, ID 유일성, JS/SQL identity, 기존 확정 검색 유지, matcher, 작곡가 필터·감정 추천·전체 상세 화면 렌더링이 포함됩니다. 빌드의 기존 500 kB chunk 경고는 남습니다.

자동 Production 배포의 READY·main SHA·sound-atlas.vercel.app alias, 실제 상태 API·두 PF295548 검색·배포 번들 일치와 비밀값, 새 곡 검색·보관함·상세·추천 화면 DOM을 확인합니다. DOM 확인은 배포 JS를 JSDOM에서 실행하는 방식이며 실브라우저 시각 검사는 아닙니다. 최종 테스트 수·commit SHA·Production 결과는 최종 응답에 기록합니다.

## 다음 배치 예상

전체 hash 변경으로 2026-10-23 배치에서 유효 저장 OCR이 재분석 대상이 될 수 있습니다. 현재 후보 자료에서 내일 이후 유효 OCR은 16건이며, 실제 처리 수는 최신성·우선순위·시간 예산에 따릅니다. 새 연결 예상은 현재 읽기 전용 검사에서 0건입니다. 기존 수동 확정은 작품별 hash가 같으므로 이 추가로 stale 처리되지 않습니다.

## 수정 파일

- src/data/manualRatings.js, src/data/manualTrackDetails.js, src/data/emotions.js
- server/programCatalogueNumber.mjs, server/programMatching.mjs, server/programMatchingNormalization.mjs
- src/data/catalogAdditions20261021.test.js, src/data/recommendation.test.js
- data/manual/catalog-additions-2026-10-21.json, data/manual/manual-emotions-v1.csv, data/manual/rating-guide.md
- README.md, docs/CATALOG_ADDITION_2026-10-21.md, 이 보고서
