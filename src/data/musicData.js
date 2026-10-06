export const moodOptions = [
  '편안한', '따뜻한', '애잔한', '설레는', '몽환적인', '경쾌한', '장엄한', '긴장감 있는',
]

export const energyOptions = [
  { value: '차분하게', description: '부드러운 결' },
  { value: '적당히', description: '선명한 흐름' },
  { value: '강렬하게', description: '깊고 진한 울림' },
]

const cardDetails = [
  ['약 6분', '고요한 긴장', 'lavender', ['피아노', '밤의여운', '월광'], '고요한 선율 속에 깊은 긴장과 여운이 스며드는 피아노 곡이에요.'],
  ['약 7분', '몰아치는 밤', 'terracotta', ['피아노', '질주', '월광'], '쉼 없이 밀고 나가는 리듬이 선명한 에너지를 전해줘요.'],
  ['약 5분', '빛나는 질주', 'mustard', ['피아노', '화려한리듬', '환상'], '반짝이는 흐름과 서정적인 선율이 함께 펼쳐지는 곡이에요.'],
  ['약 3분', '느슨한 시간', 'sage', ['피아노', '비움', '느린걸음'], '조금 느슨해져도 괜찮다고 말해주는 듯한 담백한 피아노예요.'],
  ['약 5분', '다정한 설렘', 'lavender', ['피아노', '사랑', '꿈결'], '부드럽게 번지는 선율이 따뜻한 설렘을 남겨줘요.'],
  ['약 5분', '은은한 밤', 'lavender', ['피아노', '달빛', '잔향'], '맑은 피아노의 잔향이 바쁜 생각 사이에 작은 여백을 만들어줘요.'],
  ['약 8분', '가벼운 반짝임', 'mustard', ['피아노', '변주', '밝은선율'], '익숙한 선율이 경쾌하고 사랑스럽게 모습을 바꿔가요.'],
  ['약 5분', '울리는 종소리', 'terracotta', ['피아노', '종소리', '장엄함'], '깊고 묵직한 울림이 공간을 가득 채우는 듯한 곡이에요.'],
  ['약 5분', '다정한 밤', 'sage', ['피아노', '노래하는선율', '밤'], '노래하듯 부드러운 피아노가 마음을 다정하게 어루만져요.'],
  ['약 7분', '선명한 대비', 'terracotta', ['피아노', '소나타', '극적인흐름'], '힘 있는 전개와 섬세한 표정이 선명한 대비를 이루어요.'],
  ['약 5분', '찬란한 결말', 'mustard', ['피아노', '피날레', '강한리듬'], '밝고 강한 리듬이 힘차게 앞으로 나아가는 피날레예요.'],
  ['약 6분', '포근한 숨결', 'sage', ['피아노', '서정', '따스함'], '편안하게 흐르는 선율이 포근한 숨 쉴 틈을 만들어줘요.'],
  ['약 4분', '강인한 행진', 'terracotta', ['피아노', '행진', '대조'], '강인한 리듬과 서정적인 중간부가 인상적인 전주곡이에요.'],
  ['약 5분', '맑은 아침', 'mustard', ['피아노', '소나타', '맑은선율'], '가볍고 맑은 선율이 산뜻한 기분을 더해줘요.'],
  ['약 2분', '고른 흐름', 'sage', ['피아노', '평균율', '균형'], '차분하게 이어지는 화음이 마음을 고르게 정돈해줘요.'],
  ['약 5분', '깊은 노래', 'lavender', ['피아노', '협주곡', '서정'], '천천히 노래하는 듯한 선율이 깊은 온기를 전해줘요.'],
  ['약 10분', '넓게 펼친 빛', 'mustard', ['피아노', '소나타', '확장감'], '밝게 열리는 전개 속에 긴장과 활력이 함께 살아 있어요.'],
  ['약 7분', '뜨거운 추진력', 'terracotta', ['피아노', '열정', '질주'], '강렬한 리듬이 끝까지 뜨거운 추진력을 이어가요.'],
  ['약 30분', '다채로운 축제', 'mustard', ['피아노', '축제', '인물화'], '여러 인물과 장면이 다채롭게 스쳐 가는 피아노 모음곡이에요.'],
  ['약 28분', '변덕스런 미소', 'lavender', ['피아노', '서정', '다채로움'], '따뜻함과 쓸쓸함이 경쾌한 표정 사이로 교차해요.'],
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

// 곡 상세 바텀시트용 정보입니다. 없는 항목은 화면에서 곡 데이터 기반 기본 문구로 보완됩니다.
export const trackDetails = {
  'beethoven-moonlight-1': {
    composerImage: '/composers/beethoven-stieler-card-800x600.jpg',
    recommendationReason: '고요하면서도 깊이 가라앉는 흐름이, 생각을 잠시 멈추고 싶은 순간과 잘 어울려요.',
    about: '베토벤의 「월광」 소나타 1악장은 잔잔하게 반복되는 반주 위로 서정적인 선율이 천천히 떠오르는 곡이에요.',
    listeningTip: '조용한 밤이나 하루를 차분히 정리하고 싶은 시간에, 서두르지 않고 선율의 여운을 따라 들어보세요.',
    highlight: {
      title: '고요한 밤에 번지는 잔잔한 파도',
      description: '낮게 반복되는 반주 위로 선율이 천천히 떠오르는 느낌을 따라 들어보세요.',
    },
  },
  'beethoven-moonlight-3': {
    highlight: { title: '어둠을 가르는 빠른 파도', description: '짧고 날카롭게 밀려오는 음형이 점점 커지는 흐름에 귀 기울여 보세요.' },
  },
  'chopin-fantaisie-impromptu': {
    highlight: { title: '반짝이는 손끝의 질주', description: '빠르게 흐르는 음들 사이에서 잠시 고개를 내미는 부드러운 선율을 찾아보세요.' },
  },
  'satie-gymnopedie-1': {
    composerImage: '/composers/satie-card-800x600.jpg',
    recommendationReason: '느슨하고 따뜻한 피아노의 호흡이 마음을 잠시 편안하게 쉬게 해줘요.',
    about: '',
    listeningTip: '잠깐의 휴식이나 가벼운 산책처럼, 속도를 조금 늦추고 싶은 순간에 잘 어울려요.',
    highlight: { title: '천천히 흔들리는 한 걸음', description: '같은 듯 조금씩 달라지는 화음의 결을 따라 느린 걸음으로 들어보세요.' },
  },
  'liszt-liebestraum-3': {
    highlight: { title: '꿈처럼 부드럽게 피어나는 선율', description: '노래하듯 이어지는 오른손 선율이 점점 넓어지는 순간을 느껴보세요.' },
  },
  'debussy-clair-de-lune': {
    highlight: { title: '물결 위에 번지는 달빛', description: '소리가 또렷하기보다 은은하게 번지는 여백과 잔향에 집중해 보세요.' },
  },
  'mozart-twinkle-variations': {
    highlight: { title: '익숙한 별빛의 새로운 표정', description: '작은별 선율이 리듬과 장식에 따라 가볍게 모습을 바꾸는 장면을 따라가 보세요.' },
  },
  'rachmaninoff-prelude-op3': {
    highlight: { title: '멀리서 울려오는 종소리', description: '낮고 무거운 화음이 공간을 넓게 채우는 울림을 느껴보세요.' },
  },
  'chopin-nocturne-op9-2': {
    composerImage: '/composers/chopin-wodzinska-card-800x600.jpg',
    recommendationReason: '',
    about: '',
    listeningTip: '',
    highlight: { title: '한밤중에 건네는 다정한 노래', description: '숨을 고르듯 자유롭게 흔들리는 선율의 끝자락을 천천히 따라 들어보세요.' },
  },
  'chopin-sonata-2-1': {
    highlight: { title: '강한 걸음과 섬세한 숨결', description: '단단한 리듬 사이로 갑자기 부드러워지는 선율의 대비를 느껴보세요.' },
  },
  'chopin-sonata-3-4': {
    highlight: { title: '밝게 치닫는 피날레', description: '가벼운 도약처럼 이어지는 음형이 마지막까지 힘을 얻는 흐름을 들어보세요.' },
  },
  'schubert-impromptu-op90-3': {
    highlight: { title: '고요히 이어지는 노래', description: '한 줄의 긴 선율이 끊기지 않고 이어지는 듯한 호흡을 따라가 보세요.' },
  },
  'rachmaninoff-prelude-op23-5': {
    highlight: { title: '단단한 행진 뒤의 서정', description: '힘 있게 나아가던 리듬이 잠시 노래하듯 부드러워지는 순간을 찾아보세요.' },
  },
  'mozart-sonata-10-1': {
    highlight: { title: '맑은 아침처럼 열리는 시작', description: '가볍게 튀어 오르는 리듬과 투명한 선율의 대화를 들어보세요.' },
  },
  'bach-wtc-1-1': {
    highlight: { title: '차분히 쌓이는 화음의 결', description: '단순한 흐름 속에서 화음이 조금씩 색을 바꾸는 순간에 귀 기울여 보세요.' },
  },
  'bach-italian-concerto-2': {
    highlight: { title: '조용하게 노래하는 중심 선율', description: '화려함을 멈춘 듯한 공간에서 길게 이어지는 선율의 따뜻함을 느껴보세요.' },
  },
  'beethoven-waldstein-1': {
    highlight: { title: '넓은 빛으로 열리는 전개', description: '밝게 튀는 리듬이 점점 더 넓은 공간으로 나아가는 느낌을 따라 들어보세요.' },
  },
  'beethoven-appassionata-3': {
    highlight: { title: '멈추지 않는 뜨거운 추진력', description: '짧은 리듬이 계속 앞으로 밀어붙이는 강한 에너지에 집중해 보세요.' },
  },
  'schumann-carnaval': {
    highlight: { title: '축제 속을 스쳐 가는 여러 얼굴', description: '장면마다 바뀌는 리듬과 표정이 하나의 작은 축제를 만드는 흐름을 즐겨보세요.' },
  },
  'schumann-humoreske': {
    highlight: { title: '웃음과 쓸쓸함이 교차하는 순간', description: '경쾌한 움직임 사이로 문득 스며드는 서정적인 선율을 놓치지 말아보세요.' },
  },
}

const getMoodMatchCount = (track, selectedMoods) => selectedMoods.filter((mood) => track.moods.includes(mood)).length

export const getRecommendationResult = (trackList, selectedMoods, selectedEnergy) => {
  const allMoodMatches = selectedMoods.length > 0
    ? trackList.filter((track) => selectedMoods.every((mood) => track.moods.includes(mood)))
    : trackList

  const moodCandidates = selectedMoods.length === 0 || allMoodMatches.length > 0
    ? allMoodMatches
    : trackList.filter((track) => selectedMoods.some((mood) => track.moods.includes(mood)))

  const energyMatchedSongs = selectedEnergy
    ? moodCandidates.filter((track) => track.energy === selectedEnergy)
    : []
  const finalCandidates = energyMatchedSongs.length > 0 ? energyMatchedSongs : moodCandidates

  const recommendedTracks = finalCandidates
    .map((track, index) => ({ track, index }))
    .sort((first, second) => {
      const moodMatchDifference = getMoodMatchCount(second.track, selectedMoods) - getMoodMatchCount(first.track, selectedMoods)
      if (moodMatchDifference !== 0) return moodMatchDifference

      const firstHasAllMoods = selectedMoods.length > 0 && selectedMoods.every((mood) => first.track.moods.includes(mood))
      const secondHasAllMoods = selectedMoods.length > 0 && selectedMoods.every((mood) => second.track.moods.includes(mood))
      if (firstHasAllMoods !== secondHasAllMoods) return Number(secondHasAllMoods) - Number(firstHasAllMoods)

      return first.index - second.index
    })
    .map(({ track }) => track)

  return {
    tracks: recommendedTracks,
    hasExactEnergyMatch: !selectedEnergy || energyMatchedSongs.length > 0,
    isEnergyFallback: Boolean(selectedEnergy) && energyMatchedSongs.length === 0,
  }
}

export const getRecommendedTracks = (trackList, selectedMoods, selectedEnergy) => (
  getRecommendationResult(trackList, selectedMoods, selectedEnergy).tracks
)
