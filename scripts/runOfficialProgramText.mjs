import {parseOfficialProgramArgs,runOfficialProgram} from '../server/programText/runner.mjs'
try{
 const options=parseOfficialProgramArgs(process.argv.slice(2))
 if(options.help)console.log('공식 Program text 전용: --concert-id UUID | --daily, --mode dry-run|save (기본 dry-run). 일일 모드는 PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED=true 필요.')
 else{
  const result=await runOfficialProgram(options,{signal:AbortSignal.timeout(1_800_000)})
  // No source text, keyed URLs, environment values or arbitrary errors are logged.
  const report=Object.fromEntries(['mode','status','reason','source','counts','collection','confirmation_attempts'].filter(k=>result[k]!==undefined).map(k=>[k,result[k]]))
  console.log(JSON.stringify(report));if(result.status==='FAILED')process.exitCode=1
 }
}catch(e){console.error(/^[A-Z][A-Z0-9_]{0,95}$/.test(e.message)?e.message:'OFFICIAL_PROGRAM_FAILED');process.exitCode=1}
