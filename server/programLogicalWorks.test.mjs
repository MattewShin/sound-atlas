import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeStoredProgram, extractIdentity, sourceLines, hashJson, matchIdentity } from './programAnalysis.mjs'
import { groupLogicalWorks } from './programLogicalWorks.mjs'

const row=(name,title)=>[[name,15,175],[title,250,730]]
const poster=(rows,{scale=1,offset=0}={})=>{
  const detections=[[['PROGRAM',15,730]],...rows].flatMap((cells,i)=>cells.map(([text,left,right])=>({text,confidence:.91,
    bbox:[[left*scale+offset,i*32*scale+offset],[right*scale+offset,i*32*scale+offset],
      [right*scale+offset,(i*32+22)*scale+offset],[left*scale+offset,(i*32+22)*scale+offset]]})))
  return {concert:{id:'concert',title:'Local fixture',venue:'Local hall',start_date:'2026-10-15',end_date:'2026-10-15'},
    image:{id:'image',evidence_revision:0},ocr:{id:'ocr',width:1000*scale+offset,raw_text:detections.map(d=>d.text).join('\n'),detections},attempt:{id:'attempt'}}
}
const analyze=rows=>analyzeStoredProgram(poster(rows))

test('logical bilingual work keeps every original text, bbox and confidence and applies the existing matcher once',()=>{
  for(const transform of [{},{scale:2.1,offset:81}]){
    const input=poster([row('F Chopin','Ballade No.4 in F Minor Op: 52'),row('프레데릭 쇼팽','발라드 4번 바단조 Op 52')],transform)
    const snapshot=structuredClone(input),a=analyzeStoredProgram(input)
    assert.deepEqual(input,snapshot)
    assert.deepEqual(a,analyzeStoredProgram(input))
    assert.equal(a.grouping.physical_work_rows,2)
    assert.equal(a.grouping.logical_work_count,1)
    assert.equal(a.grouping.bilingual_merges,1)
    assert.equal(a.candidates.length,1)
    assert.equal(a.candidates[0].track_id,'chopin-ballade-op52-no4')
    assert.equal(a.logical_works[0].work.language_variants.length,2)
    assert.equal(a.logical_works[0].matching_variant_line_index,4)
    const variants=a.logical_works[0].work.language_variants
    assert.ok(variants.some(v=>v.original.includes('Op: 52')),'colon source is never rewritten')
    assert.deepEqual(matchIdentity(variants[0].identity,'쇼팽').map(m=>m.track_id),['chopin-ballade-op52-no4'],'colon normalization applies only to matching')
    for(const e of a.candidates[0].evidence){
      assert.equal(e.quote,input.ocr.detections[e.line_index].text)
      assert.deepEqual(e.bbox,input.ocr.detections[e.line_index].bbox)
      assert.equal(e.confidence,.91)
      assert.equal([...input.ocr.raw_text].slice(e.start,e.end).join(''),e.quote)
    }
    assert.equal(a.logical_works[0].confidence.minimum,.91)
    assert.equal(a.candidates[0].review_status,'REVIEW_REQUIRED')
  }
})

test('same composer with different works, opus parts or keys never shares a logical entity',()=>{
  for(const [a,b] of [
    ['발라드 4번 바단조 Op.52','Ballade No.1 Op.23'],
    ['연습곡 Op.10 No.1','Etude Op.10 No.2'],
    ['발라드 4번 바단조 Op.52','Ballade No.4 in C Major Op.52'],
  ]){
    const result=analyze([row('F Chopin',a),row('F Chopin',b)])
    assert.equal(result.grouping.logical_work_count,2)
    assert.equal(result.grouping.bilingual_merges,0)
    assert.ok(result.logical_works.every(w=>w.separations.length))
  }
})

test('an identical title under different composers remains separate',()=>{
  const a=analyze([row('J Kosma','Autumn Leaves'),row('F Liszt','Autumn Leaves')])
  assert.equal(a.grouping.logical_work_count,2)
  assert.deepEqual(a.logical_works.map(w=>w.composer),['J Kosma','리스트'])
})

