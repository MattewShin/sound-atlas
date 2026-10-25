import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {CATALOG_JSON,analyzeStoredProgram,hashJson} from './programAnalysis.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload,programTextPayloadHash,createProgramTextAnalysisStore,PROGRAM_TEXT_SAVE_RPC} from './supabaseProgramTextAnalysis.mjs'
import {EASYOCR_PIPELINE_VERSION} from './easyOcrConfig.mjs'

// All SQL executes inside disposable in-memory PostgreSQL. No .env or live API.
const sql=await readFile(new URL('../supabase/migrations/202610260001_program_text_analysis_v4.sql',import.meta.url),'utf8')
const hash=text=>createHash('sha256').update(text).digest('hex')
const rows=async(db,table)=>(await db.query('select * from public.'+table+' order by 1')).rows
const policy=async db=>(await db.query('select * from public.concert_program_version_policy order by matcher_version')).rows
const count=async db=>Promise.all(['concert_program_text_analyses','concert_program_text_candidates','concert_program_catalogs'].map(async t=>(await db.query('select count(*)::int n from public.'+t)).rows[0].n))
const rehash=p=>{const {payload_hash,...body}=p;return {...body,payload_hash:programTextPayloadHash(body)}}
const save=async(db,p,catalog=CATALOG_JSON)=>(await db.query('select public.save_concert_program_text_analysis_v4($1,$2) id',[JSON.stringify(p),catalog])).rows[0].id
const enable=async db=>db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
const make=concert=>{const analysis=analyzeSelectedProgramSource({concert,source:routeProgramSource(concert)});return {concert,analysis}}
const legacy=async db=>hashJson(await Promise.all(['concert_program_images','concert_image_ocr_results','concert_image_ocr_attempts','concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_candidate_status'].map(t=>rows(db,t))))
const definitions=async db=>(await db.query("select oid::text,proname,proacl::text,pg_get_functiondef(oid) def from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'save_concert_program_text_analysis_v4' order by oid")).rows

async function setup(){
  const db=new PGlite()
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
    for(const f of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql','migrations/202610150001_concert_program_analysis.sql','drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','migrations/202610210001_program_work_identity.sql','migrations/202610220001_program_automation.sql','migrations/202610230002_kopis_detail_text.sql','migrations/202610230003_program_analysis_v4.sql'])
      await db.exec(await readFile(new URL('../supabase/'+f,import.meta.url),'utf8'))
    const text='🎹 e\u0301 안내\r\n[Program]\r\nF. Chopin (e\u0301 🎹)\r\nScherzo No.4 in E Major, Op.54\r\nBiography\r\nPreviously performed Liszt\r\n[Program]\r\nJ. Brahms\r\nIntermezzo Op.118 No.2'
    const data={kopis_id:'PF900054',title:'Local text SQL fixture',venue:'Local hall',region:'서울',start_date:'2099-10-23',end_date:'2099-10-23',performance_status:'공연예정',synced_at:'2026-10-26T00:00:00Z',kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
    await db.exec('set role service_role')
    await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(data),JSON.stringify([{source_url:'https://kopis.or.kr/upload/local-text-ocr-fixture.png',image_type:'DETAIL',sort_order:0}])])
    const k={...(await rows(db,'concerts'))[0],...data},image=(await rows(db,'concert_program_images'))[0]
    const attempt={id:randomUUID(),image_id:image.id,source_url:image.source_url,status:'SUCCEEDED',content_sha256:'a'.repeat(64),pipeline_version:EASYOCR_PIPELINE_VERSION,started_at:'2026-10-26T00:00:00Z',finished_at:'2026-10-26T00:00:01Z',duration_ms:1000}
    await db.query('select public.record_concert_image_ocr($1,$2)',[JSON.stringify(attempt),JSON.stringify({raw_text:'PROGRAM\nF. Chopin\nBallade No.4 Op.52',detections:[],engine_version:'fixture',torch_version:'fixture',settings:{},width:800,height:200})])
    const ocr=(await rows(db,'concert_image_ocr_results'))[0],a=analyzeStoredProgram({concert:k,image,ocr,attempt})
    // Legacy-compatible Ballade storage fixtures, not earlier task test suites.
    await enable(db)
    for(const version of [2,3,4]){
      const body={...a,matcher_version:'stored-program-'+version,candidates:a.candidates.map(c=>({...c,generation_version:'stored-program-'+version}))};delete body.payload_hash
      const payload={...body,payload_hash:hashJson(body)},fn='save_concert_program_analysis'+(version>2?'_v'+version:'')
      const id=(await db.query('select public.'+fn+'($1,$2) id',[JSON.stringify(payload),CATALOG_JSON])).rows[0].id
      if(version<4){
        const c=(await rows(db,'concert_program_candidates')).find(c=>c.analysis_id===id)
        await db.query('select public.review_concert_program_candidate_identity($1,$2,$3,$4,$5,$6)',[c.id,version===3?'CONFIRMED':'REJECTED','Local historical receipt',id,'stored-program-'+version,CATALOG_JSON])
      }
    }
    await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4';reset role")
    return {db,concert:k,input:make(k)}
  }catch(error){await db.close();throw error}
}

