import '../server/musicSocialSql.test.mjs'
import '../server/musicSocialRest.test.mjs'
import '../src/data/socialClient.test.js'
import '../src/data/sessionIsolation.test.js'
import test from 'node:test'
import {build} from 'esbuild'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
import {verifyMusicSocial} from './musicSocialDomTest.mjs'
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true})
const path=new URL('../.cache/social-test.mjs',import.meta.url)
const built=await build({entryPoints:['src/components/MusicSocial.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false})
await writeFile(path,built.outputFiles[0].text)
let Social
try{Social=(await import(path.href)).default}finally{await unlink(path)}
test('SNS integrates the existing Google session, retries, drafts, permission invalidation and account deletion',async()=>verifyMusicSocial(Social))
