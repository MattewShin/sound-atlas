import React, { useEffect, useRef, useState } from 'react'
import { tracks } from '../data/musicData.js'
import { formatTrackTitle } from '../data/emotions.js'
import { JOURNAL_KINDS } from '../data/musicJournal.js'
import { isStoryId, listPublicStories, publishMusicRecord, readMusicNickname, readPublicStory, sharingError, storyUrl, validateShare } from '../data/musicSharing.js'
import { supabase } from '../lib/supabaseClient.js'

export const musicRecordTitle = (trackId) => {
  const track = tracks.find(({ id }) => id === trackId)
  return track ? formatTrackTitle(track) : '등록 목록에서 제외된 곡'
}
export const notifySharingChanged = () => window.dispatchEvent(new window.Event('music-sharing-changed'))

export function CopyStoryLink({ id }) {
  const [message, setMessage] = useState(null)
  return <><button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(storyUrl(id)); setMessage('공개 링크를 복사했어요.') }
    catch { setMessage('복사하지 못했어요. 공개 글을 열어 주소를 복사해 주세요.') }
  }}>링크 복사</button>{message && <small role="status">{message}</small>}</>
}

export function PublicStoryCard({ story, onOpenTrack }) {
  const track = tracks.find(({ id }) => id === story.track_id)
  return <article className="public-story-card">
    <div className="music-journal-entry-meta"><strong>{story.nickname}</strong><span>공개 기록</span></div>
    <h3>{musicRecordTitle(story.track_id)}</h3>
    <small>기록 날짜 {story.recorded_on} · {JOURNAL_KINDS.find(({ value }) => value === story.kind)?.label || '자유 기록'}</small>
    <p className="music-journal-entry-body">{story.body}</p>
    <small>공유한 날 {new Date(story.published_at).toLocaleDateString('ko-KR')}</small>
    <div className="music-journal-actions">{onOpenTrack && track && <button type="button" onClick={() => onOpenTrack(track)}>이 곡 자세히 보기</button>}<a href={storyUrl(story.id)}>공개 글 열기</a><CopyStoryLink id={story.id} /></div>
  </article>
}

