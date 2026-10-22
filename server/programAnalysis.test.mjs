import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { analyzeStoredProgram, extractIdentity, CATALOG_HASH,MATCHER_VERSION } from './programAnalysis.mjs'
import { evidenceIssue, analyzeProgramTargets, createProgramAnalysisStore } from './supabaseProgramAnalysis.mjs'
import { parseProgramArgs, runProgramCli } from '../scripts/analyzeConcertPrograms.mjs'

export const fixture = (text, extra = {}) => ({
  concert: { id: randomUUID(), kopis_id: 'PF900001', title: 'Local fixture', venue: 'Local fixture hall', region: '서울',
    start_date: '2026-10-15', end_date: '2026-10-15' },
  image: { id: randomUUID(), is_active: true, image_type: 'DETAIL', evidence_revision: 0, source_url: 'https://kopis.or.kr/upload/local-fixture.png' },
  ocr: { id: randomUUID(), raw_text: text, detections: [], width: 800, processed_at: '2026-10-15T00:00:00Z' },
  attempt: { id: randomUUID() }, ...extra,
})
const analyze = (text) => analyzeStoredProgram(fixture(text))
const candidates = (text) => analyze(text).candidates
const linked = (text) => candidates(text).filter((c) => c.track_id)

// Relative geometry deliberately differs from production poster coordinates.
const physicalFixture = (rows, {scale=1,offset=0}={}) => {
  const cells=rows.flatMap((row,y)=>row.map(([text,left,right])=>({text,confidence:.87,
    bbox:[[left*scale+offset,y*30*scale+offset],[right*scale+offset,y*30*scale+offset],
      [right*scale+offset,(y*30+20)*scale+offset],[left*scale+offset,(y*30+20)*scale+offset]]})))
  const f=fixture(cells.map(c=>c.text).join('\n'))
  f.ocr.detections=cells;f.ocr.width=1000*scale+offset
  return f
}
const tableRow = (name,title,reverse=false) => {
  const cells=[[name,10,175],[title,230,650]]
  return reverse?cells.reverse():cells
}

test('physical composer/work pairs override reversed OCR order at different scales and preserve all evidence',()=>{
  for(const transform of [{},{scale:2.3,offset:103}]) {
    const f=physicalFixture([[['PROGRAM',10,650]],tableRow('F Liszt','Liebestraum No.3 S.541'),
      [['Piano: Kim',230,650]],tableRow('R Schumann','Kinderszenen Op:15 - VII. Traumerei',true),
      [['Piano: Lee',230,650]],tableRow('J Kosma','Autumn Leaves (Jazz Arrangement for 4-hands)',true)],transform)
    const before=structuredClone(f),a=analyzeStoredProgram(f)
    assert.deepEqual(a.candidates.map(c=>c.identity.composer),['리스트','슈만','J Kosma'])
    assert.deepEqual(a.candidates.map(c=>c.identity.catalogues.map(n=>n.number)),[[541],[15],[]])
    assert.deepEqual(a.candidates.map(c=>c.track_id),['liszt-liebestraum-s541-no3',null,null])
    assert.equal(a.candidates[1].identity.arrangement_or_excerpt,false)
    assert.equal(a.candidates[2].identity.arrangement_or_excerpt,true)
    assert.deepEqual(f,before)
    for(const c of a.candidates)for(const e of c.evidence){
      assert.equal(e.quote,f.ocr.detections[e.line_index].text)
      assert.deepEqual(e.bbox,f.ocr.detections[e.line_index].bbox)
      assert.equal(e.confidence,.87)
      assert.equal([...f.ocr.raw_text].slice(e.start,e.end).join(''),e.quote)
    }
  }
})

