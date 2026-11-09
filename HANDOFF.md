# OCR 영구 폐기 운영 인계

- 작업 ID: **CA-OCR-RETIRE-20261109-001 / 명세2**
- 상태: **IMPLEMENTED** (검토자 ACCEPTED 아님)
- 최종 코드 브랜치: main
- 전체 코드 / Vercel deployment SHA: **`52869c77338d7d343ca7ce204c67d3a466b6da3c`**
- 승인 HEAD: `f90e6b77dcaf29d72982600033ad6e71377f5b9a`; 기능·migration SHA: `e8e204e31d0bf5c401fec2e12641c8183a0fb219`
- PR: [#22](https://github.com/MattewShin/sound-atlas/pull/22), 2026-11-09 16:19:40 KST Ready 후 병합, production READY
- 결과 문서 브랜치: `codex/ca-ocr-retire-20261109-001-production`, 본 문서와 [운영 보고서](docs/OCR_RETIREMENT_PRODUCTION_2026-11-09.md) / [안전한 증거 JSON](docs/OCR_RETIREMENT_PRODUCTION_VERIFICATION_2026-11-09.json)
- 원래 IDE: codex/ca-social-20261106-001 / `8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e`, 기존 미커밋/비추적 변경 및 .env 보존. 별도 worktree에서 진행했다.

## 구현 결과

승인 기준 대비 main/운영 deployment·DB schema/행 수/누적 쓰기 통계 차이 없음 확인 후 PR 병합·배포했다. 새 전체 논리 백업(exit0/체크섬/전체 TOC1041/OCR-only95 확인)을 만들고 2026-11-09 16:30:11 KST READ ONLY preflight를 통과했다. **2026-11-09 16:30:20 KST** 승인된 `202611090001_retire_ocr.sql` 한 파일만 실행해 COMMIT 확인, postflight/NOTIFY 후 실제 PostgREST 확인을 마쳤다. 실패/우회/재실행/restore는 없다.

운영 앱 객체: table26→21, View4→3, 함수65→43, FK38→27, 비내부 trigger15→14. 삭제 OCR601행/확정3건을 보존 테이블로 이전하지 않았다. 유지21개 전체 행 지문/행 수, Auth 사용자, 함수·View·FK·trigger·RLS·권한이 전후 동일하고 공식 text 유효 확정2건을 유지했다. 전체 삭제/공유 유지 목록은 보고서와 typed manifest에 있다. 실제 사용자 기록을 시험 공개·수정·삭제하지 않았다.

공연 조회에 따른 기존 cache8→9행은 백업 이전에 따로 기록했다. migration 전후/최종은9→9 동일이다. 다른 사용자·서비스 데이터는 최초 gate부터 동일하다. 실제 PostgREST 삭제table5개404/PGRST205, View1/RPC22 경로 부재, 유지12경로와 공식확정2행 확인. 격리 익명 운영 화면의 홈·공연조회·보관함·음악 이야기와 social_feed200 PASS, 오류0/사용자 쓰기0이다.

## 테스트와 한계

승인 기능 SHA의 전체162/162, SNS5/5, 폐기15/15, build PASS 로그를 확인했고 승인 HEAD/병합 tree에 기능 차이0이다. 이번에는 변경 없는 전체 자동 테스트/build를 반복하지 않았다. 새로 실행한 것은 운영 drift/preflight/postflight·행 지문·객체 확인·백업 checksum/TOC/decode·실 PostgREST·익명 Chromium 읽기 smoke다.

실 Google OAuth/계정전환, 로그인된 실제 보관함/기록 내용, 모바일 전체/실기기, live Realtime 다중창/재연결, 백업 새 archive 실복원, 동시 DDL 지연과 지속 트래픽·외부 PC 호출은 미검증. Docker/새 프로젝트는 만들지 않았다. 실복원 성공/전체 무중단/로그인 흐름 전체를 검증했다고 보고하지 않는다.

## 백업·운영 상태·복구

새 archive 1,558,953 bytes, SHA-256 `1fbeb302b6786f730a6c28e74f5e9b6281f932dfaa090230ab57e167d14bbaec`. 원본 백업/TOC/로그·비공개 snapshot은 로컬 ACL 제한/Git 제외 폴더에만 있고 게시하지 않았다. 위치는 로컬 `.cache/ocr-retire-production-ops/backup-location.private.json` 참조. global roles/Storage binary/provider 설정은 논리 백업 범위 밖이다. COMMIT 이후 자동 down 없음. 장애 시 전체 DB restore를 하지 않고 영향 조사 후 필요할 때 검토된 OCR-only 복구를 별도 격리에서 먼저 확인한다. [상세 근거·절차](docs/OCR_RETIREMENT_PRODUCTION_2026-11-09.md)를 따른다.

Windows ClassicAtlas-LocalPipeline Disabled/Enabled=false 유지, frozen320개 파일 해시 동일·실행/재활성화0. 모델2개94.64MiB는 운영 성공 후에도 보존했다. 실제 env 설정을 수정하지 않았다. 모델 삭제·백업 보관 기간/정리·향후 공식 text task retarget은 별도 작업이다.

## 문서 변경과 구현자 의견

명세1 CURRENT_TASK/HANDOFF를 [함께 보관](docs/collaboration/archive/CA-OCR-RETIRE-20261109-001/spec1/)하고 현재 쌍을 명세2 결과로 갱신했다. PROJECT_CONTEXT 상단과 OCR_RETIREMENT 안내에 운영 완료 링크를 추가하고 운영 보고서/안전한 증거 JSON을 새로 작성했다. 기능 코드·migration 파일은 변경하지 않았다. 결과 문서 전용 브랜치로 게시해 운영 main/deployment SHA를 유지한다. 원래 IDE 변경은 계속 보존된다.

검토 요청: 보존/삭제 결과와 새 백업의 실복원 미검증을 확인한다. 향후 공식 text 예약은 옛 frozen target을 활성화하지 말고 새 text-only CLI로 별도 retarget해야 한다. 제품 정책은 바꾸지 않았다.
