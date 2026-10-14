// 운영자가 수정할 콘텐츠 파일입니다. 곡 정보·이미지·영상은 musicData의 trackId로 연결합니다.
// 같은 곡을 다시 소개할 때는 기존 글을 덮어쓰지 말고 새 id의 글을 추가하세요.
// 날짜는 한국 시간 기준, 시작일과 종료일 모두 포함됩니다. published: false는 공개되지 않습니다.
export const weeklySelections = [
  {
    id: '2026-10-aeolian-harp',
    trackId: 'chopin-etude-op25-no1',
    sectionName: '이번 주의 한 곡', // 비우면 기본 이름을 사용합니다.
    title: '익숙한 쇼팽에서 한 걸음 더',
    teaser: '연습곡이지만 연습곡이 아닌 연습곡',
    reason: '쇼팽의 연습곡 중에 가히 손에 꼽을 정도로 잘 쓰여진 곡이라고 생각합니다. 단순히 양손의 화성 아르페지오 연습곡을 벗어난 지상에서 가장 비슷한 천사들의 하프소리가 아닐까 생각합니다.',
    audience: '아름답고 수려하지만 단조롭거나 심심하지 않는 곡을 원하는 분',
    editorName: 'My Piano Mood 에디터', // 비우면 선정자 표시를 생략합니다.
    listeningMoment: '', // 선택: 운영자의 감상 구간 설명. 비우면 생략합니다.
    previewRange: null, // 선택: { videoId: '기존 영상 ID', start: '0:30', end: '1:10' }
    // videoId는 이 곡의 shortPreview.videoId와 같아야 합니다. 잘못된 구간은 기존 미리듣기로 돌아갑니다.
    startsOn: '2026-10-14',
    endsOn: '2026-10-31',
    published: true,
  },
]