test('official-text migration rolls back all new DDL; leaves policy, existing functions and OCR/review rows untouched',async()=>{
  const {db}=await setup()
  try{
    // Missing policy remains missing; the migration must never create it.
    await db.exec("delete from public.concert_program_version_policy where matcher_version='stored-program-4'")
    const before={legacy:await legacy(db),policy:await policy(db),definitions:await definitions(db)}
    await assert.rejects(db.exec(sql.replace(/commit;\s*$/,()=>"do $$ begin raise exception 'late text migration failure';end $$;commit;")),/late text migration failure/)
    await db.exec('rollback')
    for(const name of ['concert_program_text_analyses','concert_program_text_candidates'])assert.equal((await db.query('select to_regclass($1) t',['public.'+name])).rows[0].t,null)
    assert.equal((await db.query("select to_regprocedure('public.save_concert_program_text_analysis_v4(jsonb,text)') f")).rows[0].f,null)
    assert.deepEqual(await policy(db),before.policy);assert.equal(await legacy(db),before.legacy)
    assert.deepEqual(await definitions(db),before.definitions)
    await db.exec(sql)
    assert.deepEqual(await policy(db),before.policy);assert.equal(await legacy(db),before.legacy);assert.deepEqual(await definitions(db),before.definitions)
    await assert.rejects(db.exec(sql),/already exists/);await db.exec('rollback')
    assert.deepEqual(await policy(db),before.policy)
  }finally{await db.close()}
})

