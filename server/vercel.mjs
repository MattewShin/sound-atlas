import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKopisService } from './kopis.mjs'
import { createConcertApiHandler } from './api.mjs'

export const getVercelConcertEnv = (env = process.env) => ({
  ...env,
  // 배포 디렉터리는 읽기 전용입니다. 언어 모델과 OCR 결과는 임시 공간에 씁니다.
  CONCERT_OCR_CACHE_DIR: join(tmpdir(), 'sound-atlas-ocr'),
})

export const createVercelConcertHandler = ({ env = process.env, service = createKopisService({ env: getVercelConcertEnv(env) }) } = {}) => {
  const api = createConcertApiHandler(service)
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    // rewrite 목적지 URL로 전달되는 경우에도 원래 API 경로와 검색 조건을 복원합니다.
    const path = url.searchParams.get('__concertPath')
    if (path !== null) {
      url.pathname = `/api/${path}`
      url.searchParams.delete('__concertPath')
      req.url = url.pathname + url.search
    }
    return api(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ code: 'NOT_FOUND', message: '요청 경로를 찾지 못했습니다.' }))
    })
  }
}
