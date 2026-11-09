// Local collector only. Never expose upstream URLs, headers, bodies or raw errors.
export class CollectionError extends Error {
  constructor(code, message, retryable = false) {
    super(message); this.code = code; this.retryable = retryable
  }
}
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const requestWithRetry = async (url, {
  fetchImpl = fetch, init = {}, timeoutMs = 15000, attempts = 3,
  delay = pause, decode = (response) => response.text(), label = 'UPSTREAM', signal,
} = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      signal?.throwIfAborted()
      const timeout = AbortSignal.timeout(timeoutMs)
      const response = await fetchImpl(url, { ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
      if (!response.ok) {
        const error = new CollectionError(`${label}_HTTP_${response.status}`,
          `${label} HTTP ${response.status}`, response.status === 429 || response.status >= 500)
        error.http_status = response.status
        // Whitelist media types only: never retain an arbitrary header or body
        // that could reflect credentials. Keep HTTP failures distinct from XML errors.
        const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
        error.content_type = ['application/xml', 'text/xml', 'text/html', 'application/json', 'text/plain'].includes(mediaType) ? mediaType : null
        throw error
      }
      return await decode(response)
    } catch (error) {
      if (signal?.aborted) throw new CollectionError('BATCH_INTERRUPTED', 'Batch stopped at its execution boundary')
      const safe = error instanceof CollectionError ? error
        : new CollectionError(`${label}_REQUEST_FAILED`, `${label} request failed (network, timeout or invalid response)`, true)
      if (!safe.retryable || attempt === attempts) throw safe
      await delay(300 * 2 ** (attempt - 1))
    }
  }
}
