import { runProgramCli } from './analyzeConcertPrograms.mjs'
try { await runProgramCli(process.argv.slice(2)) }
catch (error) {
  console.error(JSON.stringify({ error: error.code || (/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'PROGRAM_ANALYSIS_FAILED'),
    action: 'Check .env and migration 202610150001_concert_program_analysis.sql; no credentials are logged.' }))
  process.exitCode = 1
}
