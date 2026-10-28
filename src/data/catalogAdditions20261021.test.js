import assert from 'node:assert/strict'
import test from 'node:test'
import {searchFixture} from '../../server/testSupport/searchFixture.mjs'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tracks,trackDetails} from './musicData.js'
import {emotionKeys,isFullyRated,formatTrackTitle} from './emotions.js'
import {filterTracksByComposers,getComposerOptions} from './composerSelection.js'
import {getLibraryPreferenceProfile,getRecommendationResult} from './recommendations.js'
import {searchConcertTracks} from './concertTrackSearch.js'
import {getTrackTarget,getWorkId} from './workCatalog.js'
import {CATALOG_JSON,CATALOG_HASH,extractIdentity,matchIdentity} from '../../server/programAnalysis.mjs'
import {workIdentity,confirmationValidity} from '../../server/programWorkIdentity.mjs'
import {matchConcertToTrack} from '../../server/programMatching.mjs'
import {createSupabaseConcertSearch} from '../../server/supabaseConcertSearch.mjs'
import {EASYOCR_PIPELINE_VERSION} from '../../server/easyOcrConfig.mjs'

const input=JSON.parse(readFileSync(new URL('../../data/manual/catalog-additions-2026-10-21.json',import.meta.url),'utf8'))
const newIds=new Set(input.map(t=>t.id))
const protectedHashes={
 'chopin-ballade-op52-no4':'026e153a8a968462987a5cbce385390ef1be4c763917ca0df8c676a37655e9f7',
 'liszt-liebestraum-s541-no3':'62315d1698920755c0fbb7c27e4b86b23f62b478cb152bd27ca19dd2c3a8dbfe',
}
const oldCatalogHash='a239a933e23c967ab8d58ba482b045be17a2f9b26227638d3d17506b59e7f0a8'
const newTypes=new Set(['kinderszenen','fantasiestucke','kreisleriana','allegro','arabeske','blumenstuck','humoreske','annees-de-pelerinage','venezia-e-napoli','legend','mephisto-waltz','consolation'])
const catalog=()=>({...JSON.parse(CATALOG_JSON),catalog_hash:CATALOG_HASH})
const seconds=s=>{assert.match(s,/^\d+:[0-5]\d$/);const [m,n]=s.split(':').map(Number);return m*60+n}

test('S.216b has its own stable identity and preserves all 251 previously registered work hashes',()=>{
 const id='liszt-mephisto-waltz-s216b-no4',current=catalog(),previous=JSON.parse(CATALOG_JSON)
 delete previous.works[id];previous.targets=previous.targets.filter(t=>t.workId!==id)
 assert.equal(createHash('sha256').update(JSON.stringify(previous)).digest('hex'),'5809fffe954f1720640817622ef03a4f3385fa289d83ed2d041f2ca2b09e0e50')
 assert.equal(Object.keys(previous.works).length,251)
 for(const workId of Object.keys(previous.works))assert.equal(workIdentity(current,workId).hash,workIdentity(previous,workId).hash,workId)
 const hash=workIdentity(current,id).hash
 current.works[id].catalogueNumber='216'
 assert.notEqual(workIdentity(current,id).hash,hash)
 for(const workId of Object.keys(previous.works))assert.equal(workIdentity(current,workId).hash,workIdentity(previous,workId).hash,workId)
})

test('Mephisto S.216b matches bilingual suffix variants without crossing S.216, numbers or arrangements',()=>{
 const id='liszt-mephisto-waltz-s216b-no4',other='liszt-mephisto-waltz-s216-no3'
 for(const title of ['Liszt Mephisto Waltz No.4 S.216b','F. Liszt Mephisto Waltz Nr.4 S 216B','리스트 메피스토 왈츠 제4번 S.216b']){
  const m=matchIdentity(extractIdentity(title),'리스트')[0]
  assert.equal(m.work_id,id);assert.equal(m.relation,'EXACT')
  assert.equal(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},id).status,'matched')
  assert.notEqual(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},other).status,'matched')
 }
 for(const title of ['Liszt Mephisto Waltz No.4 S.216','Liszt Mephisto Waltz No.3 S.216b','Liszt Mephisto Waltz No.4 S.216c','Liszt Mephisto Waltz No.4','Mephisto Waltz No.4 S.216b','Liszt Mephisto Waltz No.4 S.216b arranged for two pianos']){
  const m=matchIdentity(extractIdentity(title))[0]
  assert.ok(m.work_id!==id||m.relation!=='EXACT',title)
  assert.notEqual(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},id).status,'matched',title)
 }
 assert.equal(matchIdentity(extractIdentity('Liszt Mephisto Waltz No.3 S.216'),'리스트')[0].work_id,other)
})

