import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createProgramTextCoordinator} from './programTextCoordinator.mjs'
import {confirmationMigration,programTextConfirmationFixture,rows,originalDigest,hash} from './testSupport/programTextConfirmationFixture.mjs'
import {hashJson} from './programAnalysis.mjs'

const saveRpc='save_concert_program_text_analysis_v4',confirmRpc='confirm_concert_program_text_candidate_v4'
const views=['concert_program_text_analysis_status','concert_program_text_candidate_status','concert_program_text_confirmation_status']
const receiptTable='concert_program_text_confirmations'
const legacyTables=['concert_program_images','concert_image_ocr_results','concert_image_ocr_attempts','concert_program_analyses','concert_program_candidates','concert_program_reviews','concert_program_candidate_status']
const legacy=async db=>hashJson(await Promise.all(legacyTables.map(t=>rows(db,t))))
const sql=await readFile(new URL('../supabase/migrations/202610260004_program_text_confirmation_status.sql',import.meta.url),'utf8')

async function setup(){
  const db=new PGlite()
  try{
    const f=await programTextConfirmationFixture(db);await db.exec(confirmationMigration);await db.exec(sql)
    const state={calls:[],loseConfirmationResponse:false}
    const coordinator=createProgramTextCoordinator({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE-test-only-key'},delay:async()=>{},fetchImpl:async(url,init)=>{
      const name=url.pathname.replace('/rest/v1/',''),body=init.body===undefined?null:JSON.parse(init.body)
      state.calls.push({name,method:init.method,body})
      assert.ok(['','concerts','concert_program_version_policy',...views,'rpc/'+saveRpc,'rpc/'+confirmRpc].includes(name))
      if(init.method==='POST'){
        assert.ok(name==='rpc/'+saveRpc||name==='rpc/'+confirmRpc)
        const params=name==='rpc/'+saveRpc?[JSON.stringify(body.p_analysis),body.p_catalog_json]:[JSON.stringify(body.p_expected),body.p_catalog_json]
        try{
          const id=(await db.query('select public.'+name.slice(4)+'($1,$2) id',params)).rows[0].id
          if(name==='rpc/'+confirmRpc&&state.loseConfirmationResponse)throw Error('PRIVATE response lost after commit')
          return new Response(JSON.stringify(id))
        }catch(e){
          if(state.loseConfirmationResponse&&name==='rpc/'+confirmRpc)throw e
          return new Response(JSON.stringify({code:'ISOLATED_SQL_ERROR'}),{status:400})
        }
      }
      assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.headers.Prefer,'count=exact')
      if(name===''){
        const paths={['/rpc/'+saveRpc]:{},['/rpc/'+confirmRpc]:{}}
        for(const v of views)if((await db.query('select to_regclass($1) v',['public.'+v])).rows[0].v)paths['/'+v]={}
        return new Response(JSON.stringify({paths}))
      }
      let data=await rows(db,name)
      for(const [key,value]of url.searchParams){
        if(value.startsWith('eq.'))data=data.filter(r=>String(r[key])===value.slice(3))
        if(key==='id'&&value.startsWith('gt.'))data=data.filter(r=>r.id>value.slice(3))
      }
      data.sort((a,b)=>a.id.localeCompare(b.id))
      const total=data.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100)
      data=data.slice(offset,offset+limit)
      const columns=url.searchParams.get('select')
      if(columns&&columns!=='*')data=data.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])))
      data=data.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?(k==='start_date'||k==='end_date'?v.toISOString().slice(0,10):v.toISOString()):v])))
      return new Response(JSON.stringify(data),{headers:{'content-range':data.length?`0-${data.length-1}/${total}`:'*/0'}})
    }})
    const run=async mode=>{await db.exec('set role service_role');return coordinator.run({concert_id:f.concert.id,mode})}
    return {...f,state,run}
  }catch(e){await db.close();throw e}
}
const confirmations=f=>f.state.calls.filter(c=>c.method==='POST'&&c.name==='rpc/'+confirmRpc)
const posts=f=>f.state.calls.filter(c=>c.method==='POST')

