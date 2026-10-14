import { createWorker, PSM } from 'tesseract.js'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getOcrConfig } from './ocrConfig.mjs'
import { extractProgram, getExtractedWorkLinks, identifyEntry } from './programMatching.mjs'
import { workCatalog, composerPatterns, workTypePatterns } from '../src/data/workCatalog.js'

export const OCR_VERSION = 'program-ocr-4'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const aborted = () => Object.assign(new Error('처리를 중단했어요.'), { code: 'ABORTED' })
const checkAbort = (signal) => { if (signal?.aborted) throw aborted() }
const deadline = async (job, milliseconds, signal, onStop = () => {}) => {
  checkAbort(signal)
  let timer, abortListener
  try {
    return await Promise.race([job(), new Promise((_, reject) => {
      timer = setTimeout(() => { void onStop(); reject(Object.assign(new Error('처리 시간 제한을 초과했어요.'), { code: 'OCR_TIMEOUT' })) }, milliseconds)
      abortListener = () => { void onStop(); reject(aborted()) }
      signal?.addEventListener('abort', abortListener, { once: true })
    })])
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abortListener) }
}
export const parseOcrWords = (tsv = '') => tsv.split('\n').slice(1).map((line) => line.split('\t'))
  .filter((columns) => columns[0] === '5' && columns.length >= 12).map((columns) => ({
    text: columns.slice(11).join('\t'), confidence: Number(columns[10]), x: Number(columns[6]), y: Number(columns[7]), width: Number(columns[8]), height: Number(columns[9]),
  }))
const variant = (data, preprocessing) => ({ preprocessing, text: data.text || '', confidence: data.confidence || 0,
  words: parseOcrWords(data.tsv), extraction: extractProgram(data.text || '') })
const criticalWords = (reading, entry, work) => {
  // 평균 신뢰도만 사용하지 않고 작품을 식별하는 단어와 숫자를 각각 확인합니다.
  const allWords = reading.words
  const typeRows = allWords.filter(({ text }) => workTypePatterns[work.type]?.test(text))
  const words = allWords.filter((word) => typeRows.some((row) => Math.abs(row.y - word.y) <= Math.max(row.height, word.height) * 3))
  const composerWords = allWords.filter(({ text }) => composerPatterns[work.composer]?.test(text))
  const typeWords = words.filter(({ text }) => workTypePatterns[work.type]?.test(text))
  const opusWords = words.filter(({ text }) => new RegExp(`^(?:(?:op|s)\\.?)?\\s*${work.opus ?? work.catalogueNumber}(?:\\D|$)`, 'i').test(text))
  const numberInEntry = entry.signature.match(/\bNo\.?\s*(\d+)/i)?.[1]
  const numberWords = numberInEntry ? words.filter(({ text }) => new RegExp(`^(?:nos?\\.?)?\\s*${numberInEntry}(?:\\D|$)`, 'i').test(text)) : []
  const seasonLabel = work.type === 'seasons' ? (
    new RegExp(`\\b${work.monthEn}\\b`, 'i').test(entry.signature) ? work.monthEn
      : work.aliases.find((alias) => entry.signature.toLowerCase().includes(alias.toLowerCase()))
  ) : undefined
  const seasonKeyword = seasonLabel?.split(/\s+/).filter((word) => word.length >= 3).at(-1)
  const seasonWords = seasonKeyword ? words.filter(({ text }) => text.toLowerCase().includes(seasonKeyword.toLowerCase())) : []
  return [composerWords, typeWords, opusWords, ...(numberInEntry ? [numberWords] : []), ...(seasonKeyword ? [seasonWords] : [])]
    .every((group) => group.some(({ confidence }) => confidence >= 85))
}
const numberSignature = (reading) => [...reading.extraction.programText.matchAll(/\b(?:op\.?|s\.)\s*(\d+)|\bno\.?\s*(\d+)/gi)].map((match) => match[0].toLowerCase().replace(/[\s.]/g, '')).sort().join('|')
export const assessOcrReadings = (original, preprocessed) => {
  const preamble = original.text.split(/\bprogram(?:me)?\b|프로그램/i)[0]
  if (/profile|biography|프로필|연주\s*경력|과거|지난\s*\d|previously/i.test(preamble)) return { role: 'biography', verifiedEntries: [], links: [], reviewRequired: original.confidence < 70 }
  if (!original.extraction.sectionFound) return { role: 'other', verifiedEntries: [], links: [], reviewRequired: original.confidence < 70 || !original.text.trim() }
  const stable = preprocessed?.extraction.sectionFound && numberSignature(original) === numberSignature(preprocessed)
  const verifiedEntries = []
  let rejectedKnownEntry = false
  for (const entry of original.extraction.entries) {
    for (const work of Object.values(workCatalog)) {
      const identity = identifyEntry(entry, work)
      if (identity.state !== 'identified') continue
      const counterpart = preprocessed?.extraction.entries.find((candidate) => {
        const other = identifyEntry(candidate, work)
        return other.state === 'identified' && JSON.stringify(other.scope) === JSON.stringify(identity.scope) && criticalWords(preprocessed, candidate, work)
      })
      if (stable && counterpart && criticalWords(original, entry, work)) verifiedEntries.push(entry)
      else rejectedKnownEntry = true
    }
  }
  return { role: 'program', verifiedEntries: [...new Set(verifiedEntries)], links: getExtractedWorkLinks({ entries: verifiedEntries }),
    reviewRequired: !stable || rejectedKnownEntry || original.confidence < 70 || preprocessed.confidence < 70,
    reviewReason: !stable ? '원본과 전처리 OCR의 작품·곡번호가 일치하지 않아요.' : rejectedKnownEntry ? '작품 식별에 필요한 단어나 숫자의 읽기 품질이 부족해요.' : undefined }
}

