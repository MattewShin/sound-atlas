import { CollectionError, requestWithRetry } from './collectionHttp.mjs'

// Server/local CLI only. Credentials remain inside this closure.
export const createSupabaseRest = ({ env = process.env, fetchImpl = fetch, delay, signal } = {}) => {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) throw new CollectionError('SUPABASE_NOT_CONFIGURED', 'SUPABASE_SERVICE_ROLE_KEY is required')
  let base
  try {
    base = new URL(env.SUPABASE_URL?.trim())
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error()
  } catch { throw new CollectionError('SUPABASE_URL_INVALID', 'SUPABASE_URL must be an HTTPS project origin') }
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`
  return async (path, { params, body, decode = (response) => response.json() } = {}) => {
    const url = new URL(`/rest/v1/${path}`, base)
    if (params) url.search = new URLSearchParams(params).toString()
    return requestWithRetry(url, { fetchImpl, delay, signal, label: 'SUPABASE', decode,
      init: { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    })
  }
}
