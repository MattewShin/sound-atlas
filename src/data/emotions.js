// 앱 운영 명칭. EMMA 실험 점수와 사용자 수동 평가는 별개입니다.
export const RATING_VERSION = 'manual-emotions-1'
export const DATA_VERSION = 'manual-catalog-3'
export const emotions = [
  { key: 'wonder', label: '감동적인', definition: '감동과 경이로움' },
  { key: 'transcendence', label: '압도적인', definition: '일상을 넘어서는 듯한 압도감' },
  { key: 'nostalgia', label: '몽환적인', definition: '회상과 그리움이 섞인 꿈같은 느낌' },
  { key: 'tenderness', label: '부드러운', definition: '다정함과 부드러움' },
  { key: 'peacefulness', label: '평안한', definition: '평온함과 안정감' },
  { key: 'joy', label: '경쾌한', definition: '기쁨과 경쾌함' },
  { key: 'power', label: '힘찬', definition: '힘과 추진력' },
  { key: 'tension', label: '긴장감 있는', definition: '긴장과 불안감' },
  { key: 'sadness', label: '애잔한', definition: '슬픔과 애잔함' },
]
export const emotionKeys = emotions.map(({ key }) => key)
export const emotionLabel = (key) => emotions.find((emotion) => emotion.key === key)?.label ?? ''
export const normalizeScore = (score) => (score - 1) / 4
export const isFullyRated = (track) => Boolean(track?.emotionScores)
  && emotionKeys.every((key) => Number.isInteger(track.emotionScores[key]) && track.emotionScores[key] >= 1 && track.emotionScores[key] <= 5)
export const getRepresentativeEmotions = (track) => emotions
  .filter(({ key }) => track.emotionScores?.[key] >= 3)
  .sort((a, b) => track.emotionScores[b.key] - track.emotionScores[a.key])
  .slice(0, 3)
export const formatTrackTitle = ({ title, movement }) => movement ? `${title} - ${movement}` : title
