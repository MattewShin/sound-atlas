import test from 'node:test'
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {randomUUID} from 'node:crypto'

test('실제 SDK의 local 로그아웃은 실패하는 서버 응답 전에 저장 세션을 폐기한다',async()=>{
 const key='fixture-sdk-session',disk=new Map(),user={id:randomUUID(),aud:'authenticated'}
 const exp=Math.floor(Date.now()/1000)+3600,encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const token=[encode({alg:'HS256',typ:'JWT'}),encode({exp,sub:user.id}), 'fixture-signature'].join('.')
 disk.set(key,JSON.stringify({access_token:token,refresh_token:'fixture-refresh-only',expires_at:exp,expires_in:3600,token_type:'bearer',user}))
 let release,requests=0
 const client=createClient('https://fixture.invalid','fixture-anon',{
  auth:{storageKey:key,storage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async input=>{
   assert.ok(String(input).includes('/auth/v1/logout'));requests++
   return await new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({message:'fixture offline',code:'unexpected_failure'}),{status:503,headers:{'Content-Type':'application/json'}}))})
  }},
 })
 try{
  assert.equal((await client.auth.getSession()).data.session.user.id,user.id)
  const pending=client.auth.signOut({scope:'local'})
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(disk.has(key),false,'no stored session while the HTTP response is still pending')
  assert.equal(requests,1);release()
  assert.ok((await pending).error)
  assert.equal((await client.auth.getSession()).data.session,null,'a failed server logout cannot restore content identity')
 }finally{await client.auth.dispose()}
})
