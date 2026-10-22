# Classic Atlas 프로젝트 맥락

- 문서 버전: 3
- 작성일: 2026-10-22 (Asia/Seoul)
- 저장소: https://github.com/MattewShin/sound-atlas
- 구현 확인 기준: main / 1607ca201c3a559bc7f28aabe998ef062db02ef9
- 확인 자료: README.md, package.json, docs/CONCERT_PIPELINE.md, docs/PIPELINE_ANALYSIS_ONLY.md
- 이 문서는 방향과 구조의 요약이다. 실행 환경·실제 DB·로컬 작업 상태를 확인했다는 의미는 아니다.

## 서비스 목적

클래식 음악은 좋아하지만 공연 프로그램만으로 곡과 취향의 관계를 판단하기 어려운 사용자를 돕는다. 감정·기분으로 곡을 탐색하고 마음에 드는 곡을 보관하며, 해당 작품을 들을 수 있는 공연을 찾도록 연결한다.

## 역할

| 참여자 | 주 역할 |
| --- | --- |
| Theo | 목표·제품 정책 결정, 우선순위와 사용자 경험 판단 |
| 웹 GPT | 기획·조사, 요구사항 작성, 구현 결과와 의견 검토 |
| Codex | 현재 코드 확인, 구현·테스트, 기술 의견과 결과 기록 |

상대의 전체 대화를 자동으로 읽는 방식이 아니다. 같은 GitHub 문서를 명시적으로 읽고 갱신한다. 접근하지 못한 로컬 코드·DB·대화의 내용을 추정하지 않는다.

## 기준 커밋에서 확인한 구현 구조

| 영역 | 기준과 관련 문서 |
| --- | --- |
| 웹앱 | React 19, Vite 6, Node 22.x. package.json 참조 |
| 감정·기분 추천 | README.md, src/data/emotions.js, src/data/recommendations.js |
| 곡·평가·보관 | README.md의 데이터 관리 및 로컬 저장 마이그레이션 |
| 기본 공연 검색 | KOPIS + 필요 시 Tesseract. docs/CONCERT_PIPELINE.md |
| DB 검색 | 서버 설정으로 선택하는 Supabase 미리보기. docs/SUPABASE_CONCERT_PREVIEW.md |
| 로컬 OCR | Python EasyOCR 배치. docs/EASYOCR_BATCH.md |
| 프로그램 분석 | 저장된 OCR에서 추출·매칭. docs/PROGRAM_ANALYSIS.md |
| 통합 배치 | 수집·정리·OCR·분석. docs/LOCAL_PIPELINE.md |
| 분석 전용 실행 | docs/PIPELINE_ANALYSIS_ONLY.md |

기본 웹 검색의 Tesseract와 로컬 EasyOCR 배치는 공존한다. EasyOCR가 모든 웹 검색 경로를 대체했다고 해석하지 않는다. 기준 자료에서는 통합 배치가 후보를 자동 확정하지 않고 DB 검색은 유효한 수동 확정 EXACT 결과를 반환한다. 이후 구현은 최신 코드와 명세로 다시 확인한다.

README에는 서로 다른 시기의 운영 설명이 함께 있을 수 있다. 문서 간 충돌이 있으면 관련 코드와 실제 환경을 확인하고 충돌을 기록한다.

## 사용자가 전달한 운영 정보와 목표

| 항목 | 구분 | 내용 |
| --- | --- | --- |
| 정기 배치 시각 | 사용자 전달, 환경 미검증 | 매일 오전 8:40 한국 시간으로 변경했다고 전달받음. Windows 실제 등록 상태는 Codex가 확인 가능한 환경에서 확인 |
| 공연 매칭 방향 | 사용자 목표, 구현 완료 아님 | 명확한 후보뿐 아니라 모호한 후보의 처리도 자동화해 사람이 반복 검토하는 작업을 없애는 것이 최종 목표 |
| 협업 방식 | 이번에 선택한 방식 | GitHub 공동 문서로 요구사항·구현 결과·의견을 교환 |
| 기본 개발 역할 | 사용자 선호 | 웹 GPT는 기획·시장조사·한글 작업 명세, 실제 기능 개발은 별도 Codex에서 수행 |

이번 공동 문서 추가가 공연 자동 확정 정책이나 기존 운영 배치를 바꾸지는 않는다. 자동화 목표의 구체적인 처리 규칙은 별도 작업 명세에서 다룬다.

## 검증 진입점

아래 명령은 package.json에서 존재를 확인한 명령이며, 이번 문서 구성 작업에서 실행하지 않았다. 변경 영역에 맞게 선택한다.

- 웹앱: `npm test`, `npm run build`
- 수집: `npm run test:collection`
- EasyOCR: `npm run test:easyocr`
- 프로그램 분석: `npm run test:program`
- 추천 진단: `npm run diagnose:recommendations`