test('unidentified paired names block previous composer inheritance rather than guessing an author',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],tableRow('F Liszt','Liebestraum No.3 S.541'),
    [['Piano: Kim',230,650]],tableRow('이름 미확정','Kinderszenen Op.15',true)])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,2)
  assert.equal(a[1].identity.composer,null)
  assert.equal(a[1].identity.composer_relation.status,'UNRESOLVED')
  assert.equal(a[1].track_id,null)
  assert.ok(a[1].evidence.some(e=>e.role==='COMPOSER'&&e.quote==='이름 미확정'))
  // No performer separator: the earlier English name still cannot identify
  // a different, newly encountered Korean composer in the same layout chunk.
  const adjacent=physicalFixture([[['PROGRAM',10,650]],tableRow('R Schumann','Kinderszenen Op.15'),
    tableRow('이름 미확정','Intermezzo Op.118 No.2',true)])
  const b=analyzeStoredProgram(adjacent).candidates
  assert.equal(b[0].identity.composer,'슈만')
  assert.equal(b[1].identity.composer,null)
  const damaged=physicalFixture([[['PROGRAM',10,650]],tableRow('F Liszt','Liebestraum No.3 S.541'),
    tableRow('R. Schum?nn','Kinderszenen Op.15',true)])
  const c=analyzeStoredProgram(damaged).candidates
  assert.equal(c[1].identity.composer,null)
  assert.equal(c[1].identity.composer_relation.status,'UNRESOLVED')
})

test('bilingual rows become one logical work while retaining both physical variants and their evidence',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],tableRow('로메르트 슈만','어린이의 정경 Op.15 - VII. 트로이메라이',true),
    tableRow('R Schumann','Kinderszenen Op:15 - VII. Traumerei')])
  const result=analyzeStoredProgram(f),a=result.candidates
  assert.equal(a.length,1)
  assert.equal(result.grouping.physical_work_rows,2)
  assert.equal(result.grouping.logical_work_count,1)
  assert.ok(a.every(c=>c.identity.composer==='슈만'))
  const variants=a[0].identity.work.language_variants
  assert.equal(variants.length,2)
  assert.equal(variants[0].identity.composer_relation.block_key,variants[1].identity.composer_relation.block_key)
  assert.notEqual(variants[0].identity.work.block_key,variants[1].identity.work.block_key)
  assert.ok(a[0].evidence.some(e=>e.quote==='R Schumann'))
  assert.equal(a[0].identity.work.scope_source_lines.length,2)
})

test('separate work blocks isolate Debussy/Brahms and Brahms/Chopin identities, including No.8 vs opus part No.2',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],tableRow('C Debussy','Suite bergamasque'),
    [['Piano: A',230,650]],tableRow('J Brahms','Intermezzo in A Major Op.118 No.2'),
    [['Piano: B',230,650]],tableRow('J Brahms','Hungarian Dances Nos.1 & 5'),
    [['Piano: C',230,650]],tableRow('F Chopin','Nocturne No.8 in D-flat Major Op.27 No.2',true),
    [['Piano: D',230,650]],tableRow('F Chopin','Ballade No.4 in F Minor Op.52')])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,5)
  assert.deepEqual(a.map(c=>c.identity.composer),['C Debussy','브람스','브람스','쇼팽','쇼팽'])
  assert.deepEqual(a.map(c=>c.identity.catalogues.map(n=>n.number)),[[],[118],[],[27],[52]])
  assert.deepEqual(a[1].identity.opus_following_numbers,[2])
  assert.deepEqual(a[3].identity.work_numbers,[8])
  assert.deepEqual(a[3].identity.opus_following_numbers,[2])
  assert.deepEqual(a[3].identity.keys,['Db:major'])
  assert.ok(!a[3].identity.reasons.includes('CHECK_MULTIPLE_WORK_NUMBERS'))
  assert.equal(a[4].track_id,'chopin-ballade-op52-no4')
})

