// Local collector only. Never expose upstream URLs, headers, bodies or raw errors.
export class CollectionError extends Error {
  constructor(code, message, retryable = false) {
    super(message); this.code = code; this.retryable = retryable
  }
}
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const requestWithRetry = async (url, {
  fetchImpl = fetch, init = {}, timeoutMs = 15000, attempts = 3,
  delay = pause, decode = (response) => response.text(), label = 'UPSTREAM',
} = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new CollectionError(`${label}_HTTP_${response.status}`,
        `${label} HTTP ${response.status}`, response.status === 429 || response.status >= 500)
      return await decode(response)
    } catch (error) {
      const safe = error instanceof CollectionError ? error
        : new CollectionError(`${label}_REQUEST_FAILED`, `${label} request failed (network, timeout or invalid response)`, true)
      if (!safe.retryable || attempt === attempts) throw safe
      await delay(300 * 2 ** (attempt - 1))
    }
  }
}
