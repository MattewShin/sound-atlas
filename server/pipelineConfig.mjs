export const PIPELINE_DEFAULTS = Object.freeze({ cleanupLimit: 100, collectLimit: 10, ocrLimit: 3, analysisLimit: 10, automaticImageLimit:3, automaticCandidateLimit:30,
  listPages: 4, dbPages: 20, imageChecks: 10, maxSeconds: 900, recheckHours: 24 })
export const PIPELINE_PROFILES = Object.freeze({
  initial:{collectLimit:20,ocrLimit:20,analysisLimit:20,imageChecks:40,maxSeconds:1800},
  daily:{collectLimit:10,ocrLimit:20,analysisLimit:20,imageChecks:40,maxSeconds:1800},
  'analysis-only':{analysisOnly:true,analysisLimit:40,maxSeconds:600},
})
export const pipelineError = code => Object.assign(new Error(code), { code })
export const parsePipelineArgs = args => {
  const command = args[0] || 'help'
  if (!['run','plan','latest','help'].includes(command)) throw pipelineError('INVALID_COMMAND')
  let profile='custom'
  for(let i=1;i<args.length;i++){if(args[i]==='--profile')profile=args[++i];else if(args[i]!=='--analysis-only')i++}
  if(profile!=='custom'&&!PIPELINE_PROFILES[profile])throw pipelineError('INVALID_PROFILE')
  const options = { ...PIPELINE_DEFAULTS,...PIPELINE_PROFILES[profile] }
  const names = { 'cleanup-limit':'cleanupLimit','collect-limit':'collectLimit', 'ocr-limit':'ocrLimit', 'analysis-limit':'analysisLimit',
    'automatic-image-limit':'automaticImageLimit','automatic-candidate-limit':'automaticCandidateLimit',
    'list-pages':'listPages', 'db-pages':'dbPages', 'image-checks':'imageChecks', 'max-seconds':'maxSeconds', 'recheck-hours':'recheckHours' }
  for (let i=1;i<args.length;i++) {
    if(args[i]==='--profile'){i++;continue}
    if(args[i]==='--analysis-only'){options.analysisOnly=true;continue}
    if(args[i]==='--ocr-manifest'){options.ocrManifestPath=args[++i];if(!options.ocrManifestPath)throw pipelineError('OCR_MANIFEST_PATH_REQUIRED');continue}
    const key=names[args[i]?.replace(/^--/,'')], value=args[++i]
    if (!key || !/^[1-9]\d*$/.test(value||'') || !Number.isSafeInteger(Number(value))) throw pipelineError('INVALID_ARGUMENT')
    options[key]=Number(value)
  }
  if (options.cleanupLimit>1000 || options.collectLimit>1000 || options.ocrLimit>1000 || options.analysisLimit>1000 || options.listPages>100
    || options.dbPages>1000 || options.imageChecks>1000 || options.maxSeconds>7200 || options.maxSeconds<30 || options.recheckHours>720) throw pipelineError('LIMIT_OUT_OF_RANGE')
  options.imageChecks=Math.max(options.imageChecks,options.ocrLimit)
  if(options.analysisOnly&&!options.ocrManifestPath)throw pipelineError('ANALYSIS_ONLY_MANIFEST_REQUIRED')
  if(options.ocrManifestPath&&!options.analysisOnly)throw pipelineError('MANIFEST_REQUIRES_ANALYSIS_ONLY')
  return { command, options }
}
export const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code||'') ? error.code : 'BATCH_STEP_FAILED'
export const fatalCode = code => /^(SUPABASE_HTTP_(401|403|404)|KOPIS_AUTH_ERROR|KOPIS_HTTP_(401|403)|BATCH_SCHEMA_REQUIRED|CLEANUP_MIGRATION_REQUIRED|.*NOT_CONFIGURED|.*PYTHON.*|.*DEPENDENCY.*|.*MODEL.*)$/.test(code)
export const koreanTime = time => new Date(time+9*3600000).toISOString().replace('Z','+09:00')
export const serializePipelineReport = (value, env=process.env) => {
  const secrets=['KOPIS_SERVICE_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(k=>env[k]).filter(v=>v&&v.length>3)
  return JSON.stringify(value,(_key,v)=>{
    if(typeof v!=='string')return v
    for(const secret of secrets) v=v.split(secret).join('[REDACTED]')
    return v.replace(/([?&](?:service|apikey|access_token|token|key)=)[^\s&"']+/gi,'$1[REDACTED]')
  },2)
}
