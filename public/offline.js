// External script respects the service's script-src 'self' CSP while offline.
const leading = () => document.querySelectorAll('h1,p,button').forEach(el => {
  el.style.lineHeight = 'normal'
  const range = document.createRange(); range.selectNodeContents(el)
  const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top)))
  el.style.lineHeight = lines.size > 1 ? '1.5' : 'normal'
})
document.fonts.ready.then(leading)
window.addEventListener('resize', leading)
document.getElementById('retry').addEventListener('click', () => location.reload())
