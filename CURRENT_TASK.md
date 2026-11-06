# 현재 작업

- 작업 ID: CA-SOCIAL-20261106-001
- 명세 버전: 2
- 상태: IMPLEMENTED (검토/실환경 확인 대기)
- 브랜치: codex/ca-social-20261106-001-integration
- 시작 원격 main: f50251e95fe9c2e00290c6eee6329017e9d2e9f4
- 검증 코드 전체 SHA: d2a7e88feb02bcd10fa075b070357d6ff92ba9a5
- 검증 tree: e9773ba88b48ea9dccec689d959a4e63be72160e
- 이전 검토: Draft PR #20 / 8a1fa8bed4a1a296c174b6a1fc61745c783a6f5e (보존)
- 기록일: 2026-11-06 Asia/Seoul

## 명세 2 변경과 완료 기준

1. 최신 main의 별도 worktree에서 SNS 변경만 통합하고 기존 브랜치·미커밋 공연/OCR 변경을 보존한다.
2. 기존 Supabase singleton, VITE_SUPABASE_PUBLISHABLE_KEY, Google 로그인·로그아웃·계정 전환·계정 삭제 흐름을 재사용한다.
3. user_music_journal/user_music_nicknames/music_record_publications를 확장해 원본·닉네임·게시물·기존 링크 ID를 보존한다. 기존 공개 범위는 public, 개인 원본 자동 공개 없음, 신규 공유 기본 private.
4. Auth UUID 매핑은 비공개 스키마에 두고 별도 공개 프로필 ID만 노출한다. 기존 REST 테이블도 열·행 권한을 검증한다.
5. 원본 삭제 시 공유본·댓글·좋아요도 삭제하는 기존 정책과 계정 삭제를 검증하고 신고 보관은 별도 문서화한다.
6. Pretendard, 자간 -0.03em, 최소 12px·짝수 크기, 실제 한 줄 normal/다중 줄 1.5를 서비스 전체에 적용하고 모바일 화면을 확인한다. 터치 영역은 유지한다.
7. 실제 통합 PR 트리에서 전체 회귀·SNS 전용·기존 호환·세션·공개 필드·기존 링크·삭제 테스트를 실행한다. 이전 377개 결과를 재사용하지 않는다.
8. 같은 작업 ID 명세 2로 문서와 새 Draft PR을 게시한다. 실제 OAuth/PostgREST/Realtime 여부를 구분한다. 운영 migration·main 병합·운영 배포는 하지 않는다.

## 보존

- [명세 1 문서](docs/collaboration/archive/CA-SOCIAL-20261106-001/spec1/CURRENT_TASK.md), [명세 1 인계](docs/collaboration/archive/CA-SOCIAL-20261106-001/spec1/HANDOFF.md)
- 기존 main의 작업 명세·인계는 docs/collaboration/archive/CA-REFERENCE-SEARCH-UX-20261102-001/에 함께 보관한다.

## 상태 기록

- 2026-11-06 KST: IN_PROGRESS. 최신 main을 원격 조회·fetch하고 별도 통합 worktree 생성. 기존 테이블/인증을 확장하는 방식으로 구현 중.
- 2026-11-06 KST: IMPLEMENTED. 위 고정 코드에서 전체 147/147, SNS 전용 5/5, build 통과. 기존 377개 근거를 재사용하지 않음. 실제 OAuth/PostgREST/Realtime·모바일 시각/PWA·운영 복구는 미검증. 컴퓨터 사용 도구가 Windows URL 확인 실패로 중단되어 시각 확인을 수행하지 못함. 새 Draft PR 게시 후에도 운영 DB/main/운영 배포는 변경하지 않음.
