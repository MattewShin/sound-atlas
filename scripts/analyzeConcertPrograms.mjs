import { createProgramAnalysisStore, analyzeProgramTargets } from '../server/supabaseProgramAnalysis.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { readFile } from 'node:fs/promises'
import { MATCHER_VERSION, CATALOG_HASH } from '../server/programAnalysis.mjs'
import { validateProgramManifest } from '../server/programCanary.mjs'

export const parseProgramArgs = (args) => {
  const result = { command: args[0] || 'help' }
  if (!['help', 'targets', 'analyze', 'snapshots', 'list', 'show', 'confirm', 'reject'].includes(result.command)) throw new Error('UNKNOWN_COMMAND')
  let index = 1
  if (['show', 'confirm', 'reject'].includes(result.command)) {
    result.id = args[index++]
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id || '')) throw new Error('CANDIDATE_UUID_REQUIRED')
  }
  while (index < args.length) {
    const flag = args[index++]
    if (flag === '--kopis-id') {
      result.kopisId = args[index++]
      if (!/^PF\d{1,12}$/.test(result.kopisId || '')) throw new Error('KOPIS_ID_INVALID')
    } else if(flag==='--ocr-manifest') {result.manifestPath=args[index++];if(!result.manifestPath)throw new Error('OCR_MANIFEST_PATH_REQUIRED')}
    else if(flag==='--version') {result.version=args[index++];if(!/^stored-program-\d+$/.test(result.version||''))throw new Error('READ_VERSION_INVALID')}
    else if(flag==='--include-inactive')result.includeInactive=true
    else if (flag === '--save') result.save = true
    else if (flag === '--dry-run') result.dryRun = true
    else if (flag === '--note') result.note = args[index++]
    else if (flag === '--analysis-id') result.analysisId = args[index++]
    else throw new Error('UNKNOWN_ARGUMENT')
  }
  if (result.save && result.dryRun) throw new Error('SAVE_AND_DRY_RUN_CONFLICT')
  if (result.command !== 'analyze' && (result.save || result.dryRun)) throw new Error('ANALYZE_FLAGS_ONLY')
  if(result.manifestPath&&(!['targets','analyze','snapshots'].includes(result.command)||result.kopisId))throw new Error('MANIFEST_SCOPE_CONFLICT')
  if(result.command==='snapshots'&&!result.manifestPath)throw new Error('OCR_MANIFEST_PATH_REQUIRED')
  if(result.version&&!['list','snapshots'].includes(result.command)||result.includeInactive&&result.command!=='list')throw new Error('READ_VERSION_FLAGS_ONLY')
  if (['confirm', 'reject'].includes(result.command)) {
    if (!result.note?.trim() || result.note.length > 2000) throw new Error('REVIEW_NOTE_REQUIRED_MAX_2000')
    if (!/^[0-9a-f-]{36}$/i.test(result.analysisId || '')) throw new Error('COPY_ANALYSIS_ID_FROM_SHOW')
  }
  return result
}

const help = `Stored OCR analysis (no downloads or OCR execution):
npm run program:analyze -- targets [--kopis-id PF296289]
npm run program:analyze -- analyze --dry-run [--kopis-id PF296289]
npm run program:analyze -- analyze --save [--kopis-id PF296289]
npm run program:analyze -- analyze --dry-run --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
npm run program:analyze -- analyze --save --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
npm run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json [--version stored-program-3]
npm run program:analyze -- list [--kopis-id PF296289] [--version stored-program-2 --include-inactive]
npm run program:analyze -- show <candidate-uuid>
npm run program:analyze -- confirm <candidate-uuid> --analysis-id <analysis-uuid-from-show> --note "Checked original source"
npm run program:analyze -- reject <candidate-uuid> --analysis-id <analysis-uuid-from-show> --note "Reason"
All automatic candidates are REVIEW_REQUIRED. Inspect show and original image before review.
Reviewer is an unauthenticated local service-role operator, not a logged-in app user.
Current extraction/grouping/matcher version: ${MATCHER_VERSION}. v3 saving requires the reviewed v3 SQL draft; dry-run uses GET only.`

export const runProgramCli = async (args, { store, print = console.log } = {}) => {
  const opts = parseProgramArgs(args)
  if (opts.command === 'help') { print(help); return }
  if(opts.manifestPath)opts.manifest=validateProgramManifest(JSON.parse(await readFile(opts.manifestPath,'utf8')))
  store ||= createProgramAnalysisStore()
  let output
  if (opts.command === 'targets') {
    const scope = opts.manifest?await store.manifestTargets(opts.manifest):await store.targets(opts.kopisId)
    output = { ...scope,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH, limited_sample: true, targets: scope.targets.map(({ concert, image, ocr }) => ({ kopis_id: concert.kopis_id,
      title: concert.title, image_id: image.id, ocr_result_id: ocr.id, source_url: image.source_url, characters: ocr.raw_text.length })) }
  } else if (opts.command === 'analyze') output = await analyzeProgramTargets(store, opts)
  else if (opts.command === 'snapshots')output=await store.snapshots(opts.manifest,{version:opts.version||MATCHER_VERSION})
  else if (opts.command === 'list') output = {matcher_version:opts.version||MATCHER_VERSION,local_matcher_version:MATCHER_VERSION,candidates:await store.candidates(opts.kopisId,opts)}
  else if (opts.command === 'show') {
    output = await store.detail(opts.id)
    output.local_matcher_version=MATCHER_VERSION
    output.track = output.track_id ? getTrackTarget(output.track_id) : null
  } else {
    const candidate = await store.detail(opts.id)
    if (!candidate.local_version_current) throw new Error('REANALYZE_WITH_CURRENT_CATALOG_AND_MATCHER')
    if (candidate.analysis_id !== opts.analysisId) throw new Error('ANALYSIS_CHANGED_RUN_SHOW_AGAIN')
    if (opts.command === 'confirm' && (!candidate.track_id || !getTrackTarget(candidate.track_id) || candidate.stale_reason)) throw new Error('CANNOT_CONFIRM_UNREGISTERED_OR_STALE_EVIDENCE')
    output = await store.review(opts.id, opts.command === 'confirm' ? 'CONFIRMED' : 'REJECTED', opts.note.trim(), opts.analysisId)
  }
  print(JSON.stringify(output, null, 2))
  if (output?.failures?.length || opts.manifest&&output?.skipped?.length) process.exitCode = 1
  return output
}

