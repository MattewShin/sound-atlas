import { manualRatings } from './manualRatings.js'
import { getRepresentativeEmotions, isFullyRated } from './emotions.js'
import { tchaikovskySeasonDetails } from './tchaikovskySeasons.js'
import { manualTrackDetails } from './manualTrackDetails.js'

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
  차이콥스키: '/composers/tchaikovsky-portrait-card-800x600.jpg',
}
export const tracks = manualRatings.map((track) => ({
  ...track, ratingStatus: isFullyRated(track) ? 'complete' : 'needs-review', tone: 'sage',
  description: track.summary || `사용자가 직접 평가한 아홉 가지 감정으로 만나보는 ${track.composer}의 피아노 작품이에요.`,
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
// 작품·악장 ID별 사용자 제공 소개와 정확한 영상 구간을 연결합니다.
export const trackDetails = {
  ...manualTrackDetails,
  ...tchaikovskySeasonDetails,
  'beethoven-piano-concerto-op73-no5-m1': {
    about: '1809년에 작곡된 협주곡의 첫 악장으로, 관현악의 강한 화음에 피아노가 자유로운 독주처럼 응답하며 시작한다.',
    listeningTip: '힘찬 주제와 조용한 선율의 대비, 피아노와 관현악이 주고받는 흐름에 집중해 보자. 화려함 속에서 부드러운 표정도 발견할 수 있다.',
    shortPreview: { provider: 'youtube', videoId: 'MlrNjdYnheM', startSeconds: 0, endSeconds: 1259,
      sourceLabel: 'Krystian Zimerman · London Symphony Orchestra · Sir Simon Rattle / Krystian Zimerman - Topic / 《Beethoven: Complete Piano Concertos》 · Deutsche Grammophon (2021)' },
  },
  'beethoven-piano-concerto-op73-no5-m2': {
    about: '약음기를 사용한 현악의 선율로 시작하는 느린 악장으로, 마지막에는 다음 악장으로 쉼 없이 이어진다.',
    listeningTip: '현악의 긴 호흡과 피아노의 작은 응답을 따라가 보자. 끝부분에서 다음 악장의 주제가 조심스럽게 모습을 드러내는 순간도 귀 기울일 만하다.',
    shortPreview: { provider: 'youtube', videoId: 'QsrnBnnoQ00', startSeconds: 0, endSeconds: 501,
      sourceLabel: 'Krystian Zimerman · London Symphony Orchestra · Sir Simon Rattle / Krystian Zimerman - Topic / 《Beethoven: Complete Piano Concertos》 · Deutsche Grammophon (2021)' },
  },
  'beethoven-piano-concerto-op73-no5-m3': {
    about: '활기찬 주제가 되돌아오는 론도 피날레로, 피아노가 주제를 힘차게 제시하며 출발한다.',
    listeningTip: '엇박이 만드는 탄력과 주제가 돌아올 때의 변화를 들어보자. 마지막 부근에서 피아노와 팀파니가 조용히 호흡을 맞춘 뒤 다시 활력이 터지는 대비가 인상적이다.',
    shortPreview: { provider: 'youtube', videoId: 'DRPhtnden5g', startSeconds: 0, endSeconds: 623,
      sourceLabel: 'Krystian Zimerman · London Symphony Orchestra · Sir Simon Rattle / Krystian Zimerman - Topic / 《Beethoven: Complete Piano Concertos》 · Deutsche Grammophon (2021)' },
  },
}
