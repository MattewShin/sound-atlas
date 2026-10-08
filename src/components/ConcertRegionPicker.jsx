import React, { useEffect, useRef, useState } from 'react'
import { concertRegions } from '../data/concertRegions.js'

export default function ConcertRegionPicker({ region, onSelectRegion }) {
  const [isOpen, setIsOpen] = useState(false)
  const dialogRef = useRef(null)
  const selectedRegionRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!isOpen) {
      if (dialog.open) dialog.close()
      return undefined
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.open) dialog.showModal()
    selectedRegionRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [isOpen])

  return <>
    <button className="location-button concert-location-control" type="button" aria-label={`공연 지역 선택, 현재 ${region}`} aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen(true)}>
      {region}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    <dialog className="concert-region-dialog" ref={dialogRef} aria-labelledby="concert-region-title" onCancel={() => setIsOpen(false)} onClose={() => setIsOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setIsOpen(false) }}>
      <section className="region-picker-panel">
        <div className="region-picker-header">
          <div><p className="region-picker-eyebrow">CONCERT REGION</p><h2 id="concert-region-title">공연 지역 선택</h2></div>
          <button className="region-picker-close" type="button" aria-label="지역 선택 닫기" onClick={() => setIsOpen(false)}>×</button>
        </div>
        <p className="region-picker-description">공연을 만나고 싶은 지역을 골라주세요.</p>
        <div className="keyword-choice-list region-choice-list" role="group" aria-label="공연 지역">
          {concertRegions.map((option) => <button ref={option === region ? selectedRegionRef : null} key={option} type="button" className={option === region ? 'selected' : ''} aria-pressed={option === region} onClick={() => { onSelectRegion(option); setIsOpen(false) }}>{option}</button>)}
        </div>
      </section>
    </dialog>
  </>
}
