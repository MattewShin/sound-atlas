import { resolve } from 'node:path'
const integer = (env, name, fallback, min, max) => {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name])
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} 설정 범위를 확인해주세요.`)
  return value
}
export const getOcrConfig = (env = process.env) => ({
  initialCheckLimit: integer(env, 'CONCERT_INITIAL_CHECK_LIMIT', 10, 1, 10),
  moreCheckLimit: integer(env, 'CONCERT_MORE_CHECK_LIMIT', 10, 1, 10),
  programBatchSize: 2, workers: 1,
  maxImages: integer(env, 'OCR_MAX_IMAGES_PER_CONCERT', 8, 1, 12),
  maxBytes: integer(env, 'OCR_MAX_IMAGE_BYTES', 6_000_000, 100_000, 20_000_000),
  maxPixels: integer(env, 'OCR_MAX_IMAGE_PIXELS', 12_000_000, 100_000, 24_000_000),
  downloadTimeoutMs: integer(env, 'OCR_DOWNLOAD_TIMEOUT_MS', 10_000, 100, 30_000),
  recognizeTimeoutMs: integer(env, 'OCR_TIMEOUT_MS', 35_000, 100, 90_000),
  cacheTtlMs: integer(env, 'CONCERT_OCR_CACHE_TTL_MS', 21_600_000, 0, 604_800_000),
  cacheDirectory: resolve(env.CONCERT_OCR_CACHE_DIR || '.cache/ocr'),
  langPath: env.TESSERACT_LANG_PATH || undefined,
})
