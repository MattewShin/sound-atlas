import { performance } from 'node:perf_hooks'
import { createKopisService } from '../server/kopis.mjs'

// verify:ocr가 저장한 결과를 별도의 Node 프로세스에서 확인합니다. 외부 API는 호출하지 않습니다.
const service = createKopisService()
try {
  const started = performance.now()
  const result = await service.cachedMatches({ targetTrackId: 'chopin-ballade-op23-no1', kopisIds: ['PF302595'] })
  const match = result.results[0]
  const summary = { elapsedMs: Math.round(performance.now() - started), fromCache: match?.fromCache === true,
    status: match?.concert.targetMatch.status || 'cache-miss', evidenceKind: match?.concert.targetMatch.evidenceKind || null }
  console.log(JSON.stringify(summary))
  if (!summary.fromCache || summary.status !== 'matched' || summary.evidenceKind !== 'ocr') process.exitCode = 1
} finally { await service.close() }
