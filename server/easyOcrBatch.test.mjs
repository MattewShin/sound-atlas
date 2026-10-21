import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { runEasyOcrBatch } from './easyOcrBatch.mjs'
import { EASYOCR_PIPELINE_VERSION, getEasyOcrConfig, parseEasyOcrArgs } from './easyOcrConfig.mjs'
import { CollectionError } from './collectionHttp.mjs'
import { validateEasyOcrResult, createEasyOcrWorker } from './easyOcrWorker.mjs'
import { downloadKopisImage, imageValidationKey, IMAGE_LIMIT_CODE } from './kopisImageDownload.mjs'
import { createSupabaseOcr } from './supabaseOcr.mjs'

const now = () => Date.parse('2026-10-14T00:00:00Z')
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const image = (n) => ({ id: uuid(n), source_url: `https://kopis.or.kr/upload/${n}.jpg`, concerts: { kopis_id: `PF90000${n}` } })
const downloaded = { contentHash: 'a'.repeat(64), buffer: Buffer.from('fixture'), width: 10, height: 20 }
const result = { raw_text: '프로그램\nBeethoven', detections: [], mean_confidence: null, engine_version: '1.7.2', torch_version: 'test', width: 10, height: 20 }
const repository = (images = [image(1)], saved = []) => ({
  preflight: async () => {}, candidates: async function* () { yield* images }, findResult: async () => null,
  saveAttempt: async (attempt, output) => saved.push({ attempt, result: output }),
})
const worker = () => ({ recognize: async () => result, close: () => {} })

test('EasyOCR CLI uses a small image limit, validates options and shares KST conditions', () => {
  assert.equal(parseEasyOcrArgs([]).limit, 3)
  assert.equal(parseEasyOcrArgs(['--limit=7', '--dry-run', '--force']).limit, 7)
  for (const args of [['--limit'], ['--limit=0'], ['--limit=1.5'], ['--limit=-3'], ['--poster']]) assert.throws(() => parseEasyOcrArgs(args))
  assert.equal(getEasyOcrConfig({}).timeoutMs, 180000)
  assert.throws(() => getEasyOcrConfig({ EASYOCR_TIMEOUT_MS: 'Infinity' }))
  // Tesseract-only configuration must not prevent a local EasyOCR batch from starting.
  const batchConfig = getEasyOcrConfig({ OCR_TIMEOUT_MS: 'invalid', CONCERT_MORE_CHECK_LIMIT: 'invalid', OCR_MAX_IMAGE_BYTES: '2000000' })
  assert.equal(batchConfig.maxBytes, 2000000)
  assert.equal(batchConfig.recognizeTimeoutMs, undefined)
})

test('list only needs existing collection tables and never downloads, starts Python or writes', async () => {
  const repo = repository([image(1), image(2), image(3)])
  repo.preflight = async () => assert.fail('must not require OCR migration')
  const report = await runEasyOcrBatch({ repository: repo, listOnly: true, limit: 2, now,
    download: () => assert.fail('no downloads'), worker: undefined })
  assert.equal(report.scanned, 2)
  assert.equal(report.attempted, 0)
  assert.equal(report.limitReached, true)
  assert.equal(report.conditions.from, '2026-10-14')
})

test('dry-run executes real recognition but never reads/writes OCR tables', async () => {
  const repo = repository()
  repo.preflight = repo.findResult = repo.saveAttempt = async () => assert.fail('no OCR table calls')
  let recognizes = 0, closed = false
  const report = await runEasyOcrBatch({ repository: repo, dryRun: true, now,
    download: async () => downloaded, worker: { recognize: async () => { recognizes++; return result }, close: () => { closed = true } } })
  assert.equal(recognizes, 1); assert.equal(closed, true)
  assert.equal(report.recognized, 1); assert.equal(report.saved, 0)
  assert.equal(report.preview[0].characters, result.raw_text.length)
})

