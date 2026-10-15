import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { KOPIS_REGION_CODES } from '../src/data/concertSearchConfig.js'

export class ConcertApiError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status }
}
const parser = new XMLParser({ parseTagValue: false, ignoreAttributes: true, ignoreDeclaration: true, ignorePiTags: true })
export const asArray = (value) => value == null || value === '' ? [] : Array.isArray(value) ? value : [value]
export const text = (value) => typeof value === 'string' ? value.trim() : ''
export const safeUrl = (value) => {
  try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export const apiDate = (value) => {
  const date = text(value).replaceAll('.', '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : null
}
export const parseKopisXml = (xml, { validateRows = true } = {}) => {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', '공연 검색 응답을 확인할 수 없습니다. 잠시 후 다시 조회해주세요.')
  }
  const parsed = parser.parse(xml)
  if (!Object.hasOwn(parsed, 'dbs') || (parsed.dbs && typeof parsed.dbs !== 'object')) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', 'KOPIS에서 정상 검색 결과를 받지 못했습니다. 서비스키와 호출 제한을 확인해주세요.')
  }
  const rows = asArray(parsed.dbs?.db)
  const upstreamError = rows.find((row) => row?.returncode && row.returncode !== '00')
  if (upstreamError) {
    // 실제 응답: HTTP 200 / dbs.db.returncode=02, 등록되지 않은 서비스키.
    if (upstreamError.returncode === '02' || /SERVICE\s*KEY|AUTHENTICAT/i.test(text(upstreamError.errmsg))) {
      throw new ConcertApiError('KOPIS_AUTH_ERROR', 'KOPIS 서비스키 인증에 실패했습니다. 키의 등록·승인 상태를 확인해주세요.')
    }
    throw new ConcertApiError('KOPIS_UPSTREAM_ERROR', 'KOPIS가 조회 오류를 반환했습니다. 잠시 후 다시 시도해주세요.')
  }
  if (parsed.dbs && Object.keys(parsed.dbs).some((key) => key !== 'db')) throw new ConcertApiError('KOPIS_RESPONSE_INVALID', 'KOPIS 응답에 오류가 포함되어 있습니다.')
  if (validateRows && rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new ConcertApiError('KOPIS_RESPONSE_INVALID', 'KOPIS row must be an object')
  }
  if (validateRows && rows.some((row) => !/^PF\d+$/.test(text(row.mt20id)) || !text(row.prfnm))) {
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

