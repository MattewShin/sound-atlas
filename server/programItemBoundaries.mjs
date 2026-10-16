// Numbered titles are list evidence, not proof of a parent work or movement relationship.
const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
const prefix = /^\s*(VIII|VII|III|VI|IV|IX|II|X|V|I|\d{1,2})[.)]\s*(.*?)\s*$/
const numberIn = (text) => {
  const match = text.match(prefix) || text.match(/^\s*(VIII|VII|III|VI|IV|IX|II|X|V|I)\s*$/)
  return match ? { raw: match[1], notation: roman[match[1]] ? 'ROMAN' : 'ARABIC',
    value: roman[match[1]] || Number(match[1]), title: match[2] || '' } : null
}
export const numberedTitle = (text) => {
  const value = numberIn(text)
  // A date such as 08.02 is not a numbered title. Require textual title evidence.
  return value?.title && /\p{L}/u.test(value.title) ? value : null
}
const numberLabel = (text) => { const value=numberIn(text); return value && !value.title ? value : null }
const bounds = (line) => {
  if (!Array.isArray(line.bbox) || line.bbox.length !== 4 || !line.bbox.every(p => p.length === 2 && p.every(Number.isFinite))) return null
  return { left: Math.min(...line.bbox.map(p => p[0])), right: Math.max(...line.bbox.map(p => p[0])),
    top: Math.min(...line.bbox.map(p => p[1])), bottom: Math.max(...line.bbox.map(p => p[1])) }
}
const sameRowGap = (label, title) => {
  const a = bounds(label), b = bounds(title)
  if (!a || !b) return null
  const height = Math.min(a.bottom-a.top, b.bottom-b.top)
  const overlap = Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
  const gap = b.left-a.right
  return height > 0 && overlap >= height*.5 && gap >= -height*.25 && gap <= height*4 ? Math.max(0,gap) : null
}
export const nearbyNumberLabel = (line, source, columnFor) => source.some(label =>
  Math.abs(label.line_index-line.line_index)===1 && numberLabel(label.text) && columnFor(label)===columnFor(line)
    && ((!bounds(label) || !bounds(line)) || sameRowGap(label,line)!==null))

export const splitUnparentedItems = (entry, source, { columnFor, explicitParent }) => {
  const firstNumber = numberedTitle(entry.workLine.text)
  if (firstNumber?.notation==='ARABIC' && explicitParent(firstNumber.title)) return [{...entry,
    boundary:{ title:firstNumber.title, parent_title:null, item_relation:'PROGRAM_ORDER', preserve_movements:true,
      number_line:entry.workLine, extracted_numbers:[{raw:firstNumber.raw,notation:'ARABIC',value:firstNumber.value,
        role:'PROGRAM_ORDER',association:'INLINE',line_index:entry.workLine.line_index}],
      reasons:['PROGRAM_ORDER_NOT_MOVEMENT'] }}]
  const composerLines = entry.lines.filter(l => l !== entry.workLine && l.line_index < entry.workLine.line_index)
  const lower = composerLines.length ? Math.max(...composerLines.map(l=>l.line_index)) : entry.workLine.line_index-2
  // Adjacent detached numbers can occur on either side of a title in OCR reading order.
  // Association still requires same-row geometry or an unambiguous preceding text position.
  const adjacent = source.filter(l=>Math.abs(l.line_index-entry.workLine.line_index)===1 && l.line_index>lower && numberLabel(l.text))
  const labels = [...entry.lines, ...adjacent]
    .filter((l,i,a)=>a.indexOf(l)===i && numberIn(l.text) && !numberedTitle(l.text) && columnFor(l)===entry.col)
  const firstHasLabel = labels.some(label=>sameRowGap(label,entry.workLine)!==null
    || (label.line_index+1===entry.workLine.line_index && !bounds(label) && !bounds(entry.workLine)))
  if (!firstNumber && !firstHasLabel && explicitParent(entry.workLine.text)) return [entry]
  const rows = entry.lines.filter(l => l === entry.workLine || numberedTitle(l.text))
  if (!labels.length && !rows.some(l=>numberedTitle(l.text))) return [entry]

  const assigned = new Set()
  const groupKey = `${entry.section_index}:${entry.col}:${entry.workLine.start}`
  return rows.map(line => {
    const inline = numberedTitle(line.text)
    let numberLine = inline ? line : null
    let association = inline ? 'INLINE' : null
    let ambiguous = false
    if (!inline) {
      const spatial = labels.filter(l=>!assigned.has(l)).map(l=>({line:l,gap:sameRowGap(l,line)}))
        .filter(item=>item.gap !== null).sort((a,b)=>a.gap-b.gap)
      if (spatial.length && (spatial.length === 1 || spatial[0].gap < spatial[1].gap)) {
        numberLine=spatial[0].line; association='BBOX_SAME_ROW'
      } else if (spatial.length) ambiguous=true
      else {
        // Without coordinates, a number immediately BEFORE a title is usable in reading order.
        // A following number may belong to the next title, so it is never silently attached backwards.
        const adjacent=labels.filter(l=>!assigned.has(l) && l.line_index+1===line.line_index && !bounds(l) && !bounds(line))
        if (adjacent.length===1) { numberLine=adjacent[0]; association='ADJACENT_BEFORE_TITLE' }
      }
    }
    if (numberLine) assigned.add(numberLine)
    const number = numberLine ? numberIn(numberLine.text) : null
    const context = composerLines.filter(l => l===entry.composer_line || !numberIn(l.text))
    const evidenceLines = [...new Set([...context, ...(numberLine ? [numberLine] : []), line])].sort((a,b)=>a.line_index-b.line_index)
    const unresolvedLabels = !numberLine ? labels.filter(l=>!assigned.has(l)) : []
    return { ...entry, lines: [...new Set([...evidenceLines,...unresolvedLabels])].sort((a,b)=>a.line_index-b.line_index), workLine: line,
      boundary: { title: inline?.title || line.text, parent_title: null, item_relation: 'UNCERTAIN', group_key: groupKey,
        number_line: numberLine, extracted_numbers: number ? [{ raw:number.raw, notation:number.notation, value:number.value,
          role:'UNRESOLVED', association, line_index:numberLine.line_index }] : [],
        unassigned_numbers: unresolvedLabels.map(l=>({raw:numberIn(l.text).raw,line_index:l.line_index,role:'UNASSIGNED'})),
        reasons: ['PARENT_WORK_TITLE_UNCONFIRMED','UNCERTAIN_NUMBERED_ITEM_RELATION',
          ...(!numberLine || ambiguous ? ['NUMBER_TITLE_ASSOCIATION_UNCERTAIN'] : [])] } }
  })
}