test('one composer still owns multiple works; movement/excerpt/arrangement are bounded by the next work',()=>{
  const a=analyze('PROGRAM\nChopin\nBallade No.4 Op.52\nNocturne No.8 in D-flat Major Op.27 No.2\nPROGRAM\nJ S Bach\nGoldberg Variations BWV 988\nAria\nJ Kosma\nAutumn Leaves\nJazz Arrangement for 4-hands').candidates
  assert.equal(a.length,4)
  assert.deepEqual(a.slice(0,2).map(c=>c.identity.composer),['쇼팽','쇼팽'])
  assert.deepEqual(a.slice(0,2).map(c=>c.identity.catalogues[0].number),[52,27])
  assert.ok(a[2].evidence.some(e=>e.quote==='Aria'))
  assert.equal(a[2].identity.catalogues[0].number,988)
  assert.equal(a[3].identity.composer,'J Kosma')
  assert.equal(a[3].identity.arrangement_or_excerpt,true)
  const f=physicalFixture([[['PROGRAM',10,650]],[['F Chopin',10,175],['Ballade No.4 Op.52',580,900]],
    [['Nocturne No.8 in D-flat Major Op.27 No.2',580,950]]])
  const paired=analyzeStoredProgram(f).candidates
  assert.equal(paired.length,2)
  assert.ok(paired.every(c=>c.identity.composer==='쇼팽'))
  assert.equal(paired[0].identity.composer_relation.block_key,paired[1].identity.composer_relation.block_key)
})

test('a performer table column cannot contaminate a title or create an extra candidate',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],
    [...tableRow('J Brahms','Intermezzo Op.118 No.2'),['김연주',840,920]],
    [['Piano: A',230,650]],
    [...tableRow('F Chopin','Ballade No.4 Op.52'),['다른연주자',840,920]]])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,2)
  assert.ok(a.every(c=>!c.evidence.some(e=>/김연주|다른연주자/.test(e.quote))))
  assert.equal(a[1].track_id,'chopin-ballade-op52-no4')
})

test('same-row title number fragments stay together without joining a later independent work',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],[['M Ravel',10,175]],
    [['Violin Sonata No.',10,240],['1 in a minor M.12',246,530]],
    [['Sonate posthume',10,300]],
    [['J Brahms',10,175]], [['Intermezzo Op.118 No.2',10,350]]])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,3)
  assert.deepEqual(a[0].identity.work_numbers,[1])
  assert.deepEqual(a[0].identity.keys,['A:minor'])
  assert.ok(a[0].evidence.some(e=>e.quote==='1 in a minor M.12'))
  assert.deepEqual(a[2].identity.catalogues.map(n=>n.number),[118])
  const numbered=physicalFixture([[['PROGRAM',10,650]],
    [['J Writer',10,175],['1.',230,245],['The Wings',250,500]]])
  const b=analyzeStoredProgram(numbered).candidates
  assert.equal(b.length,1)
  assert.deepEqual(b[0].identity.extracted_numbers.map(n=>n.value),[1])
  assert.ok(b[0].evidence.some(e=>e.role==='NUMBER'&&e.quote==='1.'))
})

test('paired variation scope and a wrapped explicit composer retain source labels without inventing catalog numbers',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],tableRow('J S Bach','Goldberg Variations BW 988'),
    [['Aria',230,290]], [['Piano: A',230,650]],
    tableRow('세르게이','Romance & Waltz (1 Piano 6-hands)',true),
    [['S Rachmaninoff',10,175],['Piano: A',230,650]]])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,2)
  assert.deepEqual(a[0].identity.catalogues,[],'BW is not silently repaired to BWV')
  assert.ok(a[0].identity.work.scope_source_lines.length)
  assert.equal(a[1].identity.composer,'라흐마니노프')
  assert.ok(a[1].evidence.some(e=>e.quote==='S Rachmaninoff'))
})

test('contained OCR duplicates remain exact evidence without repeating the assembled work title',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],
    [['Autumn Leaves (Jazz Arrangement for 4-hands)',230,650],['J Kosma',10,175],
      ['Autumn',230,300],['Leaves (Jazz Arrangement for 4-hands)',310,650]]])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,1)
  assert.equal(a[0].identity.title,'Autumn Leaves (Jazz Arrangement for 4-hands)')
  assert.deepEqual(a[0].evidence.map(e=>e.line_index),[1,2,3,4])
  assert.ok(a[0].identity.work.arrangement_source_lines.includes(4))
})

