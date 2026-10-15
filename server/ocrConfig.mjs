import { resolve } from 'node:path'
import { getOcrImageConfig, ocrInteger as integer } from './ocrImageConfig.mjs'
export const getOcrConfig = (env = process.env) => ({
  initialCheckLimit: integer(env, 'CONCERT_INITIAL_CHECK_LIMIT', 10, 1, 10),
  moreCheckLimit: integer(env, 'CONCERT_MORE_CHECK_LIMIT', 10, 1, 10),
  // Vercel 요청 하나가 느린 OCR 후보를 기다리느라 앞선 텍스트 일치 결과까지 잃지 않도록 한 공연씩 확인합니다.
  programBatchSize: 1, workers: 1,
  maxImages: integer(env, 'OCR_MAX_IMAGES_PER_CONCERT', 8, 1, 12),
  ...getOcrImageConfig(env),
  recognizeTimeoutMs: integer(env, 'OCR_TIMEOUT_MS', 35_000, 100, 90_000),
  cacheTtlMs: integer(env, 'CONCERT_OCR_CACHE_TTL_MS', 21_600_000, 0, 604_800_000),
  cacheDirectory: resolve(env.CONCERT_OCR_CACHE_DIR || '.cache/ocr'),
  langPath: env.TESSERACT_LANG_PATH || undefined,
})
