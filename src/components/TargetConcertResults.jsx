import React from 'react'
import { getMatchStatus } from '../data/concertMatchStates.js'
import { getSimilarTargetConcerts } from '../data/concertTargetSearch.js'

export default function TargetConcertResults({ search, results, renderCard, onCheckMore, onStop, onOpenConcert, moreCheckLimit = 10 }) {
  const confirmed = (concert) => concert.kopisId && concert.kopisDetailVerified
    && ['text', 'ocr'].includes(concert.programVerification) && ['text', 'ocr'].includes(concert.targetMatch?.evidenceKind)
    && concert.targetMatch.status === 'matched' && concert.targetMatch.targetTrackId === search.data.targetTrackId
    && concert.targetMatch.workId === search.data.target?.workId
  const candidates = [...new Map(search.data.concerts.filter(({ kopisId }) => kopisId).map((concert) => [concert.kopisId, concert])).values()]
    .map((concert) => concert.targetMatch?.status === 'matched' && !confirmed(concert)
      ? { ...concert, targetMatch: { ...concert.targetMatch, status: 'needs-review', reason: 'KOPIS 상세와 대상 작품의 프로그램 근거를 다시 확인해야 해요.' } } : concert)
  const matched = [...new Map(results.filter(({ concert }) => confirmed(concert)).map((result) => [result.concert.kopisId, result])).values()]
  const matchedIds = new Set(matched.map(({ concert }) => concert.kopisId))
  const similar = getSimilarTargetConcerts(candidates, search.data.query).filter(({ kopisId }) => !matchedIds.has(kopisId)).slice(0, 6)
  const busy = ['loading', 'checking'].includes(search.status)
  const canCheckMore = candidates.some(({ targetMatch }) => getMatchStatus(targetMatch) === 'pending'
    || (getMatchStatus(targetMatch) === 'failed' && targetMatch?.retryable))

  return <section className="concert-search-results" aria-label="대상 곡 공연 검색 결과">
    <section className="concert-exact-section" aria-labelledby="concert-exact-title">
      <h2 id="concert-exact-title">정확히 일치하는 공연</h2>
      {matched.length ? matched.map(renderCard) : <p>{busy ? '선택한 곡이 프로그램에 포함된 공연을 확인하고 있어요.' : '현재까지 선택한 곡과 일치하는 공연을 확인하지 못했어요.'}</p>}
    </section>

    <section className="concert-similar-section" aria-labelledby="concert-similar-title">
      <h2 id="concert-similar-title">비슷한 공연</h2>
      <p>프로그램에서 같은 작곡가와 같은 작품 형식을 확인했지만 Op.·No.가 선택한 곡과 다르거나 확정되지 않은 공연이에요.</p>
      {similar.length ? <ul className="concert-similar-list">{similar.map((concert) => <li key={concert.kopisId}>
        <button type="button" onClick={() => onOpenConcert(concert.id)}>{concert.title}</button>
        <p>{concert.dateFrom}{concert.dateTo !== concert.dateFrom && ` ~ ${concert.dateTo}`} · {concert.venue}</p>
      </li>)}</ul> : <p>현재까지 같은 작곡가·작품 형식의 공연을 확인하지 못했어요.</p>}
    </section>

    <div className="concert-search-feedback" aria-live="polite">
      {busy && <p>공연 프로그램을 확인하고 있어요.</p>}
      {search.status === 'stopped' && <p>검색을 중단했어요. 확인된 결과는 그대로 유지됩니다.</p>}
      <div className="concert-processing-actions">
        {canCheckMore && !busy && <><button className="concert-detail-button" type="button" onClick={onCheckMore}>더 찾아보기</button><span>비슷한 공연의 프로그램을 최대 {moreCheckLimit}개씩 더 확인해요.</span></>}
        {busy && <button className="concert-official-link" type="button" onClick={onStop}>중단</button>}
      </div>
    </div>
  </section>
}
