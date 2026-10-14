import { emotionKeys } from './emotions.js'

// 사용자가 제공한 12곡의 제목·평가·소개·영상. 월별 곡은 각각 독립적인 보관 단위입니다.
const entries = [
  {
    month: 1, monthEn: 'January', alias: '난롯가에서', aliasEn: 'At the Fireside',
    scores: [3, 1.5, 3, 4.5, 4, 1.5, 1.5, 1.5, 2.5],
    summary: '난롯가의 온기 속에서 조용한 생각과 그리움이 번지는 곡.',
    background: '난롯불이 잦아드는 고요한 실내 풍경을 담는다.',
    listeningTip: '선율을 누군가의 낮은 목소리처럼 따라가 보자. 따뜻함 속에 스미는 쓸쓸함이 매력이다.',
    videoId: 'IDUCeZW7Vqs', endSeconds: 297,
  },
  {
    month: 2, monthEn: 'February', alias: '사육제', aliasEn: 'Carnival',
    scores: [2.5, 2, 1, 1.5, 1, 4.5, 4, 2.5, 1],
    summary: '선명한 리듬과 힘찬 움직임으로 펼쳐지는 겨울 축제.',
    background: '겨울 사육제의 떠들썩한 분위기를 그린다.',
    listeningTip: '강한 악센트와 커지는 음량에 귀 기울여 보자. 축제 행렬이 가까워지는 듯한 생동감이 느껴진다.',
    videoId: '9yv1b-OJaY0', endSeconds: 190,
  },
  {
    month: 3, monthEn: 'March', alias: '종달새의 노래', aliasEn: 'Song of the Lark',
    scores: [3, 1.5, 3, 3.5, 2.5, 1.5, 1, 2, 3.5],
    summary: '봄을 기다리는 하늘에 외롭게 울리는 작은 새의 노래.',
    background: '봄 하늘의 종달새를 표제로 삼지만 음악에는 우수가 짙다.',
    listeningTip: '짧은 새소리 같은 음형과 여백을 들어보자. 밝은 봄과 남아 있는 겨울의 쓸쓸함을 함께 느낄 수 있다.',
    videoId: 'BffmJzn-M1g', endSeconds: 148,
  },
  {
    month: 4, monthEn: 'April', alias: '스노드롭', aliasEn: 'Snowdrop',
    scores: [3, 1.5, 2, 4, 3.5, 3.5, 1.5, 1.5, 2],
    summary: '눈 사이로 피어나는 꽃처럼 조심스럽게 번지는 봄의 희망.',
    background: '눈이 녹을 무렵 피는 꽃을 통해 새로운 행복을 암시한다.',
    listeningTip: '가볍게 흔들리는 리듬을 따라가 보자. 환희보다는 설렘과 여린 생명력에 가까운 곡이다.',
    videoId: 'v2YieM-Ga8E', endSeconds: 163,
  },
  {
    month: 5, monthEn: 'May', alias: '백야', aliasEn: 'White Nights',
    scores: [4, 2, 3.5, 4, 3, 3, 2.5, 2, 2],
    summary: '은은한 밤의 빛과 생기 있는 움직임이 교차하는 곡.',
    background: '북방의 아름다운 밤과 겨울에서 벗어나는 기쁨을 담는다.',
    listeningTip: '조용한 시작과 밝고 활발한 중간 부분을 비교해 보자. 몽환적인 분위기 안에서도 감정은 계속 움직인다.',
    videoId: 'ovaKRK5A_Ms', endSeconds: 239,
  },
  {
    month: 6, monthEn: 'June', alias: '뱃노래', aliasEn: 'Barcarolle',
    scores: [4, 2, 3.5, 4.5, 3, 2, 2, 2, 4.5],
    summary: '잔잔한 물결 위로 부드러운 선율과 애틋함이 흐르는 곡.',
    background: '물가와 별빛의 이미지가 붙은 뱃노래다.',
    listeningTip: '물결처럼 흔들리는 반주 위의 긴 선율에 집중해 보자. 중간의 밝아진 흐름 뒤에 돌아오는 주제가 여운을 남긴다.',
    videoId: '1OE9j6mcviU', endSeconds: 252,
  },
  {
    month: 7, monthEn: 'July', alias: '풀 베는 사람의 노래', aliasEn: 'Song of the Reaper',
    scores: [2, 1, 1, 2, 2, 3.5, 3, 1.5, 1],
    summary: '소박한 노동의 노래에 여름 들판의 활력이 담긴 곡.',
    background: '낫으로 풀을 베는 농촌의 노동 풍경을 그린다.',
    listeningTip: '또렷한 박자와 민요 같은 선율을 들어보자. 거대한 힘보다는 몸을 움직이는 건강한 추진력에 가깝다.',
    videoId: 'dybRB0rpumc', endSeconds: 118,
  },
  {
    month: 8, monthEn: 'August', alias: '수확', aliasEn: 'Harvest',
    scores: [2.5, 2, 1, 2, 1.5, 3.5, 4, 3.5, 1.5],
    summary: '빠른 움직임과 분주한 리듬으로 그린 수확기의 활기.',
    background: '곡식을 거두는 바쁜 풍경을 스케르초로 표현한다.',
    listeningTip: '빠른 음형과 잠시 차분해지는 중간 부분을 비교해 보자. 밝은 에너지에 조급함과 긴장도 섞여 있다.',
    videoId: 'JwJmhCme3M4', endSeconds: 215,
  },
  {
    month: 9, monthEn: 'September', alias: '사냥', aliasEn: 'The Hunt', aliasesEn: ['Hunting'],
    scores: [2.5, 2.5, 1, 1, 1, 4, 4.5, 2.5, 1],
    summary: '사냥 나팔처럼 당당하고 힘차게 출발하는 곡.',
    background: '나팔 소리와 말에 오르는 사냥꾼들의 풍경을 담는다.',
    listeningTip: '호른을 연상시키는 화음과 도약하는 리듬을 들어보자. 공포보다는 출발 직전의 흥분과 기세가 중심이다.',
    videoId: 'hqmLglbqlPg', endSeconds: 171,
  },
  {
    month: 10, monthEn: 'October', alias: '가을의 노래', aliasEn: 'Autumn Song',
    scores: [3.5, 1.5, 3.5, 4, 2, 1, 1.5, 2, 4.5],
    summary: '낙엽처럼 천천히 내려앉는 쓸쓸함과 깊은 여운.',
    background: '바람에 흩날리는 가을 낙엽의 이미지가 붙어 있다.',
    listeningTip: '선율의 끝과 다음 음 사이를 느껴보자. 감정을 터뜨리기보다 조용히 되새기는 애잔함이 중심이다.',
    videoId: 'N8pcv5HmL24', endSeconds: 286,
  },
  {
    month: 11, monthEn: 'November', alias: '트로이카', aliasEn: 'Troika',
    scores: [3, 1.5, 2.5, 2.5, 2.5, 4, 2.5, 1.5, 2.5],
    summary: '눈길을 달리는 썰매의 경쾌함에 아련한 정서가 겹치는 곡.',
    background: '트로이카는 세 마리 말이 끄는 마차나 썰매를 뜻한다.',
    listeningTip: '노래 같은 선율과 썰매 방울을 떠올리게 하는 소리를 들어보자. 경쾌한 움직임 안에 그리움도 담아 들을 수 있다.',
    videoId: 'yXejWsfggFs', endSeconds: 183,
  },
  {
    month: 12, monthEn: 'December', alias: '크리스마스', aliasEn: 'Christmas', aliasesEn: ['Christmastide'],
    scores: [3, 1.5, 2, 3.5, 3, 4, 2, 1.5, 2],
    summary: '부드러운 왈츠로 한 해를 마무리하는 따뜻한 축제.',
    background: '크리스마스 무렵의 명절 분위기를 담으며, 악보에는 왈츠의 빠르기가 지정되어 있다.',
    listeningTip: '세 박자의 흔들림을 따라가 보자. 떠들썩한 환호보다 우아한 즐거움과 온기가 어울린다.',
    videoId: '3fJ0oVboB0w', endSeconds: 273,
  },
]

