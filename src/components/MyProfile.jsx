import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getSocialApi, socialScopes } from '../data/socialClient.js'
import { Avatar, ProfileEditor } from './SocialProfile.jsx'
import { MyMusicRecords } from './MusicJournal.jsx'
import { musicRecordTitle } from './MusicSharing.jsx'

// Own-account metadata and explicitly requested own posts only. Never load the
// global feed or create its Realtime subscription just to visit this screen.
export default function MyProfile({ auth, preference, onGoExplore, syncStatus, onOpenTrack, section = '', AccountPanel, PreferenceScreen, PrivacySummary, api = getSocialApi() }) {
  const [data, setData] = useState(null), [editing, setEditing] = useState(false), [preview, setPreview] = useState(false)
  const [error, setError] = useState(''), [pending, setPending] = useState(false)
  const sequence = useRef(0), alive = useRef(false), lock = useRef(false)
  const recordsHeading = useRef(null), postsHeading = useRef(null)
  const load = useCallback(async () => {
    const ticket = ++sequence.current
    if (!auth?.user || !api) return
    try {
      const [mine, blocks] = await Promise.all([api.me(), api.blocks()])
      const profile = mine?.id ? await api.profile(mine.id) : null
      if (alive.current && sequence.current === ticket) { setData({ mine, profile, blocks }); setError('') }
    } catch (e) { if (alive.current && sequence.current === ticket) { setData(null); setError(e.message) } }
  }, [api, auth?.user?.id])
  useEffect(() => {
    alive.current = true; void load()
    const refresh = () => { if (!document.hidden) void load() }
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { alive.current = false; sequence.current++; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [load])
  useEffect(() => {
    const target = section === 'records' ? recordsHeading : section === 'posts' ? postsHeading : null
    target?.current?.scrollIntoView?.({ block: 'start' }); target?.current?.focus({ preventScroll: true })
  }, [section, data?.mine?.id])
  const run = async action => {
    if (lock.current) return
    lock.current = true; setPending(true); setError('')
    try { await action(); if (alive.current) await load() }
    catch (e) { if (alive.current) setError(e.message) }
    finally { lock.current = false; if (alive.current) setPending(false) }
  }
  const mine = data?.mine?.id ? data.mine : null, publicProfile = data?.profile ?? mine
  return <>
    <header className="library-header"><p>MY PROFILE</p><h1>내 프로필</h1><span>나의 기록과 음악 취향을 한곳에서 살펴보세요.</span></header>
    <main className="library-main my-profile">
      <section className="profile-section" aria-labelledby="public-profile-title"><h2 id="public-profile-title">공개 프로필</h2>
        {!auth?.user ? <p>Google로 로그인하면 내 프로필을 만들고 음악 이야기에 참여할 수 있어요.</p> : !api ? <p>공개 프로필 서비스를 준비 중이에요.</p> : !data ? <p role="status">프로필 불러오는 중… <button onClick={load}>다시 확인</button></p> : <>
          {mine && <><div className="profile-identity"><Avatar profile={mine} /><div><strong>{mine.nickname}</strong><p>@{mine.handle}</p></div></div><p>팔로워 {publicProfile?.follower_count ?? 0} · 팔로잉 {publicProfile?.following_count ?? 0}</p></>}
          <button onClick={() => setEditing(v => !v)} aria-expanded={editing}>{mine ? '공개 프로필 수정' : '공개 프로필 만들기'}</button>
          {editing && <ProfileEditor key={mine?.id ?? 'new'} profile={mine} nicknameHint={data.mine?.nickname ?? ''} pending={pending} save={value => run(async () => { await api.saveProfile(value); if (alive.current) setEditing(false) })} />}
          {mine && <><button onClick={() => setPreview(v => !v)} aria-expanded={preview}>다른 사용자에게 보이는 내 프로필 확인</button>
            {preview && <aside className="public-profile-preview" aria-label="공개 프로필 미리보기"><Avatar profile={mine} /><strong>{mine.nickname}</strong><p>@{mine.handle}</p><p>팔로워 {publicProfile?.follower_count ?? 0} · 팔로잉 {publicProfile?.following_count ?? 0}</p><p>공개 닉네임·아이디·이미지만 표시해요. 게시물은 방문자의 열람 권한에 따라 달라져요.</p></aside>}
            <a href="#profile/posts">내 게시물·팔로워 보기</a>
          </>}
        </>}
        {error && <p role="alert">{error}</p>}
      </section>
      {section === 'posts' && <section className="profile-section" aria-labelledby="my-posts-title"><h2 id="my-posts-title" tabIndex={-1} ref={postsHeading}>내가 공유한 게시물</h2>{mine && <OwnPosts key={mine.id} api={api} profileId={mine.id} />}</section>}
      <section className="profile-section profile-records" aria-labelledby="my-records-title"><h2 id="my-records-title" tabIndex={-1} ref={recordsHeading}>내 기록</h2><MyMusicRecords auth={auth} client={api?.db} onOpenTrack={onOpenTrack} embedded /></section>
      <section className="profile-section profile-taste" aria-labelledby="my-taste-title"><h2 id="my-taste-title">나의 음악 취향</h2><PreferenceScreen profile={preference} onGoExplore={onGoExplore} embedded /></section>
      <section className="profile-section" aria-labelledby="profile-activity-title"><h2 id="profile-activity-title">활동 관리</h2><h3>차단한 사용자</h3>
        {!auth?.user ? <p>로그인하면 차단한 사용자를 관리할 수 있어요.</p> : !data ? <p>차단 목록을 확인하고 있어요.</p> : data.blocks.length ? data.blocks.map((b, i) => <div className="profile-block" key={b.blocked_id}><span>차단한 사용자 {i + 1}</span><button disabled={pending} onClick={() => run(() => api.unblock(b.blocked_id))}>차단 해제</button></div>) : <p>차단한 사용자가 없어요.</p>}
        {mine && <a href="#profile/posts">내가 공유한 게시물 확인</a>}
        <details className="profile-privacy"><summary>개인정보 처리 안내</summary><PrivacySummary /></details>
      </section>
      <AccountPanel auth={auth} syncStatus={syncStatus} privacyControl={false} />
    </main>
  </>
}

function OwnPosts({ api, profileId }) {
  const [posts, setPosts] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false)
  const [connectionRevision, setConnectionRevision] = useState(0)
  const alive = useRef(false), sequence = useRef(0), ready = useRef(false), depth = useRef(1), locked = useRef(false)
  const refresh = async () => {
    const ticket = ++sequence.current; setPosts(null)
    if (!ready.current || document.hidden) return
    try {
      const rows = await api.feed({ person: profileId })
      if (!alive.current || ticket !== sequence.current) return
      for (let page = 1; page < depth.current && rows.length >= page * 30; page++) {
        if (!alive.current || ticket !== sequence.current) return
        rows.push(...await api.feed({ person: profileId }, rows.at(-1)))
      }
      if (alive.current && ticket === sequence.current && ready.current) { setPosts(rows); setError('') }
    } catch (e) { if (alive.current && ticket === sequence.current) setError(e.message) }
  }
  const callback = useRef(refresh); callback.current = refresh
  useEffect(() => {
    alive.current = true
    const clear = () => { sequence.current++; setPosts(null) }
    const reload = () => { clear(); if (ready.current && !document.hidden) void callback.current() }
    const stop = api.subscribe(reload, status => { ready.current = status === 'SUBSCRIBED'; reload() })
    const offline = () => { ready.current = false; clear() }
    const online = () => { clear(); setConnectionRevision(v => v + 1) }
    const pageshow = () => ready.current ? reload() : online()
    window.addEventListener('offline', offline); window.addEventListener('online', online); window.addEventListener('pagehide', offline); window.addEventListener('pageshow', pageshow); document.addEventListener('visibilitychange', reload)
    return () => { alive.current = false; ready.current = false; sequence.current++; stop(); window.removeEventListener('offline', offline); window.removeEventListener('online', online); window.removeEventListener('pagehide', offline); window.removeEventListener('pageshow', pageshow); document.removeEventListener('visibilitychange', reload) }
  }, [api, profileId, connectionRevision])
  return <>{error && <p role="alert">{error}</p>}{posts ? posts.length ? posts.map(post => <article className="profile-own-post" key={post.id}><h3>{musicRecordTitle(post.track_id)}</h3><p>{post.body}</p><small>{socialScopes[post.visibility]}</small><a href={'#music/post/' + encodeURIComponent(post.id)}>게시물 보기·관리</a></article>) : <p>공유한 게시물이 없어요.</p> : <p role="status">게시물을 다시 확인하고 있어요.</p>}{posts?.length >= 30 && <button disabled={pending} onClick={async () => { if (locked.current) return; locked.current = true; setPending(true); depth.current++; await refresh(); locked.current = false; if (alive.current) setPending(false) }}>이전 게시물 더 보기</button>}</>
}
