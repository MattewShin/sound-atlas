import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {boundedProgramItem} from '../boundedProgramBatch.mjs'
import {CATALOG_JSON} from '../programAnalysis.mjs'
import {EASYOCR_PIPELINE_VERSION} from '../easyOcrConfig.mjs'
export const baseSqlFiles=['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql','migrations/202610150001_concert_program_analysis.sql','drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql']
export const boundedDraft='drafts/202610230001_program_automation_bounded.sql'
export async function applyBoundedFixtureSchema(db,includeDraft=true){
 await db.exec("do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end$$;grant usage on schema public to service_role;")
 for(const file of [...baseSqlFiles,...(includeDraft?[boundedDraft]:[])])await db.exec(await readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'))
}
export async function boundedFixture(db){
 await applyBoundedFixtureSchema(db)
 const concert={kopis_id:'PF999888',title:'Bounded fixture recital',venue:'Fixture Hall',region:'서울',start_date:'2099-10-27',end_date:'2099-10-27',performance_status:'공연예정',synced_at:'2026-10-23T00:00:00Z'}
 await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(concert),JSON.stringify([0,1,2].map(n=>({source_url:'https://kopis.or.kr/upload/bounded-fixture-'+n+'.jpg',image_type:'DETAIL',sort_order:n})))])
 const k=(await db.query('select to_jsonb(k) data from public.concerts k')).rows[0].data
 const images=(await db.query('select to_jsonb(i) data from public.concert_program_images i order by sort_order')).rows.map(r=>r.data)
 const make=async(index=0,units=1,save=false)=>{
  const image=images[index],id=randomUUID(),hash=createHash('sha256').update(id).digest('hex'),text='PROGRAM\n'+Array.from({length:units},()=> 'J Brahms\nIntermezzo Op.118 No.2\nF Chopin\nBallade No.4 Op.52').join('\n')
  await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify({id,image_id:image.id,source_url:image.source_url,content_sha256:hash,pipeline_version:EASYOCR_PIPELINE_VERSION,status:'SUCCEEDED',error_code:null,started_at:new Date().toISOString(),finished_at:new Date().toISOString(),duration_ms:1}),JSON.stringify({raw_text:text,detections:[],width:800,height:800,engine_version:'fixture',torch_version:'fixture',settings:{}})])
  const attempt=(await db.query('select to_jsonb(t) data from public.concert_image_ocr_attempts t where id=$1',[id])).rows[0].data
  const ocr=(await db.query('select to_jsonb(o) data from public.concert_image_ocr_results o where id=$1',[attempt.result_id])).rows[0].data
  const item=boundedProgramItem({concert:k,image,attempt,ocr})
  if(save)item.savedId=(await db.query('select public.save_concert_program_analysis_v3($1,$2) id',[JSON.stringify(item.analysis),CATALOG_JSON])).rows[0].id
  return item
 }
 const approve=async(options={})=>(await db.query('insert into public.program_automation_bounded_runs(task_ref,image_limit,candidate_limit,allow_history_only) values($1,$2,$3,$4) returning id',['ISOLATED_TEST_ONLY',options.imageLimit??20,options.candidateLimit??100,options.history??false])).rows[0].id
 const plan=async(run,items,mode='COMPLETE',historyIds=null)=>(await db.query('select public.plan_automatic_program_batch_bounded($1,$2,$3,$4,$5,$6) r',[run,JSON.stringify(items),CATALOG_JSON,'program-auto-1',mode,historyIds])).rows[0].r
 const complete=async(run,items,p,requestId=randomUUID(),mode='COMPLETE',historyIds=null)=>(await db.query('select public.complete_automatic_program_batch_bounded($1,$2,$3,$4,$5,$6,$7,$8) r',[run,requestId,JSON.stringify(items),p.plan_hash,CATALOG_JSON,'program-auto-1',mode,historyIds])).rows[0].r
 const snapshot=async()=>{
  const data={};for(const t of ['concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_catalogs','program_automation_bounded_runs','program_automation_bounded_batches'])data[t]=(await db.query('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),\'[]\') data from public.'+t+' x')).rows[0].data
  return JSON.stringify(data)
 }
 const history=async(analysisId,total)=>{
  const seed=(await db.query('select id from public.concert_program_candidates where analysis_id=$1 order by id limit 1',[analysisId])).rows[0].id
  while(Number((await db.query('select count(*) n from public.concert_program_candidates where analysis_id=$1',[analysisId])).rows[0].n)<total)await cloneHistory(db,seed)
  return (await db.query('select id from public.concert_program_candidates where analysis_id=$1 order by id',[analysisId])).rows.map(r=>r.id)
 }
 return {db,k,images,make,approve,plan,complete,snapshot,history}
}
export async function cloneHistory(db,seed){return db.query("insert into public.concert_program_candidates(analysis_id,candidate_key,track_id,work_id,identity,relation,outcome,section_index,evidence,generation_reasons,review_reasons) select analysis_id,$2,track_id,work_id,identity,relation,outcome,section_index,evidence,generation_reasons,review_reasons from public.concert_program_candidates where id=$1 returning id",[seed,createHash('sha256').update(randomUUID()).digest('hex')])}