test('102 new tracks preserve all 918 supplied scores, bilingual titles, prose and recording segments',()=>{
 assert.equal(input.length,102);assert.equal(newIds.size,102);assert.equal(new Set(tracks.map(t=>t.id)).size,tracks.length)
 assert.deepEqual(tracks.slice(189).map(t=>t.id),input.map(t=>t.id))
 for(const i of input){
  const t=tracks.find(t=>t.id===i.id),d=trackDetails[i.id];assert.ok(t)
  assert.match(t.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  const alias=i.titleKorean.match(/ ‘([^’]+)’$/)?.[1]||''
  assert.equal(t.alias,alias);assert.equal(t.titleEn,i.titleEn)
  assert.equal(formatTrackTitle(t),i.titleKorean.replace(/ ‘[^’]+’$/,'').replace(/ : 단일악장$/,' - 단일악장'))
  assert.deepEqual(Object.keys(t.emotionScores),emotionKeys);assert.deepEqual(t.emotionScores,i.emotionScores);assert.ok(isFullyRated(t))
  assert.equal(t.summary,i.summary);assert.equal(t.description,i.summary);assert.equal(t.ratingSource,'manual');assert.equal(t.ratingVersion,'manual-emotions-1')
  assert.ok(!('energy'in t)&&!('arrangement'in t)&&!('instrumentation'in t)&&!('excerpt'in t))
  assert.equal(t.ratingUnit,t.movementNumber?'whole-movement':'whole-work')
  const [about,tip]=i.backgroundAndPoint.split('감상 포인트:');assert.equal(d.about,about.trim());assert.equal(d.listeningTip,tip.trim())
  const url=new URL(i.link);assert.equal(url.origin,'https://www.youtube.com');assert.match(url.searchParams.get('v'),/^[A-Za-z0-9_-]{11}$/)
  assert.deepEqual(d.shortPreview,{provider:'youtube',videoId:url.searchParams.get('v'),startSeconds:seconds(i.start),endSeconds:seconds(i.end),sourceLabel:i.sourceLabel})
  assert.ok(d.shortPreview.endSeconds>d.shortPreview.startSeconds)
  assert.deepEqual(getLibraryPreferenceProfile(tracks,[i.id]).vector,Object.values(i.emotionScores).map(s=>(s-1)/4))
  assert.ok(filterTracksByComposers(tracks,[t.composer]).some(x=>x.id===i.id));assert.ok(getComposerOptions(tracks).includes(t.composer))
  for(const key of emotionKeys)assert.equal(getRecommendationResult(tracks,[key]).tracks.some(x=>x.id===i.id),i.emotionScores[key]>=3)
  assert.ok(searchConcertTracks(tracks,i.titleEn).some(x=>x.id===i.id))
  const title=i.titleEn.replace(/ - I$/,''),target=getTrackTarget(i.id)
  assert.equal(matchIdentity(extractIdentity(title),t.composer)[0].work_id,target.workId,i.id)
  assert.equal(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},i.id).status,'matched',i.id)
 }
 const sonata=tracks.find(t=>t.id==='liszt-sonata-s178-m1');assert.equal(sonata.number,null);assert.equal(sonata.movementNumber,1);assert.equal(sonata.movement,'단일악장')
 assert.equal(tracks.find(t=>t.id==='schumann-kinderszenen-op15-no7').movementNumber,null)
})

