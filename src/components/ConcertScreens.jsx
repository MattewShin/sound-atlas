import React, { useEffect, useRef } from 'react'
import ConcertRegionPicker from './ConcertRegionPicker.jsx'
import { emotions, emotionLabel, getRepresentativeEmotions } from '../data/emotions.js'
import { formatConcertDate, getConcertTicketStatus } from '../data/concertRecommendations.js'
import ConcertSearchForm from './ConcertSearchForm.jsx'
import TargetConcertResults from './TargetConcertResults.jsx'
import { matchLabels, getMatchStatus } from '../data/concertMatchStates.js'

function MatchBasis({ concert }) {
  const match = concert.targetMatch
  return match ? <div className="concert-match-basis"><strong>{matchLabels[getMatchStatus(match)]}</strong><p>{match.reason}</p>{match.scope?.kind === 'complete-work' && <p>전곡 안내</p>}{match.scope?.kind === 'movement-excerpt' && <p>악장 발췌 안내 · {match.scope.movementNumbers.join('·')}악장</p>}{match.evidence && !/^https?:/.test(match.evidence) && <blockquote>{match.evidence}</blockquote>}{match.evidenceSourceUrl && <a href={match.evidenceSourceUrl} target="_blank" rel="noopener noreferrer">프로그램 근거 이미지 보기 ↗</a>}</div> : null
}

function OfficialSource({ concert }) {
  return <div className="concert-source">
    <a className="concert-official-link" href={concert.sourceUrl} target="_blank" rel="noopener noreferrer">{concert.programStatus === 'verified' ? '공식 공연 정보' : 'KOPIS 공연 정보'} <span aria-hidden="true">↗</span></a>
    <p>{concert.sourceLabel} · {concert.verifiedOn ? <>정보 확인일 <time dateTime={concert.verifiedOn}>{concert.verifiedOn}</time></> : <>정보 조회 <time dateTime={concert.fetchedAt}>{formatConcertDate(concert.fetchedAt)}</time> · 한국 시간</>}</p>
  </div>
}

function ConcertFacts({ concert, now }) {
  return <>
    <p className="concert-date">{concert.startsAt ? <><time dateTime={concert.startsAt}>{formatConcertDate(concert.startsAt)}</time> · 한국 시간</> : <><time dateTime={concert.dateFrom}>{concert.dateFrom}</time> ~ <time dateTime={concert.dateTo}>{concert.dateTo}</time><br />회차별 시간은 공연 정보에서 확인</>}</p>
    <p className="concert-venue">{concert.venue}</p>
    <p className="concert-ticket-status">{getConcertTicketStatus(concert, now)}</p>
    {concert.ticketOpensAt && <p className="concert-ticket-time">{concert.ticketAudience} 티켓 오픈<br /><time dateTime={concert.ticketOpensAt}>{formatConcertDate(concert.ticketOpensAt)}</time> · 한국 시간</p>}
  </>
}

function AnalysisReason({ result }) {
  return <div className="concert-reason" aria-label="공연 추천 근거">
    <strong>{result.isRecommended ? '이 공연을 살펴볼 이유' : '공연 안내'}</strong>
    <ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    <p className="concert-analysis-scope">{result.scope}</p>
  </div>
}

export function ConcertCard({ result, now, onOpenConcert }) {
  const { concert, program } = result
  return <article className="concert-card">
    <p className="concert-eyebrow">{result.isRecommended ? '음악과 연결된 공연' : '예정 공연'}</p>
    <h2>{concert.title}</h2>
    <MatchBasis concert={concert} />
    <ConcertFacts concert={concert} now={now} />
    <div className="concert-card-program"><h3>프로그램과 연결된 작품</h3>{program.length ? program.map((work) => <p key={work.id}>{work.title}<small>{work.ratedTracks.length ? '등록된 악장 평가와 연결' : '아직 분석하지 않은 작품'}</small></p>) : <p>{concert.programStatus === 'needs-review' ? '소개 자료 확보 · 작품 연결 확인 필요' : '프로그램 미확보'}<small>일반 검색 결과 · 취향 적합도 미계산</small></p>}</div>
    <AnalysisReason result={result} />
    <button className="concert-detail-button" type="button" onClick={() => onOpenConcert(concert.id)}>{program.length ? '프로그램과 악장 살펴보기' : '공연 상세·프로그램 자료 보기'} <span aria-hidden="true">→</span></button>
    <OfficialSource concert={concert} />
  </article>
}

