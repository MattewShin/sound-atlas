// Source section extraction only: no matcher, evidence IDs, I/O or persistence.
const heading = /^\s*(?:program(?:me)?|프로그램|곡목|\[\s*(?:program(?:me)?|프로그램|곡목)\s*\]|【\s*(?:program(?:me)?|프로그램|곡목)\s*】|\(\s*(?:program(?:me)?|프로그램|곡목)\s*\))\s*[:：]?\s*$/i
const boundary = /^\s*(?:\[[^\]]+\]|【[^】]+】|(?:profile|biography|program\s+notes?|프로필|출연진|연주자\s*소개|작품\s*해설|공연소개|관람\s*안내|공지|안내|예매|후원|문의)\s*[:：]?|\*\s*프로그램\s*(?:및|은|이).*(?:변경|예정).*)\s*$/i
const notice = /^\s*\*?\s*(?:program(?:me)?(?:\s+and\s+(?:artists?|performers?))?\s+(?:(?:is|are)\s+)?(?:subject\s+to\s+change|may\s+(?:be\s+)?change)|프로그램\s*(?:및\s*연주자)?\s*(?:은|이|가)?.*변경)/i
const biography = /졸업|학사|석사|박사|학위|역임|출강|교수|과거\s*공연|지난\s*공연|경력|\bpreviously\b|\bgraduat\w*\b|\buniversity\b|\bconservatory\b|\bdiscography\b/i
const labeledBoundary = /^\s*(?:profile|biography|program\s+notes?|visitor\s+information|ticket|admission|location|프로필|출연진|연주자\s*소개|작품\s*해설|공연소개|관람\s*안내|공지|안내|예매|후원|문의)(?=\s|[:：]|$)/i

export function extractOfficialProgramText(sty) {
  if(typeof sty!=='string'||!sty.trim())return {status:'NO_PROGRAM_TEXT',sections:[]}
  if(/<\/?[a-z][^>]*>/i.test(sty))return {status:'SOURCE_UNRESOLVED',reason:'MARKUP_NOT_SUPPORTED',sections:[]}
  // Retain legacy diagnostic LF text, with exact UTF-16 offsets into the input.
  // The router hashes/returns the untouched source, never this normalized view.
  const parts=sty.split(/(\r\n|\r|\n)/),lines=[],offsets=[]
  let offset=0
  for(let i=0;i<parts.length;i+=2){lines.push(parts[i]);offsets.push(offset);offset+=parts[i].length+(parts[i+1]?.length||0)}
  const sections=[]
  let active=null
  const close=()=>{
    if(active){sections.push({...active,text:lines.slice(active.startLine,active.endLine+1).join('\n'),
      start_offset:offsets[active.startLine],end_offset:offsets[active.endLine]+lines[active.endLine].length});active=null}
  }
  for(let i=0;i<lines.length;i++) {
    if(heading.test(lines[i])){close();active={startLine:i,endLine:i};continue}
    if(active&&(boundary.test(lines[i])||labeledBoundary.test(lines[i])||notice.test(lines[i])||biography.test(lines[i]))){close();continue}
    if(active)active.endLine=i
  }
  close()
  return {status:sections.length?'PROGRAM_TEXT_FOUND':'NO_EXPLICIT_PROGRAM_HEADING',sections}
}
