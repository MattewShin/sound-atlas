import {createSupabaseRest} from './supabaseRest.mjs'
import {CollectionError} from './collectionHttp.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload,createProgramTextAnalysisStore,PROGRAM_TEXT_SAVE_RPC} from './supabaseProgramTextAnalysis.mjs'
import {createProgramSourceReader} from './programSourcePlan.mjs'
import {createProgramTextConfirmationStore,PROGRAM_TEXT_CONFIRM_RPC,PROGRAM_TEXT_CONFIRM_VERSION} from './supabaseProgramTextConfirmation.mjs'
import {MATCHER_VERSION} from './programAnalysis.mjs'

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const views=['concert_program_text_analysis_status','concert_program_text_candidate_status','concert_program_text_confirmation_status']
const receiptSelect='id,candidate_id,analysis_id,concert_id,source_kind,status,source_hash,payload_hash,catalog_hash,matcher_version,decision_version,is_effectively_confirmed,stale_reason'
const sourceSelect='id,title,venue,start_date,end_date,program_context_revision,kopis_detail_text,kopis_detail_text_hash'
const safeFailure=code=>new CollectionError(code,code,false)
const code=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(v)
const add=(map,key)=>{if(!code(key))throw safeFailure('ANALYSIS_RESULT_INVALID');map[key]=(map[key]||0)+1}

