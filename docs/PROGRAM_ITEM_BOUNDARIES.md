# 작품·악장 경계 수정 — stored-program-2

2026-10-15, PF300258·PF296289의 저장 OCR만 읽어 수정 전후를 비교했습니다. 원격 DB 쓰기, 수집, OCR 판독, 이미지 다운로드는 실행하지 않았습니다.

## 원인과 적용 범위

기존 추출기는 현재 제목을 만든 뒤 로마 숫자로 시작하는 행을 모두 해당 제목의 악장으로 이어 붙였습니다. 이 때문에 제목 뒤에 분리되어 읽힌 `I.`와 `II. Septiembre`, `III. Rojo y Negro`가 `Don Juan`에 묶였습니다.

이제 번호가 붙은 제목 목록에서 부모 제목의 근거가 없으면 각 항목을 따로 보존합니다. 번호가 제목과 같은 행에 있으면 그 원문을 사용하고, OCR 순서가 뒤바뀌어 번호가 별도 행이면 같은 줄의 bbox·왼쪽 번호 위치를 확인합니다. 좌표가 없을 때는 제목 바로 앞 번호만 읽기 순서 근거로 연결합니다. 근거가 없거나 여러 번호가 경쟁하면 `unassigned_numbers`로 남기고 검토 사유를 추가합니다. 다른 작곡가 영역을 넘어 번호나 작곡가를 가져오지 않습니다.

명시된 소나타·협주곡·모음곡 등 부모 제목 아래의 악장 목록은 기존 관계를 유지합니다. 단순 프로그램 순번은 악장 번호로 사용하지 않습니다. 독립적인 작품 식별자가 있는 아라비아 순번 항목은 기존 곡 후보를 보존하며, 번호 자체를 작품의 독립성이나 악장 관계의 증거로 사용하지 않습니다.

공연 ID·작곡가·제목 전용 예외는 없습니다. 다른 작곡가와 제목, 알려진 장르명이 있는 첫 항목으로도 회귀 테스트했습니다. 카탈로그, OCR 숫자 보정, 조성 정규화, 공연 회차 규칙, Python·엔진, 웹 검색·큐는 변경하지 않았습니다.

## 푸홀 목록의 전후 표현

원문 작곡가 문맥은 OCR 그대로 `D Pujol (7957-`를 유지합니다. 누락된 이니셜이나 잘못 읽은 생년을 이번 수정에서 보정하지 않았습니다.

| 항목 | stored-program-1 | stored-program-2 |
| --- | --- | --- |
| 후보 | Don Juan 하나 | Don Juan / Septiembre / Rojo y Negro 세 개 |
| 부모 제목 | Don Juan을 부모처럼 사용 | 각각 `parent_title: null` |
| 번호 | `movement_numbers: [1,2,3]` | 항목별 `extracted_numbers.raw: I / II / III`, `role: UNRESOLVED` |
| 악장 번호 | 1·2·3을 악장으로 묶음 | 각 `movement_numbers: []` |
| 항목 관계 | 첫 제목 아래의 악장처럼 처리 | `item_relation: UNCERTAIN`, 같은 `group_key`로 목록 출처만 공유 |
| 곡/작품 ID | null | 모두 null |
| 검토 상태 | REVIEW_REQUIRED | 모두 REVIEW_REQUIRED |

첫 항목은 `Don Juan 돈 후안`과 별도 `I.`의 bbox로 같은 줄임을 확인해 `association: BBOX_SAME_ROW`를 남깁니다. 나머지 두 번호는 제목과 같은 OCR 행에 있어 `INLINE`입니다. 각 후보의 `evidence`에는 공통 작곡가와 해당 제목·번호의 원문 인용, 위치, bbox가 있습니다. 다른 항목의 제목을 그 항목의 부모 이름으로 복제하지 않습니다.

기존 `identity` JSON에 `parent_title`, `item_relation`, `group_key`, `extracted_numbers`, `unassigned_numbers`를 추가하는 최소 변경입니다. **DB 마이그레이션은 필요 없습니다.** 원문·정규화·인용을 보존하며 확정되지 않은 번호를 `movement_numbers`에 넣지 않습니다. 기존 명시적 부모 작품은 기존 `identity.title`과 악장 표현을 계속 사용합니다.

새 사유는 `PARENT_WORK_TITLE_UNCONFIRMED`, `UNCERTAIN_NUMBERED_ITEM_RELATION`이며, 번호 연결까지 불확실하면 `NUMBER_TITLE_ASSOCIATION_UNCERTAIN`입니다. `MULTIPLE_DATES_OR_SERIES_SCOPE`, 작곡가 미등록 등 기존 보류 사유도 유지합니다. 카탈로그와의 관계 `relation`은 세 항목 모두 `AMBIGUOUS`입니다.

