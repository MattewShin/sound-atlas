import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {boundedFixture,applyBoundedFixtureSchema,boundedDraft} from './testSupport/boundedProgramFixture.mjs'
import {boundedCases} from './testSupport/boundedProgramCases.mjs'
for(const entry of boundedCases)test('PGlite bounded: '+entry.name,async()=>{
 const db=new PGlite();try{await entry.run(await boundedFixture(db))}finally{await db.close()}
})
test('bounded migration late failure rolls back new schema and legacy grant revocations',async()=>{
 const db=new PGlite();try{
  await applyBoundedFixtureSchema(db,false)
  const sql=await readFile(new URL('../supabase/'+boundedDraft,import.meta.url),'utf8')
  await assert.rejects(db.exec(sql.replace("notify pgrst,'reload schema';",()=>"do $$begin raise exception 'FIXTURE_MIGRATION_ROLLBACK';end$$;")),/FIXTURE_MIGRATION_ROLLBACK/)
  await db.exec('rollback')
  assert.equal((await db.query("select to_regclass('public.program_automation_bounded_runs') r")).rows[0].r,null)
  assert.equal((await db.query("select has_function_privilege('service_role','public.finish_automatic_program(uuid,text,text,text)','execute') ok")).rows[0].ok,true)
  await db.exec(sql)
  assert.equal(Number((await db.query('select count(*) n from public.program_automation_bounded_runs')).rows[0].n),0)
 }finally{await db.close()}
})
