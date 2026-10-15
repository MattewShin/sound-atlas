import { parseCollectionArgs, collectConcerts, createCollectionKopisClient } from '../server/concertCollector.mjs'
import { collectionConditions } from '../server/concertCollectionConfig.mjs'
import { createSupabaseCollector } from '../server/supabaseCollector.mjs'
import { CollectionError } from '../server/collectionHttp.mjs'

try {
  const { help, ...options } = parseCollectionArgs(process.argv.slice(2))
  if (help) {
    console.log('npm run collect:concerts -- [--dry-run] [--limit N]\n서울 / 오늘~30일 후(양 끝 포함) / 기본 최대 10개. 제한된 표본 수집입니다.')
  } else {
    console.log(JSON.stringify({ event: 'start', ...options, conditions: collectionConditions(), limitedSample: true }))
    const client = createCollectionKopisClient()
    // dry-run does not create a DB client and needs no Supabase credentials.
    const repository = options.dryRun ? undefined : createSupabaseCollector()
    const result = await collectConcerts({ ...options, client, repository,
      onProgress: (page) => console.log(JSON.stringify({ event: 'page', ...page })),
    })
    console.log('제한된 표본 수집 결과 (전체 공연 목록이나 프로그램 확인 결과가 아닙니다):')
    console.log(JSON.stringify(result, null, 2))
    if (result.failed) process.exitCode = 1
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'failed', code: error instanceof CollectionError ? error.code : 'COLLECTION_FAILED',
    reason: error instanceof CollectionError ? error.message : 'Unexpected failure (raw error suppressed)' }))
  process.exitCode = 1
}
