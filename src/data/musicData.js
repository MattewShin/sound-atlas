export const moodOptions = [
  '편안한', '따뜻한', '애잔한', '설레는', '몽환적인', '경쾌한', '장엄한', '긴장감 있는',
]

export const energyOptions = [
  { value: '차분하게', description: '부드러운 결' },
  { value: '적당히', description: '선명한 흐름' },
  { value: '강렬하게', description: '깊고 진한 울림' },
]

const cardDetails = [
  ['5:38', '고요한 긴장', 'lavender', ['피아노', '밤의여운', '월광'], '고요한 선율 속에 깊은 긴장과 여운이 스며드는 피아노 곡이에요.'],
  ['7:11', '몰아치는 밤', 'terracotta', ['피아노', '질주', '월광'], '쉼 없이 밀고 나가는 리듬이 선명한 에너지를 전해줘요.'],
  ['5:24', '빛나는 질주', 'mustard', ['피아노', '화려한리듬', '환상'], '반짝이는 흐름과 서정적인 선율이 함께 펼쳐지는 곡이에요.'],
  ['3:18', '느슨한 시간', 'sage', ['피아노', '비움', '느린걸음'], '조금 느슨해져도 괜찮다고 말해주는 듯한 담백한 피아노예요.'],
  ['4:37', '다정한 설렘', 'lavender', ['피아노', '사랑', '꿈결'], '부드럽게 번지는 선율이 따뜻한 설렘을 남겨줘요.'],
  ['5:04', '은은한 밤', 'lavender', ['피아노', '달빛', '잔향'], '맑은 피아노의 잔향이 바쁜 생각 사이에 작은 여백을 만들어줘요.'],
  ['8:22', '가벼운 반짝임', 'mustard', ['피아노', '변주', '밝은선율'], '익숙한 선율이 경쾌하고 사랑스럽게 모습을 바꿔가요.'],
  ['4:41', '울리는 종소리', 'terracotta', ['피아노', '종소리', '장엄함'], '깊고 묵직한 울림이 공간을 가득 채우는 듯한 곡이에요.'],
  ['4:31', '다정한 밤', 'sage', ['피아노', '노래하는선율', '밤'], '노래하듯 부드러운 피아노가 마음을 다정하게 어루만져요.'],
  ['7:20', '선명한 대비', 'terracotta', ['피아노', '소나타', '극적인흐름'], '힘 있는 전개와 섬세한 표정이 선명한 대비를 이루어요.'],
  ['5:12', '찬란한 결말', 'mustard', ['피아노', '피날레', '강한리듬'], '밝고 강한 리듬이 힘차게 앞으로 나아가는 피날레예요.'],
  ['6:04', '포근한 숨결', 'sage', ['피아노', '서정', '따스함'], '편안하게 흐르는 선율이 포근한 숨 쉴 틈을 만들어줘요.'],
  ['3:53', '강인한 행진', 'terracotta', ['피아노', '행진', '대조'], '강인한 리듬과 서정적인 중간부가 인상적인 전주곡이에요.'],
  ['4:33', '맑은 아침', 'mustard', ['피아노', '소나타', '맑은선율'], '가볍고 맑은 선율이 산뜻한 기분을 더해줘요.'],
  ['2:14', '고른 흐름', 'sage', ['피아노', '평균율', '균형'], '차분하게 이어지는 화음이 마음을 고르게 정돈해줘요.'],
  ['4:58', '깊은 노래', 'lavender', ['피아노', '협주곡', '서정'], '천천히 노래하는 듯한 선율이 깊은 온기를 전해줘요.'],
  ['10:07', '넓게 펼친 빛', 'mustard', ['피아노', '소나타', '확장감'], '밝게 열리는 전개 속에 긴장과 활력이 함께 살아 있어요.'],
  ['7:21', '뜨거운 추진력', 'terracotta', ['피아노', '열정', '질주'], '강렬한 리듬이 끝까지 뜨거운 추진력을 이어가요.'],
  ['30:04', '다채로운 축제', 'mustard', ['피아노', '축제', '인물화'], '여러 인물과 장면이 다채롭게 스쳐 가는 피아노 모음곡이에요.'],
  ['27:42', '변덕스런 미소', 'lavender', ['피아노', '서정', '다채로움'], '따뜻함과 쓸쓸함이 경쾌한 표정 사이로 교차해요.'],
]

const addCardDetails = (track, index) => {
  const [duration, miniTag, tone, tags, description] = cardDetails[index]
  return { ...track, duration, miniTag, tone, tags, description }
}

