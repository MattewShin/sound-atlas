import { createProgramAnalysisStore, analyzeProgramTargets } from '../server/supabaseProgramAnalysis.mjs'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { readFile } from 'node:fs/promises'
import { MATCHER_VERSION, CATALOG_HASH } from '../server/programAnalysis.mjs'
import { validateProgramManifest } from '../server/programCanary.mjs'
import {getProgramRollout,getProgramReviewVersion} from '../server/programRollout.mjs'
import {rematchProgramCandidates} from '../server/programRematch.mjs'
import {backfillProgramIdentities} from '../server/programIdentityBackfill.mjs'

export const parseProgramArgs = (args) => {
  const result = { command: args[0] || 'help' }
  if (!['help','config','preflight', 'targets', 'analyze', 'rematch','identity-backfill','snapshots', 'list', 'show', 'confirm', 'reject'].includes(result.command)) throw new Error('UNKNOWN_COMMAND')
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
    else if(flag==='--git-ref'){result.gitRef=args[index++];if(!/^[a-f0-9]{40}$/.test(result.gitRef||''))throw new Error('VERIFIED_FULL_GIT_COMMIT_REQUIRED')}
    else if(flag==='--identity-manifest'){result.identityManifestPath=args[index++];if(!result.identityManifestPath)throw new Error('IDENTITY_MANIFEST_PATH_REQUIRED')}
    else if (flag === '--save') result.save = true
    else if (flag === '--dry-run') result.dryRun = true
    else if (flag === '--note') result.note = args[index++]
    else if (flag === '--analysis-id') result.analysisId = args[index++]
    else throw new Error('UNKNOWN_ARGUMENT')
  }
  if (result.save && result.dryRun) throw new Error('SAVE_AND_DRY_RUN_CONFLICT')
  if (!['analyze','rematch','identity-backfill'].includes(result.command) && (result.save || result.dryRun)) throw new Error('ANALYZE_FLAGS_ONLY')
  if(result.manifestPath&&(!['targets','analyze','snapshots','rematch'].includes(result.command)||result.kopisId))throw new Error('MANIFEST_SCOPE_CONFLICT')
  if(result.command==='snapshots'&&!result.manifestPath)throw new Error('OCR_MANIFEST_PATH_REQUIRED')
  if(result.version&&!['analyze','rematch','list','snapshots'].includes(result.command)||result.includeInactive&&result.command!=='list')throw new Error('READ_VERSION_FLAGS_ONLY')
  if(['analyze','rematch'].includes(result.command)&&result.save&&(!result.manifestPath||result.version!=='stored-program-3'))throw new Error('V3_SAVE_REQUIRES_MANIFEST_AND_EXPLICIT_VERSION')
  if(['analyze','rematch'].includes(result.command)&&result.version&&result.version!=='stored-program-3')throw new Error('WRITE_VERSION_NOT_IMPLEMENTED')
  if((result.gitRef||result.identityManifestPath)&&result.command!=='identity-backfill')throw new Error('IDENTITY_BACKFILL_FLAGS_ONLY')
  if(result.command==='identity-backfill'&&result.save&&!result.identityManifestPath)throw new Error('EXACT_IDENTITY_MANIFEST_REQUIRED')
  if (['confirm', 'reject'].includes(result.command)) {
    if (!result.note?.trim() || result.note.length > 2000) throw new Error('REVIEW_NOTE_REQUIRED_MAX_2000')
    if (!/^[0-9a-f-]{36}$/i.test(result.analysisId || '')) throw new Error('COPY_ANALYSIS_ID_FROM_SHOW')
  }
  return result
}