test('same URL is freshly hashed; cache hits do not consume the new OCR attempt limit', async () => {
  const saved = [], repo = repository([image(1), image(2), image(3)], saved)
  let downloads = 0
  repo.findResult = async (id, hash) => id === image(1).id && hash === 'a'.repeat(64) ? { id: uuid(100) } : null
  const report = await runEasyOcrBatch({ repository: repo, limit: 1, now,
    download: async () => { downloads++; return downloaded }, worker: worker() })
  assert.equal(downloads, 2)
  assert.equal(report.cached, 1); assert.equal(report.attempted, 1); assert.equal(report.saved, 1)
  assert.equal(saved[0].attempt.image_id, image(2).id)
  assert.equal(saved[0].attempt.status, 'SUCCEEDED')
  assert.equal(saved[0].attempt.content_sha256, downloaded.contentHash)
})

test('changed bytes and force cause recognition instead of reusing an old artifact', async () => {
  const repo = repository()
  let recognizes = 0
  repo.findResult = async (id, hash) => hash === 'b'.repeat(64) ? { id: uuid(100) } : null
  const run = (force) => runEasyOcrBatch({ repository: repo, force, now,
    download: async () => downloaded, worker: { recognize: async () => { recognizes++; return result }, close() {} } })
  assert.equal((await run(false)).saved, 1)
  repo.findResult = async () => assert.fail('force must not use cache')
  assert.equal((await run(true)).saved, 1)
  assert.equal(recognizes, 2)
})

test('download and OCR failures persist only failed attempts, continue and respect the attempt cap', async () => {
  const saved = [], repo = repository([image(1), image(2), image(3), image(4)], saved)
  const report = await runEasyOcrBatch({ repository: repo, now, limit: 3,
    download: async (url) => { if (url === image(1).source_url) throw new CollectionError('OCR_DOWNLOAD_FAILED', 'download failed'); return downloaded },
    worker: { recognize: async () => { if (saved.length === 1) throw new Error('secret'); return result }, close() {} },
  })
  assert.equal(report.scanned, 3); assert.equal(report.attempted, 3); assert.equal(report.failed, 2); assert.equal(report.saved, 1)
  assert.equal(saved[0].attempt.content_sha256, null)
  assert.equal(saved[1].attempt.content_sha256, downloaded.contentHash)
  assert.equal(saved[0].result, null); assert.equal(saved[1].result, null)
  assert.equal(saved[2].attempt.status, 'SUCCEEDED')
  assert.ok(!JSON.stringify(report).includes('secret'))
})

test('DB save failure is distinguished from OCR success; cancellation closes worker without result writes', async () => {
  const repo = repository()
  repo.saveAttempt = async () => { throw new Error('sensitive DB body') }
  const report = await runEasyOcrBatch({ repository: repo, now, download: async () => downloaded, worker: worker() })
  assert.equal(report.recognized, 1); assert.equal(report.saved, 0); assert.equal(report.failures[0].stage, 'save')
  const abort = new AbortController(); abort.abort()
  let closed = false
  const cancelled = await runEasyOcrBatch({ repository: repo, now, signal: abort.signal,
    download: () => assert.fail('cancelled'), worker: { close() { closed = true } } })
  assert.equal(cancelled.cancelled, true); assert.equal(closed, true)
})

test('Python protocol validates text, geometry, confidence and known engine configuration', () => {
  const output = { pipelineVersion: EASYOCR_PIPELINE_VERSION, engineVersion: '1.7.2', torchVersion: '2.x', width: 10, height: 20,
    text: 'Beethoven', meanConfidence: 0.8, detections: [{ text: 'Beethoven', confidence: 0.8, bbox: [[0, 0], [10, 0], [10, 20], [0, 20]] }] }
  assert.equal(validateEasyOcrResult(output, downloaded).raw_text, 'Beethoven')
  for (const patch of [{ engineVersion: 'wrong' }, { text: 'different' }, { meanConfidence: 1.5 }, { width: 100 },
    { detections: [{ ...output.detections[0], confidence: NaN }] }, { detections: [{ ...output.detections[0], bbox: [[Infinity, 0]] }] }]) {
    assert.throws(() => validateEasyOcrResult({ ...output, ...patch }, downloaded), { code: 'OCR_WORKER_PROTOCOL' })
  }
  assert.equal(validateEasyOcrResult({ ...output, text: '', meanConfidence: null, detections: [] }, downloaded).mean_confidence, null)
})

