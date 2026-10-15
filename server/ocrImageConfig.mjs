export const ocrInteger = (env, name, fallback, min, max) => {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name])
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} 설정 범위를 확인해주세요.`)
  return value
}

// Resource limits shared by Tesseract requests and local EasyOCR batches.
export const getOcrImageConfig = (env = process.env) => ({
  maxBytes: ocrInteger(env, 'OCR_MAX_IMAGE_BYTES', 6_000_000, 100_000, 20_000_000),
  maxPixels: ocrInteger(env, 'OCR_MAX_IMAGE_PIXELS', 12_000_000, 100_000, 24_000_000),
  downloadTimeoutMs: ocrInteger(env, 'OCR_DOWNLOAD_TIMEOUT_MS', 10_000, 100, 30_000),
})
