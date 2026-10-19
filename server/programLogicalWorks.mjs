import { bounds, performerLine, intervalLine } from './programComposerBlocks.mjs'

const unique = values => [...new Set(values)]
const language = text => /[가-힣]/u.test(text) ? 'ko' : /[a-z]/i.test(text) ? 'latin' : 'other'
const roman = {I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10}
const catKey = c => `${c.system}:${c.number}:${c.suffix || ''}:${c.part || ''}`
const sameSet = (a,b) => a.length===b.length && a.every(x=>b.includes(x))
const conflict = (a,b) => a.length && b.length && !sameSet(unique(a),unique(b))
const family = member => member.identity.type || [
  ['variations',/변주곡|\bvariations?\b/i], ['suite',/모음곡|\bsuite\b/i],
  ['intermezzo',/인터메조|\bintermezzo\b/i], ['dances',/무곡|\bdances?\b/i],
  ['nocturne',/녹턴|녹런|\bnocturne\b/i], ['medley',/메들리|\bmedley\b/i],
  ['romance-waltz',/로망스|왈츠|활츠|\bromance\b|\bwaltz\b/i],
].find(([,re])=>re.test(member.identity.title))?.[0] || null

// These are source labels and role assignments, not OCR corrections or new
// catalogue facts. In particular, Ill is never silently converted into III.
export const sourceComponents = member => member.evidence.filter(e=>e.role!=='COMPOSER').flatMap(e=>{
  const result=[], add=(role,raw,number=null,title=null)=>result.push({role,raw,number,title,line_index:e.line_index,source_text:e.quote})
  for(const m of e.quote.matchAll(/제?\s*(\d+)\s*집|\b(?:book|volume|vol\.|livre)\s*(\d+|[IVX]+)\b/gi)) {
    add('COLLECTION',m[0],Number(m[1]||m[2])||roman[m[2]?.toUpperCase()]||null)
  }
  for(const m of e.quote.matchAll(/(?:^|[-–—]\s*)(VIII|VII|VI|IV|III|II|IX|V|I)[.)]?\s+(?=\p{L})/gu)) {
    if(m.index===0&&member.identity.composer_relation?.association==='INLINE')continue
    add('SUBPIECE_OR_MOVEMENT',m[0].trim(),roman[m[1]],e.quote.slice(m.index+m[0].length).trim())
  }
  for(const m of e.quote.matchAll(/(?:^|[-–—]\s*)([Il]{2,})[.)]?\s+(?=\p{L})/gu)) {
    if(!roman[m[1]])add('SUBPIECE_LABEL_UNCERTAIN',m[0].trim(),null,e.quote.slice(m.index+m[0].length).trim())
  }
  if(member.identity.reasons.includes('UNCERTAIN_MOVEMENT_RANGE'))add('MOVEMENT_RANGE_UNCERTAIN',e.quote)
  else for(const m of e.quote.matchAll(/제?\s*(\d+)\s*악장|\bmovement\s+(\d+)/gi)) add('MOVEMENT',m[0],Number(m[1]||m[2]))
  for(const m of e.quote.matchAll(/\b([IVX]+|[Il]{2,})\s*[,;]?\s*(?=(?:Op|BWV|K|D|S)[.:]?\s*\d)/g)) add('ROMAN_BEFORE_CATALOGUE_UNRESOLVED',m[1])
  if(/^(?:Aria|아리아)\s*$/i.test(e.quote))add('EXCERPT',e.quote,null,e.quote)
  return result
})

