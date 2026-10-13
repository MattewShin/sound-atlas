import React, { useState } from 'react'
import { searchConcertTracks } from '../data/concertTrackSearch.js'

export function ConcertTrackLabel({ track }) {
  const title = track.title.startsWith(track.composer) ? track.title.slice(track.composer.length).trim() : track.title
  return <><strong>{track.composer} · {title}</strong>
    <small>{[track.opus != null && `Op.${track.opus}`, track.number != null && `No.${track.number}`, track.catalogue && `${track.catalogue}${track.catalogueNumber || ''}`, track.movement].filter(Boolean).join(' · ')}</small></>
}

export default function ConcertTrackPicker({ tracks, savedTracks, onSelectTrack }) {
  const [query, setQuery] = useState('')
  const matches = searchConcertTracks(tracks, query)
  return <section className="concert-track-picker" aria-labelledby="concert-track-picker-title">
    <h2 id="concert-track-picker-title">어떤 곡의 공연을 찾으시나요?</h2>
    <p>찾고 싶은 곡을 먼저 선택해주세요. 보관한 곡이나 곡 검색을 통해 실제 연주 예정인 공연을 찾을 수 있어요.</p>
    <h3>보관한 곡에서 선택</h3>
    {savedTracks.length ? <ul className="concert-track-options">{savedTracks.map((track) => <li key={track.id}><button type="button" onClick={() => onSelectTrack(track)} data-track-id={track.id}><ConcertTrackLabel track={track} /></button></li>)}</ul>
      : <p>보관한 곡이 없어요. 아래에서 곡을 검색해주세요.</p>}
    <label className="concert-track-search-label" htmlFor="concert-track-query">곡명 또는 작곡가로 검색</label>
    <input id="concert-track-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 쇼팽 발라드 Op.23" autoComplete="off" />
    {query.trim() && <div aria-live="polite">{matches.length ? <ul className="concert-track-options concert-catalog-options">{matches.map((track) => <li key={track.id}><button type="button" onClick={() => onSelectTrack(track)} data-track-id={track.id}><ConcertTrackLabel track={track} /></button></li>)}</ul>
      : <p>등록된 곡 중 일치하는 곡이 없어요. 작곡가나 작품번호를 바꿔 검색해보세요.</p>}</div>}
  </section>
}
