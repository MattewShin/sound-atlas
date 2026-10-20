import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { composerButtonLabel, MAX_COMPOSERS, searchComposers, toggleComposer } from '../data/composerSelection.js'

function ComposerDialog({ composers, selected, onApply, onClose, triggerRef }) {
  const [draft, setDraft] = useState(() => [...selected])
  const [query, setQuery] = useState('')
  const dialogRef = useRef(null)
  const searchRef = useRef(null)
  const results = useMemo(() => searchComposers(composers, query), [composers, query])

  useEffect(() => {
    const trigger = triggerRef.current
    const shell = trigger?.closest('.app-shell')
    const wasInert = shell?.hasAttribute('inert')
    const previousOverflow = document.body.style.overflow
    shell?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    searchRef.current?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = [...dialogRef.current.querySelectorAll('button, input')].filter((element) => !element.disabled)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      if (!wasInert) shell?.removeAttribute('inert')
      document.removeEventListener('keydown', handleKey)
      trigger?.focus({ preventScroll: true })
    }
  }, [onClose, triggerRef])

  return createPortal(<div className="composer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="composer-dialog" role="dialog" aria-modal="true" aria-labelledby="composer-title" aria-describedby="composer-guide">
      <header className="composer-dialog-header">
        <h2 id="composer-title">어떤 작곡가의 음악을 듣고 싶으세요?</h2>
        <button type="button" className="composer-close" aria-label="작곡가 선택 닫기" onClick={onClose}>×</button>
      </header>
      <p id="composer-guide">최대 3명까지 선택할 수 있어요. 선택하지 않으면 모든 작곡가의 곡을 추천해요.</p>
      <label className="composer-search">작곡가 이름 검색<input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="한글·영문 이름으로 검색" /></label>
      <p className="composer-limit" role="status">{draft.length === MAX_COMPOSERS ? '최대 3명까지 선택할 수 있어요.' : ''}</p>
      <div className="composer-options" role="group" aria-label="작곡가 선택 목록">
        {results.length ? results.map((name) => {
          const checked = draft.includes(name)
          return <button key={name} type="button" role="checkbox" aria-checked={checked} className={checked ? 'selected' : ''} disabled={!checked && draft.length >= MAX_COMPOSERS} onClick={() => setDraft((current) => toggleComposer(current, name))}>
            <span>{name}</span><span className="composer-check" aria-hidden="true">{checked ? '✓' : ''}</span>
          </button>
        }) : <p className="composer-no-results" role="status">검색한 작곡가가 없어요.</p>}
      </div>
      <footer className="composer-footer">
        <p aria-live="polite">{draft.length} / 3명 선택</p>
        <div><button type="button" className="composer-reset" onClick={() => setDraft([])}>초기화</button><button type="button" className="composer-apply" onClick={() => { onApply(draft); onClose() }}>적용</button></div>
      </footer>
    </section>
  </div>, document.body)
}

export default function ComposerPicker({ composers, selected, onApply }) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  // 다이얼로그가 열린 동안 선택 동작으로 포커스 효과가 다시 실행되지 않게 합니다.
  const close = React.useCallback(() => setIsOpen(false), [])
  return <div className="composer-picker">
    <button ref={triggerRef} className="composer-trigger" type="button" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen(true)}>{composerButtonLabel(selected)}<span aria-hidden="true">⌄</span></button>
    {selected.length > 0 && <ul className="composer-tags" aria-label="선택한 작곡가">{selected.map((name) => <li key={name}><span>{name}</span><button type="button" aria-label={`${name} 선택 해제`} onClick={() => onApply(selected.filter((item) => item !== name))}>×</button></li>)}</ul>}
    {isOpen && <ComposerDialog composers={composers} selected={selected} onApply={onApply} onClose={close} triggerRef={triggerRef} />}
  </div>
}
