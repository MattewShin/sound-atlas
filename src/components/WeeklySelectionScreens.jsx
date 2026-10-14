import React, { useEffect, useRef, useState } from 'react'
import { composerImages } from '../data/musicData.js'
import { formatTrackTitle } from '../data/emotions.js'
import { formatPreviewTime, getSelectionPreview } from '../data/weeklySelectionHelpers.js'

function SelectionArtwork({ track }) {
  const src = composerImages[track.composer]
  return <span className="weekly-artwork" aria-hidden="true">{src ? <img src={src} alt="" /> : <span>♪</span>}</span>
}

function TrackName({ track }) {
  return <>{track.composer} · {formatTrackTitle(track)}{track.alias ? ` [${track.alias}]` : ''}</>
}

function Period({ entry }) {
  return <span className="weekly-period"><time dateTime={entry.startsOn}>{entry.startsOn.replaceAll('-', '.')}</time> – <time dateTime={entry.endsOn}>{entry.endsOn.replaceAll('-', '.')}</time></span>
}

export function WeeklySelectionSection({ entry, onOpen, onArchive }) {
  if (!entry) return null
  return <section className="weekly-section" aria-labelledby="weekly-section-title">
    <div className="section-heading weekly-section-heading"><p>EDITOR’S PICK</p><h2 id="weekly-section-title">{entry.sectionName}</h2></div>
    <button className="weekly-feature" type="button" onClick={() => onOpen(entry.id)}>
      <SelectionArtwork track={entry.track} />
      <span className="weekly-copy">
        <strong className="weekly-title">{entry.title}</strong>
        <span className="weekly-teaser">{entry.teaser}</span>
        <span className="weekly-track"><TrackName track={entry.track} /></span>
        <span className="weekly-read">이야기 읽기 <span aria-hidden="true">→</span></span>
      </span>
    </button>
    <div className="weekly-footer">{entry.editorName?.trim() && <small>{entry.editorName}</small>}<button className="weekly-link" type="button" onClick={onArchive}>지난 선정곡</button></div>
  </section>
}

function useHeadingFocus() {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])
  return ref
}

export function WeeklySelectionScreen({ entry, detail, isSaved, onBack, onToggleSave, onOpenTrack, saveFeedback, PreviewPlayer }) {
  const headingRef = useHeadingFocus()
  const [showPreview, setShowPreview] = useState(false)
  const { preview, custom } = getSelectionPreview(entry, detail)
  return <main className="weekly-screen">
    <button className="weekly-link weekly-back" type="button" onClick={onBack}>← 돌아가기</button>
    <header className="weekly-story-header">
      <p className="weekly-eyebrow">{entry.sectionName}</p><Period entry={entry} />
      <h1 ref={headingRef} tabIndex={-1}>{entry.title}</h1>
      <div className="weekly-story-track"><SelectionArtwork track={entry.track} /><div><p>{entry.track.composer}</p><h2>{formatTrackTitle(entry.track)}{entry.track.alias && <span className="track-alias"> [{entry.track.alias}]</span>}</h2></div></div>
    </header>
    <section className="weekly-story-part"><h2>내가 고른 이유</h2>{entry.editorName?.trim() && <small className="weekly-editor">{entry.editorName}</small>}<p>{entry.reason}</p></section>
    <section className="weekly-story-part"><h2>들어볼 순간</h2>{entry.listeningMoment?.trim() && <p>{entry.listeningMoment}</p>}
      {preview ? <>
        <p className="weekly-preview-source">{custom ? '선정자가 고른 구간' : '기존 곡 미리듣기'}{Number.isFinite(preview.startSeconds) && Number.isFinite(preview.endSeconds) && ` · ${formatPreviewTime(preview.startSeconds)}–${formatPreviewTime(preview.endSeconds)}`}<br />{preview.sourceLabel}</p>
        {showPreview ? <div className="weekly-video"><PreviewPlayer track={entry.track} preview={preview} /></div> : <button className="weekly-preview-button" type="button" onClick={() => setShowPreview(true)}>미리듣기 열기</button>}
      </> : <p className="weekly-preview-source">미리듣기를 준비하고 있어요. 곡의 이야기를 먼저 만나보세요.</p>}
    </section>
    <section className="weekly-story-part"><h2>이런 분께 권해요</h2><p>{entry.audience}</p></section>
    <section className="weekly-actions" aria-label="선정곡 보관과 상세">
      <button className={`library-save-button ${isSaved ? 'saved' : ''}`} type="button" aria-pressed={isSaved} onClick={() => onToggleSave(entry.trackId)}>{isSaved ? '보관 해제' : '보관하기'}</button>
      {saveFeedback && <p className="library-save-feedback" role="status">{saveFeedback}</p>}
      <button className="weekly-detail-button" type="button" onClick={() => { setShowPreview(false); onOpenTrack(entry.track) }}>곡 자세히 보기 →</button>
    </section>
  </main>
}

export function WeeklyArchiveScreen({ entries, onOpen, onBack }) {
  const headingRef = useHeadingFocus()
  return <main className="weekly-screen weekly-archive">
    <button className="weekly-link weekly-back" type="button" onClick={onBack}>← 음악 탐색으로</button>
    <header><p className="weekly-eyebrow">EDITOR’S PICKS</p><h1 ref={headingRef} tabIndex={-1}>지난 선정곡</h1><p>그때의 음악, 그때의 이야기를 다시 읽어보세요.</p></header>
    {entries.length ? <ol className="weekly-archive-list">{entries.map((entry) => <li key={entry.id}>
      <button className="weekly-feature" type="button" onClick={() => onOpen(entry.id)}><SelectionArtwork track={entry.track} /><span className="weekly-copy"><Period entry={entry} /><strong className="weekly-title">{entry.title}</strong><span className="weekly-track"><TrackName track={entry.track} /></span><span className="weekly-teaser">{entry.teaser}</span></span></button>
    </li>)}</ol> : <p className="weekly-empty">아직 지난 선정곡이 없어요. 이번 곡의 이야기를 즐겨주세요.</p>}
  </main>
}
