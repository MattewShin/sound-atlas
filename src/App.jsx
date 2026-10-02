import { useState } from 'react'

const emotions = [
  '마음을 가라앉히고 싶어요',
  '설레는 밤을 원해요',
  '깊게 몰입하고 싶어요',
  '위로가 필요해요',
  '활력을 얻고 싶어요',
]

const performances = [
  {
    id: 'debussy',
    emotion: emotions[0],
    tag: '고요한 밤',
    title: '달빛 아래의 드뷔시',
    intro: '잔잔한 피아노 선율로 하루의 속도를 천천히 낮춰보세요.',
    date: '10월 12일 · 토요일 · 19:30',
    shortDate: '10월 12일',
    venue: '예술의전당 IBK챔버홀',
    music: '드뷔시 〈달빛〉 · 라벨 〈죽은 왕녀를 위한 파반느〉',
    reason: '말보다 여백이 필요한 저녁에 어울리는 프로그램이에요. 은은하게 번지는 피아노가 마음의 결을 정돈해 줍니다.',
    program: ['드뷔시 〈영상 제1집〉 중 물의 반영', '라벨 〈죽은 왕녀를 위한 파반느〉', '드뷔시 〈달빛〉'],
    gradient: 'moonlight',
    point: { left: '28%', top: '64%' },
  },
  {
    id: 'spring',
    emotion: emotions[1],
    tag: '설렘의 시작',
    title: '봄을 깨우는 오케스트라',
    intro: '가벼운 현의 떨림과 함께, 새로운 계절을 먼저 만나보세요.',
    date: '10월 18일 · 금요일 · 20:00',
    shortDate: '10월 18일',
    venue: '롯데콘서트홀',
    music: '멘델스존 〈한여름 밤의 꿈〉',
    reason: '설레는 약속 전처럼 공기가 조금 들뜨는 날을 위한 무대예요. 반짝이는 목관과 현악이 밤을 환하게 채웁니다.',
    program: ['멘델스존 〈한여름 밤의 꿈〉 서곡', '차이콥스키 〈로코코 주제에 의한 변주곡〉', '슈만 교향곡 1번 〈봄〉'],
    gradient: 'spring',
    point: { left: '72%', top: '34%' },
  },
  {
    id: 'beethoven',
    emotion: emotions[2],
    tag: '집중의 시간',
    title: '베토벤, 운명을 마주하다',
    intro: '한 음 한 음, 가장 선명한 나의 감각으로 들어가는 시간.',
    date: '10월 23일 · 수요일 · 19:30',
    shortDate: '10월 23일',
    venue: '서울아트센터',
    music: '베토벤 교향곡 5번',
    reason: '생각의 중심을 단단히 붙잡고 싶은 날에 추천해요. 압도적인 리듬이 주변의 소음을 밀어내고 몰입을 이끕니다.',
    program: ['베토벤 〈코리올란〉 서곡', '베토벤 피아노 협주곡 4번', '베토벤 교향곡 5번 〈운명〉'],
    gradient: 'fate',
    point: { left: '48%', top: '48%' },
  },
  {
    id: 'cello',
    emotion: emotions[3],
    tag: '다정한 위로',
    title: '새벽의 위로, 첼로',
    intro: '낮고 따뜻한 울림이 오늘의 마음 곁에 오래 머뭅니다.',
    date: '10월 27일 · 일요일 · 17:00',
    shortDate: '10월 27일',
    venue: '세종체임버홀',
    music: '바흐 무반주 첼로 모음곡',
    reason: '누군가의 조용한 곁이 필요한 날, 첼로의 깊은 울림이 든든한 온기가 되어줄 거예요.',
    program: ['바흐 무반주 첼로 모음곡 1번', '브리튼 첼로 모음곡 1번', '카살스 〈새의 노래〉'],
    gradient: 'comfort',
    point: { left: '42%', top: '22%' },
  },
  {
    id: 'firebird',
    emotion: emotions[4],
    tag: '터지는 에너지',
    title: '불꽃의 리듬',
    intro: '심장을 두드리는 관현악의 리듬으로 에너지를 깨워보세요.',
    date: '11월 2일 · 토요일 · 18:00',
    shortDate: '11월 2일',
    venue: '마포아트센터',
    music: '스트라빈스키 〈불새〉',
    reason: '새로운 자극이 필요한 날에 딱 맞아요. 강렬한 박자와 색채가 몸 안의 리듬을 힘차게 깨웁니다.',
    program: ['리게티 〈로마네스크 협주곡〉', '바르톡 〈춤 모음곡〉', '스트라빈스키 〈불새〉 모음곡'],
    gradient: 'fire',
    point: { left: '77%', top: '69%' },
  },
]

