# 감정 체계 교체 결과

이 문서는 최초 36곡 교체 작업의 기록입니다. 이후 사용자 요청으로 라흐마니노프 4곡, 사티 3곡, 리스트 1곡을 추가해 현재는 **44곡·396개 점수**입니다. 대조 CSV는 `data/manual/manual-emotions-v1.csv`로 이름을 변경했고, 목록 버전은 `manual-catalog-2`입니다. 기존 쇼팽 점수·ID는 유지하며 36곡 버전의 보관 기록을 보존합니다. 새 8곡도 각 작곡가의 기존 이미지를 사용하고, 등록 영상이 없어 미리듣기 준비 중으로 표시합니다. 확장 후 `npm test`의 **25개 테스트가 통과**했고 `npm run build`도 성공했습니다.

2026-10-08, 로컬 프로젝트 변경. 푸시·배포는 하지 않았습니다.

## 변경 파일

- `src/data/emotions.js`: 9개 감정 순서·키·한글명, 평가·데이터 버전, 정규화·대표 감정.
- `src/data/manualRatings.js`, `data/manual/chopin-emotions-v1.csv`: 사용자 확정 36곡·324개 점수와 manual 출처.
- `src/data/musicData.js`: 활성 목록 교체, 공용 작곡가 이미지, 정확히 일치하는 두 소나타 악장의 상세 정보와 ID 매핑.
- `src/data/recommendations.js`: 평균 적합도 추천, 동점 기준, 9차원 취향 프로필·코사인 유사도.
- `src/data/feelingSuggestions.js`: 기분과 새 감정 키 간 제품 정책.
- `src/data/storage.js`: 버전별 보관·좋아요·선택·최근 ID 정리 및 캐시 폐기.
- `src/App.jsx`, `src/styles.css`: Energy 단계 제거, 새 키워드, 별칭, 상세 점수, 보관함과 나의 취향 차트, 미리듣기 준비 중·빈 결과 표시.
- `src/data/recommendation.test.js`, `src/data/storage.test.js`, `scripts/test.mjs`: 데이터·추천·마이그레이션·렌더링 검증.
- `scripts/diagnoseRecommendations.js`: 9개 감정별 추천 진단.
- `scripts/emma/importEmma.js`, `scripts/emma/emma.test.js`: 구 목록 매칭·태그 제안을 제거하고 원본 검증만 유지.
- `package.json`, `README.md`, `data/manual/rating-guide.md`, `data/emma/README.md`: 테스트 명령·새 평가와 계산·참고 자료 용도.

## 제거·교체와 보존

구 20곡 활성 목록, moods·Energy 점수·필터·가중치, 강도 선택 UI, 구 태그 빈도 취향 집계와 전용 테스트를 교체했습니다. `scripts/emma/emmaMatchRules.js`, `scripts/emma/emmaTagRules.js`는 제거했습니다.

초기 교체 작업에서는 EMMA 원본 CSV를 보존했으나, 이후 새 수동 평가 자료를 올릴 예정이라는 사용자 요청에 따라 프로젝트의 `data/emma/EMMA__filtered_2026-10-07.csv`를 삭제했습니다. 당시 원본 검증 결과는 전체 87행, 정상 86행, 오류 1행이었으며 SHA-256은 `2ac4ae54123f518f9d86dab81d036f81e9e00f3e2dffa4347ce08a4412e17d2e`로 과거 기록과 일치했습니다. 구 매칭·검토 결과 `emmaReference.json`, `review.md`, `humanReviews.json`은 내용 변경 없이 `data/emma/archive/`로 이동했습니다. 참고 JSON은 남아 있으며 앱은 EMMA 자료를 읽지 않습니다. 현재 36곡의 수동 평가와 추천 동작은 이번 CSV 삭제로 바뀌지 않습니다.

기존 베토벤 두 악장의 영상 등록은 `data/manual/legacy-media.json`에 참고용으로 보존했습니다. 다른 작곡가 이미지와 프로젝트 설정도 유지했습니다. 이번 작업의 일회용 변환 스크립트는 제거했습니다.

공용 쇼팽 이미지 등록 경로: `/composers/chopin-wodzinska-card-800x600.jpg`. 파일을 복제하지 않고 카드·상세·보관함에서 공유합니다. 기존 cover 및 중심 28~30% 위치 스타일을 유지했습니다.

## 마이그레이션

기존 실제 저장 키는 `classic-atlas-track-reactions-v1`입니다. 새 버전 `chopin-36-emotions-1`이 최초 앱 실행 시 적용됩니다. 사용자 브라우저의 실제 보관 기록은 이번 검증에서 직접 수정하지 않았습니다.

정확히 같은 구 `chopin-sonata-2-1`은 `chopin-sonata-op35-no2-m1`, 구 `chopin-sonata-3-4`는 `chopin-sonata-op58-no3-m4`로 연결합니다. 삭제 곡은 정리하고 보관·좋아요는 유지합니다. 유효한 새 선택값과 편안한→평안한 변환만 허용하며 다른 설정·인증은 보존합니다.

메모리 저장소 검증에서 두 악장 보관과 좋아요를 유지하고 삭제된 곡 2개를 제거했습니다. 최근 조회와 캐시 정리, ID 중복 충돌 병합, 버전 재실행의 동일 결과, 한 번 안내, 새 점수 취향 재계산을 확인했습니다. 쓰기만 차단된 저장소에서도 읽어 온 유효한 보관 기록은 화면에 유지합니다.

## 영상 미등록 목록

현재 활성 36곡 모두 기존 등록 영상과 정확한 작품·곡번호·악장 대응이 없어 준비 중입니다.

- 쇼팽 연습곡 Op.10 No.1~No.12 (12곡)
- 쇼팽 연습곡 Op.25 No.1~No.12 (12곡)
- 쇼팽 소나타 No.2 Op.35 - 1~4악장 (4곡)
- 쇼팽 소나타 No.3 Op.58 - 1~4악장 (4곡)
- 쇼팽 발라드 No.1 Op.23
- 쇼팽 발라드 No.2 Op.38
- 쇼팽 발라드 No.3 Op.47
- 쇼팽 발라드 No.4 Op.52

## 검증과 남은 확인

`npm test`: 22개 테스트 통과. 36곡 구성·중복 ID 없음·324개 점수 일치, 힘찬/압도적인/평안한 순위, 다중 선택·동점·후보 부족·미평가, 보관·해제·모두 보관·빈 취향, 코사인 정렬, 마이그레이션, 실제 JSX 컴파일과 모든 활성곡 상세·보관함 서버 렌더링을 확인했습니다.

`npm run build`: 프로덕션 빌드 성공. `npm run diagnose:recommendations`: 9개 감정 모두 진단 성공. 힘찬 1위 Op.25 No.10 (5), 평안한 1위 발라드 No.3 Op.47 (4), 압도적인 점수 5인 곡들이 4인 곡보다 우선입니다. `git diff --check`는 오류가 없습니다.

초기 샌드박스 실행의 하위 프로세스가 EPERM으로 차단되어, 테스트와 빌드는 승인된 제한 밖 실행으로 최종 검증했습니다.

**남은 확인:** 연결 가능한 브라우저가 없어 모바일 실화면의 이미지 잘림·스크롤·클릭·실브라우저 새로고침 검증은 수행하지 못했습니다. 3열 반응형 선택 배치와 줄바꿈, 고정 축, 이미지 파일 존재·36곡 렌더링은 코드와 테스트로 확인했습니다. 실제 브라우저에서 보관 마이그레이션과 이미지 로딩을 확인하는 작업은 남아 있습니다.
