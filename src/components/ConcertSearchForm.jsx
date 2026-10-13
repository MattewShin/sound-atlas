import React from 'react'
import { formatConcertDate } from '../data/concertRecommendations.js'
import ConcertRegionPicker from './ConcertRegionPicker.jsx'
import { ConcertTrackLabel } from './ConcertTrackPicker.jsx'

export default function ConcertSearchForm({ region, onSelectRegion, period, onChangePeriod, onSearch, onStop, targetTrack, onClearTarget, search = { status: 'idle' }, connection = { status: 'checking' } }) {
  const loading = ['loading', 'checking'].includes(search.status)
  const query = { region, ...period, targetTrackId: targetTrack.id }
  const changed = search.data && ['region', 'from', 'to'].some((key) => search.data.query[key] !== query[key])
  return <section className="concert-search-panel" aria-labelledby="concert-search-title">
    <h2 id="concert-search-title">선택한 곡의 공연 찾기</h2>
    <div className="concert-target" data-target-track-id={targetTrack.id}><span>현재 찾는 곡</span><ConcertTrackLabel track={targetTrack} /><p>프로그램에 해당 작품이 확인된 공연을 찾아요.{targetTrack.movement && ' 작품명만 안내된 경우 선택한 악장 연주 확정은 아니에요.'}</p><button type="button" onClick={onClearTarget}>곡 변경</button></div>
    <p>지역과 관람 기간을 고르고 검색해주세요. 최대 31일까지 조회할 수 있어요.</p>
    <form onSubmit={(event) => { event.preventDefault(); onSearch(query, false) }}>
      <div className="concert-region-field"><span>공연 지역</span><ConcertRegionPicker region={region} onSelectRegion={onSelectRegion} /></div>
      <div className="concert-period"><label>관람 시작일<input type="date" required value={period.from} onChange={(event) => onChangePeriod({ ...period, from: event.target.value })} /></label>
        <label>관람 종료일<input type="date" required min={period.from} value={period.to} onChange={(event) => onChangePeriod({ ...period, to: event.target.value })} /></label></div>
      <div className="concert-search-actions"><button className="concert-detail-button" type="submit" disabled={loading}>{loading ? '공연 조회 중…' : '공연 찾기'}</button>
        <button className="concert-official-link" type="button" disabled={loading} onClick={() => onSearch(query, true)}>최신 정보로 새로고침</button></div>
    </form>
    {loading && <button className="concert-official-link" type="button" onClick={onStop}>중단</button>}
    <div aria-live="polite">
      {connection.status === 'checking' && <p>공연 검색 연동을 확인하고 있어요.</p>}
      {connection.status === 'needs-setup' && <p className="concert-search-setup" role="status">공연 검색 연동 설정 필요<span>서버의 KOPIS 서비스키와 API 실행 환경을 설정해주세요.</span></p>}
      {search.error && <p className="concert-search-error" role="alert">{search.error}{search.data && <span>마지막으로 조회한 목록을 유지하고 있어요.</span>}</p>}
      {search.data && !search.data.localOnly && <p className="concert-search-time">마지막 조회 · <time dateTime={search.data.fetchedAt}>{formatConcertDate(search.data.fetchedAt)}</time> · 한국 시간<br />{search.data.query.region} · {search.data.query.from} ~ {search.data.query.to} {search.data.fromCache ? '· 최근 검색 결과 재사용' : ''}</p>}
      {changed && <p>검색 조건이 바뀌었어요. ‘공연 찾기’를 누르면 새 조건으로 조회해요. 아래 검색 목록은 마지막 조회 조건의 결과예요.</p>}
      {search.status === 'idle' && <p>검색 버튼을 누를 때 공연 정보를 조회해요.</p>}
    </div>
  </section>
}
