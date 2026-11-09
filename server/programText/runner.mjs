import {createProgramTextCoordinator} from './programTextCoordinator.mjs'
import {createSupabaseRest} from './supabaseRest.mjs'
import {createCollectionKopisClient,collectConcerts} from './concertCollector.mjs'
import {collectionConditions} from './concertCollectionConfig.mjs'
export function parseOfficialProgramArgs(args){
 const options={mode:'DRY_RUN',daily:false,concertId:null}
 for(let i=0;i<args.length;i++){
  if(args[i]==='--help')return {help:true}
  if(args[i]==='--daily')options.daily=true
  else if(args[i]==='--mode'){
   const value=args[++i];if(!['dry-run','save'].includes(value))throw Error('OFFICIAL_MODE_INVALID')
   options.mode=value==='save'?'SAVE':'DRY_RUN'
  }else if(args[i]==='--concert-id')options.concertId=args[++i]
  else throw Error('OFFICIAL_ARGUMENT_INVALID')
 }
 if(options.daily===Boolean(options.concertId)||options.concertId&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.concertId))throw Error('OFFICIAL_SCOPE_REQUIRED')
 return options
}
// One collection and one official coordinator invocation; the coordinator limits
// every run to one confirmation POST. No recognition/fallback stages exist.
export async function runOfficialProgram(options,{env=process.env,fetchImpl=fetch,now=Date.now,signal}={}){
 if(!options||!['DRY_RUN','SAVE'].includes(options.mode))throw Error('OFFICIAL_MODE_INVALID')
 if(options.daily&&env.PROGRAM_OFFICIAL_TEXT_SCHEDULE_ENABLED!=='true')throw Error('OFFICIAL_SCHEDULE_DISABLED')
 const request=createSupabaseRest({env,fetchImpl,signal}),runner=createProgramTextCoordinator({env,fetchImpl,signal})
 if(options.concertId)return runner.run({concert_id:options.concertId,mode:options.mode})
 if(!options.daily)throw Error('OFFICIAL_SCOPE_REQUIRED')
 const conditions=collectionConditions(now()),client=createCollectionKopisClient({env,fetchImpl,signal})
 const collection=await collectConcerts({client,limit:1,dryRun:options.mode!=='SAVE',now,repository:{save:({concert,images})=>request('rpc/sync_kopis_concert',{body:{p_concert:concert,p_images:images}})}})
 if(collection.failed)throw Error('OFFICIAL_COLLECTION_FAILED')
 const response=await request('concerts',{params:{select:'id,kopis_detail_text,kopis_detail_text_hash',region:'eq.'+conditions.region,start_date:'lte.'+conditions.to,end_date:'gte.'+conditions.from,performance_status:'in.(공연예정,공연중)',order:'start_date.asc,id.asc',limit:'100'}})
 if(!Array.isArray(response)||response.length>100)throw Error('OFFICIAL_SOURCE_RESPONSE_INVALID')
 const {routeProgramSource}=await import('./programSourceRouter.mjs')
 const chosen=response.find(c=>routeProgramSource(c).source_kind==='KOPIS_DETAIL_TEXT')
 const collectionCounts={normalized:collection.normalized,saved:collection.saved}
 if(!chosen)return {mode:options.mode,status:'SKIPPED',reason:'NO_OFFICIAL_PROGRAM_IN_BOUNDED_SELECTION',collection:collectionCounts}
 return {...await runner.run({concert_id:chosen.id,mode:options.mode}),collection:collectionCounts}
}
