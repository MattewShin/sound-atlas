// Implementation identity is not an operator-selectable label for old algorithms.
export const PROGRAM_IMPLEMENTATION_VERSION='stored-program-4'
export const PROGRAM_ANALYSIS_SAVE_RPC='save_concert_program_analysis_v4'
export const PROGRAM_ANALYSIS_MIGRATION_REQUIRED='PROGRAM_ANALYSIS_V4_MIGRATION_REQUIRED'
export const PROGRAM_ROLLOUT_DEFAULTS=Object.freeze({writeVersion:'stored-program-4',reviewVersion:'stored-program-3',searchVersion:'stored-program-2',scheduleEnabled:false})
const configured=(env,name,fallback)=>Object.hasOwn(env,name)?String(env[name]??'').trim():fallback
const version=(env,name,fallback,allowed)=>{
  const value=configured(env,name,fallback)
  if(!allowed.includes(value))throw Object.assign(new Error(name+'_INVALID'),{code:name+'_INVALID'})
  return value
}
export const getProgramWriteVersion=(env=process.env)=>version(env,'PROGRAM_ANALYSIS_WRITE_VERSION',PROGRAM_ROLLOUT_DEFAULTS.writeVersion,[PROGRAM_IMPLEMENTATION_VERSION])
export const getProgramReviewVersion=(env=process.env)=>version(env,'PROGRAM_REVIEW_VERSION',PROGRAM_ROLLOUT_DEFAULTS.reviewVersion,['stored-program-2','stored-program-3','stored-program-4'])
export const getProgramSearchVersion=(env=process.env)=>version(env,'PROGRAM_SEARCH_VERSION',PROGRAM_ROLLOUT_DEFAULTS.searchVersion,['stored-program-2','stored-program-3','stored-program-4'])
export const getProgramScheduleEnabled=(env=process.env)=>{
  const value=configured(env,'PROGRAM_ANALYSIS_SCHEDULE_ENABLED','false')
  if(!['true','false'].includes(value))throw Object.assign(new Error('PROGRAM_ANALYSIS_SCHEDULE_ENABLED_INVALID'),{code:'PROGRAM_ANALYSIS_SCHEDULE_ENABLED_INVALID'})
  return value==='true'
}
export const getProgramRollout=(env=process.env)=>({writeVersion:getProgramWriteVersion(env),reviewVersion:getProgramReviewVersion(env),searchVersion:getProgramSearchVersion(env),scheduleEnabled:getProgramScheduleEnabled(env)})
