// 実データ検証専用。候補 ID をサービスの自動判定に使用しません。
import { createWorker, PSM } from 'tesseract.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createKopisService } from '../server/kopis.mjs'
import { extractProgram, getExtractedWorkLinks } from '../server/programMatching.mjs'
await mkdir('.cache/ocr/languages', { recursive: true })
await mkdir('data/kopis-ocr-probe.local', { recursive: true })
let worker
try {
  const started = performance.now()
  const detail = await createKopisService().program('PF302595', true)
  worker = await createWorker(['eng', 'kor'], 1, { cachePath: '.cache/ocr/languages', logger: () => {} })
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
  const records = []
  for (const [index, sourceUrl] of detail.concert.programEvidence.imageUrls.entries()) {
    const imageResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!imageResponse.ok) throw new Error('IMAGE_DOWNLOAD_FAILED')
    const buffer = Buffer.from(await imageResponse.arrayBuffer())
    const imageStart = performance.now()
    const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true, tsv: true })
    const record = { sourceUrl, text: data.text, confidence: data.confidence, elapsedMs: Math.round(performance.now() - imageStart), blocks: data.blocks, tsv: data.tsv }
    record.extraction = extractProgram(data.text)
    record.links = getExtractedWorkLinks(record.extraction)
    records.push(record)
    await writeFile(`data/kopis-ocr-probe.local/image-${index + 1}.jpg`, buffer)
    console.log(JSON.stringify({ index, elapsedMs: record.elapsedMs, confidence: record.confidence, text: record.text, links: record.links }))
  }
  await writeFile('data/kopis-ocr-probe.local/probe.json', JSON.stringify({ concert: detail.concert, elapsedMs: Math.round(performance.now() - started), records }, null, 2))
} catch (error) { console.log(JSON.stringify({ success: false, code: error.code || 'OCR_PROBE_FAILED', message: error.message?.replace(/https?:\/\/\S+/g, '[source]') })); process.exitCode = 1 }
finally { await worker?.terminate() }