export function ConcertScreen({ results, searchResults = [], now, region, onSelectRegion, mode, onSelectMode, selectedKeys, onToggleEmotion, onGoExplore, onOpenConcert, searchControls }) {
  const uniqueSearch = [...new Map(searchResults.map((result) => [result.concert.kopisId || result.concert.id, result])).values()]
  const searchIds = new Set(uniqueSearch.map(({ concert }) => concert.id))
  const registered = results.filter(({ concert }) => !searchIds.has(concert.id))
  const renderCard = (result) => <ConcertCard key={result.concert.id} result={result} now={now} onOpenConcert={onOpenConcert} />
  return <>
    <header className="concert-coming-header" id="concert-top">
      <div className="concert-topbar"><p>ON STAGE</p><ConcertRegionPicker region={region} onSelectRegion={onSelectRegion} /></div>
      <h1>공연에서 만나는 클래식</h1><span>고른 감정과 보관한 음악에서<br />무대와의 연결을 찾아보세요.</span>
    </header>
    <main className="concert-main">
      {searchControls && <ConcertSearchForm region={region} {...searchControls} />}
      <section className="concert-controls" aria-label="공연 추천 설정">
        <div className="recommendation-mode-control" role="group" aria-label="공연 추천 방식 선택">
          <button type="button" className={mode !== 'library' ? 'selected' : ''} aria-pressed={mode !== 'library'} onClick={() => onSelectMode('keyword')}>선택한 감정 기반</button>
          <button type="button" className={mode === 'library' ? 'selected' : ''} aria-pressed={mode === 'library'} onClick={() => onSelectMode('library')}>보관함 기반</button>
        </div>
        {mode !== 'library' && <><p>음악 탐색에서 고른 느낌을 이어서 사용해요. 최대 3개까지 바꿀 수 있어요.</p>
          <div className="keyword-choice-list" role="group" aria-label="공연 음악 느낌 선택">{emotions.map(({ key, label }) => <button key={key} type="button" className={selectedKeys.includes(key) ? 'selected' : ''} aria-pressed={selectedKeys.includes(key)} disabled={selectedKeys.length === 3 && !selectedKeys.includes(key)} onClick={() => onToggleEmotion(key)}>{label}</button>)}</div>
          <p>{selectedKeys.length ? `선택한 느낌: ${selectedKeys.map(emotionLabel).join(' · ')}` : '감정을 고르기 전에는 일반 공연 정보를 보여드려요.'}</p>
        </>}
      </section>
      {searchControls?.search.data?.targetTrackId ? <TargetConcertResults search={searchControls.search} results={uniqueSearch} renderCard={renderCard} onCheckMore={searchControls.onCheckMore} onStop={searchControls.onStop} moreCheckLimit={searchControls.connection?.moreCheckLimit} onOpenConcert={onOpenConcert} /> : searchControls?.search.data && <section className="concert-search-results" aria-label="KOPIS 검색 결과"><h2>KOPIS 검색 결과</h2>
        {searchControls.search.status === 'error' && <p>아래는 마지막 성공 조회의 결과예요. 이번 요청은 실패했어요.</p>}
        <p>조회 결과 {searchControls.search.data.concerts.length}건 · 예정·진행 중인 일반 결과 {searchResults.length}개</p>
        {searchControls.search.data.concerts.length === 0 ? <p>선택한 지역·기간의 클래식 공연 검색 결과가 0건이에요.</p>
          : uniqueSearch.length ? uniqueSearch.map(renderCard)
            : <p>검색 공연이 확인된 등록 공연과 병합되었거나 종료되어, 아래 등록 공연 또는 다른 기간을 살펴보세요.</p>}
      </section>}
      {!searchControls?.targetTrack && registered.length > 0 && <details className="concert-known-section" open><summary>직접 등록한 공연 · {registered.length}개</summary>
      <h2 className="concert-known-heading">직접 등록한 공연</h2><p className="concert-known-guide">확인된 프로그램과 악장 연결을 볼 수 있어요. API 검색 조건과 별도로 유지해요.</p>
      <p className="concert-list-count">직접 등록한 예정 공연 {registered.length}개</p>
      {registered.map(renderCard)}
      </details>}<button className="concert-coming-return" type="button" onClick={onGoExplore}>음악 탐색으로 돌아가기</button>
    </main>
  </>
}

export function ConcertMovement({ work, track, detail, isSaved, onOpenTrack, onOpenShort }) {
  const preview = detail?.shortPreview
  const canPreview = preview?.provider === 'youtube' && Boolean(preview.videoId)
  const scoreTags = getRepresentativeEmotions(track)
  return <li>
    <div className="concert-movement-heading"><strong>{track.movement || track.title}</strong>{isSaved && <span>✓ 보관됨</span>}</div>
    <p className="concert-movement-scores">{scoreTags.length ? scoreTags.map(({ key, label }) => `${label} ${track.emotionScores[key]}/5`).join(' · ') : '대표 감정 평가 없음'}</p>
    <div className="concert-movement-actions"><button type="button" onClick={() => onOpenTrack(track)} aria-label={`${work.title} ${track.movement} 곡 상세`}>곡 상세·보관</button>
      {canPreview ? <button type="button" onClick={() => onOpenShort(track)} aria-label={`${work.title} ${track.movement} 미리듣기`}>미리듣기</button> : <span>미리듣기 준비 중</span>}</div>
  </li>
}

