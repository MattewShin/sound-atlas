import React from 'react'
import { composerImages, trackDetails } from '../data/musicData.js'
import { formatTrackTitle } from '../data/emotions.js'

export function TrackAlias({ track }) {
  return track.alias ? <span className="track-alias">{' '}[{track.alias}]</span> : null
}

export function MiniArtwork({ track }) {
  const imageSrc = composerImages[track.composer]
  return <span className={`mini-art ${track.tone} ${imageSrc ? 'has-composer-image' : ''}`}>
    {imageSrc ? <img src={imageSrc} alt={`${track.composer} 초상`} /> : <i />}
  </span>
}

export function MiniTrackCard({ track, onOpenTrack }) {
  return <button className="mini-track" data-track-id={track.id} type="button" onClick={() => onOpenTrack(track)}>
    <MiniArtwork track={track} /><span className="mini-copy"><b>{track.composer}</b><strong>{formatTrackTitle(track)}<TrackAlias track={track} /></strong><small>{track.tags.join(' · ')}</small></span>
  </button>
}

function CardIcon({ play = false, filled = false }) {
  return <svg className={filled ? 'filled-icon' : ''} viewBox="0 0 24 24" aria-hidden="true">
    <path d={play ? 'm10 8 6 4-6 4V8Z' : 'M6.5 4.5A2.5 2.5 0 0 1 9 2h6a2.5 2.5 0 0 1 2.5 2.5V22L12 18.5 6.5 22V4.5Z'} />
  </svg>
}

export function FeaturedTrackCard({ track, basis, kicker = '오늘의 대표 곡', isSaved, onOpenTrack, onToggleSave, onOpenShort }) {
  return <article className={`featured-track ${track.tone}`} data-featured-track-id={track.id} role="button" tabIndex="0" aria-label={`${formatTrackTitle(track)} 상세 보기`}
    onClick={() => onOpenTrack(track)} onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenTrack(track) }
    }}>
    <div className="track-card-top"><div className="recommendation-basis">{basis}</div>
      <button type="button" onClick={(event) => { event.stopPropagation(); onToggleSave(track.id) }} aria-label={`${formatTrackTitle(track)} ${isSaved ? '보관 해제' : '보관함에 담기'}`} aria-pressed={isSaved}><CardIcon filled={isSaved} /></button>
    </div>
    <div className="featured-artwork"><MiniArtwork track={track} /></div>
    <div className="track-copy"><p className="track-kicker">{kicker}</p><p className="composer">{track.composer}</p><h2>{formatTrackTitle(track)}<TrackAlias track={track} /></h2><p className="track-description">{track.description}</p><div className="tag-list">{track.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
    {trackDetails[track.id]?.shortPreview ? <button className="play-button" type="button" aria-label="미리듣기" onClick={(event) => { event.stopPropagation(); onOpenShort(track) }}><CardIcon play /></button> : <p className="preview-pending">미리듣기 준비 중</p>}
  </article>
}

export function RelatedRecommendations({ relatedTracks, onOpenTrack, onSeeAll }) {
  if (!relatedTracks.length) return null
  return <section className="similar-section" aria-labelledby="similar-title">
    <div className="section-heading inline-heading"><div><p>MORE TO EXPLORE</p><h2 id="similar-title">비슷한 결의 음악</h2></div><span>옆으로 넘겨보세요</span></div>
    <div className="similar-list">{relatedTracks.slice(0, 8).map((track) => <MiniTrackCard key={track.id} track={track} onOpenTrack={onOpenTrack} />)}</div>
    <button className="recommendations-see-all" type="button" onClick={onSeeAll}>추천곡 더 보기 <span aria-hidden="true">→</span></button>
  </section>
}
