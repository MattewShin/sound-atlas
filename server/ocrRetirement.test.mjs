import test from 'node:test'
import assert from 'node:assert/strict'
import {writeFile,mkdir,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {socialTestDatabase} from './socialTestDatabase.mjs'
import {prepareRetirementDatabase,retirementManifest as manifest,retirementSql as sql,snapshotRetained} from './retirementTestDatabase.mjs'
import {CATALOG_JSON} from './programText/programAnalysis.mjs'
import {routeProgramSource} from './programText/programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './programText/selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload} from './programText/supabaseProgramTextAnalysis.mjs'
import {selectOcrRestoreEntries} from '../scripts/ocrRestoreList.mjs'
const unchanged=(actual,expected)=>assert.equal(createHash('sha256').update(JSON.stringify(actual)).digest('hex'),createHash('sha256').update(JSON.stringify(expected)).digest('hex'),'retained data/definitions/policies/triggers must match exactly')

test('recovery list selects all removed objects and excludes kept/user data; incomplete archives are refused',()=>{
 let i=1;const line=(kind,tail)=>`${i++}; 0 0 ${kind} public ${tail} postgres`
 const lines=[...manifest.drop.tables.flatMap(t=>[line('TABLE',t.name),line('TABLE DATA',t.name),line('ROW SECURITY',t.name),line('ACL','TABLE '+t.name)]),...manifest.drop.functions.flatMap(f=>[line('FUNCTION',f.name+'('+f.arguments+')'),line('ACL','FUNCTION '+f.name+'('+f.arguments+')')]),...manifest.drop.views.flatMap(v=>[line('VIEW',v),line('ACL','TABLE '+v)]),...manifest.drop.triggers.map(t=>line('TRIGGER',t.table+' '+t.name)),...manifest.drop.foreign_keys.map(f=>line('FK CONSTRAINT',f.table_name+' '+f.name)),...manifest.restore_requirements.constraints.map(c=>line('CONSTRAINT',c.table+' '+c.name)),line('TABLE DATA','music_record_publications'),line('TABLE DATA','concerts'),line('FUNCTION','social_feed()'),line('ACL','TABLE music_record_publications')]
 const selected=selectOcrRestoreEntries(lines.join('\n'),manifest,[])
 assert.equal(selected.counts.FUNCTION,22);assert.equal(selected.counts.TABLE,5)
 assert(!selected.text.includes('music_record_publications'));assert(!selected.text.includes('TABLE DATA public concerts '));assert(!selected.text.includes('social_feed'))
 assert.throws(()=>selectOcrRestoreEntries(lines.slice(1).join('\n'),manifest,[]),/RESTORE_TOC_INCOMPLETE/)
 assert.throws(()=>selectOcrRestoreEntries(lines.filter(l=>!l.includes(' ACL ')).join('\n'),manifest,[]),/RESTORE_TOC_INCOMPLETE_ACL/)
})