test('multiple different explicit names never resolve an unidentified bilingual composer by guesswork',()=>{
  const f=physicalFixture([[['PROGRAM',10,650]],tableRow('이름 미확정','Intermezzo Op.118 No.2'),
    tableRow('J Brahms','Intermezzo Op.118 No.2'),tableRow('R Schumann','Kinderszenen Op.15')])
  const a=analyzeStoredProgram(f).candidates
  assert.equal(a.length,3)
  assert.equal(a[0].identity.composer,null)
  assert.equal(a[1].identity.composer,'브람스')
  assert.equal(a[2].identity.composer,'슈만')
  assert.ok(a[0].evidence.every(e=>e.role!=='COMPOSER'||e.quote==='이름 미확정'))
})

test('standalone program headers accept spacing and decorative punctuation without changing matching', () => {
  for (const header of ['PROGRAM', 'Programme', '[PROGRAM]', '【프로그램】', '연주 곡목', '곡목',
    'PROG RA M .', ' P R O G R A M : ', '(Programme.)', '— PROGRAM —', 'P.R.O.G.R.A.M.',
    'ＰＲＯＧＲＡＭ．', '프로 그 램 :', '「연 주 곡 목」']) {
    const a = analyze(`Ticket information\n${header}\nF Chopin\nBallade No.4 in F minor Op.52`)
    assert.deepEqual(a.candidates.map(c=>c.track_id), ['chopin-ballade-op52-no4'], header)
    assert.equal(a.sections.find(s=>s.preview===header)?.classification, 'PROGRAM', header)
    assert.equal(a.candidates[0].review_status, 'REVIEW_REQUIRED')
  }
})

test('clear headers reenter after notices and profiles, while resetting section context', () => {
  const a = analyze('PROGRAM\nF Chopin\nBallade No.4 in F minor Op.52\nTicket information\nChopin Etude Op.10 No.1\nPROG RA M .\nF Liszt\nLiebestraum No.3 S.541\nPROFILE\nChopin Etude Op.25 No.1\n[ P R O G R A M : ]\nChopin\nEtude Op.10 No.2')
  assert.deepEqual(a.candidates.map(c=>c.track_id), ['chopin-ballade-op52-no4','liszt-liebestraum-s541-no3','chopin-etude-op10-no2'])
  assert.equal(a.sections.filter(s=>s.classification==='PROGRAM').length, 3)
  assert.ok(a.sections.filter(s=>s.classification==='NON_PROGRAM').length>=2)
  assert.ok(a.candidates.every(c=>a.sections[c.section_index].classification==='PROGRAM'))
  const reset = analyze('PROGRAM\nChopin\nBallade No.4 Op.52\nTicket information\nPROG RA M .\nEtude Op.10 No.1')
  assert.equal(reset.candidates.at(-1).identity.composer,null)
  assert.equal(reset.candidates.at(-1).track_id,null)
})

test('program prose, notes, performer and date labels do not reopen an excluded section', () => {
  for (const label of ['The program includes Chopin.', 'About the program', 'Program notes', 'PROGRAM: F Chopin',
    'PROG RA M . notes', 'PROGRAM 2026.10.27', 'PROGRAM / artists', '프로그램 안내', '프로그램은 변경될 수 있습니다.',
    '출연진', 'Piano: Kim', '2026.10.27', '프로그램: 2026.10.27', 'program +']) {
    const a = analyze(`Ticket information\n${label}\nChopin Ballade No.4 Op.52`)
    assert.equal(a.candidates.length,0,label)
    assert.ok(a.sections.every(s=>s.classification==='NON_PROGRAM'),label)
  }
})

test('header recognition preserves original OCR, bbox, confidence and Unicode evidence offsets', () => {
  const f = fixture('🎹\nTicket information\nPROG RA M .\nF Chopin\nBallade No.4 in F minor Op.52\nF Liszt\nLiebestraum No.3 S.541')
  f.ocr.detections=f.ocr.raw_text.split('\n').map((text,i)=>({text,confidence:.93,bbox:[[20,i*30],[760,i*30],[760,i*30+20],[20,i*30+20]]}))
  const before=structuredClone(f)
  const a=analyzeStoredProgram(f)
  assert.deepEqual(f,before)
  const section=a.sections.find(s=>s.classification==='PROGRAM')
  assert.equal(section.preview,'PROG RA M .')
  assert.equal([...f.ocr.raw_text].slice(section.start,section.start+'PROG RA M .'.length).join(''),'PROG RA M .')
  assert.deepEqual(a.candidates.map(c=>c.track_id),['chopin-ballade-op52-no4','liszt-liebestraum-s541-no3'])
  for(const c of a.candidates)for(const e of c.evidence){
    assert.equal([...f.ocr.raw_text].slice(e.start,e.end).join(''),e.quote)
    assert.equal(e.quote,f.ocr.detections[e.line_index].text)
    assert.deepEqual(e.bbox,f.ocr.detections[e.line_index].bbox)
    assert.equal(e.confidence,.93)
  }
})

