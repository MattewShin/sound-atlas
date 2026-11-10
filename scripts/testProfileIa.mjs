import test from 'node:test'
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { verifyProfileIa, verifyProfileSetup, verifySwitchFailure } from './profileIaDomTest.mjs'
mkdirSync('.cache',{recursive:true})
const path = new URL('../.cache/profile-ia-test.mjs',import.meta.url)
const built = await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false})
writeFileSync(path,built.outputFiles[0].text)
let components
try { components = await import(path.href) } finally { unlinkSync(path) }
test('profile IA integrates navigation, own records and account isolation',async () => verifyProfileIa(components))
test('profile setup belongs to My Profile, never the public feed',async () => verifyProfileSetup(components))
test('account switching clears copies before awaiting logout and stops on failure',async () => verifySwitchFailure(components))
