import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {routeProgramSource} from './programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './selectedProgramAnalysis.mjs'
import {analyzeStoredProgram,programAnalysisCacheKey,hashJson,MATCHER_VERSION} from './programAnalysis.mjs'

const hash=text=>createHash('sha256').update(text,'utf8').digest('hex')
const title='Scherzo No.4 in E Major, Op.54'
const concert={id:'00000000-0000-4000-8000-000000000001',kopis_id:'PF900054',title:'Official Program test',venue:'Local hall',start_date:'2099-10-23',end_date:'2099-10-23'}
const official=text=>routeProgramSource({kopis_detail_text:text,kopis_detail_text_hash:hash(text)})
const analyze=text=>analyzeSelectedProgramSource({concert,source:official(text)})
const exact=c=>c.outcome==='MATCHED'&&c.relation==='EXACT'
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
// Recorded BEFORE the core refactor from 29f95f5593c4fc1d03958416985f8836a31b0343.
// Hashes cover complete ordered JSON, including all candidates and payload_hash.
const golden=JSON.parse(await readFile(new URL('./fixtures/programSourceOcrV4.json',import.meta.url),'utf8'))

test('official Scherzo reaches v4 through the pure core, never reading OCR or exposing an OCR save payload',()=>{
  const source=official(`[Program]\nF. Chopin\n${title}`)
  const input={concert,source,get current_ocr_target(){throw new Error('MUST_NOT_READ_OCR')}}
  const result=analyzeSelectedProgramSource(input)
  assert.equal(result.candidates.length,1);assert.ok(exact(result.candidates[0]))
  assert.equal(result.candidates[0].track_id,'chopin-scherzo-op54-no4')
  assert.equal(result.matcher_version,'stored-program-4');assert.equal(result.candidates[0].generation_version,MATCHER_VERSION)
  assert.equal(result.source_kind,'KOPIS_DETAIL_TEXT');assert.equal(result.text_hash,source.text_hash)
  assert.equal(result.reason_code,'OFFICIAL_PROGRAM_SELECTED');assert.equal(result.ocr_reason_code,'NOT_CONSIDERED')
  assert.equal(result.storage_compatible,false);assert.equal(result.storage_reason_code,'OFFICIAL_TEXT_REQUIRES_SOURCE_STORAGE_CONTRACT')
  assert.equal(result.ocr_analysis,null);assert.equal(result.mode,'READ_ONLY')
  for(const key of ['image_id','ocr_result_id','source_attempt_id','payload_hash'])assert.ok(!Object.hasOwn(result,key))
  assert.ok(!JSON.stringify(result).includes('official-text-dry-run'))
})

test('multiple sections retain full-source UTF-16 offsets, CRLF/CR/LF, Unicode and original line indices in all evidence',()=>{
  for(const newline of ['\r\n','\r','\n']){
    const text=['🎹 e\u0301 소개','[공연소개]','Earlier recital','[Program]','F. Chopin (e\u0301 🎹)',title,'Biography','Previously played Liszt','【Programme】','J. Brahms','Intermezzo Op.118 No.2'].join(newline)
    const source=official(text),result=analyzeSelectedProgramSource({concert,source})
    assert.equal(result.candidates.length,2);assert.equal(result.source_sections.length,2)
    assert.deepEqual(result.candidates.map(c=>c.source_section_index),[0,1])
    assert.deepEqual(result.candidates.map(c=>c.section_index),[0,1])
    assert.deepEqual(result.sections.map(s=>s.index),[0,1])
    assert.equal(result.offset_unit,'UTF16_CODE_UNIT');assert.equal(result.text_hash,hash(text))
    const lines=text.split(/\r\n|\r|\n/)
    const check=(e,index)=>{
      const span=result.source_sections[index]
      assert.equal(text.slice(e.start,e.end),e.quote)
      assert.ok(e.start>=span.start_offset&&e.end<=span.end_offset)
      assert.equal(e.quote,lines[e.line_index]);assert.equal(e.bbox,null);assert.equal(e.confidence,null)
    }
    for(const c of result.candidates)for(const e of c.evidence)check(e,c.source_section_index)
    for(const w of result.logical_works){
      for(const e of w.source_lines)check(e,w.source_section_index)
      for(const variant of w.work.language_variants)for(const e of variant.source_lines)check(e,w.source_section_index)
    }
    assert.equal(result.candidates[0].evidence.find(e=>e.role==='WORK').start,text.indexOf(title))
  }
})

