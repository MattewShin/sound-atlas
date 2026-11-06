# 현재 작업

- 작업 ID: CA-SOCIAL-20261106-001
- 명세 버전: 2
- 상태: IMPLEMENTED (검토/실환경 확인 대기)
- 브랜치: codex/ca-social-20261106-001-integration
- 통합 Draft PR: [#21](https://github.com/MattewShin/sound-atlas/pull/21)
- 배포 전 확인 기준 HEAD: 5a302bcaff00c33246a2d68c8e688aa67b54cf89
- 배포 전 검증 상태: 미완료 — 스테이징 미구성(사용자 확인), 환경 구성 안내와 시험/신고 정리 설정안 준비
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
- 2026-11-06 KST: Draft #21 게시. GitHub 변경 파일 43개가 로컬 allowlist와 일치하고 main과 충돌 없음 확인. 게시 후 추가 변경은 PR 링크를 기록한 문서뿐이다.
- 2026-11-06 KST 배포 전 확인: 기준 HEAD와 문서/작업 트리 대조. 스테이징 미구성을 사용자에게 확인했으며 운영 DB에는 연결하지 않았다. 실제 migration/OAuth/PostgREST/Realtime 및 320/375/390px 화면은 미실행. [스테이징 준비·검증 안내](docs/MUSIC_SOCIAL_STAGING.md)에 테스트 Supabase→기반 migration→별도 Google OAuth→브랜치 전용 Vercel Preview→합성 기존 데이터→SNS migration→실제 검증 순서와 일일 신고 정리·독립 감시안을 기록했다. 기능 코드는 변경하지 않았다. 상태 IMPLEMENTED는 기존 구현 결과이며 배포 검증 통과를 뜻하지 않는다.
