import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {CATALOG_JSON} from './programAnalysis.mjs'
import {canonicalIdentityJson} from './programWorkIdentity.mjs'
import {createProgramTextConfirmationStore} from './supabaseProgramTextConfirmation.mjs'
import {confirmationMigration,programTextConfirmationFixture,rows,originalDigest,expected,confirm,save,payload,rehash,hash} from './testSupport/programTextConfirmationFixture.mjs'

const table='concert_program_text_confirmations',rpc='public.confirm_concert_program_text_candidate_v4(jsonb,text)'
const setup=async(apply=true)=>{const db=new PGlite();try{const f=await programTextConfirmationFixture(db);if(apply)await db.exec(confirmationMigration);return f}catch(e){await db.close();throw e}}
const definitions=async db=>(await db.query("select oid::text,proname,pg_get_functiondef(oid) definition,proacl::text from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('confirm_concert_program_text_candidate_v4','prevent_program_text_confirmation_mutation') order by oid")).rows
const viewDefinitions=async db=>(await db.query("select viewname,definition from pg_views where schemaname='public' order by viewname")).rows
// SAVEPOINT allows assertions after a PostgreSQL error without masking rollback.
const rejectNoWrite=async(f,input=f.input,catalog=CATALOG_JSON)=>{
  const before=await originalDigest(f.db),receipts=await rows(f.db,table)
  await f.db.exec('savepoint no_write')
  await assert.rejects(confirm(f.db,input,catalog))
  await f.db.exec('rollback to savepoint no_write;release savepoint no_write')
  assert.deepEqual(await rows(f.db,table),receipts);assert.equal(await originalDigest(f.db),before)
}
const pgArg=process.argv.find(a=>a.startsWith('--isolated-postgres-config='))

