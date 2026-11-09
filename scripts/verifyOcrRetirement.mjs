import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'))
const manifest=JSON.parse(await readFile(new URL('../supabase/retirement/ocr-20261109-manifest.json',import.meta.url),'utf8'))
const retired=[...manifest.drop.tables.map(t=>t.name),...manifest.drop.views,...manifest.drop.triggers.map(t=>t.name),...manifest.drop.functions.map(t=>t.name)]
const hits=[],files=[]
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())await scan(p);else if(/\.(?:m?js|jsx|tsx?|py|ps1)$/.test(e.name)){files.push(p);const body=await readFile(p,'utf8');for(const name of retired)if(new RegExp('\\b'+name+'\\b','i').test(body))hits.push({file:relative(root,p),object:name})}}}
for(const dir of ['src','server','scripts','api'])await scan(resolve(root,dir))
assert.deepEqual(hits,[],'removed object literals must have no application/script/test source references; history and migration are separate')
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
assert(!/easyocr|tesseract|torch|sharp/i.test(JSON.stringify({...pkg.dependencies,...pkg.devDependencies})))
assert.equal(files.filter(f=>/\.py$/.test(f)).length,0)
const sql=await readFile(resolve(root,'supabase/migrations/202611090001_retire_ocr.sql'),'utf8')
assert(/^--[^]*?\bBEGIN;/.test(sql));assert(/COMMIT;\s*$/.test(sql));assert(!/\bDROP\b[^;]*\bCASCADE\b|\bTRUNCATE\b|\bDROP\s+(?:TABLE|VIEW|FUNCTION|TRIGGER)\s+IF\s+EXISTS\b/i.test(sql))
for(const t of manifest.retain.tables)assert(!new RegExp('DROP TABLE '+t.schema+'\\.'+t.name+'(?:\\s|;)','i').test(sql))
const bundled=await build({entryPoints:[resolve(root,'api/index.js')],bundle:true,platform:'node',format:'esm',packages:'external',write:false,metafile:true})
const inputPaths=Object.keys(bundled.metafile.inputs)
assert(!inputPaths.some(p=>/programText\/|easyocr|ocrWorker|python/i.test(p)))
for(const n of retired)assert(!bundled.outputFiles[0].text.includes(n))
console.log(JSON.stringify({result:'PASS',source_files:files.length,removed_object_source_references:0,api_bundle_inputs:inputPaths.length,official_cli_in_web_bundle:false,prohibited_migration_statements:0,recognition_dependencies:0}))
