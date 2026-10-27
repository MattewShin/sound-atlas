import assert from 'node:assert/strict'
const fields='id,kopis_id,title,venue,region,start_date,end_date,performance_status,synced_at'.split(',')
const valueAt=(row,key)=>key.split('.').reduce((value,part)=>value?.[part],row)
const literal=value=>value==='true'?true:value==='false'?false:value
const matches=(value,filter)=>{
  if(filter==='is.null')return value===null
  if(filter==='not.is.null')return value!==null&&value!==undefined
  if(filter.startsWith('in.(')&&filter.endsWith(')'))return filter.slice(4,-1).split(',').map(literal).includes(value)
  const match=/^(eq|gt|gte|lt|lte)\.(.*)$/.exec(filter)
  assert.ok(match,'Unsupported PostgREST fixture filter: '+filter)
  if(value===null||value===undefined)return false
  const expected=literal(match[2])
  return match[1]==='eq'?value===expected:match[1]==='gt'?value>expected:match[1]==='gte'?value>=expected:match[1]==='lt'?value<expected:value<=expected
}

// Mock the two status projections, live source/context and exact keyset ranges.
// Reevaluate providers on each GET so live SQL mutations remain observable.
export function searchFixture({ocrRows,concerts,officialRows=()=>[],onRequest=()=>{}}){
  return async(url,init)=>{
    assert.equal(init.method,'GET');assert.equal(init.headers.Prefer,'count=exact');onRequest(url,init)
    const path=url.pathname.split('/').at(-1),source=await concerts()
    let rows
    if(path==='concerts')rows=source.map(c=>({...c,program_context_revision:Number(c.program_context_revision??0),kopis_detail_text:c.kopis_detail_text??null,kopis_detail_text_hash:c.kopis_detail_text_hash??null}))
    else{
      assert.ok(['concert_program_candidate_status','concert_program_text_confirmation_status'].includes(path))
      rows=await(path==='concert_program_candidate_status'?ocrRows():officialRows())
      rows=rows.map(row=>{
        const c=source.find(c=>c.id===row.concert_id)
        assert.ok(c,'Status fixture must reference a real concert UUID')
        return {...(path==='concert_program_candidate_status'?{confirmed_work_identity_hash:null,confirmation_matcher_version:null,confirmation_pipeline_version:null}:{}),...row,
          concerts:Object.fromEntries(fields.map(k=>[k,c[k]]))}
      })
    }
    // Apply SQL WHERE predicates (including inner embedded-concert conditions)
    // before computing the keyset page and remaining exact count.
    for(const [key,filter]of url.searchParams){
      if(['select','order','limit'].includes(key))continue
      if(key==='and'){
        const after=/^\(id\.gt\.([a-f0-9-]+)\)$/i.exec(filter)?.[1]
        assert.ok(after,'Unsupported PostgREST fixture conjunction')
        rows=rows.filter(r=>r.id>after)
      }else rows=rows.filter(r=>matches(valueAt(r,key),filter))
    }
    rows.sort((a,b)=>a.id.localeCompare(b.id))
    const total=rows.length,page=rows.slice(0,Number(url.searchParams.get('limit')||100))
    return new Response(JSON.stringify(page),{headers:{'content-range':page.length?`0-${page.length-1}/${total}`:'*/0'}})
  }
}
