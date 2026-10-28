import {readFile} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {CATALOG_JSON,analyzeStoredProgram,hashJson} from '../programAnalysis.mjs'
import {routeProgramSource} from '../programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from '../selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload,programTextPayloadHash} from '../supabaseProgramTextAnalysis.mjs'
import {EASYOCR_PIPELINE_VERSION} from '../easyOcrConfig.mjs'

export const confirmationMigration=await readFile(new URL('../../supabase/migrations/202610260003_program_text_confirmation.sql',import.meta.url),'utf8')
export const hash=s=>createHash('sha256').update(s).digest('hex')
export const rows=async(db,table)=>(await db.query('select * from public.'+table+' order by 1')).rows
export const rehash=p=>{const {payload_hash,...body}=p;return {...body,payload_hash:programTextPayloadHash(body)}}
export const payload=k=>buildProgramTextAnalysisPayload({concert:k,analysis:analyzeSelectedProgramSource({concert:k,source:routeProgramSource(k)})})
export const save=async(db,p)=>(await db.query('select public.save_concert_program_text_analysis_v4($1,$2) id',[JSON.stringify(p),CATALOG_JSON])).rows[0].id
export const expected=(candidate,analysis)=>({candidate_id:candidate.id,analysis_id:analysis.id,source_hash:analysis.source_hash,
  payload_hash:analysis.payload_hash,catalog_hash:analysis.catalog_hash,matcher_version:'stored-program-4',decision_version:'program-text-confirm-1'})
export const confirm=async(db,input,catalog=CATALOG_JSON)=>(await db.query('select public.confirm_concert_program_text_candidate_v4($1,$2) id',[JSON.stringify(input),catalog])).rows[0].id
export const originalTables=['concerts','concert_program_images','concert_image_ocr_results','concert_image_ocr_attempts','concert_program_analyses',
  'concert_program_candidates','concert_program_reviews','concert_program_candidate_status','concert_program_text_analyses','concert_program_text_candidates',
  'concert_program_text_analysis_status','concert_program_text_candidate_status','concert_program_version_policy','concert_program_catalogs']
export const originalDigest=async db=>hashJson(await Promise.all(originalTables.map(t=>rows(db,t))))

// Both PGlite and explicit loopback PostgreSQL use fresh, disposable databases.
// No test imports a prior task's test suite or loads environment credentials.
export async function programTextConfirmationFixture(db){
  await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end $$;grant usage on schema public to service_role;")
  for(const f of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql',
    'migrations/202610150001_concert_program_analysis.sql','drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql',
    'migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql',
    'migrations/202610230002_kopis_detail_text.sql','migrations/202610230003_program_analysis_v4.sql',
    'migrations/202610260001_program_text_analysis_v4.sql','migrations/202610260002_program_text_status.sql'])
    await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'))
  const text='\u{1f3b9} e\u0301\r\n[Program]\r\nF. Chopin\r\nScherzo No.4 in E Major, Op.54'
  const data={kopis_id:'PF900057',title:'Isolated 3G fixture',venue:'Local hall',region:'Seoul',start_date:'2099-10-26',end_date:'2099-10-26',
    performance_status:'공연예정',synced_at:'2026-10-26T00:00:00Z',kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
  await db.exec('set role service_role')
  await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(data),JSON.stringify([{source_url:'https://kopis.or.kr/upload/isolated-3g.png',image_type:'DETAIL',sort_order:0}])])
  const concert={...(await rows(db,'concerts'))[0],...data},image=(await rows(db,'concert_program_images'))[0]
  // node-postgres returns int8 as strings; the source adapter requires a safe
  // revision integer. PGlite already returns this small fixture value as number.
  concert.program_context_revision=Number(concert.program_context_revision)
  const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,status:'SUCCEEDED',content_sha256:'a'.repeat(64),
    pipeline_version:EASYOCR_PIPELINE_VERSION,started_at:'2026-10-26T00:00:00Z',finished_at:'2026-10-26T00:00:01Z',duration_ms:1000}
  await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text:'PROGRAM\nF. Chopin\nBallade No.4 Op.52',detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:200})])
  const ocr=(await rows(db,'concert_image_ocr_results'))[0],ocrAnalysis=analyzeStoredProgram({concert,image,ocr,attempt})
  await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
  for(const v of [2,3,4]){
    const body={...ocrAnalysis,matcher_version:'stored-program-'+v,candidates:ocrAnalysis.candidates.map(c=>({...c,generation_version:'stored-program-'+v}))};delete body.payload_hash
    const fn='save_concert_program_analysis'+(v>2?'_v'+v:'')
    const a=(await db.query('select public.'+fn+'($1,$2) id',[JSON.stringify({...body,payload_hash:hashJson(body)}),CATALOG_JSON])).rows[0].id
    if(v<4){const c=(await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===a)
      await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',[c.id,v===3?'CONFIRMED':'REJECTED','Local historical fixture',a,'stored-program-'+v,CATALOG_JSON])}
  }
  const p=payload(concert),analysisId=await save(db,p)
  await db.exec('reset role')
  const analysis=(await rows(db,'concert_program_text_analyses')).find(a=>a.id===analysisId)
  const candidate=(await rows(db,'concert_program_text_candidates')).find(c=>c.analysis_id===analysisId)
  return {db,concert,p,analysis,candidate,input:expected(candidate,analysis)}
}
