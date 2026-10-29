import {createKopisService} from './kopis.mjs'
// Previous CONCERT_SEARCH_BACKEND values no longer select database song matching.
export const createConcertSearchService=options=>createKopisService(options)
