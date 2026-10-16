import React, { useEffect, useMemo, useRef, useState } from 'react'
import { composerImages, trackDetails, tracks } from './data/musicData.js'
import { emotionLabel, emotions, formatTrackTitle, getRepresentativeEmotions } from './data/emotions.js'
import { getDiversifiedKeywordRecommendations, getKeywordMetrics, getLibraryPreferenceProfile, getLibraryRecommendations, getRecommendationResult, pickRandomKeywordRecommendation, pickRandomFeelingRecommendation } from './data/recommendations.js'
import { readRecommendationExposures, recordRecommendationExposures } from './data/recommendationExposure.js'
import { feelingOptions, getSuggestedEmotions } from './data/feelingSuggestions.js'
import { readConcertRegion, saveConcertRegion } from './data/concertRegions.js'
import { ConcertScreen, ConcertDetailScreen } from './components/ConcertScreens.jsx'
import { concerts } from './data/concerts.js'
import { analyzeConcert, getConcertRecommendations } from './data/concertRecommendations.js'
import { mergeSearchConcerts } from './data/concertSearch.js'
import { getInitialConcertPeriod } from './data/concertSearchConfig.js'
import useConcertSearch from './components/useConcertSearch.js'
export { ConcertScreen, ConcertCard, ConcertMovement, ConcertDetailScreen } from './components/ConcertScreens.jsx'
import { getInitialMusicState, saveMusicValue, STORAGE_KEY, SELECTION_KEY, NOTICE_KEY } from './data/storage.js'
import { weeklySelections } from './data/weeklySelections.js'
import { getKoreanDate, getWeeklySelectionState } from './data/weeklySelectionHelpers.js'
import { WeeklySelectionSection, WeeklySelectionScreen, WeeklyArchiveScreen } from './components/WeeklySelectionScreens.jsx'
import useHomeDiscovery from './components/useHomeDiscovery.js'
export { WeeklySelectionSection, WeeklySelectionScreen, WeeklyArchiveScreen } from './components/WeeklySelectionScreens.jsx'

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

const describeRecommendationMatch = (track, selectedKeys) => {
  const matched = selectedKeys.filter((key) => track.emotionScores?.[key] >= 3)
  const metrics = getKeywordMetrics(track, selectedKeys)
  if (selectedKeys.length > 1 && metrics?.minimum >= 3) return `${selectedKeys.map(emotionLabel).join(' · ')} 감정이 고르게 어울리는 곡`
  if (matched.length && metrics?.dominance >= 0.75) return `선택한 ${matched.map(emotionLabel).join(' · ')} 감정이 특히 두드러지는 곡`
  return matched.length ? `${matched.map(emotionLabel).join(' · ')} 감정과 잘 맞는 곡` : '보관한 곡과 감정 성향이 비슷한 곡'
}

function TrackAlias({ track }) {
  return track.alias ? <span className="track-alias">{' '}[{track.alias}]</span> : null
}

function MiniArtwork({ track }) {
  const imageSrc = composerImages[track.composer]

  return (
    <span className={`mini-art ${track.tone} ${imageSrc ? 'has-composer-image' : ''}`}>
      {imageSrc ? <img src={imageSrc} alt={`${track.composer} 초상`} /> : <i />}
    </span>
  )
}

function MiniTrackCard({ track, onOpenTrack }) {
  return <button className="mini-track" data-track-id={track.id} type="button" onClick={() => onOpenTrack(track)}>
    <MiniArtwork track={track} /><span className="mini-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}<TrackAlias track={track} /></strong><small>{track.tags.join(' · ')}</small></span>
  </button>
}

export function RelatedRecommendations({ relatedTracks, onOpenTrack, onSeeAll }) {
  if (!relatedTracks.length) return null
  return <section className="similar-section" aria-labelledby="similar-title">
    <div className="section-heading inline-heading"><div><p>MORE TO EXPLORE</p><h2 id="similar-title">비슷한 결의 음악</h2></div><span>옆으로 넘겨보세요</span></div>
    <div className="similar-list">{relatedTracks.slice(0, 8).map((track) => <MiniTrackCard key={track.id} track={track} onOpenTrack={onOpenTrack} />)}</div>
    <button className="recommendations-see-all" type="button" onClick={onSeeAll}>추천곡 더 보기 <span aria-hidden="true">→</span></button>
  </section>
}

