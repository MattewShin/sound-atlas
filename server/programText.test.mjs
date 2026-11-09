import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {routeProgramSource} from './programText/programSourceRouter.mjs'
import {analyzeSelectedProgramSource} from './programText/selectedProgramAnalysis.mjs'
import {buildProgramTextAnalysisPayload} from './programText/supabaseProgramTextAnalysis.mjs'
import {createCollectionKopisClient,collectConcerts} from './programText/concertCollector.mjs'
import {parseOfficialProgramArgs,runOfficialProgram} from './programText/runner.mjs'

test('official v4 payloads preserve frozen reference hashes, catalog identity and exact Unicode offsets',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/official-program-v4-vectors.json',import.meta.url),'utf8'))
 for(const v of fixture.vectors){const source=routeProgramSource(v.concert);assert.equal(source.source_kind,v.expected_source,v.name);if(source.source_kind==='NONE')continue
  const payload=buildProgramTextAnalysisPayload({concert:v.concert,analysis:analyzeSelectedProgramSource({concert:v.concert,source})})
  assert.equal(payload.payload_hash,v.expected_hash,v.name);assert.equal(payload.catalog_hash,v.catalog_hash);assert.equal(payload.candidates.length,v.candidate_count)
 }
})
test('official CLI defaults to dry-run, rejects retired stage flags, and skips legacy-only evidence with zero writes',async()=>{
 const id='00000000-0000-4000-8000-000000000001'
 assert.deepEqual(parseOfficialProgramArgs(['--concert-id',id]),{mode:'DRY_RUN',daily:false,concertId:id})
 for(const args of [[],['--daily','--concert-id',id],['--ocr'],['--analysis'],['--mode','implicit'],['--concert-id','invalid']])assert.throws(()=>parseOfficialProgramArgs(args))
 const calls=[];const out=await runOfficialProgram({mode:'SAVE',concertId:id},{env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',PIPELINE_OCR_ENABLED:'true'},fetchImpl:async(url,init)=>{
  calls.push({path:new URL(url).pathname,method:init.method});return new Response(JSON.stringify([{id,kopis_detail_text:null,kopis_detail_text_hash:null,current_ocr_evidence:{is_current:true,raw_text:'old alternate source'}}]))
 }})
 assert.equal(out.source,'NONE');assert.equal(out.status,'SKIPPED');assert.deepEqual(calls,[{path:'/rest/v1/concerts',method:'GET'}])
 await assert.rejects(runOfficialProgram({mode:'SAVE',daily:true},{env:{},fetchImpl:()=>{throw Error('unexpected network')}}),/OFFICIAL_SCHEDULE_DISABLED/)
})
test('KOPIS collection still normalizes official text and image metadata without downloading images',async()=>{
 const requests=[],saved=[],program='[Program]\nF. Chopin\nScherzo No.4 Op.54'
 const row=`<db><mt20id>PF999901</mt20id><prfnm>Synthetic program</prfnm><fcltynm>Fixture Hall</fcltynm><area>서울</area><genrenm>서양음악(클래식)</genrenm><prfpdfrom>2099.11.09</prfpdfrom><prfpdto>2099.11.09</prfpdto><prfstate>공연예정</prfstate><poster>https://kopis.or.kr/upload/synthetic-poster.jpg</poster><styurls><styurl>https://kopis.or.kr/upload/synthetic-program.jpg</styurl></styurls><sty><![CDATA[${program}]]></sty></db>`
 const client=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'synthetic-key'},delay:async()=>{},fetchImpl:async(url)=>{requests.push(new URL(url).pathname);return new Response('<dbs>'+row+'</dbs>')}})
 const report=await collectConcerts({client,repository:{save:async s=>saved.push(s)},limit:1,now:()=>Date.parse('2099-11-09T00:00:00Z')})
 assert.equal(report.failed,0);assert.equal(report.saved,1);assert.equal(saved[0].concert.kopis_detail_text,program)
 assert.equal(saved[0].concert.kopis_detail_text_hash,createHash('sha256').update(program).digest('hex'));assert.equal(saved[0].images.length,2)
 assert.deepEqual(requests,['/openApi/restful/pblprfr','/openApi/restful/pblprfr/PF999901'])
 const calls=[],concert={...saved[0].concert,id:'00000000-0000-4000-8000-000000000001',program_context_revision:0}
 const daily=await runOfficialProgram({mode:'DRY_RUN',daily:true},{env:{KOPIS_SERVICE_KEY:'synthetic-key',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED:'true'},now:()=>Date.parse('2099-11-09T00:00:00Z'),fetchImpl:async(url,init)=>{
  calls.push(init.method??'GET');return new Response(new URL(url).hostname==='kopis.or.kr'?'<dbs>'+row+'</dbs>':JSON.stringify([concert]))
 }})
 assert.equal(daily.mode,'DRY_RUN');assert.equal(daily.source,'KOPIS_DETAIL_TEXT');assert.equal(daily.status,'DRY_RUN');assert.equal(daily.collection.saved,0);assert.ok(calls.every(m=>m==='GET'),'daily dry-run must analyze the existing official source without writes')
})