test('biography, introduction and notices cannot supply candidates or leak unselected prose',()=>{
  const text='[공연소개]\nPreviously played Liszt Liebestraum No.3 S.541\n[Program]\nF. Chopin\n'+title+'\n* Program and artists are subject to change\nJ. Brahms\nIntermezzo Op.118 No.2\n[Program]\nF. Chopin\nBallade No.4 Op.52\nBiography: Graduated conservatory\nF. Liszt\nLiebestraum No.3 S.541'
  const result=analyze(text)
  assert.deepEqual(result.candidates.map(c=>c.track_id),['chopin-scherzo-op54-no4','chopin-ballade-op52-no4'])
  const serialized=JSON.stringify(result)
  for(const outside of ['Previously played','Liebestraum','Intermezzo','subject to change','Graduated'])assert.ok(!serialized.includes(outside))
})

test('sections cannot borrow composer/catalogue evidence or merge repeated and bilingual work rows across boundaries',()=>{
  for(const text of [
    `[Program]\nF. Chopin\n[Program]\n${title}`,
    '[Program]\nF. Chopin\nScherzo No.4 in E Major\n[Program]\nOp.54',
  ])assert.ok(!analyze(text).candidates.some(exact))
  const repeated=analyze(`[Program]\nF. Chopin\n${title}\n[Program]\nF. Chopin\n${title}`)
  assert.equal(repeated.candidates.length,2)
  assert.notEqual(repeated.candidates[0].logical_work_id,repeated.candidates[1].logical_work_id)
  assert.notEqual(repeated.candidates[0].candidate_key,repeated.candidates[1].candidate_key)
  assert.deepEqual(repeated.logical_works.map(w=>w.source_section_index),[0,1])
  const bilingual=analyze(`[Program]\nF. Chopin\n${title}\n[Program]\n쇼팽\n스케르초 제4번 Op.54`)
  assert.equal(bilingual.candidates.length,2);assert.ok(bilingual.candidates.every(exact))
  assert.notEqual(bilingual.candidates[0].logical_work_id,bilingual.candidates[1].logical_work_id)
})

test('composer, opus and ordinal conflict, arrangements and excerpts remain non-EXACT in official analysis',()=>{
  for(const text of [
    `[Program]\n${title}`,
    `[Program]\nF. Chopin / J. Brahms\n${title}`,
    `[Program]\nF. Chopin\n${title.replace('Op.54','Op.53')}`,
    `[Program]\nF. Chopin\n${title.replace('No.4','No.3')}`,
    `[Program]\nF. Chopin\n${title}\nArranged for four hands`,
    `[Program]\nF. Chopin\n${title}\nExcerpt`,
    '[Program]\nL. van Beethoven\nPiano Sonata No.14 Op.27 No.2\nScherzo',
  ])assert.ok(!analyze(text).candidates.some(exact),text)
})

test('absent, unsupported or mismatched official source falls back to the attested current OCR without merging text',()=>{
  const target=structuredClone(golden[0].input),current={is_current:true,image:target.image,ocr:target.ocr,attempt:target.attempt}
  for(const fields of [{},{kopis_detail_text:'not the hash',kopis_detail_text_hash:'f'.repeat(64)},
    {kopis_detail_text:'Biography only',kopis_detail_text_hash:hash('Biography only')},
    {kopis_detail_text:'<p>Program</p>',kopis_detail_text_hash:hash('<p>Program</p>')}]){
    const source=routeProgramSource({...fields,current_ocr_evidence:{is_current:true,raw_text:target.ocr.raw_text}})
    const result=analyzeSelectedProgramSource({concert:target.concert,source,current_ocr_target:current})
    assert.equal(result.source_kind,'OCR');assert.equal(result.reason_code,'OCR_FALLBACK')
    assert.equal(result.official_reason_code,source.official_reason_code);assert.equal(result.ocr_reason_code,'CURRENT_OCR_AVAILABLE')
    assert.equal(result.text_hash,hash(target.ocr.raw_text));assert.deepEqual(result.source_sections,[])
    assert.deepEqual(result.ocr_analysis,analyzeStoredProgram(target))
    assert.deepEqual(result.candidates,result.ocr_analysis.candidates);assert.equal(result.offset_unit,'UNICODE_CODE_POINT')
    assert.equal(result.candidates[0].track_id,'chopin-ballade-op52-no4')
  }
})

