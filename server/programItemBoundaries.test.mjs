import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeStoredProgram } from './programAnalysis.mjs'

const fixture = (text, boxes = {}) => ({
  concert: { id:'local-concert', title:'Local boundary fixture', venue:'Local hall', start_date:'2026-10-15', end_date:'2026-10-15' },
  image: { id:'local-image', evidence_revision:0 }, attempt:{id:'local-attempt'},
  ocr:{id:'local-ocr',raw_text:text,width:1000,detections:text.split('\n').map((text,index)=>({text,confidence:.9,
    bbox: boxes[index]===null ? null : boxes[index] || [[20,index*50],[350,index*50],[350,index*50+30],[20,index*50+30]]}))},
})
const box=(x,y,width=200)=>[[x,y],[x+width,y],[x+width,y+30],[x,y+30]]
const analyze=(text,boxes)=>analyzeStoredProgram(fixture(text,boxes))
const assertUnresolved=(c)=>{
  assert.equal(c.identity.parent_title,null)
  assert.equal(c.identity.item_relation,'UNCERTAIN')
  assert.deepEqual(c.identity.movement_numbers,[])
  assert.equal(c.track_id,null)
  assert.equal(c.work_id,null)
  assert.equal(c.relation,'AMBIGUOUS')
  assert.equal(c.review_status,'REVIEW_REQUIRED')
  assert.ok(c.review_reasons.includes('PARENT_WORK_TITLE_UNCONFIRMED'))
  assert.ok(c.review_reasons.includes('UNCERTAIN_NUMBERED_ITEM_RELATION'))
}

