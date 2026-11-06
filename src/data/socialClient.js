import { supabase } from '../lib/supabaseClient.js'

// One deployed client and one Google session; social responses are memory-only.
export function createInvalidationSubscriber(db) {
  let lifecycle = Promise.resolve(), generation = 0, status = 'CLOSED', channel
  const listeners = new Set()
  return (onInvalidate, onStatus) => {
    const listener = { onInvalidate, onStatus }; listeners.add(listener)
    if (listeners.size === 1) {
      const ticket = ++generation
      lifecycle = lifecycle.catch(() => {}).then(() => {
        if (ticket !== generation || !listeners.size) return
        channel = db.channel('atlas-social', { config: { private: false } })
        channel.on('broadcast', { event: 'invalidate' }, () => { if (ticket === generation) for (const l of listeners) l.onInvalidate() })
          .subscribe(value => { if (ticket === generation) { status = value; for (const l of listeners) l.onStatus(value) } })
      }).catch(() => { if (ticket === generation) { status = 'CHANNEL_ERROR'; for (const l of listeners) l.onStatus(status) } })
    } else if (status === 'SUBSCRIBED') onStatus(status)
    return () => {
      listeners.delete(listener)
      if (listeners.size) return
      generation++; status = 'CLOSED'
      lifecycle = lifecycle.catch(() => {}).then(async () => { if (channel) { const old = channel; channel = null; await db.removeChannel(old) } })
    }
  }
}
export function createSocialApi(db) {
  if (!db) return null
  const result = async request => {
    const { data, error } = await request
    if (error) {
      const e = new Error(error.code === '23505' ? '이미 사용 중인 아이디 또는 닉네임이에요.'
        : error.code === '42501' ? '로그인 또는 열람 권한을 다시 확인해주세요.' : '요청을 완료하지 못했어요. 입력 내용은 다시 확인할 수 있어요.')
      e.code = error.code; throw e
    }
    return data
  }
  return {
    db,
    me: () => result(db.rpc('social_me')),
    feed: (filter = {}, cursor) => result(db.rpc('social_feed', { track: filter.track ?? null, person: filter.person ?? null, post: filter.post ?? null, before_time: cursor?.created_at ?? null, before_id: cursor?.id ?? null })),
    profile: id => result(db.rpc('social_profile', { person: id })),
    saveProfile: value => result(db.rpc('social_save_profile', { p_handle: value.handle, p_nickname: value.nickname, p_avatar_url: value.avatar_url })),
    editPost: (id, value) => result(db.rpc('social_edit_post', { post: id, content: value.body, scope: value.visibility })),
    unshare: id => result(db.rpc('social_withdraw', { post: id })),
    like: (id, desired) => result(db.rpc('social_set_like', { post: id, desired })),
    comments: id => result(db.from('music_social_comments').select('id,post_id,profile_id,body,created_at,profile:music_social_profiles(id,handle,nickname,avatar_url)').eq('post_id', id).order('created_at').order('id')),
    comment: (id, body, commentId) => result(db.rpc('social_comment', { post: id, content: body, comment_id: commentId })),
    deleteComment: id => result(db.rpc('social_delete_comment', { comment_id: id })),
    follow: (id, desired) => result(db.rpc('social_follow', { person: id, desired })),
    block: id => result(db.rpc('social_block', { person: id, desired: true })),
    blocks: () => result(db.from('music_social_blocks').select('blocked_id')),
    unblock: id => result(db.rpc('social_block', { person: id, desired: false })),
    report: (id, reason) => result(db.rpc('social_report', { post: id, reason })),
    subscribe: createInvalidationSubscriber(db),
  }
}
const clients = new WeakMap()
export function getSocialApi(db = supabase) { if (!db) return null; if (!clients.has(db)) clients.set(db, createSocialApi(db)); return clients.get(db) }
export const socialScopes = { private: '나만 보기', public: '모든 사람', followers: '내 팔로워' }
export function relativeTime(date, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60000))
  return minutes < 1 ? '방금 전' : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`
}
export function exactTime(date) { return new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST' }
export function socialRoute(hash = '') {
  const match = /^#music\/(post|track|profile)\/([^/]+)$/.exec(hash)
  if (!match) return {}
  try { return { [{ post: 'post', track: 'track', profile: 'person' }[match[1]]]: decodeURIComponent(match[2]) } } catch { return {} }
}
