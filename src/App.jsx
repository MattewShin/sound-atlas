import React, { useEffect, useMemo, useRef, useState } from 'react'
import { energyOptions, getLibraryPreferenceProfile, getRecommendationResult, moodOptions, trackDetails, tracks } from './data/musicData.js'

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

const formatTrackTitle = ({ title, movement }) => {
  if (!movement) return title
  return title.includes('소나타') ? `${title} ${movement}` : `${title} · ${movement}`
}

const STORAGE_KEY = 'classic-atlas-track-reactions-v1'

const readTrackReactions = () => {
  if (typeof window === 'undefined') return {}

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const saveTrackReactions = (reactions) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reactions))
  } catch {
    // 저장 공간 접근이 제한된 환경에서도 상세 화면은 계속 사용할 수 있습니다.
  }
}

const composerImages = {
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

function MiniArtwork({ track }) {
  const imageSrc = composerImages[track.composer]

  return (
    <span className={`mini-art ${track.tone} ${imageSrc ? 'has-composer-image' : ''}`}>
      {imageSrc ? <img src={imageSrc} alt={`${track.composer} 초상`} /> : <i />}
    </span>
  )
}

function TrackDetailSheet({ track, detail, isSaved, selectedMoods, selectedEnergy, isOpen, onClose, onOpenShort, onToggleSave, saveFeedback }) {
  if (!track) return null

  const imageSrc = detail?.composerImage || composerImages[track.composer]
  const matchedMoods = selectedMoods.filter((mood) => track.moods.includes(mood))
  const leadMood = matchedMoods[0] || track.moods[0]
  const energyPhrase = selectedEnergy ? `선택한 ‘${selectedEnergy}’ 에너지와` : `‘${track.energy}’ 에너지와`
  const recommendationReason = detail?.recommendationReason || `지금의 ‘${leadMood}’ 분위기와 ${energyPhrase} 잘 어울리는 곡이에요. 선율이 만들어내는 흐름을 따라 부담 없이 들어보세요.`
  const about = detail?.about || '이 곡의 이야기와 감상 포인트는 차례로 채워갈 예정이에요. 지금은 제목보다 먼저, 선율이 만들어내는 분위기에 집중해 들어보세요.'
  const listeningTip = detail?.listeningTip || `${track.moods.slice(0, 2).join('·')} 분위기가 필요한 순간, ${track.energy === '강렬하게' ? '한 가지에 집중하고 싶은 시간' : '하루를 정리하며 잠시 쉬고 싶은 시간'}에 잘 어울려요.`
  const highlight = detail?.highlight
  const shortPreview = detail?.shortPreview
  const canOpenShort = shortPreview?.provider === 'youtube' && Boolean(shortPreview.videoId)

  return (
    <div className={`track-detail-backdrop ${isOpen ? 'is-open' : ''}`} onClick={(event) => event.target === event.currentTarget && onClose()} aria-hidden={!isOpen}>
      <section className="track-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="track-detail-title">
        <div className="track-detail-top"><span className="track-detail-handle" aria-hidden="true" /><button className="track-detail-close" type="button" onClick={onClose} aria-label="곡 상세 닫기">×</button></div>
        <div className={`track-detail-image ${track.tone}`}>
          {imageSrc ? <img src={imageSrc} alt={`${track.composer} 초상`} /> : <span className="track-detail-image-placeholder" aria-hidden="true">♪</span>}
        </div>
        <div className="track-detail-content">
          <p className="track-detail-composer">{track.composer}</p>
          <h2 id="track-detail-title">{track.title}</h2>
          {track.movement && <p className="track-detail-movement">{track.movement}</p>}
          <div className="track-detail-tags" aria-label="곡 분위기와 에너지">{track.moods.map((mood) => <span key={mood}>#{mood}</span>)}<strong>{track.energy}</strong></div>
          {(track.miniTag || track.duration) && <p className="track-detail-meta">{[track.miniTag, track.duration].filter(Boolean).join(' · ')}</p>}
          <section className="track-detail-section"><h3>당신에게 이 곡을 추천하는 이유</h3><p>{recommendationReason}</p></section>
          <section className="track-detail-section"><h3>이 곡은 어떤 곡인가요?</h3><p>{about}</p></section>
          {highlight && <section className="track-detail-section track-detail-highlight"><h3>감상 하이라이트</h3><div className="track-detail-highlight-card"><strong>{highlight.title}</strong><p>{highlight.description}</p></div></section>}
          <section className="library-save-section" aria-label="보관함에 곡 저장"><p>다시 찾아 듣고 싶은 곡을 보관해보세요.</p><button className={`library-save-button ${isSaved ? 'saved' : ''}`} type="button" aria-pressed={isSaved} onClick={() => onToggleSave(track.id)}>{isSaved ? '✓ 보관됨' : '보관함에 담기'}</button>{saveFeedback && <p className="library-save-feedback" role="status">{saveFeedback}</p>}<div className="concert-preview"><button type="button" disabled aria-disabled="true">공연에서 듣고 싶어요 (예정)</button><p>공연 찾기 기능이 열리면, 이 곡이 포함된 무대를 추천해드릴게요.</p></div></section>
          <section className="track-detail-section"><h3>이럴 때 들어보세요</h3><p>{listeningTip}</p></section>
          {canOpenShort ? <div className="highlight-short-cta"><p>이 곡을 영상으로 만나보세요.</p><button type="button" onClick={() => onOpenShort(track)}>음원 감상하기</button></div> : <div className="track-detail-coming-soon" aria-disabled="true">이 곡의 하이라이트 감상은 준비 중이에요.</div>}
        </div>
      </section>
    </div>
  )
}

function YouTubeShortEmbed({ track, preview }) {
  const [hasVideoError, setHasVideoError] = useState(false)
  const iframeRef = useRef(null)
  const startSeconds = Number.isFinite(preview.startSeconds) ? preview.startSeconds : 0
  const endSeconds = Number.isFinite(preview.endSeconds) ? preview.endSeconds : ''
  const videoId = encodeURIComponent(preview.videoId)
  const playerOrigin = typeof window === 'undefined' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?start=${startSeconds}&end=${endSeconds}&autoplay=0&playsinline=1&rel=0&enablejsapi=1${playerOrigin}`
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}${startSeconds ? `&t=${startSeconds}` : ''}`

  useEffect(() => {
    if (!Number.isFinite(endSeconds)) return undefined

    let hasReachedEnd = false
    const playerTarget = 'https://www.youtube-nocookie.com'
    const sendPlayerCommand = (func, args = []) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), playerTarget)
    }
    const stopAtHighlightEnd = (currentTime) => {
      if (hasReachedEnd || currentTime < endSeconds) return
      hasReachedEnd = true
      sendPlayerCommand('pauseVideo')
      sendPlayerCommand('seekTo', [endSeconds, true])
    }
    const handlePlayerMessage = (event) => {
      if (event.origin !== 'https://www.youtube-nocookie.com' && event.origin !== 'https://www.youtube.com') return

      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (typeof message?.info?.currentTime === 'number') stopAtHighlightEnd(message.info.currentTime)
      } catch {
        // YouTube 외 메시지는 무시합니다.
      }
    }
    const timeCheck = window.setInterval(() => {
      if (!hasReachedEnd) sendPlayerCommand('getCurrentTime')
    }, 400)

    window.addEventListener('message', handlePlayerMessage)
    return () => {
      window.clearInterval(timeCheck)
      window.removeEventListener('message', handlePlayerMessage)
    }
  }, [endSeconds])

  if (hasVideoError) {
    return (
      <div className="highlight-short-fallback" role="status">
        <p>영상을 불러오지 못했어요.</p>
        <a href={watchUrl} target="_blank" rel="noopener">YouTube에서 보기</a>
      </div>
    )
  }

  return (
    <iframe
      src={embedUrl}
      ref={iframeRef}
      title={`${track.composer} ${track.title} 하이라이트 감상`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      onError={() => setHasVideoError(true)}
    />
  )
}