test('disabled/missing policy blocks; test-only enable stores Unicode official snapshots idempotently without superseding OCR v2/v3/v4',async()=>{
  const {db,concert,input}=await setup()
  try{
    await db.exec(sql);await db.exec('set role service_role')
    const p=buildProgramTextAnalysisPayload(input),before=await count(db)
    await assert.rejects(save(db,p),/disabled or policy missing/);assert.deepEqual(await count(db),before)
    await db.exec('reset role');await db.exec("delete from public.concert_program_version_policy where matcher_version='stored-program-4';set role service_role")
    await assert.rejects(save(db,p),/disabled or policy missing/)
    await db.exec('reset role');await db.exec("insert into public.concert_program_version_policy values('stored-program-4',true,'Test-only activation');set role service_role")
    // Compare around the text save, after explicit test policy activation. The
    // old status view itself intentionally reflects that shared policy change.
    const original=await legacy(db)
    const id=await save(db,p),after=await count(db)
    assert.equal(await save(db,structuredClone(p)),id);assert.deepEqual(await count(db),after)
    const stored=(await rows(db,'concert_program_text_analyses'))[0]
    assert.deepEqual(stored.snapshot,p);assert.equal(stored.source_kind,'KOPIS_DETAIL_TEXT');assert.equal(stored.offset_unit,'UNICODE_CODE_POINT')
    const candidates=await rows(db,'concert_program_text_candidates');assert.equal(candidates.length,2);assert.ok(candidates.every(c=>c.review_status==='REVIEW_REQUIRED'))
    assert.equal(candidates.find(c=>c.snapshot.track_id==='chopin-scherzo-op54-no4').snapshot.relation,'EXACT')
    assert.equal(await legacy(db),original)
    const reordered=JSON.parse(JSON.stringify(p));reordered.source_kind=p.source_kind;assert.equal(await save(db,reordered),id)
    const changed=structuredClone(p);changed.diagnostic_metadata.note='different complete snapshot'
    await assert.rejects(save(db,changed),/Payload hash mismatch/)
    await assert.rejects(save(db,rehash(changed)),/increment matcher version/)
    const newText=concert.kopis_detail_text+'\r\n'
    await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[newText,hash(newText),concert.id])
    await assert.rejects(save(db,p),/source hash/)
    const next=buildProgramTextAnalysisPayload(make({...concert,kopis_detail_text:newText,kopis_detail_text_hash:hash(newText)})),nextId=await save(db,next)
    assert.notEqual(nextId,id)
    const all=await rows(db,'concert_program_text_analyses');assert.equal(all.filter(a=>a.is_current).length,1);assert.equal(all.find(a=>a.id===id).is_current,false)
    assert.equal(await save(db,next),nextId);assert.equal(await legacy(db),original)
    // A source hash can legitimately reappear without changing concert context.
    // Fresh bytes must restore its existing text ID/current pointer, not OCR.
    await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[concert.kopis_detail_text,concert.kopis_detail_text_hash,concert.id])
    const reusedCounts=await count(db)
    assert.equal(await save(db,p),id);assert.equal(await save(db,p),id);assert.deepEqual(await count(db),reusedCounts)
    assert.equal((await rows(db,'concert_program_text_analyses')).find(a=>a.is_current).id,id)
    assert.equal(await legacy(db),original)
    await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
    await assert.rejects(save(db,next),/disabled/)
  }finally{await db.close()}
})

test('SQL rejects forged labels, hash, context, code-point quotes, nested evidence, logical fanout and catalog membership atomically',async()=>{
  const {db,concert,input}=await setup()
  try{
    await db.exec(sql);await enable(db);await db.exec('set role service_role')
    const p=buildProgramTextAnalysisPayload(input),before=await count(db)
    const mutations=[
      x=>{x.source_kind='OCR'},x=>{x.matcher_version='stored-program-3'},x=>{x.offset_unit='UTF16_CODE_UNIT'},
      x=>{x.image_id=randomUUID()},x=>{x.source_hash='f'.repeat(64)},x=>{x.catalog_hash='f'.repeat(64)},
      x=>{x.concert_revision++},x=>{x.concert_context.title='other concert'},
      x=>{x.candidates[0].generation_version='stored-program-3'},x=>{x.candidates[0].review_status='CONFIRMED'},
      x=>{x.candidates[0].evidence[0].quote='forged quote'},x=>{x.candidates[0].evidence[0].start++},
      x=>{x.logical_works[0].work.language_variants[0].source_lines[0].quote='nested forgery'},
      x=>{x.candidates[0].evidence[0].bbox=[[1,2]]},x=>{x.candidates[0].track_id='unregistered-track'},
      x=>{x.candidates[0].evidence=[{}];x.logical_works[0].source_lines=[{}]},
      x=>{x.candidates[1].candidate_key=x.candidates[0].candidate_key},
      x=>{x.candidates[0].section_index=-1},x=>{x.sections[0].start=null},x=>{x.source_sections[0].end=999999},
      x=>{x.candidates.pop()},x=>{x.candidates[0].logical_work_id='missing'},
      x=>{x.logical_works[0].catalog_matches.push(x.logical_works[0].catalog_matches[0])},
    ]
    for(const mutate of mutations){const value=structuredClone(p);mutate(value);await assert.rejects(save(db,rehash(value)));assert.deepEqual(await count(db),before)}
    await assert.rejects(save(db,p,CATALOG_JSON+' '),/Catalog hash/)
    // UTF-16 diagnostic data is retained but never used as a trusted offset.
    const diagnostic=structuredClone(p);diagnostic.candidates[0].evidence[0].diagnostic_utf16={start:999,end:1000}
    diagnostic.logical_works[0].source_lines[0].diagnostic_utf16={start:999,end:1000}
    await save(db,rehash(diagnostic))
    await db.query('update public.concerts set kopis_detail_text_hash=$1 where id=$2',['f'.repeat(64),concert.id])
    await assert.rejects(save(db,rehash({...p,source_hash:'f'.repeat(64)})),/source hash/)
    await db.query('update public.concerts set kopis_detail_text=null,kopis_detail_text_hash=null where id=$1',[concert.id])
    await assert.rejects(save(db,p),/source hash/)
  }finally{await db.close()}
})

