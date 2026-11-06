import { JOURNAL_BODY_LIMIT } from './musicJournal.js'

export const PUBLIC_STORY_FIELDS = 'id,track_id,nickname,body,kind,recorded_on,published_at'
export const isStoryId = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
export const storyUrl = (id, origin = typeof window === 'undefined' ? 'https://sound-atlas.vercel.app' : window.location.origin) => {
  const url = new URL('/', origin)
  url.searchParams.set('story', id)
  return url.href
}
export const sharingError = (error) => error?.code === '23505' ? '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.'
  : error?.code === '40001' ? '원본이나 공유 상태가 바뀌었어요. 기록을 새로고침한 뒤 다시 확인해 주세요.'
    : error?.code === '54000' ? '공개 글은 계정당 100개까지 공유할 수 있어요.'
      : '처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'

export function validateShare(nickname, body) {
  if (!/^[가-힣A-Za-z0-9_ -]{2,20}$/.test(nickname.trim())) return '닉네임은 한글·영문·숫자·공백·밑줄·하이픈으로 2~20자 입력해 주세요.'
  if (!body.trim() || body.trim().length > JOURNAL_BODY_LIMIT) return '공개 내용은 1~4,000자 입력해 주세요.'
  return null
}

export async function readMusicNickname(client, userId) {
  const { data, error } = await client.from('user_music_nicknames').select('nickname').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.nickname || ''
}
export async function listMyMusicShares(client, userId) {
  const { data, error } = await client.rpc('list_my_music_shares', { p_owner_id: userId })
  if (error) throw error
  return data || []
}
export async function publishMusicRecord(client, userId, record, { id, nickname, body, visibility }) {
  const message = validateShare(nickname, body)
  if (message) throw new Error(message)
  const { data, error } = await client.rpc(visibility ? 'social_publish_record' : 'publish_music_record', {
    p_owner_id: userId, p_id: id, p_record_id: record.id, p_revision: record.revision,
    p_nickname: nickname.trim(), p_body: body.trim(),
    ...(visibility ? { p_visibility: visibility } : {}),
  })
  if (error) throw error
  if (!isStoryId(data)) throw new Error('INVALID_PUBLICATION')
  return data
}
export async function withdrawMusicRecord(client, userId, id) {
  const { error } = await client.rpc('withdraw_music_record', { p_owner_id: userId, p_id: id })
  if (error) throw error
}
export async function listPublicStories(client, trackId, page = 0) {
  const { data, error, count } = await client.from('music_record_publications').select(PUBLIC_STORY_FIELDS, { count: 'exact' })
    .eq('track_id', trackId).order('published_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9)
  if (error) throw error
  return { stories: data || [], total: count || 0 }
}
export async function readPublicStory(client, id) {
  if (!isStoryId(id)) return null
  const { data, error } = await client.from('music_record_publications').select(PUBLIC_STORY_FIELDS).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}
