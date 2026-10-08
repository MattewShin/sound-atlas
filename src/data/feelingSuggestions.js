// 제품 정책: 기분→듣고 싶은 음악 감정. 수동 평가값과 별도로 관리합니다.
export const feelingOptions = ['기쁜', '설레는', '차분한', '울적한', '답답한', '화나는']
export const defaultListeningDirection = 'continue'
export const feelingSuggestions = {
  기쁜: { continue: ['joy', 'wonder'], change: ['peacefulness', 'tenderness'] },
  설레는: { continue: ['wonder', 'joy'], change: ['peacefulness', 'nostalgia'] },
  차분한: { continue: ['peacefulness', 'nostalgia'], change: ['joy', 'power'] },
  울적한: { continue: ['sadness', 'tenderness'], change: ['tenderness', 'joy'] },
  답답한: { continue: ['tension', 'sadness'], change: ['peacefulness', 'tenderness'] },
  화나는: { continue: ['tension', 'transcendence'], change: ['peacefulness', 'tenderness'] },
}
export const getSuggestedEmotions = (feeling, direction = defaultListeningDirection) => feelingSuggestions[feeling]?.[direction] ?? []
