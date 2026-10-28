import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {analyzeStoredProgram,extractIdentity} from './programAnalysis.mjs'
import {inspectOfficialProgram} from '../scripts/verifyOfficialProgramText.mjs'

const title='Scherzo No.4 in E Major, Op.54'
const analyze=text=>analyzeStoredProgram({
  concert:{id:randomUUID(),kopis_id:'PF900054',title:'Local matcher fixture',venue:'Local hall',start_date:'2026-10-23',end_date:'2026-10-23'},
  image:{id:randomUUID(),evidence_revision:0},ocr:{id:randomUUID(),raw_text:text,detections:[],width:800},attempt:{id:randomUUID()},
})
const exact=c=>c.outcome==='MATCHED'&&c.relation==='EXACT'

test('official Scherzo title is a whole work, preserving exact evidence without a duplicate movement name',()=>{
  const text=`[Program]\nF. Chopin\n${title}`,a=analyze(text)
  assert.equal(a.candidates.length,1)
  const c=a.candidates[0]
  assert.equal(c.track_id,'chopin-scherzo-op54-no4');assert.ok(exact(c))
  assert.deepEqual(c.identity.movement_names,[])
  assert.equal(c.identity.work.title,title)
  assert.ok(c.evidence.some(e=>e.role==='WORK'&&e.quote===title))
  for(const e of c.evidence)assert.equal([...text].slice(e.start,e.end).join(''),e.quote)
})

test('offline official-text diagnostic reports the same v4 Scherzo result without live calls',()=>{
  const row={id:'PF900054',title:'Local matcher fixture',venue:'Local hall',from:'2026.10.23',to:'2026.10.23',sty:`[Program]\nF. Chopin\n${title}`},before=structuredClone(row)
  const result=inspectOfficialProgram(row)
  assert.equal(result.exactMatches,1);assert.equal(result.sourceUnresolved,0)
  assert.equal(result.works[0].trackId,'chopin-scherzo-op54-no4')
  assert.equal(result.works[0].matcherOutcome,'MATCHED');assert.equal(result.works[0].relation,'EXACT')
  assert.deepEqual(row,before)
})

test('wrong opus/ordinal, missing/conflicting composer and arrangement/excerpt never become EXACT',()=>{
  for(const [name,text] of [
    ['opus',`[Program]\nF. Chopin\n${title.replace('Op.54','Op.53')}`],
    ['ordinal',`[Program]\nF. Chopin\n${title.replace('No.4','No.3')}`],
    ['missing composer',`[Program]\n${title}`],
    ['conflicting composer',`[Program]\nF. Chopin / J. Brahms\n${title}`],
    ['arrangement',`[Program]\nF. Chopin\n${title}\nArranged for four hands`],
    ['excerpt',`[Program]\nF. Chopin\n${title}\nExcerpt`],
  ])assert.ok(!analyze(text).candidates.some(exact),name)
})

test('separate Scherzo movement remains scope evidence for sonata and Scherzo works',()=>{
  for(const work of ['Piano Sonata No.14 Op.27 No.2',title]){
    const text=`[Program]\n${work===title?'F. Chopin':'L. van Beethoven'}\n${work}\nScherzo`
    const a=analyze(text)
    assert.equal(a.candidates.length,1)
    assert.deepEqual(a.candidates[0].identity.movement_names,['Scherzo'])
    assert.ok(!exact(a.candidates[0]))
    assert.ok(a.candidates[0].evidence.some(e=>e.quote==='Scherzo'&&e.role==='SCOPE'))
  }
  const id=extractIdentity('Piano Sonata No.14 Op.27 No.2\nIII. Scherzo')
  assert.deepEqual(id.movement_names,['III. Scherzo']);assert.deepEqual(id.movement_numbers,[3])
})