export function ShareMusicRecord({ record, userId, client = supabase, onClose, onPublished }) {
  const [nickname, setNickname] = useState('')
  const [fixedNickname, setFixedNickname] = useState(false)
  const [body, setBody] = useState(record.body)
  const [preview, setPreview] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [id] = useState(() => crypto.randomUUID())
  const alive = useRef(true)
  const sending = useRef(false)
  useEffect(() => {
    alive.current = true
    readMusicNickname(client, userId).then((name) => {
      if (alive.current) { setNickname(name); setFixedNickname(Boolean(name)); setLoading(false) }
    }).catch((failure) => { if (alive.current) { setError(sharingError(failure)); setLoading(false) } })
    return () => { alive.current = false }
  }, [client, userId])

  const publish = async () => {
    if (!preview || !consent || sending.current) return
    sending.current = true; setBusy(true); setError(null)
    try {
      await publishMusicRecord(client, userId, record, { id, ...preview })
      if (!alive.current) return
      notifySharingChanged()
      onPublished()
    } catch (failure) {
      if (alive.current) setError(sharingError(failure))
    } finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  return <div className="music-share-editor" aria-label="음악 기록 공유 준비">
    <h4>{preview ? '게시 전 미리보기' : '공개할 내용 준비'}</h4>
    <p>원본은 비공개로 유지돼요. 아래에서 고른 내용만 누구나 볼 수 있게 공개합니다.</p>
    {loading ? <p role="status">닉네임을 확인하는 중…</p> : preview ? <>
      <div className="music-share-preview"><strong>{preview.nickname}</strong><h4>{musicRecordTitle(record.track_id)}</h4><small>{record.recorded_on} · {JOURNAL_KINDS.find(({ value }) => value === record.kind)?.label}</small><p className="music-journal-entry-body">{preview.body}</p></div>
      <p>공개 후 개인 기록을 수정해도 이 글은 바뀌지 않아요. 원본 기록·계정을 삭제하면 공유본도 내려갑니다.</p>
      <label className="music-share-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />닉네임·곡명·기록 날짜·유형·본문이 로그인하지 않은 사람에게도 공개됨을 확인했어요.</label>
      <small>개인정보·타인의 권리를 침해하는 내용은 게시하지 마세요. 공유를 취소해도 이미 복사되거나 캡처된 내용까지 회수할 수는 없어요.</small>
      <div className="music-journal-actions"><button type="button" disabled={busy} onClick={() => { setPreview(null); setConsent(false); setError(null) }}>내용 다시 편집</button><button type="button" disabled={busy || !consent} onClick={publish}>{busy ? '공개 중…' : '이 내용으로 공개'}</button></div>
    </> : <form onSubmit={(event) => {
      event.preventDefault()
      const message = validateShare(nickname, body)
      if (message) { setError(message); return }
      setPreview({ nickname: nickname.trim(), body: body.trim() }); setConsent(false); setError(null)
    }}>
      <label>공개용 닉네임<input type="text" maxLength={20} value={nickname} disabled={fixedNickname} onChange={(event) => setNickname(event.target.value)} autoComplete="off" /></label>
      <small>{fixedNickname ? '처음 공유할 때 정한 닉네임이에요. 이번 버전에서는 변경하지 않아요.' : '실명·이메일·연락처 대신 2~20자의 닉네임을 정해주세요. 첫 공개 시 등록되며 이후 같은 이름을 사용해요.'}</small>
      <label>공개할 내용<textarea rows={6} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <small>공개용 내용을 고쳐도 원본 일지는 바뀌지 않아요.</small>
      <div className="music-journal-actions"><button type="submit">게시 전 미리보기</button></div>
    </form>}
    {error && <p className="music-journal-error" role="alert">{error}</p>}
    <button type="button" className="music-share-close" disabled={busy} onClick={onClose}>공유 준비 닫기</button>
  </div>
}

export function PublicMusicStories({ trackId, client = supabase }) {
  const [stories, setStories] = useState([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState(null)
  const active = useRef(false), token = useRef(0)
  const load = async (page = 0) => {
    const request = ++token.current; setLoading(true); setError(null)
    try {
      const result = await listPublicStories(client, trackId, page)
      if (!active.current || request !== token.current) return
      setStories((previous) => page === 0 ? result.stories : [...new Map([...previous, ...result.stories].map((row) => [row.id, row])).values()]); setTotal(result.total)
    } catch (failure) { if (active.current && request === token.current) setError(sharingError(failure)) }
    finally { if (active.current && request === token.current) setLoading(false) }
  }
  useEffect(() => {
    active.current = true
    const refresh = () => { setStories([]); void load() }
    if (client) void load()
    window.addEventListener('music-sharing-changed', refresh)
    return () => { active.current = false; token.current += 1; window.removeEventListener('music-sharing-changed', refresh) }
  }, [client, trackId])
  return <section className="track-detail-section public-music-stories" aria-label="이 곡의 이야기"><h3>이 곡의 이야기</h3><p>사용자가 직접 공개한 기록만 보여요.</p>
    {loading && <p role="status">공개 기록을 불러오는 중…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => void load()}>다시 불러오기</button></div>}
    {!loading && !error && stories.length === 0 && <p>아직 공개된 이야기가 없어요.</p>}
    {stories.map((story) => <PublicStoryCard key={story.id} story={story} />)}
    {stories.length < total && <button type="button" disabled={loading} onClick={() => void load(Math.ceil(stories.length / 10))}>이야기 더 보기</button>}
  </section>
}

export function PublicStoryScreen({ id, onBack, onOpenTrack, client = supabase }) {
  const [state, setState] = useState({ loading: true, story: null, error: null })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setState({ loading: true, story: null, error: null })
    const load = client && isStoryId(id) ? readPublicStory(client, id) : Promise.resolve(null)
    load.then((story) => { if (active) setState({ loading: false, story, error: null }) })
      .catch((failure) => { if (active) setState({ loading: false, story: null, error: sharingError(failure) }) })
    return () => { active = false }
  }, [client, id, revision])
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('focus', refresh); window.addEventListener('music-sharing-changed', refresh)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('music-sharing-changed', refresh) }
  }, [])
  return <><header className="library-header"><p>MUSIC STORIES</p><h1>공유된 음악 기록</h1><span>음악과 함께 남긴 이야기</span></header><main className="library-main public-story-screen">
    {state.loading ? <p role="status">공개 기록을 불러오는 중…</p> : state.error ? <p role="alert">{state.error}</p> : state.story ? <PublicStoryCard story={state.story} onOpenTrack={onOpenTrack} /> : <p>공유가 취소됐거나 존재하지 않는 글이에요.</p>}
    <button type="button" onClick={() => setRevision((value) => value + 1)}>다시 확인</button><button type="button" onClick={onBack}>음악 탐색으로 돌아가기</button>
  </main></>
}
