import { createVercelConcertHandler } from '../server/vercel.mjs'

// 같은 인스턴스에서는 읽기 전용 KOPIS 목록·상세 캐시를 재사용합니다.
let handler
export default function concertApi(req, res) {
  handler ||= createVercelConcertHandler()
  return handler(req, res)
}
