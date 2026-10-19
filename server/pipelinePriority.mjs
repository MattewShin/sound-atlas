import { collectionConditions } from './concertCollectionConfig.mjs'
import { validCleanupDates } from './pipelineCleanup.mjs'

const bands=['TODAY','TOMORROW','NEXT_7_DAYS','LATER','UNKNOWN']
const rotation=['TODAY','TOMORROW','TODAY','NEXT_7_DAYS','BACKLOG']
export const concertPriority = (concert,now) => {
  const {from:today,to}=collectionConditions(now)
  const start=concert?.start_date??concert?.from,end=concert?.end_date??concert?.to
  if(!validCleanupDates({start_date:start,end_date:end}))return {bucket:'UNKNOWN',priority_date:null,date_basis:'UNKNOWN',start_date:start??null,end_date:end??null}
  if(end<today||start>to)return null
  // This is the first overlapping calendar date, not an invented next session.
  const date=start<today?today:start,days=(Date.parse(date)-Date.parse(today))/86400000
  return {bucket:days===0?'TODAY':days===1?'TOMORROW':days<=7?'NEXT_7_DAYS':'LATER',priority_date:date,
    date_basis:start<today?'ONGOING_RANGE_NEXT_SESSION_UNKNOWN':'STORED_START_DATE',start_date:start,end_date:end}
}
export const priorityState = (state,stage) => structuredClone(state.priority?.[stage]||{slot:0,new_slot:0,check_slot:0,served:{}})
const maintenance = item => ['RECHECK','HOLD_RECHECK'].includes(item.work_kind)

// Pure preview: only the caller commits schedule_after for a finished item.
// 4 new/recovery slots : 1 maintenance slot. Within each lane the band cycle
// is today, tomorrow, today, days 2..7, later/unknown. Empty slots are borrowed.
export const prioritize = (items,state,stage,now) => {
  const cursor=priorityState(state,stage),pool=items.flatMap(item=>{
    const priority=concertPriority(item.concerts||item.concert,now)
    return priority?[{...item,priority}]:[]
  }),result=[]
  while(pool.length){
    const preferCheck=cursor.slot%5===4
    let lane=pool.filter(i=>maintenance(i)===preferCheck)
    if(!lane.length)lane=pool.filter(i=>maintenance(i)!==preferCheck)
    const checking=maintenance(lane[0]),counter=checking?'check_slot':'new_slot'
    const wanted=rotation[cursor[counter]%rotation.length]
    let available=lane.filter(i=>wanted==='BACKLOG'?['LATER','UNKNOWN'].includes(i.priority.bucket):i.priority.bucket===wanted)
    if(!available.length){const band=bands.find(b=>lane.some(i=>i.priority.bucket===b));available=lane.filter(i=>i.priority.bucket===band)}
    const concertId=i=>i.concerts?.kopis_id||i.concert?.kopis_id||i.kopis_id
    available.sort((a,b)=>(cursor.served[concertId(a)]||0)-(cursor.served[concertId(b)]||0)
      ||(a.priority.priority_date||'9999').localeCompare(b.priority.priority_date||'9999')
      ||concertId(a).localeCompare(concertId(b))||(a.touched||0)-(b.touched||0)
      ||(a.sort_order||0)-(b.sort_order||0)||a.key.localeCompare(b.key))
    const selected=available[0]
    pool.splice(pool.indexOf(selected),1);cursor.slot++;cursor[counter]++;cursor.served[concertId(selected)]=cursor.slot
    result.push({...selected,selection_reason:`${selected.work_kind}_${selected.priority.bucket}_CONCERT_ROTATION`,schedule_after:structuredClone(cursor)})
  }
  return result
}
export const commitPriority = (state,stage,item) => {if(item.schedule_after)(state.priority||={})[stage]=item.schedule_after}
export const priorityPreview = item => ({kopis_id:item.concerts?.kopis_id||item.concert?.kopis_id||item.kopis_id,
  image_id:item.image?.id||(item.concert_id?item.id:undefined),ocr_result_id:item.ocr?.id,
  ...item.priority,work_kind:item.work_kind,reason:item.selection_reason})
export const bucketCounts = (items,now) => {
  const result=Object.fromEntries(bands.map(b=>[b,0]))
  for(const item of items){const p=concertPriority(item.concerts||item.concert,now);if(p)result[p.bucket]++}
  return result
}
