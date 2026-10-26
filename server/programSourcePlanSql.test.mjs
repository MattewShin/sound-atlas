import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {CATALOG_JSON,analyzeStoredProgram,hashJson} from './programAnalysis.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload,programTextPayloadHash} from './supabaseProgramTextAnalysis.mjs'
import {planProgramSource,createProgramSourceReader} from './programSourcePlan.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

// Disposable in-memory PostgreSQL only. No env files, sockets or live APIs.
const migration=await readFile(new URL('../supabase/migrations/202610260002_program_text_status.sql',import.meta.url),'utf8')
const sha=s=>createHash('sha256').update(s).digest('hex')
const text='\u{1f3b9} e\u0301\r\n[Program]\r\nF. Chopin\r\nScherzo No.4 in E Major, Op.54'
const rows=async(db,table)=>(await db.query('select * from public.'+table+' order by 1')).rows
const payload=k=>buildProgramTextAnalysisPayload({concert:k,analysis:analyzeSelectedProgramSource({concert:k,source:routeProgramSource(k)})})
const save=async(db,p)=>(await db.query('select public.save_concert_program_text_analysis_v4($1,$2) id',[JSON.stringify(p),CATALOG_JSON])).rows[0].id
const rehash=p=>{const {payload_hash,...body}=p;return {...body,payload_hash:programTextPayloadHash(body)}}
const views=['concert_program_text_analysis_status','concert_program_text_candidate_status']
const legacyTables=['concert_program_images','concert_image_ocr_results','concert_image_ocr_attempts','concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_candidate_status']
const legacy=async db=>hashJson(await Promise.all(legacyTables.map(t=>rows(db,t))))
const definitions=async db=>(await db.query("select viewname,definition from pg_views where schemaname='public' and viewname not like 'concert_program_text_%' order by viewname")).rows

async function setup({duplicate=false,empty=false}={}){
  const db=new PGlite()
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
    for(const f of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql',
      'migrations/202610150001_concert_program_analysis.sql','drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql',
      'migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql',
      'migrations/202610230002_kopis_detail_text.sql','migrations/202610230003_program_analysis_v4.sql',
      'migrations/202610260001_program_text_analysis_v4.sql'])
      await db.exec(await readFile(new URL('../supabase/'+f,import.meta.url),'utf8'))
    const raw=duplicate?text+'\r\n[Program]\r\nF. Chopin\r\nScherzo No.4 in E Major, Op.54':text
    const data={kopis_id:'PF900056',title:'Isolated 3F fixture',venue:'Local hall',region:'Seoul',start_date:'2099-10-26',end_date:'2099-10-26',
      performance_status:'공연예정',synced_at:'2026-10-26T00:00:00Z',kopis_detail_text:raw,kopis_detail_text_hash:sha(raw)}
    await db.exec('set role service_role')
    await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(data),JSON.stringify([{source_url:'https://kopis.or.kr/upload/isolated-3f.png',image_type:'DETAIL',sort_order:0}])])
    const concert={...(await rows(db,'concerts'))[0],...data},image=(await rows(db,'concert_program_images'))[0]
    const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,status:'SUCCEEDED',content_sha256:'a'.repeat(64),
      pipeline_version:EASYOCR_PIPELINE_VERSION,started_at:'2026-10-26T00:00:00Z',finished_at:'2026-10-26T00:00:01Z',duration_ms:1000}
    await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text:'PROGRAM\nF. Chopin\nBallade No.4 Op.52',detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:200})])
    const ocr=(await rows(db,'concert_image_ocr_results'))[0],ocrAnalysis=analyzeStoredProgram({concert,image,ocr,attempt})
    // Fixture data only: legacy versions/receipts let new reads prove preservation.
    await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
    for(const v of [2,3,4]){
      const body={...ocrAnalysis,matcher_version:'stored-program-'+v,candidates:ocrAnalysis.candidates.map(c=>({...c,generation_version:'stored-program-'+v}))};delete body.payload_hash
      const fn='save_concert_program_analysis'+(v>2?'_v'+v:'')
      const a=(await db.query('select public.'+fn+'($1,$2) id',[JSON.stringify({...body,payload_hash:hashJson(body)}),CATALOG_JSON])).rows[0].id
      if(v<4){const c=(await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===a)
        await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',[c.id,v===3?'CONFIRMED':'REJECTED','Local historical fixture',a,'stored-program-'+v,CATALOG_JSON])}
    }
    let p=payload(concert)
    if(empty)p=rehash({...p,candidates:[],logical_works:[],sections:[]})
    const analysisId=await save(db,p)
    await db.exec('reset role')
    return {db,concert,analysisId,p,ocr}
  }catch(e){await db.close();throw e}
}

