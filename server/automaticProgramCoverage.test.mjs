import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareAutomaticCoverage} from './automaticProgramCoverage.mjs'
const target=(id,extra={})=>({concert:{id,title:'Recital',venue:'Hall',start_date:'2099-10-27',end_date:'2099-10-27',performance_status:'공연예정',program_context_revision:0,...extra},image:{id,is_active:true,image_type:'DETAIL',evidence_revision:0},ocr:{id:'o'+id,raw_text:'PROGRAM\nJ Brahms\nIntermezzo Op.118 No.2',detections:[]},attempt:{id:'t'+id}})
test('current OCR without any prior analysis is prepared within explicit caps',async()=>{
 let writes=0;const items=['a','b','c','d'].map(id=>({image_id:id,concert_id:id})),store={target:async i=>target(i.image_id),saveAnalysis:async()=>{writes++;return 'analysis'}}
 const dry=await prepareAutomaticCoverage({store,items});assert.equal(dry.images,3);assert.equal(writes,0)
 const saved=await prepareAutomaticCoverage({store,items,save:true,candidateLimit:2});assert.equal(saved.images,2);assert.equal(writes,2)
})
test('missing, ended and inactive source never seeds an analysis',async()=>{
 let writes=0;const ts=[null,target('ended',{end_date:'2000-01-01'}),target('inactive')];ts[2].image.is_active=false
 const store={target:async i=>ts[i.n],saveAnalysis:async()=>{writes++}}
 const report=await prepareAutomaticCoverage({store,items:ts.map((_,n)=>({n})) ,save:true});assert.equal(report.images,0);assert.equal(writes,0)
})
