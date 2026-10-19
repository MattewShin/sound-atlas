import test from 'node:test'
import assert from 'node:assert/strict'
import { extractIdentity, matchIdentity, analyzeStoredProgram } from './programAnalysis.mjs'
import { normalizeMatchingText, normalizeMatchingVariant, matchNormalizedProgramWork, canonicalComposers } from './programMatchingNormalization.mjs'

const normalized=raw=>normalizeMatchingVariant({identity:extractIdentity(raw),original:raw},'쇼팽')
const match=(raw,composer='쇼팽')=>matchIdentity(extractIdentity(raw),composer)[0]
const both=(texts,composer='쇼팽')=>{
  const identity=extractIdentity(texts[0])
  identity.work={language_variants:texts.map((raw,i)=>({identity:extractIdentity(raw),original:raw,work_line_index:i}))}
  return {identity,...matchNormalizedProgramWork(identity,composer)}
}

test('explicit opus punctuation variants match the same work without modifying source or display fields',()=>{
  for(const op of ['Op. 52','Op 52','Op: 52','Op.52','Op：52']){
    const raw=`F Chopin / Ballade No. 4 in F Minor ${op}`,identity=extractIdentity(raw),snapshot=structuredClone(identity)
    const [decision]=matchIdentity(identity,'F Chopin')
    assert.equal(decision.catalog_id,'chopin-ballade-op52-no4',op)
    assert.equal(decision.track_id,'chopin-ballade-op52-no4')
    assert.deepEqual(identity,snapshot)
    assert.equal(decision.matching.variants[0].lines[0].source.quote,raw)
    assert.ok(decision.matching.variants[0].normalized_text.includes('Op. 52'))
  }
})

test('catalogue systems require explicit prefix and digits; KV maps to K and Hob sections retain their role',()=>{
  for(const [raw,system,number] of [['BWV:988','BWV',988],['K. 545','K',545],['KV:545','K',545],
    ['D.899','D',899],['S 541','S',541],['WoO. 59','WOO',59],['Hob: 16','HOB',16],['RV.269','RV',269]]){
    const n=normalized(raw)
    assert.equal(n.catalogues.length,1,raw)
    assert.equal(n.catalogues[0].system,system)
    assert.equal(n.catalogues[0].number,number)
  }
  const h=normalized('Sonata Hob. XVI:52')
  assert.equal(h.catalogues[0].system,'HOB')
  assert.equal(h.catalogues[0].section,'XVI')
  assert.equal(h.catalogues[0].number,52)
  assert.deepEqual(normalized('Goldberg Variations BW 988').catalogues,[])
  assert.deepEqual(normalized('Op. fifty-two').catalogues,[])
  assert.equal(match('Ballade No.4 in F minor').catalog_id,null)
})

test('work ordinal and opus member ordinal are separate, while explicit lists never select one item',()=>{
  for(const label of ['No.4','No 4','No:4'])assert.deepEqual(normalized(`Ballade ${label} Op.52`).numbers.map(n=>[n.role,n.number]),[['WORK_NUMBER',4]])
  const nocturne=normalized('Nocturne No. 8 in D-flat Major Op.27 No.2')
  assert.deepEqual(nocturne.numbers.map(n=>[n.role,n.number]),[['WORK_NUMBER',8],['OPUS_MEMBER_NUMBER',2]])
  assert.deepEqual(nocturne.keys,['Db:major'])
  assert.equal(nocturne.issues.length,0)
  assert.deepEqual(normalized('Hungarian Dances Nos.1 & 5').numbers.map(n=>n.number),[1,5])
  assert.equal(match('Etudes Op.10 Nos.1 & 5').catalog_id,null)
})

test('key synonyms normalize only for comparison and never identify a work by themselves',()=>{
  for(const key of ['D-flat Major','D flat major','D♭ major','내림라장조'])assert.deepEqual(normalized(key).keys,['Db:major'],key)
  for(const key of ['F Minor','F minor','바단조']){
    assert.deepEqual(normalized(key).keys,['F:minor'])
    assert.equal(match(key).catalog_id,null)
  }
  assert.equal(match('Ballade No.4 Op.52 in C major').catalog_id,null)
})

