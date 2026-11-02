import React, { useMemo, useState } from 'react'
import { formatTrackTitle } from '../data/emotions.js'
import { getReferenceRecommendations, searchReferenceTracks } from '../data/referenceTrackSearch.js'
import { getLibraryRecommendations } from '../data/recommendations.js'
import { FeaturedTrackCard, MiniTrackCard, RelatedRecommendations } from './TrackCards.jsx'

export default function ReferenceTrackExplorer({ tracks, referenceId, onSelectReference, onOpenTrack, onToggleSave, isTrackSaved, onOpenShort, discovery, libraryPreference, mode = 'search', onChangeMode, featuredId, onSelectFeatured, onSeeAll }) {
  const reference = tracks.find(({ id }) => id === referenceId)
  const [query, setQuery] = useState(() => reference ? formatTrackTitle(reference) : '')
  const [isEditing, setIsEditing] = useState(false)
  const [count, setCount] = useState(20)
  const [activeIndex, setActiveIndex] = useState(-1)
  const results = useMemo(() => searchReferenceTracks(tracks, query), [tracks, query])
  const suggestions = results.slice(0, count)
  const recommendations = useMemo(() => getReferenceRecommendations(tracks, reference), [tracks, reference])
  const personalTracks = useMemo(() => getLibraryRecommendations(tracks, libraryPreference), [tracks, libraryPreference])
  const isPersonal = mode === 'library' && libraryPreference?.isActive
  const candidates = isPersonal ? personalTracks : recommendations.map(({ track }) => track)
  const selectedRelated = candidates.find(({ id }) => id === featuredId)
  const featured = selectedRelated ?? (isPersonal ? personalTracks[0] : reference)
  const related = candidates.filter(({ id }) => id !== featured?.id)
  const showSuggestions = isEditing && Boolean(query.trim())
  const activeOption = showSuggestions && suggestions[activeIndex]

  const selectReference = (track) => {
    onSelectReference(track.id)
    setQuery(formatTrackTitle(track))
    setIsEditing(false)
    setActiveIndex(-1)
    setCount(20)
  }
  const changeReference = () => {
    onSelectReference(null)
    setQuery('')
    setIsEditing(false)
    setActiveIndex(-1)
    setCount(20)
    document.getElementById('reference-search')?.focus()
  }
  const handleSearchKey = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery(reference ? formatTrackTitle(reference) : '')
      setIsEditing(false)
      setActiveIndex(-1)
    } else if (showSuggestions && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault()
      const next = event.key === 'ArrowDown'
        ? (activeIndex + 1) % suggestions.length
        : (activeIndex < 0 ? suggestions.length - 1 : (activeIndex - 1 + suggestions.length) % suggestions.length)
      setActiveIndex(next)
      document.getElementById(`reference-option-${suggestions[next].id}`)?.scrollIntoView?.({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (!showSuggestions) return
      if (activeOption || results.length === 1) selectReference(activeOption || results[0])
      else if (results.length > 1) setActiveIndex(0)
    }
  }
  const selectRelated = (track) => {
    onSelectFeatured(track.id)
    document.querySelector('.reference-featured-section')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  return <>
    <section className="reference-explorer" aria-labelledby="reference-title">
      <div className="section-heading"><p>FIND YOUR NEXT PIECE</p><h2 id="reference-title">아는 곡에서 새로운 곡으로</h2></div>
      <p className="reference-guide">작곡가나 작품을 한글·영어로 찾아 선택해 주세요. 등록된 곡 안에서 검색해요.</p>
      <label className="reference-search-label" htmlFor="reference-search">작곡가 · 곡명 · 작품번호</label>
      <input id="reference-search" className="reference-search" type="search" role="combobox" autoComplete="off" maxLength={160} value={query}
        aria-autocomplete="list" aria-controls="reference-search-options" aria-expanded={showSuggestions && suggestions.length > 0}
        aria-activedescendant={activeOption ? `reference-option-${activeOption.id}` : undefined}
        onKeyDown={handleSearchKey} onChange={(event) => { setQuery(event.target.value); setIsEditing(Boolean(event.target.value.trim())); setActiveIndex(-1); setCount(20) }} />
      {showSuggestions && <div className="reference-search-results">
        <p role="status">{results.length ? `검색 결과 ${results.length}곡 · 곡명을 선택해 주세요.` : '등록된 곡을 찾지 못했어요. 작곡가 이름이나 작품번호를 바꿔보세요.'}</p>
        <ul id="reference-search-options" className="reference-suggestions" role="listbox" aria-label="곡 자동완성">
          {suggestions.map((track, index) => <li id={`reference-option-${track.id}`} key={track.id} role="option" aria-selected={index === activeIndex} data-search-track-id={track.id}
            onMouseDown={(event) => event.preventDefault()} onClick={() => selectReference(track)}>
            <span>{formatTrackTitle(track)}{track.alias ? ` [${track.alias}]` : ''}</span><small lang="en">{track.titleEn}</small>
          </li>)}
        </ul>
        {count < results.length && <button className="reference-more" type="button" onClick={() => setCount((value) => value + 20)}>검색 결과 더 보기</button>}
      </div>}
      {!showSuggestions && (reference ? <section className="reference-featured-section" data-reference-track-id={reference.id} aria-labelledby="reference-featured-title">
        <div className="section-heading recommendation-heading"><p>FOR YOU</p><h2 id="reference-featured-title">{isPersonal ? '내 취향 추천' : '검색한 음악'}</h2></div>
        <div className="recommendation-mode-control" role="group" aria-label="숙련자 추천 방식 선택">
          <button type="button" className={!isPersonal ? 'selected' : ''} aria-pressed={!isPersonal} onClick={() => onChangeMode('search')}>검색 음악</button>
          <button type="button" className={isPersonal ? 'selected' : ''} aria-pressed={Boolean(isPersonal)} disabled={!libraryPreference?.isActive} onClick={() => onChangeMode('library')}>내 취향</button>
        </div>
        {!libraryPreference?.isActive && <p className="recommendation-mode-guide">마음에 남는 곡을 보관하면 내 취향 추천을 볼 수 있어요.</p>}
        {featured ? <FeaturedTrackCard track={featured} isSaved={isTrackSaved(featured.id)} onOpenTrack={onOpenTrack} onToggleSave={onToggleSave} onOpenShort={onOpenShort}
          kicker={selectedRelated ? '선택한 추천 곡' : isPersonal ? '오늘의 대표 곡' : '검색한 곡'}
          basis={isPersonal ? <><small className="library-recommendation-label">보관함 기반 추천 · 감정 성향 유사도</small><small>보관한 곡과 비슷한 감정의 새로운 곡이에요.</small></> : <><span>{selectedRelated ? `기준곡: ${formatTrackTitle(reference)}` : '직접 선택한 검색 음악'}</span><small>9가지 감정 성향을 바탕으로 비슷한 음악을 찾아드려요.</small></>} />
          : <div className="library-empty"><h3>모든 곡을 보관했어요</h3><p>검색 음악에서 선택한 곡을 다시 만나보세요.</p></div>}
        <div className="reference-actions"><button type="button" onClick={changeReference}>기준곡 변경</button></div>
      </section> : <section className="reference-discovery" aria-labelledby="reference-discovery-title">
        <div className="section-heading"><p>START HERE</p><h2 id="reference-discovery-title">오늘은 이런곡이 어떤가요?</h2></div>
        <div key={discovery?.revision} className="similar-list starter-carousel" data-discovery-revision={discovery?.revision}>
          {discovery?.tracks.map((track) => <MiniTrackCard key={track.id} track={track} onOpenTrack={selectReference} />)}
        </div>
      </section>)}
    </section>
    {!showSuggestions && reference && <RelatedRecommendations key={`${referenceId}-${mode}`} relatedTracks={related} onOpenTrack={selectRelated} onSeeAll={() => onSeeAll(related, Boolean(isPersonal))} />}
  </>
}