export function RecommendationListScreen({ recommendedTracks, selectedKeys = [], isLibraryMode = false, visibleCount = 20, onLoadMore, onBack, onOpenTrack, isTrackSaved, onToggleSave }) {
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])
  const visibleTracks = recommendedTracks.slice(0, visibleCount)
  const hasMore = visibleTracks.length < recommendedTracks.length
  return <>
    <header className="library-header recommendation-list-header">
      <button className="recommendation-back" type="button" onClick={onBack}>← 음악 탐색으로</button>
      <p>FOR YOU</p><h1 ref={headingRef} tabIndex={-1}>전체 추천곡</h1>
      <span>{isLibraryMode ? '보관한 곡과 비슷한 음악을 모았어요.' : selectedKeys.map(emotionLabel).join(' · ')}</span>
      <strong>총 {recommendedTracks.length}곡</strong>
    </header>
    <main className="library-main recommendation-list-main">
      {visibleTracks.length ? <>
        <ol className="recommendation-list" aria-label="전체 추천곡 목록">
          {visibleTracks.map((track, index) => <li className="recommendation-list-card" key={track.id}>
            <button className="saved-track-open recommendation-track-open" type="button" onClick={() => onOpenTrack(track)}>
              <span className="recommendation-rank" aria-hidden="true">{index + 1}</span><MiniArtwork track={track} />
              <span className="saved-track-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}<TrackAlias track={track} /></strong><span className="saved-track-tags">{track.tags.map((tag) => <i key={tag}>#{tag}</i>)}</span></span>
            </button>
            <button className="recommendation-save" type="button" aria-label={`${formatTrackTitle(track)} ${isTrackSaved?.(track.id) ? '보관 해제' : '보관함에 담기'}`} aria-pressed={Boolean(isTrackSaved?.(track.id))} onClick={() => onToggleSave(track.id)}><Icon name="bookmark" filled={isTrackSaved?.(track.id)} /></button>
          </li>)}
        </ol>
        <p className="recommendation-list-count" role="status">{recommendedTracks.length}곡 중 {visibleTracks.length}곡 표시</p>
        {hasMore ? <button className="recommendations-load-more" type="button" onClick={onLoadMore}>더 불러오기 <span>다음 {Math.min(20, recommendedTracks.length - visibleTracks.length)}곡</span></button> : <p className="recommendation-list-end">추천곡을 모두 확인했어요.</p>}
      </> : <section className="library-empty"><h2>추천할 곡이 아직 없어요</h2><p>음악 탐색에서 다른 느낌을 골라보세요.</p><button type="button" onClick={onBack}>음악 탐색으로 돌아가기</button></section>}
    </main>
  </>
}

export function TrackDetailSheet({ track, detail, isSaved, selectedKeys, isOpen, onClose, onOpenShort, onToggleSave, saveFeedback, onFindTrackConcert, onGoLibrary }) {
  if (!track) return null

  const imageSrc = detail?.composerImage || composerImages[track.composer]
  const keywords = getRepresentativeEmotions(track)
  const matched = selectedKeys.filter((key) => track.emotionScores?.[key] >= 3)
  const recommendationReason = matched.length
    ? `선택한 ‘${matched.map(emotionLabel).join('·')}’ 감정이 분명하게 느껴진다고 평가된 곡이에요.`
    : '아홉 가지 감정에 대한 사용자의 수동 평가를 참고해 선율의 흐름을 따라 들어보세요.'
  const about = detail?.about || '이 곡의 이야기와 감상 포인트는 차례로 채워갈 예정이에요. 지금은 제목보다 먼저, 선율이 만들어내는 분위기에 집중해 들어보세요.'
  const listeningTip = detail?.listeningTip || '곡 전체의 흐름을 따라 나에게 어떤 느낌이 남는지 들어보세요.'
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
          <h2 id="track-detail-title">{formatTrackTitle(track)}<TrackAlias track={track} /></h2>
          {track.summary && <p className="track-detail-summary">{track.summary}</p>}
          <div className="track-detail-tags" aria-label="대표 감정">{keywords.map(({ key, label }) => <span key={key}>#{label}</span>)}</div>
          {(track.miniTag || track.duration) && <p className="track-detail-meta">{[track.miniTag, track.duration].filter(Boolean).join(' · ')}</p>}
          <section className="track-detail-section"><h3>당신에게 이 곡을 추천하는 이유</h3><p>{recommendationReason}</p></section>
          <section className="track-detail-section"><h3>이 곡은 어떤 곡인가요?</h3><p>{about}</p></section>
          <section className="track-detail-section"><h3>감상 포인트</h3><p>{listeningTip}</p></section>
          {highlight && <section className="track-detail-section track-detail-highlight"><h3>감상 하이라이트</h3><div className="track-detail-highlight-card"><strong>{highlight.title}</strong><p>{highlight.description}</p></div></section>}
          <section className="library-save-section" aria-label="보관함에 곡 저장"><p>다시 찾아 듣고 싶은 곡을 보관해보세요.</p><button className={`library-save-button ${isSaved ? 'saved' : ''}`} type="button" aria-pressed={isSaved} onClick={() => onToggleSave(track.id)}>{isSaved ? '✓ 보관됨' : '보관함에 담기'}</button>{saveFeedback && <p className="library-save-feedback" role="status">{saveFeedback}</p>}<div className="concert-preview">{onFindTrackConcert && <button type="button" onClick={() => onFindTrackConcert(track)}>이 곡의 공연 찾기</button>}{isSaved && onGoLibrary && <button type="button" onClick={onGoLibrary}>보관함으로 가기</button>}<p>{isSaved ? '보관 여부와 관계없이 공연을 찾을 수 있고, 보관한 곡은 보관함에서 다시 확인할 수 있어요.' : '보관 여부와 관계없이 이 곡이 포함된 공연을 찾을 수 있어요.'}</p></div></section>
          {canOpenShort ? <div className="highlight-short-cta"><p>이 곡을 영상으로 만나보세요.</p><button type="button" onClick={() => onOpenShort(track)}>음원 감상하기</button></div> : <div className="track-detail-coming-soon">미리듣기 준비 중</div>}
        </div>
      </section>
    </div>
  )
}

export function YouTubeShortEmbed({ track, preview }) {
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
      title={`${track.composer} ${track.title} 음원 감상하기`}
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
        <header className="highlight-short-top"><button type="button" onClick={onClose} aria-label="음원 감상하기 닫기">←</button><h2 id="highlight-short-title">음원 감상하기</h2><span aria-hidden="true" /></header>
        <div className="highlight-short-video">{isOpen && <YouTubeShortEmbed track={track} preview={preview} />}</div>
        <div className="highlight-short-info"><p>{track.composer}</p><h3>{formatTrackTitle(track)}</h3>{detail?.highlight && <><strong>{detail.highlight.title}</strong><span>{detail.highlight.description}</span></>}{preview.sourceLabel && <small>{preview.sourceLabel}</small>}</div>
        <button className="highlight-short-return" type="button" onClick={onClose}>곡 상세로 돌아가기</button>
      </section>
    </div>
  )
}