test('structural token boundaries are restored without dictionary segmentation or an invented ordinal',()=>{
  assert.equal(match('F Chopin Ballade No. 4in F Minor Op:52').catalog_id,'chopin-ballade-op52-no4')
  assert.equal(match('Liebestraum No. 3,S 541','F Liszt').catalog_id,'liszt-liebestraum-s541-no3')
  assert.equal(normalizeMatchingText('Intermezzoin A Major').text,'Intermezzo in A major')
  assert.equal(normalizeMatchingText('Violin A Major').text,'Violin A major')
  const compact=match('Balladeinfminor op52')
  assert.equal(compact.catalog_id,'chopin-ballade-op52-no4')
  assert.deepEqual(compact.matching.work_numbers,[])
  assert.ok(compact.reasons.includes('ABSENT_ORDINAL_NOT_INVENTED'))
  assert.equal(match('Sonala No.14 Op.27-2','Beethoven').catalog_id,null,'Sonala is not dictionary-corrected')
  assert.equal(match('Liebestraum S.541','Liszt').catalog_id,null,'a cycle number alone cannot identify an absent member No.3')
})

test('unicode hyphens, whitespace and adjacent explicit labels normalize consistently',()=>{
  for(const dash of ['-','‐','‑','–','—','−']){
    assert.equal(match(`Sonata No:14 Op:27${dash}2\nII. Adagio`,'Beethoven').catalog_id,'beethoven-sonata-op27-2-no14-m2')
    assert.deepEqual(normalized(`D${dash}flat Major`).keys,['Db:major'])
  }
  assert.equal(match('BalladeNo4in FMinorOp52').catalog_id,'chopin-ballade-op52-no4')
  assert.equal(match('Etude Op10No1').catalog_id,'chopin-etude-op10-no1')
  assert.equal(match('  Ballade  No. 4\n in F minor\nOp: 52  ').catalog_id,'chopin-ballade-op52-no4')
})

test('composer comparison uses existing catalog patterns and never guesses new aliases',()=>{
  for(const name of ['쇼팽','프레데릭 쇼팽','Frédéric Chopin','F. Chopin','F Chopin']){
    assert.deepEqual(canonicalComposers(name),['쇼팽'])
    assert.equal(match('Ballade No.4 Op.52',name).catalog_id,'chopin-ballade-op52-no4')
  }
  assert.equal(match('Ballade No.4 Op.52',null).catalog_id,null)
  assert.equal(match('Ballade No.4 Op.52','F Shopen').catalog_id,null)
  assert.equal(match('Liszt Ballade No.4 Op.52','Chopin').catalog_id,null)
})

test('Roman collection and movement labels remain separate and mixed Ill is never repaired',()=>{
  const clear=normalized('Book III S.163\nIV. Les jeux')
  assert.deepEqual(clear.collections.map(c=>c.number),[3])
  assert.deepEqual(clear.movements.map(c=>c.number),[4])
  const damaged=normalized('Book Ill S.163\nIV. Les jeux')
  assert.ok(damaged.normalized_text.includes('Ill'))
  assert.deepEqual(damaged.collections,[])
  assert.deepEqual(damaged.movements.map(c=>c.number),[4])
  assert.ok(damaged.issues.length)
  assert.equal(match('Ballade No.I Op.52').catalog_id,null)
  assert.equal(match('Etude Op.1O No.1').catalog_id,null)
  assert.equal(match('Sonata No.14 Op.27-2\nIll. Adagio','Beethoven').catalog_id,null)
  const equivalent=both(['소나타 14번 Op.27-2','Sonata No.14 Op.27 No.2'],'Beethoven')
  assert.equal(equivalent.decision.catalog_id,'beethoven-sonata-op27-2-no14')
  assert.deepEqual(equivalent.matching.opus_member_numbers,[2])
})

test('all language variants constrain one decision; stronger text never hides contradictions',()=>{
  for(const texts of [
    ['발라드 4번 바단조 Op.52','Ballade No.4 Op.23'],
    ['발라드 4번 바단조 Op.52','Ballade No.1 Op.52'],
    ['발라드 4번 바단조 Op.52','Ballade No.4 in C major Op.52'],
    ['발라드 4번 바단조 Op.52','Liszt Ballade No.4 Op.52'],
  ])assert.equal(both(texts).decision.catalog_id,null)
  const input=both(['발라드','Ballade No.4 in F minor Op:52'])
  const snapshot=structuredClone(input.identity)
  assert.equal(input.decision.catalog_id,'chopin-ballade-op52-no4')
  assert.equal(input.matching.variants.length,2)
  assert.deepEqual(input.identity,snapshot)
  assert.deepEqual(input.identity.catalogues,[],'the display/primary identity does not acquire the other variant opus')
  assert.equal(both(['Sonata No.14 Op.27-2\nII. Adagio','Sonata No.14 Op.27 No.2\nIII. Presto'],'Beethoven').decision.catalog_id,null)
  assert.equal(both(['Ballade No.4 Op.52 Book III','Ballade No.4 Op.52 Book IV']).decision.catalog_id,null)
})

