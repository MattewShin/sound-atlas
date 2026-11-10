// Browser-only, independent of data-text-lines and the production classifier.
// Character ranges also measure wrapping inside anonymous inline-flex text items.
export function measureRenderedText(element) {
  const view = element.ownerDocument.defaultView, style = view.getComputedStyle(element)
  const centers = [], walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('svg,script,style,input,select,textarea,[aria-hidden="true"]')) continue
    let offset = 0
    for (const character of node.textContent) {
      const start = offset; offset += character.length
      if (!character.trim()) continue
      const range = element.ownerDocument.createRange(); range.setStart(node, start); range.setEnd(node, offset)
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue
        const center = rect.top + rect.height / 2
        if (!centers.some(value => Math.abs(value - center) < parseFloat(style.fontSize) * 0.4)) centers.push(center)
      }
    }
  }
  return { lines: centers.length, fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight, family: style.fontFamily, tracking: parseFloat(style.letterSpacing) }
}