test('text-only ACL/RLS and adapter preflight enforce service-role, exact policy and dedicated RPC without changing legacy selection',async()=>{
  const {db,input}=await setup()
  try{
    await db.exec(sql)
    const tables=['concert_program_text_analyses','concert_program_text_candidates']
    const meta=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.save_concert_program_text_analysis_v4(jsonb,text)'::regprocedure")).rows[0]
    assert.equal(meta.prosecdef,false);assert.ok(meta.proconfig.includes('search_path=""'))
    const acl=(await db.query("select x.grantee,r.rolname from pg_proc p cross join lateral aclexplode(p.proacl) x left join pg_roles r on r.oid=x.grantee where p.oid='public.save_concert_program_text_analysis_v4(jsonb,text)'::regprocedure")).rows
    assert.ok(!acl.some(a=>a.grantee===0||['anon','authenticated'].includes(a.rolname)));assert.ok(acl.some(a=>a.rolname==='service_role'))
    for(const table of tables){
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+table])).rows[0].relrowsecurity,true)
      const columns=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1",[table])).rows.map(c=>c.column_name)
      for(const field of ['image_id','ocr_result_id','source_attempt_id'])assert.ok(!columns.includes(field))
    }
    const calls=[],store=createProgramTextAnalysisStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
      calls.push(init.method)
      if(init.method==='POST'){
        assert.equal(url.pathname,'/rest/v1/rpc/'+PROGRAM_TEXT_SAVE_RPC)
        const body=JSON.parse(init.body);return new Response(JSON.stringify(await save(db,body.p_analysis,body.p_catalog_json)))
      }
      if(url.pathname==='/rest/v1/')return new Response(JSON.stringify({paths:{['/rpc/'+PROGRAM_TEXT_SAVE_RPC]:{}}}))
      return new Response(JSON.stringify((await policy(db)).filter(p=>p.matcher_version==='stored-program-4')))
    }})
    await db.exec('set role service_role');await assert.rejects(store.save(input),/VERSION_DISABLED/);assert.ok(calls.every(m=>m==='GET'))
    await enable(db);assert.ok(await store.save(input));assert.equal(calls.filter(m=>m==='POST').length,1);await db.exec('reset role')
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(save(db,buildProgramTextAnalysisPayload(input)),/permission denied/)
      for(const table of tables)await assert.rejects(rows(db,table),/permission denied/)
      await db.exec('reset role')
      for(const table of tables)await db.exec('grant select on public.'+table+' to '+role)
      await db.exec('set role '+role)
      for(const table of tables)assert.deepEqual(await rows(db,table),[])
      await db.exec('reset role')
    }
  }finally{await db.close()}
})
