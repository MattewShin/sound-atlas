# 2026-10-21 카탈로그 추가 검증

기준 commit: `391f053c1ad6e8a671710be74c9ba5bc345703b1` (main, 당시 origin/main과 동일).

요청 102곡 / 추가 101곡 / 기존 중복 제외 0곡 / 보류 1곡. 추가 후 290곡, 감정 점수 2,610개입니다. 기존 189개 track과 150개 work의 식별·평가·설명은 변경하지 않았습니다.

## 스키마 매핑과 중복 검사

- 기존 `manualRatings.js`, `manualTrackDetails.js`, `musicData.js`, `workCatalog.js`, matcher 정규화와 `work-identity-1`을 조사했습니다.
- 기존 필드만 사용했습니다: id, composer, type, opus, number, catalogue, catalogueNumber, movementNumber, movement, title, titleEn, alias, aliasEn, aliasesEn, emotionScores, ratingSource/Version/Unit, summary 및 상세 about/listeningTip/shortPreview.
- Op.와 S.를 구분하고 No.는 작품집 내부 곡 번호로 기록했습니다. S.178의 입력은 영문 I·한글 ‘단일악장’이므로 number=null, movementNumber=1, movement='단일악장'으로 기록했습니다. 악장 ID는 liszt-sonata-s178-m1, work ID는 liszt-sonata-s178입니다.
- 제공된 곡별 한글 말미 별칭과 명시된 영문 괄호 제목만 별칭에 사용했습니다. 순례의 해의 지역 표기는 정식 제목에 유지했습니다. 조성은 입력 제목·본문 그대로 보존하고 기존 본문 기반 musicalKeys 파생 규칙을 유지했습니다.
- Energy·별도 편곡/발췌·제공하지 않은 식별정보와 점수는 만들지 않았습니다. ‘경이로움’은 기존 wonder 차원에 대응합니다. 점수 909개와 본문·영상 URL·구간·출처는 입력과 대조했습니다.
- ID, 작곡가와 정규화 제목/별칭, Op./S.와 하위 번호·악장·book 번호를 대조했습니다. 조성은 입력에 있는 경우만 검사 자료로 사용했습니다. 기존 중복은 없고 새 ID 중복은 검증에서 차단합니다. 같은 별칭이어도 다른 S./No.이면 독립 작품으로 유지합니다.
- 보류: 입력 94행 **Liszt Mephisto Waltz No.4 S.216b**. 현행 catalogueNumber는 숫자이고 별도 catalog 접미사 필드가 없습니다. opusSuffix로 대체하거나 S.216으로 합치지 않았습니다. 접미사 필드 확장 여부를 별도로 결정해야 합니다. 스키마를 확장하지 않았습니다.
- 신규 장르 인식만 추가했습니다. 모음곡 이름만으로 첫 곡을 추정하지 않으며 작곡가·catalog·No.를 요구합니다. Allegro는 Op.8이 명시된 작품에만 적용해 일반 악장 템포와 구별합니다. 지원하지 않는 S.216b 접미사는 구 matcher에서도 확정하지 않습니다.

## Hash와 기존 확정 보호

| 항목 | 값 |
|---|---|
| 전체 catalog hash 이전 | a239a933e23c967ab8d58ba482b045be17a2f9b26227638d3d17506b59e7f0a8 |
| 전체 catalog hash 이후 | 5809fffe954f1720640817622ef03a4f3385fa289d83ed2d041f2ca2b09e0e50 |
| Chopin Op.52 No.4 work identity, 전후 동일 | 026e153a8a968462987a5cbce385390ef1be4c763917ca0df8c676a37655e9f7 |
| Liszt S.541 No.3 work identity, 전후 동일 | 62315d1698920755c0fbb7c27e4b86b23f62b478cb152bd27ca19dd2c3a8dbfe |

기존 150개 work hash가 모두 동일합니다. 새 항목과 새 type 패턴만 제거하면 기준 commit의 전체 catalog hash까지 정확히 재구성되는 회귀 테스트를 추가했습니다. 새 작품의 identity 변경은 그 작품에만 영향을 줍니다. 검색/분석 버전은 stored-program-3 그대로입니다.

