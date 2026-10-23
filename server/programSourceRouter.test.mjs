import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {extractOfficialProgramText} from './officialProgramText.mjs'
import {routeProgramSource} from './programSourceRouter.mjs'

const hash=text=>createHash('sha256').update(text,'utf8').digest('hex')
const official=text=>({kopis_detail_text:text,kopis_detail_text_hash:hash(text)})
const goodText='[Program]\nF. Chopin\nScherzo No.4 in E Major, Op.54'
const ocr=()=>({is_current:true,status:'SUCCEEDED',raw_text:'CURRENT OCR ONLY 🎹',raw_text_hash:hash('CURRENT OCR ONLY 🎹')})

test('valid official Program wins without even reading non-selected OCR evidence',()=>{
  const input=official(goodText)
  Object.defineProperty(input,'current_ocr_evidence',{get:()=>assert.fail('Non-selected OCR was accessed')})
  const result=routeProgramSource(input)
  assert.equal(result.source_kind,'KOPIS_DETAIL_TEXT');assert.equal(result.reason_code,'OFFICIAL_PROGRAM_SELECTED')
  assert.equal(result.official_reason_code,'OFFICIAL_PROGRAM_AVAILABLE');assert.equal(result.ocr_reason_code,'NOT_CONSIDERED')
  assert.equal(result.raw_text,goodText);assert.equal(result.text_hash,hash(goodText));assert.equal(result.official_sections.length,1)
  assert.deepEqual(Object.keys(result).sort(),['source_kind','reason_code','official_reason_code','ocr_reason_code','official_sections','raw_text','text_hash'].sort())
})

test('official rejection reasons consistently select caller-validated OCR or NONE without source merging',()=>{
  const cases=[
    [{},'OFFICIAL_TEXT_ABSENT'],
    [{kopis_detail_text:null,kopis_detail_text_hash:null},'OFFICIAL_TEXT_ABSENT'],
    [{kopis_detail_text:goodText},'OFFICIAL_PAIR_INCOMPLETE'],
    [{kopis_detail_text_hash:hash(goodText)},'OFFICIAL_PAIR_INCOMPLETE'],
    [{kopis_detail_text:{raw:goodText},kopis_detail_text_hash:hash(goodText)},'OFFICIAL_TEXT_INVALID'],
    [{kopis_detail_text:42,kopis_detail_text_hash:hash(goodText)},'OFFICIAL_TEXT_INVALID'],
    [official(' \t\n'),'OFFICIAL_TEXT_EMPTY'],
    [{kopis_detail_text:goodText,kopis_detail_text_hash:'bad'},'OFFICIAL_HASH_INVALID'],
    [{kopis_detail_text:goodText,kopis_detail_text_hash:hash(goodText).toUpperCase()},'OFFICIAL_HASH_INVALID'],
    [{kopis_detail_text:goodText,kopis_detail_text_hash:hash(goodText)+'\n'},'OFFICIAL_HASH_INVALID'],
    [{kopis_detail_text:goodText,kopis_detail_text_hash:'0'.repeat(64)},'OFFICIAL_HASH_MISMATCH'],
    [official('UNSELECTED OFFICIAL: F. Chopin Op.54'),'OFFICIAL_PROGRAM_ABSENT'],
    [official('<p>[Program]</p>UNSELECTED OFFICIAL'),'OFFICIAL_MARKUP_UNSUPPORTED'],
    [official('[Program]\n\n'),'OFFICIAL_PROGRAM_EMPTY'],
  ]
  for(const [source,reason] of cases){
    const evidence=ocr(),selected=routeProgramSource({...source,current_ocr_evidence:evidence})
    assert.equal(selected.source_kind,'OCR',reason);assert.equal(selected.reason_code,'OCR_FALLBACK')
    assert.equal(selected.official_reason_code,reason);assert.equal(selected.ocr_reason_code,'CURRENT_OCR_AVAILABLE')
    assert.equal(selected.raw_text,evidence.raw_text);assert.equal(selected.text_hash,hash(evidence.raw_text));assert.deepEqual(selected.official_sections,[])
    assert.ok(!JSON.stringify(selected).includes('UNSELECTED OFFICIAL'))
    const none=routeProgramSource(source)
    assert.equal(none.source_kind,'NONE');assert.equal(none.reason_code,'NO_USABLE_SOURCE')
    assert.equal(none.official_reason_code,reason);assert.equal(none.ocr_reason_code,'OCR_ABSENT')
    assert.equal(none.raw_text,null);assert.equal(none.text_hash,null);assert.deepEqual(none.official_sections,[])
  }
})

