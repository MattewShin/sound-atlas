import { createKopisService } from './kopis.mjs'
import { createSupabaseConcertSearch } from './supabaseConcertSearch.mjs'
import { ConcertApiError } from './kopisData.mjs'

// One server-only switch shared by Vite, local production and Vercel. No fallback.
export const createConcertSearchService = ({ env = process.env, ...options } = {}) => {
  const backend = env.CONCERT_SEARCH_BACKEND ?? 'kopis'
  if (backend === 'supabase') return createSupabaseConcertSearch({ env, ...options })
  if (backend === 'kopis') {
    const service = createKopisService({ env, ...options })
    return { ...service, backend, config: () => ({ ...service.config(), backend }) }
  }
  const invalid = () => { throw new ConcertApiError('INVALID_SEARCH_BACKEND', '공연 검색 방식 설정이 올바르지 않아요. 서버 설정을 확인해주세요.', 503) }
  return { backend: 'invalid', config: invalid, search: invalid, close() {} }
}
