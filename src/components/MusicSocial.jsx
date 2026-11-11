import React, { useCallback, useEffect, useRef, useState } from 'react'
import { tracks } from '../data/musicData.js'
import { formatTrackTitle } from '../data/emotions.js'
import { getSocialApi, exactTime, relativeTime, socialRoute, socialScopes } from '../data/socialClient.js'

import { Avatar } from './SocialProfile.jsx'

const title = (id) => { const t = tracks.find(t => t.id === id); if (!t) return '등록 곡'; const full = formatTrackTitle(t); return full.includes(t.composer) ? full : `${t.composer} · ${full}` }
const uuid = () => crypto.randomUUID()
function Scope({ value, onChange }) {
  return <label>공개 범위<select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(socialScopes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
}
function ShareEditor({ source, post, save, cancel, pending }) {
  const [body, setBody] = useState(post?.body ?? source.body)
  const [scope, setScope] = useState(post?.visibility ?? 'private')
  const [review, setReview] = useState(false)
  const id = useRef(uuid())
  return <form className="social-form" onSubmit={e => { e.preventDefault(); if (!review) { setReview(true); return }; void save(post ? { body: body.trim(), visibility: scope } : { id: id.current, source_record_id: source.id, track_id: source.track_id, body: body.trim(), visibility: scope }) }}>
    <h2>{post ? '공유 내용·공개 범위 수정' : '기록 공유하기'}</h2><p>{title(post?.track_id ?? source.track_id)}</p>
    <label>공유 내용<textarea required maxLength={4000} rows={6} value={body} onChange={e => { setBody(e.target.value); setReview(false) }} /></label>
    <Scope value={scope} onChange={v => { setScope(v); setReview(false) }} />
    <p role="status">공개 범위: <strong>{socialScopes[scope]}</strong> · {scope === 'private' ? '작성자만 글·댓글·반응을 볼 수 있어요.' : scope === 'public' ? '비로그인 사용자도 읽을 수 있어요.' : '작성자와 현재 팔로워만 읽을 수 있어요.'}</p>
    {review && <p>이 내용과 공개 범위로 저장할까요? 내 기록은 바뀌지 않아요.</p>}
    <button disabled={pending || !body.trim()}>{review ? `${socialScopes[scope]}로 저장 확정` : '공유 전 확인'}</button><button type="button" onClick={cancel}>취소</button>
  </form>
}
function Post({ post, user, navigate, run, pending, likePending, like, openComments, commentState, draft, setDraft, submitComment, manage, report, block }) {
  const [expanded, setExpanded] = useState(false)
  const own = user?.id === post.profile.id
  return <article className="social-post" aria-label={`${post.profile.nickname}의 음악 기록`}>
    <header><button className="social-person" title={`${post.profile.nickname} (@${post.profile.handle})`} onClick={() => navigate('profile', post.profile.id)}><Avatar profile={post.profile} /><span className="social-person-copy"><strong>@{post.profile.handle}</strong><small>{post.profile.nickname}</small></span></button>
      <span className="social-path" aria-hidden="true">›</span><button className="social-track" title={title(post.track_id)} onClick={() => navigate('track', post.track_id)}>{title(post.track_id)}</button>
      <details className="social-time"><summary><time dateTime={post.created_at} title={exactTime(post.created_at)}>{relativeTime(post.created_at)}</time></summary><small>{exactTime(post.created_at)}</small></details>
    </header>
    <div className="social-post-copy"><p>{expanded || post.body.length <= 320 ? post.body : post.body.slice(0, 320) + '…'}</p>{post.body.length > 320 && <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : '더 보기'}</button>}</div>
    <footer><button disabled={!user} aria-disabled={likePending || undefined} aria-busy={likePending || undefined} aria-pressed={post.liked} aria-label={`좋아요 ${post.like_count}개`} onClick={() => { if (!likePending) void like(post.id) }}><svg viewBox="0 0 24 24" fill={post.liked ? 'currentColor' : 'none'} aria-hidden="true"><path d="M12 21 3 12C-3 4 7-2 12 5c5-7 15-1 9 7Z" /></svg>{post.like_count}</button>
      <button aria-expanded={Boolean(commentState)} aria-label={`댓글 ${post.comment_count}개`} onClick={() => openComments(post.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11a9 9 0 0 1-9 9H3l2-5A9 9 0 1 1 21 11Z" /></svg>{post.comment_count}</button>
      <small>{socialScopes[post.visibility]}</small><details className="social-menu"><summary aria-label="게시물 메뉴">···</summary><div>{own ? <><button onClick={() => manage.edit(post)}>공유 내용 수정</button><button onClick={() => manage.edit(post)}>공개 범위 변경</button><button disabled={pending} onClick={() => manage.confirmUnshare(post)}>공유 취소</button></> : <><button disabled={!user} onClick={() => report(post)}>신고</button><button disabled={!user || pending} onClick={() => block(post)}>사용자 차단</button></>}
      <button onClick={() => run('copy', () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#music/post/${post.id}`), false)}>링크 복사</button></div></details>
    </footer>
    {!user && <p className="social-hint">좋아요·댓글 작성은 로그인 후 가능해요.</p>}
    {commentState && <section className="social-comments" aria-label="댓글 목록">
      {commentState.loading ? <p>댓글 불러오는 중…</p> : commentState.rows.length ? commentState.rows.map(c => <div key={c.id}><button onClick={() => navigate('profile', c.profile_id)}>@{c.profile?.handle ?? '사용자'}</button><p>{c.body}</p><small>{exactTime(c.created_at)}</small>{c.profile_id === user?.id && <button disabled={pending} onClick={() => run('delete-comment:' + c.id, () => manage.deleteComment(c.id))}>댓글 삭제</button>}</div>) : <p>아직 댓글이 없어요.</p>}
      {user && <form onSubmit={e => { e.preventDefault(); void submitComment(post.id) }}><label>댓글<textarea required maxLength={2000} value={draft?.body ?? ''} onChange={e => setDraft(post.id, e.target.value)} /></label><button disabled={pending || !draft?.body.trim()}>댓글 등록</button></form>}
    </section>}
  </article>
}

export default function MusicSocial({ auth, initialPost, onOpenMyProfile = () => {}, api = getSocialApi() }) {
  const client = api, user = auth?.user
  const [route, setRoute] = useState(() => initialPost ? { post: initialPost } : socialRoute(typeof window === 'undefined' ? '' : window.location.hash))
  const [data, setData] = useState(null), [ownProfile, setOwnProfile] = useState(null)
  const [meLoaded, setMeLoaded] = useState(false)
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false), [editor, setEditor] = useState(null)
  const [comments, setComments] = useState({}), [drafts, setDrafts] = useState({})
  const [confirm, setConfirm] = useState(null), [reporting, setReporting] = useState(null), [reason, setReason] = useState('')
  const generation = useRef(0), locks = useRef(new Set()), current = useRef(true), connectedRef = useRef(false)
  const commentIds = useRef(new Set()), draftRef = useRef({}), requestRef = useRef(null), pageDepth = useRef(1)
  const dataRef = useRef(data), likeRequests = useRef(new Map()), likeRevision = useRef(0), backgroundSequence = useRef(0)
  const [likePending, setLikePending] = useState({})
  const [likeError, setLikeError] = useState('')
  dataRef.current = data
  const resetLikes = () => { likeRevision.current++; backgroundSequence.current++; likeRequests.current.clear(); setLikePending({}) }
  const refresh = useCallback(async () => {
    const stamp = ++generation.current
    resetLikes(); setData(null); setComments({})
    if (!client || !connectedRef.current || (typeof document !== 'undefined' && document.hidden)) return
    try {
      const [posts, mine, profile] = await Promise.all([
        client.feed(route), user ? client.me() : null,
        route.person ? client.profile(route.person) : null,
      ])
      for (let page = 1; page < pageDepth.current && posts.length >= page * 30; page++) {
        if (stamp !== generation.current) return
        posts.push(...await client.feed(route, posts.at(-1)))
      }
      const commentRows = await Promise.all(posts.filter(p => commentIds.current.has(p.id)).map(async p => [p.id, { rows: await client.comments(p.id) }]))
      if (!current.current || stamp !== generation.current || !connectedRef.current) return
      setOwnProfile(mine?.id ? mine : null); setMeLoaded(true); setData({ posts, profile }); setComments(Object.fromEntries(commentRows))
      const visible = new Set(posts.map(p => p.id))
      const nextDrafts = Object.fromEntries(Object.entries(draftRef.current).filter(([id]) => visible.has(id)))
      draftRef.current = nextDrafts; setDrafts(nextDrafts)
    } catch (e) { if (current.current && stamp === generation.current) { setData(null); setError(e.message) } }
  }, [client, user?.id, route])
  // Like broadcasts contain no identifiers. Re-read the currently loaded pages
  // without unmounting posts or touching comments/drafts. Permission events use refresh.
  const refreshLikes = useCallback(async () => {
    if (!client || !connectedRef.current || document.hidden || !dataRef.current) return
    const stamp = generation.current, sequence = ++backgroundSequence.current, revision = likeRevision.current
    const loaded = dataRef.current.posts.map(p => p.id), observed = new Set(loaded), depth = pageDepth.current
    try {
      const rows = [...await client.feed(route)]
      for (let page = 1; page < depth && rows.length >= page * 30; page++) {
        if (stamp !== generation.current) return
        rows.push(...await client.feed(route, rows.at(-1)))
      }
      // A newly inserted post may move an older loaded post beyond the last page.
      // Verify missing loaded IDs individually instead of dropping pagination state.
      const seen = new Set(rows.map(p => p.id))
      for (const id of loaded.filter(id => !seen.has(id))) {
        if (stamp !== generation.current) return
        rows.push(...await client.feed({ ...route, post: id }))
      }
      if (!current.current || !connectedRef.current || stamp !== generation.current || sequence !== backgroundSequence.current || revision !== likeRevision.current) return
      const fresh = new Map(rows.map(p => [p.id, p]))
      setData(value => {
        if (!value || stamp !== generation.current || revision !== likeRevision.current) return value
        const next = { ...value, posts: value.posts.filter(p => !observed.has(p.id) || fresh.has(p.id)).map(p => {
          const row = fresh.get(p.id)
          return !row || likeRequests.current.has(p.id) ? p : { ...p, liked: row.liked, like_count: Math.max(0, row.like_count) }
        }) }
        dataRef.current = next; return next
      })
    } catch (e) {
      if (!current.current || stamp !== generation.current || sequence !== backgroundSequence.current) return
      if (['42501', '401', '403', 'PGRST301', 'PGRST302'].includes(String(e.code ?? e.status))) void refresh()
      else setLikeError('좋아요 수를 다시 확인하지 못했어요. 잠시 후 다시 시도해주세요.')
    }
  }, [client, route, refresh])
  const like = async id => {
    if (!user || !ownProfile || !connectedRef.current || likeRequests.current.has(id)) return
    const old = dataRef.current?.posts.find(p => p.id === id); if (!old) return
    const token = {}, stamp = generation.current, desired = !old.liked
    likeRequests.current.set(id, token); likeRevision.current++; setLikePending(v => ({ ...v, [id]: true })); setLikeError('')
    const patch = fields => setData(value => {
      if (!value || generation.current !== stamp) return value
      const next = { ...value, posts: value.posts.map(p => p.id === id ? { ...p, ...fields } : p) }; dataRef.current = next; return next
    })
    patch({ liked: desired, like_count: Math.max(0, old.like_count + (desired ? 1 : -1)) })
    try { await client.like(id, desired) }
    catch (e) {
      if (!current.current || stamp !== generation.current || likeRequests.current.get(id) !== token) return
      if (['42501', '401', '403', 'PGRST301', 'PGRST302'].includes(String(e.code ?? e.status))) { setError(e.message); void refresh(); return }
      patch({ liked: old.liked, like_count: old.like_count }); setLikeError(e.message || '좋아요를 저장하지 못했어요. 다시 시도해주세요.')
    } finally {
      if (current.current && stamp === generation.current && likeRequests.current.get(id) === token) {
        likeRequests.current.delete(id); likeRevision.current++; setLikePending(v => { const next = { ...v }; delete next[id]; return next }); void refreshLikes()
      }
    }
  }
  requestRef.current = { refresh, likes: refreshLikes }
  useEffect(() => {
    current.current = true
    if (!client) return
    const clear = () => { ++generation.current; resetLikes(); setData(null); setComments({}) }
    const stop = client.subscribe(payload => { if (payload?.kind === 'like') void requestRef.current.likes(); else { clear(); void requestRef.current.refresh() } }, status => {
      connectedRef.current = status === 'SUBSCRIBED'; setConnected(connectedRef.current)
      clear(); if (connectedRef.current) void requestRef.current.refresh()
    })
    const visibility = () => { clear(); if (!document.hidden) void requestRef.current.refresh() }
    const offline = () => { connectedRef.current = false; setConnected(false); clear() }
    const online = () => setConnectionRevision(v => v + 1)
    document.addEventListener('visibilitychange', visibility); window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    window.addEventListener('pagehide', clear); window.addEventListener('pageshow', visibility)
    const tick = window.setInterval(() => { if (!document.hidden) void requestRef.current.refresh() }, 60000)
    return () => { current.current = false; ++generation.current; connectedRef.current = false; stop(); clearInterval(tick); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('offline', offline); window.removeEventListener('online', online); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', visibility) }
  }, [client, connectionRevision])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const changed = () => { ++generation.current; resetLikes(); const next = socialRoute(window.location.hash); pageDepth.current = 1; setRoute(next); if (Object.keys(next).length) setEditor(null); setData(null); setComments({}); setDrafts({}); draftRef.current = {} }
    window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed)
  }, [])
  const navigate = (kind, id) => { if (kind === 'profile' && id === ownProfile?.id) { onOpenMyProfile(); return }; window.location.hash = `music/${kind}/${encodeURIComponent(id)}` }
  const run = async (key, operation, reload = true) => {
    if (locks.current.has(key)) return false
    locks.current.add(key); setBusy(true); setError(''); setNotice('')
    try { await operation(); if (!current.current) return false; if (reload) await refresh(); else if (key === 'copy') setNotice('링크를 복사했어요. 공개 범위는 변하지 않아요.'); return true }
    catch (e) { if (current.current) { setError(e.message || '요청을 완료하지 못했어요.'); if (reload && key !== 'profile') await refresh() }; return false }
    finally { locks.current.delete(key); if (current.current) setBusy(locks.current.size > 0) }
  }
  const setDraft = (id, body) => { const value = { ...draftRef.current, [id]: { id: draftRef.current[id]?.id ?? uuid(), body } }; draftRef.current = value; setDrafts(value) }
  const submitComment = async id => {
    const value = draftRef.current[id]; if (!value?.body.trim()) return
    await run('comment:' + id, async () => { await client.comment(id, value.body.trim(), value.id); const next = { ...draftRef.current }; delete next[id]; draftRef.current = next; setDrafts(next) })
  }
  const openComments = id => {
    if (commentIds.current.has(id)) { commentIds.current.delete(id); setComments(v => { const next = { ...v }; delete next[id]; return next }); return }
    commentIds.current.add(id); void refresh()
  }
  useEffect(() => { if (route.person && ownProfile?.id === route.person) onOpenMyProfile('', { replace: true }) }, [route.person, ownProfile?.id, onOpenMyProfile])
  if (!client) return <main className="social-screen"><header className="social-heading"><p>MUSIC STORIES</p><h1>음악 이야기</h1></header><p>음악 이야기 서비스를 준비 중이에요. 기존 보관함은 계속 이용할 수 있어요.</p></main>
  return <main className="social-screen"><header className="social-heading"><p>MUSIC STORIES</p><h1>음악 이야기</h1><span>음악으로 나눈 이야기를 만나보세요.</span></header>
    {likeError && <aside className="social-like-error" role="alert"><p>{likeError}</p><button aria-label="좋아요 오류 안내 닫기" onClick={() => setLikeError('')}>닫기</button></aside>}
    {(error || auth.error) && <p role="alert">{error || auth.error}</p>}{notice && <p role="status">{notice}</p>}
    {!connected ? <p role="status">실시간 연결을 확인하고 있어요. 연결되면 권한을 다시 확인해 기록을 표시해요.</p> : !data ? <p role="status">기록 불러오는 중… <button onClick={refresh}>다시 확인</button></p> : <>
        {route.track && <h2>{title(route.track)}의 기록</h2>}
        {route.person && (data.profile ? <section className="social-profile"><Avatar profile={data.profile} /><h2>{data.profile.nickname} <small>@{data.profile.handle}</small></h2><p>팔로워 {data.profile.follower_count} · 팔로잉 {data.profile.following_count}</p>{user && ownProfile?.id !== route.person && <><button disabled={busy || !ownProfile} onClick={() => run('follow', () => client.follow(route.person, !data.profile.following))}>{data.profile.following ? '팔로우 취소' : '팔로우'}</button><button onClick={() => setConfirm({ text: '이 사용자를 차단할까요? 서로의 게시물·댓글이 숨겨지고 양쪽 팔로우가 해제돼요.', action: () => client.block(route.person) })}>사용자 차단</button></>}</section> : <p>프로필을 볼 수 없어요.</p>)}
        {ownProfile && <button onClick={() => onOpenMyProfile('records')}>기록 작성</button>}
        {!data.posts.length && <p>{route.post ? '게시물을 볼 수 없어요. 공개 범위·팔로우·차단 상태를 확인해주세요.' : '지금 볼 수 있는 음악 기록이 없어요.'}</p>}
        <section className="social-feed" aria-label="음악 기록 피드">{data.posts.map(post => <Post key={post.id} post={post} user={ownProfile} navigate={navigate} run={run} pending={busy} likePending={Boolean(likePending[post.id])} like={like} openComments={openComments} commentState={comments[post.id]} draft={drafts[post.id]} setDraft={setDraft} submitComment={submitComment}
          manage={{ like: client.like, edit: post => setEditor({ kind: 'edit', post }), confirmUnshare: post => setConfirm({ text: '공유를 취소할까요? 공유본과 그 댓글·좋아요는 삭제하며 내 기록은 보존해요.', action: () => client.unshare(post.id) }), deleteComment: client.deleteComment }}
          report={post => { setReporting(post); setReason('') }} block={post => setConfirm({ text: '이 사용자를 차단할까요? 서로의 게시물·댓글이 숨겨지고 양쪽 팔로우가 해제돼요.', action: () => client.block(post.profile.id) })} />)}</section>
        {data.posts.length >= 30 && <button disabled={busy} onClick={() => run('more', async () => { const stamp = generation.current; const more = await client.feed(route, data.posts.at(-1)); if (stamp === generation.current) { if (more.length) pageDepth.current++; setData(v => v && ({ ...v, posts: [...v.posts, ...more.filter(p => !v.posts.some(old => old.id === p.id))] })) } }, false)}>이전 기록 더 보기</button>}
    </>}
    {user && meLoaded && !ownProfile && <aside className="social-join"><p>음악 이야기에 참여하려면 내 프로필을 먼저 만들어주세요.</p><button onClick={() => onOpenMyProfile()}>내 프로필 만들기</button></aside>}
    {editor && ownProfile && connected && <section className="social-editor" aria-label="공유본 편집"><ShareEditor key={editor.post.id} post={editor.post} pending={busy} cancel={() => setEditor(null)} save={value => run('share', async () => { await client.editPost(editor.post.id, value); setEditor(null) })} /></section>}
    {confirm && <section className="social-confirm" role="dialog" aria-modal="true" aria-label="변경 확인"><p>{confirm.text}</p><button disabled={busy} onClick={() => run('confirm', async () => { await confirm.action(); setConfirm(null) })}>확인</button><button disabled={busy} onClick={() => setConfirm(null)}>취소</button></section>}
    {reporting && <form className="social-form" onSubmit={e => { e.preventDefault(); void run('report', async () => { await client.report(reporting.id, reason.trim()); setReporting(null); setNotice('신고를 접수했어요. 운영자가 확인합니다.') }) }}><h2>게시물 신고</h2><label>신고 사유<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !reason.trim()}>신고 접수</button><button type="button" onClick={() => setReporting(null)}>취소</button></form>}
  </main>
}
