import { manualRatings } from './manualRatings.js'
import { getRepresentativeEmotions, isFullyRated } from './emotions.js'

export const composerImages = {
  바흐: '/composers/bach-card-800x600.jpg',
  베토벤: '/composers/beethoven-stieler-card-800x600.jpg',
  쇼팽: '/composers/chopin-wodzinska-card-800x600.jpg',
  드뷔시: '/composers/debussy-card-800x600.jpg',
  리스트: '/composers/liszt-card-800x600.jpg',
  모차르트: '/composers/mozart-card-800x600.jpg',
  라흐마니노프: '/composers/rachmaninoff-card-800x600.jpg',
  사티: '/composers/satie-card-800x600.jpg',
  슈베르트: '/composers/schubert-card-800x600.jpg',
  슈만: '/composers/schumann-card-800x600.jpg',
}
export const tracks = manualRatings.map((track) => ({
  ...track, ratingStatus: isFullyRated(track) ? 'complete' : 'needs-review', tone: 'sage',
  description: `사용자가 직접 평가한 아홉 가지 감정으로 만나보는 ${track.composer}의 피아노 작품이에요.`,
  tags: getRepresentativeEmotions(track).map(({ label }) => label),
}))
export const legacyTrackIdMap = {
  'chopin-sonata-2-1': 'chopin-sonata-op35-no2-m1',
  'chopin-sonata-3-4': 'chopin-sonata-op58-no3-m4',
  'rachmaninoff-prelude-op23-5': 'rachmaninoff-prelude-op23-no5',
  'satie-gymnopedie-1': 'satie-gymnopedie-no1',
  'liszt-liebestraum-3': 'liszt-liebestraum-s541-no3',
  'beethoven-moonlight-1': 'beethoven-sonata-op27-2-no14-m1',
  'beethoven-moonlight-3': 'beethoven-sonata-op27-2-no14-m3',
  'beethoven-waldstein-1': 'beethoven-sonata-op53-no21-m1',
  'beethoven-appassionata-3': 'beethoven-sonata-op57-no23-m3',
}
// 정확히 같은 작품·악장에만 연결합니다. 기존 쇼팽 두 악장에는 등록 영상이 없었습니다.
export const trackDetails = {
  'chopin-sonata-op35-no2-m1': {
    highlight: { title: '강한 걸음과 섬세한 숨결', description: '단단한 리듬 사이로 갑자기 부드러워지는 선율의 대비를 느껴보세요.' },
  },
  'chopin-sonata-op58-no3-m4': {
    highlight: { title: '밝게 치닫는 피날레', description: '가벼운 도약처럼 이어지는 음형이 마지막까지 힘을 얻는 흐름을 들어보세요.' },
  },
  // 이전 영상 등록 참고본과 동일한 월광 1·3악장 구간만 재사용합니다.
  'beethoven-sonata-op27-2-no14-m1': {
    shortPreview: { provider: 'youtube', videoId: 'uTjOXAzUTQA', startSeconds: 7, endSeconds: 339, sourceLabel: '다니엘 하리토노프 · MBC TV예술무대' },
  },
  'beethoven-sonata-op27-2-no14-m3': {
    shortPreview: { provider: 'youtube', videoId: 'uTjOXAzUTQA', startSeconds: 459, endSeconds: 788, sourceLabel: '다니엘 하리토노프 · MBC TV예술무대' },
  },
}
