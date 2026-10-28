// Offline feasibility check only. No fetch, environment loading, DB or OCR calls.
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {analyzeStoredProgram} from '../server/programAnalysis.mjs'

import {extractOfficialProgramText} from '../server/officialProgramText.mjs'
export {extractOfficialProgramText} from '../server/officialProgramText.mjs'

export function inspectOfficialProgram(row) {
  const source=extractOfficialProgramText(row.sty)
  const works=source.sections.flatMap((section,index)=>{
    // Pure existing extraction/matcher accepts a text-shaped OCR input. These IDs
    // are in-memory placeholders, never real images, OCR attempts or saved rows.
    const sourceId=`official-text-dry-run:${row.id}:${index}`
    const result=analyzeStoredProgram({
      concert:{id:row.id,title:row.title,venue:row.venue,start_date:row.from.replaceAll('.','-'),end_date:row.to.replaceAll('.','-')},
      image:{id:sourceId,evidence_revision:0},ocr:{id:sourceId,raw_text:section.text,detections:[],width:0},attempt:{id:sourceId},
    })
    return result.candidates.map(candidate=>{
      const exact=candidate.outcome==='MATCHED'&&candidate.relation==='EXACT'&&!!candidate.track_id&&candidate.identity.catalogues.length>0
        &&candidate.review_reasons.every(r=>['COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY','COMPOSER_AND_EXPLICIT_ITEM_IDENTITY','TITLE_OR_REGISTERED_ALIAS_AGREES','KEY_CORROBORATES_IDENTITY','ABSENT_ORDINAL_NOT_INVENTED'].includes(r))
      return {title:candidate.identity.work?.title||candidate.identity.title,composer:candidate.identity.composer,
        workId:candidate.work_id,trackId:exact?candidate.track_id:null,
        outcome:exact?'EXACT_DRY_RUN':'SOURCE_UNRESOLVED',matcherOutcome:candidate.outcome,relation:candidate.relation,reasons:candidate.review_reasons}
    })
  })
  return {id:row.id,source:'KOPIS_OPENAPI_STY',sourceStatus:source.status,sectionCount:source.sections.length,
    extractedWorks:works.length,exactMatches:works.filter(w=>w.outcome==='EXACT_DRY_RUN').length,
    sourceUnresolved:works.filter(w=>w.outcome==='SOURCE_UNRESOLVED').length,works}
}

async function selfTest() {
  const {default:assert}=await import('node:assert/strict')
  const {default:test}=await import('node:test')
  const row=sty=>({id:'PF000001',title:'Local text fixture',venue:'Local hall',from:'2026.11.06',to:'2026.11.06',sty})
  await test('empty sty and unlabelled biography cannot become Program',()=>{
    assert.equal(extractOfficialProgramText('').status,'NO_PROGRAM_TEXT')
    assert.equal(extractOfficialProgramText('He previously played Chopin Ballade Op.52').sections.length,0)
  })
  await test('standalone English/Korean headings open sections; prose does not',()=>{
    for(const h of ['[Program]','[PROGRAM]','[프로그램]','곡목'])assert.equal(extractOfficialProgramText(`${h}\nF. Chopin\nBallade No.4 Op.52`).sections.length,1)
    assert.equal(extractOfficialProgramText('Program notes about Chopin').sections.length,0)
  })
  await test('biography before heading and notice/prose after it are excluded',()=>{
    const text='[공연소개]\nEarlier recital\n[PROGRAM]\nF. Chopin\nBallade No.4 Op.52\n* 프로그램 및 연주자가 변경될 수 있습니다.\nF. Liszt\nLiebestraum No.3 S.541'
    const s=extractOfficialProgramText(text).sections[0].text
    assert.ok(!s.includes('Earlier'));assert.ok(!s.includes('Liszt'));assert.ok(s.includes('Op.52'))
  })
  await test('HTML markup stays unresolved without crawling or tag flattening',()=>{
    assert.equal(extractOfficialProgramText('<p>[Program]</p>').status,'SOURCE_UNRESOLVED')
  })
  await test('clear whole registered work yields a dry-run match without saving',()=>{
    const r=row('[Program]\nF. Chopin\nBallade No.4 in F minor, Op.52'),before=structuredClone(r)
    const a=inspectOfficialProgram(r);assert.equal(a.exactMatches,1);assert.equal(a.works[0].trackId,'chopin-ballade-op52-no4');assert.deepEqual(r,before)
  })
  await test('whole sonata cannot imply any registered movement',()=>{
    const a=inspectOfficialProgram(row('[Program]\nL. v. Beethoven\nPiano Sonata No.17 in d minor, Op.31 No.2'))
    assert.equal(a.exactMatches,0);assert.equal(a.sourceUnresolved,1);assert.equal(a.works[0].relation,'WHOLE_WORK_REFERENCE')
  })
  await test('v4 standalone Scherzo title matches without duplicate movement scope',()=>{
    const a=inspectOfficialProgram(row('[Program]\nF. Chopin\nScherzo No.4 in E Major, Op.54'))
    assert.equal(a.exactMatches,1);assert.equal(a.works[0].trackId,'chopin-scherzo-op54-no4');assert.equal(a.works[0].matcherOutcome,'MATCHED');assert.equal(a.works[0].relation,'EXACT')
  })
  await test('explicit arrangement and date conflicts cannot count as exact',()=>{
    for(const text of ['[Program]\nF. Chopin\nBallade No.4 Op.52 (arranged for 4 hands)','[Program]\n2026.12.24\nF. Chopin\nBallade No.4 Op.52'])assert.equal(inspectOfficialProgram(row(text)).exactMatches,0)
  })
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv[2]==='--self-test')await selfTest()
  else if(process.argv[2]==='--input'&&process.argv[3]) {
    const rows=JSON.parse(readFileSync(process.argv[3],'utf8'))
    if(!Array.isArray(rows)||rows.length>10||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('MAX_TEN_UNIQUE_CONCERTS')
    const results=rows.map(inspectOfficialProgram)
    console.log(JSON.stringify({sampleCount:rows.length,programConcerts:results.filter(r=>r.sectionCount).length,
      extractedWorks:results.reduce((n,r)=>n+r.extractedWorks,0),exactMatches:results.reduce((n,r)=>n+r.exactMatches,0),
      sourceUnresolved:results.reduce((n,r)=>n+r.sourceUnresolved,0),results},null,2))
  } else throw Error('Use --self-test or --input <local parsed detail rows JSON>')
}