if(!pgArg){
test('confirmation migration rollback and success preserve policy, all old functions/views, OCR reviews and official rows',async()=>{
  const f=await setup(false),{db}=f
  try{
    const before={digest:await originalDigest(db),functions:await definitions(db),views:await viewDefinitions(db)}
    await assert.rejects(db.exec(confirmationMigration.replace(/commit;\s*$/,()=>"do $$begin raise exception '3G migration rollback fixture';end $$;commit;")),/3G migration rollback fixture/)
    await db.exec('rollback')
    assert.equal((await db.query('select to_regclass($1) t',['public.'+table])).rows[0].t,null)
    assert.equal((await db.query('select to_regprocedure($1) f',[rpc])).rows[0].f,null)
    await db.exec(confirmationMigration)
    assert.equal(await originalDigest(db),before.digest);assert.deepEqual(await definitions(db),before.functions);assert.deepEqual(await viewDefinitions(db),before.views)
    assert.equal((await rows(db,'concert_program_version_policy')).find(p=>p.matcher_version==='stored-program-4').enabled,true)
  }finally{await db.close()}
})

test('one CONFIRMED receipt retains DB identity/evidence hashes; identical retry is same ID, official/OCR rows unchanged, transaction abort removes receipt',async()=>{
  const f=await setup(),{db}=f
  try{
    await db.exec('set role service_role');const before=await originalDigest(db)
    await db.exec('begin');await confirm(db,f.input);await assert.rejects(db.exec("do $$begin raise exception 'after receipt failure';end $$"),/after receipt failure/);await db.exec('rollback')
    assert.equal((await rows(db,table)).length,0)
    const id=await confirm(db,f.input);assert.equal(await confirm(db,structuredClone(f.input)),id)
    const all=await rows(db,table);assert.equal(all.length,1);const r=all[0]
    assert.equal(r.status,'CONFIRMED');assert.equal(r.candidate_id,f.candidate.id);assert.equal(r.analysis_id,f.analysis.id);assert.equal(r.concert_id,f.concert.id)
    assert.equal(r.track_id,f.candidate.snapshot.track_id);assert.equal(r.work_id,f.candidate.snapshot.work_id)
    assert.equal(r.source_hash,f.p.source_hash);assert.equal(r.payload_hash,f.p.payload_hash);assert.equal(r.catalog_hash,f.p.catalog_hash)
    assert.equal(r.matcher_version,'stored-program-4');assert.equal(r.decision_version,'program-text-confirm-1')
    assert.equal(r.evidence_hash,hash(canonicalIdentityJson(f.candidate.snapshot.evidence)))
    assert.equal(r.candidate_snapshot_hash,hash(canonicalIdentityJson(f.candidate.snapshot)))
    assert.equal(r.work_identity_hash,hash(canonicalIdentityJson(r.work_identity_snapshot)))
    assert.deepEqual(r.work_identity_snapshot,(await db.query('select public.program_work_identity($1,$2) i',[CATALOG_JSON,f.candidate.snapshot.work_id])).rows[0].i)
    assert.ok(!JSON.stringify(r).includes(f.concert.kopis_detail_text));assert.ok(!Object.hasOwn(r,'raw_text'))
    assert.equal(await originalDigest(db),before)
    for(const changed of [{...f.input,source_hash:'e'.repeat(64)},{...f.input,payload_hash:'e'.repeat(64)},{...f.input,catalog_hash:'e'.repeat(64)},
      {...f.input,decision_version:'other'},{...f.input,track_id:'caller-work'}]){
      await db.exec('begin');await rejectNoWrite(f,changed);await db.exec('rollback')
    }
    // A retry must revalidate live freshness even if its receipt already exists.
    await db.exec("begin;update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
    await rejectNoWrite(f);await db.exec('rollback');assert.equal((await rows(db,table)).length,1)
  }finally{await db.close()}
})

test('stale/disabled/unknown IDs, full-snapshot tampering, all ineligible scopes/reasons and duplicate candidates produce no receipt of either status',async()=>{
  const f=await setup(),{db}=f
  try{
    for(const change of [
      "update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'",
      "delete from public.concert_program_version_policy where matcher_version='stored-program-4'",
      "update public.concerts set kopis_detail_text=kopis_detail_text||'changed'",
      "update public.concerts set kopis_detail_text_hash=repeat('e',64)",
      "update public.concerts set title='Different concert'",
      "update public.concert_program_text_analyses set is_current=false",
      "update public.concert_program_text_analyses set concert_revision=concert_revision+1",
      "update public.concert_program_text_analyses set snapshot=jsonb_set(snapshot,'{diagnostic_metadata,note}','\"tampered\"')",
      "update public.concert_program_text_candidates set snapshot=jsonb_set(snapshot,'{track_id}','\"forged\"')",
      "update public.concert_program_catalogs set catalog=jsonb_set(catalog,'{extra}','true')"
    ]){
      await db.exec('begin;'+change+';set local role service_role');await rejectNoWrite(f);await db.exec('rollback')
    }
    for(const input of [{...f.input,candidate_id:randomUUID()},{...f.input,analysis_id:randomUUID()},{...f.input,matcher_version:'stored-program-3'}]){
      await db.exec('begin;set local role service_role');await rejectNoWrite(f,input);await db.exec('rollback')
    }
    await db.exec('begin;set local role service_role');await rejectNoWrite(f,f.input,CATALOG_JSON+' ');await db.exec('rollback')
    for(const mutate of [
      c=>c.review_reasons.push('COMPOSER_CONFLICT'),c=>c.review_reasons.push('UNCERTAIN_MOVEMENT_RANGE'),
      c=>c.review_reasons.push('ARRANGEMENT_IDENTITY_UNRESOLVED'),c=>c.review_reasons.push('EXCERPT_SCOPE_REQUIRES_REVIEW'),
      c=>c.review_reasons.push('UNKNOWN_REVIEW_REASON'),c=>{c.outcome='CONFLICT'},c=>{c.relation='WHOLE_WORK_REFERENCE'},
      c=>{c.track_id=null},c=>{c.scope.kind='MOVEMENT_SET'}
    ]){
      await db.exec('begin;set local role service_role')
      const text=f.concert.kopis_detail_text+'\r\n',k={...f.concert,kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
      await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[text,hash(text),k.id])
      const p=payload(k);mutate(p.candidates[0]);const aid=await save(db,rehash(p))
      const a=(await rows(db,'concert_program_text_analyses')).find(a=>a.id===aid),c=(await rows(db,'concert_program_text_candidates')).find(c=>c.analysis_id===aid)
      await rejectNoWrite(f,expected(c,a));await db.exec('rollback')
    }
    await db.exec('begin;set local role service_role')
    const text=f.concert.kopis_detail_text+'\r\n[Program]\r\nF. Chopin\r\nScherzo No.4 in E Major, Op.54',k={...f.concert,kopis_detail_text:text,kopis_detail_text_hash:hash(text)}
    await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[text,hash(text),k.id]);const aid=await save(db,payload(k))
    const a=(await rows(db,'concert_program_text_analyses')).find(a=>a.id===aid),cs=(await rows(db,'concert_program_text_candidates')).filter(c=>c.analysis_id===aid)
    assert.equal(cs.length,2);for(const c of cs)await rejectNoWrite(f,expected(c,a))
    await db.exec('rollback');assert.deepEqual(await rows(db,table),[])
  }finally{await db.close()}
})

test('append-only receipts, service-role RPC ACL, security-invoker/RLS and fixed lock-order contract',async()=>{
  const f=await setup(),{db}=f
  try{
    const meta=(await db.query('select prosecdef,proconfig,pg_get_functiondef(oid) definition from pg_proc where oid=$1::regprocedure',[rpc])).rows[0]
    assert.equal(meta.prosecdef,false);assert.ok(meta.proconfig.includes('search_path=""'))
    const def=meta.definition,policy=def.indexOf('from public.concert_program_version_policy'),concert=def.indexOf('into k from public.concerts'),analysis=def.indexOf('into a from public.concert_program_text_analyses'),candidate=def.indexOf('perform x.id from public.concert_program_text_candidates')
    assert.ok(policy<concert&&concert<analysis&&analysis<candidate);assert.match(def,/order by x.id for update/)
    const acl=(await db.query('select x.grantee,x.privilege_type,r.rolname from pg_proc p cross join lateral aclexplode(p.proacl) x left join pg_roles r on r.oid=x.grantee where p.oid=$1::regprocedure',[rpc])).rows
    assert.ok(!acl.some(x=>x.grantee===0||['anon','authenticated'].includes(x.rolname)))
    assert.ok(acl.some(x=>x.rolname==='service_role'&&x.privilege_type==='EXECUTE'))
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+table])).rows[0].relrowsecurity,true)
    await db.exec('set role service_role');const id=await confirm(db,f.input)
    for(const sql of ['update public.'+table+" set track_id='changed'",'delete from public.'+table,'truncate public.'+table])await assert.rejects(db.exec(sql),/permission denied|append-only/)
    await db.exec('reset role')
    for(const sql of ['update public.'+table+" set track_id='changed'",'delete from public.'+table,'truncate public.'+table])await assert.rejects(db.exec(sql),/append-only/)
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);await assert.rejects(confirm(db,f.input),/permission denied/);await assert.rejects(rows(db,table),/permission denied/);await db.exec('reset role')
      await db.exec('grant select on public.'+table+' to '+role+';set role '+role)
      assert.deepEqual(await rows(db,table),[]);await db.exec('reset role')
    }
    assert.equal((await rows(db,table))[0].id,id)
  }finally{await db.close()}
})

