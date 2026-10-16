import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { analyzeStoredProgram, extractIdentity, CATALOG_HASH } from './programAnalysis.mjs'
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
  const whole = linked('PROGRAM\nBeethoven Sonata No.14 Op.27-2')
  assert.equal(whole.length, 3)
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
test('latest failure or replacement never falls back to an old successful artifact', () => {
  const f = fixture('')
  const attempts = [{ id: 'a', status: 'SUCCEEDED', result_id: f.ocr.id, finished_at: '2026-10-15T01:00:00Z', created_at: '2026-10-15T01:00:00Z' }]
  assert.equal(evidenceIssue({ ...f, attempts, results: [f.ocr] }), null)
  attempts.push({ id: 'b', status: 'FAILED', result_id: null, finished_at: '2026-10-15T02:00:00Z', created_at: '2026-10-15T02:00:00Z' })
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
  const store = { detail: async () => ({ local_version_current: true, analysis_id: analysisId, track_id: null }), review: async () => { writes++ } }
  await assert.rejects(runProgramCli(['confirm',id,'--analysis-id',analysisId,'--note','checked'],{ store, print:()=>{} }), /CANNOT_CONFIRM/)
  assert.equal(writes, 0)
})
test('REST dry-run works before the new migration, uses only GET, and skips images whose newest ingestion failed', async () => {
  const f=fixture('PROGRAM\nChopin Ballade No.1 Op.23')
  const failedImage={...f.image,id:randomUUID()}
  const requests=[]
  const goodAttempt={id:randomUUID(),status:'SUCCEEDED',result_id:f.ocr.id,created_at:'2026-10-15T02:00:00Z',finished_at:'2026-10-15T02:00:00Z'}
  const failedAttempt={...goodAttempt,id:randomUUID(),status:'FAILED',result_id:null,created_at:'2026-10-15T03:00:00Z',finished_at:'2026-10-14T00:00:00Z'}
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
