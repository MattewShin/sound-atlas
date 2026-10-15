import { createSupabaseRest } from './supabaseRest.mjs'
import { CollectionError } from './collectionHttp.mjs'
import { collectionConditions } from './concertCollectionConfig.mjs'
import { EASYOCR_PIPELINE_VERSION } from './easyOcrConfig.mjs'

const rowsOnly = (value) => {
  if (!Array.isArray(value)) throw new CollectionError('SUPABASE_RESPONSE_INVALID', 'Expected DB rows')
  return value
}
export const createSupabaseOcr = (options = {}) => {
  const request = createSupabaseRest(options)
  return {
    async preflight() {
      for (const table of ['concert_image_ocr_results', 'concert_image_ocr_attempts']) {
        try { rowsOnly(await request(table, { params: { select: 'id', limit: '0' } })) }
        catch (error) {
          if (error.code === 'SUPABASE_HTTP_404') throw new CollectionError('OCR_MIGRATION_REQUIRED', 'Apply supabase/migrations/202610140002_concert_image_ocr.sql before DB writes')
          throw error
        }
      }
    },
    async *candidates({ now = Date.now(), pageSize = 100 } = {}) {
      const conditions = collectionConditions(now)
      let lastId
      for (;;) {
        // Seek by immutable UUID; refreshed image updated_at does not restart scanning.
        const params = { select: 'id,concert_id,source_url,image_type,sort_order,concerts!inner(kopis_id,title,region,start_date,end_date,performance_status)',
          is_active: 'eq.true', image_type: 'eq.DETAIL', 'concerts.region': 'eq.서울',
          'concerts.start_date': `lte.${conditions.to}`, 'concerts.end_date': `gte.${conditions.from}`,
          'concerts.performance_status': 'in.(공연예정,공연중)', order: 'id.asc', limit: String(pageSize),
          ...(lastId ? { id: `gt.${lastId}` } : {}) }
        const rows = rowsOnly(await request('concert_program_images', { params }))
        for (const row of rows) {
          if (!/^[0-9a-f-]{36}$/i.test(row.id) || typeof row.source_url !== 'string' || !row.concerts?.kopis_id) throw new CollectionError('OCR_CANDIDATE_INVALID', 'Invalid image candidate from DB')
          if (lastId && row.id <= lastId) throw new CollectionError('OCR_PAGINATION_STALLED', 'DB image pagination did not advance')
          lastId = row.id
          yield row
        }
        if (rows.length < pageSize) return
      }
    },
    async findResult(imageId, hash) {
      const rows = rowsOnly(await request('concert_image_ocr_results', { params: { select: 'id', image_id: `eq.${imageId}`,
        content_sha256: `eq.${hash}`, pipeline_version: `eq.${EASYOCR_PIPELINE_VERSION}`, limit: '1' } }))
      return rows[0] || null
    },
    async saveAttempt(attempt, result) {
      const id = await request('rpc/record_concert_image_ocr', { body: { p_attempt: attempt, p_result: result } })
      if (id !== attempt.id) throw new CollectionError('SUPABASE_RESPONSE_INVALID', 'OCR RPC returned a different attempt ID')
    },
  }
}
