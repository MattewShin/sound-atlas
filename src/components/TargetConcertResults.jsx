import React from 'react'
import { getMatchProgress, getMatchStatus, matchLabels } from '../data/concertMatchStates.js'

export default function TargetConcertResults({ search, results, renderCard, onCheckMore, onStop, onOpenConcert, moreCheckLimit = 10 }) {
  const candidates = search.data.concerts
  const progress = getMatchProgress(candidates)
  const matched = results.filter(({ concert }) => concert.targetMatch?.status === 'matched')
  const busy = ['loading', 'checking'].includes(search.status)
  const retryable = candidates.some(({ targetMatch }) => getMatchStatus(targetMatch) === 'failed' && targetMatch?.retryable)
  return <section className="concert-search-results" aria-label="대상 곡 공연 검색 결과">
    <h2>대상 작품 포함 확인</h2>
    <div className="concert-match-progress" aria-live="polite"><p>{search.data.localOnly ? '직접 등록한 프로그램 먼저 표시' : `공연 기본 정보 ${search.data.apiTotal}건`} · 검색 조건에 맞는 후보 {candidates.length}건</p>
      {search.data.sourceWarnings?.map((warning) => <p key={warning} role="status">{warning}</p>)}
      <p>자료 조회 시도 {progress.attempted}건 / 자료 처리 완료 {progress.completed}건</p>
      <dl className="concert-status-counts" aria-label="후보별 대표 상태 집계">{Object.entries(matchLabels).map(([status, label]) => <div key={status}><dt>{label}</dt><dd>{progress[status]}건</dd></div>)}</dl>
      {busy && <p>{matched.length ? `일치 공연 ${matched.length}개 발견 · 다른 후보 확인 중…` : '프로그램 확인 중…'}</p>}
      {progress.pending > 0 || progress.processing > 0 ? <p>일부 후보만 확인한 결과예요. 아직 미확인 후보가 남아 있어 전체 검색 완료는 아니에요.</p>
        : progress.unresolved > 0 ? <p>자료 조회를 시도했지만 이미지나 식별 정보 때문에 판단하지 못한 공연이 남아 있어요.</p> : <p>모든 후보의 프로그램 자료 확인을 마쳤어요.</p>}
      {search.status === 'stopped' && <p>검색을 중단했어요. 확인된 결과를 유지하며 이어서 확인할 수 있어요.</p>}
      <div className="concert-processing-actions">{(progress.pending > 0 || retryable) && <><button className="concert-detail-button" type="button" disabled={busy} onClick={onCheckMore}>더 찾아보기</button><span>한 번에 최대 {moreCheckLimit}개 후보를 자동 확인해요.</span></>}
      {busy && <button className="concert-official-link" type="button" onClick={onStop}>중단</button>}</div>
    </div>
    {matched.length ? matched.map(renderCard) : <p>{candidates.length === 0 ? '선택한 지역·기간의 예정 공연 후보가 0건이에요.' : progress.unresolved ? '현재까지 확인된 일치 공연이 없어요. 판단하지 못한 후보도 아래에서 확인해주세요.' : '확인한 프로그램에서 해당 작품을 포함한 공연을 찾지 못했어요.'}</p>}
    {Object.entries(matchLabels).filter(([status]) => status !== 'matched').map(([status, label]) => {
      const group = candidates.filter(({ targetMatch }) => getMatchStatus(targetMatch) === status)
      return group.length ? <details className="concert-candidate-group" key={status} data-match-status={status}><summary>{label} · {group.length}건</summary><ul>{group.map((concert) => <li key={concert.kopisId || concert.id}><button type="button" onClick={() => onOpenConcert(concert.id)}>{concert.title}</button><p>{concert.dateFrom || concert.startsAt?.slice(0, 10)} · {concert.venue}{concert.saleState ? ` · 예매 ${concert.saleState}` : ''}</p><p>{concert.targetMatch?.reason || '프로그램 자료를 아직 조회하지 않았어요.'}</p>{concert.sacId && <a href={concert.sourceUrl} target="_blank" rel="noopener noreferrer">예술의전당 공연·예매 정보 ↗</a>}</li>)}</ul></details> : null
    })}
  </section>
}