test('isolated coordinator DRY_RUN writes zero; SAVE and identical rerun reuse analysis with one receipt and preserve original rows',async()=>{
  const f=await setup(),{db}=f
  try{
    const before=await originalDigest(db),dry=await f.run('DRY_RUN')
    assert.equal(dry.status,'DRY_RUN');assert.equal(dry.counts.total,1);assert.equal(dry.receipt_id,null);assert.equal(posts(f).length,0)
    assert.equal(await originalDigest(db),before);assert.deepEqual(await rows(db,receiptTable),[])
    const first=await f.run('SAVE');assert.equal(first.status,'CONFIRMED');assert.equal(first.analysis_id,f.analysis.id)
    assert.equal(first.counts.pending,0);assert.equal((await rows(db,receiptTable)).length,1)
    assert.equal(await originalDigest(db),before)
    const again=await f.run('SAVE');assert.equal(again.reason,'ALREADY_CONFIRMED');assert.equal(again.counts.already,1)
    assert.equal(confirmations(f).length,1);assert.equal((await rows(db,receiptTable)).length,1);assert.equal(await originalDigest(db),before)
    for(const s of ['PRIVATE','evidence','quote','snapshot','kopis_detail_text'])assert.ok(!JSON.stringify(first).includes(s))
  }finally{await db.close()}
})

test('isolated multi-candidate save creates one current official analysis and only lowest-UUID confirmation; others remain pending and OCR is unchanged',async()=>{
  const f=await setup(),{db}=f
  try{
    const text=f.concert.kopis_detail_text+'\r\nBiography\r\nPRIVATE history\r\n[Program]\r\nJ. Brahms\r\nIntermezzo Op.118 No.2'
    await db.query('update public.concerts set kopis_detail_text=$1,kopis_detail_text_hash=$2 where id=$3',[text,hash(text),f.concert.id])
    const before=await legacy(db),out=await f.run('SAVE')
    assert.equal(out.status,'CONFIRMED');assert.equal(out.counts.total,2);assert.equal(out.counts.ready,2);assert.equal(out.counts.pending,1)
    const cs=(await rows(db,'concert_program_text_candidates')).filter(c=>c.analysis_id===out.analysis_id).sort((a,b)=>a.id.localeCompare(b.id))
    const receipts=await rows(db,receiptTable);assert.equal(receipts.length,1);assert.equal(receipts[0].candidate_id,cs[0].id)
    assert.equal(confirmations(f).length,1);assert.equal((await rows(db,'concert_program_text_analyses')).filter(a=>a.is_current).length,1)
    assert.ok(cs.every(c=>c.review_status==='REVIEW_REQUIRED'));assert.equal(await legacy(db),before)
  }finally{await db.close()}
})

test('actual disabled policy or missing 3H view fails preflight with no analysis/receipt POST or row growth',async()=>{
  const f=await setup(),{db}=f
  try{
    await db.exec("update public.concert_program_version_policy set enabled=false where matcher_version='stored-program-4'")
    const before=await originalDigest(db)
    assert.equal((await f.run('SAVE')).reason,'PREFLIGHT_FAILED');assert.equal(posts(f).length,0);assert.equal(await originalDigest(db),before)
    await db.exec("reset role;update public.concert_program_version_policy set enabled=true where matcher_version='stored-program-4';drop view public.concert_program_text_confirmation_status")
    const next=await originalDigest(db)
    assert.equal((await f.run('SAVE')).reason,'PREFLIGHT_FAILED');assert.equal(posts(f).length,0);assert.equal(await originalDigest(db),next)
    assert.deepEqual(await rows(db,receiptTable),[])
  }finally{await db.close()}
})

test('3H stale identity receipt is HOLD_EXISTING_RECEIPT even while the unchanged 3F candidate remains planning-ready',async()=>{
  const f=await setup(),{db}=f
  try{
    assert.equal((await f.run('SAVE')).status,'CONFIRMED');const receipt=await rows(db,receiptTable)
    await db.exec("reset role;update public.concert_program_catalogs set catalog=jsonb_set(catalog,'{works,chopin-scherzo-op54-no4,title}','\"Changed identity fixture\"')")
    const out=await f.run('SAVE');assert.equal(out.reason,'HOLD_EXISTING_RECEIPT');assert.equal(out.counts.hold,1);assert.equal(out.counts.ready,0)
    assert.equal(confirmations(f).length,1);assert.deepEqual(await rows(db,receiptTable),receipt)
  }finally{await db.close()}
})

test('receipt committed but transport response lost stops immediately; subsequent single-candidate run observes existing receipt without blind retry',async()=>{
  const f=await setup(),{db}=f
  try{
    f.state.loseConfirmationResponse=true
    const failed=await f.run('SAVE');assert.equal(failed.reason,'CONFIRMATION_FAILED');assert.equal(failed.status,'FAILED');assert.equal(failed.receipt_id,null)
    assert.equal(confirmations(f).length,1);assert.equal((await rows(db,receiptTable)).length,1)
    f.state.loseConfirmationResponse=false
    const retry=await f.run('SAVE');assert.equal(retry.reason,'ALREADY_CONFIRMED');assert.equal(retry.counts.already,1)
    assert.equal(confirmations(f).length,1);assert.equal((await rows(db,receiptTable)).length,1)
  }finally{await db.close()}
})
