import { createHash } from 'node:crypto'
import { basename } from 'node:path'

export const emotionColumns = [
  'Wonder', 'Transcendence', 'Nostalgia', 'Tenderness', 'Peacefulness',
  'Joy', 'Power', 'Tension', 'Sadness',
]

export const numericColumns = [
  ...emotionColumns, 'Sublimity', 'Vitality', 'Unease', 'ICC',
  'Familiarity', 'Liking', 'Number of Raters',
]

export const expectedColumns = [
  '', 'artist', 'title', ...emotionColumns, 'Sublimity', 'Vitality', 'Unease',
  'ICC', 'Familiarity', 'Liking', 'Spotify ID', 'Youtube Clip', 'Youtube ID',
  'Youtube Start-Time', 'Youtube End-Time', 'Number of Raters', 'GEMS Version',
]

export const decodeEmmaCsv = (bytes) => {
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  try {
    return { text: utf8.decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252', { fatal: true }).decode(bytes), encoding: 'windows-1252' }
  }
}

export const parseCsvRecords = (text) => {
  const records = []
  let fields = []
  let field = ''
  let inQuotes = false
  let rowStart = 0
  let line = 1
  let rowStartLine = 1
  let quoteError = false

  const finishRow = (end) => {
    fields.push(field)
    if (fields.some((value) => value !== '')) {
      records.push({ fields, sourceLine: rowStartLine, rawRow: text.slice(rowStart, end), quoteError })
    }
    fields = []
    field = ''
    quoteError = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (inQuotes) {
        inQuotes = false
      } else if (field === '') {
        inQuotes = true
      } else {
        quoteError = true
        field += char
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      finishRow(index)
      if (char === '\r' && text[index + 1] === '\n') index += 1
      line += 1
      rowStart = index + 1
      rowStartLine = line
    } else {
      field += char
      if (char === '\n') line += 1
    }
  }

  if (inQuotes) quoteError = true
  if (fields.length > 0 || field !== '') finishRow(text.length)
  return records
}

const missingValue = (value) => value.trim() === '' || value.trim().toUpperCase() === 'NA'
const nullableText = (value) => missingValue(value) ? null : value

export const validateEmmaCsv = (bytes, sourcePath) => {
  const { text, encoding } = decodeEmmaCsv(bytes)
  const parsed = parseCsvRecords(text)
  const [headerRecord, ...rows] = parsed
  if (!headerRecord || headerRecord.fields.length !== expectedColumns.length
    || expectedColumns.some((name, index) => headerRecord.fields[index] !== name)) {
    throw new Error('EMMA CSV의 열 이름 또는 순서가 예상한 형식과 다릅니다.')
  }

  const source = {
    label: '사용자 제공 EMMA CSV',
    filename: basename(sourcePath),
    encoding,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  const records = []
  const errors = []
  const ids = new Set()

  rows.forEach((row) => {
    const issues = []
    if (row.quoteError) issues.push('CSV 따옴표 형식 오류')
    if (row.fields.length !== expectedColumns.length) {
      issues.push(`열 개수 ${row.fields.length}개 (예상 ${expectedColumns.length}개)`)
    }

    const raw = Object.fromEntries(expectedColumns.map((name, index) => [name || 'exportOrdinal', row.fields[index] ?? null]))
    const numbers = {}
    if (row.fields.length === expectedColumns.length) {
      numericColumns.forEach((name) => {
        const value = raw[name]
        if (missingValue(value)) {
          numbers[name] = null
        } else if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())
          || (name === 'Number of Raters' && !/^\d+$/.test(value.trim()))) {
          issues.push(`${name} 숫자 형식 오류: ${value}`)
        } else {
          numbers[name] = Number(value)
        }
      })
      if (missingValue(raw.artist) || missingValue(raw.title)) issues.push('작곡가 또는 곡명 누락')
      if (/\d/.test(raw.artist)) issues.push('작곡가 열에 작품번호가 섞여 열 손상 의심')
    }

    if (issues.length > 0) {
      errors.push({ sourceLine: row.sourceLine, issues, rawFields: row.fields, rawRow: row.rawRow })
      return
    }

    const id = `emma-${createHash('sha256').update(JSON.stringify(row.fields.slice(1))).digest('hex').slice(0, 20)}`
    if (ids.has(id)) {
      errors.push({ sourceLine: row.sourceLine, issues: ['동일 내용의 중복 행'], rawFields: row.fields, rawRow: row.rawRow })
      return
    }
    ids.add(id)
    records.push({
      id,
      sourceLine: row.sourceLine,
      exportOrdinal: nullableText(raw.exportOrdinal),
      artist: raw.artist,
      title: raw.title,
      scores: Object.fromEntries(emotionColumns.map((name) => [name, numbers[name]])),
      additional: {
        icc: numbers.ICC,
        numberOfRaters: numbers['Number of Raters'],
        gemsVersion: nullableText(raw['GEMS Version']),
        familiarity: numbers.Familiarity,
        liking: numbers.Liking,
        sublimity: numbers.Sublimity,
        vitality: numbers.Vitality,
        unease: numbers.Unease,
      },
      media: {
        spotifyId: nullableText(raw['Spotify ID']),
        youtubeClip: nullableText(raw['Youtube Clip']),
        youtubeId: nullableText(raw['Youtube ID']),
        youtubeStartTime: nullableText(raw['Youtube Start-Time']),
        youtubeEndTime: nullableText(raw['Youtube End-Time']),
      },
      raw,
      textNeedsReview: /[?\uFFFD]|¡Æ/.test(`${raw.artist} ${raw.title}`)
        || [raw.artist, raw.title].some((value) => (value.match(/"/g) || []).length % 2 !== 0),
    })
  })

  return {
    source,
    counts: { dataRows: rows.length, validRows: records.length, errorRows: errors.length },
    records,
    errors,
  }
}
