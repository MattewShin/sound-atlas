import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tracks,trackDetails} from './musicData.js'
import {emotionKeys,isFullyRated,formatTrackTitle} from './emotions.js'
import {filterTracksByComposers,getComposerOptions} from './composerSelection.js'
import {getLibraryPreferenceProfile,getRecommendationResult} from './recommendations.js'

const input=JSON.parse(readFileSync(new URL('../../data/manual/catalog-additions-2026-10-21.json',import.meta.url),'utf8'))
const newIds=new Set(input.map(t=>t.id))
const seconds=s=>{assert.match(s,/^\d+:[0-5]\d$/);const [m,n]=s.split(':').map(Number);return m*60+n}

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

 }
 const sonata=tracks.find(t=>t.id==='liszt-sonata-s178-m1');assert.equal(sonata.number,null);assert.equal(sonata.movementNumber,1);assert.equal(sonata.movement,'단일악장')
 assert.equal(tracks.find(t=>t.id==='schumann-kinderszenen-op15-no7').movementNumber,null)
})


test('S.216b와 S.216의 등록곡 ID·작품번호는 서로 구분된다',()=>{
 const a=tracks.find(t=>t.id==='liszt-mephisto-waltz-s216b-no4'),b=tracks.find(t=>t.id==='liszt-mephisto-waltz-s216-no3');assert.ok(a&&b);assert.notEqual(a.id,b.id);assert.equal(a.catalogueNumber,'216b');assert.notEqual(a.catalogueNumber,b.catalogueNumber)
})