test('different arrangements, piano counts and arranger names cannot be bilingual variants',()=>{
  for(const [a,b] of [
    ['사랑의 꿈 3번 S.541 (네 손 편곡)','Liebestraum No.3 S.541 (6-hands arrangement)'],
    ['사랑의 꿈 3번 S.541 (두 대 편곡)','Liebestraum No.3 S.541 (1 piano arrangement)'],
    ['사랑의 꿈 3번 S.541 원곡','Liebestraum No.3 S.541 Jazz Arrangement'],
    ['사랑의 꿈 3번 S.541 arr. by A Writer','Liebestraum No.3 S.541 arr. by B Writer'],
    ['사랑의 꿈 3번 S.541 피아노 독주','Liebestraum No.3 S.541 for orchestra'],
    ['사랑의 꿈 3번 S.541 바이올린과 피아노 편곡','Liebestraum No.3 S.541 for flute and piano'],
  ]){
    const result=analyze([row('F Liszt',a),row('F Liszt',b)])
    assert.equal(result.grouping.logical_work_count,2)
    assert.ok(result.logical_works.every(w=>w.separations.some(s=>s.reason==='ARRANGEMENT_CONFLICT')))
  }
})

test('distant repeat performances with the same catalog ID are preserved as two items',()=>{
  const result=analyze([row('F Liszt','사랑의 꿈 3번 S.541'),[['Piano: A',250,730]],row('F Liszt','Liebestraum No.3 S.541')])
  assert.equal(result.grouping.logical_work_count,2)
  assert.equal(result.grouping.catalog_link_rows,2)
  assert.equal(result.grouping.unique_catalog_ids,1)
  assert.notEqual(result.logical_works[0].logical_work_id,result.logical_works[1].logical_work_id)
})

test('program sections and session labels prevent merging otherwise compatible bilingual identities',()=>{
  for(const separator of ['PROGRAM','Session 2','2026.10.16','2회차']){
    const a=analyze([row('F Chopin','발라드 4번 Op.52'),[[separator,15,730]],row('F Chopin','Ballade No.4 Op.52')])
    assert.equal(a.grouping.logical_work_count,2,separator)
  }
})

test('similar bilingual titles without work identity evidence stay separate with review flags',()=>{
  for(const [a,b] of [['아침의 노래','Morning Song'],['베르가마스크 모음곡','Suite bergamasque'],['라라랜드 메들리','LaLa Land Medley']]){
    const result=analyze([row('J Writer',a),row('J Writer',b)])
    // Unknown titles may be outside the physical parser's vocabulary; whenever
    // both were extracted, grouping must not use language/layout alone.
    assert.equal(result.grouping.bilingual_merges,0)
    if(result.grouping.physical_work_rows===2){
      assert.equal(result.grouping.logical_work_count,2)
      assert.ok(result.logical_works.every(w=>w.review_flags.includes('LOGICAL_SEPARATE_INSUFFICIENT_GROUPING_EVIDENCE')))
    }
  }
})

test('an incomplete intermediate variant cannot bridge conflicting opus parts',()=>{
  const a=analyze([row('F Chopin','연습곡 Op.10 No.1'),row('F Chopin','Etude Op.10'),row('F Chopin','연습곡 Op.10 No.2')])
  assert.equal(a.grouping.logical_work_count,2)
  assert.deepEqual(a.logical_works.map(w=>w.work.opus_following_numbers),[[1],[2]])
  assert.ok(a.logical_works[1].separations.some(s=>s.reason==='OPUS_PART_CONFLICT'))
})

// Direct stage fixtures exercise boundaries the physical parser may already
// fold. They use the same source/evidence and identity contracts as production.
const stage = titles => {
  const detections=['J Writer',...titles].map((text,i)=>({text,confidence:.82,bbox:[[200,i*30],[600,i*30],[600,i*30+20],[200,i*30+20]]}))
  const lines=sourceLines({raw_text:detections.map(d=>d.text).join('\n'),detections})
  const prepared=lines.slice(1).map(line=>{
    const identity=extractIdentity(`J Writer\n${line.text}`)
    identity.work={source_line_indices:[line.line_index],scope_source_lines:[],arrangement_source_lines:[]}
    identity.composer_relation={name:'J Writer',block_key:'composer',status:'SOURCE_IDENTIFIED',association:'SCOPED_HEADING'}
    return {identity,entry:{section_index:0,composer:'J Writer',workLine:line,composer_relation:identity.composer_relation},
      evidence:[{...lines[0],quote:lines[0].text,role:'COMPOSER'},{...line,quote:line.text,role:'WORK'}]}
  })
  return groupLogicalWorks(prepared,{lines,hash:hashJson})
}