## 읽기 전용 실제 DB·OCR 검증

Supabase origin의 REST GET만 허용한 네트워크 guard를 사용했습니다. 원격 DB 쓰기·분석/후보 저장·confirm/reject·OCR 실행·KOPIS 및 이미지 요청은 0건입니다. Windows 예약, 환경변수, migration, 기존 확정은 수정하지 않았고 daily/initial/analysis-only를 실행하지 않았습니다.

- 저장 후보 251건 중 164건 메모리 재매칭, 87건 제외, 실패 0건. 제외 사유: 근거 변경 83건, 수동 검토 보호 4건.
- 저장 OCR 27건의 원문·메타데이터를 GET으로 읽어 27건을 순수 메모리 재분석했습니다. OCR 엔진이나 원격 원본 이미지는 호출하지 않았습니다.
- 새 101곡과 연결되는 신규 EXACT 후보: **0건**. 따라서 보고할 새 공연/candidate/OCR/work 연결 목록이나 새 REVIEW_REQUIRED 예상 후보는 없습니다. 불확실한 로마자/악장 표기를 작품집 내부 번호로 바꾸지 않았습니다.
- 실제 DB를 사용하는 로컬 HTTP API와 기존 Production에서 서울 / 2026-10-21~2026-10-27 / supabase / stored-program-3 검색을 확인했습니다. 쇼팽·리스트 각각 PF295548 1건 유지. 부산 빈 결과, 오류의 Supabase 전용 처리와 OCR 경로 405도 검증했습니다.

## 테스트·빌드·비밀값

전체 자동 테스트 **352개 통과**. 새 데이터 101곡·909개 점수, ID 유일성, hash 보존·신규 작품만 영향, CONFIRMED+EXACT 검색 유지, matcher의 부모/곡 구분, 추천·작곡가 필터·상세/보관함 렌더링을 포함합니다. 변경된 카탈로그 최고점과 설명 속 ‘단일악장’을 반영해 기존 테스트의 기대값/제목 검사 범위만 조정했습니다. 추천 정책은 변경하지 않았습니다.

프로덕션 빌드와 git diff --check 통과. 브라우저 JS 약 613 kB로 기존 500 kB chunk 경고가 남습니다. tracked 파일·변경 파일·브라우저 산출물에서 실제 로컬 비밀값을 검사했고 검출 0건입니다. .env·캐시·로그·모델·인증정보는 커밋하지 않습니다.

## 커밋·Production·다음 배치

검증된 카탈로그 관련 파일만 별도 commit으로 만들고 일반 push 1회를 수행합니다. commit SHA와 Git Production READY/alias/상태·검색·새 곡/번들 검증 결과는 push 후 최종 응답에 기록합니다. 기존 commit은 amend/squash/reset/rebase하지 않습니다.

내일(2026-10-22)에는 전체 catalog hash 변경 때문에 날짜·최신성·재시도·시간 예산을 통과한 기존 저장 OCR도 재분석 대상이 될 수 있습니다. 현재 저장 후보에 등장하는 내일 이후 공연의 최신 OCR은 **18건**입니다. 이는 후보가 존재하는 저장 자료의 관측 범위이며 내일 전체 큐의 확정 개수는 아닙니다. 기존 수동 확정은 개별 work identity가 같으므로 카탈로그 추가만으로 stale 처리되지 않습니다. 새 후보가 생기면 REVIEW_REQUIRED이며 자동 확정하지 않습니다.

## 수정 파일

- README.md, data/manual/rating-guide.md, 이 보고서
- data/manual/catalog-additions-2026-10-21.json, data/manual/manual-emotions-v1.csv
- src/data/manualRatings.js, src/data/manualTrackDetails.js, src/data/emotions.js, src/data/workCatalog.js
- server/programMatching.mjs, server/programMatchingNormalization.mjs
- src/data/catalogAdditions20261021.test.js, src/data/recommendation.test.js, scripts/test.mjs

## 생성된 ID (101개)

