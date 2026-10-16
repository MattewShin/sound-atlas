import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { CollectionError, requestWithRetry } from './collectionHttp.mjs'
import { kopisImageUrl, readLimitedImageBytes } from './kopisImageSource.mjs'

// Batch transport retries plus PNG conversion. The request-based OCR keeps its own decoding.
export const downloadKopisImage = async (sourceUrl, { config, fetchImpl = fetch, delay, signal } = {}) => {
  const url = kopisImageUrl(sourceUrl)
  const raw = await requestWithRetry(url, { fetchImpl, delay, signal, timeoutMs: config.downloadTimeoutMs, label: 'OCR_IMAGE',
    decode: (response) => readLimitedImageBytes(response, config.maxBytes),
  })
  try {
    const metadata = await sharp(raw, { limitInputPixels: config.maxPixels }).metadata()
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > config.maxPixels
      || metadata.height > 20000 || metadata.width > 20000 || metadata.pages > 1) throw new Error()
    const { data, info } = await sharp(raw, { limitInputPixels: config.maxPixels }).rotate().removeAlpha().png().toBuffer({ resolveWithObject: true })
    return { buffer: data, contentHash: createHash('sha256').update(raw).digest('hex'), width: info.width, height: info.height }
  } catch { throw new CollectionError('OCR_IMAGE_INVALID', 'Unsupported, corrupt, animated or oversized image') }
}
