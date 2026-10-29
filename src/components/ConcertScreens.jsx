import React,{useEffect,useRef,useState} from 'react'
import ConcertSearchForm from './ConcertSearchForm.jsx'
export function ConcertImage({src,alt='',className=''}){
 const [failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[src])
 return src&&!failed?<img className={className} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={'concert-image-placeholder '+className} role="img" aria-label="이미지 없음">이미지 준비 중</div>
}
export function ConcertCard({concert,onOpenConcert}){
 return <article className="concert-card concert-browser-card" data-kopis-id={concert.kopisId}>
  <ConcertImage src={concert.posterUrl} className="concert-poster-thumb"/>
  <div className="concert-browser-card-copy"><h2>{concert.title}</h2><p className="concert-date">{concert.dateFrom} ~ {concert.dateTo}</p><p className="concert-venue">{concert.venue}</p><p>{concert.region} · {concert.performanceStatus}</p><button className="concert-detail-button" type="button" onClick={()=>onOpenConcert(concert.kopisId)}>공연 상세 보기 <span aria-hidden="true">→</span></button></div>
 </article>
}
export function ConcertScreen({search,region,onSelectRegion,period,onChangePeriod,keyword,onChangeKeyword,onSearch,onLoadMore,onOpenConcert,onGoExplore}){
 const data=search.data,busy=['loading','loading-more'].includes(search.status),changed=data&&['region','from','to','q'].some(k=>data.query[k]!==({region,...period,q:keyword.trim()})[k])
 return <><header className="concert-coming-header" id="concert-top"><div className="concert-topbar"><p>ON STAGE</p></div><h1>공연 찾기</h1><span>가까운 날, 가까운 곳에서<br/>클래식 공연을 만나보세요.</span></header>
 <main className="concert-main concert-browser-main"><ConcertSearchForm {...{region,onSelectRegion,period,onChangePeriod,keyword,onChangeKeyword,onSearch,search}}/>
  <section className="concert-search-results" aria-label="클래식 공연 목록" aria-busy={busy}>
   {changed&&<p role="status">조건이 바뀌었어요. 공연 조회를 누르면 새 조건으로 찾아요. 아래는 이전 조건의 목록이에요.</p>}
   {search.status==='loading'&&<p role="status">KOPIS 공연 정보를 불러오고 있어요.</p>}
   {search.error&&<div className="concert-search-error" role="alert"><p>{search.error}</p><button type="button" onClick={()=>data?onLoadMore():onSearch({region,...period,q:keyword,page:1},true)}>다시 시도</button>{data&&<p>추가 조회에 실패했어요. 앞서 조회한 목록을 표시하고 있어요.</p>}</div>}
   {data&&<><p className="concert-result-count" role="status">전체 {data.total}건 중 {data.concerts.length}건 표시</p><p className="concert-search-time">{data.query.region} · {data.query.from} ~ {data.query.to} · KOPIS</p>
    {data.total===0?<p className="concert-empty">조건에 맞는 공연이 없어요. 지역이나 날짜를 바꿔보세요.</p>:data.concerts.map(c=><ConcertCard key={c.kopisId} concert={c} onOpenConcert={onOpenConcert}/>)}
    {data.hasMore&&<button className="concert-load-more" type="button" disabled={busy} onClick={onLoadMore}>{search.status==='loading-more'?'공연 더 불러오는 중…':'더 불러오기'}</button>}
   </>}
  </section><button className="concert-coming-return" type="button" onClick={onGoExplore}>음악 탐색으로 돌아가기</button>
 </main></>
}
export function ConcertDetailScreen({detail,onBack,onRetry}){
 const heading=useRef(null),c=detail.data
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[detail.status])
 return <><header className="library-header concert-detail-header"><button className="recommendation-back" type="button" onClick={onBack}>← 공연 목록으로</button><p>ON STAGE</p><h1 ref={heading} tabIndex={-1}>{c?.title||'공연 상세'}</h1></header>
 <main className="concert-main concert-detail-main">
  {detail.status==='loading'&&<p role="status">공연 상세를 불러오고 있어요.</p>}
  {detail.error&&<div role="alert" className="concert-search-error"><p>{detail.error}</p><button type="button" onClick={onRetry}>다시 시도</button></div>}
  {c&&<><ConcertImage src={c.posterUrl} alt={c.title+' 포스터'} className="concert-detail-poster"/>
   <section className="concert-details-panel" aria-label="공연 기본 정보"><dl>{[['공연 기간',c.dateFrom+' ~ '+c.dateTo],['공연 시간',c.scheduleText],['공연 길이',c.runtime],['공연장',c.venue],['지역',c.region],['관람 연령',c.age],['티켓 가격',c.ticketPrice],['출연진',c.performers],...(c.organizations||[]).map(o=>[o.label,o.name])].filter(([,v])=>v).map(([label,value],i)=><div key={label+i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
   <section className="concert-booking" aria-labelledby="concert-booking-title"><h2 id="concert-booking-title">예매 안내</h2>{c.bookingLinks?.length?c.bookingLinks.map((link,i)=><a className="concert-booking-link" key={i} href={link.url} target="_blank" rel="noopener noreferrer">{link.name} <span aria-hidden="true">↗</span></a>):<p>등록된 예매 링크가 없어요.</p>}</section>
   <section className="concert-introduction" aria-labelledby="concert-introduction-title"><h2 id="concert-introduction-title">공연 소개</h2>{c.introductionImages?.length?c.introductionImages.map((src,i)=><ConcertImage key={src} src={src} alt={'공연 소개 이미지 '+(i+1)} className="concert-introduction-image"/>):<div className="concert-image-placeholder">등록된 소개 이미지가 없어요.</div>}</section>
   <div className="concert-source"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">KOPIS 공연 정보 ↗</a><p>출처: 공연예술통합전산망(KOPIS) · 출연진과 공연 정보는 변경될 수 있어요.</p></div>
  </>}
 </main></>
}
