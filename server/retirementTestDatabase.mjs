// Isolated synthetic SQL fixtures only. Never imported by the production API/CLI.
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {CATALOG_JSON,CATALOG_HASH} from './programText/programAnalysis.mjs'
import {routeProgramSource} from './programText/programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './programText/selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload} from './programText/supabaseProgramTextAnalysis.mjs'
export const retirementManifest=JSON.parse(await readFile(new URL('../supabase/retirement/ocr-20261109-manifest.json',import.meta.url),'utf8'))
export const retirementSql=await readFile(new URL('../supabase/migrations/202611090001_retire_ocr.sql',import.meta.url),'utf8')
export async function prepareRetirementDatabase(db,{apply=false}={}){
 const q=async(s,args=[])=>(await db.query(s,args)).rows
 await db.exec('reset role')
 const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&f<'202611020001').sort()
 for(const f of files){
  if(f==='202610210001_program_work_identity.sql')await db.exec((await readFile(new URL('../supabase/history/ocr/PROGRAM_ANALYSIS_V3_DRAFT.sql.txt',import.meta.url),'utf8')).replaceAll('\r\n','\n'))
  await db.exec((await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8')).replaceAll('\r\n','\n'))
 }
 const text='[Program]\nF. Chopin\nScherzo No.4 in E Major, Op.54\nJ. Brahms\nIntermezzo Op.118 No.2'
 const source={kopis_id:'PF999901',title:'Isolated Program test',venue:'Fixture Hall',region:'서울',start_date:'2099-11-09',end_date:'2099-11-09',performance_status:'공연예정',synced_at:'2026-11-09T00:00:00Z',kopis_detail_text:text,kopis_detail_text_hash:createHash('sha256').update(text).digest('hex')}
 const concertId=(await q('select public.sync_kopis_concert($1,$2) id',[source,[{source_url:'https://kopis.or.kr/upload/isolated-retirement.png',image_type:'DETAIL',sort_order:0}]]))[0].id
 const concert={...(await q('select * from public.concerts where id=$1',[concertId]))[0],...source,id:concertId}
 await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
 const payload=buildProgramTextAnalysisPayload({concert,analysis:analyzeSelectedProgramSource({concert,source:routeProgramSource(concert)})})
 const analysisId=(await q('select public.save_concert_program_text_analysis_v4($1,$2) id',[payload,CATALOG_JSON]))[0].id
 const ready=await q('select * from public.read_concert_program_text_candidate_status_v4($1) where automatic_ready order by id',[analysisId])
 for(const c of ready.slice(0,2))await q('select public.confirm_concert_program_text_candidate_v4($1,$2)',[{candidate_id:c.id,analysis_id:analysisId,source_hash:payload.source_hash,payload_hash:payload.payload_hash,catalog_hash:CATALOG_HASH,matcher_version:'stored-program-4',decision_version:'program-text-confirm-1'},CATALOG_JSON])
 // Build an old graph directly from the manifest, without a recognition engine,
 // worker, legacy RPC or copied production rows. Confirmed status fixtures are
 // synthetic, not an attestation that their evidence is currently effective.
 const [attempts,results,analyses,candidates,reviews]=retirementManifest.drop.tables.map(t=>t.name)
 const image=(await q('select id from public.concert_program_images where concert_id=$1',[concertId]))[0].id
 const result=randomUUID(),attempt=randomUUID(),legacyAnalysis=randomUUID(),hash='a'.repeat(64)
 await q(`insert into public.${results}(id,image_id,content_sha256,pipeline_version,engine_version,torch_version,settings,raw_text,detections,width,height,processed_at) values($1,$2,$3,'synthetic-fixture','fixture','fixture','{}','Synthetic old source','[]',1,1,now())`,[result,image,hash])
 await q(`insert into public.${attempts}(id,image_id,result_id,content_sha256,pipeline_version,status,started_at,finished_at,duration_ms) values($1,$2,$3,$4,'synthetic-fixture','SUCCEEDED',now(),now(),0)`,[attempt,image,result,hash])
 await q(`insert into public.${analyses}(id,concert_id,image_id,ocr_result_id,source_attempt_id,image_revision,concert_revision,concert_context,matcher_version,catalog_hash,sections,limitations,payload_hash) values($1,$2,$3,$4,$5,0,0,$6,'stored-program-3',$7,'[]','[]',$8)`,[legacyAnalysis,concertId,image,result,attempt,{title:concert.title,venue:concert.venue,start_date:concert.start_date,end_date:concert.end_date},CATALOG_HASH,hash])
 await db.exec('set session_replication_role=replica')
 try{for(let i=0;i<3;i++){
  const candidate=randomUUID(),target=JSON.parse(CATALOG_JSON).targets[i]
  await q(`insert into public.${candidates}(id,analysis_id,candidate_key,track_id,work_id,identity,relation,outcome,section_index,evidence,generation_reasons,review_reasons,review_status) values($1,$2,$3,$4,$5,'{}','EXACT','MATCHED',0,'[{}]','[]','[]','CONFIRMED')`,[candidate,legacyAnalysis,String(i).repeat(64),target.trackId,target.workId])
  await q(`insert into public.${reviews}(candidate_id,status,note,work_identity_hash,work_identity_snapshot,identity_source,identity_attested_at,confirmed_evidence_hash,confirmed_matcher_version,confirmed_pipeline_version) values($1,'CONFIRMED','Synthetic discarded decision',$2,'{"schema":"work-identity-1"}','MANUAL_CONFIRMATION',now(),$2,'stored-program-3','synthetic-fixture')`,[candidate,hash])
 }}finally{await db.exec('set session_replication_role=origin')}
 if(apply)await db.exec(retirementSql)
 return {concertId,analysisId,payload,text,readyCount:ready.length}
}
export async function snapshotRetained(db){
 const out={tables:{}}
 for(const t of retirementManifest.retain.tables){const rows=(await db.query(`select to_jsonb(t) as row from ${t.schema}.${t.name} t order by to_jsonb(t)::text`)).rows;out.tables[t.schema+'.'+t.name]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}}
 out.functions=(await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) def,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','atlas_private') and p.prokind='f' order by 1,2,3`)).rows.filter(f=>!retirementManifest.drop.functions.some(d=>d.schema===f.nspname&&d.name===f.proname))
 out.policies=(await db.query(`select * from pg_policies where schemaname in('public','atlas_private') order by schemaname,tablename,policyname`)).rows.filter(p=>!retirementManifest.drop.tables.some(t=>t.name===p.tablename))
 out.triggers=(await db.query(`select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) def,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in('public','atlas_private') order by 1,2,3`)).rows.filter(t=>!retirementManifest.drop.tables.some(d=>d.name===t.relname))
 return out
}
