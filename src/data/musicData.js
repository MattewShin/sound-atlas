export const moodOptions = [
  { id: 'quiet', label: '고요한' },
  { id: 'comfort', label: '위로받는' },
  { id: 'excited', label: '설레는' },
  { id: 'focus', label: '깊이 몰입하는' },
  { id: 'awe', label: '벅차오르는' },
  { id: 'energy', label: '활력 있는' },
]

export const intensityOptions = [
  { id: 'gentle', label: '잔잔하게', description: '부드러운 결' },
  { id: 'balanced', label: '적당히', description: '선명한 흐름' },
  { id: 'intense', label: '강렬하게', description: '깊고 진한 울림' },
]

export const tracks = [
  { id: 'debussy', title: '드뷔시 〈달빛〉', composer: 'Claude Debussy', duration: '5:04', miniTag: '은은한 밤', mapLabel: 'D', tone: 'lavender', moods: ['quiet', 'focus'], intensities: ['gentle'], tags: ['느린호흡', '피아노', '달빛'], description: '맑은 피아노의 잔향이 바쁜 생각 사이에 작은 여백을 만들어주는 곡이에요.' },
  { id: 'ravel', title: '라벨 〈죽은 왕녀를 위한 파반느〉', composer: 'Maurice Ravel', duration: '6:17', miniTag: '고요한 품격', mapLabel: 'R', tone: 'mustard', moods: ['quiet', 'awe'], intensities: ['balanced'], tags: ['여린울림', '관현악', '파반느'], description: '천천히 흐르는 선율이 낯선 그리움까지도 우아하게 감싸 안아줍니다.' },
  { id: 'bach', title: '바흐 〈무반주 첼로 모음곡 1번〉', composer: 'J. S. Bach', duration: '2:35', miniTag: '따뜻한 결', mapLabel: 'B', tone: 'sage', moods: ['comfort', 'focus'], intensities: ['balanced'], tags: ['첼로', '단단한위로', '나무결'], description: '한 대의 첼로가 만들어내는 단단한 온기가 마음의 중심을 조용히 붙들어줘요.' },
  { id: 'beethoven', title: '베토벤 〈교향곡 5번〉', composer: 'Ludwig van Beethoven', duration: '7:24', miniTag: '압도적인 리듬', mapLabel: 'B5', tone: 'terracotta', moods: ['focus', 'energy'], intensities: ['intense'], tags: ['운명', '강한리듬', '오케스트라'], description: '선명하게 밀고 나가는 리듬이 마음속 망설임을 한 걸음 앞으로 이끌어줍니다.' },
  { id: 'mendelssohn', title: '멘델스존 〈한여름 밤의 꿈〉', composer: 'Felix Mendelssohn', duration: '5:42', miniTag: '반짝이는 시작', mapLabel: 'M', tone: 'lavender', moods: ['excited', 'energy'], intensities: ['gentle', 'balanced'], tags: ['가벼운설렘', '목관', '환상'], description: '투명하게 빛나는 선율이 시작을 앞둔 마음을 기분 좋게 흔들어 깨워요.' },
  { id: 'tchaikovsky', title: '차이콥스키 〈호두까기 인형〉', composer: 'Pyotr Ilyich Tchaikovsky', duration: '3:12', miniTag: '동화 같은', mapLabel: 'T', tone: 'mustard', moods: ['excited', 'awe'], intensities: ['gentle', 'balanced'], tags: ['반짝임', '춤곡', '겨울밤'], description: '작은 종소리처럼 반짝이는 관현악이 일상에 동화 같은 색을 더해줍니다.' },
  { id: 'chopin', title: '쇼팽 〈녹턴 Op. 9 No. 2〉', composer: 'Frédéric Chopin', duration: '4:31', miniTag: '다정한 밤', mapLabel: 'C', tone: 'terracotta', moods: ['comfort', 'excited'], intensities: ['gentle'], tags: ['노래하는피아노', '다정함', '밤'], description: '노래하듯 부드러운 피아노가 말로 다 하지 못한 마음을 다정하게 어루만져요.' },
  { id: 'satie', title: '사티 〈짐노페디 1번〉', composer: 'Erik Satie', duration: '3:18', miniTag: '느슨한 시간', mapLabel: 'S', tone: 'sage', moods: ['quiet', 'comfort'], intensities: ['balanced'], tags: ['비움', '느린걸음', '피아노'], description: '조금 느슨해져도 괜찮다고 말해주는 듯한, 담백하고 조용한 피아노예요.' },
  { id: 'mahler', title: '말러 교향곡 5번 · 아다지에토', composer: 'Gustav Mahler', duration: '9:48', miniTag: '깊은 여운', mapLabel: 'M5', tone: 'lavender', moods: ['quiet', 'comfort', 'focus'], intensities: ['intense'], tags: ['느린호흡', '현악', '깊은여운'], description: '말없이 가라앉는 현악의 흐름이, 조용히 감정을 꺼내 보게 하는 곡이에요.' },
  { id: 'rachmaninoff', title: '라흐마니노프 〈보칼리제〉', composer: 'Sergei Rachmaninoff', duration: '6:02', miniTag: '포근한 위로', mapLabel: 'V', tone: 'sage', moods: ['comfort', 'awe'], intensities: ['balanced'], tags: ['긴호흡', '서정', '포근함'], description: '목소리 없이도 노래처럼 다가오는 선율이 마음 가장자리를 포근하게 감싸요.' },
  { id: 'dvorak', title: '드보르자크 〈신세계 교향곡〉', composer: 'Antonín Dvořák', duration: '11:12', miniTag: '넓어지는 마음', mapLabel: 'N', tone: 'mustard', moods: ['awe', 'energy', 'excited'], intensities: ['balanced', 'intense'], tags: ['넓은풍경', '금관', '새로운길'], description: '멀리 열리는 풍경처럼, 지금의 마음보다 조금 더 큰 곳으로 데려가는 음악입니다.' },
  { id: 'stravinsky', title: '스트라빈스키 〈불새〉', composer: 'Igor Stravinsky', duration: '10:45', miniTag: '타오르는 에너지', mapLabel: 'F', tone: 'terracotta', moods: ['energy', 'awe'], intensities: ['intense'], tags: ['불꽃', '리듬', '변화'], description: '점점 타오르는 리듬과 색채가 잠들어 있던 에너지를 강하게 일깨워줍니다.' },
]