export function ConcertDetailScreen({ result, now, onBack, onOpenTrack, onOpenShort, details = {}, isTrackSaved, onLoadProgram, programRequest }) {
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])
  const { concert, program } = result
  return <>
    <header className="library-header concert-detail-header"><button className="recommendation-back" type="button" onClick={onBack}>← 공연 목록으로</button><p>PROGRAM</p><h1 ref={headingRef} tabIndex={-1}>{concert.title}</h1><span>{concert.venue}</span></header>
    <main className="concert-main concert-detail-main">
      <MatchBasis concert={concert} />
      <section className="concert-details-panel"><ConcertFacts concert={concert} now={now} />{(concert.conductor || concert.pianist) && <p>{concert.conductor && <>지휘 · {concert.conductor}<br /></>}{concert.pianist && <>피아노 협연 · {concert.pianist}</>}</p>}{concert.scheduleText && <p>공연 시간 안내 · {concert.scheduleText}</p>}<AnalysisReason result={result} /></section>
      <section className="concert-program" aria-labelledby="concert-program-title"><h2 id="concert-program-title">{['text', 'ocr'].includes(concert.programVerification) ? '확보한 프로그램과 연결 작품' : '전체 프로그램'}</h2>
        <p>{program.length ? '공식 안내는 작품 단위예요. 아래 악장은 앱에 등록된 평가와 감상 자료를 연결한 목록이에요.' : '공연 기본 정보와 프로그램 확인은 별도 단계예요. 소개 자료만으로 작품과 악장 연결을 확정하지 않아요.'}</p>
        {!program.length && <p>{concert.programStatus === 'needs-review' ? '프로그램 자료 확인 필요 · 일반 검색 결과' : '프로그램 미확보 · 일반 검색 결과'}</p>}
        {concert.kopisId && onLoadProgram && <div className="concert-program-request"><button className="concert-official-link" type="button" disabled={programRequest?.status === 'loading'} onClick={() => onLoadProgram(concert, false)}>{programRequest?.status === 'loading' ? '자료 조회 중…' : '상세·프로그램 자료 확인'}</button>
          {concert.programFetchedAt && <><p>자료 조회 · {formatConcertDate(concert.programFetchedAt)} · 한국 시간</p><button className="concert-official-link" type="button" disabled={programRequest?.status === 'loading'} onClick={() => onLoadProgram(concert, true)}>프로그램 자료 새로고침</button></>}
          {programRequest?.error && <p role="alert" className="concert-search-error">{programRequest.error}</p>}</div>}
        {concert.programEvidence && <section className="concert-program-evidence"><h3>KOPIS 소개 자료</h3><p>프로그램이 포함되어 있는지 원문에서 확인해주세요. 작품 연결을 검증하기 전에는 추천 점수에 반영하지 않아요.</p>
          {concert.programEvidence.text && <p className="concert-evidence-text">{concert.programEvidence.text}</p>}
          {concert.programEvidence.imageUrls.map((url, i) => <a key={url} className="concert-official-link" href={url} target="_blank" rel="noopener noreferrer">공연 소개 이미지 {i + 1} 보기 ↗</a>)}
          {!concert.programEvidence.text && !concert.programEvidence.imageUrls.length && <p>API에 소개 텍스트나 이미지가 없어요.</p>}
        </section>}
        {concert.programOcr && <section className="concert-ocr-evidence"><h3>이미지에서 읽은 자료와 프로그램 근거</h3><p>{concert.programOcr.context.reason}</p><p>이미지 {concert.programOcr.totalImages}개 중 {concert.programOcr.processedImages}개를 읽었어요.</p>{concert.programOcr.records.map((record, index) => <details key={record.sourceUrl}><summary>소개 이미지 {index + 1} · {record.status === 'completed' ? '읽은 원문 확인' : '읽지 못한 자료'}</summary><a className="concert-official-link" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">원본 이미지 보기 ↗</a><p>처리 시각 · {formatConcertDate(record.processedAt)}</p>{record.original?.text && <pre>{record.original.text}</pre>}{record.failureReason && <p>{record.failureReason}</p>}{record.reviewReason && <p>{record.reviewReason}</p>}</details>)}</section>}
        {program.map((work) => <article className="concert-work" key={work.id}>
          <h3>{work.title}</h3>
          {!work.ratedTracks.length && <p className="concert-unrated">아직 분석하지 않은 작품 · 추천 점수 계산에서 제외</p>}
          {work.linkedTracks.length > 0 && <ul className="concert-movements">{work.linkedTracks.map((track) => <ConcertMovement key={track.id} work={work} track={track} detail={details[track.id]} isSaved={isTrackSaved?.(track.id)} onOpenTrack={onOpenTrack} onOpenShort={onOpenShort} />)}</ul>}
        </article>)}
      </section>
      <p className="concert-program-note">출연진 및 프로그램은 변경될 수 있어요. 최신 안내와 예매 현황은 공식 페이지에서 확인해주세요.</p>
      <OfficialSource concert={concert} />
    </main>
  </>
}
