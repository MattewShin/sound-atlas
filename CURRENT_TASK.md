# 현재 작업

- 작업 ID: CA-SOCIAL-20261106-001
- 명세 버전: 1
- 제목: 곡 중심 내 음악 기록 SNS
- 상태: IMPLEMENTED
- 요청자: Theo
- 명세 근거: 2026-11-06 사용자의 이번 요청 1~8
- 실행 담당: Codex
- 작성일: 2026-11-06 (Asia/Seoul)
- 구현 시작 기준: 로컬 main / 1607ca201c3a559bc7f28aabe998ef062db02ef9 + 당시 미커밋 변경
- 게시 브랜치: codex/ca-social-20261106-001
- 고정 기능 코드 SHA: 7505b7f2a7ecee51acf9fcc850f163060e3f5e4b
- 이전 로컬 공동 작업: [보관 명세](https://github.com/MattewShin/sound-atlas/blob/f50251e95fe9c2e00290c6eee6329017e9d2e9f4/docs/collaboration/archive/CA-COLLAB-20261022-001/CURRENT_TASK.md), [보관 인계](https://github.com/MattewShin/sound-atlas/blob/f50251e95fe9c2e00290c6eee6329017e9d2e9f4/docs/collaboration/archive/CA-COLLAB-20261022-001/HANDOFF.md)

## 범위와 완료 기준

- 등록 곡 하나에 연결한 개인 원본과 독립 공유본. 기존 ID·평가·보관·검색을 보존하고 자동 공개하지 않는다.
- 세로 피드, 공개 닉네임·고유 @아이디·기본 아바타, 곡별/프로필/직접 링크, 상대·정확 시각, 줄바꿈·더 보기.
- 기본 나만 보기, 모든 사람/현재 팔로워 공유 전 확인과 범위 변경. 공유 취소와 원본 삭제 구분.
- 즉시 팔로우/취소, 자기 팔로우 금지, 숫자, 양방향 차단과 운영 전용 신고 조회.
- 좋아요 유일성·재시도·실패 복구. 한 단계 댓글 작성·자기 삭제·개수 갱신·실패 초안 보존.
- DB RLS로 직접 요청까지 검증. 댓글·반응·개수도 같은 권한. 계정/권한 변경 시 오래된 내용 제거. 사용자별 콘텐츠 영구 저장 금지.
- 격리 A/B/C/익명 데이터로 SQL·DOM 및 기존 회귀 검증. 운영 DB·OAuth·Realtime·실배포와 로컬 검증을 구분한다.

## 시작 확인과 구현 선택

이전 CURRENT_TASK와 HANDOFF는 CA-COLLAB-20261022-001 / 1 / IMPLEMENTED로 일치했다. 두 문서를 함께 보관하고 이번 사용자 지시를 우선했다. 시작 시 기존 공연 수집·OCR·프로그램 자동화 미커밋 변경을 확인했으며 관련 코드를 보존했다. package.json과 scripts/test.mjs는 기존 변경에 이번 SDK/검증 항목만 추가했다.

구현 시작 체크아웃에는 실제 인증·음악 기록·공개 프로필·기존 공개 게시물 테이블이 없었다. 따라서 기존 보관함을 이전하지 않고 Supabase Auth와 독립 기록 모델을 추가했다. 게시 시 원격 main/f50251e95fe9c2e00290c6eee6329017e9d2e9f4에는 후속 인증·개인 기록·공개본 모델이 있음을 확인했다. 이 Draft는 기존 구현 기준을 유지하며 최신 main 통합·기존 데이터 호환 검증 전에는 병합/배포하지 않는다. 데이터·적용·복구 순서는 [음악 기록 안내](docs/MUSIC_SOCIAL.md), 결과는 [HANDOFF](HANDOFF.md)를 참조한다.

## 게시 단계 범위

사용자의 후속 요청에 따라 SNS 관련 diff만 선별 커밋·push하고 main 대상 Draft PR을 만든다. migration 순서·기존 데이터 영향·권한·계정/원본/공유본 삭제·검증 한계·복구 절차를 기록한다. 무관한 로컬 변경은 보존하며 운영 DB 적용·main 병합·운영 배포는 하지 않는다. 기능 코드가 바뀌지 않아 이전 통과 테스트를 단순 게시 목적으로 반복하지 않는다.

## 상태 기록

- 2026-11-06 KST: IMPLEMENTED. 로컬 구현·격리 검증 완료. 운영 DB 적용·배포와 검토자의 ACCEPTED 판단은 별도다. 로컬 미커밋·미push 상태다.
- 2026-11-06 KST 게시 단계: SNS 기능을 7505b7f2a7ecee51acf9fcc850f163060e3f5e4b로 분리 커밋. 문서 보완 후 지정 브랜치와 Draft PR로 검토한다. 최신 main 통합 미해결을 명시하며 구현자 상태는 IMPLEMENTED를 유지한다.
