import { tracks } from '../src/data/musicData.js'
import { createSocialApi } from '../src/data/socialClient.js'

// Synthetic in-memory transport. This file never connects to Supabase or OAuth.
export function profileFixture({ signedIn = true, needsSetup = false } = {}) {
  const ownId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222'
  const publicationId = '33333333-3333-4333-8333-333333333333'
  const state = { user: signedIn ? 'A' : null, needsSetup, calls: [], channels: new Set(), maxChannels: 0, blocks: [{ blocked_id: otherId }], records: Array.from({ length: 11 }, (_, i) => ({ id: 'record-' + i, track_id: tracks[i % 2].id, body: '합성 비공개 기록 ' + i, kind: 'free', recorded_on: '2026-11-10', revision: 1, created_at: '2026-11-10T00:00:00Z' })), shares: [{ id: publicationId, source_record_id: 'record-0', visibility: 'public' }], posts: [], failLogout: false, failSave: false }
  const profile = { id: ownId, nickname: '피아노산책', handle: 'piano_walk', avatar_url: null, follower_count: 2, following_count: 3 }
  const other = { id: otherId, nickname: '함께듣기', handle: 'another_listener', avatar_url: null, follower_count: 1, following_count: 0, following: false }
  state.posts = [{ id: publicationId, track_id: tracks[0].id, body: '합성 공유 글\n' + '함께 듣는 음악 이야기 '.repeat(40), visibility: 'public', profile, created_at: '2026-11-10T00:00:00Z', liked: false, like_count: 0, comment_count: 0 }]
  let authListener
  const user = () => state.user ? { id: 'AUTH-' + state.user, email: 'synthetic@example.invalid', user_metadata: { full_name: '합성 GOOGLE 비공개 이름' } } : null
  const notifyAuth = () => authListener?.(state.user ? 'SIGNED_IN' : 'SIGNED_OUT', state.user ? { user: user() } : null)
  const invalidate = () => { for (const channel of state.channels) channel.event?.() }
  const db = {
    auth: {
      getSession: async () => ({ data: { session: state.user ? { user: user() } : null }, error: null }),
      onAuthStateChange: fn => { authListener = fn; return { data: { subscription: { unsubscribe() { authListener = null } } } } },
      signOut: async options => { state.calls.push({ name: 'signOut', options }); if (state.waitLogout) await state.waitLogout; if (state.failLogout) return { error: Error('synthetic logout failure') }; state.user = null; notifyAuth(); return { error: null } },
      signInWithOAuth: async options => { state.calls.push({ name: 'oauth', options }); return { error: null } },
    },
    rpc: async (name, args = {}) => {
      state.calls.push({ name, args })
      if (name === 'merge_user_track_reactions') return { data: [] }
      if (name === 'social_me') return { data: state.user ? state.needsSetup ? { nickname: profile.nickname, needs_setup: true } : state.user === 'A' ? profile : other : null }
      if (name === 'social_profile') return { data: args.person === ownId ? profile : other }
      if (name === 'social_save_profile') { state.needsSetup = false; Object.assign(profile, { handle: args.p_handle, nickname: args.p_nickname, avatar_url: args.p_avatar_url }); return { data: profile } }
      if (name === 'social_feed') return { data: state.posts.filter(p => (!args.post || p.id === args.post) && (!args.person || p.profile.id === args.person) && (!args.track || p.track_id === args.track) && (!args.before_id || p.id !== args.before_id)) }
      if (name === 'list_my_music_shares') return { data: state.shares.map(s => ({ ...s })) }
      if (name === 'social_block') { if (!args.desired) state.blocks = state.blocks.filter(b => b.blocked_id !== args.person); return { data: true } }
      if (name === 'save_private_music_record') {
        if (state.failSave) return { error: { code: '40001' } }
        const row = { id: args.p_id, track_id: args.p_track_id, body: args.p_body, kind: args.p_kind, recorded_on: args.p_recorded_on, revision: args.p_revision + 1, created_at: '2026-11-10T00:00:00Z' }
        state.records = [row, ...state.records.filter(r => r.id !== row.id)]; return { data: [row] }
      }
      if (name === 'social_publish_record') { state.shares.push({ id: args.p_id, source_record_id: args.p_record_id, visibility: args.p_visibility }); state.posts.push({ ...state.posts[0], id: args.p_id, body: args.p_body, visibility: args.p_visibility }); return { data: args.p_id } }
      if (name === 'social_edit_post') { Object.assign(state.posts.find(p => p.id === args.post), { body: args.content, visibility: args.scope }); state.shares.find(s => s.id === args.post).visibility = args.scope; invalidate(); return { data: true } }
      if (name === 'withdraw_music_record') { state.shares = state.shares.filter(s => s.id !== args.p_id); state.posts = state.posts.filter(p => p.id !== args.p_id); return { data: true } }
      if (name === 'delete_private_music_record') { const share = state.shares.find(s => s.source_record_id === args.p_id); state.records = state.records.filter(r => r.id !== args.p_id); state.shares = state.shares.filter(s => s.source_record_id !== args.p_id); state.posts = state.posts.filter(p => p.id !== share?.id); return { data: true } }
      if (name === 'delete_current_user_account') { state.records = []; state.posts = []; state.shares = []; return { data: true } }
      throw Error('UNEXPECTED_SYNTHETIC_RPC:' + name)
    },
    from: name => {
      const filters = []; const query = { select() { return query }, eq(k, v) { filters.push([k, v]); return query }, order() { return query },
        range: async (a, b) => { const rows = state.user === 'A' ? state.records.filter(row => filters.every(([k, v]) => k === 'user_id' || row[k] === v)) : []; return { data: rows.slice(a, b + 1), count: rows.length } },
        maybeSingle: async () => ({ data: { nickname: profile.nickname } }),
        then: (resolve, reject) => Promise.resolve({ data: name === 'music_social_blocks' ? state.blocks.map(b => ({ ...b })) : [] }).then(resolve, reject),
      }; return query
    },
    channel() { const c = { on(_kind, _event, callback) { c.event = callback; return c }, subscribe(fn) { c.status = fn; state.channels.add(c); state.maxChannels = Math.max(state.maxChannels, state.channels.size); queueMicrotask(() => { if (state.channels.has(c)) fn('SUBSCRIBED') }); return c } }; return c },
    async removeChannel(c) { state.channels.delete(c) },
  }
  return { db, api: createSocialApi(db), state, profile, other, ownId, otherId, publicationId, invalidate, emitAuth: (event, session) => authListener?.(event, session), setUser: value => { state.user = value; notifyAuth() } }
}
