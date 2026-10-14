import { workCatalog } from './workCatalog.js'

// 곡 검색과 API 프로그램 연결은 등록 곡에서 파생한 작품 정보를 사용합니다.
export const concertWorks = workCatalog

// 공식 프로그램을 사람이 확인한 공연입니다. KOPIS 검색 후보의 확인 순서에만 사용하며,
// 화면의 확정 결과에는 서버가 같은 KOPIS 상세·프로그램 근거를 다시 검증한 항목만 표시합니다.
export const concerts = [{
  id: 'kopis-PF302595',
  kopisId: 'PF302595',
  title: '다니엘 델 피노 피아노 리사이틀 [서울]',
  dateFrom: '2026-10-17',
  dateTo: '2026-10-17',
  venue: '클래시카 서울',
  region: '서울',
  genre: '서양음악(클래식)',
  performanceStatus: '공연예정',
  sourceUrl: 'https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=PF302595',
  sourceLabel: 'KOPIS 공연 정보',
  verifiedOn: '2026-10-14',
  programStatus: 'verified',
  programVerification: 'manual',
  programWorkIds: [
    'schubert-impromptu-d899-op90-no3',
    'schubert-impromptu-d899-op90-no2',
    'chopin-ballade-op23-no1',
  ],
  programScopes: {
    'schubert-impromptu-d899-op90-no3': { kind: 'work', movementNumbers: [] },
    'schubert-impromptu-d899-op90-no2': { kind: 'work', movementNumbers: [] },
    'chopin-ballade-op23-no1': { kind: 'work', movementNumbers: [] },
  },
}, {
  id: 'kopis-PF302451',
  kopisId: 'PF302451',
  title: '음악공방 피오레움, 윤피아노 클래스 초청 연주회: 장준호',
  dateFrom: '2026-10-23',
  dateTo: '2026-10-23',
  venue: '피오레아트앤엔터(피오레움)',
  region: '서울',
  genre: '서양음악(클래식)',
  performanceStatus: '공연예정',
  sourceUrl: 'https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=PF302451',
  sourceLabel: 'KOPIS 공연 정보',
  verifiedOn: '2026-10-14',
  programStatus: 'verified',
  programVerification: 'manual',
  programWorkIds: ['beethoven-sonata-op57-no23'],
  programScopes: {
    'beethoven-sonata-op57-no23': { kind: 'work', movementNumbers: [] },
  },
}]
