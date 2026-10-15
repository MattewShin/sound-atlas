import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { collectConcerts, collectionConditions, normalizeCollectionDetail } from './concertCollector.mjs'

// Isolated in-memory PostgreSQL. No network, credentials or production table writes.
test('migration and RPC enforce atomic, idempotent snapshots, preserve future analysis data and restrict access', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;')
    await db.exec(await readFile(new URL('../supabase/migrations/202610140001_concert_collection.sql', import.meta.url), 'utf8'))
    const time = Date.parse('2026-10-14T00:00:00Z')
    const detail = {
      mt20id: 'PF900001', prfnm: '로컬 SQL 검증', fcltynm: '검증홀', area: '서울특별시',
      prfpdfrom: '2026.09.01', prfpdto: '2026.11.13', genrenm: '서양음악(클래식)', prfstate: '공연중',
      poster: 'https://example.org/poster.jpg', styurls: { styurl: ['https://example.org/a.jpg', 'https://example.org/b.jpg'] },
      updatedate: '2026-10-14 15:00:00.129791',
    }
    const snapshot = normalizeCollectionDetail(detail, detail.mt20id, collectionConditions(time), new Date(time).toISOString())
    const save = async (s) => (await db.query('select public.sync_kopis_concert($1::jsonb, $2::jsonb) as id',
      [JSON.stringify(s.concert), JSON.stringify(s.images)])).rows[0].id
    await db.exec('set role service_role')
    const id = await save(snapshot)
    const firstImages = (await db.query('select id, source_url, created_at from public.concert_program_images order by source_url')).rows
    assert.equal(await save(snapshot), id)
    assert.equal((await db.query('select count(*)::int as n from public.concerts')).rows[0].n, 1)
    assert.deepEqual((await db.query('select id, source_url, created_at from public.concert_program_images order by source_url')).rows, firstImages)
    assert.equal((await db.query("select to_char(kopis_updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') as t from public.concerts")).rows[0].t, '2026-10-14 06:00:00.129791')

    // Simulate a later analysis column/table only inside this ephemeral database.
    await db.exec("reset role; alter table public.concert_program_images add column test_ocr_result text; update public.concert_program_images set test_ocr_result = 'keep'; set role service_role;")
    const changed = structuredClone(snapshot)
    changed.concert.title = '갱신된 제목'
    changed.images = [snapshot.images[0], { source_url: 'https://example.org/c.jpg', image_type: 'DETAIL', sort_order: 0 }]
    await save(changed)
    const images = (await db.query('select * from public.concert_program_images')).rows
    assert.equal(images.length, 4)
    assert.equal(images.filter((image) => image.is_active).length, 2)
    assert.ok(images.filter((image) => image.source_url !== 'https://example.org/c.jpg').every((image) => image.test_ocr_result === 'keep'))
    assert.equal(images.find((image) => image.source_url === snapshot.images[0].source_url).id, firstImages.find((image) => image.source_url === snapshot.images[0].source_url).id)

    const beforeFailure = (await db.query('select * from public.concert_program_images order by source_url')).rows
    const report = await collectConcerts({ now: () => time, limit: 10, repository: { save }, client: {
      list: async ({ state }) => state === '02' ? [detail] : [],
      detail: async () => { throw new Error('detail failed') },
    } })
    assert.equal(report.failed, 1)
    assert.deepEqual((await db.query('select * from public.concert_program_images order by source_url')).rows, beforeFailure)

    // A failing image insert must also roll back the concert metadata update.
    const invalid = structuredClone(changed)
    invalid.concert.title = 'must roll back'
    invalid.images[0].image_type = 'INVALID'
    await assert.rejects(save(invalid))
    assert.equal((await db.query('select title from public.concerts')).rows[0].title, '갱신된 제목')
    assert.deepEqual((await db.query('select * from public.concert_program_images order by source_url')).rows, beforeFailure)

    // Returning URLs reactivate their original row; a successful empty snapshot deactivates all.
    await save(snapshot)
    assert.equal((await db.query('select count(*)::int as n from public.concert_program_images')).rows[0].n, 4)
    assert.equal((await db.query('select count(*)::int as n from public.concert_program_images where is_active')).rows[0].n, 3)
    const empty = structuredClone(snapshot); empty.images = []; empty.concert.poster_url = null; empty.concert.kopis_updated_at = null
    await save(empty)
    assert.equal((await db.query('select count(*)::int as n from public.concert_program_images where is_active')).rows[0].n, 0)
    assert.equal((await db.query('select kopis_updated_at from public.concerts')).rows[0].kopis_updated_at, null)

    await db.exec('reset role')
    assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname = 'public' and tablename in ('concerts', 'concert_program_images')")).rows[0].n, 0)
    assert.ok((await db.query("select relrowsecurity from pg_class where oid in ('public.concerts'::regclass, 'public.concert_program_images'::regclass)")).rows.every((r) => r.relrowsecurity))
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from public.concerts'), /permission denied/)
      await assert.rejects(db.query('select * from public.concert_program_images'), /permission denied/)
      await assert.rejects(save(snapshot), /permission denied/)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})
