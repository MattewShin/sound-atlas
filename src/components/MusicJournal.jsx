import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { deleteMusicRecord, JOURNAL_BODY_LIMIT, JOURNAL_KINDS, JOURNAL_PAGE_SIZE, journalDate, journalErrorMessage, listMusicRecords, saveMusicRecord, validateMusicRecord } from '../data/musicJournal.js'
import { listMyMusicShares, sharingError, storyUrl, withdrawMusicRecord } from '../data/musicSharing.js'
import { CopyStoryLink, musicRecordTitle, notifySharingChanged, ShareMusicRecord } from './MusicSharing.jsx'
import { tracks } from '../data/musicData.js'
import { getSocialApi, socialScopes } from '../data/socialClient.js'

// Keyed by user and track: late requests and drafts can never enter another account's screen.
export function MusicJournalRecords({ userId, trackId, client = supabase, onOpenTrack }) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [shares, setShares] = useState([])
  const [filter, setFilter] = useState('all')
  const [scopeTarget, setScopeTarget] = useState(null)
  const [sharesError, setSharesError] = useState(null)
  const [sharesLoading, setSharesLoading] = useState(true)
  const [shareTarget, setShareTarget] = useState(null)
  const [withdrawTarget, setWithdrawTarget] = useState(null)
  const active = useRef(false)
  const request = useRef(0)
  const saving = useRef(false)
  const shareRequest = useRef(0)
  const loadShares = async () => {
    const token = ++shareRequest.current
    setSharesLoading(true); setSharesError(null)
    try {
      const result = await listMyMusicShares(client, userId)
      if (active.current && token === shareRequest.current) setShares(result)
    } catch (failure) { if (active.current && token === shareRequest.current) setSharesError(sharingError(failure)) }
    finally { if (active.current && token === shareRequest.current) setSharesLoading(false) }
  }

  const load = async (page = 0) => {
    const token = ++request.current
    setLoading(true)
    setError(null)
    try {
      const result = await listMusicRecords(client, userId, trackId, page)
      if (!active.current || request.current !== token) return
      setRecords((previous) => page === 0 ? result.records : [...new Map([...previous, ...result.records].map((row) => [row.id, row])).values()])
      setTotal(result.total)
    } catch (failure) {
      if (active.current && request.current === token) setError(journalErrorMessage(failure))
    } finally {
      if (active.current && request.current === token) setLoading(false)
    }
  }

  useEffect(() => {
    active.current = true
    void load()
    void loadShares()
    return () => { active.current = false; request.current += 1; shareRequest.current += 1 }
  }, [client, userId, trackId])

  const save = async (event) => {
    event.preventDefault()
    if (saving.current) return
    const validation = validateMusicRecord(draft)
    if (validation) { setError(validation); return }
    if (!draft.revision && !tracks.some(track => track.id === (draft.track_id || trackId))) { setError('등록된 곡을 선택해주세요.'); return }
    saving.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await saveMusicRecord(client, userId, draft.track_id || trackId, draft)
      if (!active.current) return
      setDraft(null)
      setNotice('비공개 기록을 저장했어요.')
      await load()
    } catch (failure) {
      if (active.current) setError(journalErrorMessage(failure))
    } finally {
      saving.current = false
      if (active.current) setBusy(false)
    }
  }

  const remove = async () => {
    if (saving.current || !deleteTarget) return
    saving.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await deleteMusicRecord(client, userId, deleteTarget)
      if (!active.current) return
      setDeleteTarget(null)
      setNotice('기록을 삭제했어요.')
      notifySharingChanged()
      await load()
      await loadShares()
    } catch (failure) {
      if (active.current) setError(journalErrorMessage(failure))
    } finally {
      saving.current = false
      if (active.current) setBusy(false)
    }
  }

  const withdraw = async () => {
    if (saving.current || !withdrawTarget) return
    saving.current = true; setBusy(true); setError(null)
    try {
      await withdrawMusicRecord(client, userId, withdrawTarget.id)
      if (!active.current) return
      setWithdrawTarget(null); setNotice('공유를 취소했어요. 내 기록은 유지돼요.')
      notifySharingChanged(); await loadShares()
    } catch (failure) { if (active.current) setError(sharingError(failure)) }
    finally { saving.current = false; if (active.current) setBusy(false) }
  }
  const editing = busy || Boolean(draft) || Boolean(shareTarget) || Boolean(scopeTarget)

  return <>
    <div className="music-journal-toolbar"><span>{total}개의 기록</span><button type="button" disabled={editing} onClick={() => {
      setNotice(null); setError(null); setDeleteTarget(null)
      setDraft({ id: crypto.randomUUID(), track_id: trackId || '', kind: 'free', body: '', recorded_on: journalDate(), revision: 0 })
    }}>기록 남기기</button></div>
    {!trackId && <div className="record-filters" role="group" aria-label="내 기록 필터">{[['all','전체'],['private','나만 보기'],['shared','공유 중']].map(([value, label]) => <button key={value} disabled={sharesLoading || Boolean(sharesError)} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}{filter !== 'all' && <p>불러온 기록 중 해당 상태를 표시해요. 다음 기록은 더 보기로 확인하세요.</p>}</div>}
    {draft && <form className="music-journal-form" onSubmit={save}>
      <strong>{musicRecordTitle(draft.track_id || trackId)}</strong>
      {!trackId && <label>등록된 곡<select required disabled={draft.revision > 0 || busy} value={draft.track_id} onChange={event => setDraft({ ...draft, track_id: event.target.value })}><option value="">곡을 선택해주세요</option>{tracks.map(track => <option key={track.id} value={track.id}>{musicRecordTitle(track.id)}</option>)}</select></label>}
      <label>기록 날짜<input type="date" required min="1900-01-01" max="2200-12-31" value={draft.recorded_on} disabled={busy} onChange={(event) => setDraft({ ...draft, recorded_on: event.target.value })} /></label>
      <label>기록 유형<select value={draft.kind} disabled={busy} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>{JOURNAL_KINDS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="music-journal-body">기록 내용<textarea rows={6} maxLength={JOURNAL_BODY_LIMIT} value={draft.body} disabled={busy} placeholder="오늘 이 곡과 함께한 연습, 감상, 생각을 남겨보세요." onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
      <small>{draft.body.length.toLocaleString()} / 4,000자 · 저장을 눌러야 기록돼요. 상세를 닫으면 작성 중인 글은 사라져요.</small>
      <div className="music-journal-actions"><button type="button" disabled={busy} onClick={() => { setDraft(null); setError(null) }}>작성 취소</button><button type="submit" disabled={busy}>{busy ? '저장 중…' : '비공개 저장'}</button></div>
    </form>}
    {notice && <p role="status">{notice}</p>}
    {sharesError && <div className="music-journal-error" role="alert"><p>공유 상태를 확인하지 못했어요. 비공개 기록은 계속 사용할 수 있어요.</p><button type="button" disabled={sharesLoading} onClick={() => void loadShares()}>공유 상태 다시 확인</button></div>}
    {error && <div className="music-journal-error" role="alert"><p>{error}</p><button type="button" disabled={busy || loading} onClick={() => { void load(); void loadShares() }}>기록 새로고침</button></div>}
    {loading && <p role="status">기록을 불러오는 중…</p>}
    {!loading && !error && records.length === 0 && <p>{trackId ? '아직 이 곡에 남긴 기록이 없어요.' : '아직 남긴 기록이 없어요. 곡 상세에서 첫 기록을 남겨보세요.'}</p>}
    <div className="music-journal-list">{records.filter(record => { const shared = shares.find(s => s.source_record_id === record.id); return filter === 'all' || (filter === 'shared' ? Boolean(shared) : !shared || shared.visibility === 'private') }).map((record) => {
      const publication = shares.find(({ source_record_id }) => source_record_id === record.id)
      const track = tracks.find(({ id }) => id === record.track_id)
      return <article className="music-journal-entry" key={record.id}>
      {!trackId && <h3 className="music-journal-track-title">{track && onOpenTrack ? <button type="button" onClick={() => onOpenTrack(track)}>{musicRecordTitle(record.track_id)}</button> : musicRecordTitle(record.track_id)}</h3>}
      <div className="music-journal-entry-meta"><time dateTime={record.recorded_on}>{record.recorded_on.replaceAll('-', '. ')}</time><span>{JOURNAL_KINDS.find(({ value }) => value === record.kind)?.label || '자유 기록'}</span>{record.revision > 1 && <small>수정됨</small>}</div>
      <p className="music-journal-entry-body">{record.body}</p>
      {!publication && <p className="record-private-status">나만 보기</p>}
      {publication && <div className="music-shared-status"><p>공유 중 · {({ private: '나만 보기', public: '전체 공개', followers: '팔로워 공개' })[publication.visibility] ?? '범위 확인 필요'} · 공유한 글은 내 기록 수정과 별도로 유지돼요.</p><a href={storyUrl(publication.id)}>공유본 확인</a> <CopyStoryLink id={publication.id} /><button disabled={editing || sharesLoading} onClick={() => setScopeTarget(publication)}>공개 범위 변경</button></div>}
      <div className="music-journal-actions"><button type="button" disabled={editing} onClick={() => { setDraft({ ...record }); setError(null); setNotice(null); setDeleteTarget(null); setWithdrawTarget(null) }}>수정</button><button type="button" disabled={editing} onClick={() => { setDeleteTarget(record); setNotice(null); setWithdrawTarget(null) }}>삭제</button>
      {publication ? <button type="button" disabled={editing || sharesLoading} onClick={() => { setWithdrawTarget(publication); setDeleteTarget(null) }}>공유 취소</button> : <button type="button" disabled={editing || sharesLoading || Boolean(sharesError)} onClick={() => { setShareTarget(record); setDeleteTarget(null); setWithdrawTarget(null); setNotice(null) }}>선택한 기록 공유</button>}</div>
      {scopeTarget?.id === publication?.id && scopeTarget && <RecordScopeEditor key={publication.id} publication={publication} client={client} onClose={() => setScopeTarget(null)} onSaved={() => { setScopeTarget(null); notifySharingChanged(); void loadShares() }} />}
      {shareTarget?.id === record.id && <ShareMusicRecord key={record.id} record={shareTarget} userId={userId} client={client} onClose={() => { setShareTarget(null); void load(); void loadShares() }} onPublished={() => { setShareTarget(null); setNotice('선택한 범위로 공유본을 저장했어요. 내 기록은 나만 보기로 유지돼요.'); void loadShares() }} />}
      {withdrawTarget?.id === publication?.id && withdrawTarget && <div className="music-journal-delete" role="alert"><p>공유를 취소할까요? 공개 글과 링크에서 내려가며 비공개 원본은 남아요. 이미 복사된 내용은 회수할 수 없어요.</p><div className="music-journal-actions"><button type="button" disabled={busy} onClick={() => setWithdrawTarget(null)}>취소</button><button type="button" disabled={busy} onClick={withdraw}>공유 취소 확정</button></div></div>}
      {deleteTarget?.id === record.id && <div className="music-journal-delete" role="alert"><p>이 기록을 영구 삭제할까요? 공유본도 함께 내려가며 삭제 후에는 복구할 수 없어요.</p><div className="music-journal-actions"><button type="button" disabled={busy} onClick={() => setDeleteTarget(null)}>취소</button><button type="button" disabled={busy} onClick={remove}>{busy ? '삭제 중…' : '영구 삭제'}</button></div></div>}
    </article>})}</div>
    {records.length < total && <button className="music-journal-more" type="button" disabled={loading || busy} onClick={() => void load(Math.ceil(records.length / JOURNAL_PAGE_SIZE))}>기록 더 보기</button>}
  </>
}

function RecordScopeEditor({ publication, client, onClose, onSaved }) {
  const [post, setPost] = useState(null), [scope, setScope] = useState(publication.visibility)
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [review, setReview] = useState(false)
  const alive = useRef(false), lock = useRef(false), api = getSocialApi(client)
  useEffect(() => {
    alive.current = true
    api.feed({ post: publication.id }).then(rows => { if (alive.current) { if (!rows[0]) setError('공유한 글을 볼 수 없어요. 기록을 새로고침해주세요.'); else { setPost(rows[0]); setScope(rows[0].visibility) } } }).catch(() => { if (alive.current) setError('공유 상태를 확인하지 못했어요. 다시 열어주세요.') })
    return () => { alive.current = false }
  }, [api, publication.id])
  return <form className="music-share-editor" aria-label="공개 범위 변경" onSubmit={async event => {
    event.preventDefault(); if (!post || lock.current) return
    if (!review) { setReview(true); return }
    lock.current = true; setPending(true); setError('')
    try { await api.editPost(post.id, { body: post.body, visibility: scope }); if (alive.current) onSaved() }
    catch { if (alive.current) setError('공개 범위를 바꾸지 못했어요. 선택한 범위는 유지했어요.') }
    finally { lock.current = false; if (alive.current) setPending(false) }
  }}><h4>공개 범위 변경</h4><label>공개 범위<select value={scope} disabled={pending || !post} onChange={e => { setScope(e.target.value); setReview(false) }}>{Object.entries(socialScopes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><p role="status">공개 범위: <strong>{socialScopes[scope]}</strong>{scope === 'private' ? ' · 나만 볼 수 있어요.' : scope === 'followers' ? ' · 현재 팔로워만 볼 수 있어요.' : ' · 비로그인 사용자도 볼 수 있어요.'}</p>{error && <p role="alert">{error}</p>}<button disabled={pending || !post}>{review ? `${socialScopes[scope]}로 변경 확정` : '변경 전 확인'}</button><button type="button" disabled={pending} onClick={onClose}>취소</button></form>
}

export function MyMusicRecords({ auth, client = supabase, onOpenTrack, embedded = false }) {
  return <section className="music-journal all-music-records" aria-label="내 기록 목록">{!embedded && <h2>내 기록</h2>}<p>보관을 해제한 곡도 포함해 내가 남긴 기록을 모았어요. 기본은 나만 보기이며 선택한 글만 공유할 수 있어요.</p>
    {auth?.isLoading ? <p role="status">로그인을 확인하고 있어요.</p> : auth?.user && client
      ? <MusicJournalRecords key={auth.user.id} userId={auth.user.id} client={client} onOpenTrack={onOpenTrack} />
      : <p>내 프로필에서 Google로 로그인하면 내 기록을 모아볼 수 있어요.</p>}
  </section>
}

export default function MusicJournal({ auth, trackId, client = supabase }) {
  return <section className="track-detail-section music-journal" aria-labelledby="music-journal-title">
    <div className="music-journal-heading"><h3 id="music-journal-title">나의 음악 기록</h3><span>나만 보기</span></div>
    <p>연습과 감상, 마음에 남은 생각을 기록해요. 보관을 해제해도 기록은 유지돼요.</p>
    {auth?.isLoading ? <p role="status">로그인을 확인하고 있어요.</p> : auth?.user && client
      ? <MusicJournalRecords key={`${auth.user.id}:${trackId}`} userId={auth.user.id} trackId={trackId} client={client} />
      : <p className="music-journal-signin">내 프로필에서 Google로 로그인하면 본인만 볼 수 있는 기록을 남길 수 있어요.</p>}
  </section>
}