test('stored analysis excludes biography/history and marketing, including 기타리스트 substring', () => {
  const a = analyze('PROGRAM\nChopin\nBallade No.1 Op.23\n프로필\n과거 공연 Chopin Etude Op.10 No.1\n졸업\nBeethoven Sonata No.14 Op.27-2')
  assert.deepEqual(a.candidates.map((c) => c.track_id), ['chopin-ballade-op23-no1'])
  assert.ok(a.sections.some((s) => s.classification === 'NON_PROGRAM'))
  assert.equal(candidates('커피 기타리스트 김성진의 소개\ndiscover an intimate 60-seat concert hall\nPath to silence').length, 0)
  assert.equal(candidates('Biography\nChopin Ballade No.1 Op.23').length, 0)
  assert.equal(candidates('Previously performed Chopin Ballade No.1 Op.23').length, 0)
})
test('headingless lists keep scoped composer evidence; unknown composer and new sections reset inheritance', () => {
  const a = analyze('F. Chopin\nBallade No.1 Op.23\nW. A. Mozart\nSonata No.14 Op.27-2\nPROGRAM\nEtude Op.10 No.1')
  assert.equal(a.candidates[0].track_id, 'chopin-ballade-op23-no1')
  assert.ok(a.candidates[0].review_reasons.includes('UNCERTAIN_PROGRAM_SECTION'))
  assert.equal(a.candidates[1].track_id, null)
  assert.equal(a.candidates[2].identity.composer, null)
  assert.equal(a.candidates[0].evidence[0].quote, 'F. Chopin')
  assert.equal(linked('PROGRAM\nChopin\nBallade No.1 Op.23\nSor\nEtude Op.10 No.1').length, 1)
})
test('strong identity distinguishes opus, work number, opus part, keys and composer conflicts', () => {
  assert.equal(linked('PROGRAM\nChopin Etude Op.10 No.1')[0].track_id, 'chopin-etude-op10-no1')
  assert.equal(linked('PROGRAM\nChopin Etude Op.25 No.1')[0].track_id, 'chopin-etude-op25-no1')
  for (const row of ['Chopin Ballade No.2 Op.23', 'Chopin Beethoven Ballade No.1 Op.23', 'Chopin Ballade No.1 Op.999',
    'Beethoven Sonata No.14 Op.27-1', 'Chopin Ballade No.1 Op.23 in C major', 'Chopin Ballade No.I Op.23', 'Chopin Etude Op.1O No.1',
    'Chopin', 'Piano Sonata', 'Op.23 No.1']) assert.equal(linked('PROGRAM\n' + row).length, 0, row)
  assert.equal(candidates('PROGRAM\nChopin Ballade No.1 Op.999')[0].outcome, 'UNREGISTERED')
  assert.equal(candidates('PROGRAM\nChopin Ballade No.2 Op.23')[0].outcome, 'CONFLICT')
})
test('parent work, explicit movement and arrangement relations never imply other movement performance', () => {
  const whole = candidates('PROGRAM\nBeethoven Sonata No.14 Op.27-2')
  assert.equal(whole.length, 1)
  assert.equal(whole[0].catalog_id,'beethoven-sonata-op27-2-no14')
  assert.equal(whole[0].track_id,null)
  assert.ok(whole.every((c) => c.relation === 'WHOLE_WORK_REFERENCE' && c.review_status === 'REVIEW_REQUIRED'))
  const movement = linked('PROGRAM\nBeethoven Sonata No.14 Op.27-2\nII. Adagio')
  assert.deepEqual(movement.map((c) => c.track_id), ['beethoven-sonata-op27-2-no14-m2'])
  assert.equal(movement[0].relation, 'EXACT')
  assert.equal(linked('PROGRAM\nChopin Ballade No.1 Op.23 arr.')[0].relation, 'ARRANGEMENT_OR_EXCERPT')
  assert.equal(linked('PROGRAM\nChopin Ballade No.1 Op.23\n편곡')[0].relation, 'ARRANGEMENT_OR_EXCERPT')
  assert.equal(linked('PROGRAM\nBeethoven Sonata No.14 Op.27-2\nAdagio').length, 0)
  assert.equal(linked('PROGRAM\nBeethoven Sonata No.14 Op.27-2\n1-3악장').length, 0)
  assert.equal(linked('PROGRAM\nChopin Ballade No.1 Op.23\nin C major').length, 0)
})
test('different dates and series keep section uncertainty and reasons without automatic confirmation', () => {
  const a = analyze('PROGRAM\n2026.11.01\nChopin Ballade No.1 Op.23')
  assert.equal(a.sections[0].classification, 'UNCERTAIN')
  assert.ok(a.candidates[0].review_reasons.includes('CONTEXT_DATE'))
  assert.equal(a.candidates[0].review_status, 'REVIEW_REQUIRED')
  const b = fixture('PROGRAM\nChopin Ballade No.1 Op.23\nSeries II')
  b.concert.title = 'Series I'
  assert.ok(analyzeStoredProgram(b).candidates[0].review_reasons.includes('CONTEXT_SERIES'))
})
test('two-column bbox context prevents a composer in the other column from leaking', () => {
  const f = fixture('PROGRAM\nChopin\nS. Myers\nBallade No.1 Op.23\nCavatina 카바티나')
  f.ocr.detections = f.ocr.raw_text.split('\n').map((text, i) => ({ text, confidence: .9,
    bbox: [[i === 2 || i === 4 ? 450 : 20, i * 20], [i === 2 || i === 4 ? 700 : 250, i * 20], [250, i * 20 + 10], [20, i * 20 + 10]] }))
  // All four vertices must describe the same column.
  f.ocr.detections.forEach((d, i) => { if (i === 2 || i === 4) d.bbox = [[450,i*20],[700,i*20],[700,i*20+10],[450,i*20+10]] })
  const a = analyzeStoredProgram(f)
  assert.equal(a.candidates[0].track_id, 'chopin-ballade-op23-no1')
  assert.equal(a.candidates[1].identity.composer, 'S. Myers')
  assert.ok(a.candidates[0].evidence.every((e) => e.bbox && e.confidence === .9))
})
test('identity preserves original, separate numbers/catalogue/key/movement and uncertain OCR digits', () => {
  const x = extractIdentity('Beethoven Sonata No.14 Op.27-2\n제2악장\nC# minor')
  assert.deepEqual(x.work_numbers, [14])
  assert.equal(x.opus_part, 2)
  assert.deepEqual(x.movement_numbers, [2])
  assert.deepEqual(x.keys, ['C#:minor'])
  assert.ok(extractIdentity('Piano Concerto No.lin Op.10').reasons.includes('OCR_NUMBER_UNCERTAIN'))
  assert.equal(extractIdentity('Path to silence').reasons.length, 0)
  assert.equal(extractIdentity('S. Myers (1930-1993)\nCavatina').reasons.length, 0)
  assert.match(CATALOG_HASH, /^[a-f0-9]{64}$/)
})
test('evidence offsets use Unicode code points, exact quotation retained', () => {
  const f = fixture('🎹\nPROGRAM\n쇼팽 발라드 No.1 Op.23')
  const a = analyzeStoredProgram(f)
  const e = a.candidates[0].evidence[0]
  assert.equal([...f.ocr.raw_text].slice(e.start,e.end).join(''), e.quote)
})
test('failed source check without changed bytes preserves evidence; known replacement does not', () => {
  const f = fixture('')
  const attempts = [{ id: 'a', status: 'SUCCEEDED', result_id: f.ocr.id, finished_at: '2026-10-15T01:00:00Z', created_at: '2026-10-15T01:00:00Z' }]
  assert.equal(evidenceIssue({ ...f, attempts, results: [f.ocr] }), null)
  attempts.push({ id: 'b', status: 'FAILED', result_id: null, finished_at: '2026-10-15T02:00:00Z', created_at: '2026-10-15T02:00:00Z' })
  assert.equal(evidenceIssue({ ...f, attempts, results: [f.ocr] }), null)
  attempts[0].content_sha256='old';attempts[1].content_sha256='changed'
  assert.equal(evidenceIssue({ ...f, attempts, results: [f.ocr] }), 'LATEST_OCR_NOT_SUCCESSFUL')
  assert.equal(evidenceIssue({ ...f, image: { ...f.image, is_active: false }, attempts, results: [] }), 'IMAGE_INACTIVE_OR_NOT_DETAIL')
})
test('dry run never saves and per-image failure does not stop remaining targets', async () => {
  let writes = 0
  const f = fixture('PROGRAM\nChopin Ballade No.1 Op.23')
  const store = { targets: async () => ({ targets: [{ ...f, ocr: { ...f.ocr, raw_text: null } }, f], skipped: [], coverage: {} }), save: async () => { writes++; return randomUUID() } }
  const result = await analyzeProgramTargets(store)
  assert.equal(result.failures.length, 1)
  assert.equal(result.analyses.length, 1)
  assert.equal(writes, 0)
})
test('CLI requires a single UUID, prior analysis ID and note; refuses unresolved or stale confirmation', async () => {
  assert.throws(() => parseProgramArgs(['confirm','all']), /UUID/)
  assert.throws(() => parseProgramArgs(['analyze','--save','--dry-run']), /CONFLICT/)
  assert.throws(() => parseProgramArgs(['confirm',randomUUID(),'--note','checked']), /ANALYSIS/)
  let writes = 0
  const id = randomUUID(), analysisId = randomUUID()
  const store = { detail: async () => ({ local_version_current: true,matcher_version:MATCHER_VERSION, analysis_id: analysisId, track_id: null }), review: async () => { writes++ } }
  await assert.rejects(runProgramCli(['confirm',id,'--analysis-id',analysisId,'--note','checked'],{ store, print:()=>{} }), /CANNOT_CONFIRM/)
  assert.equal(writes, 0)
})
test('REST dry-run works before the new migration, uses only GET, and skips failed OCR of known changed bytes', async () => {
  const f=fixture('PROGRAM\nChopin Ballade No.1 Op.23')
  const failedImage={...f.image,id:randomUUID()}
  const requests=[]
  const goodAttempt={id:randomUUID(),status:'SUCCEEDED',content_sha256:'a'.repeat(64),result_id:f.ocr.id,created_at:'2026-10-15T02:00:00Z',finished_at:'2026-10-15T02:00:00Z'}
  const failedAttempt={...goodAttempt,id:randomUUID(),status:'FAILED',content_sha256:'b'.repeat(64),result_id:null,created_at:'2026-10-15T03:00:00Z',finished_at:'2026-10-14T00:00:00Z'}
  const store=createProgramAnalysisStore({env:{SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'unit-fixture-key'},
    fetchImpl:async(url,init)=>{
      requests.push({path:url.pathname,method:init.method})
      const table=url.pathname.split('/').at(-1),failed=url.searchParams.get('image_id')===`eq.${failedImage.id}`
      const data=table==='concerts'?[f.concert]:table==='concert_program_images'?[f.image,failedImage]:table==='concert_image_ocr_results'?[f.ocr]:table==='concert_image_ocr_attempts'?failed?[goodAttempt,failedAttempt]:[goodAttempt]:null
      assert.ok(data,'dry-run must not access new analysis tables or external sources')
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})
    }})
  const result=await analyzeProgramTargets(store)
  assert.equal(result.analyzed_images,1)
  assert.equal(result.saved,0)
  assert.equal(result.skipped[0].reason,'NO_CURRENT_SUCCESSFUL_OCR')
  assert.ok(requests.every(r=>r.method==='GET'))
})
