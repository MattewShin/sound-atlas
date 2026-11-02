export const JOURNAL_PAGE_SIZE = 10
export const JOURNAL_BODY_LIMIT = 4000
export const JOURNAL_KINDS = [
  { value: 'free', label: '자유 기록' },
  { value: 'practice', label: '연습' },
  { value: 'listening', label: '감상' },
  { value: 'reflection', label: '사색' },
]

export const journalDate = (now = new Date()) => [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')

export function validateMusicRecord({ body, kind, recorded_on }) {
  if (!body?.trim()) return '기록 내용을 입력해 주세요.'
  if (body.trim().length > JOURNAL_BODY_LIMIT) return '기록은 4,000자까지 작성할 수 있어요.'
  if (!JOURNAL_KINDS.some(({ value }) => value === kind)) return '기록 유형을 선택해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recorded_on) || recorded_on < '1900-01-01' || recorded_on > '2200-12-31'
    || !Number.isFinite(Date.parse(recorded_on)) || new Date(recorded_on).toISOString().slice(0, 10) !== recorded_on) return '올바른 기록 날짜를 입력해 주세요.'
  return null
}

export const journalErrorMessage = (error) => error?.code === '40001'
  ? '다른 기기에서 변경됐거나 삭제된 기록이에요. 새로고침 후 다시 확인해 주세요. 작성 중인 내용은 유지했어요.'
  : error?.code === '54000' ? '계정당 기록은 1,000개까지 저장할 수 있어요.'
    : '기록을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'

export async function listMusicRecords(client, userId, trackId, page = 0) {
  const { data, error, count } = await client.from('user_music_journal')
    .select('id,track_id,kind,body,recorded_on,revision,created_at,updated_at', { count: 'exact' })
    .eq('user_id', userId).eq('track_id', trackId)
    .order('recorded_on', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * JOURNAL_PAGE_SIZE, (page + 1) * JOURNAL_PAGE_SIZE - 1)
  if (error) throw error
  return { records: data || [], total: count ?? 0 }
}

export async function saveMusicRecord(client, userId, trackId, record) {
  const message = validateMusicRecord(record)
  if (message) throw new Error(message)
  const { data, error } = await client.rpc('save_private_music_record', {
    p_owner_id: userId, p_id: record.id, p_track_id: trackId, p_kind: record.kind,
    p_body: record.body.trim(), p_recorded_on: record.recorded_on, p_revision: record.revision,
  })
  if (error) throw error
  if (!data?.[0]) throw new Error('NO_RECORD_RETURNED')
  return data[0]
}

export async function deleteMusicRecord(client, userId, record) {
  const { error } = await client.rpc('delete_private_music_record', { p_owner_id: userId, p_id: record.id, p_revision: record.revision })
  if (error) throw error
}