function HighlightShortView({ track, detail, isOpen, onClose }) {
  if (!track) return null

  const preview = detail?.shortPreview
  const isYouTubePreview = preview?.provider === 'youtube' && Boolean(preview.videoId)
  if (!isYouTubePreview) return null

  return (
    <div className={`highlight-short-backdrop ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
      <section className="highlight-short-view" role="dialog" aria-modal="true" aria-labelledby="highlight-short-title">
        <header className="highlight-short-top"><button type="button" onClick={onClose} aria-label="하이라이트 감상 닫기">←</button><h2 id="highlight-short-title">하이라이트 감상</h2><span aria-hidden="true" /></header>
        <div className="highlight-short-video">{isOpen && <YouTubeShortEmbed track={track} preview={preview} />}</div>
        <div className="highlight-short-info"><p>{track.composer}</p><h3>{formatTrackTitle(track)}</h3>{detail?.highlight && <><strong>{detail.highlight.title}</strong><span>{detail.highlight.description}</span></>}{preview.sourceLabel && <small>{preview.sourceLabel}</small>}</div>
        <button className="highlight-short-return" type="button" onClick={onClose}>곡 상세로 돌아가기</button>
      </section>
    </div>
  )
}

function LibraryScreen({ savedTracks, onOpenTrack, onRemoveTrack, onGoExplore }) {
  return (
    <>
      <header className="library-header" id="library-top">
        <p>MY LIBRARY</p>
        <h1>보관함</h1>
        <span>다시 찾아 듣고 싶은 곡을 모아두었어요.</span>
        <strong>{savedTracks.length}곡 보관 중</strong>
      </header>
      <main className="library-main">
        {savedTracks.length > 0 ? (
          <section className="library-list" aria-label="보관한 곡 목록">
            {savedTracks.map((track) => (
              <article className={`saved-track-card ${track.tone}`} key={track.id}>
                <button className="saved-track-open" type="button" onClick={() => onOpenTrack(track)} aria-label={`${formatTrackTitle(track)} 상세 보기`}>
                  <MiniArtwork track={track} />
                  <span className="saved-track-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}</strong><span className="saved-track-tags">{track.moods.map((mood) => <i key={mood}>#{mood}</i>)}</span></span>
                </button>
                <button className="saved-track-remove" type="button" onClick={() => onRemoveTrack(track.id)}>보관 해제</button>
              </article>
            ))}
          </section>
        ) : (
          <section className="library-empty" aria-labelledby="library-empty-title">
            <span aria-hidden="true">♬</span>
            <h2 id="library-empty-title">아직 보관한 곡이 없어요</h2>
            <p>마음에 남는 곡을 발견하면 보관함에 담아보세요.</p>
            <button type="button" onClick={onGoExplore}>음악 탐색으로 가기</button>
          </section>
        )}
      </main>
    </>
  )
}

function ConcertComingScreen({ onGoExplore }) {
  const features = ['내 취향에 맞는 공연 찾기', '공연 프로그램 쉽게 읽기', '곡별 감상 포인트 미리 보기']

  return (
    <>
      <header className="concert-coming-header" id="concert-top">
        <p>COMING SOON</p>
        <h1>공연에서 만나는 클래식</h1>
        <span>내 취향과 연결되는 클래식 공연을 준비하고 있어요.<br />곡을 먼저 발견하고, 나에게 맞는 무대를 찾아보세요.</span>
      </header>
      <main className="concert-coming-main">
        <div className="concert-coming-visual" aria-hidden="true"><i className="concert-coming-light light-one" /><i className="concert-coming-light light-two" /><i className="concert-coming-note note-one">♪</i><i className="concert-coming-note note-two">♫</i><span><Icon name="piano" /></span></div>
        <section className="concert-coming-features" aria-label="준비 중인 공연 기능">
          {features.map((feature, index) => <article key={feature}><i>{index + 1}</i><strong>{feature}</strong><span>준비 중</span></article>)}
        </section>
        <button className="concert-coming-return" type="button" onClick={onGoExplore}>소리 탐색으로 돌아가기</button>
      </main>
    </>
  )
}

const starterTrackIds = [
  'satie-gymnopedie-1',
  'chopin-nocturne-op9-2',
  'debussy-clair-de-lune',
  'mozart-twinkle-variations',
  'bach-wtc-1-1',
]

function App() {
  const [activeView, setActiveView] = useState('explore')
  const [recommendationMode, setRecommendationMode] = useState('mood')
  const [energy, setEnergy] = useState(null)
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [selectedMoodIds, setSelectedMoodIds] = useState([])
  const [detailTrack, setDetailTrack] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [shortTrack, setShortTrack] = useState(null)
  const [isShortOpen, setIsShortOpen] = useState(false)
  const [trackReactions, setTrackReactions] = useState(readTrackReactions)
  const [saveFeedback, setSaveFeedback] = useState(null)
  const detailCloseTimer = useRef(null)
  const shortCloseTimer = useRef(null)
  const saveFeedbackTimer = useRef(null)

  const selectedEnergy = energyOptions.find((item) => item.value === energy)
  const hasMoodOrEnergySelection = selectedMoodIds.length > 0 || energy !== null
  const starterTracks = useMemo(
    () => starterTrackIds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean),
    [],
  )
  const savedTrackIds = useMemo(
    () => Object.keys(trackReactions).filter((trackId) => trackReactions[trackId]?.listenAgain === true),
    [trackReactions],
  )
  const libraryPreference = useMemo(
    () => getLibraryPreferenceProfile(tracks, savedTrackIds),
    [savedTrackIds],
  )
  const canUseLibraryRecommendation = libraryPreference.isActive
  const isLibraryRecommendationMode = recommendationMode === 'library' && canUseLibraryRecommendation
  const isInitialExploration = !isLibraryRecommendationMode && !hasMoodOrEnergySelection
  const recommendation = useMemo(
    () => getRecommendationResult(tracks, selectedMoodIds, energy, isLibraryRecommendationMode ? libraryPreference : null),
    [selectedMoodIds, energy, isLibraryRecommendationMode, libraryPreference],
  )
  const recommendedTracks = recommendation.tracks
  const visibleTracks = isInitialExploration ? starterTracks : recommendedTracks
  const selectedTrack = visibleTracks.find((track) => track.id === selectedTrackId) ?? visibleTracks[0]
  const relatedTracks = recommendedTracks.filter((track) => track.id !== selectedTrack.id)
  const matchedMoods = selectedMoodIds.filter((mood) => selectedTrack.moods.includes(mood))
  const savedTracks = useMemo(() => tracks
    .filter((track) => trackReactions[track.id]?.listenAgain === true)
    .sort((first, second) => {
      const firstUpdatedAt = Date.parse(trackReactions[first.id]?.updatedAt) || 0
      const secondUpdatedAt = Date.parse(trackReactions[second.id]?.updatedAt) || 0
      return secondUpdatedAt - firstUpdatedAt
    }), [trackReactions])
  const personalizationMessage = useMemo(() => {
    if (!isLibraryRecommendationMode || !recommendation.isPersonalized) return null

    const topMood = libraryPreference.topMoods.length === 1 ? libraryPreference.topMoods[0] : null
    if (topMood && selectedMoodIds.includes(topMood)) return `보관한 곡에서 ‘${topMood}’ 분위기를 자주 선택했어요.`

    const topEnergy = libraryPreference.topEnergies.length === 1 ? libraryPreference.topEnergies[0] : null
    if (topEnergy && energy === topEnergy) return `‘${topEnergy}’ 에너지의 곡을 보관한 취향을 함께 반영했어요.`

    return '보관한 곡의 분위기를 함께 반영했어요.'
  }, [energy, isLibraryRecommendationMode, libraryPreference, recommendation.isPersonalized, selectedMoodIds])

  const selectMood = (mood) => {
    const isSelected = selectedMoodIds.includes(mood)
    if (!isSelected && selectedMoodIds.length === 3) return

    setSelectedMoodIds((moods) => isSelected
      ? moods.filter((selectedMood) => selectedMood !== mood)
      : [...moods, mood])
    setRecommendationMode('mood')
    setSelectedTrackId(null)
  }
  const selectEnergy = (nextEnergy) => {
    setEnergy((currentEnergy) => currentEnergy === nextEnergy ? null : nextEnergy)
    setRecommendationMode('mood')
    setSelectedTrackId(null)
  }
  const openTrackDetail = (track) => {
    window.clearTimeout(detailCloseTimer.current)
    setSelectedTrackId(track.id)
    setDetailTrack(track)
    window.requestAnimationFrame(() => setIsDetailOpen(true))
  }
  const closeTrackDetail = () => {
    setIsDetailOpen(false)
    detailCloseTimer.current = window.setTimeout(() => setDetailTrack(null), 240)
  }
  const openHighlightShort = (track) => {
    window.clearTimeout(shortCloseTimer.current)
    setShortTrack(track)
    window.requestAnimationFrame(() => setIsShortOpen(true))
  }
  const closeHighlightShort = () => {
    setIsShortOpen(false)
    shortCloseTimer.current = window.setTimeout(() => setShortTrack(null), 240)
  }
  const toggleTrackSave = (trackId) => {
    const currentTrackReactions = trackReactions[trackId] || {}
    const isSaved = !currentTrackReactions.listenAgain
    const nextReactions = {
      ...trackReactions,
      [trackId]: {
        ...currentTrackReactions,
        listenAgain: isSaved,
        updatedAt: new Date().toISOString(),
      },
    }

    setTrackReactions(nextReactions)
    saveTrackReactions(nextReactions)
    setSaveFeedback({ trackId, message: isSaved ? '보관함에 담았어요.' : '보관을 해제했어요.' })
    window.clearTimeout(saveFeedbackTimer.current)
    saveFeedbackTimer.current = window.setTimeout(() => setSaveFeedback(null), 1800)
  }
  const startWith = (mood, nextEnergy) => {
    setSelectedMoodIds([mood])
    setEnergy(nextEnergy)
    setRecommendationMode('mood')
    setSelectedTrackId(null)
  }
  const isTrackSaved = (trackId) => trackReactions[trackId]?.listenAgain === true

  useEffect(() => {
    if (!isDetailOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !isShortOpen) closeTrackDetail()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isDetailOpen, isShortOpen])

  useEffect(() => {
    if (!isShortOpen) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeHighlightShort()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isShortOpen])

  useEffect(() => {
    if (recommendationMode === 'library' && !canUseLibraryRecommendation) setRecommendationMode('mood')
  }, [canUseLibraryRecommendation, recommendationMode])

  useEffect(() => () => {
    window.clearTimeout(detailCloseTimer.current)
    window.clearTimeout(shortCloseTimer.current)
    window.clearTimeout(saveFeedbackTimer.current)
  }, [])

  return (
    <div className="app-shell">
      {activeView === 'explore' ? <>
      <header className="top-header" id="top">
        <div className="topbar">
          <a className="brand" href="#top">CLASSIC ATLAS</a>
          <button className="location-button" type="button" aria-label="현재 지역 서울">서울 <Icon name="chevron" /></button>
        </div>
        <p className="date-note">10월 첫째 주 · 오늘의 음악 탐색</p>
        <h1>오늘은 어떤 음악을<br />만나고 싶나요?</h1>
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
          <div className="section-heading compact-heading"><div><p>ENERGY</p><h2 id="energy-title">얼마나 깊게 느끼고 싶나요?</h2></div><span>{selectedEnergy?.description ?? '원하는 에너지를 골라보세요'}</span></div>
          <div className="intensity-control" role="group" aria-label="에너지 선택">
            {energyOptions.map((item, index) => (
              <button className={`intensity-option ${item.value === energy ? 'selected' : ''}`} type="button" key={item.value} aria-pressed={item.value === energy} onClick={() => selectEnergy(item.value)}>
                <i className={`intensity-dot dot-${index + 1}`} /><span>{item.value}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="track-section" aria-labelledby="recommendation-title">
          <div className="section-heading recommendation-heading"><p>{isInitialExploration ? 'START HERE' : 'FOR YOU'}</p><h2 id="recommendation-title">{isInitialExploration ? '어떤 음악이 끌리나요?' : isLibraryRecommendationMode ? '내 취향 추천' : '지금의 추천'}</h2>{isInitialExploration && <span>지금의 기분과 강도를 선택하면 어울리는 곡을 찾아드릴게요.</span>}</div>
          <div className="recommendation-mode-control" role="group" aria-label="추천 방식 선택"><button className={recommendationMode === 'mood' || !canUseLibraryRecommendation ? 'selected' : ''} type="button" aria-pressed={recommendationMode === 'mood' || !canUseLibraryRecommendation} onClick={() => setRecommendationMode('mood')}>지금의 기분</button><button className={isLibraryRecommendationMode ? 'selected' : ''} type="button" aria-pressed={isLibraryRecommendationMode} disabled={!canUseLibraryRecommendation} onClick={() => setRecommendationMode('library')}>내 취향</button></div>
          {!canUseLibraryRecommendation && <p className="recommendation-mode-guide">보관함에 3곡 이상 담으면 내 취향 추천을 볼 수 있어요.</p>}
          {isInitialExploration ? <>
            <p className="starter-label">처음 듣기 좋은 곡</p>
            <div className="similar-list starter-carousel">
              {starterTracks.map((track) => (
                <button className="mini-track" type="button" key={track.id} onClick={() => openTrackDetail(track)}>
                  <MiniArtwork track={track} /><span className="mini-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}</strong></span>
                </button>
              ))}
            </div>
            <div className="quick-start" aria-label="빠른 시작">
              <button type="button" onClick={() => startWith('편안한', '차분하게')}>편안하게 시작하기</button>
              <button type="button" onClick={() => startWith('설레는', '적당히')}>조금 설레는 음악</button>
              <button type="button" onClick={() => startWith('긴장감 있는', '강렬하게')}>강렬하게 몰입하기</button>
            </div>
          </> : <article className={`featured-track ${selectedTrack.tone}`} role="button" tabIndex="0" aria-label={`${formatTrackTitle(selectedTrack)} 상세 보기`} onClick={() => openTrackDetail(selectedTrack)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openTrackDetail(selectedTrack) } }}>
            <div className="track-card-top"><div className="recommendation-basis">{recommendation.isPersonalized && <small className="library-recommendation-label">보관함 기반 추천</small>}<span>선택한 분위기: {selectedMoodIds.length > 0 ? selectedMoodIds.join(' · ') : '전체'}</span><small>일치한 감정: {matchedMoods.length > 0 ? matchedMoods.join(' · ') : '전체'}</small>{energy && <small>에너지: {energy}{selectedTrack.energy === energy ? ' · 일치' : ''}</small>}{recommendation.isEnergyFallback && <small className="energy-fallback-notice">선택한 에너지와 정확히 일치하는 곡은 없어요. 비슷한 분위기의 곡을 보여드릴게요.</small>}{personalizationMessage && <small className="library-recommendation-note">{personalizationMessage}</small>}</div><button type="button" onClick={(event) => { event.stopPropagation(); toggleTrackSave(selectedTrack.id) }} aria-label={`${formatTrackTitle(selectedTrack)} ${isTrackSaved(selectedTrack.id) ? '보관 해제' : '보관함에 담기'}`} aria-pressed={isTrackSaved(selectedTrack.id)}><Icon name="bookmark" filled={isTrackSaved(selectedTrack.id)} /></button></div>
            <div className="track-disc" aria-hidden="true"><span /></div>
            <div className="track-copy"><p className="track-kicker">오늘의 대표 곡</p><p className="composer">{selectedTrack.composer}</p><h2>{formatTrackTitle(selectedTrack)}</h2><p className="track-description">{selectedTrack.description}</p><div className="tag-list">{selectedTrack.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
            <button className="play-button" type="button" onClick={(event) => event.stopPropagation()} aria-label={`${formatTrackTitle(selectedTrack)} 재생 미리보기`}><Icon name="play" /></button>
          </article>}
        </section>

        {!isInitialExploration && <section className="similar-section" aria-labelledby="similar-title">
          <div className="section-heading inline-heading"><div><p>MORE TO EXPLORE</p><h2 id="similar-title">비슷한 결의 음악</h2></div><span>옆으로 넘겨보세요</span></div>
          <div className="similar-list">
            {relatedTracks.map((track) => (
              <button className="mini-track" type="button" key={track.id} onClick={() => openTrackDetail(track)}>
                <MiniArtwork track={track} /><span className="mini-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}</strong><small>{track.miniTag}</small></span>
              </button>
            ))}
          </div>
        </section>}

        <section className="concert-link" aria-label="관련 공연 안내"><span className="concert-mark"><Icon name="piano" /></span><div><p>이 곡을 무대에서 듣고 싶다면</p><strong>이번 달 서울에서 2개의 관련 공연을 찾았어요 <span>→</span></strong></div></section>
      </main>
      </> : activeView === 'concert' ? <ConcertComingScreen onGoExplore={() => setActiveView('explore')} /> : <LibraryScreen savedTracks={savedTracks} onOpenTrack={openTrackDetail} onRemoveTrack={toggleTrackSave} onGoExplore={() => setActiveView('explore')} />}

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <button className={`nav-item ${activeView === 'explore' ? 'active' : ''}`} type="button" onClick={() => setActiveView('explore')}><Icon name="compass" /><span>음악 탐색</span></button>
        <button className={`nav-item ${activeView === 'concert' ? 'active' : ''}`} type="button" onClick={() => setActiveView('concert')}><Icon name="stage" /><span>공연 찾기</span></button>
        <button className={`nav-item ${activeView === 'library' ? 'active' : ''}`} type="button" onClick={() => setActiveView('library')}><Icon name="bookmarkSmall" /><span>보관함</span></button>
        <button className="nav-item" type="button"><Icon name="user" /><span>내 정보</span></button>
      </nav>
      <TrackDetailSheet track={detailTrack} detail={detailTrack ? trackDetails[detailTrack.id] : null} isSaved={detailTrack ? isTrackSaved(detailTrack.id) : false} selectedMoods={selectedMoodIds} selectedEnergy={energy} isOpen={isDetailOpen} onClose={closeTrackDetail} onOpenShort={openHighlightShort} onToggleSave={toggleTrackSave} saveFeedback={saveFeedback?.trackId && saveFeedback.trackId === detailTrack?.id ? saveFeedback.message : null} />
      <HighlightShortView track={shortTrack} detail={shortTrack ? trackDetails[shortTrack.id] : null} isOpen={isShortOpen} onClose={closeHighlightShort} />
    </div>
  )
}

export default App