test('explicit parent and immediately following Roman detail become one source-backed work structure',()=>{
  const a=stage(['Suite Op.7','IV. Dance'])
  assert.equal(a.length,1)
  assert.equal(a[0].parent_child_merges,1)
  assert.deepEqual(a[0].identity.catalogues.map(c=>c.number),[7])
  assert.deepEqual(a[0].identity.movement_numbers,[4])
  assert.equal(a[0].identity.work.language_variants.length,2)
  assert.ok(a[0].identity.work.components.some(c=>c.role==='SUBPIECE_OR_MOVEMENT'&&c.number===4))
  assert.deepEqual(a[0].evidence.map(e=>e.line_index),[0,1,2])
})

test('different explicit detail numbers never collapse and Arabic program order does not become a movement',()=>{
  assert.equal(stage(['Suite Op.7 - II. Dance','Suite Op.7 - III. Dance']).length,2)
  assert.equal(stage(['Suite Op.7','1. The Wings']).length,2)
  assert.equal(stage(['Suite Op.7','IV. Sonata Op.8']).length,2)
})

test('collection labels, uncertain OCR Roman text, Aria and arrangement sources retain separate roles',()=>{
  const a=analyze([row('F Liszt','순례의 해 제3집 S.163 - IV. 에스테 별장의 분수'),
    row('F Liszt','Annees de pelerinage Ill S.163'),[['IV. Les jeux',250,730]],
    [['Piano: A',250,730]],row('J S Bach','골드베르크 변주곡 BWV 988'),row('J S Bach','Goldberg Variations BW 988'),[['Aria',250,400]]])
  assert.equal(a.grouping.logical_work_count,2)
  const cycle=a.logical_works[0]
  assert.deepEqual(cycle.work.collection_numbers,[3])
  assert.ok(cycle.work.components.some(c=>c.role==='ROMAN_BEFORE_CATALOGUE_UNRESOLVED'&&c.raw==='Ill'&&c.number===null))
  assert.ok(cycle.work.components.some(c=>c.role==='SUBPIECE_OR_MOVEMENT'&&c.number===4))
  assert.deepEqual(cycle.work.movement_numbers,[4],'only the explicit IV. detail is read; book III is not a movement')
  assert.ok(a.logical_works[1].work.components.some(c=>c.role==='EXCERPT'&&c.raw==='Aria'))
  assert.equal(a.candidates[1].identity.arrangement_or_excerpt,true)
  assert.deepEqual(a.candidates[1].identity.movement_numbers,[],'Aria never becomes an invented movement number')
  assert.ok(a.logical_works[1].work.language_variants.some(v=>v.identity.catalogues.length===0),'BW remains BW in its own variant')
})

test('whole-work matching returns one parent catalog connection without choosing an arbitrary movement',()=>{
  const a=analyze([row('Beethoven','Sonata No.14 Op.27-2')])
  assert.equal(a.grouping.physical_work_rows,1)
  assert.equal(a.grouping.logical_work_count,1)
  assert.equal(a.grouping.catalog_linked_work_count,1)
  assert.equal(a.candidates.length,1)
  assert.equal(a.candidates[0].catalog_id,'beethoven-sonata-op27-2-no14')
  assert.equal(a.candidates[0].track_id,null)
  assert.ok(a.candidates.every(c=>c.identity.logical_work_id===a.logical_works[0].logical_work_id))
})

test('missing geometry and confidence are not fabricated to justify a merge',()=>{
  const input=poster([row('F Liszt','사랑의 꿈 3번 S.541'),row('F Liszt','Liebestraum No.3 S.541')])
  input.ocr.detections=[]
  const a=analyzeStoredProgram(input)
  assert.ok(a.logical_works.every(w=>w.confidence.minimum===null))
  assert.ok(a.candidates.flatMap(c=>c.evidence).every(e=>e.bbox===null&&e.confidence===null))
})
