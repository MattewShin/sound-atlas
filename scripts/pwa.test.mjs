import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'

const text = async (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const pngSize = async (path) => {
  const bytes = await readFile(new URL('../' + path, import.meta.url))
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test('PWA manifest는 standalone 설치 정보와 any·maskable 아이콘을 제공한다', async () => {
  const manifest = JSON.parse(await text('public/manifest.webmanifest'))
  assert.equal(manifest.name, 'MY PIANO MOOD')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.theme_color, '#10172b')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'))
  assert.deepEqual(await pngSize('public/icons/icon-192.png'), [192, 192])
  assert.deepEqual(await pngSize('public/icons/icon-512.png'), [512, 512])
  assert.deepEqual(await pngSize('public/icons/icon-maskable-512.png'), [512, 512])
  assert.deepEqual(await pngSize('public/icons/apple-touch-icon.png'), [180, 180])
})

test('HTML과 앱 진입점은 manifest·iOS 아이콘·production service worker를 연결한다', async () => {
  const [html, main, css] = await Promise.all([text('index.html'), text('src/main.jsx'), text('src/styles.css')])
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover[^"]*"/)
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
  assert.match(html, /apple-mobile-web-app-capable/)
  assert.match(main, /import\.meta\.env\.PROD/)
  assert.match(main, /serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/)
  assert.match(css, /@media \(display-mode: standalone\) and \(max-width: 679px\)/)
  assert.match(css, /padding-bottom:\s*calc\(10px \+ max\(10px, env\(safe-area-inset-bottom\)\)\)/)
})

test('iOS 상태바는 default이며 cover와 기존 하단 여백을 유지하고 상단 기종 보정을 두지 않는다', async () => {
  const [html, css] = await Promise.all([text('index.html'), text('src/styles.css')])
  const dom = new JSDOM(html), doc = dom.window.document
  try {
    const status = doc.querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')
    assert.equal(status.length, 1)
    assert.equal(status[0].content, 'default')
    assert(!html.includes('black-translucent'))
    assert(doc.querySelector('meta[name="viewport"]').content.includes('viewport-fit=cover'))
    // The existing highlight modal has its own inset; page headers do not.
    const topInsets = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(rule => rule[2].includes('safe-area-inset-top'))
    assert.equal(topInsets.length, 1)
    assert.equal(topInsets[0][1].trim(), '.highlight-short-view')
    assert(!/\(\s*(?:min-|max-)?device-(?:width|height)\s*:/i.test(css))
    assert.match(css, /:root\s*\{[^}]*background:\s*#f7f3eb;/)
    assert.match(css, /body, #root\s*\{\s*background:\s*#f7f3eb;\s*\}/)
    assert.match(css, /padding-bottom:\s*calc\(10px \+ max\(10px, env\(safe-area-inset-bottom\)\)\)/)
  } finally { dom.window.close() }
})

test('service worker는 API를 캐시하지 않고 navigation 실패에만 offline 화면을 사용한다', async () => {
  const worker = await text('public/sw.js')
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.match(worker, /fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)\)/)
  assert.ok(!worker.includes("caches.match(request).then((cached) => cached || fetch(request))") || worker.includes('cacheableAsset'))
  assert.match(await text('public/offline.html'), /인터넷 연결을 확인해주세요/)
})

test('Vercel은 service worker 재검증과 manifest MIME을 명시한다', async () => {
  const config = JSON.parse(await text('vercel.json'))
  const security = config.headers.find((entry) => entry.source === '/(.*)')
  const worker = config.headers.find((entry) => entry.source === '/sw.js')
  const manifest = config.headers.find((entry) => entry.source === '/manifest.webmanifest')
  const securityHeaders = Object.fromEntries(security.headers.map(({ key, value }) => [key, value]))
  assert.match(securityHeaders['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.match(securityHeaders['Content-Security-Policy'], /connect-src 'self' https:\/\/\*\.supabase\.co/)
  assert.equal(securityHeaders['X-Content-Type-Options'], 'nosniff')
  assert.equal(securityHeaders['Referrer-Policy'], 'strict-origin-when-cross-origin')
  assert.match(securityHeaders['Permissions-Policy'], /camera=\(\)/)
  assert.equal(securityHeaders['X-Frame-Options'], 'DENY')
  assert.ok(worker.headers.some(({ key, value }) => key === 'Cache-Control' && value.includes('must-revalidate')))
  assert.ok(worker.headers.some(({ key, value }) => key === 'Service-Worker-Allowed' && value === '/'))
  assert.ok(manifest.headers.some(({ key, value }) => key === 'Content-Type' && value.startsWith('application/manifest+json')))
})