const arrangement = member => {
  const text=member.evidence.filter(e=>e.role!=='COMPOSER').map(e=>e.quote).join('\n')
  const features=[]
  const hands=text.match(/\b([246])\s*[- ]\s*hands\b/i)
  if(hands)features.push(`hands:${hands[1]}`)
  if(/four\s+hands|네\s*손/i.test(text))features.push('hands:4')
  if(/six\s+hands|여섯\s*손/i.test(text))features.push('hands:6')
  const pianos=text.match(/\b([12])\s*pianos?\b/i)
  if(pianos)features.push(`pianos:${pianos[1]}`)
  if(/two\s+pianos|두\s*대/i.test(text))features.push('pianos:2')
  if(/solo|독주/i.test(text))features.push('ensemble:solo')
  if(/orchestra|관현악|오케스트라/i.test(text))features.push('ensemble:orchestra')
  if(/quartet|사중주/i.test(text))features.push('ensemble:quartet')
  if(/trio|삼중주/i.test(text))features.push('ensemble:trio')
  if(/duet|이중주/i.test(text))features.push('ensemble:duet')
  for(const [name,re] of [['piano',/피아노|\bpianos?\b/i],['violin',/바이올린|\bviolins?\b/i],
    ['cello',/첼로|\bcellos?\b/i],['flute',/플루트|\bflutes?\b/i]])if(re.test(text))features.push(`instrument:${name}`)
  if(/jazz|재즈/i.test(text))features.push('style:jazz')
  if(/transcription|트랜스크립션/i.test(text))features.push('method:transcription')
  const arranger=text.match(/\barr(?:anged)?\.?\s+by\s+([^\n;()]+)/i)
  if(arranger)features.push(`arranger:${arranger[1].trim().toLowerCase()}`)
  return {features:unique(features),arranged:/편곡|\barr\.|arranged|arrangement|transcription/i.test(text),
    original:/\boriginal(?:\s+version)?\b|원곡|원전/i.test(text),
    source_lines:member.evidence.filter(e=>e.role!=='COMPOSER'&&/편곡|\barr\.|arranged|arrangement|transcription|hands|네\s*손|두\s*대/i.test(e.quote)).map(e=>e.line_index)}
}

const sourceText = m => m.evidence.filter(e=>e.role!=='COMPOSER').map(e=>e.quote).join('\n')
const partialList = m => /\bNos?\.\s*[&,]/i.test(sourceText(m))
const explicitListNumbers = m => unique([...m.identity.work_numbers,
  ...(partialList(m)?[...sourceText(m).matchAll(/[&,]\s*(\d+)/g)].map(x=>Number(x[1])):[])])
const scopeNumbers = m => unique(m.components.filter(c=>['MOVEMENT','SUBPIECE_OR_MOVEMENT'].includes(c.role)).map(c=>c.number))

const contradictions = (a,b,{parentDetail=false}={}) => {
  const x=a.identity,y=b.identity,ca=x.catalogues.map(catKey),cb=y.catalogues.map(catKey)
  if([x,y].some(i=>i.reasons.includes('UNCERTAIN_MOVEMENT_RANGE')))return 'SCOPE_RANGE_UNCERTAIN'
  if([a,b].some(m=>/\b(?:no|nr|op|bwv|kv|k|d|s)[.:]?\s*[IlO](?=\d|\s|[.,;]|$)/i.test(sourceText(m))))return 'IDENTITY_NUMBER_UNCERTAIN'
  if(ca.length&&cb.length&&!sameSet(unique(ca),unique(cb)))return 'CATALOGUE_CONFLICT'
  const an=explicitListNumbers(a),bn=explicitListNumbers(b)
  if(conflict(an,bn)&&!(partialList(a)&&an.every(n=>bn.includes(n))||partialList(b)&&bn.every(n=>an.includes(n))))return 'WORK_NUMBER_CONFLICT'
  if(conflict(x.opus_following_numbers,y.opus_following_numbers))return 'OPUS_PART_CONFLICT'
  if(conflict(x.keys,y.keys))return 'KEY_CONFLICT'
  if(conflict(scopeNumbers(a),scopeNumbers(b))||conflict(x.movement_numbers,y.movement_numbers))return 'SCOPE_CONFLICT'
  const ac=a.components.filter(c=>c.role==='COLLECTION').map(c=>c.number),bc=b.components.filter(c=>c.role==='COLLECTION').map(c=>c.number)
  if(conflict(ac,bc))return 'COLLECTION_CONFLICT'
  const aa=a.arrangement,ba=b.arrangement
  if(aa.original&&ba.arranged||ba.original&&aa.arranged)return 'ARRANGEMENT_CONFLICT'
  for(const category of ['hands','pianos','ensemble','instrument','style','method','arranger']) {
    if(conflict(aa.features.filter(f=>f.startsWith(category+':')),ba.features.filter(f=>f.startsWith(category+':'))))return 'ARRANGEMENT_CONFLICT'
  }
  if(!parentDetail&&family(a)&&family(b)&&family(a)!==family(b))return 'WORK_FAMILY_CONFLICT'
  return null
}

