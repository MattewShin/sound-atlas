import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { CONCERT_CACHE_TTL_MS, KOPIS_REGION_CODES, MAX_CONCERT_SEARCH_DAYS, validateConcertQuery } from '../src/data/concertSearchConfig.js'
import { CONCERT_PROGRAM_BATCH_SIZE } from '../src/data/concertMatchStates.js'
import { getTrackTarget } from '../src/data/workCatalog.js'
import { concerts } from '../src/data/concerts.js'
import { mergeSearchConcerts } from '../src/data/concertSearch.js'
import { extractProgram, getExtractedWorkLinks, matchConcertToTrack } from './programMatching.mjs'
import { createProgramOcrService, OCR_VERSION } from './programOcr.mjs'
import { combineOcrProgram, matchAnalyzedConcert } from './ocrProgramEvidence.mjs'
import { createSacService } from './sac.mjs'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export class ConcertApiError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status }
}
const parser = new XMLParser({ parseTagValue: false, ignoreAttributes: true, ignoreDeclaration: true, ignorePiTags: true })
const asArray = (value) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value]
const text = (value) => typeof value === 'string' ? value.trim() : ''
const safeUrl = (value) => {
  try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
const apiDate = (value) => {
  const date = text(value).replaceAll('.', '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : null
}
export const parseKopisXml = (xml) => {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', '공연 검색 응답을 확인할 수 없습니다. 잠시 후 다시 조회해주세요.')
  }
  const parsed = parser.parse(xml)
  if (!Object.hasOwn(parsed, 'dbs') || (parsed.dbs && typeof parsed.dbs !== 'object')) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', 'KOPIS에서 정상 검색 결과를 받지 못했습니다. 서비스키와 호출 제한을 확인해주세요.')
  }
  const rows = asArray(parsed.dbs?.db)
  const upstreamError = rows.find((row) => row.returncode && row.returncode !== '00')
  if (upstreamError) {
    // 실제 응답: HTTP 200 / dbs.db.returncode=02, 등록되지 않은 서비스키.
    if (upstreamError.returncode === '02' || /SERVICE\s*KEY|AUTHENTICAT/i.test(text(upstreamError.errmsg))) {
      throw new ConcertApiError('KOPIS_AUTH_ERROR', 'KOPIS 서비스키 인증에 실패했습니다. 키의 등록·승인 상태를 확인해주세요.')
    }
    throw new ConcertApiError('KOPIS_UPSTREAM_ERROR', 'KOPIS가 조회 오류를 반환했습니다. 잠시 후 다시 시도해주세요.')
  }
  if (parsed.dbs && Object.keys(parsed.dbs).some((key) => key !== 'db')) throw new ConcertApiError('KOPIS_RESPONSE_INVALID', 'KOPIS 응답에 오류가 포함되어 있습니다.')
  if (rows.some((row) => !/^PF\d+$/.test(text(row.mt20id)) || !text(row.prfnm))) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', '공연 정보의 형식이 올바르지 않습니다.')
  }
  return rows
}
export const normalizeKopisConcert = (row, fetchedAt) => {
  const dateFrom = apiDate(row.prfpdfrom), dateTo = apiDate(row.prfpdto)
  if (!dateFrom || !dateTo || dateFrom > dateTo) throw new ConcertApiError('KOPIS_RESPONSE_INVALID', '공연 기간을 확인할 수 없습니다.')
  const area = text(row.area)
  const region = Object.keys(KOPIS_REGION_CODES).find((key) => key !== '전국' && area.startsWith(key))
    || ({ 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남' })[area] || area
  const kopisId = text(row.mt20id)
  return {
    id: `kopis-${kopisId}`, kopisId, title: text(row.prfnm), dateFrom, dateTo,
    venue: text(row.fcltynm), region, genre: text(row.genrenm), performanceStatus: text(row.prfstate),
    sourceUrl: `https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20id=${kopisId}`,
    sourceLabel: 'KOPIS 공연 정보', fetchedAt,
    programStatus: 'unavailable', programWorkIds: [],
  }
}

export const createKopisService = ({ env = process.env, fetchImpl = fetch, now = Date.now, ocrService, persistAnalyses = true, sacService, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) => {
  const ocr = ocrService || createProgramOcrService({ env, now })
  const sac = sacService || createSacService({ fetchImpl, now })
  const analyses = new Map()
  const key = env.KOPIS_SERVICE_KEY?.trim()
  const ttl = env.CONCERT_CACHE_TTL_MS === undefined ? CONCERT_CACHE_TTL_MS : Number(env.CONCERT_CACHE_TTL_MS)
  if (!Number.isSafeInteger(ttl) || ttl < 0) throw new Error('CONCERT_CACHE_TTL_MS must be a non-negative integer')
  const cache = new Map(), pending = new Map()
  let upstreamQueue = Promise.resolve()
  const config = () => ({ configured: Boolean(key), cacheTtlMs: ttl, maxSearchDays: MAX_CONCERT_SEARCH_DAYS,
    programBatchSize: ocr.config.programBatchSize, initialCheckLimit: ocr.config.initialCheckLimit, moreCheckLimit: ocr.config.moreCheckLimit, ocrWorkers: ocr.config.workers })
  const requireKey = () => { if (!key) throw new ConcertApiError('KOPIS_NOT_CONFIGURED', '공연 검색 연동 설정 필요', 503) }
  const requestXml = (path, params = {}) => {
    requireKey()
    const request = upstreamQueue.then(async () => {
      const url = new URL(`https://kopis.or.kr/openApi/restful/${path}`)
      url.search = new URLSearchParams({ service: key, ...params }).toString()
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
        if (!response.ok) throw new Error('upstream HTTP error')
        const xml = await response.text()
        if (xml.length > 3_000_000) throw new Error('response too large')
        return parseKopisXml(xml)
      } catch (error) {
        if (error instanceof ConcertApiError) throw error
        // URL・키・원문·스택을 브라우저 응답이나 로그에 노출하지 않습니다.
        throw new ConcertApiError('KOPIS_UNAVAILABLE', '공연 검색에 실패했습니다. 서비스키·네트워크·호출 제한을 확인하고 다시 시도해주세요.')
      }
    })
    upstreamQueue = request.then(() => delay(150), () => delay(150))
    return request
  }
  const cached = async (cacheKey, refresh, loader) => {
    requireKey()
    const entry = cache.get(cacheKey)
    if (!refresh && entry && now() - Date.parse(entry.fetchedAt) >= 0 && now() - Date.parse(entry.fetchedAt) < ttl) return { ...entry, fromCache: true, cacheTtlMs: ttl }
    if (!refresh && pending.has(cacheKey)) return pending.get(cacheKey)
    const request = (async () => {
      const result = await loader()
      const entry = { ...result, fetchedAt: new Date(now()).toISOString() }
      cache.delete(cacheKey); cache.set(cacheKey, entry)
      // 곡을 바꿔 같은 수백 건의 후보를 다시 비교할 때도 상세 캐시를 재사용합니다.
      if (cache.size > 500) cache.delete(cache.keys().next().value)
      return { ...entry, fromCache: false, cacheTtlMs: ttl }
    })()
    pending.set(cacheKey, request)
    try { return await request } finally { if (pending.get(cacheKey) === request) pending.delete(cacheKey) }
  }
  const search = async (input, refresh = false) => {
    if (input.targetTrackId && !getTrackTarget(input.targetTrackId)) throw new ConcertApiError('INVALID_TARGET', '등록된 곡 ID를 선택해주세요.', 400)
    let query
    try { query = validateConcertQuery(input) } catch (error) { throw new ConcertApiError('INVALID_QUERY', error.message, 400) }
    return cached(`list:${JSON.stringify(query)}`, refresh, async () => {
      const unique = new Map()
      for (let page = 1; page <= 50; page += 1) {
        const rows = await requestXml('pblprfr', {
          stdate: query.from.replaceAll('-', ''), eddate: query.to.replaceAll('-', ''), cpage: String(page), rows: '100', shcate: 'CCCA',
          ...(query.region === '전국' ? {} : { signgucode: KOPIS_REGION_CODES[query.region] }),
        })
        for (const row of rows) {
          if (text(row.genrenm) !== '서양음악(클래식)') continue
          const concert = normalizeKopisConcert(row, new Date(now()).toISOString())
          if (concert.dateFrom <= query.to && concert.dateTo >= query.from && (query.region === '전국' || concert.region === query.region)) unique.set(concert.id, concert)
        }
        if (rows.length < 100) break
        if (page === 50) throw new ConcertApiError('SEARCH_TOO_LARGE', '검색 결과가 많습니다. 지역이나 기간을 좁혀 다시 조회해주세요.')
      }
      const sourceWarnings = []
      try {
        for (const concert of await sac.search(query, refresh)) {
          // Same official event can arrive from both sources. Keep the KOPIS copy when its title, dates and venue agree.
          const duplicate = [...unique.values()].some((known) => known.dateFrom === concert.dateFrom && known.dateTo === concert.dateTo
            && known.title.replace(/\s/g, '') === concert.title.replace(/\s/g, '')
            && /예술의전당/.test(known.venue))
          if (!duplicate) unique.set(concert.id, concert)
        }
      } catch { sourceWarnings.push('예술의전당 일정은 현재 조회하지 못했습니다. 다시 검색하면 재시도합니다.') }
      return { query, concerts: [...unique.values()], sourceWarnings }
    })
  }
  const program = async (kopisId, refresh = false) => {
    if (!/^PF\d{1,12}$/.test(kopisId)) throw new ConcertApiError('INVALID_QUERY', '공연 ID가 올바르지 않습니다.', 400)
    return cached(`program:${kopisId}`, refresh, async () => {
      const rows = await requestXml(`pblprfr/${kopisId}`)
      const row = rows.find((item) => item.mt20id === kopisId)
      if (!row) throw new ConcertApiError('PERFORMANCE_NOT_FOUND', '공연 상세 정보를 찾지 못했습니다.', 404)
      const concert = normalizeKopisConcert(row, new Date(now()).toISOString())
      const programEvidence = { text: text(row.sty), imageUrls: asArray(row.styurls?.styurl).map(safeUrl).filter(Boolean) }
      const programExtraction = extractProgram(programEvidence.text)
      return { concert: {
        ...concert, performers: text(row.prfcast), kopisHallId: text(row.mt13id), scheduleText: text(row.dtguidance),
        relatedUrls: asArray(row.relates?.relate).map((link) => safeUrl(link.relateurl)).filter(Boolean),
        programEvidence, programExtraction,
        programStatus: text(row.sty) || asArray(row.styurls?.styurl).length ? 'needs-review' : 'unavailable',
      } }
    })
  }
  const saveAnalysis = async (concert) => {
    const record = { version: OCR_VERSION, checkedAt: new Date(now()).toISOString(), concert }
    analyses.set(concert.kopisId, record); if (analyses.size > 500) analyses.delete(analyses.keys().next().value)
    if (!persistAnalyses) return
    try {
      const directory = join(ocr.config.cacheDirectory, 'concerts'); await mkdir(directory, { recursive: true })
      const path = join(directory, concert.kopisId + '.json'), temporary = path + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(record)); await rename(temporary, path)
    } catch { /* 읽기 전용 배포에서는 메모리 캐시 사용 */ }
  }
  const cachedMatches = async ({ targetTrackId, kopisIds }) => {
    const target = getTrackTarget(targetTrackId)
    if (!target) throw new ConcertApiError('INVALID_TARGET', '등록된 곡 ID를 선택해주세요.', 400)
    if (!Array.isArray(kopisIds) || kopisIds.length > 500 || kopisIds.some((id) => !/^PF\d{1,12}$/.test(id))) throw new ConcertApiError('INVALID_BATCH', '캐시 확인 요청을 확인해주세요.', 400)
    const results = []
    for (const kopisId of new Set(kopisIds)) {
      let record = analyses.get(kopisId)
      if (!record) { try { record = JSON.parse(await readFile(join(ocr.config.cacheDirectory, 'concerts', kopisId + '.json'), 'utf8')) } catch { continue } }
      if (record.version !== OCR_VERSION || record.concert?.kopisId !== kopisId || now() - Date.parse(record.checkedAt) < 0 || now() - Date.parse(record.checkedAt) >= Math.min(ttl, ocr.config.cacheTtlMs)) continue
      const sourceTime = Date.parse(record.concert.programFetchedAt)
      if (!Number.isFinite(sourceTime) || now() - sourceTime >= ttl || record.concert.programOcr?.records.some((image) => now() - Date.parse(image.validatedAt) >= ocr.config.cacheTtlMs)) continue
      const result = matchAnalyzedConcert(record.concert, targetTrackId)
      if (!record.concert.programOcr && record.concert.programEvidence?.imageUrls?.length && result.status === 'needs-review') continue
      results.push({ kopisId, concert: { ...record.concert, targetMatch: result }, fromCache: true })
    }
    return { targetTrackId, target, results, checkedAt: new Date(now()).toISOString() }
  }
  const matchBatch = async ({ targetTrackId, kopisIds, refresh = false, signal }) => {
    const target = getTrackTarget(targetTrackId)
    if (!target) throw new ConcertApiError('INVALID_TARGET', '등록된 곡 ID를 선택해주세요.', 400)
    if (!Array.isArray(kopisIds) || kopisIds.length > CONCERT_PROGRAM_BATCH_SIZE || kopisIds.some((id) => typeof id !== 'string' || !/^PF\d{1,12}$/.test(id))) {
      throw new ConcertApiError('INVALID_BATCH', `공연 자료는 최대 ${CONCERT_PROGRAM_BATCH_SIZE}건씩 확인할 수 있어요.`, 400)
    }
    requireKey()
    const results = []
    for (const kopisId of [...new Set(kopisIds)]) {
      try {
        signal?.throwIfAborted()
        const detail = await program(kopisId, refresh)
        let original = mergeSearchConcerts([detail.concert], concerts).find((item) => item.kopisId === kopisId) || detail.concert
        const firstMatch = matchConcertToTrack(original, targetTrackId)
        const imageUrls = original.programEvidence?.imageUrls || []
        if (imageUrls.length && !['matched', 'not-found'].includes(firstMatch.status)) {
          const records = []
          for (const sourceUrl of imageUrls.slice(0, ocr.config.maxImages)) {
            signal?.throwIfAborted()
            records.push(await ocr.processImage(kopisId, sourceUrl, { refresh, signal }))
          }
          original = combineOcrProgram(original, records, { totalImages: imageUrls.length })
        }
        signal?.throwIfAborted()
        const links = getExtractedWorkLinks(original.programExtraction)
        const enriched = { ...original, programFetchedAt: detail.fetchedAt,
          programWorkIds: original.programVerification === 'manual' ? original.programWorkIds : links.map(({ workId }) => workId), programScopes: Object.fromEntries(links.map(({ workId, scope }) => [workId, scope])),
          programStatus: links.length || original.programVerification === 'manual' ? 'verified' : original.programStatus,
          programVerification: original.programVerification === 'manual' ? 'manual' : links.length ? original.programOcr ? 'ocr' : 'text' : undefined,
          programCoverage: { complete: original.programExtraction.complete, explicitComplete: original.programExtraction.explicitComplete, extractedEntries: original.programExtraction.entries.length },
        }
        const confirmed = mergeSearchConcerts([enriched], concerts).find((concert) => concert.kopisId === kopisId) || enriched
        await saveAnalysis(confirmed)
        results.push({ kopisId, concert: { ...confirmed, targetMatch: matchAnalyzedConcert(confirmed, targetTrackId) }, fromCache: detail.fromCache })
      } catch (error) {
        if (signal?.aborted) throw Object.assign(new Error('검색을 중단했어요.'), { code: 'ABORTED' })
        if (error.code === 'KOPIS_AUTH_ERROR' || error.code === 'KOPIS_NOT_CONFIGURED') throw error
        results.push({ kopisId, targetMatch: { targetTrackId, workId: target.workId, status: 'failed', attempted: true, completed: false,
          retryable: true, reason: '자료 조회에 실패했어요. 아직 불일치로 판단하지 않았으며 다시 확인할 수 있어요.' } })
      }
    }
    return { targetTrackId, target, results, checkedAt: new Date(now()).toISOString(), batchSize: CONCERT_PROGRAM_BATCH_SIZE }
  }
  return { config, search, program, matchBatch, cachedMatches, close: ocr.close }
}