test('different composers with The Seasons do not share catalog identity',()=>{
  const title='The Seasons Op.37a No.7'
  assert.equal(match(title,'Tchaikovsky').catalog_id,'tchaikovsky-seasons-op37a-no7')
  assert.equal(match(title,'Vivaldi').catalog_id,null)
})

test('catalogue, registered alias and key conflicts veto a superficially similar work',()=>{
  assert.equal(match('Sonata No.14 Op.27-2 열정','Beethoven').catalog_id,null)
  assert.equal(match('Ballade No.4 Op.999').catalog_id,null)
  assert.equal(match('Ballade No.4 Op.52 BWV.988').catalog_id,null)
  assert.equal(match('Sonata No.14 Op.27-1','Beethoven').catalog_id,null)
  assert.equal(match('Ballade No.2in Foo Op.52').catalog_id,null,'unparsed No.2 cannot disappear into a unique opus match')
  assert.equal(match('Liebestraum No.3-4 S.541','Liszt').catalog_id,null)
  assert.equal(match('Ballade No.2in D♭Major Op.52').catalog_id,null)
  assert.equal(match('Impromptu D:899 Op:90 No:2','Schubert').catalog_id,'schubert-impromptu-d899-op90-no2')
})

test('conflicting ensemble and arrangement evidence never links to the original catalog performance',()=>{
  assert.equal(match('Sonata No.14 Op.27-2 for violin and piano','Beethoven').catalog_id,null)
  assert.equal(match('Liebestraum No.3 S.541 for 4-hands','Liszt').catalog_id,null)
  const source=both(['Liebestraum No.3 S.541 original','Liebestraum No.3 S.541 Jazz Arrangement for 6-hands'],'Liszt')
  assert.equal(source.decision.catalog_id,null)
  assert.ok(source.decision.reasons.includes('ARRANGEMENT_OR_ENSEMBLE_CONFLICT'))
})

test('one logical work yields at most one catalog connection and never invents a leaf movement',()=>{
  const parent=match('Sonata No.14 Op.27-2','Beethoven')
  assert.equal(parent.catalog_id,'beethoven-sonata-op27-2-no14')
  assert.equal(parent.track_id,null)
  assert.equal(parent.relation,'WHOLE_WORK_REFERENCE')
  const subset=match('Sonata No.14 Op.27-2\nII. Adagio\nIII. Presto','Beethoven')
  assert.equal(subset.catalog_id,'beethoven-sonata-op27-2-no14')
  assert.equal(subset.track_id,null)
  assert.deepEqual(subset.scope.explicit_movement_numbers,[2,3])
  assert.equal(match('Sonata No.14 Op.27-2\nIV. Presto','Beethoven').catalog_id,null)
})

test('analysis keeps raw OCR, display values, bbox and confidence alongside matching-only normalization',()=>{
  const texts=['PROGRAM','F Chopin','Ballade No. 4in F Minor Op: 52']
  const f={concert:{id:'c',title:'Local fixture',venue:'Local hall',start_date:'2026-10-15',end_date:'2026-10-15'},
    image:{id:'i'},attempt:{id:'a'},ocr:{id:'o',width:800,raw_text:texts.join('\n'),detections:texts.map((text,i)=>({text,confidence:.89,bbox:[[10,i*40],[600,i*40],[600,i*40+20],[10,i*40+20]]}))}}
  const snapshot=structuredClone(f),a=analyzeStoredProgram(f)
  assert.deepEqual(f,snapshot)
  assert.equal(a.candidates[0].identity.title,texts[2])
  assert.equal(a.candidates[0].track_id,'chopin-ballade-op52-no4')
  assert.equal(a.candidates[0].review_status,'REVIEW_REQUIRED')
  for(const e of a.candidates[0].evidence){assert.equal(e.quote,texts[e.line_index]);assert.deepEqual(e.bbox,f.ocr.detections[e.line_index].bbox);assert.equal(e.confidence,.89)}
  assert.ok(a.logical_works[0].matching.variants[0].normalized_text.includes('Ballade No. 4 in F minor Op. 52'))
})
