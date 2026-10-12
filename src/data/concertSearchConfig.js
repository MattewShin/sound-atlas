export const CONCERT_CACHE_TTL_MS = 6 * 60 * 60 * 1000
export const MAX_CONCERT_SEARCH_DAYS = 31
// KOPIS 공식 OpenAPI 공통코드의 signgucode / 서양음악(클래식) CCCA
export const KOPIS_REGION_CODES = {
  전국: '', 서울: '11', 부산: '26', 대구: '27', 인천: '28', 광주: '29', 대전: '30', 울산: '31',
  세종: '36', 경기: '41', 강원: '51', 충북: '43', 충남: '44', 전북: '45', 전남: '46',
  경북: '47', 경남: '48', 제주: '50',
}
export const koreaDate = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(now))
export const getInitialConcertPeriod = (now = Date.now()) => {
  const from = koreaDate(now)
  return { from, to: new Date(Date.parse(`${from}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10) }
}
export const validateConcertQuery = ({ region, from, to }) => {
  const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  if (!Object.hasOwn(KOPIS_REGION_CODES, region)) throw new Error('공연 지역을 선택해주세요.')
  if (!isDate(from) || !isDate(to) || from > to) throw new Error('시작일과 종료일을 올바르게 선택해주세요.')
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_CONCERT_SEARCH_DAYS) throw new Error(`관람 기간은 최대 ${MAX_CONCERT_SEARCH_DAYS}일까지 선택해주세요.`)
  return { region, from, to }
}
export const concertQueryKey = (query) => JSON.stringify(validateConcertQuery(query))
