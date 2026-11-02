import React, { useMemo, useState } from 'react'
import { formatTrackTitle } from '../data/emotions.js'
import { getReferenceRecommendations, searchReferenceTracks } from '../data/referenceTrackSearch.js'

export default function ReferenceTrackExplorer({ tracks, referenceId, onSelectReference, onOpenTrack, onToggleSave, isTrackSaved }) {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(20)
  const results = useMemo(() => searchReferenceTracks(tracks, query), [tracks, query])
  const reference = tracks.find(({ id }) => id === referenceId)
  const recommendations = useMemo(() => getReferenceRecommendations(tracks, reference), [tracks, reference])
  return <section className="reference-explorer" aria-labelledby="reference-title">
    <div className="section-heading"><p>FIND YOUR NEXT PIECE</p><h2 id="reference-title">아는 곡에서 새로운 곡으로</h2></div>
    <p className="reference-guide">작곡가나 작품을 한글·영어로 찾아 기준곡을 선택해 주세요. 등록된 곡 안에서 검색해요.</p>
    <label className="reference-search-label" htmlFor="reference-search">작곡가 · 곡명 · 작품번호</label>
    <input id="reference-search" className="reference-search" type="search" maxLength={160} value={query}
      placeholder="쇼팽 발라드 4번 / Chopin Op.52" onChange={(event) => { setQuery(event.target.value); setCount(20) }} />
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
      <article className="reference-selected" data-reference-track-id={reference.id}>
        <p className="reference-eyebrow">선택한 기준곡</p><h3>{formatTrackTitle(reference)}{reference.alias ? ` [${reference.alias}]` : ''}</h3>
        <div className="reference-actions"><button type="button" onClick={() => onOpenTrack(reference)}>곡 상세 보기</button>
          <button type="button" onClick={() => { onSelectReference(null); document.getElementById('reference-search')?.focus() }}>기준곡 변경</button></div>
      </article>
      <h3 className="reference-results-heading">이 곡과 비슷한 감정의 음악</h3>
      <p className="reference-guide">기존 9가지 감정 점수의 분포와 강도를 비교해요. 선율·화성·연주 난이도의 유사도를 뜻하지 않아요. 기준곡과 같은 작품의 다른 악장은 제외해요.</p>
      <ul className="reference-recommendations">{recommendations.map(({ track, reason }) => <li key={track.id} data-recommended-track-id={track.id}>
        <button className="reference-track-link" type="button" onClick={() => onOpenTrack(track)}><strong>{formatTrackTitle(track)}{track.alias ? ` [${track.alias}]` : ''}</strong><span>{track.description}</span><small>{reason}</small></button>
        <button className="reference-save" type="button" aria-label={`${formatTrackTitle(track)} ${isTrackSaved(track.id) ? '보관 해제' : '보관함에 담기'}`} aria-pressed={isTrackSaved(track.id)} onClick={() => onToggleSave(track.id)}>{isTrackSaved(track.id) ? '보관 중' : '보관하기'}</button>
      </li>)}</ul>
      {!recommendations.length && <p role="status">비교할 수 있는 다른 곡이 아직 없어요. 다른 기준곡을 골라보세요.</p>}
    </> : !query.trim() && <div className="reference-empty"><p>예를 들어 이렇게 검색해 보세요.</p><div className="reference-examples">{['쇼팽 발라드 4번', 'Liszt Liebestraum', '베토벤 소나타'].map((example) => <button type="button" key={example} onClick={() => { setQuery(example); setCount(20) }}>{example}</button>)}</div><p>곡을 선택하면 감정 성향이 가까운 다른 작품을 추천해 드려요.</p></div>}
  </section>
}