// 동일한 Node 프로세스에서 worker와 대기열을 공유하며 동시 worker는 1개입니다.
const runtimes = new Map()
function getRuntime(config) {
  const key = config.cacheDirectory + ':' + (config.langPath || '')
  if (runtimes.has(key)) return runtimes.get(key)
  let worker, queue = Promise.resolve(), waiting = 0, idleTimer, initializing, cancelInitialization, closing = Promise.resolve()
  const close = async () => { clearTimeout(idleTimer); cancelInitialization?.(); const previous = worker; worker = undefined; if (previous) closing = previous.terminate(); await closing }
  const recognize = async (buffer, signal) => {
    if (waiting >= 40) throw Object.assign(new Error('처리 대기 한도를 초과했어요.'), { code: 'OCR_QUEUE_FULL' })
    waiting += 1
    const previous = queue
    let release
    queue = new Promise((resolve) => { release = resolve })
    let acquired = false
    try {
      await deadline(() => previous, config.recognizeTimeoutMs * 2, signal)
      acquired = true
      checkAbort(signal); clearTimeout(idleTimer)
      await deadline(() => closing, config.recognizeTimeoutMs, signal)
      if (initializing) await deadline(() => initializing.catch(() => {}), 60_000, signal)
      if (!worker) {
        let languageCache = join(config.cacheDirectory, 'languages')
        try { await mkdir(languageCache, { recursive: true }) }
        catch { languageCache = join(tmpdir(), 'sound-atlas-ocr-languages'); await mkdir(languageCache, { recursive: true }) }
        let expired = false
        cancelInitialization = () => { expired = true }
        const creation = (async () => {
          const created = await createWorker(['eng', 'kor'], 1, { cachePath: languageCache, ...(config.langPath ? { langPath: config.langPath } : {}), logger: () => {}, errorHandler: () => {} })
          if (expired) { await created.terminate(); throw aborted() }
          return created
        })()
        initializing = creation
        void creation.finally(() => { if (initializing === creation) { initializing = null; cancelInitialization = null } }).catch(() => {})
        worker = await deadline(() => creation, 60_000, signal, () => { expired = true })
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
      }
      const result = await deadline(() => worker.recognize(buffer, {}, { text: true, tsv: true }), config.recognizeTimeoutMs, signal, close)
      idleTimer = setTimeout(() => { void close() }, 120_000); idleTimer.unref()
      return result.data
    } finally { waiting -= 1; if (acquired) release(); else void previous.finally(release) }
  }
  const runtime = { recognize, close }
  runtimes.set(key, runtime)
  return runtime
}
export const createProgramOcrService = ({ env = process.env, fetchImpl = fetch, now = Date.now, recognizeImpl } = {}) => {
  const config = getOcrConfig(env)
  const memory = new Map(), pending = new Map()
  let runtime
  const recognize = recognizeImpl ? (buffer, signal) => deadline(() => recognizeImpl(buffer, signal), config.recognizeTimeoutMs, signal)
    : (...args) => { runtime ||= getRuntime(config); return runtime.recognize(...args) }
  const download = async (sourceUrl, signal) => {
    const url = new URL(sourceUrl)
    if (!['kopis.or.kr', 'www.kopis.or.kr'].includes(url.hostname) || !url.pathname.startsWith('/upload/') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw Object.assign(new Error('허용된 KOPIS 이미지 출처가 아니에요.'), { code: 'OCR_SOURCE_BLOCKED' })
    return deadline(async () => {
      const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(config.downloadTimeoutMs)]) })
      if (!response.ok) throw Object.assign(new Error('이미지 다운로드에 실패했어요.'), { code: 'OCR_DOWNLOAD_FAILED' })
      if (Number(response.headers.get('content-length')) > config.maxBytes) throw Object.assign(new Error('이미지 파일 크기 제한을 초과했어요.'), { code: 'OCR_IMAGE_TOO_LARGE' })
      const reader = response.body.getReader(), parts = []
      let bytes = 0
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > config.maxBytes) throw Object.assign(new Error('이미지 파일 크기 제한을 초과했어요.'), { code: 'OCR_IMAGE_TOO_LARGE' }); parts.push(Buffer.from(value)) } }
      finally { await reader.cancel().catch(() => {}) }
      return Buffer.concat(parts)
    }, config.downloadTimeoutMs, signal)
  }
  const processImage = async (concertId, sourceUrl, { refresh = false, signal } = {}) => {
    checkAbort(signal)
    const cacheKey = hash(concertId + ':' + sourceUrl)
    const path = join(config.cacheDirectory, 'results', cacheKey + '.json')
    let previous = memory.get(cacheKey)
    if (!previous) { try { previous = JSON.parse(await readFile(path, 'utf8')) } catch { /* 첫 실행 또는 저장 불가 */ } }
    if (previous?.version !== OCR_VERSION || previous?.concertId !== concertId || previous?.sourceUrl !== sourceUrl) previous = null
    if (!refresh && previous?.status === 'completed' && now() - Date.parse(previous.validatedAt) >= 0 && now() - Date.parse(previous.validatedAt) < config.cacheTtlMs) return { ...previous, fromCache: true, elapsedMs: 0 }
    if (pending.has(cacheKey)) {
      try { const result = await pending.get(cacheKey); checkAbort(signal); return { ...result, fromCache: true } }
      catch (error) { checkAbort(signal); if (error.code !== 'ABORTED') throw error }
    }
    const job = (async () => {
      const startedAt = now()
      let record, original, preprocessed, stage = 'download'
      try {
        const buffer = await download(sourceUrl, signal)
        const contentHash = hash(buffer)
        if (previous?.status === 'completed' && previous.contentHash === contentHash) return { ...previous, validatedAt: new Date(now()).toISOString(), fromCache: true, elapsedMs: now() - startedAt }
        stage = 'decode'
        const metadata = await sharp(buffer, { limitInputPixels: config.maxPixels }).metadata()
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > config.maxPixels || metadata.height > 20000 || metadata.pages > 1) throw Object.assign(new Error('이미지 해상도 또는 페이지 제한을 초과했어요.'), { code: 'OCR_IMAGE_TOO_LARGE' })
        stage = 'original-ocr'
        original = variant(await recognize(buffer, signal), 'original')
        if (original.extraction.sectionFound) {
          const width = Math.min(2000, Math.round(metadata.width * 1.5), Math.floor(Math.sqrt(config.maxPixels * metadata.width / metadata.height)))
          const enhanced = await sharp(buffer, { limitInputPixels: config.maxPixels }).resize({ width }).grayscale().normalise().png().toBuffer()
          stage = 'preprocessed-ocr'
          preprocessed = variant(await recognize(enhanced, signal), 'resize-1.5-grayscale-normalise')
        }
        const assessment = assessOcrReadings(original, preprocessed)
        record = { version: OCR_VERSION, concertId, sourceUrl, contentHash, status: 'completed', processedAt: new Date(now()).toISOString(), validatedAt: new Date(now()).toISOString(),
          elapsedMs: now() - startedAt, width: metadata.width, height: metadata.height, original, preprocessed, ...assessment }
      } catch (error) {
        if (signal?.aborted || error.code === 'ABORTED') throw aborted()
        record = { version: OCR_VERSION, concertId, sourceUrl, status: 'failed', processedAt: new Date(now()).toISOString(), validatedAt: new Date(now()).toISOString(),
          elapsedMs: now() - startedAt, failureCode: error.code || 'OCR_FAILED', failureReason: error.code ? error.message : '이미지 또는 OCR 엔진을 읽지 못했어요.', reviewRequired: true, links: [] }
        record.failureStage = stage
        if (original) record.original = original
        if (preprocessed) record.preprocessed = preprocessed
      }
      return record
    })()
    const committed = job.then(async (record) => {
      memory.set(cacheKey, record); if (memory.size > 500) memory.delete(memory.keys().next().value)
      try { await mkdir(join(config.cacheDirectory, 'results'), { recursive: true }); const temp = path + '.tmp'; await writeFile(temp, JSON.stringify(record)); await rename(temp, path) } catch { record.persistenceUnavailable = true }
      return { ...record, fromCache: record.fromCache || false }
    })
    pending.set(cacheKey, committed)
    try { return await committed } finally { if (pending.get(cacheKey) === committed) pending.delete(cacheKey) }
  }
  const peek = async (concertId, sourceUrl) => {
    const cacheKey = hash(concertId + ':' + sourceUrl)
    let record = memory.get(cacheKey)
    if (!record) { try { record = JSON.parse(await readFile(join(config.cacheDirectory, 'results', cacheKey + '.json'), 'utf8')) } catch { return null } }
    return record?.version === OCR_VERSION && record.status === 'completed' && now() - Date.parse(record.validatedAt) >= 0 && now() - Date.parse(record.validatedAt) < config.cacheTtlMs ? { ...record, fromCache: true, elapsedMs: 0 } : null
  }
  return { config, processImage, peek, close: async () => { await runtime?.close() } }
}