test('additive view migration rolls back cleanly, leaves policy and existing OCR/review/search definitions and rows unchanged',async()=>{
  const {db}=await setup()
  try{
    const before={legacy:await legacy(db),defs:await definitions(db),policy:await rows(db,'concert_program_version_policy')}
    await assert.rejects(db.exec(migration.replace(/commit;\s*$/,()=>"do $$ begin raise exception '3F rollback fixture';end $$;commit;")),/3F rollback fixture/)
    await db.exec('rollback')
    for(const v of views)assert.equal((await db.query('select to_regclass($1) v',['public.'+v])).rows[0].v,null)
    await db.exec(migration)
    assert.equal(await legacy(db),before.legacy);assert.deepEqual(await definitions(db),before.defs)
    assert.deepEqual(await rows(db,'concert_program_version_policy'),before.policy)
    await db.exec('set role service_role')
    const statuses=await rows(db,views[1]);assert.equal(statuses.length,1);assert.equal(statuses[0].automatic_ready,true)
    assert.equal(statuses[0].review_status,'REVIEW_REQUIRED');assert.equal(statuses[0].relation,'EXACT');assert.equal(statuses[0].outcome,'MATCHED')
    assert.equal(await legacy(db),before.legacy)
  }finally{await db.close()}
})

test('live source bytes/hash, context/revision, matcher/catalog snapshots, saved-current and explicit v4 policy gate freshness/readiness',async()=>{
  const {db,concert,analysisId}=await setup()
  try{
    await db.exec(migration)
    const changes=[
      ["update public.concerts set kopis_detail_text=kopis_detail_text||' changed'",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set kopis_detail_text_hash=repeat('f',64)",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set kopis_detail_text=null,kopis_detail_text_hash=null",'SOURCE_HASH_CHANGED_OR_INVALID'],
      ["update public.concerts set title='Changed title'",'CONCERT_CONTEXT_CHANGED'],
      // The existing concert trigger prevents direct revision-only changes.
      ["update public.concert_program_text_analyses set concert_revision=concert_revision+1",'CONCERT_CONTEXT_CHANGED'],
      ["update public.concert_program_text_analyses set snapshot=jsonb_set(snapshot,'{matcher_version}','\"stored-program-3\"')",'ANALYSIS_SNAPSHOT_MISMATCH'],
      ["update public.concert_program_text_analyses set snapshot=jsonb_set(snapshot,'{catalog_hash}',to_jsonb(repeat('f',64)))",'CATALOG_SNAPSHOT_MISMATCH'],
      ["update public.concert_program_text_analyses set is_current=false",'ANALYSIS_SUPERSEDED'],
      ["update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'",'VERSION_POLICY_DISABLED_OR_MISSING'],
      ["delete from public.concert_program_version_policy where matcher_version='stored-program-4'",'VERSION_POLICY_DISABLED_OR_MISSING']
    ]
    for(const [sql,reason] of changes){
      await db.exec('begin;'+sql+';set local role service_role')
      const a=(await rows(db,views[0]))[0],c=(await rows(db,views[1]))[0]
      assert.ok(a.stale_reasons.includes(reason),sql+' -> '+JSON.stringify(a.stale_reasons));assert.equal(a.is_effective_current,false);assert.equal(c.automatic_ready,false)
      const plan=planProgramSource({concert,analyses:[a],statuses:[c]})
      if(['SOURCE_HASH_CHANGED_OR_INVALID','CONCERT_CONTEXT_CHANGED','ANALYSIS_SNAPSHOT_MISMATCH','CATALOG_SNAPSHOT_MISMATCH','ANALYSIS_SUPERSEDED'].includes(reason))assert.equal(plan.reason_code,'OFFICIAL_ANALYSIS_PENDING')
      else {assert.equal(plan.reason_code,'OFFICIAL_PROGRAM_SELECTED');assert.equal(plan.ready_count,0)}
      await db.exec('rollback')
    }
    assert.equal((await rows(db,views[0]))[0].id,analysisId)
    assert.equal((await rows(db,views[1]))[0].automatic_ready,true)
    await db.exec("begin;update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{review_reasons}','[\"COMPOSER_CONFLICT\"]');set local role service_role")
    assert.ok((await rows(db,views[1]))[0].exclusion_reasons.includes('CANDIDATE_SNAPSHOT_MISMATCH'))
    assert.ok((await rows(db,views[1]))[0].exclusion_reasons.includes('UNRESOLVED_REVIEW_OR_SCOPE'))
    await db.exec('rollback')
    // Valid saved snapshots (not just forged rows) must fail the readiness gate.
    for(const [mutate,reason] of [
      [c=>c.review_reasons.push('COMPOSER_CONFLICT'),'UNRESOLVED_REVIEW_OR_SCOPE'],
      [c=>c.review_reasons.push('ARRANGEMENT_IDENTITY_UNRESOLVED'),'UNRESOLVED_REVIEW_OR_SCOPE'],
      [c=>c.review_reasons.push('EXCERPT_SCOPE_REQUIRES_REVIEW'),'UNRESOLVED_REVIEW_OR_SCOPE'],
      [c=>c.review_reasons.push('UNKNOWN_REVIEW_REASON'),'UNRESOLVED_REVIEW_OR_SCOPE'],
      [c=>{c.outcome='CONFLICT'},'NOT_MATCHED_EXACT'],
      [c=>{c.relation='WHOLE_WORK_REFERENCE'},'NOT_MATCHED_EXACT'],
      [c=>{c.track_id=null},'CATALOG_TARGET_MISSING']
    ]){
      await db.exec('begin;set local role service_role')
      const raw=concert.kopis_detail_text+'\r\n',k={...concert,kopis_detail_text:raw,kopis_detail_text_hash:sha(raw)}
      await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[raw,sha(raw),concert.id])
      const next=payload(k);mutate(next.candidates[0]);const aid=await save(db,rehash(next))
      const c=(await rows(db,views[1])).find(c=>c.analysis_id===aid)
      assert.equal(c.is_fresh,true);assert.equal(c.automatic_ready,false);assert.ok(c.exclusion_reasons.includes(reason))
      await db.exec('rollback')
    }
  }finally{await db.close()}
})

