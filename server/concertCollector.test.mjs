import test from 'node:test'
import assert from 'node:assert/strict'
import { collectConcerts, collectionConditions, createCollectionKopisClient, normalizeCollectionDetail, parseCollectionArgs } from './concertCollector.mjs'
import { createSupabaseCollector } from './supabaseCollector.mjs'
import { CollectionError, requestWithRetry } from './collectionHttp.mjs'
import { parseKopisXml } from './kopisData.mjs'
import {getKopisDiagnostic} from './kopisDiagnostics.mjs'

const now = () => Date.parse('2026-10-13T15:00:00Z')
const conditions = collectionConditions(now())
const row = (id = 'PF900001', extra = {}) => ({
  mt20id: id, prfnm: '검증용 클래식', fcltynm: '검증홀', area: '서울특별시',
  prfpdfrom: '2026.10.01', prfpdto: '2026.11.20', genrenm: '서양음악(클래식)', prfstate: '공연중',
  poster: 'https://kopis.or.kr/poster.jpg', styurls: { styurl: ['https://kopis.or.kr/detail.jpg'] }, ...extra,
})
const normalize = (r = row()) => normalizeCollectionDetail(r, r.mt20id, conditions, new Date(now()).toISOString())
const instant = async () => {}
const xml = (content) => new Response(`<dbs>${content}</dbs>`)
const xmlRow = (id) => `<db><mt20id>${id}</mt20id><prfnm>검증</prfnm></db>`

test('KST midnight, year boundaries and CLI limits are deterministic', () => {
  assert.equal(collectionConditions(Date.parse('2026-10-13T14:59:59Z')).from, '2026-10-13')
  assert.equal(conditions.from, '2026-10-14')
  assert.equal(conditions.to, '2026-11-13')
  assert.equal(collectionConditions(Date.parse('2026-12-31T15:00:00Z')).to, '2027-01-31')
  assert.deepEqual(parseCollectionArgs([]), { dryRun: false, limit: 10, help: false })
  assert.equal(parseCollectionArgs(['--dry-run', '--limit=25']).limit, 25)
  for (const args of [['--limit'], ['--limit', '0'], ['--limit=-1'], ['--limit=1.5'], ['--bad']]) assert.throws(() => parseCollectionArgs(args))
})

test('400 diagnostics identify the request and redact structured error labels without retrying or retaining bodies', async () => {
  const key='fixture+secret/key',other='other-private-token',env={KOPIS_SERVICE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:other}
  let calls=0
  const client=createCollectionKopisClient({env,delay:instant,fetchImpl:async()=>{
    calls++
    return new Response(`<html><head><title>Bad Request ${encodeURIComponent(encodeURIComponent(key))} ${other} https://kopis.or.kr/?service=${key}</title></head><body>private response body</body></html>`,{status:400,headers:{'Content-Type':'text/html; charset=utf-8'}})
  }})
  await assert.rejects(client.list({conditions,state:'01',page:2}),error=>{
    assert.equal(error.code,'KOPIS_HTTP_400');assert.equal(error.retryable,false)
    const diagnostic=getKopisDiagnostic(error),serialized=JSON.stringify(diagnostic)
    assert.deepEqual(diagnostic.request,{origin:'https://kopis.or.kr',method:'GET',endpoint:'/openApi/restful/pblprfr',query:{stdate:'20261014',eddate:'20261113',signgucode:'11',shcate:'CCCA',prfstate:'01',cpage:'2',rows:'100'}})
    assert.equal(diagnostic.response.http_status,400);assert.equal(diagnostic.response.body_kind,'HTML')
    assert.ok(diagnostic.response.upstream_message.includes('Bad Request'))
    for(const secret of [key,other,encodeURIComponent(key),encodeURIComponent(encodeURIComponent(key)),'private response body','?service='])assert.ok(!serialized.includes(secret),secret)
    return true
  })
  assert.equal(calls,1)
})

