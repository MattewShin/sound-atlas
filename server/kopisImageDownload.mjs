import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { CollectionError, requestWithRetry } from './collectionHttp.mjs'
import { kopisImageUrl, readLimitedImageBytes } from './kopisImageSource.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'

export const IMAGE_LIMIT_CODE = 'OCR_IMAGE_LIMIT_EXCEEDED'
const maxDimension = 20000
// Changing validation/decoder/processing conditions must invalidate a previous hold.
export const imageValidationKey = config => createHash('sha256').update(JSON.stringify([
  'image-validation-1', config.maxBytes, config.maxPixels, maxDimension, config.downloadTimeoutMs,
  EASYOCR_PIPELINE_VERSION, sharp.versions,
])).digest('hex')

// Batch transport retries plus PNG conversion. The request-based OCR keeps its own decoding.
export const downloadKopisImage = async (sourceUrl, { config, fetchImpl = fetch, delay, signal, knownLimit } = {}) => {
  const url = kopisImageUrl(sourceUrl)
  const raw = await requestWithRetry(url, { fetchImpl, delay, signal, timeoutMs: config.downloadTimeoutMs, label: 'OCR_IMAGE',
    decode: (response) => readLimitedImageBytes(response, config.maxBytes),
  })
  const contentHash = createHash('sha256').update(raw).digest('hex'), validationKey = imageValidationKey(config)
  // Full bounded bytes, never URL/extension/Content-Type alone, identify an unchanged source.
  if (knownLimit?.sourceUrl === sourceUrl && knownLimit.validationKey === validationKey && knownLimit.contentHash === contentHash)
    return { held: true, contentHash }
  const exceeded = (reason, metadata) => {
    const error = new CollectionError(IMAGE_LIMIT_CODE, 'Image exceeds configured pixel or dimension limit')
    error.imageLimit = { contentHash, validationKey, reason, maxPixels: config.maxPixels, maxDimension,
      width: metadata?.width ?? null, height: metadata?.height ?? null }
    return error
  }
  try {
    const metadata = await sharp(raw, { limitInputPixels: config.maxPixels }).metadata()
    if (!metadata.width || !metadata.height || metadata.pages > 1) throw new Error()
    if (metadata.width * metadata.height > config.maxPixels) throw exceeded('PIXEL_LIMIT', metadata)
    if (metadata.height > maxDimension || metadata.width > maxDimension) throw exceeded('DIMENSION_LIMIT', metadata)
    const { data, info } = await sharp(raw, { limitInputPixels: config.maxPixels }).rotate().removeAlpha().png().toBuffer({ resolveWithObject: true })
    return { buffer: data, contentHash, width: info.width, height: info.height }
  } catch (error) {
    if (error instanceof CollectionError && error.code === IMAGE_LIMIT_CODE) throw error
    // This exact Sharp/libvips guard is confirmed in sharp/src/common.cc. Never
    // infer a limit from an arbitrary decode error or relax limitInputPixels.
    if (error.message === 'Input image exceeds pixel limit') throw exceeded('PIXEL_LIMIT')
    throw new CollectionError('OCR_IMAGE_INVALID', 'Unsupported, corrupt or animated image')
  }
}
