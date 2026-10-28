// Remote GET-only copy -> isolated PostgreSQL -> real store/runner/search integration.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createSupabaseRest} from '../server/supabaseRest.mjs'
import {createProgramAutomationStore} from '../server/supabaseProgramAutomation.mjs'
import {createSupabaseConcertSearch} from '../server/supabaseConcertSearch.mjs'
import {runAutomaticPrograms} from '../server/programAutomation.mjs'
import {analyzeStoredProgram} from '../server/programAnalysis.mjs'
import {automaticDecision} from '../server/programAutomation.mjs'
import {createConcertApiHandler} from '../server/api.mjs'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import React from 'react'
import {JSDOM} from 'jsdom'
import {analyzeConcert} from '../src/data/concertRecommendations.js'
import {tracks} from '../src/data/musicData.js'
const kopisId=process.argv[2]||'PF295548'
assert(/^PF\d{1,12}$/.test(kopisId))
let gets=0,localWrites=0
const snapshotPath=process.argv.find(a=>a.startsWith('--snapshot='))?.slice(11)
const snapshot=snapshotPath?JSON.parse(await readFile(snapshotPath,'utf8')):null
const remote=snapshot?async(table,{params}={})=>{
 let rows=snapshot[table];assert(Array.isArray(rows),'Snapshot table missing: '+table)
 for(const [key,value]of Object.entries(params||{})){
  if(value.startsWith?.('eq.'))rows=rows.filter(r=>r[key]===value.slice(3))
  if(value.startsWith?.('in.(')){const ids=value.slice(4,-1).split(',');rows=rows.filter(r=>ids.includes(r[key]))}
 }
 return rows
}:createSupabaseRest({fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');gets++;return fetch(url,init)}})
const read=async(table,params={})=>{const r=await remote(table,{params:{select:'*',limit:'1000',...params}});assert(Array.isArray(r)&&r.length<1000);return r}
const ids=rows=>'in.('+rows.map(r=>r.id).join(',')+')'
const graph={concerts:await read('concerts',{kopis_id:'eq.'+kopisId})}
assert.equal(graph.concerts.length,1)
graph.concert_program_images=await read('concert_program_images',{concert_id:ids(graph.concerts)})
graph.concert_image_ocr_results=await read('concert_image_ocr_results',{image_id:ids(graph.concert_program_images)})
graph.concert_image_ocr_attempts=await read('concert_image_ocr_attempts',{image_id:ids(graph.concert_program_images)})
graph.concert_program_analyses=await read('concert_program_analyses',{concert_id:ids(graph.concerts)})
graph.concert_program_candidates=await read('concert_program_candidates',{analysis_id:ids(graph.concert_program_analyses)})
graph.concert_program_reviews=await read('concert_program_reviews',{candidate_id:ids(graph.concert_program_candidates)})
const catalogs=await read('concert_program_catalogs'),policies=await read('concert_program_version_policy')
const db=new PGlite()
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
 for(const f of ['migrations/202610140001_concert_collection.sql','migrations/202610140002_concert_image_ocr.sql','migrations/202610150001_concert_program_analysis.sql',
  'drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','migrations/202610210001_program_work_identity.sql'])await db.exec(await readFile(new URL('../supabase/'+f,import.meta.url),'utf8'))
 const seed=async(table,rows)=>{if(rows.length)await db.query('insert into public.'+table+' select * from jsonb_populate_recordset(null::public.'+table+',$1)',[JSON.stringify(rows)])}
 await seed('concert_program_catalogs',catalogs)
 for(const [t,r]of Object.entries(graph))await seed(t,r)
 await seed('concert_program_version_policy',policies)
 await db.exec(await readFile(new URL('../supabase/migrations/202610220001_program_automation.sql',import.meta.url),'utf8'))
 await db.exec('set role service_role')
 const tables=new Set([...Object.keys(graph),'concert_program_candidate_status'])
 const fetchImpl=async(url,init)=>{
  const path=url.pathname.replace('/rest/v1/','')
  if(path.startsWith('rpc/')){
   const fn=path.slice(4);assert(/^[a-z_0-9]+$/.test(fn))
   const input=init.method==='POST'?JSON.parse(init.body):Object.fromEntries(url.searchParams)
   const entries=Object.entries(input);for(const [k]of entries)assert(/^[a-z_]+$/.test(k))
   if(init.method==='POST')localWrites++
   const q=await db.query(`select public.${fn}(${entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')}) result`,entries.map(([,v])=>typeof v==='object'?JSON.stringify(v):v))
   return new Response(JSON.stringify(q.rows[0].result))
  }
  assert.equal(init.method,'GET');assert(tables.has(path))
  if(path==='concert_program_candidate_status'){
   const q=await db.query("select to_jsonb(s)||jsonb_build_object('concerts',to_jsonb(k)) as row from public.concert_program_candidate_status s join public.concerts k on k.id=s.concert_id order by s.id")
   return new Response(JSON.stringify(q.rows.map(r=>r.row)))
  }
  const filters=[...url.searchParams].filter(([,v])=>v.startsWith('eq.'))
  for(const [k]of filters)assert(/^[a-z_]+$/.test(k))
  const q=await db.query(`select to_jsonb(t) row from public.${path} t ${filters.length?'where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '):''} order by id`,filters.map(([,v])=>v.slice(3)))
  return new Response(JSON.stringify(q.rows.map(r=>r.row)))
 }
 const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture',PROGRAM_SEARCH_VERSION:'stored-program-3'}
 const store=createProgramAutomationStore({env,fetchImpl})
 const first=await runAutomaticPrograms({store,limit:20}),writesAfterFirst=localWrites
 const second=await runAutomaticPrograms({store,limit:20})
 assert.equal(localWrites,writesAfterFirst,'unchanged next run must make zero writes')
 const unchangedSecondRunWrites=localWrites-writesAfterFirst
 const search=createSupabaseConcertSearch({env,fetchImpl})
 const searches={}
 for(const track of ['brahms-intermezzo-op118-no2','chopin-ballade-op52-no4','liszt-liebestraum-s541-no3'])searches[track]=(await search.search({region:'서울',from:'2026-10-22',to:'2026-10-27',targetTrackId:track})).concerts.map(c=>c.kopisId)
 assert.deepEqual(searches['brahms-intermezzo-op118-no2'],[kopisId])
 // Exercise the HTTP handler and actual React components with real isolated-DB DTOs.
 const server=createServer(createConcertApiHandler(search));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 let apiResult
 try{const url=new URL('/api/concerts','http://127.0.0.1:'+server.address().port);url.search=new URLSearchParams({region:'서울',from:'2026-10-22',to:'2026-10-27',targetTrackId:'brahms-intermezzo-op118-no2'});const response=await fetch(url);assert.equal(response.status,200);apiResult=await response.json();assert.equal(apiResult.concerts[0]?.kopisId,kopisId)}finally{await new Promise(resolve=>server.close(resolve))}
 const compiled=new URL('../src/.coverage-ui.local.mjs',import.meta.url)
 const result=await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false})
 await writeFile(compiled,result.outputFiles[0].text)
 let ui
 try{ui=await import(compiled.href)}finally{await (await import('node:fs/promises')).unlink(compiled)}
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']
 const originals=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));let root
 try{
  for(const n of names)Object.defineProperty(globalThis,n,{value:n==='window'?dom.window:n==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[n],configurable:true,writable:true})
  const {createRoot}=await import('react-dom/client');root=createRoot(dom.window.document.getElementById('root'))
  const analyzed=analyzeConcert(apiResult.concerts[0],tracks)
  await React.act(async()=>{root.render(React.createElement(ui.ConcertCard,{result:analyzed,now:Date.parse('2026-10-22T01:00:00Z'),onOpenConcert:()=>{}}))})
  assert.equal(dom.window.document.querySelectorAll('.concert-card').length,1);assert(dom.window.document.body.textContent.includes(graph.concerts[0].title))
  assert(dom.window.document.body.textContent.includes('브람스'))
 }finally{if(root)await React.act(async()=>root.unmount());dom.window.close();for(const[n,d]of originals){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n]}}
 const query={region:'서울',from:'2026-10-22',to:'2026-10-27',targetTrackId:'brahms-intermezzo-op118-no2'}
 // Real-data projection, then transactional local-only evidence changes.
 await db.exec('begin');await db.query('update public.concerts set start_date=$1,end_date=$1 where kopis_id=$2',['2026-10-21',kopisId]);const expired=(await search.search(query)).concerts.length;assert.equal(expired,0);await db.exec('rollback')
 await db.exec('begin');await db.query('update public.concert_program_images set is_active=false where concert_id=$1',[graph.concerts[0].id]);const inactive=(await search.search(query)).concerts.length;assert.equal(inactive,0);await db.exec('rollback')
 const mismatches=[]
 for(const text of ['PROGRAM\nJ Brahms\nIntermezzo Op.119 No.2','PROGRAM\nL Beethoven\nPiano Sonata No.8 Op.13','PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2 (arranged for four hands)']){
  const t={concert:{...graph.concerts[0],start_date:'2026-10-27',end_date:'2026-10-27'},image:{is_active:true,image_type:'DETAIL',id:graph.concert_program_images[0].id,evidence_revision:0},ocr:{id:graph.concert_image_ocr_results[0].id,raw_text:text,detections:[]},attempt:{id:graph.concert_image_ocr_attempts[0].id}}
  const a=analyzeStoredProgram(t);assert(a.candidates.length);const decisions=a.candidates.map(c=>automaticDecision(c,a,t));assert(decisions.every(d=>d.status==='REJECTED'));mismatches.push({source:'SYNTHETIC_FIXTURE',input:text,decisions})
 }
 const events=(await db.query('select to_jsonb(r) row from public.concert_program_reviews r')).rows.map(r=>r.row)
 assert.equal(first.failed,0);assert.equal(first.retry_pending,0);assert.equal(first.confirmed,1)
 const pending=(await db.query("select count(*)::int n from public.concert_program_candidates c join public.concert_program_analyses a on a.id=c.analysis_id where a.matcher_version='stored-program-3' and c.review_status='REVIEW_REQUIRED'")).rows[0].n
 assert.equal(pending,0)
 const output={kopis_id:kopisId,remote_reads:gets,remote_writes:0,local_migration_applied:true,remaining_v3_manual_candidates:pending,source_counts:Object.fromEntries(Object.entries(graph).map(([t,r])=>[t,r.length])),
  first,second,unchanged_second_run_writes:unchangedSecondRunWrites,verificationScope:snapshot?'REAL_STORED_SNAPSHOT_LOCAL_PGLITE':'REMOTE_GET_COPY_LOCAL_PGLITE',sourceSnapshotAt:snapshot?.snapshotGeneratedAt||null,
  positive:{trackId:'brahms-intermezzo-op118-no2',workId:'brahms-intermezzo-op118-no2',kopisId,query,version:'stored-program-3',httpStatus:200,apiKopisIds:apiResult.concerts.map(c=>c.kopisId),dom:{environment:'JSDOM actual React ConcertCard from local HTTP DTO',cardCount:1,titleVisible:true,trackComposerVisible:true,visualBrowser:false}},
  negative:{expiredLocalTransaction:expired,inactiveEvidenceLocalTransaction:inactive,syntheticIdentityAndScope:mismatches},searches,existing_receipts_preserved:graph.concert_program_reviews.every(old=>events.some(r=>r.id===old.id&&r.note===old.note&&r.status===old.status))}
 await mkdir('.cache/program-auto',{recursive:true});await writeFile('.cache/program-auto/real-sql-result.json',JSON.stringify(output,null,2))
 await writeFile('docs/CONCERT_SEARCH_REPRESENTATIVE_2026-10-22.json',JSON.stringify({...output,first:{...first,items:undefined},second:{...second,items:undefined}},null,2)+'\n')
 console.log(JSON.stringify({...output,first:{...first,items:undefined},second:{...second,items:undefined}},null,2))
}finally{await db.close()}
