import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { socialTestDatabase } from './socialTestDatabase.mjs'
import { createSocialApi } from '../src/data/socialClient.js'

test('SDK REST/RPC contract executes real role/column/RLS checks for legacy URLs and opaque profiles',async()=>{
 const f=await socialTestDatabase(),{db,q,as,users:u,profiles:p,legacy,original}=f
 const calls=[];let queue=Promise.resolve()
 const rpcArgs={social_feed:['track','person','post','before_time','before_id'],social_me:[],social_profile:['person'],social_follow:['person','desired'],social_block:['person','desired'],social_edit_post:['post','content','scope']}
 const transport=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url),headers=new Headers(init.headers),token=headers.get('authorization')?.replace('Bearer ','')
  await as(token==='fixture-a'?u.A:token==='fixture-b'?u.B:null)
  calls.push({path:url.pathname,select:url.searchParams.get('select'),cache:init.cache})
  try{
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const name=url.pathname.split('/').at(-1),allowed=rpcArgs[name];if(!allowed)throw Error('Unexpected RPC')
    const body=JSON.parse(init.body??'{}'),keys=allowed.filter(k=>Object.hasOwn(body,k))
    const result=(await q(`select public.${name}(${keys.map((k,i)=>k+'=>$'+(i+1)).join(',')}) data`,keys.map(k=>body[k])))[0].data
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}})
   }
   const table=url.pathname.split('/').at(-1)
   if(!['music_record_publications','music_social_profiles','music_social_comments'].includes(table))throw Error('Unexpected table')
   const fields=url.searchParams.get('select')??'*';if(fields!=='*'&&!fields.split(',').every(x=>/^[a-z_]+$/.test(x)))throw Error('Unexpected field')
   const values=[],conditions=[]
   for(const [key,value]of url.searchParams){if(['select','order'].includes(key))continue;if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))throw Error('Unexpected filter');values.push(value.slice(3));conditions.push(key+'=$'+values.length)}
   const rows=await q(`select ${fields} from public.${table}${conditions.length?' where '+conditions.join(' and '):''}`,values)
   return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}})
  }catch(e){return new Response(JSON.stringify({code:e.code??'TEST_ERROR',message:e.message}),{status:e.code==='42501'?403:400,headers:{'Content-Type':'application/json'}})}
 }
 const fetchImpl=(input,init)=>{const pending=queue.then(()=>transport(input,init));queue=pending.catch(()=>{});return pending}
 const client=token=>createClient('https://fixture.invalid','fixture-anon',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetchImpl(input,{...init,cache:'no-store'})}})
 const anon=client('anon'),a=client('fixture-a'),b=client('fixture-b'),apiA=createSocialApi(a),apiB=createSocialApi(b)
 try{
  const fields='id,track_id,nickname,body,kind,recorded_on,published_at,profile_id,visibility'
  const oldLink=await anon.from('music_record_publications').select(fields).eq('id',legacy)
  assert.equal(oldLink.data[0].id,legacy);assert.equal(oldLink.data[0].nickname,'기존닉네임')
  for(const reader of [anon,b])for(const select of ['*','owner_id','source_record_id','source_revision']){
   const result=await reader.from('music_record_publications').select(select).eq('id',legacy)
   assert.equal(result.error.code,'42501');assert.equal(result.data,null)
  }
  const publicFeed=await apiA.feed({post:legacy})
  for(const secret of [...Object.values(u),original,'owner_id','source_record_id','PRIVATE GOOGLE NAME'])assert.ok(!JSON.stringify(publicFeed).includes(secret))
  await apiA.editPost(legacy,{body:'SCOPED SNAPSHOT',visibility:'followers'})
  assert.deepEqual((await anon.from('music_record_publications').select(fields).eq('id',legacy)).data,[],'old direct link obeys scope')
  assert.deepEqual(await apiB.feed({post:legacy}),[])
  await apiB.follow(p.A.id,true);assert.equal((await apiB.feed({post:legacy})).length,1)
  await apiB.follow(p.A.id,false);assert.deepEqual(await apiB.feed({post:legacy}),[])
  await apiA.editPost(legacy,{body:'SCOPED SNAPSHOT',visibility:'public'});await apiA.block(p.B.id)
  assert.deepEqual((await b.from('music_record_publications').select(fields).eq('id',legacy)).data,[],'legacy direct table obeys block')
  assert.equal((await anon.from('music_record_publications').select(fields).eq('id',legacy)).data.length,1,'public remains anonymous-readable')
  assert.ok(calls.every(c=>c.cache==='no-store'))
 }finally{await db.close()}
})
