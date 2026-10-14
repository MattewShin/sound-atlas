import { createKopisService } from '../server/kopis.mjs'
import { createProgramOcrService } from '../server/programOcr.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
let service
try {
  let imageDownloads = 0, apiCalls = 0
  const ocr = createProgramOcrService({ fetchImpl: (...args) => { imageDownloads += 1; return fetch(...args) } })
  service = createKopisService({ ocrService: ocr, fetchImpl: (...args) => { apiCalls += 1; return fetch(...args) } })
  if (!service.config().configured) throw new Error('KOPIS_NOT_CONFIGURED')
  const started = performance.now()
  const first = await service.matchBatch({ targetTrackId: 'chopin-ballade-op23-no1', kopisIds: ['PF302595'], refresh: true })
  const firstMs = Math.round(performance.now() - started)
  const before = { imageDownloads, apiCalls }, secondStart = performance.now()
  const other = await service.matchBatch({ targetTrackId: 'rachmaninoff-prelude-op3-no2', kopisIds: ['PF302595'] })
  const reuseMs = Math.round(performance.now() - secondStart)
  const record = first.results[0].concert
  console.log(JSON.stringify({ firstMs, reuseMs, imageDownloads, additionalImageDownloads: imageDownloads - before.imageDownloads, additionalApiCalls: apiCalls - before.apiCalls,
    id: record.kopisId, title: record.title, state: record.targetMatch.status, evidence: record.targetMatch.evidence,
    context: record.programOcr.context, images: record.programOcr.records.map((image) => ({ sourceUrl: image.sourceUrl, status: image.status, elapsedMs: image.elapsedMs, role: image.role,
      confidence: image.original?.confidence, textCharacters: image.original?.text?.length,
      links: image.links, reviewRequired: image.reviewRequired, failureCode: image.failureCode })), otherState: other.results[0].concert.targetMatch.status }))
  await mkdir('data/kopis-ocr-live.local', { recursive: true })
  await writeFile('data/kopis-ocr-live.local/verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), firstMs, reuseMs, first, other, before, after: { imageDownloads, apiCalls } }, null, 2))
  await service.close()
  const restarted = createKopisService()
  const restartStart = performance.now()
  const fromDisk = await restarted.cachedMatches({ targetTrackId: 'chopin-ballade-op23-no1', kopisIds: ['PF302595'] })
  console.log(JSON.stringify({ restartCacheMs: Math.round(performance.now() - restartStart), restartState: fromDisk.results[0]?.concert.targetMatch.status, restartFromCache: fromDisk.results[0]?.fromCache }))
} catch (error) { console.log(JSON.stringify({ success: false, code: error.code || 'LIVE_OCR_VALIDATION_FAILED' })); process.exitCode = 1 }
finally { await service?.close() }