const idFor = (month) => `tchaikovsky-seasons-op37a-no${month}`
export const tchaikovskySeasons = entries.map((entry) => ({
  id: idFor(entry.month), composer: '차이콥스키', type: 'seasons', opus: 37, opusSuffix: 'a',
  number: entry.month, movementNumber: null, cycleId: 'tchaikovsky-seasons-op37a',
  title: `차이콥스키 사계 Op.37a : ${entry.month}월`,
  titleEn: `Tchaikovsky Four Seasons ${entry.monthEn}: ${entry.aliasEn}`,
  monthEn: entry.monthEn, movement: '', alias: entry.alias, aliasEn: entry.aliasEn,
  aliasesEn: entry.aliasesEn || [], summary: entry.summary,
  emotionScores: Object.fromEntries(emotionKeys.map((key, index) => [key, entry.scores[index]])),
  ratingSource: 'manual', ratingVersion: 'manual-emotions-1', ratingUnit: 'whole-work',
}))

export const tchaikovskySeasonDetails = Object.fromEntries(entries.map((entry) => [idFor(entry.month), {
  about: entry.background, listeningTip: entry.listeningTip,
  shortPreview: { provider: 'youtube', videoId: entry.videoId, startSeconds: 0, endSeconds: entry.endSeconds,
    sourceLabel: 'Alexander Malofeev · Mariinsky Theatre · 2019.12.26 리사이틀' },
}]))
