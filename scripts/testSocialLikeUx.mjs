import '../server/socialLikeInvalidation.test.mjs'
import test from 'node:test'
import {build} from 'esbuild'
import {writeFile,mkdir,unlink} from 'node:fs/promises'
import {verifySocialLikeUx} from './socialLikeUxDomTest.mjs'
await mkdir('.cache',{recursive:true});const path=new URL('../.cache/social-like-test.mjs',import.meta.url)
const built=await build({entryPoints:['src/components/MusicSocial.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});await writeFile(path,built.outputFiles[0].text);let Social;try{Social=(await import(path.href)).default}finally{await unlink(path)}
test('좋아요 optimistic·페이지/DOM/초안/포커스·경합/실패/권한/계정/딥링크 격리',async()=>verifySocialLikeUx(Social))
