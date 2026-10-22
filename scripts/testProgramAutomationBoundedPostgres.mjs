import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {boundedFixture,cloneHistory} from '../server/testSupport/boundedProgramFixture.mjs'
import {boundedCases} from '../server/testSupport/boundedProgramCases.mjs'
// Explicit local fixture configuration only; never loads .env or DATABASE_URL.
const require=createRequire(import.meta.url),here=path.dirname(fileURLToPath(import.meta.url)),root=process.cwd()
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)]}))
if(!args['--config']||!args['--driver']||!args['--data-dir'])throw Error('EXPLICIT_LOCAL_CONFIG_DRIVER_AND_DATA_DIR_REQUIRED')
const config=JSON.parse(fs.readFileSync(path.resolve(args['--config']),'utf8').replace(/^\uFEFF/,'')),{Client}=require(path.resolve(args['--driver']))
const expectedDirectory=path.resolve(args['--data-dir']),output=path.resolve(args['--output']||path.join(root,'.cache','bounded-postgres-tests','results.json'))
if(config.host!=='127.0.0.1'||config.user!=='bounded_test'||config.database!=='postgres'||!Number.isInteger(config.port)||Object.keys(config).some(k=>!['host','user','database','port'].includes(k))||!expectedDirectory.startsWith(path.join(root,'.cache')+path.sep)||!output.startsWith(path.join(root,'.cache')+path.sep))throw Error('ISOLATED_CONFIG_REQUIRED')
const connect=async(database=config.database)=>{const c=new Client({...config,database,password:'fixture-only',ssl:false,options:'',connectionTimeoutMillis:5000,statement_timeout:60000});c.on('error',()=>{});await c.connect();c.exec=sql=>c.query(sql);return c}
const admin=await connect(),results=[]
const directory=(await admin.query('show data_directory')).rows[0].data_directory
if(path.resolve(directory)!==expectedDirectory){await admin.end();throw Error('ISOLATED_DIRECTORY_MISMATCH')}
const version=(await admin.query('select version() v')).rows[0].v
async function runCase(name,run){
 if(args['--only']&&!name.includes(args['--only']))return
 const nameDb='ca_bounded_'+randomUUID().replaceAll('-',''),clients=[];let db;const started=Date.now()
 try{
  await admin.query('create database '+nameDb);db=await connect(nameDb);clients.push(db);const f=await boundedFixture(db)
  const peer=async()=>{const p=await connect(nameDb);clients.push(p);return p}
  await run(f,peer);results.push({name,status:'PASS',durationMs:Date.now()-started});console.log(JSON.stringify(results.at(-1)))
 }catch(e){results.push({name,status:'FAILED',code:e.code||'TEST_ASSERTION',message:e.message?.slice(0,200)});console.log(JSON.stringify(results.at(-1)));process.exitCode=1}
 finally{for(const c of clients){try{await c.query('rollback')}catch{}try{await c.end()}catch{}}}
}
try{
 for(const entry of boundedCases)await runCase(entry.name,entry.run)
 await runCase('real concurrent uncommitted historical INSERT makes bounded RPC fail NOWAIT with zero writes',async(f,peer)=>{
  const old=await f.make(0,1,true),item=await f.make(0,1),run=await f.approve(),p=await f.plan(run,[item]),other=await peer()
  const seed=(await f.db.query('select id from public.concert_program_candidates where analysis_id=$1 limit 1',[old.savedId])).rows[0].id
  const before=await f.snapshot();await other.query('begin');await cloneHistory(other,seed)
  await assert.rejects(f.complete(run,[item],p),e=>e.code==='55P03');assert.equal(await f.snapshot(),before)
  await other.query('rollback');await f.complete(run,[item],p)
 })
 await runCase('real commit between plan and lock invalidates whole batch without partial result',async(f,peer)=>{
  const old=await f.make(0,1,true),item=await f.make(0,1),run=await f.approve(),p=await f.plan(run,[item]),other=await peer()
  const seed=(await f.db.query('select id from public.concert_program_candidates where analysis_id=$1 limit 1',[old.savedId])).rows[0].id
  await cloneHistory(other,seed);const before=await f.snapshot();await assert.rejects(f.complete(run,[item],p),/BOUNDED_PLAN_CHANGED/);assert.equal(await f.snapshot(),before)
 })
 await runCase('held bounded transaction prevents phantom INSERT and competing batch until commit',async(f,peer)=>{
  const old=await f.make(0,1,true),item=await f.make(0,1),run=await f.approve(),p=await f.plan(run,[item]),other=await peer()
  const seed=(await f.db.query('select id from public.concert_program_candidates where analysis_id=$1 limit 1',[old.savedId])).rows[0].id
  await f.db.query('begin');await f.complete(run,[item],p)
  await other.query("set lock_timeout='200ms'");await assert.rejects(cloneHistory(other,seed),e=>e.code==='55P03')
  await assert.rejects(other.query('select public.complete_automatic_program_batch_bounded($1,$2,$3,$4,$5)',[run,randomUUID(),JSON.stringify([item]),p.plan_hash,(await import('../server/programAnalysis.mjs')).CATALOG_JSON]),e=>e.code==='55P03')
  await f.db.query('commit');assert.equal((await f.plan(run,[item])).operation_required,false)
 })
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({engine:'Local PostgreSQL',version,loopbackOnly:true,productionEnvironmentLoaded:false,productionConnections:0,tests:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2))
}finally{await admin.end()}