test('HTTP 200 API errors and unexpected HTML remain failures while an empty dbs is valid',async()=>{
  for(const [body,code]of [
    ['<dbs><db><returncode>02</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR</errmsg></db></dbs>','KOPIS_AUTH_ERROR'],
    ['<html><title>Bad Gateway</title></html>','KOPIS_RESPONSE_INVALID'],
    ['<dbs><error>API failure</error></dbs>','KOPIS_RESPONSE_INVALID'],
  ]){
    let calls=0
    const client=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'fixture-secret'},delay:instant,fetchImpl:async()=>{calls++;return new Response(body,{headers:{'Content-Type':'application/xml'}})}})
    await assert.rejects(client.list({conditions,state:'01',page:1}),error=>{
      assert.equal(error.code,code);assert.equal(getKopisDiagnostic(error).response.http_status,200)
      if(code==='KOPIS_AUTH_ERROR')assert.equal(getKopisDiagnostic(error).response.upstream_code,'02')
      return true
    })
    assert.equal(calls,1)
  }
  const client=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'fixture-secret'},delay:instant,fetchImpl:async()=>xml('')})
  assert.deepEqual(await client.list({conditions,state:'01',page:1}),[])
  await assert.rejects(client.detail('PF900001'),{code:'DETAIL_MISSING'})
})

test('unreadable or oversized HTTP error bodies preserve the HTTP failure and bounded diagnostics',async()=>{
  for(const unreadable of [false,true]){
    let calls=0
    const client=createCollectionKopisClient({env:{KOPIS_SERVICE_KEY:'fixture-secret'},delay:instant,fetchImpl:async()=>{
      calls++
      const body=unreadable?new ReadableStream({start(controller){controller.error(new Error('private stream failure'))}}):'<title>'+('a'.repeat(17000))+'fixture-secret</title>'
      return new Response(body,{status:400,headers:{'Content-Type':'text/html'}})
    }})
    await assert.rejects(client.detail('PF900001'),error=>{
      assert.equal(error.code,'KOPIS_HTTP_400')
      const diagnostic=getKopisDiagnostic(error)
      assert.equal(diagnostic.response[unreadable?'body_unavailable':'body_truncated'],true)
      assert.ok(!JSON.stringify(diagnostic).includes('fixture-secret'))
      return true
    })
    assert.equal(calls,1)
  }
})

test('normalize overlapping performances, original URLs, image order and nullable source timestamp', () => {
  const snapshot = normalize(row('PF900001', { updatedate: '2026-10-14 00:00:00', styurls: {
    styurl: ['https://kopis.or.kr/detail2.jpg', 'https://kopis.or.kr/poster.jpg', 'https://kopis.or.kr/detail.jpg', 'https://kopis.or.kr/detail.jpg'],
  } }))
  assert.equal(snapshot.concert.start_date, '2026-10-01')
  assert.equal(snapshot.concert.region, '서울')
  assert.equal(snapshot.concert.kopis_updated_at, '2026-10-14T00:00:00+09:00')
  assert.equal(normalize(row('PF900001', { updatedate: '2026-10-14 15:00:00.129791' })).concert.kopis_updated_at,
    '2026-10-14T15:00:00.129791+09:00')
  assert.deepEqual(snapshot.images.map((i) => [i.image_type, i.sort_order]), [['POSTER', 0], ['DETAIL', 0], ['DETAIL', 2]])
  assert.equal(normalize().concert.kopis_updated_at, null)
  assert.equal(normalize(row('PF900001', { prfpdto: '2026.10.14' })).concert.end_date, '2026-10-14')
  assert.equal(normalize(row('PF900001', { prfpdfrom: '2026.11.13' })).concert.start_date, '2026-11-13')
  assert.equal(normalize(row('PF900001', { poster: '', styurls: '' })).images.length, 0)
})

test('invalid dates, IDs, category, state, image snapshots and updatedate fail without correction', () => {
  for (const extra of [
    { mt20id: '' }, { prfpdfrom: '2026.02.30' }, { prfpdto: '2026.09.30' }, { updatedate: '2026-02-30 12:00:00' },
    { updatedate: '2026-10-14 24:00:00' }, { updatedate: 'yesterday' }, { area: '부산광역시' },
    { genrenm: '뮤지컬' }, { prfstate: '공연완료' }, { prfstate: '' }, { prfnm: '' }, { fcltynm: '' },
    { prfpdfrom: '2026.11.14' }, { prfpdto: '2026.10.13' }, { poster: 'javascript:alert(1)' },
    { styurls: 'malformed' }, { styurls: { unknown: 'x' } }, { styurls: { styurl: [''] } },
  ]) assert.throws(() => normalize(row('PF900001', extra)))
  assert.throws(() => normalizeCollectionDetail(row(), 'PF900002', conditions, new Date(now()).toISOString()))
})

