import {analyzeStoredProgram} from './programAnalysis.mjs'

// Queue RPCs start at an existing current analysis. A successful OCR which has
// never been analysed must be prepared before asking that queue to process it.
// Keep this explicit and bounded; do not scan or save arbitrary past analyses.
export async function prepareAutomaticCoverage({store,items,save=false,imageLimit=3,candidateLimit=30,today=new Date(Date.now()+9*3600000).toISOString().slice(0,10)}){
 if(!Number.isInteger(imageLimit)||imageLimit<1||imageLimit>3||!Number.isInteger(candidateLimit)||candidateLimit<1||candidateLimit>30)throw Object.assign(new Error('Invalid automatic coverage limits'),{code:'AUTOMATIC_COVERAGE_LIMIT'})
 const report={images:0,candidates:0,analyses_saved:0,items:[]}
 for(const item of items){
  if(report.images>=imageLimit)break
  const target=await store.target(item)
  if(!target||!target.image.is_active||target.image.image_type!=='DETAIL'||target.concert.end_date<today||!['공연예정','공연중'].includes(target.concert.performance_status))continue
  const analysis=analyzeStoredProgram(target)
  if(report.candidates+analysis.candidates.length>candidateLimit)continue
  report.images++;report.candidates+=analysis.candidates.length
  const id=save?await store.saveAnalysis(analysis):null
  if(save)report.analyses_saved++
  report.items.push({image_id:item.image_id,concert_id:item.concert_id,analysis_id:id,payload_hash:analysis.payload_hash,candidates:analysis.candidates.length})
 }
 return report
}
