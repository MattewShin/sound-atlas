import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConcertSearchService } from './concertSearchService.mjs'
import { createConcertApiHandler } from './api.mjs'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
export const createAppServer = ({ service = createConcertSearchService(), distDirectory = dist } = {}) => {
  const api = createConcertApiHandler(service)
  const server = createServer((req, res) => {
    void api(req, res, async () => {
      try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        if (pathname.split('/').some((part) => part.startsWith('.'))) { res.writeHead(404); res.end(); return }
        const target = resolve(distDirectory, `.${pathname}`)
        const root = resolve(distDirectory)
        if (!target.startsWith(root + sep) && target !== root) { res.writeHead(403); res.end(); return }
        let file = target
        try { if (!(await stat(file)).isFile()) throw new Error('not file') } catch {
          if (extname(pathname)) { res.writeHead(404); res.end(); return }
          file = resolve(root, 'index.html')
        }
        const data = await readFile(file)
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
        res.end(req.method === 'HEAD' ? undefined : data)
      } catch { res.writeHead(404); res.end('Not found') }
    })
  })
  server.once('close', () => { void service.close?.() })
  return server
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAppServer().listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => console.log('Sound Atlas server is ready'))
}
