import test from 'node:test'
import assert from 'node:assert/strict'
import {createConcertSearchClient} from './concertSearch.js'
const query={region:'서울',from:'2026-10-29',to:'2026-11-28'},stamp='2026-10-29T00:00:00Z'
test('browser client uses GET and page/query cache keys, deduplicates mt20id and fetches detail only on demand',async()=>{
 const calls=[],client=createConcertSearchClient({now:()=>Date.parse(stamp),fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');calls.push(url);const u=new URL(url,'https://example.com');return {ok:true,json:async()=>u.pathname==='/api/concerts'?{query:{...query,q:u.searchParams.get('q'),page:Number(u.searchParams.get('page'))},concerts:[{kopisId:'PF1'},{kopisId:'PF1'}],total:25,page:Number(u.searchParams.get('page')),pageSize:20,hasMore:true,fetchedAt:stamp}:{concert:{kopisId:'PF1'},fetchedAt:stamp}}}})
 assert.equal((await client.search(query)).concerts.length,1);await client.search(query);assert.equal(calls.length,1);await client.search({...query,page:2});assert.equal(calls.length,2);await client.search({...query,q:'hall'});assert.equal(calls.length,3);assert.ok(calls.every(u=>u.startsWith('/api/concerts?')));await client.detail('PF1');assert.equal(calls[3],'/api/concerts/PF1');assert.ok(calls.every(u=>!u.includes('targetTrackId')))
})
test('browser client marks a known successful response stale on server failure, never inventing data',async()=>{
 let fail=false;const client=createConcertSearchClient({now:()=>Date.parse(stamp),fetchImpl:async()=>fail?{ok:false,json:async()=>({message:'upstream unavailable'})}:{ok:true,json:async()=>({query:{...query,q:'',page:1},concerts:[],total:0,page:1,pageSize:20,hasMore:false,fetchedAt:stamp})}});await client.search(query);fail=true;const fallback=await client.search(query,{refresh:true});assert.equal(fallback.stale,true);assert.equal(fallback.source,'browser-cache');assert.equal(fallback.fetchedAt,stamp);await assert.rejects(client.search({...query,region:'부산'}),/upstream unavailable/)
})
