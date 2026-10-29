import React from 'react'
import ConcertRegionPicker from './ConcertRegionPicker.jsx'
export default function ConcertSearchForm({region,onSelectRegion,period,onChangePeriod,keyword,onChangeKeyword,onSearch,search}){
 const loading=['loading','loading-more'].includes(search.status)
 return <section className="concert-search-panel" aria-labelledby="concert-search-title">
  <h2 id="concert-search-title">날짜와 지역으로 찾기</h2>
  <form onSubmit={e=>{e.preventDefault();onSearch({region,...period,q:keyword,page:1})}}>
   <div className="concert-region-field"><span>공연 지역</span><ConcertRegionPicker region={region} onSelectRegion={onSelectRegion}/></div>
   <div className="concert-period"><label>시작일<input type="date" required value={period.from} onChange={e=>onChangePeriod({...period,from:e.target.value})}/></label><label>종료일<input type="date" required min={period.from} value={period.to} onChange={e=>onChangePeriod({...period,to:e.target.value})}/></label></div>
   <label className="concert-keyword">공연명 또는 공연장<input type="search" maxLength={100} value={keyword} placeholder="공연명이나 공연장을 입력하세요" onChange={e=>onChangeKeyword(e.target.value)}/></label>
   <p className="concert-filter-help">서양음악(클래식) · 공연예정·공연중 · 최대 31일</p>
   <button className="concert-detail-button" type="submit" disabled={loading}>{loading?'공연 불러오는 중…':'공연 조회'}</button>
  </form>
 </section>
}
