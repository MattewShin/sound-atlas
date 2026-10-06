import React, { useMemo, useState } from 'react'
import { energyOptions, getRecommendedTracks, moodOptions, tracks } from './data/musicData.js'

function Icon({ name, filled = false }) {
  const paths = {
    chevron: <path d="m7 10 5 5 5-5" />,
    bookmark: <path d="M6.5 4.5A2.5 2.5 0 0 1 9 2h6a2.5 2.5 0 0 1 2.5 2.5V22L12 18.5 6.5 22V4.5Z" />,
    play: <path d="m10 8 6 4-6 4V8Z" />,
    compass: <><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-1.9 3.7-3.7 1.9 1.9-3.7 3.7-1.9Z" /></>,
    stage: <><path d="M4 19h16M6 16V5h12v11" /><path d="M9 5v11M15 5v11" /></>,
    bookmarkSmall: <path d="M7 4h10v16l-5-3-5 3V4Z" />,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    piano: <><path d="M4 17V9.5C4 6.5 6.5 4 9.6 4c4 0 5.6 2.4 7.7 4.2H20V17H4Z" /><path d="M7 17v3M17 17v3M4 13h16M9 13v4M12 13v4M15 13v4" /></>,
  }
  return <svg className={filled ? 'filled-icon' : ''} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [energy, setEnergy] = useState('차분하게')
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [savedTrackIds, setSavedTrackIds] = useState([])
  const [selectedMoodIds, setSelectedMoodIds] = useState([])

  const selectedEnergy = energyOptions.find((item) => item.value === energy)
  const recommendedTracks = useMemo(
    () => getRecommendedTracks(tracks, selectedMoodIds, energy),
    [selectedMoodIds, energy],
  )
  const selectedTrack = recommendedTracks.find((track) => track.id === selectedTrackId) ?? recommendedTracks[0]
  const relatedTracks = recommendedTracks.filter((track) => track.id !== selectedTrack.id)
  const matchedMoods = selectedMoodIds.filter((mood) => selectedTrack.moods.includes(mood))

  const selectMood = (mood) => {
    const isSelected = selectedMoodIds.includes(mood)
    if (!isSelected && selectedMoodIds.length === 3) return

    setSelectedMoodIds((moods) => isSelected
      ? moods.filter((selectedMood) => selectedMood !== mood)
      : [...moods, mood])
    setSelectedTrackId(null)
  }
  const selectEnergy = (nextEnergy) => {
    setEnergy(nextEnergy)
    setSelectedTrackId(null)
  }
  const toggleSave = () => setSavedTrackIds((ids) => ids.includes(selectedTrack.id) ? ids.filter((id) => id !== selectedTrack.id) : [...ids, selectedTrack.id])

  return (
    <div className="app-shell">
      <header className="top-header" id="top">
        <div className="topbar">
          <a className="brand" href="#top">SOUND ATLAS</a>
          <button className="location-button" type="button" aria-label="현재 지역 서울">서울 <Icon name="chevron" /></button>
        </div>
        <p className="date-note">10월 첫째 주 · 오늘의 소리 탐색</p>
        <h1>오늘은 어떤 소리를<br />만나고 싶나요?</h1>
        <div className="header-orbit orbit-one" /><div className="header-orbit orbit-two" />
      </header>

      <main>
        <section className="mood-section" aria-labelledby="mood-title">
          <div className="section-heading"><p>MOOD</p><h2 id="mood-title">마음의 결을 골라보세요</h2></div>
          <p className="mood-guide">최대 3개까지 선택할 수 있어요</p>
          <div className="mood-list" role="list" aria-label="감정 선택">
            {moodOptions.map((mood) => (
              <button className={`mood-chip ${selectedMoodIds.includes(mood) ? 'selected' : ''}`} key={mood} type="button" role="listitem" aria-pressed={selectedMoodIds.includes(mood)} disabled={selectedMoodIds.length === 3 && !selectedMoodIds.includes(mood)} onClick={() => selectMood(mood)}>{mood}</button>
            ))}
          </div>
        </section>

        <section className="intensity-section" aria-labelledby="energy-title">
          <div className="section-heading compact-heading"><div><p>ENERGY</p><h2 id="energy-title">얼마나 깊게 느끼고 싶나요?</h2></div><span>{selectedEnergy.description}</span></div>
          <div className="intensity-control" role="group" aria-label="에너지 선택">
            {energyOptions.map((item, index) => (
              <button className={`intensity-option ${item.value === energy ? 'selected' : ''}`} type="button" key={item.value} aria-pressed={item.value === energy} onClick={() => selectEnergy(item.value)}>
                <i className={`intensity-dot dot-${index + 1}`} /><span>{item.value}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="track-section" aria-labelledby="track-title">
          <article className={`featured-track ${selectedTrack.tone}`}>
            <div className="track-card-top"><div className="recommendation-basis"><span>선택한 분위기: {selectedMoodIds.length > 0 ? selectedMoodIds.join(' · ') : '전체'}</span><small>일치한 감정: {matchedMoods.length > 0 ? matchedMoods.join(' · ') : '전체'}</small><small>에너지: {energy}{selectedTrack.energy === energy ? ' · 일치' : ''}</small></div><button type="button" onClick={toggleSave} aria-label={`${selectedTrack.title} 보관함에 저장`} aria-pressed={savedTrackIds.includes(selectedTrack.id)}><Icon name="bookmark" filled={savedTrackIds.includes(selectedTrack.id)} /></button></div>
            <div className="track-disc" aria-hidden="true"><span /></div>
            <div className="track-copy"><p className="track-kicker">오늘의 대표 곡</p><h2 id="track-title">{selectedTrack.title}</h2><p className="composer">{selectedTrack.composer}</p>{selectedTrack.movement && <p className="movement">{selectedTrack.movement}</p>}<p className="track-description">{selectedTrack.description}</p><div className="tag-list">{selectedTrack.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
            <button className="play-button" type="button" aria-label={`${selectedTrack.title} 재생 미리보기`}><Icon name="play" /></button>
          </article>
        </section>

        <section className="similar-section" aria-labelledby="similar-title">
          <div className="section-heading inline-heading"><div><p>MORE TO EXPLORE</p><h2 id="similar-title">비슷한 결의 음악</h2></div><span>옆으로 넘겨보세요</span></div>
          <div className="similar-list">
            {relatedTracks.map((track) => (
              <button className="mini-track" type="button" key={track.id} onClick={() => setSelectedTrackId(track.id)}>
                <span className={`mini-art ${track.tone}`}><i /></span><span className="mini-copy"><b>{track.composer}</b><strong>{track.title}</strong>{track.movement && <em>{track.movement}</em>}<small>{track.duration} · {track.miniTag}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="concert-link" aria-label="관련 공연 안내"><span className="concert-mark"><Icon name="piano" /></span><div><p>이 곡을 무대에서 듣고 싶다면</p><strong>이번 달 서울에서 2개의 관련 공연을 찾았어요 <span>→</span></strong></div></section>
      </main>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <a className="nav-item active" href="#top"><Icon name="compass" /><span>소리 탐색</span></a>
        <button className="nav-item" type="button"><Icon name="stage" /><span>공연 찾기</span></button>
        <button className="nav-item" type="button"><Icon name="bookmarkSmall" /><span>보관함</span></button>
        <button className="nav-item" type="button"><Icon name="user" /><span>내 정보</span></button>
      </nav>
    </div>
  )
}

export default App
