import { createVercelConcertHandler } from '../server/vercel.mjs'

// 같은 인스턴스에서는 KOPIS 캐시와 OCR worker를 재사용합니다.
let handler
export default function concertApi(req, res) {
  handler ||= createVercelConcertHandler()
  return handler(req, res)
}