test('retirement removes the explicit old graph while retaining all data, text validity, helpers, policies and triggers',async()=>{
 const {db}=await socialTestDatabase()
 try{
  const fixture=await prepareRetirementDatabase(db),before=await snapshotRetained(db)
  const pre=await db.exec(await readFile(new URL('../supabase/retirement/ocr-20261109-preflight.sql',import.meta.url),'utf8'))
  assert.equal(pre.flatMap(r=>r.rows).find(r=>r.read_only)?.read_only,'on')
  assert.equal((await db.query('select count(*)::int n from public.concert_program_text_confirmation_status where is_effectively_confirmed')).rows[0].n,2)
  const inventory=async()=>{
   const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','atlas_private') order by 1,2")).rows
   return {tables,counts:await Promise.all(tables.map(async t=>({schema:t.schemaname,name:t.tablename,rows:(await db.query(`select count(*)::int n from ${t.schemaname}.${t.tablename}`)).rows[0].n}))),functions:(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,md5(pg_get_functiondef(p.oid)) definition_md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','atlas_private') and p.prokind='f' order by 1,2,3")).rows,views:(await db.query("select schemaname,viewname from pg_views where schemaname in('public','atlas_private') order by 1,2")).rows,foreign_keys:(await db.query("select n.nspname,c.relname,k.conname from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where k.contype='f' and n.nspname in('public','atlas_private') order by 1,2,3")).rows,triggers:(await db.query("select n.nspname,c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in('public','atlas_private') order by 1,2,3")).rows}
  }
  const initial=await inventory()
  // A late failure after the DROP statements must restore the complete graph.
  await assert.rejects(db.exec(sql.replace(/COMMIT;\s*$/,()=>"DO $$BEGIN RAISE EXCEPTION 'SYNTHETIC_LATE_FAILURE'; END$$;COMMIT;")),/SYNTHETIC_LATE_FAILURE/)
  await db.exec('rollback');assert.deepEqual(await inventory(),initial);unchanged(await snapshotRetained(db),before)
  await db.exec(sql)
  const after=await inventory()
  const post=await db.exec(await readFile(new URL('../supabase/retirement/ocr-20261109-postflight.sql',import.meta.url),'utf8'))
  assert.equal(post.flatMap(r=>r.rows).find(r=>r.read_only)?.read_only,'on')
  unchanged(await snapshotRetained(db),before)
  for(const t of manifest.drop.tables)assert.equal((await db.query('select to_regclass($1) t',['public.'+t.name])).rows[0].t,null)
  for(const f of manifest.drop.functions)assert.equal((await db.query('select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname=$1 and p.proname=$2',[f.schema,f.name])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from public.concert_program_text_confirmation_status where is_effectively_confirmed')).rows[0].n,2)
  // The unchanged official writer and idempotent confirmation remain usable.
  assert.equal((await db.query('select public.save_concert_program_text_analysis_v4($1,$2) id',[fixture.payload,CATALOG_JSON])).rows[0].id,fixture.analysisId)
  const source={...fixture.payload.concert_context,kopis_id:'PF999902',region:'서울',performance_status:'공연예정',synced_at:'2026-11-09T00:00:00Z',kopis_detail_text:fixture.text,kopis_detail_text_hash:fixture.payload.source_hash}
  const nextId=(await db.query('select public.sync_kopis_concert($1,$2) id',[source,[]])).rows[0].id
  const next={...source,id:nextId,program_context_revision:0},payload=buildProgramTextAnalysisPayload({concert:next,analysis:analyzeSelectedProgramSource({concert:next,source:routeProgramSource(next)})})
  const nextAnalysis=(await db.query('select public.save_concert_program_text_analysis_v4($1,$2) id',[payload,CATALOG_JSON])).rows[0].id
  const candidate=(await db.query('select id from public.read_concert_program_text_candidate_status_v4($1) where automatic_ready order by id limit 1',[nextAnalysis])).rows[0].id
  const expected={candidate_id:candidate,analysis_id:nextAnalysis,source_hash:payload.source_hash,payload_hash:payload.payload_hash,catalog_hash:payload.catalog_hash,matcher_version:'stored-program-4',decision_version:'program-text-confirm-1'}
  await db.query('select public.confirm_concert_program_text_candidate_v4($1,$2)',[expected,CATALOG_JSON])
  assert.equal((await db.query('select count(*)::int n from public.concert_program_text_confirmation_status where is_effectively_confirmed')).rows[0].n,3,'a new official confirmation must work without legacy relations')
  await assert.rejects(db.exec(sql),/does not exist/);await db.exec('rollback')
  await mkdir(new URL('../.cache/',import.meta.url),{recursive:true})
  await writeFile(new URL('../.cache/retirement-sql-evidence.json',import.meta.url),JSON.stringify({environment:'isolated PGlite, synthetic data only; never a production post-migration observation',before:initial,after,retained_counts:Object.fromEntries(Object.entries(before.tables).map(([k,v])=>[k,v.count])),retained_data_definition_acl_policy_trigger_equality:true,official_effective_confirmations_at_migration_boundary:2,new_official_save_and_confirmation:true,official_effective_confirmations_after_new_write:3,late_failure_rollback:true,repeat_application_refused:true},null,2))
 }finally{await db.close()}
})

test('retirement fails closed on inbound FK, string-body function, dependent view and missing expected objects',async()=>{
 const {db}=await socialTestDatabase()
 try{
  await prepareRetirementDatabase(db);const before=await snapshotRetained(db),target=manifest.drop.tables[0].name
  const cases=[
   [`alter table public.concerts add column unexpected_attempt uuid references public.${target}(id)`,/BLOCKED_FK_DRIFT|BLOCKED_INBOUND_FK/,'alter table public.concerts drop column unexpected_attempt'],
   [`create schema unexpected;create function unexpected.reader() returns bigint language plpgsql as $f$begin return (select count(*) from public.${target});end$f$`,/BLOCKED_FUNCTION_REFERENCE/,'drop function unexpected.reader();drop schema unexpected'],
   [`create view unexpected_view as select id from public.${target}`,/BLOCKED_VIEW_DRIFT|BLOCKED_VIEW_REFERENCE/,'drop view unexpected_view'],
   ['alter table public.concerts add column unexpected_payload text',/BLOCKED_COLUMN_DRIFT/,'alter table public.concerts drop column unexpected_payload'],
   [`create trigger unexpected_hook after insert on public.${target} for each row execute function public.set_concert_collection_updated_at()`,/BLOCKED_TRIGGER_DRIFT/,`drop trigger unexpected_hook on public.${target}`],
   [`create policy unexpected_read on public.${target} for select using(true)`,/BLOCKED_POLICY_DRIFT/,`drop policy unexpected_read on public.${target}`],
   [`alter table public.${target} add constraint unexpected_check check (duration_ms>=0)`,/BLOCKED_CONSTRAINT_DRIFT/,`alter table public.${target} drop constraint unexpected_check`],
   [`create schema unexpected;create procedure unexpected.reader() language plpgsql as $f$begin perform count(*) from public.${target};end$f$`,/BLOCKED_FUNCTION_REFERENCE/,'drop procedure unexpected.reader();drop schema unexpected'],
   [`alter table public.concerts add constraint unexpected_fn_check check (public.${manifest.drop.functions.find(f=>f.name.startsWith('program_candidate_snapshot')).name}(id)) not valid`,/BLOCKED_COMPILED_DEPENDENCY|BLOCKED_CONSTRAINT_DRIFT/,'alter table public.concerts drop constraint unexpected_fn_check'],
   [`drop view public.${manifest.drop.views[0]}`,/BLOCKED_VIEW_DRIFT/,null]
  ]
  for(const [change,error,undo]of cases){await db.exec(change);const afterChange=await snapshotRetained(db);await assert.rejects(db.exec(sql),error);await db.exec('rollback');unchanged(await snapshotRetained(db),afterChange);if(undo){await db.exec(undo);unchanged(await snapshotRetained(db),before)}}
 }finally{await db.close()}
})