const barrier = text => performerLine(text)||intervalLine(text)
  ||/^\s*(?:program(?:me)?|프로그램|program\s+notes?|profile|artists?|ticket|출연진|관람\s*안내)\s*[:：.]?\s*$/i.test(text)
  ||/^\s*(?:20\d{2}[.\-/년]|\d{1,2}[.\-/월]\s*\d{1,2}|session\s*\d|\d+\s*(?:회차|부)(?=\s|$)|오전|오후)/i.test(text)
const locality = (a,b,lines) => {
  if(a.entry.section_index!==b.entry.section_index||!a.entry.composer||a.entry.composer!==b.entry.composer)return false
  const x=a.entry.layout_block_key,y=b.entry.layout_block_key
  if(x&&y&&x!==y)return false
  if(a.entry.composer_relation?.block_key!==b.entry.composer_relation?.block_key)return false
  const lo=Math.min(a.entry.workLine.line_index,b.entry.workLine.line_index),hi=Math.max(a.entry.workLine.line_index,b.entry.workLine.line_index)
  if(lines.some(l=>l.line_index>lo&&l.line_index<hi&&barrier(l.text)))return false
  const ab=bounds(a.entry.workLine),bb=bounds(b.entry.workLine)
  if(ab&&bb){
    const height=Math.max(ab.bottom-ab.top,bb.bottom-bb.top)
    return Math.abs(ab.left-bb.left)<=height*2 && Math.max(0,Math.max(ab.top,bb.top)-Math.min(ab.bottom,bb.bottom))<=height*3
  }
  return !ab&&!bb&&hi-lo===1
}
const isChild = m => /^(?:VIII|VII|VI|IV|III|II|IX|V|I)[.)]?\s+|^(?:Aria|아리아)\s*$/i.test(m.entry.workLine.text)
const isParent = m => /suite|sonata|concerto|variations?|symphony|모음곡|소나타|협주곡|변주곡|교향곡/i.test(m.identity.title)

const combineReason = (a,b,lines,blockCounts) => {
  const parentDetail=isParent(a)&&isChild(b)&&!b.identity.catalogues.length
    &&(!scopeNumbers(a).length||sameSet(scopeNumbers(a),scopeNumbers(b)))
  if(!locality(a,b,lines)||contradictions(a,b,{parentDetail}))return null
  if(parentDetail)return 'PARENT_DETAIL'
  if(a.language===b.language||a.language==='other'||b.language==='other')return null
  if(a.identity.catalogues.some(c=>b.identity.catalogues.some(d=>catKey(c)===catKey(d))))return 'BILINGUAL_CATALOGUE_IDENTITY'
  const sameFamily=family(a)&&family(a)===family(b)
  const nums=text=>[...text.matchAll(/\d+/g)].map(m=>Number(m[0]))
  const sharedRawNumber=nums(sourceText(a)).some(n=>nums(sourceText(b)).includes(n))
  if(sameFamily&&sharedRawNumber)return 'BILINGUAL_FAMILY_AND_SOURCE_NUMBER'
  // A repeated composer/name column in an isolated two-row bilingual item is
  // stronger evidence than mere proximity under an inherited composer heading.
  const paired=m=>/^BBOX_(?:PAIRED_ROW|BILINGUAL_BLOCK)$/.test(m.entry.composer_relation?.association)
  const isolated=a.entry.layout_block_key&&a.entry.layout_block_key===b.entry.layout_block_key&&blockCounts.get(a.entry.layout_block_key)===2
  if(isolated&&paired(a)&&paired(b)){
    const shared=a.arrangement.features.filter(f=>b.arrangement.features.includes(f))
    if(a.arrangement.arranged&&b.arrangement.arranged&&shared.length>=2)return 'BILINGUAL_PAIRED_ARRANGEMENT'
  }
  return null
}

