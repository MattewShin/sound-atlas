import React, { useCallback, useEffect, useRef, useState } from 'react'
import { tracks } from '../data/musicData.js'
import { formatTrackTitle } from '../data/emotions.js'
import { getSocialApi, exactTime, relativeTime, socialRoute, socialScopes } from '../data/socialClient.js'

import { MyMusicRecords } from './MusicJournal.jsx'

const title = (id) => { const t = tracks.find(t => t.id === id); if (!t) return '등록 곡'; const full = formatTrackTitle(t); return full.includes(t.composer) ? full : `${t.composer} · ${full}` }
const uuid = () => crypto.randomUUID()
function Avatar({ profile }) {
  const [failed, setFailed] = useState(false)
  return profile?.avatar_url && !failed ? <img className="social-avatar" src={profile.avatar_url} referrerPolicy="no-referrer" alt="" onError={() => setFailed(true)} /> : <span className="social-avatar" aria-hidden="true">♪</span>
}
function Scope({ value, onChange }) {
  return <label>공개 범위<select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(socialScopes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
}
export function ProfileEditor({ profile, nicknameHint = '', save, pending }) {
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [nickname, setNickname] = useState(profile?.nickname ?? nicknameHint)
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? '')
  return <form className="social-form" onSubmit={e => { e.preventDefault(); void save({ handle: handle.toLowerCase(), nickname: nickname.trim(), avatar_url: avatar.trim() || null }) }}>
    <h2>공개 프로필 {profile ? '수정' : '만들기'}</h2><p>직접 입력한 닉네임과 아이디만 표시해요. Google 이름·이메일은 공개하지 않아요.</p>
    <label>@아이디<input required pattern="[a-z][a-z0-9_]{2,23}" minLength={3} maxLength={24} value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} autoComplete="off" /><small>영문 소문자로 시작, 영문·숫자·밑줄 3~24자</small></label>
    <label>공개 닉네임<input required maxLength={20} disabled={Boolean(profile || nicknameHint)} value={nickname} onChange={e => setNickname(e.target.value)} /><small>기존에 정한 공개 닉네임은 그대로 사용해요.</small></label>
    <label>프로필 이미지 URL (선택)<input type="url" pattern="https://.*" value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="https://" /></label>
    <button disabled={pending} type="submit">프로필 저장</button>
  </form>
}
function ShareEditor({ source, post, save, cancel, pending }) {
  const [body, setBody] = useState(post?.body ?? source.body)
  const [scope, setScope] = useState(post?.visibility ?? 'private')
  const [review, setReview] = useState(false)
  const id = useRef(uuid())
  return <form className="social-form" onSubmit={e => { e.preventDefault(); if (!review) { setReview(true); return }; void save(post ? { body: body.trim(), visibility: scope } : { id: id.current, source_record_id: source.id, track_id: source.track_id, body: body.trim(), visibility: scope }) }}>
    <h2>{post ? '공유 내용·공개 범위 수정' : '독립 공유본 만들기'}</h2><p>{title(post?.track_id ?? source.track_id)}</p>
    <label>공유 내용<textarea required maxLength={4000} rows={6} value={body} onChange={e => { setBody(e.target.value); setReview(false) }} /></label>
    <Scope value={scope} onChange={v => { setScope(v); setReview(false) }} />
    <p role="status">공개 범위: <strong>{socialScopes[scope]}</strong> · {scope === 'private' ? '작성자만 글·댓글·반응을 볼 수 있어요.' : scope === 'public' ? '비로그인 사용자도 읽을 수 있어요.' : '작성자와 현재 팔로워만 읽을 수 있어요.'}</p>
    {review && <p>이 내용과 공개 범위로 저장할까요? 개인 원본은 바뀌지 않아요.</p>}
    <button disabled={pending || !body.trim()}>{review ? `${socialScopes[scope]}로 저장 확정` : '공유 전 확인'}</button><button type="button" onClick={cancel}>취소</button>
  </form>
}
function Post({ post, user, navigate, run, pending, openComments, commentState, draft, setDraft, submitComment, manage, report, block }) {
  const [expanded, setExpanded] = useState(false)
  const own = user?.id === post.profile.id
  return <article className="social-post" aria-label={`${post.profile.nickname}의 음악 기록`}>
    <header><button className="social-person" title={`${post.profile.nickname} (@${post.profile.handle})`} onClick={() => navigate('profile', post.profile.id)}><Avatar profile={post.profile} /><span className="social-person-copy"><strong>@{post.profile.handle}</strong><small>{post.profile.nickname}</small></span></button>
      <span className="social-path" aria-hidden="true">›</span><button className="social-track" title={title(post.track_id)} onClick={() => navigate('track', post.track_id)}>{title(post.track_id)}</button>
      <details className="social-time"><summary><time dateTime={post.created_at} title={exactTime(post.created_at)}>{relativeTime(post.created_at)}</time></summary><small>{exactTime(post.created_at)}</small></details>
    </header>
    <div className="social-post-copy"><p>{expanded || post.body.length <= 320 ? post.body : post.body.slice(0, 320) + '…'}</p>{post.body.length > 320 && <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : '더 보기'}</button>}</div>
    <footer><button disabled={!user || pending} aria-pressed={post.liked} aria-label={`좋아요 ${post.like_count}개`} onClick={() => run('like:' + post.id, () => manage.like(post.id, !post.liked))}><svg viewBox="0 0 24 24" fill={post.liked ? 'currentColor' : 'none'} aria-hidden="true"><path d="M12 21 3 12C-3 4 7-2 12 5c5-7 15-1 9 7Z" /></svg>{post.like_count}</button>
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

