import { CollectionError } from './collectionHttp.mjs'

export const kopisImageUrl = (sourceUrl) => {
  try {
    const url = new URL(sourceUrl)
    if (['kopis.or.kr', 'www.kopis.or.kr'].includes(url.hostname) && url.pathname.startsWith('/upload/')
      && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port) return url
  } catch { /* Reject malformed URLs using the same safe error as other blocked sources. */ }
  throw new CollectionError('OCR_SOURCE_BLOCKED', '허용된 KOPIS 이미지 출처가 아니에요.')
}

// Transport retry/timeout/abort behavior is chosen by each caller, outside this reader.
export const readLimitedImageBytes = async (response, maxBytes) => {
  const tooLarge = () => new CollectionError('OCR_IMAGE_TOO_LARGE', '이미지 파일 크기 제한을 초과했어요.')
  if (Number(response.headers.get('content-length')) > maxBytes) throw tooLarge()
  if (!response.body) throw new CollectionError('OCR_IMAGE_EMPTY', '이미지 응답에 본문이 없어요.')
  const reader = response.body.getReader(), parts = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) throw tooLarge()
      parts.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(parts)
}