// 사용자가 평가한 초기 추천 데이터입니다. mood와 energy는 추천에 직접 사용됩니다.
export const tracks = [
  { id: 'beethoven-moonlight-1', composer: '베토벤', title: '피아노 소나타 14번 「월광」', movement: '1악장', moods: ['애잔한', '긴장감 있는', '장엄한'], energy: '차분하게' },
  { id: 'beethoven-moonlight-3', composer: '베토벤', title: '피아노 소나타 14번 「월광」', movement: '3악장', moods: ['경쾌한', '긴장감 있는'], energy: '강렬하게' },
  { id: 'chopin-fantaisie-impromptu', composer: '쇼팽', title: '즉흥환상곡 Op. 66', movement: '', moods: ['긴장감 있는', '따뜻한', '경쾌한'], energy: '강렬하게' },
  { id: 'satie-gymnopedie-1', composer: '사티', title: '짐노페디 1번', movement: '', moods: ['편안한', '따뜻한', '몽환적인'], energy: '차분하게' },
  { id: 'liszt-liebestraum-3', composer: '리스트', title: '사랑의 꿈 3번', movement: '', moods: ['몽환적인', '따뜻한', '설레는'], energy: '적당히' },
  { id: 'debussy-clair-de-lune', composer: '드뷔시', title: '베르가마스크 모음곡 3번 「달빛」', movement: '', moods: ['몽환적인', '따뜻한', '편안한'], energy: '적당히' },
  { id: 'mozart-twinkle-variations', composer: '모차르트', title: '작은별 변주곡', movement: '', moods: ['경쾌한', '편안한'], energy: '적당히' },
  { id: 'rachmaninoff-prelude-op3', composer: '라흐마니노프', title: '전주곡 Op. 3 No. 1 「모스크바의 종」', movement: '', moods: ['긴장감 있는', '장엄한'], energy: '강렬하게' },
  { id: 'chopin-nocturne-op9-2', composer: '쇼팽', title: '녹턴 Op. 9 No. 2', movement: '', moods: ['따뜻한', '편안한', '설레는'], energy: '차분하게' },
  { id: 'chopin-sonata-2-1', composer: '쇼팽', title: '피아노 소나타 2번', movement: '1악장', moods: ['긴장감 있는', '경쾌한', '장엄한'], energy: '적당히' },
  { id: 'chopin-sonata-3-4', composer: '쇼팽', title: '피아노 소나타 3번', movement: '4악장', moods: ['경쾌한', '긴장감 있는', '장엄한'], energy: '강렬하게' },
  { id: 'schubert-impromptu-op90-3', composer: '슈베르트', title: '즉흥곡 Op. 90 No. 3', movement: '', moods: ['편안한', '따뜻한'], energy: '차분하게' },
  { id: 'rachmaninoff-prelude-op23-5', composer: '라흐마니노프', title: '전주곡 Op. 23 No. 5', movement: '', moods: ['경쾌한', '장엄한', '애잔한'], energy: '강렬하게' },
  { id: 'mozart-sonata-10-1', composer: '모차르트', title: '피아노 소나타 10번', movement: '1악장', moods: ['편안한', '경쾌한'], energy: '적당히' },
  { id: 'bach-wtc-1-1', composer: '바흐', title: '평균율 모음곡 1권 1번', movement: '', moods: ['따뜻한', '편안한'], energy: '차분하게' },
  { id: 'bach-italian-concerto-2', composer: '바흐', title: '이탈리안 협주곡', movement: '2악장', moods: ['애잔한', '따뜻한'], energy: '차분하게' },
  { id: 'beethoven-waldstein-1', composer: '베토벤', title: '피아노 소나타 21번', movement: '1악장', moods: ['편안한', '경쾌한', '긴장감 있는'], energy: '적당히' },
  { id: 'beethoven-appassionata-3', composer: '베토벤', title: '피아노 소나타 23번 「열정」', movement: '3악장', moods: ['긴장감 있는', '경쾌한', '장엄한'], energy: '강렬하게' },
  { id: 'schumann-carnaval', composer: '슈만', title: '사육제', movement: '', moods: ['경쾌한', '따뜻한', '장엄한'], energy: '적당히' },
  { id: 'schumann-humoreske', composer: '슈만', title: '유모레스크', movement: '', moods: ['따뜻한', '애잔한', '경쾌한'], energy: '적당히' },
].map(addCardDetails)

export const getRecommendedTracks = (trackList, selectedMoods, selectedEnergy) => {
  const allMoodMatches = selectedMoods.length > 0
    ? trackList.filter((track) => selectedMoods.every((mood) => track.moods.includes(mood)))
    : trackList

  const moodCandidates = selectedMoods.length === 0 || allMoodMatches.length > 0
    ? allMoodMatches
    : trackList.filter((track) => selectedMoods.some((mood) => track.moods.includes(mood)))

  return [...moodCandidates].sort((first, second) => {
    const firstEnergyMatches = first.energy === selectedEnergy ? 1 : 0
    const secondEnergyMatches = second.energy === selectedEnergy ? 1 : 0
    return secondEnergyMatches - firstEnergyMatches
  })
}
