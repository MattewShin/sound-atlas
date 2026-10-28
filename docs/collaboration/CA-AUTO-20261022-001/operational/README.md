# CA-AUTO 3M 운영 실행 자료

2026-10-28 KST. production/예약 core release는 `1db327cd38dfce778da543738f975b70789aed66`이다. 이 폴더는 실제 로컬 operator launcher의 감사용 원본이며 production coordinator나 별도 run-ledger를 추가하지 않는다.

- 실제 launcher는 workspace의 `.cache/ca-auto-20261022-001/spec4-task3m-finish/`에 있다. 절대 경로·기존 `.env` 참조·320개 release 파일 hash를 담은 `release-config.json`과 이전 예약 XML은 로컬에만 보관한다. 비밀값은 복사하거나 게시하지 않는다.
- `Invoke-OfficialProgramRelease.ps1 -Mode verify`는 pinned SHA/파일 hash·stage 설정을 검증하며 네트워크·배치를 실행하지 않는다. 예약 action만 `-Mode run`을 사용한다. 기존 `scripts/Invoke-ConcertPipeline.ps1`의 child receipt, lock, power 처리를 그대로 사용한다.
- 실행 환경 override는 collection/공식 Program만 ON, cleanup/OCR/구 분석 OFF다. 기존 root `.env`는 Node가 읽고 수정하지 않는다. 관리자 DB URL은 실제 배치 자식 환경에서 제거한다.
- 공연/collection 상한1, coordinator1회/신규CONFIRMED최대1. task는 daily08:40 KST/IgnoreNew/PT32M/RestartCount0, Node batch1800초다. 다음 정상 실행이 같은 공연의 다음 후보를 처리하는 것은 허용한다.
- rollback은 로컬 `Manage-OfficialProgramRelease.ps1 -Mode Rollback`: 예약 Disable → v4 policy=false → 이전 action 복원 순서다. `disable-policy.mjs`의 pg driver는 기존 workspace의 격리 DB-client 설치를 사용한다. migration/receipt는 삭제하지 않는다.
- 활성화 때 최초 boundary를 미래의 같은08:40으로 두어 지난 실행을 즉시 따라잡지 않게 했다. 실제 배치를 강제 실행하지 않았으며 다음 정상 예약 결과는 별도 관측 대상이다.

정확한 운영 설정과 source SHA256은 `OPERATIONAL_RELEASE_2026-10-28.json`에 기록한다.
