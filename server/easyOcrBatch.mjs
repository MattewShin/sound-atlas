import { randomUUID } from 'node:crypto'
import { CollectionError } from './collectionHttp.mjs'
import { collectionConditions } from './concertCollectionConfig.mjs'
import { EASYOCR_PIPELINE_VERSION, EASYOCR_SETTINGS } from './easyOcrConfig.mjs'

const makeAttempt = ({ image, id, startedAt, finishedAt, hash, status, errorCode = null }) => ({
  id, image_id: image.id, source_url: image.source_url, content_sha256: hash || null,
  pipeline_version: EASYOCR_PIPELINE_VERSION, status, error_code: errorCode,
  started_at: new Date(startedAt).toISOString(), finished_at: new Date(finishedAt).toISOString(),
  duration_ms: Math.max(0, finishedAt - startedAt),
})

const processImage = async (image, { repository, download, worker, dryRun, force, now, signal, onProgress, onCached, check }) => {
  const outcome = { attempted: 0, recognized: 0, saved: 0, cached: 0, held: 0 }
  const startedAt = now(), id = randomUUID()
  let downloaded, result, rejectedHash, stage = 'download'
  const attempt = (status, errorCode) => makeAttempt({ image, id, startedAt, finishedAt: now(),
    hash: downloaded?.contentHash || rejectedHash, status, errorCode })
  try {
    check()
    onProgress({ event: 'image_start', imageId: image.id, kopisId: image.concerts.kopis_id })
    downloaded = await download(image.source_url)
    check()
    if (downloaded.held) {
      onProgress({ event: 'image_held_unchanged', imageId: image.id })
      return { ...outcome, held: 1 }
    }
    stage = 'cache'
    // Hash current bytes even for known URLs; a changed image must be recognized again.
    const cached = !dryRun && !force && await repository.findResult(image.id, downloaded.contentHash)
    check()
    if (cached) {
      await onCached?.({ image, cached, downloaded, startedAt, finishedAt: now() })
      onProgress({ event: 'cached', imageId: image.id })
      return { ...outcome, cached: 1 }
    }
    outcome.attempted = 1
    stage = 'recognize'
    check()
    result = await worker.recognize(downloaded, { signal })
    outcome.recognized = 1
  } catch (error) {
    if (signal?.aborted || error.code === 'BATCH_INTERRUPTED') return { ...outcome, cancelled: true }
    try { check() } catch (boundary) {
      if(signal?.aborted||boundary.code==='BATCH_INTERRUPTED')return {...outcome,cancelled:true}
      throw boundary
    }
    outcome.attempted = 1
    const failure = { imageId: image.id, kopisId: image.concerts.kopis_id, stage,
      code: error instanceof CollectionError ? error.code : 'EASYOCR_FAILED',
      reason: error instanceof CollectionError ? error.message : 'Image OCR failed (raw error suppressed)' }
    if (error instanceof CollectionError && error.code === 'OCR_IMAGE_LIMIT_EXCEEDED' && error.imageLimit) {
      failure.imageLimit = { ...error.imageLimit, attemptId: id }
      rejectedHash = error.imageLimit.contentHash
    }
    if (!dryRun) {
      try { await repository.saveAttempt(attempt('FAILED', failure.code), null) }
      catch (saveError) { failure.persistenceError = saveError instanceof CollectionError ? saveError.code : 'OCR_SAVE_FAILED' }
    }
    onProgress({ event: 'image_failed', ...failure })
    return { ...outcome, failure }
  }

  if (!dryRun) {
    try {
      check()
      await repository.saveAttempt(attempt('SUCCEEDED'), { ...result, settings: EASYOCR_SETTINGS })
      outcome.saved = 1
    } catch (error) {
      if(signal?.aborted||error.code==='BATCH_INTERRUPTED')return {...outcome,cancelled:true}
      outcome.failure = { imageId: image.id, kopisId: image.concerts.kopis_id, stage: 'save',
        code: error instanceof CollectionError ? error.code : 'OCR_SAVE_FAILED', reason: 'OCR succeeded but DB result write failed' }
    }
  }
  outcome.preview = { imageId: image.id, kopisId: image.concerts.kopis_id,
    contentHash: downloaded.contentHash, width: result.width, height: result.height, saved: outcome.saved === 1,
    characters: result.raw_text.length, detections: result.detections.length,
    meanConfidence: result.mean_confidence, textPreview: result.raw_text.slice(0, 600) }
  onProgress({ event: 'image_complete', imageId: image.id, characters: result.raw_text.length, saved: outcome.saved === 1 })
  return outcome
}

export const runEasyOcrBatch = async ({ repository, download, worker, limit = 3, dryRun = false, listOnly = false,
  force = false, now = Date.now, signal, onProgress = () => {}, onCached, check = () => {} }) => {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new CollectionError('INVALID_LIMIT', 'limit must be a positive safe integer')
  const started = now()
  const report = { conditions: collectionConditions(started), imageType: 'DETAIL', pipelineVersion: EASYOCR_PIPELINE_VERSION,
    limit, limitedSample: true, dryRun, listOnly, force, scanned: 0, attempted: 0, recognized: 0, saved: 0,
    cached: 0, held: 0, failures: [], preview: [], limitReached: false, cancelled: false }
  try {
    if (!dryRun && !listOnly) await repository.preflight()
    for await (const image of repository.candidates({ now: started })) {
      if (signal?.aborted) { report.cancelled = true; break }
      report.scanned++
      if (listOnly) {
        if (report.preview.length < 3) report.preview.push({ imageId: image.id, kopisId: image.concerts.kopis_id, sourceUrl: image.source_url })
        if (report.scanned >= limit) { report.limitReached = true; break }
        continue
      }
      const outcome = await processImage(image, { repository, download, worker, dryRun, force, now, signal, onProgress, onCached, check })
      for (const count of ['attempted', 'recognized', 'saved', 'cached', 'held']) report[count] += outcome[count]
      if (outcome.failure) report.failures.push(outcome.failure)
      if (outcome.preview && report.preview.length < 3) report.preview.push(outcome.preview)
      if (outcome.cancelled) { report.cancelled = true; break }
      if (report.attempted >= limit) { report.limitReached = true; break }
    }
  } finally { worker?.close() }
  report.failed = report.failures.length
  return report
}
