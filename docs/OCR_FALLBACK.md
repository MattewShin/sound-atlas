# 제한 OCR fallback — program-ocr-fallback-1

CA-OCR-FALLBACK-20261028-001 / 명세1. 기존 공식 Program v4 router/matcher/receipt/search와 legacy 자동판정은 변경하지 않는다.

`fallbackSource`는 기존 router의 공식 사유 중 `OFFICIAL_TEXT_ABSENT`, `OFFICIAL_PROGRAM_ABSENT`, `OFFICIAL_PROGRAM_EMPTY`만 OCR로 허용한다. 공식 선택은 즉시 반환하고 invalid/incomplete/hash/markup 오류는 HOLD다. fallback은 기존 `programAutomation`의 decision/finish/unavailable RPC를 사용하지 않는다.

`downloadFallbackImage`는 허용 KOPIS source에 GET 1회만 보내며 redirect/재시도가 없다. MIME와 실제 decoder format, 6MB/12Mpixel/20,000px 상한을 모두 검사한다. 승인된 Gate C calibration(2026-10-29)에 따라 원본 width/height 하한만 각각800px에서700px로 변경했다. upscaling 없이 실제 decode, 고정 grayscale Laplacian variance100 이상을 요구한다. variance는 방향 보정 후 최대1,000px 축소 이미지에서 4-neighbour Laplacian으로 계산한다. confidence/coverage/identity와 다른 안전 기준은 그대로이며 env로 완화할 수 없다.

OCR 결과의 기존 immutable `settings`에 `ocr_fallback_quality`를 포함한다. 원본 크기·byte 수·MIME·content hash·decode·blur 측정값이 없는 기존 결과는 사용할 수 없다. 같은 content/pipeline 결과가 이미 존재해 기존 immutable 결과가 재사용되더라도 필수 품질값이 없으면 SKIPPED이며 덮어쓰지 않는다.

Program heading을 제외한 본문에서 bbox/confidence 유효 detection3줄, 대응률80%, confidence 중앙값0.90을 요구한다. evidence 전부0.85 이상, 동일 work block의 명시적 composer와 catalogue evidence 각각0.90 이상이어야 한다. inherited composer heading은 허용하지 않는다. 단일 MATCHED/EXACT 등록 track/work, 명시적 악장, 무편곡·무발췌·무scope/date/session 충돌, 알려진 corroboration reason만 허용한다.

`runOcrFallbackOne`은 공연1·이미지GET1·OCR1·confirmationPOST1 상한이다. dry-run은 OCR 결과를 메모리에서만 분석하며 DB POST가 없다. SAVE는 eligible인 경우에만 OCR/분석 snapshot을 저장하고 current source를 다시 조회해 계획과 비교한다. SKIPPED는 보고서 reason만 남기고 review/confirmation RPC를 호출하지 않는다.

새 additive migration `202610280001_ocr_fallback.sql`은 별도 version-policy 행을 기본false로 만든다. `confirm_concert_ocr_fallback_v1`은 service_role 전용 SECURITY INVOKER다. policy→concert→image→candidate 잠금 아래 source/리비전/current OCR/분석/catalog/기존 receipt를 확인하고, 저장 OCR에서 품질 snapshot을 다시 계산한다. 이미지 decode 자체는 기존 OCR 저장과 같은 신뢰 경계의 로컬 service-role worker가 수행하며 SQL은 이미지 bytes를 decode하지 않는다. review에는 오직 CONFIRMED를 append하고, 새 fallback proof receipt에 immutable expected/hash를 기록한다. 동일 expected 재전송은 같은 receipt UUID로 수렴한다. 기존 status/search가 이 유효 v4 OCR review를 읽으므로 별도 검색 코드 변경이 없다.

`PROGRAM_OCR_FALLBACK_SCHEDULE_ENABLED` 기본false는 기존 공식 스위치와 별개다. runtime은 기존 OCR 대량 stage를 켜지 않고 공식 stage만 감싼다. 공식 선택이 한 공연 예산을 사용하면 OCR로 넘어가지 않는다. 공식 선택0인 실행에서만 최대10개 source 표본의 첫 공식 부재 공연/첫 DETAIL 이미지에 단건 fallback을 호출한다. 따라서 합산 공연1·신규확정1 상한이 유지된다. worker는 실제 recognize 직전에만 생성한다. fallback 정책/스위치를 꺼도 기존 공식 정책·예약과 과거 receipt는 유지된다.

운영 migration·policy·예약 연결은 Gate C 적격 dry-run 및 단건 canary 통과 후에만 진행한다. Gate C 결과 및 현재 운영 적용 여부는 CURRENT_TASK/HANDOFF와 결과 JSON을 기준으로 한다.