test('non-string and incomplete UTF-16 official text cannot become an official source',()=>{
  for(const text of [false,[],{},'text\0NUL','text\ud800','text\udc00']){
    const result=routeProgramSource({kopis_detail_text:text,kopis_detail_text_hash:hash(String(text)),current_ocr_evidence:ocr()})
    assert.equal(result.source_kind,'OCR');assert.equal(result.official_reason_code,'OFFICIAL_TEXT_INVALID')
  }
})

test('unlabelled biography, performance introduction and notices are not Program sections',()=>{
  for(const text of ['[공연소개]\nF Chopin Op.54','Biography: Pianist\nF. Chopin Op.54','Program notes about a previous performance','* 프로그램 및 연주자가 변경될 수 있습니다.',
    '[Program\nF Chopin Op.54','Program]\nF Chopin Op.54','(Program]\nF Chopin Op.54']){
    assert.equal(extractOfficialProgramText(text).sections.length,0)
    assert.equal(routeProgramSource(official(text)).source_kind,'NONE')
  }
})

test('biography/introduction/notice immediately after a Program heading cannot supply its body',()=>{
  for(const body of ['Profile: Pianist Kim\nF. Chopin Op.54','공연소개: 피아노 연주회\nF Chopin Op.54','He graduated from university.\nF Chopin Op.54',
    '피아니스트는 대학을 졸업했다.\nF Chopin Op.54','Program and artists subject to change\nF Chopin Op.54',
    '* 프로그램 및 연주자가 변경될 수 있습니다.\nF Chopin Op.54','Ticket information\nF Chopin Op.54']){
    const result=routeProgramSource({...official('[Program]\n'+body),current_ocr_evidence:ocr()})
    assert.equal(result.source_kind,'OCR',body);assert.equal(result.official_reason_code,'OFFICIAL_PROGRAM_EMPTY')
  }
})

test('boundaries exclude biography and notices while later Program sections resume in original order',()=>{
  const text='[공연소개]\nINTRO OMITTED\n[Program]\nF. Chopin\nBallade Op.52\nProfile: Artist\nBIO OMITTED\n[프로그램]\nF. Liszt\nLiebestraum No.3 S.541\n* 프로그램 및 연주자가 변경될 수 있습니다.\nNOTICE OMITTED'
  const result=routeProgramSource(official(text))
  assert.equal(result.source_kind,'KOPIS_DETAIL_TEXT');assert.equal(result.official_sections.length,2)
  assert.ok(result.official_sections[0].text.includes('Ballade'));assert.ok(result.official_sections[1].text.includes('Liebestraum'))
  assert.ok(result.official_sections.every(s=>!/INTRO OMITTED|BIO OMITTED|NOTICE OMITTED/.test(s.text)))
  assert.ok(result.official_sections[0].end_offset<result.official_sections[1].start_offset)
})

