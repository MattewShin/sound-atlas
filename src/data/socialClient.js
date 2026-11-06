import { createClient } from '@supabase/supabase-js'

// Sessions and all social content live in memory. Only the one-time PKCE verifier
// survives the OAuth redirect; no email/name/avatar is copied from Google metadata.
export function createEphemeralAuthStorage(redirectStorage, authKey = '') {
  if (!redirectStorage) { try { redirectStorage = globalThis.sessionStorage } catch { /* Login reports unavailable redirect storage. */ } }
  const memory = new Map()
  const redirectKey = k => authKey ? 'classic-atlas-oauth' + k.slice(authKey.length) : k
  return {
    getItem(k) { if (!k.endsWith('-code-verifier')) return memory.get(k) ?? null; try { return redirectStorage?.getItem(redirectKey(k)) ?? null } catch { return null } },
    setItem(k, v) { if (k.endsWith('-code-verifier')) { if (!redirectStorage) throw new Error('로그인에는 탭 저장소 접근이 필요해요.'); redirectStorage.setItem(redirectKey(k), v) } else memory.set(k, v) },
    removeItem(k) { memory.delete(k); if (k.endsWith('-code-verifier')) { try { redirectStorage?.removeItem(redirectKey(k)) } catch { /* No session content on disk. */ } } },
  }
}
export function createInvalidationSubscriber(db) {
  // Realtime reuses channels with the same topic. Await removal before joining
  // again (StrictMode, logout and immediate account switches included).
  let lifecycle = Promise.resolve()
  return (onInvalidate, onStatus) => {
    let active = true, channel
    lifecycle = lifecycle.catch(() => {}).then(() => {
      if (!active) return
      channel = db.channel('atlas-social', { config: { private: false } })
      channel.on('broadcast', { event: 'invalidate' }, () => { if (active) onInvalidate() })
        .subscribe(status => { if (active) onStatus(status) })
    }).catch(() => { if (active) onStatus('CHANNEL_ERROR') })
    return () => {
      active = false
      lifecycle = lifecycle.catch(() => {}).then(async () => { if (channel) await db.removeChannel(channel) })
    }
  }
}
export function createSocialClient(url, key, options = {}) {
  if (!url || !key) return null
  // SDK auth broadcasts assume shared token storage. A runtime-unique key keeps
  // each tab's identity and API token together; only verifier keys are normalized
  // across the redirect. Cross-tab logout below transmits no session data.
  const storageKey = 'atlas-auth-' + crypto.randomUUID()
  const storage = createEphemeralAuthStorage(undefined, storageKey)
  const db = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, storageKey, storage, detectSessionInUrl: true },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }, ...options })
  const result = async (request) => {
    const { data, error } = await request
    if (error) {
      const e = new Error(error.code === '23505' ? '이미 사용 중인 아이디예요. 다른 아이디를 선택해주세요.'
        : error.code === '42501' || error.status === 401 ? '로그인 또는 열람 권한을 다시 확인해주세요.' : '요청을 완료하지 못했어요. 다시 시도해주세요.')
      e.code = error.code; throw e
    }
    return data
  }
  return {
    db,
    login: () => result(db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + location.hash, queryParams: { prompt: 'select_account' } } })),
    logout: () => db.auth.signOut({ scope: 'local' }),
    feed: (filter = {}, cursor) => result(db.rpc('social_feed', { track: filter.track ?? null, person: filter.person ?? null, post: filter.post ?? null, before_time: cursor?.created_at ?? null, before_id: cursor?.id ?? null })),
    profile: (id) => result(db.rpc('social_profile', { person: id })),
    saveProfile: (id, value, exists) => result(exists ? db.from('social_profiles').update(value).eq('id', id).select().single() : db.from('social_profiles').insert({ id, ...value }).select().single()),
    records: () => result(db.from('music_records').select('*').order('created_at', { ascending: false })),
    createRecord: (value, scope, postId) => result(db.rpc('social_create_record', { record_id: value.id, selected_track: value.track_id, record_body: value.body, share_scope: scope, shared_id: postId })),
    saveRecord: (value, exists) => result(exists ? db.from('music_records').update({ body: value.body }).eq('id', value.id).select().single() : db.from('music_records').insert(value).select().single()),
    deleteRecord: (id) => result(db.from('music_records').delete().eq('id', id).select('id').single()),
    share: (value) => result(db.from('music_posts').insert(value).select().single()),
    editPost: (id, value) => result(db.from('music_posts').update(value).eq('id', id).select().single()),
    unshare: (id) => result(db.from('music_posts').delete().eq('id', id).select('id').single()),
    like: (id, desired) => result(db.rpc('social_set_like', { post: id, desired })),
    comments: (id) => result(db.from('music_comments').select('*,profile:social_profiles(*)').eq('post_id', id).order('created_at').order('id')),
    comment: (id, body, commentId) => result(db.from('music_comments').upsert({ id: commentId, post_id: id, body }, { onConflict: 'id', ignoreDuplicates: true })),
    deleteComment: (id) => result(db.from('music_comments').delete().eq('id', id).select('id').single()),
    follow: (id, desired) => result(desired ? db.from('social_follows').upsert({ author_id: id }, { onConflict: 'follower_id,author_id', ignoreDuplicates: true }) : db.from('social_follows').delete().eq('author_id', id)),
    block: (id) => result(db.from('social_blocks').upsert({ blocked_id: id }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })),
    blocks: () => result(db.from('social_blocks').select('*')),
    unblock: (id) => result(db.from('social_blocks').delete().eq('blocked_id', id)),
    report: (id, reason) => result(db.rpc('social_report', { post: id, reason })),
    subscribe: createInvalidationSubscriber(db),
  }
}
let singleton
export function getSocialClient() {
  if (singleton === undefined) singleton = createSocialClient(import.meta.env?.VITE_SUPABASE_URL, import.meta.env?.VITE_SUPABASE_ANON_KEY)
  return singleton
}

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
