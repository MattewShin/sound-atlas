import {createSupabaseRest} from './supabaseRest.mjs'
import {createProgramTextCoordinator} from './programTextCoordinator.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'
import {pipelineError} from './pipelineConfig.mjs'

export const getOfficialProgramScheduleEnabled=(env=process.env)=>{
  const value=Object.hasOwn(env,'PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED')?env.PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED:'false'
  if(!['true','false'].includes(value))throw pipelineError('PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED_INVALID')
  return value==='true'
}

// One bounded source read and at most ONE coordinator invocation per run.
// The coordinator owns the unchangeable one-new-confirmation cap and all writes.
export function createScheduledProgramText({env=process.env,fetchImpl=fetch,signal,coordinator}={}){
  if(!getOfficialProgramScheduleEnabled(env))return {run:async()=>({status:'DISABLED',selected:0})}
  const request=createSupabaseRest({env,signal,fetchImpl:(url,init)=>fetchImpl(url,{...init,headers:{...init.headers,Prefer:'count=exact'}})})
  const runner=coordinator||createProgramTextCoordinator({env,fetchImpl,signal})
  return {async run({conditions,plan=false}){
    const response=await request('concerts',{params:{select:'id,kopis_id,region,start_date,end_date,performance_status,kopis_detail_text,kopis_detail_text_hash',
      region:'eq.'+conditions.region,start_date:'lte.'+conditions.to,end_date:'gte.'+conditions.from,performance_status:'in.(공연예정,공연중)',
      order:'start_date.asc,id.asc',limit:'100'},decode:async r=>({rows:await r.json(),range:r.headers.get('content-range')})})
    const rows=response.rows,m=/^0-(\d+)\/(\d+)$/.exec(response.range||'')
    if(!Array.isArray(rows)||rows.length>100||(!rows.length?response.range!=='*/0':!m||Number(m[1])!==rows.length-1||Number(m[2])<rows.length)
      ||rows.some(r=>!r||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.id))
      ||new Set(rows.map(r=>r.id)).size!==rows.length)throw pipelineError('PROGRAM_TEXT_SOURCE_RESPONSE_INVALID')
    const selected=rows.find(r=>r.region===conditions.region&&r.end_date>=conditions.from&&r.start_date<=conditions.to
      &&['공연예정','공연중'].includes(r.performance_status)&&routeProgramSource(r).source_kind==='KOPIS_DETAIL_TEXT')
    if(!selected)return {status:'SKIPPED',selected:0,reason:'NO_OFFICIAL_PROGRAM_IN_BOUNDED_SELECTION'}
    const result=await runner.run({concert_id:selected.id,mode:plan?'DRY_RUN':'SAVE'})
    if(result.status==='FAILED')throw pipelineError('PROGRAM_TEXT_SCHEDULE_FAILED')
    return {selected:1,kopis_id:selected.kopis_id,...result}
  }}
}