```text
schumann-kinderszenen-op15-no1
schumann-kinderszenen-op15-no2
schumann-kinderszenen-op15-no3
schumann-kinderszenen-op15-no4
schumann-kinderszenen-op15-no5
schumann-kinderszenen-op15-no6
schumann-kinderszenen-op15-no7
schumann-kinderszenen-op15-no8
schumann-kinderszenen-op15-no9
schumann-kinderszenen-op15-no10
schumann-kinderszenen-op15-no11
schumann-kinderszenen-op15-no12
schumann-kinderszenen-op15-no13
schumann-fantasiestucke-op12-no1
schumann-fantasiestucke-op12-no2
schumann-fantasiestucke-op12-no3
schumann-fantasiestucke-op12-no4
schumann-fantasiestucke-op12-no5
schumann-fantasiestucke-op12-no6
schumann-fantasiestucke-op12-no7
schumann-fantasiestucke-op12-no8
schumann-fantasiestucke-op111-no1
schumann-fantasiestucke-op111-no2
schumann-fantasiestucke-op111-no3
schumann-kreisleriana-op16-no1
schumann-kreisleriana-op16-no2
schumann-kreisleriana-op16-no3
schumann-kreisleriana-op16-no4
schumann-kreisleriana-op16-no5
schumann-kreisleriana-op16-no6
schumann-kreisleriana-op16-no7
schumann-kreisleriana-op16-no8
schumann-allegro-op8
schumann-arabeske-op18
schumann-blumenstuck-op19
schumann-humoreske-op20
liszt-etude-s139-no1
liszt-etude-s139-no2
liszt-etude-s139-no3
liszt-etude-s139-no4
liszt-etude-s139-no5
liszt-etude-s139-no6
liszt-etude-s139-no7
liszt-etude-s139-no8
liszt-etude-s139-no9
liszt-etude-s139-no10
liszt-etude-s139-no11
liszt-etude-s139-no12
liszt-etude-s141-no1
liszt-etude-s141-no2
liszt-etude-s141-no3
liszt-etude-s141-no4
liszt-etude-s141-no5
liszt-etude-s141-no6
liszt-etude-s144-no1
liszt-etude-s144-no2
liszt-etude-s144-no3
liszt-etude-s145-no1
liszt-etude-s145-no2
liszt-sonata-s178-m1
liszt-ballade-s170-no1
liszt-ballade-s171-no2
liszt-annees-de-pelerinage-s160-no1
liszt-annees-de-pelerinage-s160-no2
liszt-annees-de-pelerinage-s160-no3
liszt-annees-de-pelerinage-s160-no4
liszt-annees-de-pelerinage-s160-no5
liszt-annees-de-pelerinage-s160-no6
liszt-annees-de-pelerinage-s160-no7
liszt-annees-de-pelerinage-s160-no8
liszt-annees-de-pelerinage-s160-no9
liszt-annees-de-pelerinage-s161-no1
liszt-annees-de-pelerinage-s161-no2
liszt-annees-de-pelerinage-s161-no3
liszt-annees-de-pelerinage-s161-no4
liszt-annees-de-pelerinage-s161-no5
liszt-annees-de-pelerinage-s161-no6
liszt-annees-de-pelerinage-s161-no7
liszt-venezia-e-napoli-s162-no1
liszt-venezia-e-napoli-s162-no2
liszt-venezia-e-napoli-s162-no3
liszt-annees-de-pelerinage-s163-no1
liszt-annees-de-pelerinage-s163-no2
liszt-annees-de-pelerinage-s163-no3
liszt-annees-de-pelerinage-s163-no4
liszt-annees-de-pelerinage-s163-no5
liszt-annees-de-pelerinage-s163-no6
liszt-annees-de-pelerinage-s163-no7
liszt-legend-s175-no1
liszt-legend-s175-no2
liszt-mephisto-waltz-s514-no1
liszt-mephisto-waltz-s515-no2
liszt-mephisto-waltz-s216-no3
liszt-consolation-s172-no1
liszt-consolation-s172-no2
liszt-consolation-s172-no3
liszt-consolation-s172-no4
liszt-consolation-s172-no5
liszt-consolation-s172-no6
liszt-liebestraum-s541-no1
liszt-liebestraum-s541-no2
```
