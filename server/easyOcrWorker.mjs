import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CollectionError } from './collectionHttp.mjs'
import { EASYOCR_ENGINE_VERSION, EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'

const protocolError = () => new CollectionError('OCR_WORKER_PROTOCOL', 'Invalid EasyOCR worker response')
export const validateEasyOcrResult = (value, image) => {
  if (!value || value.pipelineVersion !== EASYOCR_PIPELINE_VERSION || value.engineVersion !== EASYOCR_ENGINE_VERSION
    || value.width !== image.width || value.height !== image.height || typeof value.torchVersion !== 'string'
    || typeof value.text !== 'string' || value.text.length > 1_000_000
    || !Array.isArray(value.detections) || value.detections.length > 10000) throw protocolError()
  const detections = value.detections.map((item) => {
    if (typeof item.text !== 'string' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1
      || !Array.isArray(item.bbox) || item.bbox.length !== 4 || item.bbox.some((point) => !Array.isArray(point)
        || point.length !== 2 || !point.every(Number.isFinite) || point[0] < 0 || point[1] < 0 || point[0] > image.width || point[1] > image.height)) throw protocolError()
    return { text: item.text, confidence: item.confidence, bbox: item.bbox }
  })
  const mean = detections.length ? detections.reduce((sum, item) => sum + item.confidence, 0) / detections.length : null
  if (value.text !== detections.map((item) => item.text).join('\n')
    || (mean === null ? value.meanConfidence !== null : !Number.isFinite(value.meanConfidence) || Math.abs(mean - value.meanConfidence) > 0.000001)) throw protocolError()
  return { raw_text: value.text, detections, mean_confidence: mean, width: image.width, height: image.height,
    engine_version: value.engineVersion, torch_version: value.torchVersion }
}

export const createEasyOcrWorker = ({ config, spawnImpl = spawn } = {}) => {
  let child, pending, closed = false
  const stop = (error = new CollectionError('OCR_WORKER_STOPPED', 'EasyOCR worker stopped')) => {
    const current = child; child = undefined
    if (pending) { const job = pending; pending = undefined; clearTimeout(job.timer); job.reject(error) }
    current?.kill()
  }
  const start = () => {
    if (child) return child
    const env = {}
    for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) {
      if (process.env[name]) env[name] = process.env[name]
    }
    Object.assign(env, { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2',
      EASYOCR_TEMP_DIR: config.tempDirectory, EASYOCR_MODEL_DIR: join(config.cacheDirectory, 'models'),
      EASYOCR_USER_DIR: join(config.cacheDirectory, 'user_network'), EASYOCR_MODULE_PATH: config.cacheDirectory,
      TORCH_HOME: join(config.cacheDirectory, 'torch'), EASYOCR_MAX_PIXELS: String(config.maxPixels) })
    const processChild = spawnImpl(config.python, ['-u', fileURLToPath(new URL('../python/easyocr/worker.py', import.meta.url))],
      { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    child = processChild
    let output = ''
    processChild.stdout.setEncoding('utf8')
    processChild.stdout.on('data', (part) => {
      if (child !== processChild) return
      output += part
      if (Buffer.byteLength(output) > 4_000_000) { stop(protocolError()); return }
      let newline
      while ((newline = output.indexOf('\n')) !== -1) {
        const line = output.slice(0, newline); output = output.slice(newline + 1)
        try {
          const value = JSON.parse(line)
          if (!pending || value.id !== pending.id || typeof value.ok !== 'boolean') throw protocolError()
          const job = pending; pending = undefined; clearTimeout(job.timer)
          if (value.ok) job.resolve(value)
          else {
            const codes = new Set(['EASYOCR_INPUT_INVALID', 'EASYOCR_DEPENDENCY_FAILED', 'EASYOCR_MODEL_INIT_FAILED', 'EASYOCR_RECOGNITION_FAILED'])
            job.reject(new CollectionError(codes.has(value.code) ? value.code : 'EASYOCR_RECOGNITION_FAILED', 'EasyOCR failed; verify dependencies and local model files'))
          }
        } catch { stop(protocolError()); return }
      }
    })
    // Drain dependency/model warnings without exposing paths or raw error text.
    processChild.stderr.on('data', () => {})
    processChild.on('error', () => { if (child === processChild) stop(new CollectionError('EASYOCR_PYTHON_UNAVAILABLE', 'Could not start EASYOCR_PYTHON; install the local environment')) })
    processChild.stdin.on('error', () => { if (child === processChild) stop(new CollectionError('OCR_WORKER_EXITED', 'EasyOCR worker input closed')) })
    processChild.on('exit', () => { if (child === processChild) stop(new CollectionError('OCR_WORKER_EXITED', 'EasyOCR worker exited unexpectedly')) })
    return processChild
  }
  return {
    async recognize(image, { signal } = {}) {
      if (closed) throw new CollectionError('OCR_WORKER_STOPPED', 'EasyOCR worker is closed')
      if (pending) throw new CollectionError('OCR_WORKER_BUSY', 'Only sequential recognition is supported')
      signal?.throwIfAborted()
      await mkdir(config.tempDirectory, { recursive: true })
      const id = randomUUID(), path = join(config.tempDirectory, id + '.png')
      const aborted = () => stop(new CollectionError('OCR_ABORTED', 'OCR was cancelled'))
      try {
        await writeFile(path, image.buffer)
        const processChild = start()
        const job = new Promise((resolve, reject) => {
          pending = { id, resolve, reject, timer: setTimeout(() => stop(new CollectionError('EASYOCR_TIMEOUT', 'EasyOCR image timeout exceeded')), config.timeoutMs) }
          signal?.addEventListener('abort', aborted, { once: true })
          if (signal?.aborted) { aborted(); return }
          processChild.stdin.write(JSON.stringify({ id, path }) + '\n')
        })
        return validateEasyOcrResult(await job, image)
      } finally {
        signal?.removeEventListener('abort', aborted)
        await unlink(path).catch(() => {})
      }
    },
    close() { closed = true; stop() },
  }
}