const mergeEvidence = members => {
  const found=new Map()
  for(const member of members)for(const e of member.evidence){
    if(!found.has(e.line_index))found.set(e.line_index,{...e,roles:[e.role]})
    else {const first=found.get(e.line_index);first.roles=unique([...first.roles,e.role])}
  }
  return [...found.values()].sort((a,b)=>a.line_index-b.line_index)
}
const union = (members,field) => unique(members.flatMap(m=>m.identity[field]))
const primaryMember = members => [...members].sort((a,b)=>{
  const score=m=>m.identity.catalogues.length*4+Number(Boolean(m.identity.type))*2+m.identity.work_numbers.length+m.identity.opus_following_numbers.length+m.identity.keys.length-m.identity.reasons.length
  return score(b)-score(a)||Number(b.language==='ko')-Number(a.language==='ko')||a.entry.workLine.start-b.entry.workLine.start
})[0]

export const groupLogicalWorks = (prepared,{lines,hash,source_id=null}) => {
  const members=prepared.map(m=>({...m,language:language(m.identity.title),components:sourceComponents(m),arrangement:arrangement(m)}))
  const blockCounts=new Map()
  for(const m of members)if(m.entry.layout_block_key)blockCounts.set(m.entry.layout_block_key,(blockCounts.get(m.entry.layout_block_key)||0)+1)
  const groups=[]
  for(const member of members){
    const previous=groups.at(-1),last=previous?.members.at(-1)
    const reason=last&&combineReason(last,member,lines,blockCounts)
    const conflicting=previous?.members.map(m=>contradictions(m,member,{parentDetail:reason==='PARENT_DETAIL'&&isParent(m)})).find(Boolean)
    // Check against ALL members: an incomplete bilingual variant cannot bridge
    // contradictory catalogue, movement, key or arrangement identities.
    if(reason&&!conflicting){previous.members.push(member);previous.merge_reasons.push(reason)}
    else {
      const separation=last&&locality(last,member,lines)?conflicting||'INSUFFICIENT_GROUPING_EVIDENCE':null
      if(separation)previous.separations.push({other_work_line_index:member.entry.workLine.line_index,reason:separation})
      groups.push({members:[member],merge_reasons:[],separations:separation?[{other_work_line_index:last.entry.workLine.line_index,reason:separation}]:[]})
    }
  }
  return groups.map(group=>{
    const primary=primaryMember(group.members),evidence=mergeEvidence(group.members)
    const components=[...new Map(group.members.flatMap(m=>m.components).map(c=>[`${c.line_index}:${c.role}:${c.raw}`,c])).values()]
    const catalogues=[...new Map([primary,...group.members].flatMap(m=>m.identity.catalogues).map(c=>[catKey(c),c])).values()]
    const flags=unique([...(group.merge_reasons.some(r=>/PAIRED/.test(r))?['BILINGUAL_LAYOUT_IDENTITY_REQUIRES_REVIEW']:[]),
      ...(group.members.some(partialList)?['INCOMPLETE_NUMBER_VARIANT']:[]),
      ...(group.members.some(m=>!m.identity.catalogues.length)&&catalogues.length?['INCOMPLETE_CATALOGUE_VARIANT']:[]),
      ...(components.some(c=>c.role==='ROMAN_BEFORE_CATALOGUE_UNRESOLVED')?['COLLECTION_LABEL_REQUIRES_REVIEW']:[]),
      ...(components.some(c=>c.role==='SUBPIECE_LABEL_UNCERTAIN')?['SCOPE_LABEL_REQUIRES_REVIEW']:[]),
      ...group.separations.map(s=>`LOGICAL_SEPARATE_${s.reason}`)])
    const parentJoined=group.merge_reasons.includes('PARENT_DETAIL')
    const identity={...primary.identity,catalogues,work_numbers:union(group.members,'work_numbers'),
      opus_following_numbers:union(group.members,'opus_following_numbers'),keys:union(group.members,'keys'),
      movement_numbers:unique([...union(group.members,'movement_numbers'),...(parentJoined?components.filter(c=>['MOVEMENT','SUBPIECE_OR_MOVEMENT'].includes(c.role)).map(c=>c.number):[])]),
      movement_names:union(group.members,'movement_names'),arrangement_or_excerpt:group.members.some(m=>m.identity.arrangement_or_excerpt)||components.some(c=>c.role==='EXCERPT'),
      reasons:unique(group.members.flatMap(m=>m.identity.reasons)).filter(r=>!parentJoined||!['PARENT_WORK_TITLE_UNCONFIRMED','UNCERTAIN_NUMBERED_ITEM_RELATION','NUMBER_TITLE_ASSOCIATION_UNCERTAIN'].includes(r))}
    const id=hash({source_id,composer:primary.entry.composer,section:primary.entry.section_index,work_sources:group.members.map(m=>m.entry.workLine.start)})
    const languageVariants=group.members.map(m=>({language:m.language,title:m.identity.title,original:m.identity.original,
      work_line_index:m.entry.workLine.line_index,identity:m.identity,source_lines:m.evidence,components:m.components,arrangement:m.arrangement}))
    identity.logical_work_id=id
    const title=primary.identity.title.split(/\s+[-–—]\s+(?=[IVX]+[.)]?\s)/)[0]
    const hasParentScope=group.members.some(m=>!isChild(m)&&(isParent(m)||m.identity.catalogues.length))
      &&components.some(c=>['EXCERPT','MOVEMENT','SUBPIECE_OR_MOVEMENT'].includes(c.role))
    identity.work={...primary.identity.work,block_key:id,title,parent_title:hasParentScope?title:null,
      catalogues,work_numbers:identity.work_numbers,opus_following_numbers:identity.opus_following_numbers,keys:identity.keys,movement_numbers:identity.movement_numbers,
      source_line_indices:unique(group.members.flatMap(m=>m.identity.work.source_line_indices)),
      scope_source_lines:unique([...group.members.flatMap(m=>m.identity.work.scope_source_lines),...components.filter(c=>c.role!=='COLLECTION').map(c=>c.line_index)]),
      arrangement_source_lines:unique(group.members.flatMap(m=>m.arrangement.source_lines)),
      collection_numbers:unique(components.filter(c=>c.role==='COLLECTION'&&c.number!==null).map(c=>c.number)),components,language_variants:languageVariants,
      arrangement:{features:unique(group.members.flatMap(m=>m.arrangement.features)),arranged:group.members.some(m=>m.arrangement.arranged),
        source_lines:evidence.filter(e=>group.members.some(m=>m.arrangement.source_lines.includes(e.line_index)))}}
    return {...group,id,primary,identity,evidence,review_flags:flags,
      bilingual_merges:group.merge_reasons.filter(r=>r.startsWith('BILINGUAL')).length,
      parent_child_merges:group.merge_reasons.filter(r=>r==='PARENT_DETAIL').length}
  })
}
