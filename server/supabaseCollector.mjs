import { CollectionError } from './collectionHttp.mjs'
import { createSupabaseRest } from './supabaseRest.mjs'

// Server/local CLI only. No dependency on browser sessions or VITE_ variables.
export const createSupabaseCollector = ({ env = process.env, fetchImpl = fetch, delay } = {}) => {
  const request = createSupabaseRest({ env, fetchImpl, delay })
  return {
    async save(snapshot) {
      // One RPC transaction locks/upserts the concert and reconciles its image snapshot.
      await request('rpc/sync_kopis_concert', {
        body: { p_concert: snapshot.concert, p_images: snapshot.images },
        decode: async (response) => {
          const id = await response.json()
          if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
            throw new CollectionError('SUPABASE_RESPONSE_INVALID', 'Supabase RPC did not return a concert UUID')
          }
          return id
        },
      })
    },
  }
}
