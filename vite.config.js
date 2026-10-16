import { defineConfig, loadEnv } from 'vite'
import { createConcertSearchService } from './server/concertSearchService.mjs'
import { createConcertApiHandler } from './server/api.mjs'

export default defineConfig(({ mode }) => {
  // loadEnv는 Node 설정에서만 사용합니다. VITE_ 접두사나 define으로 키를 공개하지 않습니다.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const service = createConcertSearchService({ env })
  const handler = createConcertApiHandler(service)
  return { plugins: [{ name: 'concert-api',
    configureServer(server) { server.middlewares.use(handler); server.httpServer?.once('close', () => { void service.close() }) },
    configurePreviewServer(server) { server.middlewares.use(handler); server.httpServer?.once('close', () => { void service.close() }) },
  }] }
})