## 실제 dry-run 비교

수정 전 2026-10-15 15:35:12 KST, 수정 후 15:46:33 KST에 같은 저장 OCR을 읽었고, 최종 보완 후 15:53:50 KST에도 v2 결과가 동일함을 확인했습니다. [비교 JSON](PROGRAM_ITEM_BOUNDARIES_COMPARISON_2026-10-15.json)에 원문·좌표·전후 구조를 남겼고, 최초 [v1 표본 JSON](PROGRAM_ANALYSIS_SAMPLE_2026-10-15.json)은 보존했습니다.

| 공연 | 후보 수 전 → 후 | 등록곡 연결 | 검증 |
| --- | ---: | ---: | --- |
| PF300258 | 6 → **8** | 0 → **0** | 합쳐진 푸홀 1개를 3개로 분리. 나머지 5개 후보 JSON은 동일 |
| PF296289 | 5 → **5** | 0 → **0** | 협주곡 등 5개 후보의 식별 정보·근거·보류 사유·키 모두 동일 |

PF300258의 분류는 미등록 5·모호성 1에서 미등록 4·모호성 4로 바뀝니다. 푸홀 세 항목은 부모와 관계를 판별하지 못했으므로 `AMBIGUOUS`로 보고합니다. 연결이 늘어난 결과가 아닙니다.

15:48:51 KST의 읽기 전용 확인에서도 원격 DB는 기존 v1 분석 3건·후보 6건(모두 REVIEW_REQUIRED)·검토 이력 0건이었고 후보 갱신 시각도 이전과 같았습니다. **v2 분석 저장·후보 상태 변경은 0건**입니다. `list`는 현재 로컬 버전으로 필터하므로 v2를 저장하지 않은 현재에는 v1 후보를 표시하지 않을 수 있습니다. `show`는 기존 UUID로 v1 근거를 읽을 수 있습니다.

## 버전과 검증

matcher_version을 `stored-program-1`에서 **`stored-program-2`**로 올렸습니다. 기존 마이그레이션과 RPC는 변경하지 않았습니다.

로컬 PostgreSQL 테스트에서 같은 OCR의 v1 통합 후보와 수동 반려 기록을 만든 뒤 실제 v2 결과를 저장했습니다. v1 후보·반려 이력이 보존되고, 구 분석만 `ANALYSIS_SUPERSEDED`가 되며 새 3개 항목이 REVIEW_REQUIRED로 저장되는 것을 확인했습니다. v2 재실행은 같은 분석 ID·후보 수를 유지했고, v1 재실행은 구 분석을 재활성화하지 않았습니다. 잘못된 인용을 포함한 새 저장의 전체 롤백도 확인했습니다. 기존 테스트의 확정 이력 보존 검증도 통과했습니다. 이 상태 변경 테스트는 모두 로컬 메모리 PostgreSQL fixture입니다.

- 전용 테스트: **22개 통과** — 신규 경계 테스트 8개와 저장 버전 테스트 1개 포함. 날짜를 번호 제목으로 오인하지 않는 사례와 작곡가 이니셜이 로마 숫자처럼 보이는 사례도 검사합니다.
- 전체 `npm test`: **173개 통과**.
- `npm run build`: 성공.

## 직접 비교할 명령

Windows Git Bash, 프로젝트 루트에서 실행합니다. 다음 명령은 저장 OCR 읽기·텍스트 분석만 수행합니다.

```bash
cd /c/Users/CNXK/dev/sound-atlas
npm run program:analyze -- analyze --dry-run --kopis-id PF300258
npm run program:analyze -- analyze --dry-run --kopis-id PF296289

# 원격에 보존된 v1 푸홀 후보와 비교하기 (읽기 전용)
npm run program:analyze -- show b0d10289-fbbd-4d38-863a-96cf8b6c53a5
```

v2 dry-run의 부모 제목 null·번호별 항목·악장 번호 빈 배열을 v1 show의 통합 구조와 비교하세요. 이번 작업에서는 원격 저장·확정·반려 명령을 실행하지 않았습니다.

주요 변경 파일은 `server/programItemBoundaries.mjs`, `server/programAnalysis.mjs`, 경계 회귀 테스트, SQL 버전 저장 테스트, 전용 테스트 진입점과 이 문서입니다.
