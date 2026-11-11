import test from 'node:test'
import './recordVisibility.test.mjs'
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { verifyProfileIa, verifyProfileSetup, verifySwitchFailure, verifyDashboardStates, verifyDashboardHistoryAndIsolation } from './profileIaDomTest.mjs'
import './profileRecords.test.mjs'
mkdirSync('.cache',{recursive:true})
const path = new URL('../.cache/profile-ia-test.mjs',import.meta.url)
const built = await build({entryPoints:['src/App.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',write:false})
writeFileSync(path,built.outputFiles[0].text)
let components
try { components = await import(path.href) } finally { unlinkSync(path) }
test('profile IA integrates navigation, own records and account isolation',async () => verifyProfileIa(components))
test('profile setup belongs to My Profile, never the public feed',async () => verifyProfileSetup(components))
test('account switching clears copies before awaiting logout and stops on failure',async () => verifySwitchFailure(components))
test('dashboard bounds recent records, handles empty/small/large/error/anonymous states',async () => verifyDashboardStates(components))
test('dashboard restores deep links/history and isolates late requests and drafts across accounts',async () => verifyDashboardHistoryAndIsolation(components))
