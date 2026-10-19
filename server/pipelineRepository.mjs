import { createSupabaseRest } from './supabaseRest.mjs'
import { createSupabaseCollector } from './supabaseCollector.mjs'
import { createSupabaseOcr } from './supabaseOcr.mjs'
import { createProgramAnalysisStore } from './supabaseProgramAnalysis.mjs'
import { pipelineError } from './pipelineConfig.mjs'
import { CLEANUP_TABLES, CLEANUP_SCHEMA_VERSION, fallbackCleanupPlan } from './pipelineCleanup.mjs'
import { MATCHER_VERSION } from './programAnalysis.mjs'

const fields={
  concerts:'id,kopis_id,title,venue,region,start_date,end_date,performance_status,synced_at,program_context_revision',
  concert_program_images:'id,concert_id,source_url,image_type,is_active,sort_order,evidence_revision',
  concert_image_ocr_results:'id,image_id,content_sha256,pipeline_version,created_at',
  concert_image_ocr_attempts:'id,image_id,result_id,status,created_at,finished_at,pipeline_version,error_code',
  concert_program_analyses:'id,image_id,concert_id,ocr_result_id,source_attempt_id,image_revision,concert_revision,concert_context,matcher_version,catalog_hash,is_current,created_at',
}
export const createPipelineRepository = options => {
  const request=createSupabaseRest(options)
  let cleanupSchemaReady=false,cleanupFunctionsPresent=false
  const all=async(table,params={},pageLimit=20,select=fields[table]||'id')=>{
    const rows=[];let last
    for(let page=0;page<pageLimit;page++){
      const items=await request(table,{params:{select, ...params, order:'id.asc',limit:'100',...(last?{id:`gt.${last}`}:{})}})
      if(!Array.isArray(items))throw pipelineError('DB_RESPONSE_INVALID')
      for(const item of items){if(!item?.id || (last&&item.id<=last))throw pipelineError('DB_PAGINATION_STALLED');last=item.id;rows.push(item)}
      if(items.length<100)return rows
    }
    throw pipelineError('DB_SCAN_LIMIT')
  }
  const related=async(table,column,ids,pages,select)=>{
    const rows=[]
    for(let n=0;n<ids.length;n+=50)rows.push(...await all(table,{[column]:`in.(${ids.slice(n,n+50).join(',')})`},pages,select))
    return rows
  }
  return {
    collector:createSupabaseCollector(options), ocr:createSupabaseOcr(options), analysis:createProgramAnalysisStore(options),
    async preflight({plan=false}={}){
      for(const table of [...Object.keys(fields),'concert_program_candidates','concert_program_reviews','concert_program_candidate_status','concert_program_catalogs']){
        await request(table,{params:{select:table==='concert_program_catalogs'?'catalog_hash':'id',limit:'0'}})
      }
      const schema=await request('')
      for(const name of ['sync_kopis_concert','record_concert_image_ocr','save_concert_program_analysis'])
        if(!schema.paths?.[`/rpc/${name}`])throw pipelineError('BATCH_SCHEMA_REQUIRED')
      cleanupFunctionsPresent=['plan_expired_concert_cleanup','delete_expired_concert'].every(name=>schema.paths?.[`/rpc/${name}`])
      cleanupSchemaReady=cleanupFunctionsPresent && (await request('rpc/plan_expired_concert_cleanup',{params:{p_limit:'1'}})).schema_version===CLEANUP_SCHEMA_VERSION
      if(!cleanupSchemaReady&&!plan)throw pipelineError('CLEANUP_MIGRATION_REQUIRED')
      const analysisSchemaReady=Boolean(schema.paths?.['/rpc/save_concert_program_analysis_v3'])
      if(!analysisSchemaReady&&!plan)throw pipelineError('PROGRAM_ANALYSIS_V3_MIGRATION_REQUIRED')
      const policy=analysisSchemaReady?await request('concert_program_version_policy',{params:{select:'enabled',matcher_version:`eq.${MATCHER_VERSION}`,limit:'1'}}):null
      const analysisVersionEnabled=policy?policy[0]?.enabled!==false:'UNKNOWN'
      if(analysisVersionEnabled===false&&!plan)throw pipelineError('PROGRAM_ANALYSIS_VERSION_DISABLED')
      if(cleanupSchemaReady)await request('concert_cleanup_events',{params:{select:'operation_id',limit:'0'}})
      return {cleanup_schema_ready:cleanupSchemaReady,analysis_schema_ready:analysisSchemaReady,analysis_version_enabled:analysisVersionEnabled,matcher_version:MATCHER_VERSION}
    },
    async cleanupPlan(limit,today,pages){
      if(cleanupFunctionsPresent){
        const result=await request('rpc/plan_expired_concert_cleanup',{params:{p_limit:String(limit)}})
        return {...result,migration_required:!cleanupSchemaReady}
      }
      const data={}
      const select={concerts:'id,kopis_id,title,start_date,end_date',concert_program_images:'id,concert_id',
        concert_image_ocr_results:'id,image_id',concert_image_ocr_attempts:'id,image_id,result_id',
        concert_program_analyses:'id,concert_id,image_id,ocr_result_id,source_attempt_id',
        concert_program_candidates:'id,analysis_id',concert_program_reviews:'id,candidate_id'}
      for(const table of CLEANUP_TABLES)data[table]=await all(table,{},pages,select[table])
      return fallbackCleanupPlan(data,today,limit)
    },
    cleanupDelete(id,operationId,runId){
      if(!cleanupSchemaReady)throw pipelineError('CLEANUP_MIGRATION_REQUIRED')
      return request('rpc/delete_expired_concert',{body:{p_concert_id:id,p_operation_id:operationId,p_run_id:runId}})
    },
    async snapshot(conditions,pages){
      const concerts=await all('concerts',{region:`eq.${conditions.region}`,start_date:`lte.${conditions.to}`,end_date:`gte.${conditions.from}`,performance_status:'in.(공연예정,공연중)'},pages)
      const images=(await related('concert_program_images','concert_id',concerts.map(c=>c.id),pages)).filter(i=>i.image_type==='DETAIL'&&i.is_active)
      const ids=images.map(i=>i.id)
      const results=await related('concert_image_ocr_results','image_id',ids,pages)
      const attempts=await related('concert_image_ocr_attempts','image_id',ids,pages)
      const analyses=await related('concert_program_analyses','image_id',ids,pages)
      return {concerts,images,results,attempts,analyses}
    },
    async ocrResult(id){
      const [row]=await request('concert_image_ocr_results',{params:{select:'*',id:`eq.${id}`,limit:'1'}})
      if(!row)throw pipelineError('OCR_RESULT_MISSING')
      return row
    },
    candidates(analysisId){return all('concert_program_candidates',{analysis_id:`eq.${analysisId}`},20,'id,analysis_id,track_id,review_status')},
    async reviewSummary(pages){
      return all('concert_program_candidate_status', {analysis_is_current:'eq.true',effective_status:'eq.REVIEW_REQUIRED'},pages,
        'id,track_id,kopis_id,concert_title,analysis_id,matcher_version,catalog_hash,stale_reason')
    },
  }
}
