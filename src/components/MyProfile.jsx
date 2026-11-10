import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getSocialApi } from '../data/socialClient.js'
import { readRecordSummary } from '../data/profileRecords.js'
import { profileRoute } from '../data/profileRoutes.js'
import { emotionLabel } from '../data/emotions.js'
import { Avatar, ProfileEditor } from './SocialProfile.jsx'
import { MyMusicRecords } from './MusicJournal.jsx'
import { musicRecordTitle } from './MusicSharing.jsx'
import { tracks } from '../data/musicData.js'

function navigate(section = '', replace = false) {
  const hash = '#profile' + (section ? '/' + section : '')
  if (replace) { window.history.replaceState(null, '', hash); window.dispatchEvent(new window.Event('hashchange')) }
  else window.location.hash = hash
}

function MenuLink({ to, icon, title, children }) {
  const paths = { records:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4', taste:'M12 20S3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z', settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M8 15v6' }
  return <a className="profile-menu-row" href={'#profile/' + to}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={paths[icon] || paths.settings} /></svg><span><strong>{title}</strong>{children && <small>{children}</small>}</span><span aria-hidden="true">›</span></a>
}

function Identity({ profile }) {
  return <div className="profile-identity"><Avatar profile={profile} /><div><strong>{profile?.nickname || '나의 음악 활동'}</strong><p>{profile?.handle ? '@' + profile.handle : '공개 프로필을 만들어보세요.'}</p></div></div>
}