test('Python subprocess receives no server keys, times out, is killed, and cleans temporary images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-easyocr-test-'))
  let killed = false, environment
  const config = { ...getEasyOcrConfig({}), tempDirectory: directory, timeoutMs: 20 }
  const w = createEasyOcrWorker({ config, spawnImpl: (python, args, options) => {
    environment = options.env
    const process = new EventEmitter()
    process.stdin = new PassThrough(); process.stdout = new PassThrough(); process.stderr = new PassThrough()
    process.kill = () => { killed = true }
    return process
  } })
  try {
    await assert.rejects(w.recognize(downloaded), { code: 'EASYOCR_TIMEOUT' })
    assert.equal(killed, true)
    assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined)
    assert.equal(environment.KOPIS_SERVICE_KEY, undefined)
    assert.equal(environment.PYTHONUTF8, '1')
    assert.deepEqual(await readdir(directory), [])
  } finally { w.close(); await rmdir(directory) }
})

test('stage cancellation terminates only the owned worker object, drains shutdown and removes its temporary image',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-easyocr-test-')),controller=new AbortController(),terminated=[]
  let started
  const ready=new Promise(resolve=>{started=resolve}),unrelated={kind:'Vite/other Python',stopped:false}
  const owned=new EventEmitter();owned.stdin=new PassThrough();owned.stdout=new PassThrough();owned.stderr=new PassThrough()
  const w=createEasyOcrWorker({config:{...getEasyOcrConfig({}),tempDirectory:directory},
    spawnImpl:()=>{started();return owned},terminateImpl:child=>{terminated.push(child);return Promise.resolve()}})
  try{
    const cancelled=assert.rejects(w.recognize(downloaded,{signal:controller.signal}),{code:'OCR_ABORTED'})
    await ready;controller.abort('OCR_STAGE_BUDGET_EXHAUSTED');await cancelled;await w.close();await w.close()
    assert.deepEqual(terminated,[owned]);assert.equal(unrelated.stopped,false)
    assert.deepEqual(await readdir(directory),[])
  }finally{await w.close();await rmdir(directory)}
})

test('download enforces KOPIS source, streams byte caps, validates pixels and hashes original bytes', async () => {
  const buffer = await sharp({ create: { width: 8, height: 12, channels: 3, background: 'white' } }).png().toBuffer()
  const config = getEasyOcrConfig({})
  const download = (url, options = {}) => downloadKopisImage(url, { config, delay: async () => {}, fetchImpl: async () => new Response(buffer), ...options })
  const value = await download('http://www.kopis.or.kr/upload/test.png')
  assert.equal(value.width, 8); assert.equal(value.height, 12); assert.equal(value.contentHash.length, 64)
  for (const url of ['http://127.0.0.1/upload/x', 'https://kopis.or.kr.evil.test/upload/x', 'https://kopis.or.kr/other/x', 'https://user:pass@kopis.or.kr/upload/x']) {
    await assert.rejects(download(url), { code: 'OCR_SOURCE_BLOCKED' })
  }
  await assert.rejects(download('https://kopis.or.kr/upload/x', { config: { ...config, maxBytes: 1 } }), { code: 'OCR_IMAGE_TOO_LARGE' })
  await assert.rejects(download('https://kopis.or.kr/upload/x', { fetchImpl: async () => new Response('not an image') }), { code: 'OCR_IMAGE_INVALID' })
})