// Internal-only factory: no CLI, API route, runner, queue or scheduled hook.
// The two-key input has no limit/eligibility/override knob. Each run owns its
// transport budget, so one confirmation POST is a hard cap, including retries.
export function createProgramTextCoordinator({env=process.env,fetchImpl=fetch,delay,signal}={}){
  return {async run(input){
    if(!input||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'concert_id')||!Object.hasOwn(input,'mode')
      ||!uuid(input.concert_id)||!['DRY_RUN','SAVE'].includes(input.mode))throw safeFailure('PROGRAM_TEXT_COORDINATOR_INPUT_INVALID')
    const concertId=input.concert_id.toLowerCase(),mode=input.mode
    const result={mode,concert_id:concertId,status:'FAILED',source:'NONE',reason:null,analysis_id:null,source_hash:null,payload_hash:null,
      counts:{total:0,ready:0,already:0,hold:0,pending:0},outcomes:{},reasons:{},receipt_id:null}
    let phase='SOURCE_READ_FAILED',writePreflight=false,confirmationPosts=0
    try{
      const allowedReads=new Set(['','concerts','concert_program_version_policy',...views])
      const guardedFetch=async(url,init)=>{
        const path=new URL(url).pathname.replace(/^\/rest\/v1\//,'')
        if(init.method==='GET'){
          if(!allowedReads.has(path))throw safeFailure('PROGRAM_TEXT_ENDPOINT_FORBIDDEN')
          return fetchImpl(url,{...init,headers:{...init.headers,Prefer:'count=exact'}})
        }
        if(mode!=='SAVE'||!writePreflight||init.method!=='POST')throw safeFailure('PROGRAM_TEXT_WRITE_FORBIDDEN')
        if(path==='rpc/'+PROGRAM_TEXT_SAVE_RPC){
          if(JSON.parse(init.body)?.p_analysis?.concert_id!==concertId)throw safeFailure('PROGRAM_TEXT_SCOPE_MISMATCH')
          return fetchImpl(url,init)
        }
        if(path!=='rpc/'+PROGRAM_TEXT_CONFIRM_RPC||confirmationPosts>=1)throw safeFailure('PROGRAM_TEXT_CONFIRMATION_LIMIT')
        confirmationPosts++
        // Existing transport retries are deliberately disabled for THIS one
        // confirmation attempt, without modifying the shared 3G adapter.
        try{
          const response=await fetchImpl(url,init)
          if(!response.ok)throw safeFailure('CONFIRMATION_FAILED')
          const id=await response.json()
          if(!uuid(id))throw safeFailure('CONFIRMATION_FAILED')
          return new Response(JSON.stringify(id),{headers:{'content-type':'application/json'}})
        }catch{throw safeFailure('CONFIRMATION_FAILED')}
      }
      const options={env,fetchImpl:guardedFetch,delay,signal},request=createSupabaseRest(options)
      const store=createProgramTextAnalysisStore(options),reader=createProgramSourceReader(options),confirmer=createProgramTextConfirmationStore(options)
      const current=await request('concerts',{params:{select:sourceSelect,id:'eq.'+concertId,limit:'2'}})
      if(!Array.isArray(current)||current.length!==1||current[0]?.id!==concertId)throw safeFailure('CONCERT_NOT_FOUND')
      const concert=current[0],source=routeProgramSource(concert)
      result.source=source.source_kind;result.source_hash=source.text_hash
      if(source.source_kind!=='KOPIS_DETAIL_TEXT')return {...result,status:'SKIPPED',reason:source.official_reason_code}
      if(mode==='SAVE'){
        phase='PREFLIGHT_FAILED'
        await store.preflightSave();await confirmer.preflightConfirm()
        const schema=await request('')
        for(const name of [...views,'rpc/'+PROGRAM_TEXT_SAVE_RPC,'rpc/'+PROGRAM_TEXT_CONFIRM_RPC])if(!schema.paths?.['/'+name])throw safeFailure('PREFLIGHT_FAILED')
        for(const name of views){
          const probe=await request(name,{params:{select:'id',concert_id:'eq.'+concertId,limit:'1'}})
          if(!Array.isArray(probe)||probe.length>1||probe.some(row=>!uuid(row?.id)))throw safeFailure('PREFLIGHT_FAILED')
        }
        const policy=await request('concert_program_version_policy',{params:{select:'matcher_version,enabled',matcher_version:'eq.'+MATCHER_VERSION,limit:'2'}})
        if(!Array.isArray(policy)||policy.length!==1||policy[0].matcher_version!==MATCHER_VERSION||policy[0].enabled!==true)throw safeFailure('PREFLIGHT_FAILED')
        writePreflight=true
      }
      phase='ANALYSIS_FAILED'
      const analysis=analyzeSelectedProgramSource({concert,source}),payload=buildProgramTextAnalysisPayload({concert,analysis})
      result.payload_hash=payload.payload_hash;result.counts.total=payload.candidates.length;result.counts.pending=payload.candidates.length
      for(const c of payload.candidates){add(result.outcomes,c.outcome);for(const reason of new Set(c.review_reasons||[]))add(result.reasons,reason)}
      if(mode==='DRY_RUN')return {...result,status:'DRY_RUN',reason:'DRY_RUN_ANALYZED'}
      phase='ANALYSIS_SAVE_FAILED'
      const analysisId=await store.save({concert,analysis})
      if(!uuid(analysisId))throw safeFailure('ANALYSIS_SAVE_FAILED')
      result.analysis_id=analysisId
      phase='PLAN_READ_FAILED'
      const plan=await reader.plan({concert_id:concertId}) // no OCR evidence supplied
      const keys=new Set(payload.candidates.map(c=>c.candidate_key)),ids=new Set()
      if(plan.selected_source!=='KOPIS_DETAIL_TEXT'||plan.source_hash!==payload.source_hash||plan.matcher_version!==MATCHER_VERSION
        ||plan.reason_code!=='OFFICIAL_PROGRAM_SELECTED'||plan.total_candidates!==payload.candidates.length
        ||plan.candidates.some(c=>{
          const bad=!uuid(c.id)||ids.has(c.id)||!keys.delete(c.candidate_key)||c.analysis_id!==analysisId||c.concert_id!==concertId
            ||c.source_hash!==payload.source_hash||c.catalog_hash!==payload.catalog_hash||c.matcher_version!==MATCHER_VERSION
            ||c.analysis_is_current!==true||c.is_fresh!==true||c.is_effective_current!==true||c.policy_enabled!==true||c.stale_reason!==null
          ids.add(c.id);return bad
        })||keys.size)return {...result,status:'HELD',reason:'PLAN_NOT_CURRENT'}

      phase='RECEIPT_READ_FAILED'
      const receipts=[];let lastId,total
      for(let page=0;;page++){
        if(page>=50)throw safeFailure('RECEIPT_READ_FAILED')
        const data=await request(views[2],{params:{select:receiptSelect,concert_id:'eq.'+concertId,order:'id.asc',limit:'100',...(lastId?{id:'gt.'+lastId}:{})},
          decode:async r=>({rows:await r.json(),range:r.headers?.get('content-range')})})
        const m=/^(\d+)-(\d+)\/(\d+)$/.exec(data.range||''),empty=data.range==='*/0',remaining=empty?0:Number(m?.[3])
        if(!Array.isArray(data.rows)||data.rows.length>100||(!m&&!empty)||!Number.isSafeInteger(remaining)||remaining<0
          ||(total!==undefined&&remaining!==total-receipts.length))throw safeFailure('RECEIPT_READ_FAILED')
        if(total===undefined)total=remaining
        if(!data.rows.length){if(remaining!==0)throw safeFailure('RECEIPT_READ_FAILED');break}
        if(!m||Number(m[1])!==0||Number(m[2])!==data.rows.length-1||remaining<data.rows.length)throw safeFailure('RECEIPT_READ_FAILED')
        for(const r of data.rows){
          if(!uuid(r?.id)||!uuid(r.candidate_id)||r.concert_id!==concertId||(lastId&&r.id<=lastId))throw safeFailure('RECEIPT_READ_FAILED')
          lastId=r.id;receipts.push(r)
        }
        if(receipts.length===total)break
      }
      const ready=[]
      for(const c of [...plan.candidates].sort((a,b)=>a.id.localeCompare(b.id))){
        const existing=receipts.filter(r=>r.candidate_id===c.id)
        if(existing.length){
          const r=existing[0],effective=existing.length===1&&r.is_effectively_confirmed===true&&r.stale_reason===null&&r.status==='CONFIRMED'
            &&r.source_kind==='KOPIS_DETAIL_TEXT'&&r.matcher_version===MATCHER_VERSION&&r.decision_version===PROGRAM_TEXT_CONFIRM_VERSION
            &&r.analysis_id===analysisId&&r.source_hash===payload.source_hash&&r.payload_hash===payload.payload_hash&&r.catalog_hash===payload.catalog_hash
          if(effective){result.counts.already++;add(result.reasons,'ALREADY_CONFIRMED')}
          else{result.counts.hold++;add(result.reasons,'HOLD_EXISTING_RECEIPT')}
        }else if(c.planning_ready===true)ready.push(c)
      }
      result.counts.ready=ready.length;result.counts.pending=result.counts.total-result.counts.already-result.counts.hold
      if(!ready.length)return {...result,status:result.counts.hold?'HELD':'SAVED',reason:result.counts.hold?'HOLD_EXISTING_RECEIPT':result.counts.already?'ALREADY_CONFIRMED':'NO_READY_CANDIDATE'}
      phase='CONFIRMATION_FAILED'
      result.receipt_id=await confirmer.confirm({candidate_id:ready[0].id,analysis_id:analysisId,source_hash:payload.source_hash,payload_hash:payload.payload_hash,
        catalog_hash:payload.catalog_hash,matcher_version:MATCHER_VERSION,decision_version:PROGRAM_TEXT_CONFIRM_VERSION})
      result.counts.pending--
      return {...result,status:'CONFIRMED',reason:'ONE_CANDIDATE_CONFIRMED'}
    }catch{return {...result,status:'FAILED',reason:phase}}
  }}
}