실제 배치·DB 쓰기·정리 작업은 해당 명령의 동작과 사용자가 맡긴 작업 범위를 확인한 후 수행한다.

## 유지 방법

확정된 서비스 정책이나 구조가 바뀌면 근거 파일·기준 커밋·확인 날짜를 함께 갱신한다. 세부 구현 보고는 HANDOFF에, 이번 작업의 요구사항은 CURRENT_TASK에 기록한다.

## 2026-10-22 Codex 확인 보충

- 문서 기준: 원격 main / 93fa34503638d363baf5d4d3e0a9c45a0be5c41f. 로컬 코드 기준은 main / 1607ca201c3a559bc7f28aabe998ef062db02ef9 및 커밋 전 변경 28개 파일이다.
- React 19 / Vite 6 / Node 22.x 구성과 웹 KOPIS·Tesseract, Supabase 검색, 로컬 EasyOCR 경로의 분리는 현재 파일에서도 확인했다.
- 위의 “후보 자동 확정 없음 / 수동 확정 EXACT”는 기존 커밋의 설명이다. 로컬 미커밋 구현에는 `program-auto-1` 자동 확정·미연결 처리와 daily/analysis-only 연결이 추가되어 있다. 공유된 문서 브랜치에는 이 기능 코드가 없으며, 실제 운영 적용 완료를 뜻하지 않는다. 당시 상태와 검증 한계는 [보관된 HANDOFF.md](docs/collaboration/archive/CA-COLLAB-20261022-001/HANDOFF.md)를 참조한다.
- 예약 작업을 읽기 전용으로 확인했다. `ClassicAtlas-LocalPipeline`: 매일 08:40 KST, 다음 실행 2026-10-23 08:40 KST, 실행 한도 PT32M, 배치 1,800초, 중복 실행 IgnoreNew. daily/08:40/배터리 허용 조건과 등록 설정이 일치했다. 이는 등록 설정 검증이며, 배치 성공 검증은 아니다. 마지막 실행 결과 코드는 1이다.
- 원격 DB의 현재 migration 적용 상태와 실제 배포 상태는 이번 작업에서 조회하지 않았다. 기존 로컬 결과 파일의 원격 미적용 기록과 당시 직접 확인한 결과는 보관된 HANDOFF에서 구분한다.


## 공연 검색 확장 작업 시작

- 현재 작업: CA-SEARCH-20261022-001 / 명세 1. 범위는 CURRENT_TASK.md를 따른다.
- 명세·결과 브랜치: `codex/ca-search-20261022-001`. 원격 main과 구분해 읽는다.
- 공동 문서 협업 테스트는 ACCEPTED/PASS로 종료했고, 최종 기록은 `docs/collaboration/archive/CA-COLLAB-20261022-001/`에 보관했다.
- 이번 사용자 방향: SQL·예약 점검은 최소 선행 확인으로 진행하고 등록곡별 공연 검색 확장 조사를 함께 시작한다.
- 이 문서의 이전 운영 수치와 설정 확인은 당시 보고다. 이번 작업에서 현재 값을 다시 확인하고 기준 코드 SHA·조회 시각·환경을 붙인다.

## CA-SEARCH 1차 조사 결과

- 고정 공유 코드: `ad5ab3cf5984146c4b2dc94428a146944af23fab` / `codex/ca-search-20261022-001`. 기존 자동화·수집 진단과 관련 SQL/운영 문서를 이제 이 브랜치에서 읽을 수 있다. 운영 배포 완료는 아니다.
- 활성 목록 직접 집계: 291 track / 252 work. 정적 표기 준비 279 READY, 사계의 월 표기 12 UNSUPPORTED_NOTATION. 관측은 2 CONFIRMED_FOUND / 2 UNCONFIRMED / 3 상위 작품만 확인 / 284 조사 범위 귀속 근거 미발견이다.
- 관측 snapshot: 2026-10-22 10:58 KST, 서울 10/22~11/21, 저장 공연 47개. 두 확정 곡은 같은 PF295548이므로 고유 공연은 1개다.
- 현 API의 자동화 5 RPC/신규 column 비노출로 자동화 preflight 미충족. 운영 SQL 적용·확정 쓰기·배포·배치 run 없이 조사와 로컬 격리 검증을 완료했다.
- 자세한 범위·결과·후속 제안은 [현재 HANDOFF](HANDOFF.md), [전곡 조사](docs/CONCERT_SEARCH_COVERAGE_2026-10-22.md), [JSON](docs/CONCERT_SEARCH_COVERAGE_2026-10-22.json)을 참조한다. 이전 수치와 이번 snapshot을 섞어 최신 운영 성과로 해석하지 않는다.