test('catalog expansion exactly preserves every pre-existing catalog field and protected work hashes',()=>{
 assert.notEqual(CATALOG_HASH,oldCatalogHash)
 const current=catalog(),old=JSON.parse(CATALOG_JSON)
 for(const i of input)delete old.works[getWorkId(tracks.find(t=>t.id===i.id))]
 old.targets=old.targets.filter(t=>!newIds.has(t.trackId));old.types=old.types.filter(([type])=>!newTypes.has(type))
 assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),oldCatalogHash)
 for(const [id,hash]of Object.entries(protectedHashes))assert.equal(workIdentity(current,id).hash,hash)
 const first=getTrackTarget(input[0].id).workId,before=workIdentity(current,first).hash
 current.works[first].number=999
 assert.notEqual(workIdentity(current,first).hash,before)
 for(const [id,hash]of Object.entries(protectedHashes))assert.equal(workIdentity(current,id).hash,hash)
})

test('cycle names never imply first piece, and distinct S.216b is never merged with S.216',()=>{
 const cases=[['Schumann Kinderszenen Op.15','schumann-kinderszenen-op15-no1'],['Schumann Fantasiestucke Op.12','schumann-fantasiestucke-op12-no1'],['Liszt Consolations S.172','liszt-consolation-s172-no1'],['Liszt Annees de pelerinage S.160','liszt-annees-de-pelerinage-s160-no1']]
 for(const [title,id]of cases){assert.notEqual(matchIdentity(extractIdentity(title),getTrackTarget(id).work.composer)[0].work_id,id);assert.notEqual(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},id).status,'matched')}
 for(const title of ['Liszt Mephisto Waltz No.4 S.216b','Liszt Mephisto Waltz S.216b']){
  assert.notEqual(matchIdentity(extractIdentity(title),'리스트')[0].work_id,'liszt-mephisto-waltz-s216-no3')
  assert.notEqual(matchConcertToTrack({programEvidence:{text:'PROGRAM\n'+title,imageUrls:[]}},'liszt-mephisto-waltz-s216-no3').status,'matched')
 }
 assert.equal(tracks.find(t=>t.id==='liszt-mephisto-waltz-s216b-no4').catalogueNumber,'216b')
 for(const title of ['Liszt Etude S.139 No.1','Schumann Kinderszenen Op.15 No.2'])assert.notEqual(matchIdentity(extractIdentity(title),'슈만')[0].work_id,'schumann-kinderszenen-op15-no1')
})

test('actual catalog expansion keeps both CONFIRMED EXACT PF295548 searches on work identity, with GET only',async()=>{
 for(const [id,hash]of Object.entries(protectedHashes)){
  const current=catalog(),row={id:'11111111-1111-4111-8111-111111111111',track_id:id,work_id:id,relation:'EXACT',outcome:'MATCHED',review_status:'CONFIRMED',effective_status:'CONFIRMED',is_effectively_confirmed:true,analysis_is_current:true,stale_reason:null,
   matcher_version:'stored-program-3',catalog_hash:oldCatalogHash,confirmed_work_identity_hash:hash,confirmation_matcher_version:'stored-program-3',confirmation_pipeline_version:EASYOCR_PIPELINE_VERSION,
   concerts:{kopis_id:'PF295548',title:'Regression fixture',venue:'Fixture hall',region:'서울',start_date:'2026-10-27',end_date:'2026-10-27',performance_status:'공연예정',synced_at:'2026-10-21T00:00:00Z'}}
  assert.equal(confirmationValidity(row,current,{version:'stored-program-3',today:'2026-10-21'}).is_effectively_confirmed,true)
  const concert={...row.concerts,id:'22222222-2222-4222-8222-222222222222',program_context_revision:0}
  row.concert_id=concert.id
  let calls=0
  const service=createSupabaseConcertSearch({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',PROGRAM_SEARCH_VERSION:'stored-program-3'},now:()=>Date.parse('2026-10-21T00:00:00Z'),fetchImpl:searchFixture({ocrRows:()=>[row],concerts:()=>[concert],onRequest:url=>{
   calls++;assert.equal(url.searchParams.has('catalog_hash'),false)
   if(url.pathname.endsWith('/concert_program_candidate_status'))assert.equal(url.searchParams.get('confirmed_work_identity_hash'),'eq.'+hash)
  }})})
  const result=await service.search({targetTrackId:id,region:'서울',from:'2026-10-21',to:'2026-10-27'})
  assert.deepEqual(result.concerts.map(c=>c.kopisId),['PF295548']);assert.equal(calls,6)
 }
})
