import { resolve } from 'node:path'
import { getOcrImageConfig } from './ocrImageConfig.mjs'
import { CollectionError } from './collectionHttp.mjs'
import pipeline from '../python/easyocr/pipeline.json' with { type: 'json' }

export const EASYOCR_PIPELINE_VERSION = pipeline.pipelineVersion
export const EASYOCR_ENGINE_VERSION = pipeline.engineVersion
export const EASYOCR_SETTINGS = Object.freeze({ ...pipeline.settings, languages: Object.freeze([...pipeline.settings.languages]) })
export const getEasyOcrConfig = (env = process.env) => {
  const timeoutMs = Number(env.EASYOCR_TIMEOUT_MS || 180000)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new CollectionError('INVALID_OCR_TIMEOUT', 'EASYOCR_TIMEOUT_MS must be 1000..900000')
  const cacheDirectory = resolve(env.EASYOCR_CACHE_DIR || '.cache/easyocr')
  const imageConfig = getOcrImageConfig(env)
  return { ...imageConfig, timeoutMs, cacheDirectory, tempDirectory: resolve(cacheDirectory, 'tmp'),
    python: env.EASYOCR_PYTHON?.trim() || resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'),
  }
}

export const parseEasyOcrArgs = (args) => {
  const options = { limit: 3, dryRun: false, listOnly: false, force: false, help: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--list') options.listOnly = true
    else if (arg === '--force') options.force = true
    else if (arg === '--help') options.help = true
    else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const value = arg === '--limit' ? args[++i] : arg.slice(8)
      if (!/^[1-9]\d*$/.test(value || '') || !Number.isSafeInteger(Number(value))) throw new CollectionError('INVALID_LIMIT', '--limit must be a positive safe integer')
      options.limit = Number(value)
    } else throw new CollectionError('INVALID_ARGUMENT', 'Use --list, --dry-run, --force, --limit N or --help')
  }
  return options
}