test('all pages and states are processed, IDs deduplicated and failures do not consume the save limit', async () => {
  const pages = [], saved = [], detailCalls = []
  const full = Array.from({ length: 100 }, (_, i) => row(`PF${900000 + i}`))
  const client = {
    list: async ({ page, state }) => {
      pages.push([state, page])
      return state === '02' ? page === 1 ? full : [row('PF900100'), row('PF900000'), row('')] : [row('PF900101')]
    },
    detail: async (id) => { detailCalls.push(id); if (id === 'PF900005') throw new Error('secret URL'); return row(id) },
  }
  const report = await collectConcerts({ client, repository: { save: async (s) => saved.push(s) }, limit: 200, now })
  assert.deepEqual(pages, [['02', 1], ['02', 2], ['01', 1]])
  assert.equal(report.listRows, 104)
  assert.equal(report.uniqueConcerts, 102)
  assert.equal(report.saved, 101)
  assert.equal(report.imageCount, 202)
  assert.equal(report.failed, 2)
  assert.equal(detailCalls.length, 102)
  assert.equal(report.allPagesExhausted, true)
  assert.equal(JSON.stringify(report).includes('secret URL'), false)
})

test('dry-run never writes, counts candidate images and stops on successful normalization limit', async () => {
  let writes = 0, lists = 0
  const report = await collectConcerts({ dryRun: true, now, limit: 2,
    repository: { save: async () => { writes++ } },
    client: { list: async () => { lists++; return [row('PF900001'), row('PF900002'), row('PF900003')] }, detail: async (id) => row(id) },
  })
  assert.equal(writes, 0)
  assert.equal(lists, 1)
  assert.equal(report.normalized, 2)
  assert.equal(report.saved, 0)
  assert.equal(report.imageCount, 4)
  assert.equal(report.limitReached, true)
  assert.equal(report.allPagesExhausted, false)
  assert.equal(report.preview.length, 2)
})

test('detail or write failure leaves previous images untouched, continues to next concert and reaches success limit', async () => {
  const snapshots = new Map()
  const repository = { save: async (s) => { if (s.concert.kopis_id === 'PF900003') throw new Error('db secret'); snapshots.set(s.concert.kopis_id, s) } }
  snapshots.set('PF900001', normalize(row()))
  const original = structuredClone(snapshots.get('PF900001'))
  const report = await collectConcerts({ now, limit: 1, repository, client: {
    list: async () => [row('PF900001'), row('PF900002'), row('PF900003'), row('PF900004')],
    detail: async (id) => {
      if (id === 'PF900001') throw new CollectionError('DETAIL_FAILED', 'Detail request failed')
      return row(id, id === 'PF900002' ? { styurls: 'invalid' } : {})
    },
  } })
  assert.equal(report.saved, 1)
  assert.equal(report.failed, 3)
  assert.equal(snapshots.has('PF900004'), true)
  assert.deepEqual(snapshots.get('PF900001'), original)
})

test('list page failure is reported as incomplete and the next state still runs', async () => {
  const report = await collectConcerts({ dryRun: true, now, client: {
    list: async ({ state }) => { if (state === '02') throw new CollectionError('KOPIS_HTTP_503', 'KOPIS HTTP 503'); return [row()] },
    detail: async () => row(),
  } })
  assert.equal(report.pageFailures.length, 1)
  assert.equal(report.normalized, 1)
  assert.equal(report.allPagesExhausted, false)
  assert.equal(report.failed, 1)
})

test('KOPIS client applies verified parameters, tolerant row validation and detail identity checks', async () => {
  const requests = []
  const client = createCollectionKopisClient({ env: { KOPIS_SERVICE_KEY: 'fixture-secret' }, delay: instant,
    fetchImpl: async (url, options) => { requests.push([url, options]); return xml(xmlRow('PF900001') + '<db><prfnm>missing ID</prfnm></db>') },
  })
  const rows = await client.list({ conditions, state: '02', page: 3 })
  assert.equal(rows.length, 2)
  const [url, options] = requests[0]
  assert.deepEqual(Object.fromEntries(url.searchParams), { service: 'fixture-secret', stdate: '20261014', eddate: '20261113', signgucode: '11', shcate: 'CCCA', prfstate: '02', cpage: '3', rows: '100' })
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.redirect, 'error')
  assert.throws(() => parseKopisXml('<dbs><db><prfnm>missing ID</prfnm></db></dbs>'))
  await assert.rejects(client.detail('PF900001'), { code: 'DETAIL_MISSING' })
})

