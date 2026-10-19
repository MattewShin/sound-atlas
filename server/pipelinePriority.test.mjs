import test from 'node:test'
import assert from 'node:assert/strict'
import { concertPriority, prioritize, commitPriority } from './pipelinePriority.mjs'
import { collectionSelection, ocrSelection, analysisSelection } from './pipelineSelection.mjs'
import { initialPipelineState } from './pipelineLocal.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'
import { parsePipelineArgs } from './pipelineConfig.mjs'

const now=Date.parse('2026-10-16T00:00:00Z')
const concert=(id,date,end=date)=>({id,kopis_id:id,start_date:date,end_date:end,synced_at:'2026-10-14T00:00:00Z'})
const item=(id,date,kind='NEW',key=id)=>({key,concerts:concert(id,date),work_kind:kind})

test('tomorrow at queue position 71 precedes later concerts; expired is excluded without rewriting the cursor',()=>{
  const state=initialPipelineState(),snapshot={concerts:[]}
  state.collection.pending=Array.from({length:70},(_,i)=>'PF'+(900000+i));state.collection.pending.push('PF999999','PF888888')
  for(const id of state.collection.pending)state.collection.dates[id]={from:'2026-11-01',to:'2026-11-01'}
  state.collection.dates.PF999999={from:'2026-10-17',to:'2026-10-17'}
  state.collection.dates.PF888888={from:'2026-10-15',to:'2026-10-15'}
  state.collection.page=7;const before=JSON.stringify(state)
  const selected=collectionSelection(snapshot,state,now,24)
  assert.equal(selected.ready[0].id,'PF999999');assert.equal(selected.ready.some(i=>i.id==='PF888888'),false)
  assert.equal(selected.ready[0].priority.bucket,'TOMORROW');assert.equal(JSON.stringify(state),before)
})

test('band quotas and persistent concert rotation give distant dates and multi-image concerts continuing progress',()=>{
  const state=initialPipelineState()
  const items=[...Array.from({length:20},(_,i)=>item('PF1','2026-10-16','NEW','a'+i)),
    ...Array.from({length:20},(_,i)=>item('PF2','2026-10-16','NEW','b'+i)),
    item('PF3','2026-10-17'),item('PF4','2026-10-20'),item('PF5','2026-11-01')]
  const chosen=[]
  for(let i=0;i<8;i++){
    const next=prioritize(items,state,'ocr',now)[0]
    chosen.push(next);commitPriority(state,'ocr',next)
    items.splice(items.findIndex(x=>x.key===next.key),1)
    // Simulate serializing and reloading the checkpoint between every slot.
    Object.assign(state,JSON.parse(JSON.stringify(state)))
  }
  assert.deepEqual(chosen.slice(0,3).map(i=>i.concerts.kopis_id),['PF1','PF3','PF2'])
  assert.equal(chosen[3].concerts.kopis_id,'PF4');assert.equal(chosen[4].concerts.kopis_id,'PF5')
  assert.equal(state.priority.ocr.slot,8)
})

test('four unprocessed slots precede maintenance; reserved maintenance continues despite incoming new work',()=>{
  const state=initialPipelineState()
  const items=[...Array.from({length:10},(_,i)=>item('PF'+i,'2026-10-17')),
    ...Array.from({length:4},(_,i)=>item('PF9'+i,'2026-10-16','RECHECK'))]
  const selected=prioritize(items,state,'collect',now)
  assert.deepEqual(selected.slice(0,5).map(i=>i.work_kind),['NEW','NEW','NEW','NEW','RECHECK'])
  commitPriority(state,'collect',selected[0])
  assert.equal(prioritize(items.filter(i=>i.key!==selected[0].key),state,'collect',now)[3].work_kind,'RECHECK')
})

test('ongoing ranges expose a lower bound and unknown next session; missing dates remain unknown',()=>{
  const range=concertPriority(concert('PF1','2026-03-01','2026-11-01'),now)
  assert.equal(range.bucket,'TODAY');assert.equal(range.priority_date,'2026-10-16')
  assert.equal(range.date_basis,'ONGOING_RANGE_NEXT_SESSION_UNKNOWN');assert.equal(range.start_date,'2026-03-01')
  assert.equal(concertPriority({kopis_id:'PF2'},now).bucket,'UNKNOWN')
  assert.equal(concertPriority(concert('PF3','2026-10-15'),now),null)
})

test('OCR and analysis use concert dates and rotation; failed waits and existing image holds remain excluded',()=>{
  const state=initialPipelineState()
  const concerts=[concert('PF1','2026-11-01'),concert('PF2','2026-10-17'),concert('PF3','2026-10-16')]
  const images=concerts.flatMap(c=>[0,1].map(i=>({id:c.id+'-'+i,concert_id:c.id,source_url:'https://kopis.or.kr/upload/'+c.id+i,is_active:true,image_type:'DETAIL',evidence_revision:0,sort_order:i})))
  const snapshot={concerts,images,attempts:[],results:[],analyses:[]}
  state.retries['ocr:PF3-0']={failures:1,until:now+3600000}
  state.retries['ocr:PF3-1']={failures:1,until:now+86400000,image_limit:{sourceUrl:images.find(i=>i.id==='PF3-1').source_url,validationKey:'conditions',contentHash:'a'.repeat(64),reason:'PIXEL_LIMIT',checkedAt:now}}
  const selected=ocrSelection(snapshot,state,now,24,'conditions')
  assert.equal(selected.ready[0].concerts.kopis_id,'PF2');assert.equal(selected.cooldown.length,2)
  for(const image of images){
    const result={id:'r'+image.id,image_id:image.id,pipeline_version:EASYOCR_PIPELINE_VERSION,created_at:'2026-10-15T00:00:00Z'}
    snapshot.results.push(result);snapshot.attempts.push({id:'a'+image.id,image_id:image.id,result_id:result.id,status:'SUCCEEDED',created_at:result.created_at,finished_at:result.created_at})
  }
  const analysis=analysisSelection(snapshot,state,now,'conditions')
  assert.equal(analysis.ready[0].concert.kopis_id,'PF3')
  assert.equal(analysis.ready[1].concert.kopis_id,'PF2')
  assert.equal(analysis.blocked.some(i=>i.image_id==='PF3-1'&&i.reason==='OCR_IMAGE_LIMIT_EXCEEDED'),true)
})

test('explicit initial and daily profiles preserve query caps and explicit overrides',()=>{
  for(const profile of ['initial','daily']){
    const {options}=parsePipelineArgs(['plan','--profile',profile])
    assert.equal(options.collectLimit,profile==='initial'?20:10)
    assert.equal(options.ocrLimit,20);assert.equal(options.analysisLimit,20);assert.equal(options.imageChecks,40);assert.equal(options.maxSeconds,1800)
    assert.equal(options.listPages,4);assert.equal(options.dbPages,20)
  }
  assert.equal(parsePipelineArgs(['run','--ocr-limit','7','--profile','daily']).options.ocrLimit,7)
  assert.throws(()=>parsePipelineArgs(['run','--profile','invalid']))
})