test('unnamed parent lists preserve each numbered title for different composers and names',()=>{
  for(const [composer,titles] of [['A. Example',['Dawn Song','Evening Song','Night Song']],['B. Writer',['Blue River','Red Moon','Green Hill']]]) {
    const a=analyze(`PROGRAM\n${composer}\nI. ${titles[0]}\nII. ${titles[1]}\nIII. ${titles[2]}`)
    assert.equal(a.candidates.length,3)
    assert.deepEqual(a.candidates.map(c=>c.identity.title),titles)
    assert.deepEqual(a.candidates.map(c=>c.identity.extracted_numbers[0].raw),['I','II','III'])
    assert.equal(new Set(a.candidates.map(c=>c.identity.group_key)).size,1)
    a.candidates.forEach(c=>{assertUnresolved(c);assert.equal(c.identity.composer,composer)})
  }
  const unknown=analyze('PROGRAM\nOtherComposer\nI. River Song\nII. Mountain Song')
  assert.equal(unknown.candidates.length,2)
  unknown.candidates.forEach(c=>{assertUnresolved(c);assert.equal(c.identity.composer,'OtherComposer')})
})
test('a title before its detached number uses same-row bbox, retaining exact separate OCR quotations',()=>{
  const text='PROGRAM\nA. Example\nFirst Song\nI.\nII. Second Song\nIII. Third Song'
  const a=analyze(text,{2:box(140,100),3:box(100,103,25),4:box(100,170),5:box(100,220)})
  assert.equal(a.candidates.length,3)
  const first=a.candidates[0]
  assertUnresolved(first)
  assert.equal(first.identity.extracted_numbers[0].raw,'I')
  assert.equal(first.identity.extracted_numbers[0].association,'BBOX_SAME_ROW')
  assert.ok(first.evidence.some(e=>e.role==='NUMBER'&&e.quote==='I.'&&e.bbox))
  assert.ok(first.evidence.some(e=>e.quote==='First Song'&&e.bbox))
  for(const c of a.candidates)for(const e of c.evidence)assert.equal([...text].slice(e.start,e.end).join(''),e.quote)
  const b=analyze('PROGRAM\nA. Example\nPrelude in G\nI\nII. Nocturne in F',{2:box(140,100),3:box(100,103,25),4:box(100,170)})
  assert.equal(b.candidates.length,2)
  b.candidates.forEach(assertUnresolved)
})
test('explicit parent sonata and suite titles keep their movement relationships',()=>{
  const a=analyze('PROGRAM\nBeethoven\nSonata No.14 Op.27-2\nI. Adagio\nII. Allegro\nIII. Presto')
  assert.equal(a.candidates.length,1)
  assert.equal(a.candidates[0].catalog_id,'beethoven-sonata-op27-2-no14')
  assert.equal(a.candidates[0].track_id,null)
  assert.equal(a.candidates[0].scope.kind,'MOVEMENT_SET')
  for(const c of a.candidates){assert.equal(c.identity.title,'Sonata No.14 Op.27-2');assert.deepEqual(c.identity.movement_numbers,[1,2,3]);assert.ok(!c.review_reasons.includes('PARENT_WORK_TITLE_UNCONFIRMED'))}
  const b=analyze('PROGRAM\nA. Example\nSuite Aurora\nI. Dawn Song\nII. Night Song')
  assert.equal(b.candidates.length,1)
  assert.equal(b.candidates[0].identity.title,'Suite Aurora')
  assert.deepEqual(b.candidates[0].identity.movement_numbers,[1,2])
})
test('Arabic program order never becomes a movement number and preserves identified works',()=>{
  const a=analyze('PROGRAM\nChopin\n1. Etude Op.10 No.1\n2. Etude Op.25 No.1')
  assert.deepEqual(a.candidates.map(c=>c.track_id),['chopin-etude-op10-no1','chopin-etude-op25-no1'])
  assert.deepEqual(a.candidates.map(c=>c.identity.extracted_numbers[0].raw),['1','2'])
  for(const c of a.candidates){assert.deepEqual(c.identity.movement_numbers,[]);assert.equal(c.identity.extracted_numbers[0].role,'PROGRAM_ORDER');assert.equal(c.review_status,'REVIEW_REQUIRED')}
  const b=analyze('PROGRAM\nA. Example\n1. Dawn Song\n2. Night Song\n3. River Song')
  assert.equal(b.candidates.length,3)
  b.candidates.forEach(assertUnresolved)
  assert.equal(analyze('PROGRAM\nA. Example\n08.02\n09.06\n10.04\n11.01\n12.06').candidates.length,0)
})
test('detached numbers before titles use bbox and remain in the same composer area',()=>{
  const a=analyze('PROGRAM\nA. Example\nI.\nDawn\nII.\nEvening',{2:box(100,100,25),3:box(140,100),4:box(100,180,25),5:box(140,180)})
  assert.deepEqual(a.candidates.map(c=>c.identity.title),['Dawn','Evening'])
  assert.deepEqual(a.candidates.map(c=>c.identity.extracted_numbers[0].raw),['I','II'])
  a.candidates.forEach(assertUnresolved)
  const b=analyze('PROGRAM\nA. Example\nI. First Song\nII. Second Song\nB. Other\nI. Third Song\nII. Fourth Song')
  assert.deepEqual(b.candidates.map(c=>c.identity.composer),['A. Example','A. Example','B. Other','B. Other'])
  const c=analyze('PROGRAM\nA. Example\nI.\nB. Other\nAnother Song')
  assert.equal(c.candidates[0].identity.composer,'B. Other')
  assert.ok(!c.candidates[0].evidence.some(e=>e.quote==='I.'))
  const d=analyze('PROGRAM\nBeethoven\nSonata No.14 Op.27-2\nI. Writer\nSonata No.14 Op.27-2')
  assert.equal(d.candidates.at(-1).identity.composer,'I. Writer')
  assert.equal(d.candidates.at(-1).track_id,null)
  assert.ok(d.candidates.at(-1).evidence.some(e=>e.role==='COMPOSER'&&e.quote==='I. Writer'))
})
test('without usable geometry a following number is left unassigned instead of inventing a parent',()=>{
  const a=analyze('PROGRAM\nA. Example\nFirst Song\nI.\nII. Second Song',{2:null,3:null})
  assert.equal(a.candidates.length,2)
  assertUnresolved(a.candidates[0])
  assert.deepEqual(a.candidates[0].identity.extracted_numbers,[])
  assert.equal(a.candidates[0].identity.unassigned_numbers[0].raw,'I')
  assert.ok(a.candidates[0].review_reasons.includes('NUMBER_TITLE_ASSOCIATION_UNCERTAIN'))
  assert.equal(a.candidates[1].identity.extracted_numbers[0].raw,'II')
})
test('competing same-row numbers do not select an arbitrary title-number association',()=>{
  const a=analyze('PROGRAM\nA. Example\nFirst Song\nI.\nII.',{2:box(140,100),3:box(100,100,25),4:box(100,100,25)})
  assert.equal(a.candidates.length,1)
  assertUnresolved(a.candidates[0])
  assert.deepEqual(a.candidates[0].identity.extracted_numbers,[])
  assert.deepEqual(a.candidates[0].identity.unassigned_numbers.map(n=>n.raw),['I','II'])
})
test('an unparented Roman item cannot acquire a catalog movement just from a familiar title',()=>{
  const a=analyze('PROGRAM\nBeethoven\nI. Sonata No.14 Op.27-2\nII. Another Song')
  assert.equal(a.candidates.length,2)
  a.candidates.forEach(assertUnresolved)
})