export function LibraryScreen({ savedTracks, onOpenTrack, onRemoveTrack, onGoExplore, onFindTrackConcert }) {
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
                  <span className="saved-track-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}<TrackAlias track={track} /></strong><span className="saved-track-tags">{track.tags.map((tag) => <i key={tag}>#{tag}</i>)}</span></span>
                </button>
                <button className="saved-track-remove" type="button" onClick={() => onRemoveTrack(track.id)}>보관 해제</button>
                {onFindTrackConcert && <button className="saved-track-concert" type="button" onClick={() => onFindTrackConcert(track)}>이 곡의 공연 찾기</button>}
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

export function PreferenceScreen({ profile, onGoExplore }) {
  return <>
    <header className="library-header"><p>MY TASTE</p><h1>나의 취향</h1><span>보관한 곡의 감정을 함께 살펴봐요.</span><strong>{profile.count}곡 기준</strong></header>
    <main className="library-main">
      {profile.isActive ? <section className="preference-panel" aria-label="보관함 감정 성향">
        <h2>감정 성향 지수</h2>
        <p>{profile.count < 3 ? '현재 보관곡을 기준으로 한 초기 취향이에요.' : '현재 보관한 곡들의 감정 평가를 평균했어요.'}</p>
        <p>상위 감정: {profile.topEmotions.map(emotionLabel).join(' · ')}{profile.topEmotions.length > 1 ? ' (공동)' : ''}</p>
        <div className="preference-axis"><span>0</span><span>50</span><span>100</span></div>
        <div className="preference-chart">{emotions.map(({ key, label }) => {
          const value = profile.emotionProfile[key] * 100
          return <div className="preference-row" key={key}>
            <span>{label}</span><meter min="0" max="100" value={value} aria-label={label} />
            <strong>{Number(value.toFixed(1))}</strong>
          </div>
        })}</div>
        <p>0~100 고정 척도예요. 각 감정은 독립적이며 합계가 100일 필요는 없어요.</p>
        <p>현재 목록은 {tracks.length}곡이며, {Array.from(new Set(tracks.map((track) => track.composer))).join(' · ')}의 작품으로 구성되어 있어요.</p>
        <button className="library-save-button" type="button" onClick={onGoExplore}>내 취향 추천 보기</button>
      </section> : <section className="library-empty"><span aria-hidden="true">♬</span><h2>아직 취향이 형성되지 않았어요</h2><p>마음에 남는 곡을 보관하면 감정 성향을 볼 수 있어요.</p><button type="button" onClick={onGoExplore}>음악 탐색으로 가기</button></section>}
    </main>
  </>
}

// 현재 인증 기능은 없습니다. 인증 연동 시 로그인 완료 여부를 이 prop으로 전달하세요.
function App({ isLoggedIn = false } = {}) {
  const [initialMusicState] = useState(getInitialMusicState)
  const [activeView, setActiveView] = useState('explore')
  const [concertRegion, setConcertRegion] = useState(readConcertRegion)
  const [concertDetailId, setConcertDetailId] = useState(null)
  const [concertNow, setConcertNow] = useState(Date.now)
  const [concertPeriod, setConcertPeriod] = useState(getInitialConcertPeriod)
  const [concertTargetTrackId, setConcertTargetTrackId] = useState(null)
  const concertTargetTrack = tracks.find(({ id }) => id === concertTargetTrackId)
  const concertSearch = useConcertSearch()
  const [recommendationMode, setRecommendationMode] = useState('keyword')
  const [recommendationInput, setRecommendationInput] = useState('music')
  const [currentFeeling, setCurrentFeeling] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState([])
  const [recommendationDraw, setRecommendationDraw] = useState(Math.random)
  const [excludedFeelingTrackId, setExcludedFeelingTrackId] = useState(null)
  const [excludedKeywordTrackId, setExcludedKeywordTrackId] = useState(null)
  const lastFeelingRecommendations = useRef({})
  const lastKeywordRecommendations = useRef({})
  const [recommendationExposures, setRecommendationExposures] = useState(readRecommendationExposures)
  const exposureSignature = useRef('')
  const [selectedTrackId, setSelectedTrackId] = useState(null)
  const [weeklyStory, setWeeklyStory] = useState({ id: null, from: 'explore' })
  const weeklyDate = getKoreanDate(concertNow)
  const weeklyState = useMemo(() => getWeeklySelectionState(weeklySelections, tracks, concertNow), [weeklyDate])
  const weeklyEntry = weeklyState.readable.find((entry) => entry.id === weeklyStory.id)
  const [recommendationListState, setRecommendationListState] = useState({ query: null, count: 20 })
  const [detailTrack, setDetailTrack] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [shortTrack, setShortTrack] = useState(null)
  const [isShortOpen, setIsShortOpen] = useState(false)
  const [trackReactions, setTrackReactions] = useState(initialMusicState.reactions)
  const [migrationNotice, setMigrationNotice] = useState(initialMusicState.notice)
  const [saveFeedback, setSaveFeedback] = useState(null)
  const detailCloseTimer = useRef(null)
  const shortCloseTimer = useRef(null)
  const saveFeedbackTimer = useRef(null)
  const activeKeys = useMemo(() => recommendationInput === 'feeling' ? getSuggestedEmotions(currentFeeling) : selectedKeys, [recommendationInput, currentFeeling, selectedKeys])
  const savedTrackIds = useMemo(() => Object.keys(trackReactions).filter((id) => trackReactions[id]?.listenAgain === true), [trackReactions])
  const libraryPreference = useMemo(() => getLibraryPreferenceProfile(tracks, savedTrackIds), [savedTrackIds])
  const isLibraryMode = recommendationMode === 'library' && libraryPreference.isActive
  const isInitialExploration = !isLibraryMode && activeKeys.length === 0
  const recommendation = useMemo(() => getRecommendationResult(tracks, activeKeys), [activeKeys])
  const keywordConditionKey = [...activeKeys].sort().join('|')
  const keywordRecommendationOptions = useMemo(() => ({
    exposures: recommendationExposures,
    conditionKey: keywordConditionKey,
    exemptTrackIds: [...savedTrackIds, selectedTrackId].filter(Boolean),
  }), [recommendationExposures, keywordConditionKey, savedTrackIds, selectedTrackId])
  const featuredKeywordTrack = useMemo(() => recommendationInput === 'feeling'
    ? pickRandomFeelingRecommendation(recommendation, activeKeys, recommendationDraw, excludedFeelingTrackId)
    : pickRandomKeywordRecommendation(recommendation, activeKeys, recommendationDraw, excludedKeywordTrackId, keywordRecommendationOptions),
  [recommendation, recommendationInput, activeKeys, recommendationDraw, excludedFeelingTrackId, excludedKeywordTrackId, keywordRecommendationOptions])
  const diversifiedKeywordRecommendations = useMemo(() => getDiversifiedKeywordRecommendations(recommendation, activeKeys, {
    ...keywordRecommendationOptions, randomValue: recommendationDraw,
  }), [recommendation, activeKeys, keywordRecommendationOptions, recommendationDraw])
  const recommendedTracks = useMemo(() => isLibraryMode ? getLibraryRecommendations(tracks, libraryPreference)
    : recommendationInput === 'music' ? diversifiedKeywordRecommendations.tracks : recommendation.tracks,
  [isLibraryMode, libraryPreference, recommendationInput, diversifiedKeywordRecommendations, recommendation])
  const discoveryCandidates = useMemo(() => getRecommendationResult(tracks).tracks, [])
  const discovery = useHomeDiscovery({ candidates: discoveryCandidates, activeView,
    conditionKey: JSON.stringify([recommendationInput, currentFeeling, activeKeys, isLibraryMode ? 'library' : 'keyword']),
    enabled: isInitialExploration, isLoggedIn })
  const selectedRecommendationTrack = recommendedTracks.find((track) => track.id === selectedTrackId)
  const selectedTrack = selectedRecommendationTrack ?? (isLibraryMode ? recommendedTracks[0] : featuredKeywordTrack)
  const relatedTracks = recommendedTracks.filter((track) => track.id !== selectedTrack?.id)
  const recommendationQuery = JSON.stringify(isLibraryMode ? ['library', savedTrackIds] : ['keyword', activeKeys])
  const recommendationVisibleCount = recommendationListState.query === recommendationQuery ? recommendationListState.count : 20
  const savedTracks = useMemo(() => tracks.filter((track) => trackReactions[track.id]?.listenAgain === true).sort((a, b) => (Date.parse(trackReactions[b.id]?.updatedAt) || 0) - (Date.parse(trackReactions[a.id]?.updatedAt) || 0)), [trackReactions])
  const isTrackSaved = (id) => trackReactions[id]?.listenAgain === true
  const concertOptions = { mode: 'keyword', selectedKeys: [], savedTrackIds: [], now: concertNow, region: concertRegion }
  const dbConcertPreview = concertSearch.search.data?.backend === 'supabase'
  const allConcerts = (dbConcertPreview ? concertSearch.search.data.concerts : mergeSearchConcerts(concertSearch.search.data?.concerts || [], concerts)).filter(({ kopisId }) => kopisId)
  const searchedKopisIds = new Set((concertSearch.search.data?.concerts || []).map(({ kopisId }) => kopisId))
  const searchedIds = new Set((concertSearch.search.data?.concerts || []).map(({ id }) => id))
  const searchedConcertResults = getConcertRecommendations(tracks, { ...concertOptions, region: concertSearch.search.data?.query.region }, allConcerts.filter(({ id, kopisId }) => searchedIds.has(id) || (kopisId && searchedKopisIds.has(kopisId))))
  const detailConcert = allConcerts.find(({ id, kopisId }) => id === concertDetailId || (kopisId && `kopis-${kopisId}` === concertDetailId))
  const concertDetail = detailConcert ? analyzeConcert(detailConcert, tracks, concertOptions) : null
  const openConcert = (id) => { setConcertDetailId(id); setActiveView('concert'); window.scrollTo({ top: 0 }) }
  const showConcerts = () => { setConcertDetailId(null); setActiveView('concert'); window.scrollTo({ top: 0 }) }
  const findTrackConcert = (track) => { concertSearch.clear(); setConcertTargetTrackId(track.id); closeTrackDetail(); showConcerts() }
  const showLibrary = () => { closeTrackDetail(); setActiveView('library'); window.scrollTo({ top: 0 }) }
  const clearConcertTarget = () => { concertSearch.clear(); setConcertTargetTrackId(null) }
  const changeConcertRegion = (value) => { if (value !== concertRegion) concertSearch.clear(); setConcertRegion(value) }
  const changeConcertPeriod = (value) => { concertSearch.clear(); setConcertPeriod(value) }

  useEffect(() => {
    const refresh = () => setConcertNow(Date.now())
    const timer = window.setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  useEffect(() => {
    if (import.meta.env?.DEV) weeklyState.diagnostics.forEach((message) => console.warn(message))
  }, [weeklyState])
  useEffect(() => {
    // 키워드는 현재 화면에서만 유지하며 이전 버전의 저장된 선택도 제거합니다.
    try { window.localStorage.removeItem(SELECTION_KEY) } catch { /* 저장 차단 */ }
  }, [])
  useEffect(() => { setRecommendationListState({ query: recommendationQuery, count: 20 }) }, [recommendationQuery])
  useEffect(() => { saveConcertRegion(concertRegion) }, [concertRegion])
  useEffect(() => {
    if (recommendationInput === 'feeling' && !isLibraryMode && currentFeeling && selectedTrack) {
      lastFeelingRecommendations.current[currentFeeling] = selectedTrack.id
    }
  }, [recommendationInput, isLibraryMode, currentFeeling, selectedTrack])
  useEffect(() => {
    if (recommendationInput === 'music' && !isLibraryMode && activeKeys.length && featuredKeywordTrack) {
      lastKeywordRecommendations.current[[...activeKeys].sort().join('|')] = featuredKeywordTrack.id
    }
  }, [recommendationInput, isLibraryMode, activeKeys, featuredKeywordTrack])
  useEffect(() => {
    if (recommendationInput !== 'music' || isLibraryMode || !keywordConditionKey || !featuredKeywordTrack) return
    const signature = `${keywordConditionKey}|${recommendationDraw}`
    if (exposureSignature.current === signature) return
    exposureSignature.current = signature
    const exempt = new Set([...savedTrackIds, selectedTrackId].filter(Boolean))
    const shownIds = [featuredKeywordTrack, ...recommendedTracks.filter(({ id }) => id !== featuredKeywordTrack.id)]
      .slice(0, 6).map(({ id }) => id).filter((id) => !exempt.has(id))
    recordRecommendationExposures(shownIds, keywordConditionKey)
  }, [recommendationInput, isLibraryMode, keywordConditionKey, recommendationDraw, featuredKeywordTrack, recommendedTracks, savedTrackIds, selectedTrackId])
  useEffect(() => {
    if (!initialMusicState.notice) return undefined
    try { window.localStorage.removeItem(NOTICE_KEY) } catch { /* 저장 차단 */ }
    const timer = window.setTimeout(() => setMigrationNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [initialMusicState.notice])
  useEffect(() => {
    if (activeView !== 'concert' && recommendationMode === 'library' && !libraryPreference.isActive) setRecommendationMode('keyword')
  }, [activeView, recommendationMode, libraryPreference.isActive])
  useEffect(() => {
    if (!isDetailOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !isShortOpen) closeTrackDetail() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape) }
  }, [isDetailOpen, isShortOpen])
  useEffect(() => {
    if (!isShortOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') closeHighlightShort() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isShortOpen])
  useEffect(() => () => {
    window.clearTimeout(detailCloseTimer.current)
    window.clearTimeout(shortCloseTimer.current)
    window.clearTimeout(saveFeedbackTimer.current)
  }, [])

  const selectEmotion = (key) => {
    const nextKeys = selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : selectedKeys.length < 3 ? [...selectedKeys, key] : selectedKeys
    setRecommendationExposures(readRecommendationExposures())
    setSelectedKeys(nextKeys)
    setExcludedKeywordTrackId(lastKeywordRecommendations.current[[...nextKeys].sort().join('|')] || null)
    setRecommendationDraw(Math.random())
    setSelectedTrackId(null)
  }
  const selectFeeling = (feeling) => {
    setCurrentFeeling((current) => current === feeling ? null : feeling)
    setExcludedFeelingTrackId(lastFeelingRecommendations.current[feeling] || null)
    setRecommendationDraw(Math.random()); setSelectedTrackId(null)
  }
  const selectInput = (input) => {
    if (input === recommendationInput) return
    if (input === 'feeling') setExcludedFeelingTrackId(lastFeelingRecommendations.current[currentFeeling] || null)
    else {
      setRecommendationExposures(readRecommendationExposures())
      setExcludedKeywordTrackId(lastKeywordRecommendations.current[[...selectedKeys].sort().join('|')] || null)
    }
    setRecommendationInput(input); setSelectedTrackId(null); setRecommendationDraw(Math.random())
  }
  const resetInputs = () => {
    if (recommendationInput === 'feeling') setCurrentFeeling(null)
    else { setSelectedKeys([]); setExcludedKeywordTrackId(null) }
    setSelectedTrackId(null); setRecommendationMode('keyword')
  }
  const returnToMusicKeywords = () => {
    selectInput('music'); setSelectedKeys([]); setRecommendationMode('keyword')
  }
  const openTrackDetail = (track) => {
    window.clearTimeout(detailCloseTimer.current)
    if (isLibraryMode) setSelectedTrackId(track.id)
    setDetailTrack(track)
    window.requestAnimationFrame(() => setIsDetailOpen(true))
  }
  const selectRelatedTrack = (track) => {
    setSelectedTrackId(track.id)
    document.querySelector('.track-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  const closeTrackDetail = () => {
    setIsDetailOpen(false); detailCloseTimer.current = window.setTimeout(() => setDetailTrack(null), 240)
  }
  const openHighlightShort = (track) => {
    window.clearTimeout(shortCloseTimer.current); setShortTrack(track)
    window.requestAnimationFrame(() => setIsShortOpen(true))
  }
  const closeHighlightShort = () => {
    setIsShortOpen(false); shortCloseTimer.current = window.setTimeout(() => setShortTrack(null), 240)
  }
  const toggleTrackSave = (id) => {
    const isSaved = !isTrackSaved(id)
    const next = { ...trackReactions, [id]: { ...trackReactions[id], listenAgain: isSaved, updatedAt: new Date().toISOString() } }
    setTrackReactions(next); saveMusicValue(STORAGE_KEY, next)
    setSaveFeedback({ trackId: id, message: isSaved ? '보관함에 담았어요.' : '보관을 해제했어요.' })
    window.clearTimeout(saveFeedbackTimer.current)
    saveFeedbackTimer.current = window.setTimeout(() => setSaveFeedback(null), 1800)
  }
  const showTasteRecommendations = () => { setActiveView('explore'); setRecommendationMode(libraryPreference.isActive ? 'library' : 'keyword'); setSelectedTrackId(null) }
  const openRecommendationList = () => {
    setRecommendationListState({ query: recommendationQuery, count: 20 })
    setActiveView('recommendations'); window.scrollTo({ top: 0 })
  }
  const returnToExplore = () => { setActiveView('explore'); window.scrollTo({ top: 0 }) }
  const openWeeklyStory = (id, from = 'explore') => { setWeeklyStory({ id, from }); setActiveView('weekly-story'); window.scrollTo({ top: 0 }) }
  const openWeeklyArchive = () => { setActiveView('weekly-archive'); window.scrollTo({ top: 0 }) }
  const loadMoreRecommendations = () => setRecommendationListState((state) => ({ query: recommendationQuery, count: Math.min((state.query === recommendationQuery ? state.count : 20) + 20, recommendedTracks.length) }))

  return <div className="app-shell">
    {migrationNotice && <div className="migration-notice" role="status">{migrationNotice}<button type="button" aria-label="보관함 정리 안내 닫기" onClick={() => setMigrationNotice(null)}>×</button></div>}
    {activeView === 'explore' ? <>
      <header className="top-header" id="top">
        <div className="topbar"><a className="brand" href="#top">MY PIANO MOOD</a></div>
        <p className="date-note">오늘의 음악 탐색</p><h1>오늘은 어떤 음악을<br />만나고 싶나요?</h1><div className="header-orbit orbit-one" /><div className="header-orbit orbit-two" />
      </header>
      <main>
        {!isLibraryMode && <section className="mood-section" aria-labelledby="mood-title">
          <div className="section-heading"><p>MOOD</p><h2 id="mood-title">음악을 어떻게 고르고 싶나요?</h2></div>
          <div className="recommendation-input-control" role="group" aria-label="음악 느낌 선택 방식">
            <button className={recommendationInput === 'music' ? 'selected' : ''} type="button" aria-pressed={recommendationInput === 'music'} onClick={() => selectInput('music')}>느낌으로 시작하기</button>
            <button className={recommendationInput === 'feeling' ? 'selected' : ''} type="button" aria-pressed={recommendationInput === 'feeling'} onClick={() => selectInput('feeling')}>기분에서 시작하기</button>
          </div>
          <div className="recommendation-input-content">
            <h3>{recommendationInput === 'music' ? '지금 듣고 싶은 음악의 느낌을 골라주세요.' : '지금 기분은 어떤가요?'}</h3>
            {recommendationInput === 'music' && <p className="mood-guide">최대 3개까지 선택할 수 있어요</p>}
            <div className="keyword-choice-list" role="group" aria-label={recommendationInput === 'music' ? '음악 느낌 선택' : '지금 기분 선택'}>
              {recommendationInput === 'music' ? emotions.map(({ key, label }) => <button key={key} type="button" className={selectedKeys.includes(key) ? 'selected' : ''} aria-pressed={selectedKeys.includes(key)} disabled={selectedKeys.length === 3 && !selectedKeys.includes(key)} onClick={() => selectEmotion(key)}>{label}</button>) : feelingOptions.map((feeling) => <button key={feeling} type="button" className={currentFeeling === feeling ? 'selected' : ''} aria-pressed={currentFeeling === feeling} onClick={() => selectFeeling(feeling)}>{feeling}</button>)}
            </div>
          </div>
          <button className="recommendation-input-reset" type="button" onClick={resetInputs}>선택 초기화</button>
        </section>}
        <section className="track-section" aria-labelledby="recommendation-title">
          <div className="section-heading recommendation-heading"><p>{isInitialExploration ? 'START HERE' : 'FOR YOU'}</p><h2 id="recommendation-title">{isInitialExploration ? '어떤 음악이 끌리나요?' : isLibraryMode ? '내 취향 추천' : '지금의 추천'}</h2>{isInitialExploration && <span>{recommendationInput === 'music' ? '음악의 느낌을 고르면 어울리는 곡을 찾아드릴게요.' : '지금 기분을 고르면 바로 추천해드릴게요.'}</span>}</div>
          <div className="recommendation-mode-control" role="group" aria-label="추천 방식 선택"><button type="button" className={!isLibraryMode ? 'selected' : ''} aria-pressed={!isLibraryMode} onClick={() => { setRecommendationMode('keyword'); setSelectedTrackId(null) }}>음악 키워드</button><button type="button" className={isLibraryMode ? 'selected' : ''} aria-pressed={isLibraryMode} disabled={!libraryPreference.isActive} onClick={showTasteRecommendations}>내 취향</button></div>
          {!libraryPreference.isActive && <p className="recommendation-mode-guide">마음에 남는 곡을 보관하면 내 취향 추천을 볼 수 있어요.</p>}
          {!isLibraryMode && currentFeeling && recommendationInput === 'feeling' && <p className="feeling-result-path">{currentFeeling} 기분에 어울리는 {activeKeys.map(emotionLabel).join(' · ')} 음악</p>}
          {!isInitialExploration && !isLibraryMode && recommendation.hasFewCandidates && <p className="recommendation-result-notice">이 느낌의 곡은 {recommendedTracks.length}곡이에요. 다른 느낌도 골라보세요.</p>}
          {isInitialExploration ? <>
            <p className="starter-label">피아노 음악 만나기</p><div key={discovery.revision} className="similar-list starter-carousel" data-discovery-revision={discovery.revision}>{discovery.tracks.map((track) => <MiniTrackCard key={track.id} track={track} onOpenTrack={openTrackDetail} />)}</div>
          </> : selectedTrack ? <article className={'featured-track ' + selectedTrack.tone} role="button" tabIndex="0" aria-label={formatTrackTitle(selectedTrack) + ' 상세 보기'} onClick={() => openTrackDetail(selectedTrack)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openTrackDetail(selectedTrack) } }}>
            <div className="track-card-top"><div className="recommendation-basis">{isLibraryMode ? <small className="library-recommendation-label">보관함 기반 추천 · 감정 성향 유사도</small> : <span>선택한 음악 느낌: {activeKeys.map(emotionLabel).join(' · ')}</span>}<small>{isLibraryMode ? '보관한 곡과 비슷한 감정의 새로운 곡이에요.' : describeRecommendationMatch(selectedTrack, activeKeys)}</small></div><button type="button" onClick={(event) => { event.stopPropagation(); toggleTrackSave(selectedTrack.id) }} aria-label={formatTrackTitle(selectedTrack) + (isTrackSaved(selectedTrack.id) ? ' 보관 해제' : ' 보관함에 담기')} aria-pressed={isTrackSaved(selectedTrack.id)}><Icon name="bookmark" filled={isTrackSaved(selectedTrack.id)} /></button></div>
            <div className="featured-artwork"><MiniArtwork track={selectedTrack} /></div>
            <div className="track-copy"><p className="track-kicker">{selectedRecommendationTrack ? '선택한 추천 곡' : '오늘의 대표 곡'}</p><p className="composer">{selectedTrack.composer}</p><h2>{formatTrackTitle(selectedTrack)}<TrackAlias track={selectedTrack} /></h2><p className="track-description">{selectedTrack.description}</p><div className="tag-list">{selectedTrack.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
            {trackDetails[selectedTrack.id]?.shortPreview ? <button className="play-button" type="button" aria-label="미리듣기" onClick={(event) => { event.stopPropagation(); openHighlightShort(selectedTrack) }}><Icon name="play" /></button> : <p className="preview-pending">미리듣기 준비 중</p>}
          </article> : <div className="library-empty"><h2>{isLibraryMode ? '모든 곡을 보관했어요' : '이 느낌에 맞는 곡이 아직 없어요'}</h2><p>{isLibraryMode ? '보관함에서 담아둔 곡을 만나보세요.' : '다른 음악 느낌을 골라보세요.'}</p><button type="button" onClick={returnToMusicKeywords}>음악 키워드로 돌아가기</button></div>}
        </section>
        {!isInitialExploration && <RelatedRecommendations key={recommendationQuery} relatedTracks={relatedTracks} onOpenTrack={selectRelatedTrack} onSeeAll={openRecommendationList} />}
        {!isInitialExploration && selectedTrack && relatedTracks.length === 0 && <div className="recommendations-single-link"><button className="recommendations-see-all" type="button" onClick={openRecommendationList}>추천곡 더 보기 <span aria-hidden="true">→</span></button></div>}
        <WeeklySelectionSection entry={weeklyState.current} onOpen={openWeeklyStory} onArchive={openWeeklyArchive} />
        {!weeklyState.current && weeklyState.archive.length > 0 && <div className="weekly-archive-entry"><button className="weekly-link" type="button" onClick={openWeeklyArchive}>지난 선정곡 →</button></div>}
      </main>
    </> : activeView === 'weekly-story' ? weeklyEntry
      ? <WeeklySelectionScreen key={weeklyEntry.id} entry={weeklyEntry} detail={trackDetails[weeklyEntry.trackId]} isSaved={isTrackSaved(weeklyEntry.trackId)} onBack={weeklyStory.from === 'archive' ? openWeeklyArchive : returnToExplore} onToggleSave={toggleTrackSave} onOpenTrack={openTrackDetail} saveFeedback={saveFeedback?.trackId === weeklyEntry.trackId ? saveFeedback.message : null} PreviewPlayer={YouTubeShortEmbed} />
      : <main className="weekly-screen"><h1>지금은 읽을 수 없는 소개예요</h1><button className="weekly-link" type="button" onClick={returnToExplore}>음악 탐색으로</button></main>
      : activeView === 'weekly-archive' ? <WeeklyArchiveScreen entries={weeklyState.archive} onOpen={(id) => openWeeklyStory(id, 'archive')} onBack={returnToExplore} />
      : activeView === 'recommendations' ? <RecommendationListScreen recommendedTracks={recommendedTracks} selectedKeys={activeKeys} isLibraryMode={isLibraryMode} visibleCount={recommendationVisibleCount} onLoadMore={loadMoreRecommendations} onBack={returnToExplore} onOpenTrack={openTrackDetail} isTrackSaved={isTrackSaved} onToggleSave={toggleTrackSave} /> : activeView === 'concert' ? concertDetail
      ? <ConcertDetailScreen result={concertDetail} now={concertNow} onBack={showConcerts} onOpenTrack={openTrackDetail} onOpenShort={openHighlightShort} details={trackDetails} isTrackSaved={isTrackSaved} onLoadProgram={dbConcertPreview ? undefined : concertSearch.loadProgram} programRequest={concertSearch.programRequests[detailConcert.kopisId]} />
      : <ConcertScreen searchResults={searchedConcertResults} now={concertNow} region={concertRegion} onSelectRegion={changeConcertRegion} onGoExplore={returnToExplore} onOpenConcert={openConcert} tracks={tracks} savedTracks={savedTracks} onSelectTrack={findTrackConcert} searchControls={{ period: concertPeriod, onChangePeriod: changeConcertPeriod, onSearch: concertSearch.runSearch, search: concertSearch.search, connection: concertSearch.connection, targetTrack: concertTargetTrack, onClearTarget: clearConcertTarget, onCheckMore: concertSearch.checkNext, onStop: concertSearch.stop }} />
      : activeView === 'taste' ? <PreferenceScreen profile={libraryPreference} onGoExplore={showTasteRecommendations} /> : <LibraryScreen savedTracks={savedTracks} onOpenTrack={openTrackDetail} onRemoveTrack={toggleTrackSave} onGoExplore={() => setActiveView('explore')} onFindTrackConcert={findTrackConcert} />}
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <button className={'nav-item ' + (['explore', 'recommendations', 'weekly-story', 'weekly-archive'].includes(activeView) ? 'active' : '')} type="button" onClick={() => setActiveView('explore')}><Icon name="compass" /><span>음악 탐색</span></button>
      <button className={'nav-item ' + (activeView === 'concert' ? 'active' : '')} type="button" onClick={showConcerts}><Icon name="stage" /><span>공연 찾기</span></button>
      <button className={'nav-item ' + (activeView === 'library' ? 'active' : '')} type="button" onClick={() => setActiveView('library')}><Icon name="bookmarkSmall" /><span>보관함</span></button>
      <button className={'nav-item ' + (activeView === 'taste' ? 'active' : '')} type="button" onClick={() => setActiveView('taste')}><Icon name="user" /><span>나의 취향</span></button>
    </nav>
    <TrackDetailSheet track={detailTrack} detail={detailTrack ? trackDetails[detailTrack.id] : null} isSaved={detailTrack ? isTrackSaved(detailTrack.id) : false} selectedKeys={!isInitialExploration && recommendationMode !== 'library' ? activeKeys : []} isOpen={isDetailOpen} onClose={closeTrackDetail} onOpenShort={openHighlightShort} onToggleSave={toggleTrackSave} saveFeedback={saveFeedback?.trackId === detailTrack?.id ? saveFeedback?.message : null} onFindTrackConcert={findTrackConcert} onGoLibrary={showLibrary} />
    <HighlightShortView track={shortTrack} detail={shortTrack ? trackDetails[shortTrack.id] : null} isOpen={isShortOpen} onClose={closeHighlightShort} />
  </div>
}

export default App
