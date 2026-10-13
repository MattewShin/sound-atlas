// One-off check of the calendar request observed in Chrome DevTools.
// This is an undocumented website endpoint, not a supported public API.
const year = Number(process.argv[2] || 2026)
const month = Number(process.argv[3] || 12)
if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
  console.error('Usage: node scripts/probeSacCalendar.mjs [year] [month]')
  process.exit(1)
}

const body = new URLSearchParams({
  searchYear: String(year),
  searchMonth: String(month),
  searchFirstDay: '1',
  searchLastDay: String(new Date(Date.UTC(year, month, 0)).getUTCDate()),
  CATEGORY_PRIMARY: '2', // Music Hall
})

const url = 'https://www.sac.or.kr/site/main/program/getProgramCalList'
try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  console.log(`HTTP ${response.status} ${response.headers.get('content-type') || ''}`)
  if (!response.ok) process.exit(2)
  const raw = await response.text()
  if (raw.length > 3_000_000) throw new Error('Calendar response is unexpectedly large')
  const data = JSON.parse(raw)
  const events = []
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (Object.hasOwn(value, 'SN') && Object.hasOwn(value, 'PROGRAM_SUBJECT')) events.push(value)
    for (const child of Object.values(value)) visit(child)
  }
  visit(data)
  const unique = [...new Map(events.map((event) => [String(event.SN), event])).values()]
  const sample = unique.find((event) => String(event.SN) === '81233')
  console.log(JSON.stringify({
    year, month, eventCount: unique.length,
    sample81233: sample ? {
      id: String(sample.SN), title: sample.PROGRAM_SUBJECT,
      saleState: sample.SALE_STATE_CODE_NAME || null,
      place: sample.PLACE_NAME || sample.PLACE_NAME_ENG || null,
      detailUrl: `https://www.sac.or.kr/site/main/show/show_view?SN=${sample.SN}`,
      fieldNames: Object.keys(sample).sort(),
      scheduleFields: Object.fromEntries(Object.entries(sample).filter(([name]) => /DATE|TIME|DAY|SCHEDULE|PERIOD|SALE|PLACE/i.test(name))),
    } : null,
  }, null, 2))
  if (!sample && year === 2026 && month === 12) process.exitCode = 3
} catch (error) {
  console.error(`Calendar probe failed: ${error.message}`)
  process.exitCode = 2
}
