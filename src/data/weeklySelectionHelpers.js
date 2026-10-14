export const DEFAULT_WEEKLY_SECTION = '이번 주의 한 곡'
const text = (value) => typeof value === 'string' && value.trim().length > 0

// UTC 시각을 한국의 날짜로 변환합니다. 서버/브라우저의 기본 시간대에 의존하지 않습니다.
export function getKoreanDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now))
  const value = (type) => parts.find((part) => part.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function getWeeklySelectionState(entries, tracks, now = Date.now()) {
  const today = getKoreanDate(now)
  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const ids = new Set(), diagnostics = [], valid = []
  for (const entry of entries) {
    if (!entry || entry.published !== true) continue
    if (!text(entry.id) || ids.has(entry.id) || !trackById.has(entry.trackId)
      || !['title', 'teaser', 'reason', 'audience'].every((key) => text(entry[key]))
      || !validDate(entry.startsOn) || !validDate(entry.endsOn) || entry.startsOn > entry.endsOn) {
      diagnostics.push(`주간 소개 ${entry.id || '(ID 없음)'}: 필수 정보, 고유 ID, 곡 ID 또는 날짜를 확인하세요.`)
      continue
    }
    ids.add(entry.id)
    valid.push({ ...entry, sectionName: text(entry.sectionName) ? entry.sectionName.trim() : DEFAULT_WEEKLY_SECTION,
      editorName: text(entry.editorName) ? entry.editorName.trim() : '',
      listeningMoment: text(entry.listeningMoment) ? entry.listeningMoment.trim() : '', track: trackById.get(entry.trackId) })
  }
  valid.sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.id.localeCompare(a.id))
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i], b = valid[j]
      if (a.startsOn <= b.endsOn && b.startsOn <= a.endsOn) diagnostics.push(`주간 소개 노출 기간 겹침: ${a.id} / ${b.id}. 최근 시작일의 글을 홈에 표시합니다.`)
    }
  }
  return {
    current: valid.find((entry) => entry.startsOn <= today && today <= entry.endsOn) || null,
    archive: valid.filter((entry) => entry.endsOn < today).sort((a, b) => b.endsOn.localeCompare(a.endsOn) || b.startsOn.localeCompare(a.startsOn) || b.id.localeCompare(a.id)),
    readable: valid.filter((entry) => entry.startsOn <= today),
    diagnostics,
  }
}

export function parsePreviewTime(value) {
  if (typeof value !== 'string' || !/^\d+:\d{2}$/.test(value)) return null
  const [minutes, seconds] = value.split(':').map(Number)
  const total = minutes * 60 + seconds
  return seconds < 60 && Number.isSafeInteger(total) ? total : null
}

export function getSelectionPreview(entry, detail) {
  const original = detail?.shortPreview
  if (original?.provider !== 'youtube' || !text(original.videoId)) return { preview: null, custom: false }
  const range = entry.previewRange
  const startSeconds = parsePreviewTime(range?.start), endSeconds = parsePreviewTime(range?.end)
  if (range?.videoId === original.videoId && startSeconds !== null && endSeconds !== null && endSeconds > startSeconds) {
    return { preview: { ...original, startSeconds, endSeconds }, custom: true }
  }
  return { preview: original, custom: false }
}

export function formatPreviewTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