function Icon({ name }) {
  const paths = {
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    compass: <><circle cx="12" cy="12" r="8" /><path d="m14.7 9.3-1.8 3.6-3.6 1.8 1.8-3.6 3.6-1.8Z" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
    bookmark: <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 22a8 8 0 0 1 16 0" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function PerformanceCard({ performance, isProgramOpen, onToggleProgram }) {
  return (
    <article className="performance-card" aria-live="polite">
      <div className={`artwork ${performance.gradient}`} aria-label={`${performance.title} 추상 이미지`} role="img">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="staff-lines" />
        <span className="artwork-note">오늘의 무대</span>
      </div>
      <div className="card-content">
        <span className="emotion-tag">{performance.tag}</span>
        <h2>{performance.title}</h2>
        <p className="intro">{performance.intro}</p>
        <dl className="details">
          <div><dt>일시</dt><dd>{performance.date}</dd></div>
          <div><dt>장소</dt><dd>{performance.venue}</dd></div>
          <div><dt>대표곡</dt><dd>{performance.music}</dd></div>
        </dl>
        <div className="reason">
          <span>이 공연이 어울리는 이유</span>
          <p>{performance.reason}</p>
        </div>
        <button className="program-button" type="button" onClick={onToggleProgram} aria-expanded={isProgramOpen}>
          {isProgramOpen ? '프로그램 닫기' : '프로그램 미리 보기'} <Icon name="arrow" />
        </button>
        {isProgramOpen && (
          <ol className="program-list">
            {performance.program.map((piece) => <li key={piece}>{piece}</li>)}
          </ol>
        )}
      </div>
    </article>
  )
}

function App() {
  const [selectedEmotion, setSelectedEmotion] = useState(emotions[0])
  const [selectedId, setSelectedId] = useState(performances[0].id)
  const [isProgramOpen, setIsProgramOpen] = useState(false)
  const selectedPerformance = performances.find((performance) => performance.id === selectedId) ?? performances[0]

  const selectPerformance = (performance) => {
    setSelectedId(performance.id)
    setSelectedEmotion(performance.emotion)
    setIsProgramOpen(false)
  }

  const selectEmotion = (emotion) => {
    const performance = performances.find((item) => item.emotion === emotion)
    setSelectedEmotion(emotion)
    if (performance) selectPerformance(performance)
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="topbar">
          <a className="brand" href="#top" aria-label="Sound Atlas 첫 화면">Sound Atlas</a>
          <button className="icon-button" type="button" aria-label="알림 보기"><Icon name="bell" /></button>
        </div>
        <div className="hero-copy" id="top">
          <p>오늘, 어떤 음악이 필요하세요?</p>
          <h1>지금의 기분에서<br />공연을 찾아보세요.</h1>
        </div>
      </header>

      <main>
        <section className="emotion-section" aria-labelledby="emotion-title">
          <div className="section-heading">
            <p className="eyebrow">MOOD SELECT</p>
            <h2 id="emotion-title">마음의 방향</h2>
          </div>
          <div className="emotion-scroll" role="list" aria-label="감정 선택">
            {emotions.map((emotion) => (
              <button
                className={`emotion-chip ${selectedEmotion === emotion ? 'selected' : ''}`}
                key={emotion}
                onClick={() => selectEmotion(emotion)}
                type="button"
                role="listitem"
                aria-pressed={selectedEmotion === emotion}
              >{emotion}</button>
            ))}
          </div>
        </section>

        <section className="recommendation-section" aria-labelledby="recommendation-title">
          <div className="section-heading inline-heading">
            <div>
              <p className="eyebrow">FOR YOUR MOOD</p>
              <h2 id="recommendation-title">오늘의 추천 공연</h2>
            </div>
            <span className="page-indicator">01 / 05</span>
          </div>
          <PerformanceCard performance={selectedPerformance} isProgramOpen={isProgramOpen} onToggleProgram={() => setIsProgramOpen((value) => !value)} />
        </section>

        <section className="map-section" aria-labelledby="map-title">
          <div className="section-heading inline-heading">
            <div>
              <p className="eyebrow">SEOUL, TODAY</p>
              <h2 id="map-title">오늘 서울의 공연</h2>
            </div>
            <span className="map-hint">점을 눌러보세요</span>
          </div>
          <div className="city-map" role="group" aria-label="서울 공연 위치 지도">
            <div className="map-grid" />
            <div className="river" />
            <span className="district district-north">북촌</span>
            <span className="district district-west">마포</span>
            <span className="district district-center">광화문</span>
            <span className="district district-east">잠실</span>
            {performances.map((performance, index) => (
              <button
                className={`map-point ${selectedId === performance.id ? 'active' : ''}`}
                key={performance.id}
                style={performance.point}
                type="button"
                onClick={() => selectPerformance(performance)}
                aria-label={`${performance.title}, ${performance.venue} 선택`}
                aria-pressed={selectedId === performance.id}
              ><span>{index + 1}</span></button>
            ))}
          </div>
          <button className="map-selection" type="button" onClick={() => setIsProgramOpen(false)}>
            <div><span className="map-selection-label">선택한 공연</span><strong>{selectedPerformance.title}</strong></div>
            <div className="map-selection-meta">{selectedPerformance.venue}<br />{selectedPerformance.shortDate}</div>
          </button>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <a className="nav-item active" href="#top"><Icon name="compass" /><span>발견하기</span></a>
        <a className="nav-item" href="#map-title"><Icon name="map" /><span>공연 지도</span></a>
        <button className="nav-item" type="button"><Icon name="bookmark" /><span>보관함</span></button>
        <button className="nav-item" type="button"><Icon name="user" /><span>내 정보</span></button>
      </nav>
    </div>
  )
}

export default App
