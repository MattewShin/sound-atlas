import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {CATALOG_JSON} from '../programAnalysis.mjs'
import {payload} from './programTextConfirmationFixture.mjs'

export const prerequisites=['202610140001_concert_collection.sql','202610140002_concert_image_ocr.sql','202610150001_concert_program_analysis.sql','../drafts/PROGRAM_ANALYSIS_V3_DRAFT.sql','202610210001_program_work_identity.sql','202610220001_program_automation.sql']
export const chain=['202610230002_kopis_detail_text.sql','202610230003_program_analysis_v4.sql','202610260001_program_text_analysis_v4.sql','202610260002_program_text_status.sql','202610260003_program_text_confirmation.sql','202610260004_program_text_confirmation_status.sql']
export const repair='202610270001_program_text_analysis_acl.sql'
export const targets=['concert_program_text_analyses','concert_program_text_candidates']
export const sql=async file=>readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')
export async function setupAclFixture(db){
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;')
  // Disposable fixture only: reproduce the direct default ACL observed on Supabase.
  await db.exec('alter default privileges in schema public grant all on tables to service_role;')
  for(const file of prerequisites)await db.exec(await sql(file))
}
export async function assertTextAcl(db){
  for(const table of targets){
    const name='public.'+table
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[name])).rows[0].relrowsecurity,true)
    const all=(await db.query("select a.privilege_type,r.rolname,a.grantee,a.is_grantable from pg_class c cross join lateral aclexplode(c.relacl) a left join pg_roles r on r.oid=a.grantee where c.oid=$1::regclass",[name])).rows
    assert.ok(!all.some(a=>a.grantee===0||['anon','authenticated'].includes(a.rolname)))
    assert.deepEqual(all.filter(a=>a.rolname==='service_role').map(a=>a.privilege_type).sort(),['INSERT','SELECT','UPDATE'])
    assert.ok(!all.some(a=>a.rolname==='service_role'&&a.is_grantable))
    for(const role of ['service_role','anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']){
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,name,privilege])).rows[0].allowed,role==='service_role'&&['SELECT','INSERT','UPDATE'].includes(privilege),role+':'+table+':'+privilege)
    }
  }
}
export async function seedText(db){
  const text='[Program]\nF. Chopin\nScherzo No.4 in E Major, Op.54'
  const data={kopis_id:'PF900099',title:'Isolated ACL upgrade',venue:'Fixture hall',region:'서울',start_date:'2099-10-27',end_date:'2099-10-27',performance_status:'공연예정',synced_at:'2026-10-27T00:00:00Z',kopis_detail_text:text,kopis_detail_text_hash:createHash('sha256').update(text).digest('hex')}
  await db.exec('set role service_role')
  await db.query('select public.sync_kopis_concert($1,$2)',[JSON.stringify(data),'[]'])
  const concert={...(await db.query('select * from public.concerts where kopis_id=$1',[data.kopis_id])).rows[0],...data}
  concert.program_context_revision=Number(concert.program_context_revision)
  await db.exec("update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4'")
  await db.query('select public.save_concert_program_text_analysis_v4($1,$2)',[JSON.stringify(payload(concert)),CATALOG_JSON])
  await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4';reset role")
  for(const table of targets)assert.equal((await db.query('select count(*)::int n from public.'+table)).rows[0].n,1)
}
export async function unchangedAclScope(db){
  const data={}
  for(const {relname} of (await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows)
    data[relname]=(await db.query('select * from public.'+relname+' order by 1')).rows
  return {
    data,
    functions:(await db.query("select proname,pg_get_function_identity_arguments(oid) args,prosrc,proacl::text,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace order by 1,2")).rows,
    otherAcl:(await db.query("select relname,relacl::text,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v') and relname<>all($1) order by relname",[targets])).rows,
    defaults:(await db.query('select * from pg_default_acl order by oid')).rows,
    membership:(await db.query('select * from pg_auth_members order by roleid,member,grantor')).rows,
  }
}
