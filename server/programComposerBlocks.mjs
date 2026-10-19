// Geometry is used only when an actual name/work pair is supported. No page,
// concert, author dictionary or absolute coordinate is encoded in this module.
export const bounds = line => {
  if (!Array.isArray(line.bbox) || line.bbox.length!==4 || !line.bbox.every(p=>p.length===2&&p.every(Number.isFinite))) return null
  const x=line.bbox.map(p=>p[0]),y=line.bbox.map(p=>p[1])
  const b={left:Math.min(...x),right:Math.max(...x),top:Math.min(...y),bottom:Math.max(...y)}
  return b.right>b.left&&b.bottom>b.top ? b : null
}
const overlap = (a,b) => (Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))/Math.min(a.bottom-a.top,b.bottom-b.top)
export const sameWorkRow = (first, second) => {
  const a=bounds(first),b=bounds(second)
  return Boolean(a&&b&&overlap(a,b)>=.5&&b.left>=a.right-Math.min(a.bottom-a.top,b.bottom-b.top)*.25&&b.left-a.right<=Math.max(a.bottom-a.top,b.bottom-b.top)*2)
}
const ordered = lines => [...new Set(lines)].sort((a,b)=>a.line_index-b.line_index)
export const performerLine = s => /^(?:피아노|바이올린|비올라|첼로|플루트|성악|해설|지휘)\s*(?::|：|\s+(?!(?:소나타|협주곡|모음곡|변주곡|를\s*위한|을\s*위한))[가-힣])|^(?:piano|violin|viola|cello|flute|soprano|alto|tenor|bass|conductor)\s*(?::|：)|^(?:soprano|alto|tenor|bass)\s+[가-힣]/i.test(s)
export const intervalLine = s => /^(?:intermission|인터미션|휴식)\s*$/i.test(s)
const scopeLabel = s => /^(?:[IVXIl]+(?:[.)]|\s)|aria\b|아리아(?:\s|$)|제?\s*\d+\s*악장)/i.test(s)
const catalogue = s => /\b(?:op|bwv|kv|k|d|s)[.:]?\s*\d/i.test(s)
const genericWork = s => catalogue(s)||/suite|variations?|nocturne|intermezzo|dances?|romance|waltz|medley|모음곡|변주곡|무곡|녹턴|녹런|메들리|로망스|편곡/i.test(s)
const initialName = s => /^(?:[A-Z][.]?\s+)+(?:[A-Z][\p{L}-]+)(?:\s+[A-Z][\p{L}-]+)*\s*(?:\([^)]*\))?$/u.test(s)
// Admit a damaged name as a boundary, never as an identified composer.
const damagedName = s => /^(?:[A-Z][.]?\s+){1,3}[\p{L}\d?'’.-]{2,40}$/u.test(s)
const koreanName = s => /^[가-힣]{2,8}(?:\s+[가-힣]{2,12}){0,3}$/.test(s)
const language = s => /[가-힣]/.test(s)?'ko':/[A-Za-z]/.test(s)?'latin':'other'

export const composerWorkGeometry = (lines, {normalize, knownComposers, isComposerHeading, typeIn, isHeader, isStop, tempo}) => {
  const usable=lines.filter(l=>bounds(l))
  const rows=[]
  for(const line of [...usable].sort((a,b)=>bounds(a).top-bounds(b).top||a.line_index-b.line_index)) {
    const b=bounds(line)
    const row=rows.at(-1)
    if(row&&overlap(row.band,b)>=.5) {
      row.lines.push(line)
      // Common intersection prevents overlapping OCR boxes chaining unrelated rows.
      row.band={...row.band,top:Math.max(row.band.top,b.top),bottom:Math.min(row.band.bottom,b.bottom)}
    } else rows.push({lines:[line],band:b})
  }
  const text=l=>normalize(l.text).trim()
  const excluded=s=>isHeader(s)||isStop(s)||performerLine(s)||intervalLine(s)||/^[\p{N}\p{P}\p{S}\s]+$/u.test(s)
  const person=l=>{const s=text(l);return !excluded(s)&&!typeIn(s)&&!genericWork(s)&&!scopeLabel(s)&&!tempo.test(s)
    && (knownComposers(s).length||initialName(s)||damagedName(s)||koreanName(s)||isComposerHeading(s))}
  const strong=l=>knownComposers(text(l)).length||initialName(text(l))
  const named=l=>knownComposers(text(l))[0]||(initialName(text(l))?text(l).split('(')[0].trim():null)
  for(const row of rows) {
    const spatial=[...row.lines].sort((a,b)=>bounds(a).left-bounds(b).left)
    row.pairs=[]
    for(let i=0;i<spatial.length-1;i++) {
      const name=spatial[i]
      if(!person(name))continue
      const right=spatial.slice(i+1).filter(l=>bounds(l).left>=bounds(name).right&&!excluded(text(l)))
      const work=right[0]
      if(!work||person(work)&&!genericWork(text(work))&&!typeIn(text(work)))continue
      if(!typeIn(text(work))&&!genericWork(text(work))&&!strong(name))continue
      if(!/[\p{L}]/u.test(text(work)))continue
      const nextPerson=right.findIndex((l,j)=>j>0&&person(l)&&strong(l))
      const possible=nextPerson<0?right:right.slice(0,nextPerson)
      const workLines=[work]
      // Separate performer/other table columns from adjacent title fragments.
      // A physical row alone does not establish that all its cells form a work.
      for(const fragment of possible.slice(1)) {
        const contained=workLines.some(line=>{
          const a=bounds(line),b=bounds(fragment)
          return overlap(a,b)>=.5&&b.left>=a.left&&b.right<=a.right
        })
        if(!contained&&!sameWorkRow(workLines.at(-1),fragment))break
        workLines.push(fragment)
      }
      row.pairs.push({name,work,workLines})
    }
  }
  const events=new Map(),claimed=new Set()
  let chunk=[],chunkNumber=0
  const flush=()=>{
    if(!chunk.some(r=>r.pairs.length)){chunk=[];return}
    const pairs=chunk.flatMap(r=>r.pairs)
    const nameLines=ordered([...pairs.map(p=>p.name),...chunk.flatMap(r=>r.anchors||[])])
    const resolved=[...new Set(nameLines.map(named).filter(Boolean))]
    const group=`bbox:${chunkNumber++}:${Math.min(...nameLines.map(l=>l.start))}`
    let current=null
    for(const row of chunk) {
      if(row.pairs.length) {
        for(const pair of row.pairs) {
          const own=named(pair.name)
          // Adjacent bilingual rows can supply an explicit name; conflicting
          // names never select a guessed author for an unidentified row.
          const a=bounds(pair.name)
          const bilingual=nameLines.some(l=>{
            const b=bounds(l)
            // An unidentified NEW name cannot borrow a preceding composer's
            // translation. Require an explicit following name in nearby rows.
            return named(l)&&language(text(l))!==language(text(pair.name))&&b.top>=a.top
              &&b.top-a.top<=Math.max(a.bottom-a.top,b.bottom-b.top)*3
          })
          const name=own||(bilingual&&resolved.length===1?resolved[0]:null)
          const sources=ordered(nameLines.filter(l=>l===pair.name||(name&&named(l)===name)))
          const association=own?'BBOX_PAIRED_ROW':name?'BBOX_BILINGUAL_BLOCK':'BBOX_UNRESOLVED_NAME'
          const workLines=ordered(pair.workLines)
          const titleLines=workLines.filter(l=>!scopeLabel(text(l))||l===pair.work)
          // Keep overlapping duplicate detections as evidence, not repeated title text.
          const main=titleLines.filter(l=>!titleLines.some(other=>other!==l&&bounds(other).left<=bounds(l).left&&bounds(other).right>=bounds(l).right&&bounds(other).right-bounds(other).left>bounds(l).right-bounds(l).left))
          const relation={name,status:name?'SOURCE_IDENTIFIED':'UNRESOLVED',association,block_key:`${group}:${name||pair.name.start}`,source_line_indices:sources.map(l=>l.line_index)}
          const entry={composer:name,composer_line:sources.find(l=>named(l)===name)||pair.name,composer_lines:sources,
            workLine:pair.work,work_title:main.map(l=>l.text).join(' '),lines:ordered([...sources,...workLines]),col:`${group}:${bounds(pair.name).left}`,
            composer_relation:relation,work_block_key:`${group}:work:${pair.work.start}`,layout_block_key:group,
            scope_lines:workLines.filter(l=>scopeLabel(text(l))),title_lines:titleLines}
          const trigger=Math.min(...row.lines.map(l=>l.line_index))
          if(!events.has(trigger))events.set(trigger,[])
          events.get(trigger).push(entry)
          for(const line of [pair.name,...workLines])claimed.add(line.line_index)
          // Other non-work cells in this table row cannot inherit its composer.
          row.lines.filter(l=>!row.pairs.some(p=>p.name===l||p.workLines.includes(l))).forEach(l=>claimed.add(l.line_index))
          current=entry
        }
      } else if(current) {
        const content=row.lines.filter(l=>!excluded(text(l)))
        // Only a genuine scope row may extend a paired work; never another title
        // merely containing a key, catalogue number or arrangement instruction.
        if(content.length&&content.every(l=>scopeLabel(text(l))||tempo.test(text(l)))) {
          current.lines=ordered([...current.lines,...content]);current.scope_lines.push(...content)
          content.forEach(l=>claimed.add(l.line_index))
        }
      }
    }
    chunk=[]
  }
  let lastBottom=null,lastHeight=null
  for(const row of rows) {
    const top=Math.min(...row.lines.map(l=>bounds(l).top)),bottom=Math.max(...row.lines.map(l=>bounds(l).bottom))
    const height=Math.max(...row.lines.map(l=>bounds(l).bottom-bounds(l).top))
    const barrier=row.lines.some(l=>excluded(text(l)))
    if(barrier) {
      // A translated composer can wrap below the title and share a row with a
      // performer cell. Accept only an explicit name in the established name
      // gutter, immediately adjacent to that work block; never performer text.
      const names=chunk.flatMap(r=>r.pairs.map(p=>p.name))
      const anchors=lastBottom!==null&&top-lastBottom<=Math.max(height,lastHeight)*2
        ? row.lines.filter(l=>person(l)&&strong(l)&&names.some(n=>{
          const a=bounds(n),b=bounds(l)
          return Math.abs(a.left-b.left)<=Math.max(height,lastHeight)
        })) : []
      if(anchors.length)chunk.push({lines:anchors,pairs:[],anchors})
      flush()
    } else if(lastBottom!==null&&top-lastBottom>Math.max(height,lastHeight)*2)flush()
    if(!barrier)chunk.push(row)
    lastBottom=bottom;lastHeight=height
  }
  flush()
  return {events,claimed}
}
