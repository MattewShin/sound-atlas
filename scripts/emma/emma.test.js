import assert from 'node:assert/strict'
import test from 'node:test'
import { expectedColumns, validateEmmaCsv } from './emmaCsv.js'

const makeRow = ({ ordinal, artist, title, overrides = {} }) => expectedColumns.map((column) => {
  const value = overrides[column] ?? (column === '' ? ordinal : column === 'artist' ? artist : column === 'title' ? title
    : column === 'Number of Raters' ? '30' : column === 'GEMS Version' ? 'gems-45_mx'
      : ['Spotify ID', 'Youtube Clip', 'Youtube ID', 'Youtube Start-Time', 'Youtube End-Time'].includes(column) ? 'NA' : '1')
  return `"${String(value).replaceAll('"', '""')}"`
}).join(',')

const parseRows = (...rows) => validateEmmaCsv(Buffer.from([expectedColumns.join(','), ...rows].join('\n'), 'utf8'), 'sample.csv')

test('NA/blank are null, numeric zero survives, and stable IDs ignore export ordinal', () => {
  const first = parseRows(makeRow({ ordinal: 1, artist: 'Debussy', title: 'Clair de lune', overrides: { Sadness: '0', Joy: 'NA', Wonder: '' } }))
  const again = parseRows(makeRow({ ordinal: 99, artist: 'Debussy', title: 'Clair de lune', overrides: { Sadness: '0', Joy: 'NA', Wonder: '' } }))
  assert.equal(first.records[0].scores.Sadness, 0)
  assert.equal(first.records[0].scores.Joy, null)
  assert.equal(first.records[0].scores.Wonder, null)
  assert.equal(first.records[0].id, again.records[0].id)
})

test('malformed width, score and displaced composer remain errors', () => {
  const valid = makeRow({ ordinal: 1, artist: 'Chopin', title: '3. Klaviersonate, 4. Satz' })
  const invalidNumber = makeRow({ ordinal: 2, artist: 'Debussy', title: 'Clair de lune', overrides: { Sadness: 'oops' } })
  const shifted = makeRow({ ordinal: 3, artist: 'Dvo,9. Sinfonie', title: '4. Satz' })
  const short = makeRow({ ordinal: 4, artist: 'Bach', title: 'Work' }).split(',').slice(0, -1).join(',')
  const data = parseRows(valid, invalidNumber, shifted, short)
  assert.deepEqual(data.counts, { dataRows: 4, validRows: 1, errorRows: 3 })
  assert.equal(data.errors.some(({ rawRow }) => rawRow.includes('Dvo,9. Sinfonie')), true)
  assert.equal(data.records[0].scores.Sadness, 1)
})

test('accented source names survive Windows-1252 fallback', () => {
  const text = [expectedColumns.join(','), makeRow({ ordinal: 1, artist: 'Frédéric', title: 'Étude' })].join('\n')
  const data = validateEmmaCsv(Buffer.from(text, 'latin1'), 'sample.csv')
  assert.equal(data.source.encoding, 'windows-1252')
  assert.equal(data.records[0].artist, 'Frédéric')
})

