import React, { useMemo, useState } from 'react'
import { formatTrackTitle } from '../data/emotions.js'
import { getReferenceRecommendations, searchReferenceTracks } from '../data/referenceTrackSearch.js'
import { getLibraryRecommendations } from '../data/recommendations.js'
import { FeaturedTrackCard, MiniTrackCard } from './TrackCards.jsx'

export default function ReferenceTrackExplorer({ tracks, referenceId, onSelectReference, onOpenTrack, onToggleSave, isTrackSaved, onOpenShort, discovery, libraryPreference, mode = 'search', onChangeMode }) {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(20)
  const results = useMemo(() => searchReferenceTracks(tracks, query), [tracks, query])
  const reference = tracks.find(({ id }) => id === referenceId)
  const recommendations = useMemo(() => getReferenceRecommendations(tracks, reference), [tracks, reference])
  const personalTracks = useMemo(() => getLibraryRecommendations(tracks, libraryPreference), [tracks, libraryPreference])
  const isPersonal = mode === 'library' && libraryPreference?.isActive
  const featured = isPersonal ? personalTracks[0] : reference
  const related = isPersonal
    ? personalTracks.slice(1, 7).map((track) => ({ track, reason: '보관한 곡과 감정 성향이 비슷해요.' }))
    : recommendations
  const changeReference = () => {
    onSelectReference(null)
    setQuery('')
    setCount(20)
    document.getElementById('reference-search')?.focus()
  }

  return <section className="reference-explorer" aria-labelledby="reference-title">
    <div className="section-heading"><p>FIND YOUR NEXT PIECE</p><h2 id="reference-title">아는 곡에서 새로운 곡으로</h2></div>
    <p className="reference-guide">작곡가나 작품을 한글·영어로 찾아 기준곡을 선택해 주세요. 등록된 곡 안에서 검색해요.</p>
    <label className="reference-search-label" htmlFor="reference-search">작곡가 · 곡명 · 작품번호</label>
    <input id="reference-search" className="reference-search" type="search" maxLength={160} value={query}
      onChange={(event) => { setQuery(event.target.value); setCount(20) }} />
    {query.trim() && <div className="reference-search-results">
      <p role="status">검색 결과 {results.length}곡 · 기준곡은 직접 선택해 주세요.</p>
      {!results.length && <p>등록된 곡을 찾지 못했어요. 작곡가 이름이나 작품번호를 바꿔보세요.</p>}
      <ul>{results.slice(0, count).map((track) => <li key={track.id} data-search-track-id={track.id}>
        <div><strong>{formatTrackTitle(track)}{track.alias ? ` [${track.alias}]` : ''}</strong><small lang="en">{track.titleEn}</small></div>
        <div className="reference-actions"><button type="button" onClick={() => onOpenTrack(track)}>상세 보기</button>
          <button type="button" aria-pressed={track.id === referenceId} onClick={() => { onSelectReference(track.id); setQuery(''); setCount(20) }}>이 곡으로 추천</button></div>
      </li>)}</ul>
      {count < results.length && <button className="reference-more" type="button" onClick={() => setCount((value) => value + 20)}>검색 결과 더 보기</button>}
    </div>}
    {reference ? <>
      <section className="reference-featured-section" data-reference-track-id={reference.id} aria-labelledby="reference-featured-title">
        <div className="section-heading recommendation-heading"><p>FOR YOU</p><h2 id="reference-featured-title">{isPersonal ? '내 취향 추천' : '검색한 음악'}</h2></div>
        <div className="recommendation-mode-control" role="group" aria-label="숙련자 추천 방식 선택">
          <button type="button" className={!isPersonal ? 'selected' : ''} aria-pressed={!isPersonal} onClick={() => onChangeMode('search')}>검색 음악</button>
          <button type="button" className={isPersonal ? 'selected' : ''} aria-pressed={Boolean(isPersonal)} disabled={!libraryPreference?.isActive} onClick={() => onChangeMode('library')}>내 취향</button>
        </div>
        {!libraryPreference?.isActive && <p className="recommendation-mode-guide">마음에 남는 곡을 보관하면 내 취향 추천을 볼 수 있어요.</p>}
        {featured ? <FeaturedTrackCard track={featured} isSaved={isTrackSaved(featured.id)} onOpenTrack={onOpenTrack} onToggleSave={onToggleSave} onOpenShort={onOpenShort}
          kicker={isPersonal ? '오늘의 대표 곡' : '선택한 기준곡'}
          basis={isPersonal ? <><small className="library-recommendation-label">보관함 기반 추천 · 감정 성향 유사도</small><small>보관한 곡과 비슷한 감정의 새로운 곡이에요.</small></> : <><span>직접 선택한 검색 음악</span><small>이 곡의 감정 성향을 바탕으로 비슷한 음악을 찾아드려요.</small></>} />
          : <div className="library-empty"><h3>모든 곡을 보관했어요</h3><p>검색 음악에서 선택한 곡을 다시 만나보세요.</p></div>}
        <div className="reference-actions"><button type="button" onClick={changeReference}>기준곡 변경</button></div>
      </section>
      <h3 className="reference-results-heading">{isPersonal ? '내 취향과 비슷한 감정의 음악' : '이 곡과 비슷한 감정의 음악'}</h3>
      <p className="reference-guide">{isPersonal ? '보관한 곡의 9가지 감정 점수를 바탕으로 추천해요.' : '기존 9가지 감정 점수의 분포와 강도를 비교해요. 기준곡과 같은 작품의 다른 악장은 제외해요.'} 선율·화성·연주 난이도의 유사도를 뜻하지 않아요.</p>
      <ul className="reference-recommendations">{related.map(({ track, reason }) => <li key={track.id} data-recommended-track-id={track.id}>
        <button className="reference-track-link" type="button" onClick={() => onOpenTrack(track)}><strong>{formatTrackTitle(track)}{track.alias ? ` [${track.alias}]` : ''}</strong><span>{track.description}</span><small>{reason}</small></button>
        <button className="reference-save" type="button" aria-label={`${formatTrackTitle(track)} ${isTrackSaved(track.id) ? '보관 해제' : '보관함에 담기'}`} aria-pressed={isTrackSaved(track.id)} onClick={() => onToggleSave(track.id)}>{isTrackSaved(track.id) ? '보관 중' : '보관하기'}</button>
      </li>)}</ul>
      {!related.length && <p role="status">{isPersonal ? '추천할 다른 곡이 아직 없어요.' : '비교할 수 있는 다른 곡이 아직 없어요. 다른 기준곡을 골라보세요.'}</p>}
    </> : !query.trim() && <section className="reference-discovery" aria-labelledby="reference-discovery-title">
      <div className="section-heading"><p>START HERE</p><h2 id="reference-discovery-title">오늘은 이런곡이 어떤가요?</h2></div>
      <div key={discovery?.revision} className="similar-list starter-carousel" data-discovery-revision={discovery?.revision}>
        {discovery?.tracks.map((track) => <MiniTrackCard key={track.id} track={track} onOpenTrack={onOpenTrack} />)}
      </div>
    </section>}
  </section>
}
