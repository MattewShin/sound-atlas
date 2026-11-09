import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export function selectOcrRestoreEntries(toc,manifest,indexNames){
 const tables=new Set(manifest.drop.tables.map(t=>t.name)),views=new Set(manifest.drop.views),functions=new Set(manifest.drop.functions.map(f=>f.name)),indexes=new Set(indexNames),selected=[],seenFunctions=new Set(),counts={TABLE:0,'TABLE DATA':0,FUNCTION:0,VIEW:0,TRIGGER:0,'FK CONSTRAINT':0,'ROW SECURITY':0,INDEX:0,CONSTRAINT:0,ACL_FUNCTION:0,ACL_RELATION:0}
 for(const line of toc.split(/\r?\n/)){
  const match=/^\d+;\s+\d+\s+\d+\s+([A-Z ]+)\s+public\s+(.+)$/.exec(line);if(!match)continue
  const kind=match[1],tail=match[2],first=tail.split(/[ (]/)[0];let include=false
  if(['TABLE','TABLE DATA','ROW SECURITY','CONSTRAINT','FK CONSTRAINT','POLICY'].includes(kind))include=tables.has(first)
  else if(kind==='FUNCTION')include=functions.has(first)
  else if(kind==='VIEW')include=views.has(first)
  else if(kind==='TRIGGER')include=manifest.drop.triggers.some(t=>tail.startsWith(t.table+' '+t.name+' '))
  else if(kind==='INDEX')include=indexes.has(first)
  else if(['ACL','COMMENT'].includes(kind)){
   const object=/^(TABLE|VIEW|FUNCTION|COLUMN)\s+([a-z_][a-z0-9_]*)(?:[ .(]|$)/i.exec(tail)
   if(object)include=object[1]==='FUNCTION'?functions.has(object[2]):tables.has(object[2])||views.has(object[2])
  }
  if(include){selected.push(line);if(kind in counts)counts[kind]++;if(kind==='FUNCTION')seenFunctions.add(first);if(kind==='ACL'&&tail.startsWith('FUNCTION '))counts.ACL_FUNCTION++;if(kind==='ACL'&&/^(TABLE|VIEW) /.test(tail))counts.ACL_RELATION++}
 }
 for(const [kind,expected]of Object.entries({TABLE:tables.size,'TABLE DATA':tables.size,FUNCTION:functions.size,VIEW:views.size,TRIGGER:manifest.drop.triggers.length,'FK CONSTRAINT':manifest.drop.foreign_keys.length,'ROW SECURITY':tables.size,INDEX:indexes.size,CONSTRAINT:manifest.restore_requirements.constraints.length,ACL_FUNCTION:functions.size,ACL_RELATION:tables.size+views.size}))if(counts[kind]!==expected)throw Error('RESTORE_TOC_INCOMPLETE_'+kind.replaceAll(' ','_'))
 if(seenFunctions.size!==functions.size)throw Error('RESTORE_TOC_FUNCTION_SET_MISMATCH')
 return {text:'; OCR-only recovery list. Review before any restore. Kept tables/data excluded.\n'+selected.join('\n')+'\n',counts,entries:selected.length}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('RESTORE_TOC_PATHS_REQUIRED')
  const manifest=JSON.parse(await readFile(new URL('../supabase/retirement/ocr-20261109-manifest.json',import.meta.url),'utf8'))
  const result=selectOcrRestoreEntries(await readFile(input,'utf8'),manifest,manifest.restore_requirements.secondary_indexes);await writeFile(output,result.text)
  console.log(JSON.stringify({result:'PREPARED_NOT_RESTORED',entries:result.entries,counts:result.counts}))
 }catch(e){console.error(/^RESTORE_[A-Z_]+$/.test(e.message)?e.message:'RESTORE_TOC_PREPARATION_FAILED');process.exitCode=1}
}