function RecentRecords({ userId, client, onOpenTrack }) {
  const [summary, setSummary] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true, sequence = 0
    const load = async () => {
      const ticket = ++sequence; setSummary(null); setError(false)
      try { const result = await readRecordSummary(client, userId); if (active && ticket === sequence) setSummary(result) }
      catch { if (active && ticket === sequence) setError(true) }
    }
    const refresh = () => { if (!document.hidden) void load() }
    void load(); window.addEventListener('focus', refresh); window.addEventListener('music-sharing-changed', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { active = false; sequence++; window.removeEventListener('focus', refresh); window.removeEventListener('music-sharing-changed', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [client, userId, retry])
  return <section className="profile-recent" aria-labelledby="recent-records-title"><h2 id="recent-records-title">최근 기록</h2>
    {error ? <p role="alert">기록 요약을 불러오지 못했어요. <button onClick={() => setRetry(v => v + 1)}>다시 시도</button></p> : !summary ? <p role="status">기록 요약을 불러오는 중…</p> : <>
      <dl className="profile-record-counts">{[['전체','total','records'],['나만 보기','private','records/private'],['공개 중','public','records/public']].map(([label,key,to]) => <div key={key}><dt>{label}</dt><dd><a href={'#profile/' + to} aria-label={label + ' 기록 ' + summary[key] + '개'}>{summary[key]}</a></dd></div>)}</dl>
      {summary.recent.length ? <ul>{summary.recent.map(record => <li key={record.id}><button onClick={() => onOpenTrack?.(tracks.find(t => t.id === record.track_id))}>{musicRecordTitle(record.track_id)}</button><time dateTime={record.recorded_on}>{record.recorded_on}</time><p>{record.body.length > 80 ? record.body.slice(0,80) + '…' : record.body}</p></li>)}</ul> : <p>첫 음악 기록을 남겨보세요. 선택한 기록만 공유할 수 있어요.</p>}
    </>}
    <a className="profile-action" href="#profile/records">전체 기록 보기</a>
  </section>
}

function BlockedUsers({ api }) {
  const [rows,setRows] = useState(null), [error,setError] = useState(false), [pending,setPending] = useState(false), [revision,setRevision] = useState(0)
  const alive = useRef(false), lock = useRef(false)
  useEffect(() => { alive.current = true; let current = true; setRows(null); setError(false); api.blocks().then(result => { if (current) setRows(result) }).catch(() => { if (current) setError(true) }); return () => { alive.current = false; current = false } }, [api,revision])
  return <section className="profile-section">{error && <p role="alert">차단 목록을 불러오지 못했어요. <button onClick={() => setRevision(v => v + 1)}>다시 시도</button></p>}{rows ? rows.length ? rows.map((row,i) => <div className="profile-block" key={row.blocked_id}><span>차단한 사용자 {i + 1}</span><button disabled={pending} onClick={async () => { if (lock.current) return; lock.current = true; setPending(true); setError(false); try { await api.unblock(row.blocked_id); if (alive.current) setRevision(v => v + 1) } catch { if (alive.current) setError(true) } finally { lock.current = false; if (alive.current) setPending(false) } }}>차단 해제</button></div>) : <p>차단한 사용자가 없어요.</p> : !error && <p role="status">차단 목록을 불러오는 중…</p>}</section>
}

// Body-heavy child views mount on demand. This dashboard never subscribes to a feed.
export default function MyProfile({ auth, preference, savedTracks = [], onGoExplore, syncStatus, onOpenTrack, section = '', AccountPanel, PreferenceScreen, PrivacySummary, api = getSocialApi() }) {
  const route = profileRoute(section), heading = useRef(null)
  const [data,setData] = useState(null), [error,setError] = useState(false), [pending,setPending] = useState(false), [saveError,setSaveError] = useState(false)
  const sequence = useRef(0), alive = useRef(false), lock = useRef(false)
  const load = useCallback(async () => {
    const ticket = ++sequence.current
    if (!auth?.user || !api) return
    try { const mine = await api.me(), profile = mine?.id ? await api.profile(mine.id) : null; if (alive.current && sequence.current === ticket) { setData({mine,profile}); setError(false) } }
    catch { if (alive.current && sequence.current === ticket) { setData(null); setError(true) } }
  }, [api,auth?.user?.id])
  useEffect(() => { alive.current = true; void load(); const refresh = () => { if (!document.hidden) void load() }; window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh); return () => { alive.current = false; sequence.current++; window.removeEventListener('focus',refresh); document.removeEventListener('visibilitychange',refresh) } }, [load])
  useEffect(() => { if (route.canonical) navigate(route.canonical,true); heading.current?.focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'}) }, [section])
  const mine = data?.mine?.id ? data.mine : null, publicProfile = data?.profile ?? mine
  const titles = {home:'내 프로필',records:'내 기록',taste:'나의 음악 취향',settings:'설정',edit:'프로필 수정',preview:'공개 프로필 미리보기',blocked:'차단한 사용자',privacy:'개인정보 처리 안내'}
  const backToSettings = ['edit','preview','blocked','privacy'].includes(route.view)
  const composers = [...savedTracks.reduce((map,track) => map.set(track.composer,(map.get(track.composer)||0)+1),new Map())].sort((a,b) => b[1]-a[1]).slice(0,2).map(([name]) => name)
  const tasteSummary = preference?.count ? [preference.topEmotions?.map(emotionLabel).join(' · '),composers.length ? '많이 보관한 작곡가: ' + composers.join(' · ') : ''].filter(Boolean).join(' / ') : '마음에 드는 곡을 보관하며 취향을 알아보세요.'
  return <>
    <header className="library-header profile-dashboard-header"><p>MY PROFILE</p>{route.view !== 'home' && <a className="profile-back" href={backToSettings ? '#profile/settings' : '#profile'}>{backToSettings ? '← 설정' : '← 내 프로필 홈'}</a>}<h1 id={route.view === 'records' ? 'my-records-title' : 'profile-screen-title'} tabIndex={-1} ref={heading}>{titles[route.view]}</h1></header>
    <main className={'library-main my-profile profile-view-' + route.view}>
      {auth?.isLoading ? <p role="status">로그인을 확인하고 있어요.</p> : !auth?.user ? <section className="profile-section profile-login"><h2>나의 음악 활동을 모아보세요</h2><p>Google로 로그인하면 내 기록과 취향을 살펴보고, 선택한 글만 공유할 수 있어요.</p><button onClick={auth?.signInWithGoogle} disabled={auth?.isLoading || !auth?.configured}>Google로 계속하기</button>{auth?.error && <p role="alert">{auth.error}</p>}</section> : <>
        {route.view === 'home' && <>
          <section className="profile-home-identity" aria-label="내 프로필 요약"><Identity profile={mine} />{error ? <p role="alert">프로필을 불러오지 못했어요. <button onClick={load}>다시 시도</button></p> : !data ? <p role="status">프로필 불러오는 중…</p> : <>
            {mine && <div className="profile-social-counts"><span>팔로워 {publicProfile?.follower_count ?? 0}</span><span>팔로잉 {publicProfile?.following_count ?? 0}</span></div>}
            <a className="profile-action" href="#profile/edit">{mine ? '프로필 수정' : '공개 프로필 만들기'}</a>{mine && <a className="profile-preview-link" href="#profile/preview">다른 사용자에게 보이는 내 프로필 확인</a>}
          </>}</section>
          <nav className="profile-menu" aria-label="프로필 메뉴"><MenuLink to="records" icon="records" title="내 기록">비공개 원본과 공개 중인 기록</MenuLink><MenuLink to="taste" icon="taste" title="나의 취향">{tasteSummary}</MenuLink><MenuLink to="settings" icon="settings" title="설정">프로필 · 개인정보 · 계정</MenuLink></nav>
          {api?.db && <RecentRecords key={auth.user.id} userId={auth.user.id} client={api.db} onOpenTrack={onOpenTrack} />}
        </>}
        {route.view === 'records' && <section className="profile-section profile-records"><MyMusicRecords auth={auth} client={api?.db} onOpenTrack={onOpenTrack} embedded filter={route.filter} onFilterChange={value => navigate('records' + (value === 'all' ? '' : '/' + value))} /></section>}
        {route.view === 'taste' && <section className="profile-section profile-taste"><p>{tasteSummary}</p><PreferenceScreen profile={preference} onGoExplore={onGoExplore} embedded /></section>}
        {route.view === 'settings' && <><nav className="profile-menu" aria-label="설정 메뉴"><MenuLink to="edit" title="공개 프로필 수정" />{mine && <MenuLink to="preview" title="다른 사용자에게 보이는 내 프로필 확인" />}<MenuLink to="blocked" title="차단한 사용자 관리" /><MenuLink to="privacy" title="개인정보 처리 안내" /></nav><section className="profile-account"><h2>계정</h2><AccountPanel auth={auth} syncStatus={syncStatus} privacyControl={false} /></section></>}
        {route.view === 'edit' && <section className="profile-section">{error ? <p role="alert">프로필을 불러오지 못했어요. <button onClick={load}>다시 시도</button></p> : !data ? <p role="status">프로필 불러오는 중…</p> : <><ProfileEditor key={mine?.id ?? 'new'} profile={mine} nicknameHint={data.mine?.nickname ?? ''} pending={pending} save={async value => { if (lock.current) return; lock.current = true; setPending(true); setSaveError(false); try { await api.saveProfile(value); if (alive.current) { await load(); navigate() } } catch { if (alive.current) setSaveError(true) } finally { lock.current = false; if (alive.current) setPending(false) } }} />{saveError && <p role="alert">저장하지 못했어요. 입력은 유지했어요. 아이디 중복·형식과 연결을 확인해주세요.</p>}</>}</section>}
        {route.view === 'preview' && <section className="profile-section public-profile-preview" aria-label="공개 프로필 미리보기">{mine ? <><Identity profile={mine} /><p>팔로워 {publicProfile?.follower_count ?? 0} · 팔로잉 {publicProfile?.following_count ?? 0}</p><p>공개 닉네임·아이디·이미지만 표시해요. 게시물은 방문자의 열람 권한에 따라 달라져요.</p><a href="#profile/records/public">공개 중인 기록 관리</a></> : <p>공개 프로필을 먼저 만들어주세요. <a href="#profile/edit">공개 프로필 만들기</a></p>}</section>}
        {route.view === 'blocked' && api && <BlockedUsers api={api} />}
        {route.view === 'privacy' && <section className="profile-section"><PrivacySummary /></section>}
      </>}
    </main>
  </>
}