const help = `Stored OCR analysis (no downloads or OCR execution):
npm run program:analyze -- targets [--kopis-id PF296289]
npm run program:analyze -- analyze --dry-run [--kopis-id PF296289]
npm run program:analyze -- analyze --dry-run --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
npm run program:analyze -- analyze --save --version stored-program-3 --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json
npm run program:analyze -- config
npm run program:analyze -- preflight
npm run program:analyze -- rematch --dry-run [--kopis-id PF295548]
npm run program:analyze -- rematch --save --version stored-program-3 --ocr-manifest <pinned-ocr-manifest>
npm run program:analyze -- identity-backfill --dry-run --kopis-id PF295548 --git-ref <full-reviewed-git-sha>
npm run program:analyze -- identity-backfill --save --identity-manifest <reviewed-dry-run-json>
npm run program:analyze -- snapshots --ocr-manifest docs/PROGRAM_ANALYSIS_INITIAL_CANARY.json [--version stored-program-3]
npm run program:analyze -- list [--kopis-id PF296289] [--version stored-program-2 --include-inactive]
npm run program:analyze -- show <candidate-uuid>
npm run program:analyze -- confirm <candidate-uuid> --analysis-id <analysis-uuid-from-show> --note "Checked original source"
npm run program:analyze -- reject <candidate-uuid> --analysis-id <analysis-uuid-from-show> --note "Reason"
Analysis saving creates intermediate candidates. The daily pipeline automatically confirms or completes them unlinked.
Use npm run program:auto -- --dry-run for observation; no operator approval is required.
confirm/reject remain legacy diagnostic commands, not the normal operating procedure.
Current extraction/grouping/matcher version: ${MATCHER_VERSION}. v3 saving requires the reviewed v3 SQL draft; dry-run uses GET only.`

export const runProgramCli = async (args, { store, print = console.log,env=process.env } = {}) => {
  const opts = parseProgramArgs(args)
  if (opts.command === 'help') { print(help); return }
  if(opts.command==='config'){const config={implementation_version:MATCHER_VERSION,...getProgramRollout(env)};print(JSON.stringify(config,null,2));return config}
  if(opts.manifestPath)opts.manifest=validateProgramManifest(JSON.parse(await readFile(opts.manifestPath,'utf8')))
  if(opts.identityManifestPath)opts.identityManifest=JSON.parse(await readFile(opts.identityManifestPath,'utf8'))
  store ||= createProgramAnalysisStore({env})
  let output
  if(opts.command==='preflight')output={...await store.preflightSave(),rollout:getProgramRollout(env),db_writes:0}
  else if (opts.command === 'targets') {
    const scope = opts.manifest?await store.manifestTargets(opts.manifest):await store.targets(opts.kopisId)
    output = { ...scope,matcher_version:MATCHER_VERSION,catalog_hash:CATALOG_HASH, limited_sample: true, targets: scope.targets.map(({ concert, image, ocr,attempt }) => ({ kopis_id: concert.kopis_id,
      title: concert.title, image_id: image.id, ocr_result_id: ocr.id,source_attempt_id:attempt.id,image_revision:image.evidence_revision||0,concert_revision:concert.program_context_revision||0, source_url: image.source_url, characters: ocr.raw_text.length })) }
  } else if (opts.command === 'analyze') output = await analyzeProgramTargets(store, {...opts,env})
  else if (opts.command === 'snapshots')output=await store.snapshots(opts.manifest,{version:getProgramReviewVersion({PROGRAM_REVIEW_VERSION:opts.version||getProgramReviewVersion(env)})})
  else if(opts.command==='rematch')output=await rematchProgramCandidates(store,opts)
  else if(opts.command==='identity-backfill')output=await backfillProgramIdentities(store,opts)
  else if (opts.command === 'list') {const version=getProgramReviewVersion({PROGRAM_REVIEW_VERSION:opts.version||getProgramReviewVersion(env)});output = {matcher_version:version,review_version:version,local_matcher_version:MATCHER_VERSION,candidates:await store.candidates(opts.kopisId,{...opts,version})}}
  else if (opts.command === 'show') {
    output = await store.detail(opts.id)
    output.local_matcher_version=MATCHER_VERSION
    output.track = output.track_id ? getTrackTarget(output.track_id) : null
  } else {
    const candidate = await store.detail(opts.id)
    if (candidate.matcher_version!==(candidate.review_version||getProgramReviewVersion(env))) throw new Error('REVIEW_VERSION_MISMATCH')
    if (opts.command==='confirm'&&!candidate.local_version_current) throw new Error('WORK_IDENTITY_CHANGED_OR_REMOVED')
    if (candidate.analysis_id !== opts.analysisId) throw new Error('ANALYSIS_CHANGED_RUN_SHOW_AGAIN')
    if (opts.command === 'confirm' && (!candidate.track_id || !getTrackTarget(candidate.track_id) || candidate.stale_reason)) throw new Error('CANNOT_CONFIRM_UNREGISTERED_OR_STALE_EVIDENCE')
    output = await store.review(opts.id, opts.command === 'confirm' ? 'CONFIRMED' : 'REJECTED', opts.note.trim(), opts.analysisId)
  }
  print(JSON.stringify(output, null, 2))
  if (output?.failures?.length || opts.manifest&&output?.skipped?.length) process.exitCode = 1
  return output
}