test('adapter preflight followed by a changed DB policy still produces zero receipts at POST',async()=>{
  const f=await setup(),{db}=f
  try{
    await db.exec('set role service_role');let posts=0
    const store=createProgramTextConfirmationStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,init)=>{
      if(init.method==='GET')return new Response(JSON.stringify(url.pathname==='/rest/v1/'?{paths:{'/rpc/confirm_concert_program_text_candidate_v4':{}}}:[{matcher_version:'stored-program-4',enabled:true}]))
      posts++;assert.equal(url.pathname,'/rest/v1/rpc/confirm_concert_program_text_candidate_v4')
      await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
      const body=JSON.parse(init.body)
      try{return new Response(JSON.stringify(await confirm(db,body.p_expected,body.p_catalog_json)))}
      catch{return new Response(JSON.stringify({code:'P0001',message:'V4 disabled or policy missing'}),{status:400})}
    }})
    await assert.rejects(store.confirm(f.input));assert.equal(posts,1);assert.deepEqual(await rows(db,table),[])
  }finally{await db.close()}
})
}

// Optional real multi-connection checks. Explicit file config/module only;
// never uses DATABASE_URL, environment credentials or an existing DB service.
if(pgArg){
  const config=JSON.parse(await readFile(pgArg.slice(pgArg.indexOf('=')+1),'utf8'))
  const expectedDirectory=resolve(fileURLToPath(new URL('../../postgres-data',import.meta.url)))
  if(config.host!=='127.0.0.1'||config.user!=='text_confirm_test'||config.database!=='postgres'
    ||!Number.isInteger(config.port)||config.port<1024||config.port>65535||resolve(config.data_directory)!==expectedDirectory)throw Error('ISOLATED_POSTGRES_CONFIG_REQUIRED')
  const moduleArg=process.argv.find(a=>a.startsWith('--pg-module='));if(!moduleArg)throw Error('EXPLICIT_PG_MODULE_REQUIRED')
  const {default:pg}=await import(pathToFileURL(resolve(moduleArg.slice(moduleArg.indexOf('=')+1))).href)
  const connect=async database=>{
    const c=new pg.Client({host:config.host,port:config.port,user:config.user,database,password:'',ssl:false,connectionTimeoutMillis:5000,statement_timeout:15000})
    c.on('error',()=>{});await c.connect();c.exec=sql=>c.query(sql);return c
  }
  const realCase=async run=>{
    const admin=await connect('postgres'),clients=[],name='program_text_test_'+randomUUID().replaceAll('-','')
    try{
      const directory=(await admin.query('show data_directory')).rows[0].data_directory
      if(resolve(directory)!==expectedDirectory)throw Error('ISOLATED_POSTGRES_DIRECTORY_MISMATCH')
      await admin.query('create database '+name)
      const db=await connect(name);clients.push(db);const f=await programTextConfirmationFixture(db);await db.exec(confirmationMigration)
      const peer=await connect(name);clients.push(peer);await db.exec('set role service_role');await peer.exec("set role service_role;set lock_timeout='200ms'")
      await run(f,peer)
    }finally{
      for(const c of clients){try{await c.exec('rollback')}catch{}await c.end()}
      await admin.query('drop database if exists '+name);await admin.end()
    }
  }
  test('real PostgreSQL held confirmation locks policy, source, analysis, candidate and FK phantom inserts; identical retry after commit is unchanged',async()=>realCase(async(f,peer)=>{
    const before=await originalDigest(f.db);await f.db.exec('begin');const id=await confirm(f.db,f.input)
    const blocked=async fn=>assert.rejects(fn,e=>e.code==='55P03')
    await blocked(()=>confirm(peer,f.input))
    await blocked(()=>peer.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'"))
    await blocked(()=>peer.query("update public.concerts set title='Blocked' where id=$1",[f.concert.id]))
    await blocked(()=>peer.query('update public.concert_program_text_analyses set is_current=false where id=$1',[f.analysis.id]))
    await blocked(()=>peer.query("update public.concert_program_text_candidates set snapshot=snapshot||'{\"note\":true}' where id=$1",[f.candidate.id]))
    await blocked(()=>peer.query("insert into public.concert_program_text_candidates(analysis_id,candidate_key,logical_work_id,generation_version,snapshot) select analysis_id,repeat('e',64),'phantom-fixture',generation_version,snapshot from public.concert_program_text_candidates where id=$1",[f.candidate.id]))
    await f.db.exec('commit');assert.equal(await confirm(peer,f.input),id);assert.equal((await rows(peer,table)).length,1)
    assert.equal(await originalDigest(f.db),before)
  }))
  test('real PostgreSQL policy/source/context committed before confirmation are rechecked with zero receipts',async()=>realCase(async(f,peer)=>{
    await peer.exec("begin;update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
    await f.db.exec("set lock_timeout='200ms'");await assert.rejects(confirm(f.db,f.input),e=>e.code==='55P03')
    await peer.exec('commit');await assert.rejects(confirm(f.db,f.input),/disabled/)
    await peer.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
    await peer.query('update public.concerts set kopis_detail_text=kopis_detail_text||$1 where id=$2',['changed',f.concert.id])
    await assert.rejects(confirm(f.db,f.input),/source\/context stale/)
    await peer.query('update public.concerts set kopis_detail_text=$1,title=$2 where id=$3',[f.concert.kopis_detail_text,'New context',f.concert.id])
    await assert.rejects(confirm(f.db,f.input),/source\/context stale/);assert.deepEqual(await rows(f.db,table),[])
  }))
  test('real PostgreSQL simultaneous identical confirmations serialize to one immutable receipt',async()=>realCase(async(f,peer)=>{
    const before=await originalDigest(f.db),ids=await Promise.all([confirm(f.db,f.input),confirm(peer,f.input)])
    assert.equal(ids[0],ids[1]);assert.equal((await rows(f.db,table)).length,1);assert.equal(await originalDigest(f.db),before)
  }))
}
