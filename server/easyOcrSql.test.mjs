import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { EASYOCR_PIPELINE_VERSION, EASYOCR_SETTINGS } from './easyOcrConfig.mjs'

test('OCR SQL keeps successes across retries, failures, changed content, recollection and inactive sources', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;')
    for (const name of ['202610140001_concert_collection.sql', '202610140002_concert_image_ocr.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    }
    await db.exec('set role service_role')
    const concert = { kopis_id: 'PF900001', title: 'Local SQL fixture', venue: 'Local fixture', region: '서울',
      start_date: '2026-10-01', end_date: '2026-11-01', performance_status: '공연중', poster_url: null, kopis_updated_at: null, synced_at: '2026-10-14T00:00:00Z' }
    const images = [{ source_url: 'https://kopis.or.kr/upload/local-fixture.png', image_type: 'DETAIL', sort_order: 0 }]
    const collect = (list = images) => db.query('select public.sync_kopis_concert($1::jsonb, $2::jsonb)', [JSON.stringify(concert), JSON.stringify(list)])
    await collect()
    const imageId = (await db.query('select id from public.concert_program_images')).rows[0].id
    const attempt = { id: randomUUID(), image_id: imageId, source_url: images[0].source_url,
      content_sha256: 'a'.repeat(64), pipeline_version: EASYOCR_PIPELINE_VERSION, status: 'SUCCEEDED', error_code: null,
      started_at: '2026-10-14T00:00:00Z', finished_at: '2026-10-14T00:00:01Z', duration_ms: 1000 }
    const result = { raw_text: 'PROGRAM\nBeethoven', detections: [], mean_confidence: null, width: 100, height: 200,
      engine_version: '1.7.2', torch_version: 'local-test', settings: EASYOCR_SETTINGS }
    const record = (a = attempt, r = result) => db.query('select public.record_concert_image_ocr($1::jsonb, $2::jsonb) as id', [JSON.stringify(a), r === null ? null : JSON.stringify(r)])
    const count = async (table) => (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n
    assert.equal((await record()).rows[0].id, attempt.id)
    await record() // same HTTP request UUID
    assert.equal(await count('concert_image_ocr_results'), 1)
    assert.equal(await count('concert_image_ocr_attempts'), 1)
    const original = (await db.query('select * from public.concert_image_ocr_results')).rows[0]
    await record({ ...attempt, id: randomUUID() }, { ...result, raw_text: 'different forced reading' })
    assert.deepEqual((await db.query('select * from public.concert_image_ocr_results')).rows[0], original)
    assert.equal(await count('concert_image_ocr_attempts'), 2)

    await record({ ...attempt, id: randomUUID(), status: 'FAILED', error_code: 'EASYOCR_TIMEOUT' }, null)
    await record({ ...attempt, id: randomUUID(), status: 'FAILED', error_code: 'OCR_DOWNLOAD_FAILED', content_sha256: null }, null)
    assert.equal(await count('concert_image_ocr_results'), 1)
    assert.equal(await count('concert_image_ocr_attempts'), 4)
    assert.deepEqual((await db.query('select * from public.concert_image_ocr_results')).rows[0], original)

    await record({ ...attempt, id: randomUUID(), content_sha256: 'b'.repeat(64) })
    assert.equal(await count('concert_image_ocr_results'), 2)
    await collect()
    assert.equal((await db.query('select id from public.concert_program_images')).rows[0].id, imageId)
    assert.equal(await count('concert_image_ocr_results'), 2)

    // Constraint failure rolls back both a new artifact and its attempt.
    await assert.rejects(record({ ...attempt, id: randomUUID(), content_sha256: 'c'.repeat(64), duration_ms: -1 }))
    assert.equal(await count('concert_image_ocr_results'), 2)
    assert.equal(await count('concert_image_ocr_attempts'), 5)
    await assert.rejects(record({ ...attempt, id: randomUUID(), status: 'FAILED', error_code: 'EASYOCR_TIMEOUT' }, result))
    await assert.rejects(record({ ...attempt, id: randomUUID(), source_url: 'https://kopis.or.kr/upload/different.png' }))

    await collect([])
    assert.equal(await count('concert_image_ocr_results'), 2)
    await assert.rejects(record({ ...attempt, id: randomUUID() }), /no longer an active DETAIL/)
    await collect()

    await db.exec('reset role')
    const tables = ['concert_image_ocr_results', 'concert_image_ocr_attempts']
    for (const table of tables) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid = $1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true)
      assert.equal((await db.query('select count(*)::int as n from pg_policies where schemaname = $1 and tablename = $2', ['public', table])).rows[0].n, 0)
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const table of tables) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/)
      await assert.rejects(record(), /permission denied/)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})
