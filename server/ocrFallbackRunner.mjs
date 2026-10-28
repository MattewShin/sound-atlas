import {randomUUID} from 'node:crypto'
import {fallbackSource,planOcrFallback,fallbackHash,OCR_FALLBACK_RULE} from './ocrFallback.mjs'
import {confirmFallbackCandidate} from './supabaseOcrFallback.mjs'
import {EASYOCR_PIPELINE_VERSION,EASYOCR_SETTINGS} from './easyOcrConfig.mjs'
import {collectionConditions} from './concertCollectionConfig.mjs'

// One target, one physical image GET, one recognition and at most one confirmation.
// Selection is separate so a multi-concert dry-run can account for every source gate.
export async function runOcrFallbackOne({store,concert,image,download,worker,save=false,signal,now=Date.now}){
  const report={rule:OCR_FALLBACK_RULE,kopis_id:concert.kopis_id,status:'SKIPPED',reason:null,downloads:0,ocr_calls:0,new_confirmation_limit:1,confirmation_posts:0,rejected:0,eligible:0,skipped:{}}
  const source=fallbackSource(concert)
  if(source.status!=='OCR')return {...report,status:source.status,reason:source.reason}
  const conditions=collectionConditions(now())
  if(concert.region!==conditions.region||!['공연예정','공연중'].includes(concert.performance_status)||concert.end_date<conditions.from||concert.start_date>conditions.to)return {...report,reason:'SKIPPED_OUTSIDE_COLLECTION_SCOPE'}
  if(!image||!image.is_active||image.image_type!=='DETAIL'||image.concert_id!==concert.id)return {...report,reason:'SKIPPED_NO_ACTIVE_DETAIL_IMAGE'}
  if(save)await store.preflight()
  try{
    const fresh=await store.refresh(concert.id,image.id)
    if(fallbackSource(fresh.concert).status!=='OCR'||fallbackHash(fresh)!==fallbackHash({concert,image}))return {...report,reason:'SKIPPED_SOURCE_CHANGED'}
    signal?.throwIfAborted()
    report.downloads++;const decoded=await download(image.source_url,{signal})
    // Low-quality images never initialize/call the OCR worker.
    const q=decoded.quality
    if(!q||q.decoded!==true||q.original_width<800||q.original_height<800||q.laplacian_variance<100)return {...report,reason:'SKIPPED_IMAGE_QUALITY'}
    report.ocr_calls++;const result=await worker.recognize(decoded,{signal})
    const started=now(),attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,content_sha256:decoded.contentHash,pipeline_version:EASYOCR_PIPELINE_VERSION,status:'SUCCEEDED',started_at:new Date(started).toISOString(),finished_at:new Date(started).toISOString(),duration_ms:0}
    const ocr={...result,id:randomUUID(),image_id:image.id,content_sha256:decoded.contentHash,pipeline_version:EASYOCR_PIPELINE_VERSION,settings:{...EASYOCR_SETTINGS,ocr_fallback_quality:q}}
    let target={concert,image,ocr,attempt},plan=planOcrFallback(target)
    const summarize=()=>{report.eligible=plan.eligible.length;report.quality=plan.quality?{eligible:plan.quality.eligible,reason:plan.quality.reason,coverage:plan.quality.snapshot?.coverage,median:plan.quality.snapshot?.median}:null;report.candidates=plan.analysis?.candidates.length||0;for(const d of plan.skipped)report.skipped[d.reason]=(report.skipped[d.reason]||0)+1}
    summarize()
    if(!save)return {...report,status:'DRY_RUN',reason:'UNPERSISTED_PREVIEW_ONLY'}
    // Never store a review or confirmation for skipped candidates.
    if(!plan.eligible.length)return {...report,reason:plan.reason}
    const again=await store.refresh(concert.id,image.id)
    if(fallbackHash(again)!==fallbackHash(fresh))return {...report,reason:'SKIPPED_SOURCE_CHANGED'}
    await store.saveOcr(attempt,ocr)
    target=await store.current(concert.id,image.id);plan=planOcrFallback(target)
    if(!plan.eligible.length)return {...report,reason:'SKIPPED_PERSISTED_QUALITY_OR_IDENTITY'}
    const analysisId=await store.saveAnalysis(plan.analysis),candidates=await store.candidates(analysisId),existing=await store.existing(concert.id)
    const selected=plan.eligible.map(d=>candidates.find(c=>c.candidate_key===d.candidate.candidate_key)).filter(Boolean).filter(c=>!existing.some(r=>r.track_id===c.track_id&&r.work_id===c.work_id)).sort((a,b)=>a.candidate_key.localeCompare(b.candidate_key))[0]
    if(!selected)return {...report,reason:'SKIPPED_EXISTING_CONFIRMATION_OR_NO_READY_CANDIDATE'}
    const confirmation=await confirmFallbackCandidate({store,target,candidate:selected})
    report.confirmation_posts=confirmation.status==='CONFIRMED'?1:0
    return {...report,...confirmation,analysis_id:analysisId,candidate_id:selected.id,track_id:selected.track_id}
  }catch(e){return {...report,status:'FAILED',reason:/^[A-Z][A-Z0-9_]{0,95}$/.test(e.code||e.message)?e.code||e.message:'OCR_FALLBACK_FAILED'}}
}