test('HTTP requests retry transient errors up to 3 times, never retry authentication and suppress secret errors', async () => {
  let attempts = 0
  const result = await requestWithRetry(new URL('https://example.com'), { delay: instant,
    fetchImpl: async () => { attempts++; return attempts < 3 ? new Response('', { status: 503 }) : new Response('ok') },
  })
  assert.equal(result, 'ok'); assert.equal(attempts, 3)
  attempts = 0
  await assert.rejects(requestWithRetry(new URL('https://example.com'), { delay: instant,
    fetchImpl: async () => { attempts++; throw new Error('fixture-secret-url') },
  }), (error) => !error.message.includes('fixture-secret'))
  assert.equal(attempts, 3)
  attempts = 0
  await assert.rejects(requestWithRetry(new URL('https://example.com'), { delay: instant,
    fetchImpl: async () => { attempts++; return new Response('', { status: 401 }) },
  }), { code: 'UPSTREAM_HTTP_401' })
  assert.equal(attempts, 1)
  attempts = 0
  const client = createCollectionKopisClient({ env: { KOPIS_SERVICE_KEY: 'fixture-secret' }, delay: instant,
    fetchImpl: async () => { attempts++; return xml('<db><returncode>02</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR</errmsg></db>') },
  })
  await assert.rejects(client.list({ conditions, state: '02', page: 1 }), { code: 'KOPIS_AUTH_ERROR' })
  assert.equal(attempts, 1)
})

test('KOPIS HTTP diagnostics retain the real status and safe media type without bodies or retrying 400', async () => {
  const requests = []
  const client = createCollectionKopisClient({ env: { KOPIS_SERVICE_KEY: 'fixture-secret' }, delay: instant,
    fetchImpl: async (url) => {
      requests.push(url)
      return new Response('reflected service=fixture-secret; upstream private error', {
        status: 400, headers: { 'content-type': 'application/xml; charset=UTF-8' },
      })
    },
  })
  await assert.rejects(client.detail('PF900001'), error => {
    assert.equal(error.code, 'KOPIS_HTTP_400'); assert.equal(error.http_status, 400)
    assert.equal(error.content_type, 'application/xml'); assert.equal(error.retryable, false)
    assert.ok(!JSON.stringify(error).includes('fixture-secret'))
    assert.ok(!JSON.stringify(error).includes('upstream private error'))
    return true
  })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].pathname, '/openApi/restful/pblprfr/PF900001')
  assert.deepEqual([...requests[0].searchParams.keys()], ['service'])
  await assert.rejects(requestWithRetry('https://example.com', {
    fetchImpl: async () => new Response('', { status: 400, headers: { 'content-type': 'secret-reflected-header' } }),
  }), error => error.http_status === 400 && error.content_type === null)
  const invalidXml = createCollectionKopisClient({ env: { KOPIS_SERVICE_KEY: 'fixture-secret' }, delay: instant,
    fetchImpl: async () => new Response('not XML', { status: 200 }),
  })
  await assert.rejects(invalidXml.detail('PF900001'), error => error.code !== 'KOPIS_HTTP_400' && error.http_status === undefined)
})

test('Supabase server adapter sends a single transaction RPC, retries safely and hides error bodies', async () => {
  const requests = []
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' }
  const repository = createSupabaseCollector({ env, delay: instant, fetchImpl: async (url, options) => {
    requests.push([url, options]); return new Response('"12345678-1234-1234-1234-123456789abc"', { headers: { 'Content-Type': 'application/json' } })
  } })
  const snapshot = normalize()
  await repository.save(snapshot)
  assert.equal(requests.length, 1)
  assert.equal(requests[0][0].pathname, '/rest/v1/rpc/sync_kopis_concert')
  assert.equal(requests[0][1].headers.Authorization, 'Bearer fixture-secret')
  assert.deepEqual(JSON.parse(requests[0][1].body), { p_concert: snapshot.concert, p_images: snapshot.images })
  const bad = createSupabaseCollector({ env, delay: instant, fetchImpl: async () => new Response('secret database error', { status: 400 }) })
  await assert.rejects(bad.save(snapshot), (e) => e.code === 'SUPABASE_HTTP_400' && !e.message.includes('secret'))
  assert.throws(() => createSupabaseCollector({ env: {} }), { code: 'SUPABASE_NOT_CONFIGURED' })
  assert.throws(() => createSupabaseCollector({ env: { ...env, SUPABASE_URL: 'http://example.com' } }), { code: 'SUPABASE_URL_INVALID' })
  const secret = createSupabaseCollector({ env: { ...env, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' }, fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.headers.apikey, 'sb_secret_fixture')
    return new Response('"12345678-1234-1234-1234-123456789abc"')
  } })
  await secret.save(snapshot)
})