export const discoveryMatches = [
  { moodId: 'quiet', intensityId: 'gentle', trackId: 'debussy', nearbyTrackIds: ['satie', 'ravel', 'chopin'], affinity: 91 },
  { moodId: 'quiet', intensityId: 'balanced', trackId: 'satie', nearbyTrackIds: ['ravel', 'debussy', 'rachmaninoff'], affinity: 88 },
  { moodId: 'quiet', intensityId: 'intense', trackId: 'mahler', nearbyTrackIds: ['bach', 'ravel', 'debussy'], affinity: 86 },
  { moodId: 'comfort', intensityId: 'gentle', trackId: 'chopin', nearbyTrackIds: ['debussy', 'satie', 'rachmaninoff'], affinity: 92 },
  { moodId: 'comfort', intensityId: 'balanced', trackId: 'rachmaninoff', nearbyTrackIds: ['bach', 'satie', 'ravel'], affinity: 89 },
  { moodId: 'comfort', intensityId: 'intense', trackId: 'mahler', nearbyTrackIds: ['bach', 'rachmaninoff', 'chopin'], affinity: 87 },
  { moodId: 'excited', intensityId: 'gentle', trackId: 'tchaikovsky', nearbyTrackIds: ['mendelssohn', 'chopin', 'debussy'], affinity: 90 },
  { moodId: 'excited', intensityId: 'balanced', trackId: 'mendelssohn', nearbyTrackIds: ['tchaikovsky', 'dvorak', 'ravel'], affinity: 88 },
  { moodId: 'excited', intensityId: 'intense', trackId: 'dvorak', nearbyTrackIds: ['beethoven', 'stravinsky', 'mendelssohn'], affinity: 84 },
  { moodId: 'focus', intensityId: 'gentle', trackId: 'debussy', nearbyTrackIds: ['bach', 'satie', 'ravel'], affinity: 87 },
  { moodId: 'focus', intensityId: 'balanced', trackId: 'bach', nearbyTrackIds: ['ravel', 'mahler', 'satie'], affinity: 91 },
  { moodId: 'focus', intensityId: 'intense', trackId: 'beethoven', nearbyTrackIds: ['mahler', 'dvorak', 'stravinsky'], affinity: 90 },
  { moodId: 'awe', intensityId: 'gentle', trackId: 'ravel', nearbyTrackIds: ['tchaikovsky', 'debussy', 'rachmaninoff'], affinity: 86 },
  { moodId: 'awe', intensityId: 'balanced', trackId: 'tchaikovsky', nearbyTrackIds: ['dvorak', 'rachmaninoff', 'mendelssohn'], affinity: 89 },
  { moodId: 'awe', intensityId: 'intense', trackId: 'stravinsky', nearbyTrackIds: ['dvorak', 'beethoven', 'mahler'], affinity: 92 },
  { moodId: 'energy', intensityId: 'gentle', trackId: 'mendelssohn', nearbyTrackIds: ['tchaikovsky', 'dvorak', 'chopin'], affinity: 85 },
  { moodId: 'energy', intensityId: 'balanced', trackId: 'dvorak', nearbyTrackIds: ['mendelssohn', 'beethoven', 'tchaikovsky'], affinity: 89 },
  { moodId: 'energy', intensityId: 'intense', trackId: 'stravinsky', nearbyTrackIds: ['beethoven', 'dvorak', 'mahler'], affinity: 93 },
]
