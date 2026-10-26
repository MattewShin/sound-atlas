import { createSupabaseRest } from './supabaseRest.mjs'
import { ConcertApiError, apiDate, safeUrl } from './kopisData.mjs'
import { koreaDate, MAX_CONCERT_SEARCH_DAYS, validateConcertQuery } from '../src/data/concertSearchConfig.js'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { CATALOG_JSON, CATALOG_HASH } from './programAnalysis.mjs'
import { getProgramSearchVersion } from './programRollout.mjs'
import { workIdentity, confirmationValidity,canonicalIdentityJson } from './programWorkIdentity.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'
const currentCatalog={...JSON.parse(CATALOG_JSON),catalog_hash:CATALOG_HASH}
const concertFields='id,kopis_id,title,venue,region,start_date,end_date,performance_status,synced_at'
// Neither status projection selects source text, quotes or identity snapshots.
const selection='id,concert_id,track_id,work_id,relation,outcome,review_status,effective_status,is_effectively_confirmed,analysis_is_current,stale_reason,matcher_version,catalog_hash,confirmed_work_identity_hash,confirmation_matcher_version,confirmation_pipeline_version,source_url,concerts!inner('+concertFields+')'
const officialSelection='id,candidate_id,analysis_id,concert_id,track_id,work_id,source_kind,status,source_hash,payload_hash,catalog_hash,matcher_version,decision_version,evidence_hash,candidate_snapshot_hash,work_identity_hash,verification_hash,analysis_is_current,policy_enabled,relation,outcome,stale_reason,is_effectively_confirmed,concerts!inner('+concertFields+')'
const sourceSelection=concertFields+',program_context_revision,kopis_detail_text,kopis_detail_text_hash'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const states=['공연예정','공연중']
const unavailable=()=>new ConcertApiError('DB_SEARCH_UNAVAILABLE','확인된 공연을 조회하지 못했어요. 잠시 후 다시 시도해주세요.',503)
const kopisUrl=id=>`https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=${id}`
const same=(a,b)=>canonicalIdentityJson(a)===canonicalIdentityJson(b)
const visible=c=>Object.fromEntries(concertFields.split(',').map(k=>[k,c[k]]))