test('source text/hash stay byte-exact; multi-section UTF-16 offsets and legacy line coordinates survive CRLF/CR and emoji',()=>{
  const text='소개 🎹\r\n[PROGRAM]\r\nF. Chopin\r\n  e\u0301 Op.54\r\n\r\n[프로필]\r\nexcluded\r곡목\rF. Liszt\rS.541\r\n'
  const result=routeProgramSource(official(text)),sections=result.official_sections
  assert.equal(result.raw_text,text);assert.equal(result.text_hash,hash(text));assert.equal(sections.length,2)
  assert.deepEqual(sections.map(s=>s.startLine),[1,7]);assert.deepEqual(sections.map(s=>s.endLine),[4,10])
  for(const section of sections){
    const slice=text.slice(section.start_offset,section.end_offset)
    assert.equal(slice.replace(/\r\n?/g,'\n'),section.text)
    assert.ok(/^(?:\[PROGRAM\]|곡목)/.test(slice))
  }
  assert.equal(sections[0].text,'[PROGRAM]\nF. Chopin\n  e\u0301 Op.54\n')
  assert.equal(routeProgramSource({...official(text),kopis_detail_text_hash:hash(text.replace(/\r\n?/g,'\n'))}).source_kind,'NONE')
})

test('empty Program sections never establish official evidence and do not reorder populated sections',()=>{
  const source='[Program]\n\n[PROGRAM]\nF. Chopin Op.54\n[프로그램]\n[프로필]\nArtist'
  const result=routeProgramSource(official(source))
  assert.equal(result.source_kind,'KOPIS_DETAIL_TEXT');assert.equal(result.official_sections.length,1)
  assert.equal(result.official_sections[0].startLine,2)
})

test('current OCR without an optional text hash is returned exactly, not normalized or combined with rejected text',()=>{
  const text=' \r\nCURRENT OCR e\u0301 🎹\r\n '
  const evidence={is_current:true,raw_text:text,content_sha256:'not-a-text-hash',unselected_metadata:'DO NOT COPY'}
  const result=routeProgramSource({...official('INTRO ONLY'),current_ocr_evidence:evidence})
  assert.equal(result.source_kind,'OCR');assert.equal(result.raw_text,text);assert.equal(result.text_hash,hash(text))
  assert.ok(!JSON.stringify(result).includes('INTRO ONLY'));assert.ok(!JSON.stringify(result).includes('DO NOT COPY'))
})

test('unusable, stale, failed, empty or text-hash-mismatched OCR results in NONE with stable reasons',()=>{
  const cases=[
    [undefined,'OCR_ABSENT'],[null,'OCR_ABSENT'],[false,'OCR_EVIDENCE_INVALID'],[[],'OCR_EVIDENCE_INVALID'],
    [{raw_text:'unverified'},'OCR_NOT_CURRENT'],[{is_current:false,raw_text:'stale'},'OCR_NOT_CURRENT'],
    [{is_current:true,status:'FAILED',raw_text:'failed'},'OCR_NOT_SUCCEEDED'],
    [{is_current:true,raw_text:42},'OCR_TEXT_INVALID'],[{is_current:true,raw_text:'\ud800'},'OCR_TEXT_INVALID'],
    [{is_current:true,raw_text:'bad\0text'},'OCR_TEXT_INVALID'],[{is_current:true,raw_text:' \r\n\t'},'OCR_TEXT_EMPTY'],
    [{...ocr(),raw_text_hash:'invalid'},'OCR_HASH_INVALID'],[{...ocr(),raw_text_hash:'0'.repeat(64)},'OCR_HASH_MISMATCH'],
  ]
  for(const [evidence,reason] of cases){
    const result=routeProgramSource({current_ocr_evidence:evidence})
    assert.equal(result.source_kind,'NONE');assert.equal(result.ocr_reason_code,reason)
    assert.equal(result.raw_text,null);assert.equal(result.text_hash,null);assert.deepEqual(result.official_sections,[])
  }
})

test('selection is deterministic and does not mutate frozen source/evidence inputs',()=>{
  const evidence=Object.freeze(ocr()),input=Object.freeze({...official(goodText),current_ocr_evidence:evidence}),before=structuredClone(input)
  const first=routeProgramSource(input),second=routeProgramSource(input)
  assert.deepEqual(first,second);assert.deepEqual(input,before)
  first.official_sections[0].text='mutated output'
  assert.notEqual(routeProgramSource(input).official_sections[0].text,'mutated output')
  assert.equal(routeProgramSource().source_kind,'NONE');assert.equal(routeProgramSource(null).source_kind,'NONE')
})