test('same-source duplicates remain separate and excluded; fresh zero-candidate analysis is not pending; GET adapter reads real SQL views',async()=>{
  for(const options of [{duplicate:true},{empty:true}]){
    const {db,concert,ocr}=await setup(options)
    try{
      await db.exec(migration);await db.exec('set role service_role')
      const before=await legacy(db),statuses=await rows(db,views[1]),analyses=await rows(db,views[0])
      if(options.duplicate){assert.equal(statuses.length,2);assert.ok(statuses.every(c=>!c.automatic_ready&&c.exclusion_reasons.includes('DUPLICATE_TRACK_OR_WORK')))}
      else assert.equal(statuses.length,0)
      const calls=[],reader=createProgramSourceReader({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
        assert.equal(init.method,'GET');assert.equal(init.body,undefined)
        const name=url.pathname.split('/').pop();assert.ok(['concerts',...views].includes(name));calls.push(name)
        let data=await rows(db,name)
        for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))data=data.filter(r=>String(r[key])===value.slice(3))
        const offset=Number(url.searchParams.get('offset')||0);return new Response(JSON.stringify(data.slice(offset,offset+1)))
      }})
      const out=await reader.plan({concert_id:concert.id,current_ocr_evidence:{is_current:true,raw_text:ocr.raw_text,ocr_result_id:ocr.id}})
      assert.equal(out.reason_code,'OFFICIAL_PROGRAM_SELECTED');assert.equal(out.ready_count,0);assert.equal(out.total_candidates,options.duplicate?2:0)
      assert.equal(analyses[0].is_fresh,true);assert.equal(await legacy(db),before);assert.ok(calls.every(n=>n!=='concert_program_candidate_status'))
    }finally{await db.close()}
  }
})

test('service-role-only SELECT ACL and security-invoker RLS prevent public/anon/authenticated leakage or view writes',async()=>{
  const {db}=await setup()
  try{
    await db.exec(migration)
    for(const v of views){
      const meta=(await db.query('select reloptions from pg_class where oid=$1::regclass',['public.'+v])).rows[0]
      assert.ok(meta.reloptions.includes('security_invoker=true'))
      const acl=(await db.query('select x.grantee,x.privilege_type,r.rolname from pg_class c cross join lateral aclexplode(c.relacl) x left join pg_roles r on r.oid=x.grantee where c.oid=$1::regclass',['public.'+v])).rows
      assert.ok(!acl.some(x=>x.grantee===0||['anon','authenticated'].includes(x.rolname)))
      assert.deepEqual(acl.filter(x=>x.rolname==='service_role').map(x=>x.privilege_type),['SELECT'])
    }
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role)
      for(const v of views)await assert.rejects(rows(db,v),/permission denied/)
      await db.exec('reset role')
      // Even an accidental future SELECT grant cannot turn this into a
      // security-definer view. Underlying text tables have RLS, no policies.
      for(const t of [...views,'concert_program_text_analyses','concert_program_text_candidates','concerts','concert_program_catalogs','concert_program_version_policy'])await db.exec('grant select on public.'+t+' to '+role)
      await db.exec('grant execute on function public.program_identity_canonical(jsonb) to '+role)
      await db.exec('set role '+role)
      for(const v of views)assert.deepEqual(await rows(db,v),[])
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    for(const v of views)await assert.rejects(db.query('delete from public.'+v),/permission denied|cannot delete/)
    assert.equal((await rows(db,views[1]))[0].review_status,'REVIEW_REQUIRED')
  }finally{await db.close()}
})
