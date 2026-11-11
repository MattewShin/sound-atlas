# 좋아요 UX 통합 인계

CA-SOCIAL-LIKE-UX-20261111-001 / IN_PROGRESS. 기준 main de4f78d2b00edae6166348194e1a648c8d0e184a, 브랜치 codex/ca-social-like-ux-20261111-001.

좋아요 RPC 뒤 run→전체 refresh, generic Realtime→clear/refresh로 피드가 unmount되는 것이 코드상 원인이다. 게시물별 optimistic state·token과 feed 요청 sequence/revision으로 race를 차단하며 키·페이지 깊이·초안·펼침을 유지한다. pending은 aria-disabled와 동기 Map guard로 중복 요청을 막아 키보드 포커스를 보존한다. 접근성 오류 알림은 고정형으로 피드 높이를 바꾸지 않는다.

운영 읽기 검사에서 social_set_like/social_feed/social_invalidate는 기존 migration 본문과 일치, likes 일반 statement trigger·기존 RLS 확인. migration 이력 테이블은 없어 CLI history를 주장하지 않고 catalog와 실행 근거로 미적용을 판정한다. 아직 운영 쓰기는 하지 않았다. SQL 격리 forward/rollback/ACL/typed payload/실패 원자성 PASS. 최종 테스트·코드 SHA/PR/운영 결과는 구현 문서와 후속 인계에서 확정한다.

기존 dirty 파일52개/HEAD와 PWA 결과 브랜치를 보존한다. PWA는 IOS_CONFIRMATION_PENDING 유지, 실제 iPhone 해결 확정을 하지 않는다. 사용자 승인에 따라 통합 배포까지 진행하며 결과 문서 PR은 별도 승인 전 생성/병합하지 않는다.

최종 구현·검증 완료(IMPLEMENTED, 운영 적용 전). 기능 SHA 283decdf99d54ca1969d4983e97a2c9cd189751d; 전체174/SNS5/전용3/모바일3·build PASS. [구현 문서](docs/SOCIAL_LIKE_UX.md)와 [검증 JSON](docs/SOCIAL_LIKE_UX_VERIFICATION_2026-11-11.json) 참조. 다음은 승인된 Draft 자체 검토·운영 migration·병합·배포·실검증이다.
