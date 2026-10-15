import { getInitialConcertPeriod, KOPIS_REGION_CODES } from '../src/data/concertSearchConfig.js'

// Shared collection scope; independent of KOPIS transport, DB clients and OCR engines.
export const COLLECTION_GENRE = 'CCCA'
export const COLLECTION_STATES = Object.freeze(['02', '01'])
export const collectionConditions = (now = Date.now()) => ({
  region: '서울', regionCode: KOPIS_REGION_CODES['서울'], genreCode: COLLECTION_GENRE,
  states: [...COLLECTION_STATES], timeZone: 'Asia/Seoul', ...getInitialConcertPeriod(now),
})
