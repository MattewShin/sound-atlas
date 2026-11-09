> **현재 실행 절차 — CA-OCR-RETIRE-20261109-001.** KOPIS 수집/공식 Program text는 유지합니다. 과거 frozen 통합 배치 target을 재활성화하지 말고 [공식 text 전용 CLI와 적용 전 안내](OCR_RETIREMENT.md)를 따릅니다. 아래 과거 실행·검증 기록은 당시 기준입니다.

# 공식 Program 제한 예약

`PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED=false`가 기본이다. 활성화는 CURRENT_TASK Gate A~D를 모두 통과한 후에만 한다.

운영 설정: `PROGRAM_ANALYSIS_SCHEDULE_ENABLED=true`, `PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED=true`, `PIPELINE_COLLECTION_ENABLED=true`, `PIPELINE_CLEANUP_ENABLED=false`, `PIPELINE_OCR_ENABLED=false`, `PIPELINE_ANALYSIS_ENABLED=false`.

daily 실행은 기존 collection 후 저장된 공식 Program source 중 한 공연만 coordinator에 넘긴다. 선택 조회는 최대100공연이고, coordinator 호출은1회·신규 CONFIRMED 최대1건이다. OCR/NONE은 제외하고 OCR fallback·REJECTED·rematch·backfill은 실행하지 않는다. plan은 DRY_RUN만 호출한다. v4 policy/RPC가 없으면 기존 coordinator preflight로 SAVE를 차단한다.

기존08:40 KST/IgnoreNew/시간 한도를 유지한다. rollback 순서는 예약 Disabled → v4 policy disabled → 이전 action 복원이다. migration/기존 receipt는 삭제하지 않는다.
