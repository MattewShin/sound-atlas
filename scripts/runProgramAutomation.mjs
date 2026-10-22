import {createProgramAutomationStore} from '../server/supabaseProgramAutomation.mjs'
import {createSupabaseRest} from '../server/supabaseRest.mjs'
import {runAutomaticPrograms,AUTOMATION_RULE} from '../server/programAutomation.mjs'
import {CATALOG_JSON} from '../server/programAnalysis.mjs'
import {confirmationValidity} from '../server/programWorkIdentity.mjs'
import {koreaDate} from '../src/data/concertSearchConfig.js'
import {writeFile} from 'node:fs/promises'

const args=process.argv.slice(2)
const value=key=>args.includes(key)?args[args.indexOf(key)+1]:null
if(args.some(a=>!['--save','--dry-run','--limit','--kopis-id','--output'].includes(a)&&!args.some((k,i)=>['--limit','--kopis-id','--output'].includes(k)&&args[i+1]===a)))throw new Error('INVALID_ARGUMENT')
if(args.includes('--save')&&args.includes('--dry-run'))throw new Error('INVALID_ARGUMENT')
const save=args.includes('--save'),limit=Number(value('--limit')||20),kopisId=value('--kopis-id')
if(!Number.isInteger(limit)||limit<1||limit>100||kopisId&&!/^PF\d{1,12}$/.test(kopisId))throw new Error('INVALID_ARGUMENT')
const controller=new AbortController(),timer=setTimeout(()=>controller.abort('TIME_LIMIT'),60000)
const options={signal:controller.signal,...(!save?{fetchImpl:(url,init)=>{if(init.method!=='GET')throw new Error('READ_ONLY_GUARD');return fetch(url,init)}}:{})}
const store=createProgramAutomationStore(options),request=createSupabaseRest(options)
const catalog=JSON.parse(CATALOG_JSON)
let migrationReady=false
try{
 try{await store.preflight();migrationReady=true}catch(e){if(e.code!=='PROGRAM_AUTOMATION_MIGRATION_REQUIRED')throw e;if(save)throw e}
 // The fallback is GET-only, including on installations without the new migration.
 if(!save){
  store.queue=async()=>request('concert_program_analyses',{params:{select:'id,concert_id,image_id,ocr_result_id,concerts!inner(kopis_id,end_date)',is_current:'eq.true',matcher_version:'eq.stored-program-3',
   'concerts.end_date':'gte.'+koreaDate(Date.now()),...(kopisId?{'concerts.kopis_id':'eq.'+kopisId}:{}),order:'created_at.asc,id.asc',limit:String(limit)}})
  store.existingLinks=async concertId=>{
   const rows=await request('concert_program_candidate_status',{params:{select:'*',concert_id:'eq.'+concertId,review_status:'eq.CONFIRMED',limit:'1000'}})
   if(rows.length===1000)throw new Error('AUTOMATION_SCAN_LIMIT')
   return rows.filter(c=>confirmationValidity(c,catalog,{version:'stored-program-3'}).is_effectively_confirmed)
  }
 }
 let imageIds
 if(save&&kopisId){
  const [concert]=await request('concerts',{params:{select:'id',kopis_id:'eq.'+kopisId,limit:'1'}})
  const images=concert?await request('concert_program_images',{params:{select:'id',concert_id:'eq.'+concert.id,limit:'1000'}}):[]
  if(images.length===1000)throw new Error('AUTOMATION_SCAN_LIMIT')
  imageIds=images.map(i=>i.id)
 }
 const report=await runAutomaticPrograms({store,limit,imageIds,save,check:()=>{if(controller.signal.aborted)throw Object.assign(new Error('BATCH_INTERRUPTED'),{code:'BATCH_INTERRUPTED'})}})
 const output={mode:save?'SAVE':'READ_ONLY_PREVIEW',rule:AUTOMATION_RULE,migration_ready:migrationReady,remote_writes:save?'SEE_RECEIPTS':0,scope:{kopis_id:kopisId,limit},...report}
 if(value('--output'))await writeFile(value('--output'),JSON.stringify(output,null,2))
 console.log(JSON.stringify(output,null,2))
 if(report.failed)process.exitCode=1
}catch(e){console.error(JSON.stringify({error:e.code||'AUTOMATION_FAILED',migration_ready:migrationReady,applied:false}));process.exitCode=1}
finally{clearTimeout(timer)}