export default function MusicSocial({ auth, initialPost, api = getSocialApi() }) {
  const client = api, user = auth?.user
  const [route, setRoute] = useState(() => initialPost ? { post: initialPost } : socialRoute(typeof window === 'undefined' ? '' : window.location.hash))
  const [tab, setTab] = useState('feed')
  const [data, setData] = useState(null), [ownProfile, setOwnProfile] = useState(null)
  const [meLoaded, setMeLoaded] = useState(false), [nicknameHint, setNicknameHint] = useState('')
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false), [editor, setEditor] = useState(null)
  const [comments, setComments] = useState({}), [drafts, setDrafts] = useState({})
  const [confirm, setConfirm] = useState(null), [reporting, setReporting] = useState(null), [reason, setReason] = useState('')
  const generation = useRef(0), locks = useRef(new Set()), current = useRef(true), connectedRef = useRef(false)
  const commentIds = useRef(new Set()), draftRef = useRef({}), requestRef = useRef(null), pageDepth = useRef(1)
  const refresh = useCallback(async () => {
    const stamp = ++generation.current
    setData(null); setComments({})
    if (!client || !connectedRef.current || (typeof document !== 'undefined' && document.hidden)) return
    try {
      const [posts, mine, profile, blocks] = await Promise.all([
        client.feed(route), user ? client.me() : null,
        route.person ? client.profile(route.person) : null, user && tab === 'profile' ? client.blocks() : [],
      ])
      for (let page = 1; page < pageDepth.current && posts.length >= page * 30; page++) {
        if (stamp !== generation.current) return
        posts.push(...await client.feed(route, posts.at(-1)))
      }
      const commentRows = await Promise.all(posts.filter(p => commentIds.current.has(p.id)).map(async p => [p.id, { rows: await client.comments(p.id) }]))
      if (!current.current || stamp !== generation.current || !connectedRef.current) return
      setOwnProfile(mine?.id ? mine : null); setNicknameHint(mine?.nickname ?? ''); setMeLoaded(true); setData({ posts, profile, blocks }); setComments(Object.fromEntries(commentRows))
      const visible = new Set(posts.map(p => p.id))
      const nextDrafts = Object.fromEntries(Object.entries(draftRef.current).filter(([id]) => visible.has(id)))
      draftRef.current = nextDrafts; setDrafts(nextDrafts)
    } catch (e) { if (current.current && stamp === generation.current) { setData(null); setError(e.message) } }
  }, [client, user?.id, route, tab])
  requestRef.current = refresh
  useEffect(() => {
    current.current = true
    if (!client) return
    const clear = () => { ++generation.current; setData(null); setComments({}) }
    const stop = client.subscribe(() => { clear(); void requestRef.current() }, status => {
      connectedRef.current = status === 'SUBSCRIBED'; setConnected(connectedRef.current)
      clear(); if (connectedRef.current) void requestRef.current()
    })
    const visibility = () => { clear(); if (!document.hidden) void requestRef.current() }
    const offline = () => { connectedRef.current = false; setConnected(false); clear() }
    const online = () => setConnectionRevision(v => v + 1)
    document.addEventListener('visibilitychange', visibility); window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    window.addEventListener('pagehide', clear); window.addEventListener('pageshow', visibility)
    const tick = window.setInterval(() => { if (!document.hidden) void requestRef.current() }, 60000)
    return () => { current.current = false; ++generation.current; connectedRef.current = false; stop(); clearInterval(tick); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('offline', offline); window.removeEventListener('online', online); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', visibility) }
  }, [client, connectionRevision])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const changed = () => { const next = socialRoute(window.location.hash); pageDepth.current = 1; setRoute(next); if (Object.keys(next).length) { setTab('feed'); setEditor(null) }; setData(null); setComments({}); setDrafts({}); draftRef.current = {} }
    window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed)
  }, [])
  const navigate = (kind, id) => { window.location.hash = `music/${kind}/${encodeURIComponent(id)}` }
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
  const reset = nextTab => { ++generation.current; pageDepth.current = 1; setData(null); setRoute({}); setTab(nextTab); setEditor(null); setConfirm(null); window.location.hash = 'music' }
  if (!client) return <main className="social-screen"><h1>내 음악 기록</h1><p>음악 기록 서비스를 준비 중이에요. 기존 보관함은 계속 이용할 수 있어요.</p></main>
  return <main className="social-screen"><header className="social-heading"><p>MUSIC JOURNAL</p><h1>내 음악 기록</h1><span>한 곡에서 시작하는 이야기</span></header>
    <div className="social-tabs"><button aria-pressed={tab === 'feed'} onClick={() => reset('feed')}>피드</button>{user && <><button aria-pressed={tab === 'records'} onClick={() => reset('records')}>개인 원본</button><button aria-pressed={tab === 'profile'} onClick={() => reset('profile')}>내 프로필</button></>}<button onClick={user ? auth.signOut : auth.signInWithGoogle}>{user ? '로그아웃·계정 전환' : 'Google 로그인'}</button></div>
    {(error || auth.error) && <p role="alert">{error || auth.error}</p>}{notice && <p role="status">{notice}</p>}
    {!connected ? <p role="status">실시간 연결을 확인하고 있어요. 연결되면 권한을 다시 확인해 기록을 표시해요.</p> : !data ? <p role="status">기록 불러오는 중… <button onClick={refresh}>다시 확인</button></p> : <>
      {tab === 'profile' && ownProfile && <><button onClick={() => navigate('profile', ownProfile.id)}>내 게시물·팔로워 보기</button><h2>차단 관리</h2>{data.blocks.length ? data.blocks.map(b => <div key={b.blocked_id}><span>차단한 사용자 · {b.blocked_id.slice(0, 8)}</span><button disabled={busy} onClick={() => run('unblock:' + b.blocked_id, () => client.unblock(b.blocked_id))}>차단 해제</button></div>) : <p>차단한 사용자가 없어요.</p>}</>}
      {tab === 'feed' && <>
        {route.track && <h2>{title(route.track)}의 기록</h2>}
        {route.person && (data.profile ? <section className="social-profile"><Avatar profile={data.profile} /><h2>{data.profile.nickname} <small>@{data.profile.handle}</small></h2><p>팔로워 {data.profile.follower_count} · 팔로잉 {data.profile.following_count}</p>{user && ownProfile?.id !== route.person && <><button disabled={busy || !ownProfile} onClick={() => run('follow', () => client.follow(route.person, !data.profile.following))}>{data.profile.following ? '팔로우 취소' : '팔로우'}</button><button onClick={() => setConfirm({ text: '이 사용자를 차단할까요? 서로의 게시물·댓글이 숨겨지고 양쪽 팔로우가 해제돼요.', action: () => client.block(route.person) })}>사용자 차단</button></>}</section> : <p>프로필을 볼 수 없어요.</p>)}
        {ownProfile && <button onClick={() => { reset('records') }}>기록 작성</button>}
        {!data.posts.length && <p>{route.post ? '게시물을 볼 수 없어요. 공개 범위·팔로우·차단 상태를 확인해주세요.' : '지금 볼 수 있는 음악 기록이 없어요.'}</p>}
        <section className="social-feed" aria-label="음악 기록 피드">{data.posts.map(post => <Post key={post.id} post={post} user={ownProfile} navigate={navigate} run={run} pending={busy} openComments={openComments} commentState={comments[post.id]} draft={drafts[post.id]} setDraft={setDraft} submitComment={submitComment}
          manage={{ like: client.like, edit: post => setEditor({ kind: 'edit', post }), confirmUnshare: post => setConfirm({ text: '공유를 취소할까요? 공유본과 그 댓글·좋아요는 삭제하며 개인 원본은 보존해요.', action: () => client.unshare(post.id) }), deleteComment: client.deleteComment }}
          report={post => { setReporting(post); setReason('') }} block={post => setConfirm({ text: '이 사용자를 차단할까요? 서로의 게시물·댓글이 숨겨지고 양쪽 팔로우가 해제돼요.', action: () => client.block(post.profile.id) })} />)}</section>
        {data.posts.length >= 30 && <button disabled={busy} onClick={() => run('more', async () => { const stamp = generation.current; const more = await client.feed(route, data.posts.at(-1)); if (stamp === generation.current) { if (more.length) pageDepth.current++; setData(v => v && ({ ...v, posts: [...v.posts, ...more.filter(p => !v.posts.some(old => old.id === p.id))] })) } }, false)}>이전 기록 더 보기</button>}
      </>}
    </>}
    {user && meLoaded && !ownProfile && <ProfileEditor key={nicknameHint} nicknameHint={nicknameHint} pending={busy} save={value => run('profile', () => client.saveProfile(value))} />}
    {tab === 'profile' && ownProfile && <ProfileEditor key={ownProfile.id} profile={ownProfile} pending={busy} save={value => run('profile', () => client.saveProfile(value))} />}
    {tab === 'records' && user && <MyMusicRecords auth={auth} client={client.db} />}
    {editor && ownProfile && connected && <section className="social-editor" aria-label="공유본 편집"><ShareEditor key={editor.post.id} post={editor.post} pending={busy} cancel={() => setEditor(null)} save={value => run('share', async () => { await client.editPost(editor.post.id, value); setEditor(null) })} /></section>}
    {confirm && <section className="social-confirm" role="dialog" aria-modal="true" aria-label="변경 확인"><p>{confirm.text}</p><button disabled={busy} onClick={() => run('confirm', async () => { await confirm.action(); setConfirm(null) })}>확인</button><button disabled={busy} onClick={() => setConfirm(null)}>취소</button></section>}
    {reporting && <form className="social-form" onSubmit={e => { e.preventDefault(); void run('report', async () => { await client.report(reporting.id, reason.trim()); setReporting(null); setNotice('신고를 접수했어요. 운영자가 확인합니다.') }) }}><h2>게시물 신고</h2><label>신고 사유<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !reason.trim()}>신고 접수</button><button type="button" onClick={() => setReporting(null)}>취소</button></form>}
  </main>
}
