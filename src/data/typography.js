const selector = 'div,section,article,header,footer,nav,main,h1,h2,h3,h4,h5,h6,p,a,button,label,span,strong,b,i,em,small,li,dt,dd,summary,time,figcaption,th,td,input,select,textarea'

// Include inline descendants: a paragraph split across <strong>/<span> still
// has multiple rendered lines. Each child is also classified independently.
export function renderedTextLines(element) {
  const doc = element.ownerDocument, view = doc.defaultView
  if (!element.getClientRects().length) return 0
  if (element.matches('input,select')) return 1
  const walker = doc.createTreeWalker(element, view.NodeFilter.SHOW_TEXT)
  const centers = []
  const tolerance = parseFloat(view.getComputedStyle(element).fontSize) * 0.55
  let node
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style,textarea,select,[aria-hidden="true"]')) continue
    const range = doc.createRange(); range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue
      const center = rect.top + rect.height / 2
      if (!centers.some(old => Math.abs(old - center) < tolerance)) centers.push(center)
    }
  }
  return centers.length
}

export function installTypography(doc = document) {
  const view = doc.defaultView
  let frame = 0, stopped = false
  const mirror = doc.createElement('div')
  mirror.dataset.typographyMirror = ''; mirror.setAttribute('aria-hidden', 'true')
  mirror.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;padding:0;border:0;'
  doc.body.append(mirror)
  const run = () => {
    frame = 0
    if (stopped) return
    for (const el of doc.querySelectorAll(selector)) {
      if (el.closest('[data-typography-mirror],svg')) continue
      let count
      if (el.matches('textarea') && el.getClientRects().length) {
        const css = view.getComputedStyle(el)
        Object.assign(mirror.style, { fontFamily: css.fontFamily, fontSize: css.fontSize, fontWeight: css.fontWeight, letterSpacing: '-0.03em', lineHeight: 'normal', width: `${el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)}px` })
        mirror.textContent = 'M'; const one = mirror.getBoundingClientRect().height
        mirror.textContent = (el.value || '') + '\u200b'
        count = Math.max(1, Math.round(mirror.getBoundingClientRect().height / one))
        mirror.textContent = ''
      } else count = renderedTextLines(el)
      const value = count > 1 ? 'multiple' : 'single'
      if (count && el.dataset.textLines !== value) el.dataset.textLines = value
    }
  }
  const schedule = () => { if (!stopped && !frame) frame = view.requestAnimationFrame(run) }
  const mutations = new view.MutationObserver(records => {
    if (records.some(r => !(r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('[data-typography-mirror]'))) schedule()
  })
  mutations.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class','style','hidden','open'] })
  const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null
  resize?.observe(doc.body)
  view.addEventListener('resize', schedule); doc.addEventListener('input', schedule, true); doc.addEventListener('toggle', schedule, true)
  doc.fonts?.ready.then(schedule); schedule()
  return () => { stopped = true; if (frame) view.cancelAnimationFrame(frame); mutations.disconnect(); resize?.disconnect(); mirror.remove(); view.removeEventListener('resize', schedule); doc.removeEventListener('input', schedule, true); doc.removeEventListener('toggle', schedule, true) }
}