test('only confirmed pixel/dimension limits get a hashed limit error; corrupt, animated and HTTP failures stay distinct', async () => {
  const config = { ...getEasyOcrConfig({}), maxPixels: 100000 }
  const jpeg = async (width, height) => sharp({create:{width,height,channels:3,background:'white'}}).jpeg().toBuffer()
  const pixel = await jpeg(500,500), tall = await jpeg(1,20001), wide = await jpeg(20001,1)
  const source = 'https://kopis.or.kr/upload/fixture.jpg'
  const download = (raw, options={}) => downloadKopisImage(source,{config,fetchImpl:async()=>new Response(raw),...options})
  for(const [raw,reason] of [[pixel,'PIXEL_LIMIT'],[tall,'DIMENSION_LIMIT'],[wide,'DIMENSION_LIMIT']]){
    let rejection
    await assert.rejects(download(raw),error=>{rejection=error;return error.code===IMAGE_LIMIT_CODE && error.imageLimit.reason===reason})
    assert.equal(rejection.imageLimit.contentHash.length,64)
    assert.equal(rejection.imageLimit.validationKey,imageValidationKey(config))
    const saved=[],repo=repository([image(1)],saved)
    const report=await runEasyOcrBatch({repository:repo,now,download:()=>{throw rejection},worker:{recognize:()=>assert.fail('no Python'),close(){}}})
    assert.equal(report.failed,1);assert.equal(saved.length,1)
    assert.equal(saved[0].attempt.content_sha256,rejection.imageLimit.contentHash)
    assert.equal(saved[0].result,null)
    const knownLimit={...rejection.imageLimit,sourceUrl:source}
    assert.equal((await download(raw,{knownLimit})).held,true)
    await assert.rejects(download(raw,{knownLimit:{...knownLimit,validationKey:'old conditions'}}),{code:IMAGE_LIMIT_CODE})
  }
  await assert.rejects(download(Buffer.from('not an image')),{code:'OCR_IMAGE_INVALID'})
  // A valid header with damaged scan data must not be mislabeled as a limit.
  const valid=await jpeg(8,12),scan=valid.indexOf(Buffer.from([255,218]))
  await assert.rejects(download(valid.subarray(0,scan+2)),{code:'OCR_IMAGE_INVALID'})
  const animated=await sharp(Buffer.concat([Buffer.alloc(12,0),Buffer.alloc(12,255)]),
    {raw:{width:2,height:4,pageHeight:2,channels:3}}).gif().toBuffer()
  assert.equal((await sharp(animated).metadata()).pages,2)
  await assert.rejects(download(animated),{code:'OCR_IMAGE_INVALID'})
  await assert.rejects(download(valid,{fetchImpl:async()=>new Response('no image',{status:404})}),{code:'OCR_IMAGE_HTTP_404'})
  let tries=0
  await assert.rejects(download(valid,{fetchImpl:async()=>{tries++;throw Error('private network error')},delay:async()=>{}}),{code:'OCR_IMAGE_REQUEST_FAILED'})
  assert.equal(tries,3)
})

test('an unchanged held source creates no OCR attempt or cache lookup and continues to the next image',async()=>{
  const saved=[],repo=repository([image(1),image(2)],saved)
  repo.findResult=async id=>{assert.equal(id,image(2).id);return null}
  let calls=0
  const report=await runEasyOcrBatch({repository:repo,now,limit:1,
    download:async()=>++calls===1?{held:true,contentHash:'a'.repeat(64)}:downloaded,worker:worker()})
  assert.equal(report.held,1);assert.equal(report.attempted,1);assert.equal(report.failed,0)
  assert.equal(report.saved,1);assert.equal(saved.length,1);assert.equal(saved[0].attempt.image_id,image(2).id)
})

test('Supabase candidates use active DETAIL/date/status filters and traverse later pages', async () => {
  const calls = []
  const repo = createSupabaseOcr({ env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' },
    fetchImpl: async (url) => {
      calls.push(url)
      return new Response(JSON.stringify(url.searchParams.has('id') ? [image(3)] : [image(1), image(2)]))
    },
  })
  const rows = []
  for await (const candidate of repo.candidates({ now: now(), pageSize: 2 })) rows.push(candidate)
  assert.equal(rows.length, 3); assert.equal(calls.length, 2)
  assert.equal(calls[0].searchParams.get('image_type'), 'eq.DETAIL')
  assert.equal(calls[0].searchParams.get('is_active'), 'eq.true')
  assert.equal(calls[0].searchParams.get('concerts.start_date'), 'lte.2026-11-13')
  assert.equal(calls[0].searchParams.get('concerts.end_date'), 'gte.2026-10-14')
  assert.equal(calls[1].searchParams.get('id'), `gt.${uuid(2)}`)
})

test('missing OCR migration is diagnosed before downloads or recognition', async () => {
  const repo = createSupabaseOcr({ env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture' },
    fetchImpl: async () => new Response('', { status: 404 }),
  })
  let closed = false
  await assert.rejects(runEasyOcrBatch({ repository: repo, download: () => assert.fail('no download'),
    worker: { ...worker(), close: () => { closed = true } } }), { code: 'OCR_MIGRATION_REQUIRED' })
  assert.equal(closed, true)
})
