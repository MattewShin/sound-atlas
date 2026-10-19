import { composerPatterns, workTypePatterns, workCatalog, musicalKeysIn, getTrackTarget } from '../src/data/workCatalog.js'

const unique = values => [...new Set(values)]
const plain = value => String(value || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC')
const systems = {op:'OP',bwv:'BWV',kv:'K',k:'K',d:'D',s:'S',woo:'WOO',hob:'HOB',rv:'RV'}
const prefixes = {OP:'Op.',BWV:'BWV',K:'K.',D:'D.',S:'S.',WOO:'WoO',HOB:'Hob.',RV:'RV'}
const genreBoundary = text => Object.values(workTypePatterns).some(re=>re.test(text)) || /^(?:intermezzo|nocturne|suite|variations?)$/i.test(text)
const roman = text => {
  if(!/^(?=.)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(text))return null
  const n={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}
  return [...text].reduce((sum,c,i)=>sum+(n[c]<(n[text[i+1]]||0)?-n[c]:n[c]),0)
}

// A matching copy only. No source text, display identity or offsets are edited.
export const normalizeMatchingText = raw => {
  let text=plain(raw)
  const changes=[]
  const change=(code,re,replacement)=>{const next=text.replace(re,replacement);if(next!==text){changes.push(code);text=next}}
  if(text!==raw)changes.push('UNICODE_MATCHING_COPY')
  change('UNICODE_HYPHEN',/[\u2010-\u2015\u2212]/g,'-')
  change('KEY_CATALOGUE_BOUNDARY',/(major|minor)(?=(?:Op|BWV|KV|K|D|S|WoO|Hob|RV)[.:]?\s*\d)/gi,'$1 ')
  change('ADJACENT_NUMBER_PREFIX',/(\d)(?=(?:No|Nos|Nr)[.:]?\s*\d)/g,'$1 ')
  change('ADJACENT_CATALOGUE_PREFIX',/(\d)(?=(?:Op|BWV|KV|K|D|S|WoO|Hob|RV)[.:]?\s*\d)/g,'$1 ')
  change('GENRE_NUMBER_BOUNDARY',/\b([\p{L}]+)(?=(?:No|Nos|Nr)[.:]?\s*\d)/gu,(all,genre)=>genreBoundary(genre)?`${genre} `:all)
  change('NUMBER_IN_BOUNDARY',/(\d)in(?=\s*[A-G](?:\s*-?\s*(?:flat|sharp|[#♯b♭]))?\s*(?:major|minor)\b)/gi,'$1 in ')
  change('GENRE_IN_KEY_BOUNDARY',/\b([\p{L}]+)in(?=\s*[A-G](?:\s*-?\s*(?:flat|sharp|[#♯b♭]))?\s*(?:major|minor)\b)/giu,
    (all,genre)=>genreBoundary(genre)?`${genre} in `:all)
  change('CATALOGUE_PREFIX',/\b(Op|BWV|KV|K|D|S|WoO|Hob|RV)\s*[.:]?\s*(?=\d)/gi,
    (_,prefix)=>`${prefixes[systems[prefix.toLowerCase()]]} `)
  change('HOB_SECTION_PREFIX',/\bHob\s*[.:]?\s*(?=[IVXLCDMIl]+\s*[:.]\s*\d)/g,'Hob. ')
  change('NUMBER_PREFIX',/\b(Nos?|Nr)\s*[.:]?\s*(?=\d|[IVX])/gi,(_,label)=>/^nos$/i.test(label)?'Nos. ':'No. ')
  change('PUNCTUATION_SPACING',/\s*([,;:])\s*/g,'$1 ')
  change('KEY_SPELLING',/\b([A-G])\s*[-]?\s*(flat|sharp|[#♯b♭])?\s*[-]?\s*(major|minor)\b/gi,
    (_,note,accidental,mode)=>`${note.toUpperCase()}${accidental ? /^(?:flat|b|♭)$/i.test(accidental)?' flat':' sharp':''} ${mode.toLowerCase()}`)
  change('WHITESPACE',/\s+/g,' ')
  return {text:text.trim(),changes:unique(changes)}
}

export const canonicalComposers = value => {
  const text=plain(value)
  return Object.entries(composerPatterns).filter(([name,re])=>text===name||re.test(text)).map(([name])=>name)
}
const typesIn = text => unique([
  ...Object.entries(workTypePatterns).filter(([,re])=>re.test(text)).map(([type])=>type),
  ...[['intermezzo',/인터메조|\bintermezzo\b/i],['nocturne',/녹턴|녹런|\bnocturne\b/i],
    ['variations',/변주곡|\bvariations?\b/i],['suite',/모음곡|\bsuite\b/i],['symphony',/교향곡|\bsymphony\b/i],
    ['dances',/무곡|\bdances?\b/i]].filter(([,re])=>re.test(text)).map(([type])=>type),
])
const tokenSources = (records,index) => {
  const record=records.find(r=>index>=r.matching_start&&index<r.matching_end)||records.at(-1)
  return {source_line_index:record?.source.line_index??null,source_quote:record?.source.quote??'',matching_start:index}
}
const performance = (text,provided={}) => {
  const features=[...(provided.features||[])]
  for(const m of text.matchAll(/\b([246])\s*-?\s*hands\b/gi))features.push(`hands:${m[1]}`)
  if(/four\s+hands|네\s*손/i.test(text))features.push('hands:4')
  if(/six\s+hands|여섯\s*손/i.test(text))features.push('hands:6')
  for(const m of text.matchAll(/\b([12])\s*pianos?\b/gi))features.push(`pianos:${m[1]}`)
  if(/two\s+pianos|두\s*대/i.test(text))features.push('pianos:2')
  for(const [key,re] of [['instrument:piano',/피아노|\bpianos?\b/i],['instrument:violin',/바이올린|\bviolins?\b/i],
    ['instrument:cello',/첼로|\bcellos?\b/i],['instrument:flute',/플루트|\bflutes?\b/i],
    ['ensemble:orchestra',/관현악|오케스트라|\borchestra\b/i],['ensemble:solo',/독주|\bsolo\b/i],
    ['ensemble:quartet',/사중주|\bquartet\b/i],['style:jazz',/재즈|\bjazz\b/i],['method:transcription',/\btranscription\b/i]])if(re.test(text))features.push(key)
  const arranger=text.match(/\barr(?:anged)?\.?\s+by\s+([^\n;()]+)/i)
  if(arranger)features.push(`arranger:${arranger[1].trim().toLowerCase()}`)
  return {...provided,features:unique(features),arranged:Boolean(provided.arranged||/편곡|\barr\.|arranged|arrangement|transcription/i.test(text)),
    original:Boolean(provided.original||/\boriginal\b|원곡|원전/i.test(text))}
}

export const normalizeMatchingVariant = (variant,declaredComposer) => {
  const sourceLines=variant.source_lines?.filter(e=>e.role!=='COMPOSER'||e.roles?.some(r=>r!=='COMPOSER'))
    ||String(variant.original||variant.identity.original).split('\n').map((quote,fragment_index)=>({line_index:null,fragment_index,quote,bbox:null,confidence:null}))
  let offset=0
  const records=sourceLines.map(source=>{
    const n=normalizeMatchingText(source.quote),record={source:{...source},...n,matching_start:offset,matching_end:offset+n.text.length}
    offset+=n.text.length+1;return record
  })
  const text=records.map(r=>r.text).join('\n'),catalogues=[],numbers=[],issues=[]
  const addIssue=(code,token,index)=>issues.push({code,token,...tokenSources(records,index)})
  for(const m of text.matchAll(/\bHob\.\s*([IVXLCDMIl]+)\s*[:.]\s*(\d+)/g)){
    const section=roman(m[1]);if(!section)addIssue('UNCERTAIN_ROMAN_CATALOGUE_SECTION',m[1],m.index)
    catalogues.push({system:'HOB',section:section?m[1]:null,number:Number(m[2]),suffix:'',part:null,matched_text:m[0],...tokenSources(records,m.index)})
  }
  for(const m of text.matchAll(/\b(Op|BWV|K|D|S|WoO|Hob|RV)\.?\s*(\d+)([a-z]?)(?:\s*[-/]\s*(\d+))?(?![\p{L}\p{N}])/giu)){
    catalogues.push({system:systems[m[1].toLowerCase()],section:null,number:Number(m[2]),suffix:m[3].toLowerCase(),part:m[4]?Number(m[4]):null,
      matched_text:m[0],...tokenSources(records,m.index)})
    if(/[IlO]/.test(m[3]))addIssue('UNCERTAIN_CATALOGUE_DIGIT',m[0],m.index)
  }
  const numberRole=index=>{
    const previous=catalogues.filter(c=>c.matching_start<index).at(-1)
    return previous?.system==='OP'?'OPUS_MEMBER_NUMBER':'WORK_NUMBER'
  }
  for(const m of text.matchAll(/\b(No|Nos)\.\s*(\d+|[IVXLCDM]+)((?:\s*(?:[&,]|and)\s*\d+)*)(?![\p{L}\p{N}])/gu)){
    const value=/^\d+$/.test(m[2])?Number(m[2]):m[2]==='I'?null:roman(m[2])
    if(value===null){addIssue('UNCERTAIN_ITEM_NUMBER',m[0],m.index);continue}
    for(const n of [value,...(m[3].match(/\d+/g)||[]).map(Number)])numbers.push({role:numberRole(m.index),number:n,matched_text:m[0],...tokenSources(records,m.index)})
  }
  for(const m of text.matchAll(/(?:제\s*)?(\d+)\s*번/gu))numbers.push({role:numberRole(m.index),number:Number(m[1]),matched_text:m[0],...tokenSources(records,m.index)})
  for(const c of catalogues)if(c.system==='OP'&&c.part!==null)numbers.push({role:'OPUS_MEMBER_NUMBER',number:c.part,matched_text:c.matched_text,source_line_index:c.source_line_index,source_quote:c.source_quote,matching_start:c.matching_start})
  for(const m of text.matchAll(/\bNos?\.\s*\S*/g))if(!numbers.some(n=>n.matching_start===m.index))addIssue('UNRESOLVED_NUMBER_BOUNDARY',m[0],m.index)
  for(const m of text.matchAll(/\bNos?\.\s*\d+\s*[-/~]\s*\d+/g))addIssue('UNCERTAIN_ITEM_RANGE',m[0],m.index)
  for(const m of text.matchAll(/\b(?:No|Nos|Op|BWV|K|D|S|WoO|RV)\.?\s*([IlO][\dIlOVX]*)(?![\p{L}\p{N}])|\b(?:No|Nos)\.\s*[&,]|제\s*[IlO]\d*\s*번/gu)){
    if(m[1]&&m[1]!=='I'&&roman(m[1])!==null&&/^Nos?/.test(m[0]))continue
    addIssue('UNCERTAIN_NUMERIC_TOKEN',m[0],m.index)
  }
  for(const m of text.matchAll(/\b[Il]{2,}\b/g))if(roman(m[0])===null)addIssue('UNCERTAIN_ROMAN_LABEL',m[0],m.index)
  const collections=[],movements=[],excerpts=[]
  for(const m of text.matchAll(/제?\s*(\d+)\s*집|\b(?:book|volume|vol\.|livre)\s*(\d+|[IVXLCDMIl]+)\b/gi)){
    const raw=m[1]||m[2],number=/^\d+$/.test(raw)?Number(raw):roman(raw)
    if(number===null)addIssue('UNCERTAIN_COLLECTION_NUMBER',raw,m.index)
    else collections.push({number,matched_text:m[0],...tokenSources(records,m.index)})
  }
  for(const m of text.matchAll(/제?\s*(\d+)\s*악장|\b(?:movement|mov\.)\s*(\d+)|(?:^|\n|[;:]|\s-\s)\s*([IVXLCDM]+)[.)]?\s+(?=\p{L})/gu)){
    if(m.index===0&&variant.identity.composer_relation?.association==='INLINE'&&m[3])continue
    const number=Number(m[1]||m[2])||roman(m[3]);if(number)movements.push({number,matched_text:m[0].trim(),...tokenSources(records,m.index)})
  }
  for(const component of variant.components||[]){
    if(component.role==='EXCERPT')excerpts.push({label:component.raw,source_line_index:component.line_index})
    if(component.role==='COLLECTION'&&component.number!==null&&!collections.some(c=>c.number===component.number))collections.push({number:component.number,matched_text:component.raw,source_line_index:component.line_index})
  }
  for(const r of records)if(/^(?:Aria|아리아)\s*$/i.test(r.text)&&!excerpts.some(e=>e.source_line_index===r.source.line_index&&e.label===r.source.quote))excerpts.push({label:r.source.quote,source_line_index:r.source.line_index})
  const identities=unique([...(variant.identity.composers||[]),...canonicalComposers(variant.identity.composer_relation?.name||declaredComposer),
    ...(variant.source_lines||[]).filter(e=>e.role==='COMPOSER'||e.roles?.includes('COMPOSER')).flatMap(e=>canonicalComposers(e.quote))])
  return {language:variant.language||null,source_work_line_index:variant.work_line_index??null,composers:identities,
    normalized_text:text,lines:records,catalogues,numbers,keys:musicalKeysIn(text),collections,movements,excerpts,
    title_types:typesIn(text),arrangement:performance(text,variant.arrangement),
    issues,changes:unique(records.flatMap(r=>r.changes))}
}

const catKey=c=>`${c.system}:${c.section||''}:${c.number}:${c.suffix||''}:${c.part||''}`
const byRole=(variants,role)=>unique(variants.flatMap(v=>v.numbers.filter(n=>n.role===role).map(n=>n.number)))
const aliasIn=(text,alias)=>{
  const escaped=normalizeMatchingText(alias).text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,'iu').test(text)
}
const collectionsTypes=new Set(['etude','prelude','elegy','gymnopedie','liebestraum','impromptu','seasons'])
const emptyDecision=(outcome,reasons,work_id=null)=>({track_id:null,work_id,catalog_id:null,relation:'AMBIGUOUS',outcome,reasons,confidence:'UNRESOLVED'})

// All normalized variants constrain one decision. A more legible variant cannot
// overwrite contradictory evidence from another language or source line.
export const matchNormalizedProgramWork = (identity,declaredComposer,{catalog=workCatalog,targetFor=getTrackTarget}={}) => {
  const sourceVariants=identity.work?.language_variants||[{identity,original:identity.original}]
  const variants=sourceVariants.map(v=>normalizeMatchingVariant(v,declaredComposer))
  const composers=unique(variants.flatMap(v=>v.composers)),declared=canonicalComposers(declaredComposer)
  const catalogues=[...new Map(variants.flatMap(v=>v.catalogues).map(c=>[catKey(c),c])).values()]
  const workNumbers=byRole(variants,'WORK_NUMBER'),opusNumbers=byRole(variants,'OPUS_MEMBER_NUMBER'),keys=unique(variants.flatMap(v=>v.keys))
  const movements=unique(variants.flatMap(v=>v.movements.map(m=>m.number))),collections=unique(variants.flatMap(v=>v.collections.map(c=>c.number)))
  const features=unique(variants.flatMap(v=>v.arrangement.features||[])),types=unique(variants.flatMap(v=>v.title_types)),issues=variants.flatMap(v=>v.issues)
  const matching={variants,composer:declared.length===1?declared[0]:null,catalogues,work_numbers:workNumbers,opus_member_numbers:opusNumbers,
    keys,movement_numbers:movements,collection_numbers:collections,arrangement_features:features,issues,rejections:[]}
  const finish=decision=>({decision,matching})
  const flags=[]
  if(!declaredComposer||identity.composer_relation?.status==='UNRESOLVED')flags.push('COMPOSER_MISSING')
  else if(declared.length!==1)flags.push('COMPOSER_OUTSIDE_CATALOG')
  if(composers.length>1||declared.length===1&&composers.some(c=>c!==declared[0]))flags.push('CONFLICTING_COMPOSERS')
  if(identity.item_relation==='UNCERTAIN')flags.push('PARENT_WORK_TITLE_UNCONFIRMED','UNCERTAIN_NUMBERED_ITEM_RELATION')
  if(identity.reasons?.includes('UNCERTAIN_MOVEMENT_RANGE'))flags.push('UNCERTAIN_MOVEMENT_RANGE')
  if(issues.length)flags.push(...unique(issues.map(i=>i.code)))
  if(workNumbers.length>1||opusNumbers.length>1)flags.push('MULTIPLE_ITEM_NUMBERS')
  for(const system of unique(catalogues.map(c=>c.system)))if(unique(catalogues.filter(c=>c.system===system).map(c=>`${c.section||''}:${c.number}:${c.suffix}`)).length>1)flags.push('CONFLICTING_CATALOGUE_NUMBERS')
  for(const [field,code] of [['movements','CONFLICTING_MOVEMENT_SCOPE'],['collections','CONFLICTING_COLLECTION_SCOPE']]){
    const sets=variants.map(v=>unique(v[field].map(s=>s.number))).filter(s=>s.length)
    if(sets.some(a=>sets.some(b=>a.length!==b.length||a.some(n=>!b.includes(n)))))flags.push(code)
  }
  for(const category of ['hands','pianos','ensemble','instrument','style','method','arranger']){
    const sets=variants.map(v=>unique((v.arrangement.features||[]).filter(f=>f.startsWith(category+':')))).filter(s=>s.length)
    if(sets.some(a=>sets.some(b=>a.length!==b.length||a.some(f=>!b.includes(f)))))flags.push('ARRANGEMENT_OR_ENSEMBLE_CONFLICT')
  }
  if(variants.some(v=>v.arrangement.original)&&variants.some(v=>v.arrangement.arranged))flags.push('ARRANGEMENT_OR_ENSEMBLE_CONFLICT')
  if(flags.length)return finish(emptyDecision(flags.length===1&&flags[0]==='COMPOSER_OUTSIDE_CATALOG'?'UNREGISTERED':'AMBIGUOUS',unique(flags)))
  const text=variants.map(v=>v.normalized_text).join('\n'),works=Object.values(catalog).filter(w=>w.composer===declared[0])
  const aliases=works.filter(w=>(w.aliases||[]).some(a=>aliasIn(text,a)))
  const accepted=[]
  for(const w of works){
    const reject=[]
    const expected=[...(w.opus!==null&&w.opus!==undefined?[{system:'OP',number:w.opus,suffix:w.opusSuffix||'',part:w.opusPart||null}]:[]),
      ...(w.catalogue?[{system:String(w.catalogue).toUpperCase().replace('KV','K'),number:w.catalogueNumber,suffix:'',part:null}]:[])]
    const compatible=(c,e)=>c.system===e.system&&c.number===e.number&&(c.suffix||'')===(e.suffix||'')&&(!c.part||c.part===e.part)&&(!c.section||c.section===e.section)
    const catalogueMatch=catalogues.length&&catalogues.every(c=>expected.some(e=>compatible(c,e)))
    if(expected.length&&!catalogueMatch)reject.push(catalogues.length?'CATALOGUE_MISMATCH':'CATALOGUE_REQUIRED')
    if(!expected.length&&catalogues.length)reject.push('UNSUPPORTED_CATALOGUE_IDENTITY')
    const ownAlias=aliases.some(a=>a.id===w.id)
    if(aliases.length&&!ownAlias)reject.push('REGISTERED_ALIAS_CONFLICT')
    if(!types.includes(w.type)&&!ownAlias)reject.push('TITLE_OR_REGISTERED_ALIAS_REQUIRED')
    if(types.some(type=>type!==w.type))reject.push('CONFLICTING_WORK_TYPES')
    if(workNumbers.some(n=>n!==w.number))reject.push('WORK_NUMBER_MISMATCH')
    if(opusNumbers.some(n=>n!==(w.opusPart||w.number)))reject.push('OPUS_MEMBER_MISMATCH')
    if(w.opusPart&&!catalogues.some(c=>c.system==='OP'&&c.part===w.opusPart)&&!opusNumbers.includes(w.opusPart)&&!workNumbers.includes(w.number))reject.push('OPUS_MEMBER_REQUIRED')
    if(collectionsTypes.has(w.type)&&!workNumbers.length&&!opusNumbers.length&&!ownAlias)reject.push('ITEM_NUMBER_REQUIRED')
    if(!expected.length&&!workNumbers.length&&!opusNumbers.length&&!ownAlias)reject.push('EXPLICIT_ITEM_IDENTITY_REQUIRED')
    if(keys.length&&w.musicalKeys?.length&&keys.some(k=>!w.musicalKeys.includes(k)))reject.push('KEY_CONFLICT')
    const keySets=variants.map(v=>v.keys).filter(k=>k.length)
    if(!w.musicalKeys?.length&&keySets.some(a=>keySets.some(b=>a.length!==b.length||a.some(k=>!b.includes(k)))))reject.push('UNVERIFIED_KEY_CONFLICT')
    const targetInstruments=/piano|피아노/i.test(`${w.title} ${w.titleEn||''}`)?['instrument:piano']:[]
    if(features.some(f=>f.startsWith('instrument:')&&targetInstruments.length&&!targetInstruments.includes(f)))reject.push('CATALOG_ENSEMBLE_CONFLICT')
    if(features.some(f=>/^hands:|^pianos:2|^style:|^ensemble:(?!solo)/.test(f)))reject.push('ARRANGEMENT_SCOPE_REQUIRES_REVIEW')
    if(reject.length){
      if(catalogues.some(c=>expected.some(e=>c.system===e.system&&c.number===e.number))||ownAlias)matching.rejections.push({work_id:w.id,reasons:unique(reject)})
    }else accepted.push(w)
  }
  if(accepted.length!==1)return finish(emptyDecision(accepted.length>1?'AMBIGUOUS':matching.rejections.length?'CONFLICT':'UNREGISTERED',
    [accepted.length>1?'MULTIPLE_CATALOG_WORKS':matching.rejections.length?'IDENTITY_CONFLICT_OR_INCOMPLETE':'WORK_NOT_REGISTERED']))
  const w=accepted[0],targets=w.trackIds.map(targetFor).filter(Boolean)
  const requested=targets.filter(t=>!movements.length||movements.includes(t.movementNumber))
  if(movements.length&&(!requested.length||movements.some(n=>!targets.some(t=>t.movementNumber===n))))return finish(emptyDecision('CONFLICT',['MOVEMENT_NOT_IN_CATALOG'],w.id))
  if((identity.movement_names?.length||variants.some(v=>v.excerpts.length))&&!movements.length)return finish(emptyDecision('AMBIGUOUS',['EXCERPT_SCOPE_REQUIRES_REVIEW'],w.id))
  const track_id=requested.length===1?requested[0].trackId:null
  const relation=identity.arrangement_or_excerpt||movements.length>1?'ARRANGEMENT_OR_EXCERPT':!track_id?'WHOLE_WORK_REFERENCE':'EXACT'
  return finish({track_id,work_id:w.id,catalog_id:track_id||w.id,relation,outcome:'MATCHED',confidence:'HIGH',
    reasons:[...(catalogues.length?['COMPOSER_AND_EXPLICIT_CATALOG_IDENTITY']:['COMPOSER_AND_EXPLICIT_ITEM_IDENTITY']),'TITLE_OR_REGISTERED_ALIAS_AGREES',
      ...(keys.length?['KEY_CORROBORATES_IDENTITY']:[]),...(!workNumbers.length&&!opusNumbers.length?['ABSENT_ORDINAL_NOT_INVENTED']:[]),
      ...(!track_id?['PARENT_WORK_ONLY_NOT_MOVEMENT_PERFORMANCE']:[])],
    scope:{kind:movements.length>1?'MOVEMENT_SET':relation,explicit_movement_numbers:movements},supporting_variant_line_indices:variants.map(v=>v.source_work_line_index)})
}