export const createSupabaseConcertSearch=({env=process.env,fetchImpl=fetch,delay,now=Date.now}={})=>{
  let request,searchVersion
  try{searchVersion=getProgramSearchVersion(env)}catch{/* fail closed */}
  try{request=createSupabaseRest({env,delay,fetchImpl:(url,init)=>fetchImpl(url,{...init,headers:{...init.headers,Prefer:'count=exact'}})})}catch{/* sanitized below */}
  const config=()=>({backend:'supabase',configured:Boolean(request&&searchVersion),analysisVersion:searchVersion||null,cacheTtlMs:0,maxSearchDays:MAX_CONCERT_SEARCH_DAYS})
  // Keep the original page size/cap (100/50). Exact ranges detect truncation;
  // a short page alone is not proof of completeness. No missing-view fallback.
  const readAll=async(path,params)=>{
    const all=[];let lastId,total
    for(let page=0;page<50;page++){
      const result=await request(path,{params:{...params,order:'id.asc',limit:'100',
        ...(lastId?(params.id?{and:`(id.gt.${lastId})`}:{id:`gt.${lastId}`}):{})},decode:async response=>({rows:await response.json(),range:response.headers?.get('content-range')})})
      const data=result.rows,m=/^(\d+)-(\d+)\/(\d+)$/.exec(result.range||''),empty=result.range==='*/0'
      if(!Array.isArray(data)||data.length>100||(!m&&!empty))throw unavailable()
      const remaining=empty?0:Number(m[3])
      if(!Number.isSafeInteger(remaining)||remaining<0||(total!==undefined&&remaining!==total-all.length))throw unavailable()
      if(total===undefined)total=remaining
      if(!data.length){if(remaining!==0)throw unavailable();return all}
      if(!m||Number(m[1])!==0||Number(m[2])!==data.length-1||remaining<data.length)throw unavailable()
      for(const row of data){
        if(!uuid.test(row?.id)||(lastId&&row.id<=lastId))throw unavailable()
        lastId=row.id;all.push(row)
      }
      if(all.length===total)return all
    }
    throw unavailable()
  }
  const readConcerts=async ids=>{
    const result=new Map(),sorted=[...ids].sort()
    for(let i=0;i<sorted.length;i+=100){
      const batch=sorted.slice(i,i+100),data=await readAll('concerts',{select:sourceSelection,id:`in.(${batch.join(',')})`})
      if(data.length!==batch.length)throw unavailable()
      for(const c of data){
        if(!batch.includes(c.id)||result.has(c.id)||!/^PF\d{1,12}$/.test(c.kopis_id)
          ||typeof c.title!=='string'||!c.title.trim()||typeof c.venue!=='string'||!c.venue.trim()
          ||typeof c.region!=='string'||!apiDate(c.start_date)||!apiDate(c.end_date)||c.start_date>c.end_date
          ||typeof c.performance_status!=='string'||!Number.isFinite(Date.parse(c.synced_at))
          ||!Number.isSafeInteger(c.program_context_revision)||c.program_context_revision<0
          ||!(c.kopis_detail_text===null||typeof c.kopis_detail_text==='string')
          ||!(c.kopis_detail_text_hash===null||typeof c.kopis_detail_text_hash==='string'))throw unavailable()
        // Raw text stays in this request-local private map, never logs or DTOs.
        result.set(c.id,c)
      }
    }
    return result
  }
  const search=async input=>{
    let query
    try{query=validateConcertQuery(input)}catch{throw new ConcertApiError('INVALID_QUERY','지역과 관람 기간을 올바르게 선택해주세요. 최대 31일까지 조회할 수 있어요.',400)}
    const target=typeof input.targetTrackId==='string'&&getTrackTarget(input.targetTrackId)
    if(!target)throw new ConcertApiError('INVALID_TARGET','등록된 곡 ID를 선택해주세요.',400)
    const identity=workIdentity(currentCatalog,target.workId)
    if(!identity)throw unavailable()
    if(!searchVersion)throw new ConcertApiError('PROGRAM_SEARCH_VERSION_INVALID','공연 검색 버전 설정을 확인해주세요.',503)
    if(!request)throw new ConcertApiError('DB_SEARCH_NOT_CONFIGURED','확인된 공연 검색의 서버 연결 설정이 필요해요.',503)
    const timestamp=now(),today=koreaDate(timestamp),from=query.from>today?query.from:today,concerts=new Map()
    if(query.to>=today)try{
      const common={track_id:`eq.${target.trackId}`,work_id:`eq.${target.workId}`,is_effectively_confirmed:'eq.true',analysis_is_current:'eq.true',
        stale_reason:'is.null',relation:'eq.EXACT',outcome:'eq.MATCHED','concerts.start_date':`lte.${query.to}`,'concerts.end_date':`gte.${from}`,
        'concerts.performance_status':'in.(공연예정,공연중)',...(query.region==='전국'?{}:{'concerts.region':`eq.${query.region}`})}
      const ocrParams={...common,select:selection,review_status:'eq.CONFIRMED',effective_status:'eq.CONFIRMED',matcher_version:`eq.${searchVersion}`,
        confirmed_work_identity_hash:`eq.${identity.hash}`,confirmation_matcher_version:`eq.${searchVersion}`,confirmation_pipeline_version:`eq.${EASYOCR_PIPELINE_VERSION}`}
      const officialParams={...common,select:officialSelection,status:'eq.CONFIRMED',source_kind:'eq.KOPIS_DETAIL_TEXT',matcher_version:'eq.stored-program-4',
        decision_version:'eq.program-text-confirm-1',policy_enabled:'eq.true',work_identity_hash:`eq.${identity.hash}`}
      const loadStatuses=async()=>({ocr:await readAll('concert_program_candidate_status',ocrParams),official:await readAll('concert_program_text_confirmation_status',officialParams)})
      const initial=await loadStatuses(),ids=new Set()
      for(const [kind,rows]of [['ocr',initial.ocr],['official',initial.official]])for(const row of rows){
        if(!uuid.test(row.concert_id)||!row.concerts||row.concerts.id!==row.concert_id
          ||['track_id','work_id','relation','outcome','matcher_version','catalog_hash'].some(k=>typeof row[k]!=='string')
          ||typeof row.is_effectively_confirmed!=='boolean'||typeof row.analysis_is_current!=='boolean'
          ||!(row.stale_reason===null||typeof row.stale_reason==='string'))throw unavailable()
        if(kind==='official'&&(!uuid.test(row.candidate_id)||!uuid.test(row.analysis_id)||typeof row.policy_enabled!=='boolean'
          ||['source_kind','status','decision_version'].some(k=>typeof row[k]!=='string')
          ||['source_hash','payload_hash','catalog_hash','evidence_hash','candidate_snapshot_hash','work_identity_hash','verification_hash'].some(k=>!hash(row[k]))))throw unavailable()
        if(kind==='ocr'&&(['review_status','effective_status'].some(k=>typeof row[k]!=='string')
          ||!Object.hasOwn(row,'confirmed_work_identity_hash')||!Object.hasOwn(row,'confirmation_matcher_version')
          ||!Object.hasOwn(row,'confirmation_pipeline_version')))throw unavailable()
        ids.add(row.concert_id)
      }
      const sources=await readConcerts(ids),officialKopis=new Set()
      for(const c of sources.values())if(routeProgramSource(c).source_kind==='KOPIS_DETAIL_TEXT')officialKopis.add(c.kopis_id)
      // Official first also determines stable KOPIS-event de-duplication.
      for(const [kind,rows]of [['official',initial.official],['ocr',initial.ocr]])for(const row of rows){
        const c=sources.get(row.concert_id)
        if(!c||!same(visible(c),row.concerts))throw unavailable()
        const official=kind==='official',source=routeProgramSource(c)
        if(official?source.source_kind!=='KOPIS_DETAIL_TEXT':officialKopis.has(c.kopis_id))continue
        if(row.track_id!==target.trackId||row.work_id!==target.workId||row.relation!=='EXACT'||row.outcome!=='MATCHED'
          ||row.is_effectively_confirmed!==true||row.analysis_is_current!==true||row.stale_reason!==null
          ||!states.includes(c.performance_status)||c.start_date>query.to||c.end_date<from||(query.region!=='전국'&&c.region!==query.region))continue
        if(official){
          if(!uuid.test(row.candidate_id)||!uuid.test(row.analysis_id)||row.source_kind!=='KOPIS_DETAIL_TEXT'||row.status!=='CONFIRMED'
            ||row.matcher_version!=='stored-program-4'||row.decision_version!=='program-text-confirm-1'||row.policy_enabled!==true
            ||row.source_hash!==source.text_hash||row.work_identity_hash!==identity.hash
            ||['source_hash','payload_hash','catalog_hash','evidence_hash','candidate_snapshot_hash','verification_hash'].some(k=>!hash(row[k])))continue
        }else if(row.review_status!=='CONFIRMED'||row.effective_status!=='CONFIRMED'
          ||!confirmationValidity(row,currentCatalog,{version:searchVersion,today}).is_effectively_confirmed)continue
        if(concerts.has(c.kopis_id))continue
        concerts.set(c.kopis_id,{
          id:`kopis-${c.kopis_id}`,kopisId:c.kopis_id,title:c.title,venue:c.venue,region:c.region,dateFrom:c.start_date,dateTo:c.end_date,performanceStatus:c.performance_status,
          sourceUrl:kopisUrl(c.kopis_id),sourceLabel:'저장된 프로그램 검증 결과',fetchedAt:c.synced_at,searchBackend:'supabase',programAnalysisVersion:official?'stored-program-4':searchVersion,
          programStatus:'verified',programVerification:'reviewed-db',programWorkIds:[target.workId],programTrackIds:[target.trackId],
          targetMatch:{targetTrackId:target.trackId,workId:target.workId,status:'matched',evidenceKind:'reviewed-db',relation:'EXACT',reviewStatus:'CONFIRMED',completed:true,
            reason:'원본 프로그램과 작품 식별 정보를 검증한 연결이에요.',evidenceSourceUrl:official?kopisUrl(c.kopis_id):safeUrl(row.source_url)},
        })
      }
      // Observed changes invalidate the WHOLE response. Multiple GETs are not
      // an atomic transaction snapshot and must never authorize writes.
      if(!same(initial,await loadStatuses()))throw unavailable()
      const after=await readConcerts(ids)
      if(!same([...sources],[...after]))throw unavailable()
    }catch{throw unavailable()}
    return {backend:'supabase',analysisVersion:searchVersion,query,targetTrackId:target.trackId,
      concerts:[...concerts.values()].sort((a,b)=>a.dateFrom.localeCompare(b.dateFrom)||a.kopisId.localeCompare(b.kopisId)),
      fetchedAt:new Date(timestamp).toISOString(),fromCache:false,cacheTtlMs:0}
  }
  return {backend:'supabase',config,search,close(){}}
}
