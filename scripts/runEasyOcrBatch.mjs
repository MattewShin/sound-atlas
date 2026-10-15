import { CollectionError } from '../server/collectionHttp.mjs'
import { getEasyOcrConfig, parseEasyOcrArgs } from '../server/easyOcrConfig.mjs'
import { createSupabaseOcr } from '../server/supabaseOcr.mjs'
import { downloadKopisImage } from '../server/kopisImageDownload.mjs'
import { createEasyOcrWorker } from '../server/easyOcrWorker.mjs'
import { runEasyOcrBatch } from '../server/easyOcrBatch.mjs'

const controller = new AbortController()
const cancel = () => controller.abort()
process.once('SIGINT', cancel)
try {
  const options = parseEasyOcrArgs(process.argv.slice(2))
  if (options.help) console.log('npm run ocr:batch -- [--list] [--dry-run] [--limit N] [--force]\n활성 DETAIL 이미지 / 기본 신규 OCR 최대 3장 / ko,en CPU 순차 처리. dry-run도 실제 OCR을 실행하며 DB에는 쓰지 않습니다.')
  else {
    const config = getEasyOcrConfig()
    const report = await runEasyOcrBatch({ ...options, repository: createSupabaseOcr(),
      download: (url) => downloadKopisImage(url, { config }), worker: options.listOnly ? undefined : createEasyOcrWorker({ config }),
      signal: controller.signal, onProgress: (entry) => console.log(JSON.stringify(entry)),
    })
    console.log('제한된 이미지 표본 OCR 결과 (프로그램·작품 포함 여부를 확정하지 않습니다):')
    console.log(JSON.stringify(report, null, 2))
    if (report.failed || report.cancelled) process.exitCode = report.cancelled ? 130 : 1
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'failed', code: error instanceof CollectionError ? error.code : 'EASYOCR_BATCH_FAILED',
    reason: error instanceof CollectionError ? error.message : 'Batch failed (raw error suppressed)' }))
  process.exitCode = 1
} finally { process.removeListener('SIGINT', cancel) }