test('NONE produces no candidates, no OCR access and no network or POST requests',()=>{
  const before=globalThis.fetch,calls=[]
  globalThis.fetch=(...args)=>{calls.push(args);throw new Error('NO_NETWORK_ALLOWED')}
  try{
    for(const input of [{},{current_ocr_evidence:{is_current:false,raw_text:'PROGRAM'}},
      {kopis_detail_text:'<p>[Program]</p>',kopis_detail_text_hash:hash('<p>[Program]</p>')}]){
      const source=routeProgramSource(input)
      const result=analyzeSelectedProgramSource({source,get current_ocr_target(){throw new Error('MUST_NOT_READ_OCR')}})
      assert.equal(result.source_kind,'NONE');assert.equal(result.analysis_reason_code,'NO_USABLE_SOURCE');assert.equal(result.reason_code,'NO_USABLE_SOURCE')
      assert.deepEqual(result.candidates,[]);assert.deepEqual(result.logical_works,[]);assert.equal(result.ocr_analysis,null)
    }
    assert.deepEqual(calls,[])
  }finally{globalThis.fetch=before}
})

test('router contract tampering and unverified/mismatched current OCR targets fail closed',()=>{
  const text=`[Program]\nF. Chopin\n${title}`,source=official(text)
  const altered=structuredClone(source);altered.official_sections[0].start_offset++
  for(const bad of [altered,{...source,text_hash:'f'.repeat(64)},{...source,raw_text:source.raw_text+' changed'},
    {...source,official_sections:[]},{source_kind:'latest'}])assert.throws(()=>analyzeSelectedProgramSource({concert,source:bad}),/PROGRAM_SOURCE_INVALID/)
  const target=structuredClone(golden[0].input),ocrSource=routeProgramSource({current_ocr_evidence:{is_current:true,raw_text:target.ocr.raw_text}})
  for(const current of [undefined,{is_current:false,...target},{is_current:true}])assert.throws(()=>analyzeSelectedProgramSource({concert,source:ocrSource,current_ocr_target:current}),/CURRENT_OCR_TARGET_REQUIRED/)
  assert.throws(()=>analyzeSelectedProgramSource({concert,source:ocrSource,current_ocr_target:{is_current:true,...target,ocr:{...target.ocr,raw_text:'other text'}}}),/CURRENT_OCR_TARGET_MISMATCH/)
})

test('frozen routed inputs remain unchanged and repeated analyses have stable source-specific logical keys',()=>{
  const source=freeze(official(`[Program]\nF. Chopin\n${title}`)),input=freeze({concert:structuredClone(concert),source}),before=JSON.stringify(input)
  const a=analyzeSelectedProgramSource(input),b=analyzeSelectedProgramSource(input)
  assert.deepEqual(a,b);assert.equal(JSON.stringify(input),before)
  a.candidates[0].identity.title='changed result'
  assert.notEqual(analyzeSelectedProgramSource(input).candidates[0].identity.title,'changed result')
})

for(const [index,pinned] of golden.entries())test(`pinned OCR snapshot/payload/cache and routed fallback stay byte-equivalent: case ${index+1}`,()=>{
  const input=freeze(structuredClone(pinned.input)),before=JSON.stringify(input),analysis=analyzeStoredProgram(input)
  assert.equal(hashJson(analysis),pinned.snapshot_hash);assert.equal(analysis.payload_hash,pinned.payload_hash)
  assert.equal(programAnalysisCacheKey(input),pinned.cache_key)
  const source=routeProgramSource({current_ocr_evidence:{is_current:true,raw_text:input.ocr.raw_text}})
  const routed=analyzeSelectedProgramSource({concert:input.concert,source,current_ocr_target:{is_current:true,image:input.image,ocr:input.ocr,attempt:input.attempt}})
  assert.deepEqual(routed.ocr_analysis,analysis);assert.equal(JSON.stringify(input),before)
})
