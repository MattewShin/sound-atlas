// 사용자 요청으로만 실행하는 실데이터 검증. 키와 키가 포함된 URL은 기록하지 않습니다.
import { writeFile } from 'node:fs/promises'
import { XMLParser } from 'fast-xml-parser'
import { createKopisService, parseKopisXml, normalizeKopisConcert } from '../server/kopis.mjs'

const serviceKey = process.env.KOPIS_SERVICE_KEY?.trim()
if (!serviceKey) { console.log(JSON.stringify({ configured: false, message: '공연 검색 연동 설정 필요' })); process.exit(0) }
const trace = []
const transport = async (url, options) => {
  const response = await fetch(url, options)
  const xml = await response.text()
  const rows = parseKopisXml(xml)
  trace.push({ path: url.pathname.split('/').slice(-1)[0], from: url.searchParams.get('stdate'), to: url.searchParams.get('eddate'),
    page: url.searchParams.get('cpage'), pageSize: url.searchParams.get('rows'), httpStatus: response.status, rowCount: rows.length })
  return { ok: response.ok, text: async () => xml }
}
const service = createKopisService({ fetchImpl: transport })
const query = { region: '서울', from: '2026-10-01', to: '2026-10-31' }
const report = { verifiedAt: new Date().toISOString(), configured: true, query }
const ids = (records) => new Set(records.map(({ kopisId }) => kopisId))
const difference = (a, b) => [...a].filter((value) => !b.has(value))
try {
  const main = await service.search(query, true)
  report.main = { count: main.concerts.length, pages: [...trace], concerts: main.concerts }
  const first = await service.search({ ...query, to: '2026-10-15' }, true)
  const second = await service.search({ ...query, from: '2026-10-16' }, true)
  const splitIds = ids([...first.concerts, ...second.concerts])
  report.periodComparison = { firstCount: first.concerts.length, secondCount: second.concerts.length, unionCount: splitIds.size,
    missingFromFullMonth: difference(splitIds, ids(main.concerts)), missingFromSplitPeriods: difference(ids(main.concerts), splitIds) }
  const smallerPages = []
  for (let page = 1; page <= 50; page += 1) {
    const url = new URL('https://kopis.or.kr/openApi/restful/pblprfr')
    url.search = new URLSearchParams({ service: serviceKey, stdate: '20261001', eddate: '20261031', cpage: String(page), rows: '50', shcate: 'CCCA', signgucode: '11' }).toString()
    const response = await transport(url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
    const rows = parseKopisXml(await response.text())
    smallerPages.push(...rows.map((row) => normalizeKopisConcert(row, new Date().toISOString())))
    if (rows.length < 50) break
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  report.pageComparison = { pageSize: 50, rows: smallerPages.length, uniqueCount: ids(smallerPages).size,
    missingFrom100: difference(ids(smallerPages), ids(main.concerts)), missingFrom50: difference(ids(main.concerts), ids(smallerPages)) }
  report.zeroQueries = []
  for (const region of ['제주', '세종']) {
    const result = await service.search({ region, from: '2026-10-12', to: '2026-10-12' }, true)
    report.zeroQueries.push({ query: result.query, success: true, count: result.concerts.length })
    if (!result.concerts.length) break
  }
  const invalidService = createKopisService({ env: { KOPIS_SERVICE_KEY: 'invalid-validation-key' }, fetchImpl: async (url, options) => {
    const response = await fetch(url, options)
    const xml = await response.text()
    const parsed = new XMLParser({ parseTagValue: false, ignoreDeclaration: true }).parse(xml)
    const sanitized = JSON.stringify(parsed).replaceAll(serviceKey, '[redacted]').replaceAll('invalid-validation-key', '[redacted]')
      .replace(/https?:[^\s"<>]+/g, '[URL omitted]')
    report.authenticationResponse = { httpStatus: response.status, structure: sanitized.slice(0, 800) }
    return { ok: response.ok, text: async () => xml }
  } })
  try { const result = await invalidService.search(query, true); report.authenticationClassification = { success: true, count: result.concerts.length } }
  catch (error) { report.authenticationClassification = { success: false, code: error.code, message: error.code ? error.message : 'Request failed' } }
  report.details = []
  const selected = ['PF302837', 'PF302595', 'PF302629', 'PF302481', 'PF301052', 'PF301874', 'PF300769', 'PF299984', 'PF301803', 'PF302860']
  for (const kopisId of selected.filter((id) => ids(main.concerts).has(id))) {
    try {
      const { concert } = await service.program(kopisId, true)
      report.details.push(concert)
    } catch (error) { report.details.push({ kopisId, error: error.code || 'REQUEST_FAILED' }) }
  }
  report.allRequests = trace
  const serialized = JSON.stringify(report, null, 2)
  if (serialized.includes(serviceKey)) throw new Error('Sensitive output blocked')
  await writeFile('data/kopis-live-audit.local.json', serialized)
  console.log(JSON.stringify({ verifiedAt: report.verifiedAt, query, mainCount: report.main.count, pages: report.main.pages,
    periodComparison: report.periodComparison, pageComparison: report.pageComparison, zeroQueries: report.zeroQueries,
    authenticationResponse: report.authenticationResponse, authenticationClassification: report.authenticationClassification,
    details: report.details.map(({ kopisId, title, programEvidence, error }) => ({ kopisId, title, error, textLength: programEvidence?.text.length,
      imageCount: programEvidence?.imageUrls.length, text: programEvidence?.text.slice(0, 1800), imageUrls: programEvidence?.imageUrls.slice(0, 2) })) }, null, 2))
} catch (error) {
  console.log(JSON.stringify({ success: false, code: error.code || 'AUDIT_FAILED', message: error.code ? error.message : 'Live validation did not complete' }))
  process.exitCode = 1
}
