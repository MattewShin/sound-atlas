import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { readRecordSummary, listProfileRecordPage } from '../src/data/profileRecords.js'
import { profileRoute } from '../src/data/profileRoutes.js'

test('dashboard queries use owner metadata, bounded bodies and server-side disjoint pagination',async()=>{
  const requests=[],shares=[{id:'share-a',source_record_id:'record-a',visibility:'public'},{id:'share-b',source_record_id:'record-b',visibility:'followers'},{id:'share-c',source_record_id:'record-c',visibility:'private'}]
  const client=createClient('https://synthetic.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{
    const url=new URL(input);requests.push({url,options})
    const metadata=url.pathname.endsWith('/list_my_music_shares')
    return new Response(JSON.stringify(metadata?shares:[{id:'record-a',body:'synthetic bounded record'}]),{status:200,headers:{'content-type':'application/json','content-range':'0-0/13'}})
  }}})
  const summary=await readRecordSummary(client,'AUTH-A');assert.deepEqual([summary.total,summary.private,summary.public],[13,11,2])
  const recent=requests.find(r=>r.url.pathname.endsWith('user_music_journal'));assert.equal(recent.url.searchParams.get('limit'),'3');assert.equal(recent.url.searchParams.get('user_id'),'eq.AUTH-A');assert.equal(recent.options.headers.get('Prefer'),'count=exact')
  assert.equal(requests.length,2);assert(!requests.some(r=>r.url.pathname.includes('social_feed')))
  await listProfileRecordPage(client,'AUTH-A',{filter:'public',page:1,shares});let query=requests.at(-1).url.searchParams
  assert.equal(query.get('offset'),'10');assert.equal(query.get('limit'),'10');assert.equal(query.get('id'),'in.(record-a,record-b)')
  await listProfileRecordPage(client,'AUTH-A',{filter:'private',shares});query=requests.at(-1).url.searchParams;assert.equal(query.get('id'),'not.in.("record-a","record-b")')
  const count=requests.length;assert.deepEqual(await listProfileRecordPage(client,'AUTH-A',{filter:'public',shares:[]}),{records:[],total:0});assert.equal(requests.length,count)
  await assert.rejects(listProfileRecordPage(client,'AUTH-A',{filter:'unknown'}),/INVALID_RECORD_FILTER/)
})

test('profile routes preserve legacy posts and restore explicit filters',()=>{
  assert.deepEqual(profileRoute('posts'),{view:'records',filter:'public',canonical:'records/public'})
  assert.deepEqual(profileRoute('records/private'),{view:'records',filter:'private'})
  for(const view of ['taste','settings','edit','preview','blocked','privacy'])assert.equal(profileRoute(view).view,view)
  assert.equal(profileRoute('unknown').view,'home')
})
