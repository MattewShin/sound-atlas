import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {setupAclFixture,chain,repair,targets,sql,assertTextAcl,seedText,unchangedAclScope} from './testSupport/programTextAclFixture.mjs'

// In-memory databases only; no environment credentials, REST, or operational SQL.
test('fresh full chain removes inherited direct defaults and repeated ACL repair changes nothing else',async()=>{
  const db=new PGlite()
  try{
    await setupAclFixture(db)
    for(const file of chain)await db.exec(await sql(file))
    await assertTextAcl(db)
    await seedText(db)
    const before=await unchangedAclScope(db)
    for(let i=0;i<2;i++){
      await db.exec(await sql(repair));await assertTextAcl(db)
      assert.deepEqual(await unchangedAclScope(db),before)
    }
  }finally{await db.close()}
})

test('original migrations 1-3 upgrade repairs only two populated table ACLs; second repair is idempotent',async()=>{
  const db=new PGlite()
  try{
    await setupAclFixture(db)
    for(const file of chain.slice(0,3)){
      let source=await sql(file)
      if(file===chain[2]){
        const fixed='from public,anon,authenticated,service_role;'
        assert.equal(source.split(fixed).length,2)
        source=source.replace(fixed,'from public,anon,authenticated;')
      }
      await db.exec(source)
    }
    for(const table of targets)assert.equal((await db.query("select has_table_privilege('service_role',$1,'DELETE') allowed",['public.'+table])).rows[0].allowed,true)
    await seedText(db)
    const before=await unchangedAclScope(db)
    for(let i=0;i<2;i++){
      await db.exec(await sql(repair));await assertTextAcl(db)
      assert.deepEqual(await unchangedAclScope(db),before)
    }
  }finally{await db.close()}
})
