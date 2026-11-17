import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import { referencePublicDataDir, verifyReferencePublicData } from '../../scripts/reference-public-data.mjs'

const exec = promisify(execFile)
const environment = { ...process.env }
const { stdout: gitLocalVariables } = await exec('git', ['rev-parse', '--local-env-vars'])
for (const name of gitLocalVariables.trim().split(/\s+/u)) delete environment[name]
const cacheDir = '.cache/verify'
const receiptPath = join(cacheDir, 'last-pass.json')
const ignoredOutputs = new Set(['.agent/artifacts/', '.agents/artifacts/', '.cache/', 'data/reference/', 'dist/', 'node_modules/'])
const publicInputs = ['public/data', 'public/tournament-data']
const externalInputs = /^(CI$|DATABASE_URL$|DPS_TEST_DATABASE_URL$|GAMBA_CONSUMER_ROOT$|NODE_OPTIONS$|NODE_V8_COVERAGE$|RANKING_.*(?:TEST|BINARY|ENDPOINT))/

async function git(...args) {
  const { stdout } = await exec('git', args, { env: environment, maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

async function fingerprint() {
  if (Object.keys(environment).some((name) => externalInputs.test(name) && environment[name]) || existsSync('../gamba')) {
    return null
  }
  try {
    const [head, status, ignored, tracked, localPublicFiles] = await Promise.all([
      git('rev-parse', 'HEAD'),
      git('status', '--porcelain=v1', '-z', '--untracked-files=all'),
      git('ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--no-empty-directory', '-z'),
      git('ls-files', '--cached', '-z'),
      git('ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...publicInputs),
    ])
    if (status || ignored.split('\0').some((path) => path && !ignoredOutputs.has(path)
      && !publicInputs.some((dir) => path === `${dir}/`)
      && !/^data\/\.refresh-metrics-[\w-]+\.json$/.test(path))) return null

    const { default: { registry: { registry } } } = await import('playwright-core/lib/coreBundle')
    const executables = await Promise.all([
      chromium.executablePath(),
      registry.findExecutable('chromium-headless-shell').executablePath(),
    ].map(async (path) => {
      await access(path, constants.X_OK)
      const { size, mtimeMs, ctimeMs } = await stat(path)
      return [path, size, mtimeMs, ctimeMs]
    }))
    const env = Object.entries(environment).filter(([name]) => !['SHLVL', '_', 'npm_lifecycle_script'].includes(name)).sort()
    const hash = createHash('sha256').update(JSON.stringify([
      head.trim(), process.platform, process.arch, process.version, process.execPath,
      new Date().toISOString().slice(0, 10), executables, env,
    ]))
    const paths = [...new Set([
      ...tracked.split('\0'),
      ...localPublicFiles.split('\0'),
      'node_modules/.modules.yaml',
      'node_modules/.pnpm/lock.yaml',
    ])].filter(Boolean).sort()
    for (const path of paths) {
      hash.update(JSON.stringify(path))
      hash.update(createHash('sha256').update(await readFile(path)).digest())
    }
    return hash.digest('hex')
  } catch {
    return null
  }
}

async function referenceIsValid() {
  try {
    await verifyReferencePublicData(referencePublicDataDir)
    return true
  } catch {
    return false
  }
}

async function readReceipt() {
  try {
    return JSON.parse(await readFile(receiptPath, 'utf8'))
  } catch {
    return null
  }
}

async function verifyFull() {
  const child = spawn('pnpm', ['run', 'verify:full'], { env: environment, stdio: 'inherit', shell: process.platform === 'win32' })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

const fresh = process.argv.includes('--fresh')
const key = await fingerprint()
const receipt = key && !fresh ? await readReceipt() : null
if (receipt?.key === key && typeof receipt.verifiedAt === 'string' && await referenceIsValid()) {
  console.log(`Reused successful verification from ${receipt.verifiedAt}. Run pnpm verify --fresh to rerun every check.`)
} else {
  if (key) await rm(receiptPath, { force: true }).catch(() => {})
  process.exitCode = await verifyFull()
  if (process.exitCode === 0 && key && key === await fingerprint() && await referenceIsValid()) {
    const tempPath = join(cacheDir, `${randomUUID()}.json`)
    try {
      await mkdir(cacheDir, { recursive: true })
      await writeFile(tempPath, JSON.stringify({ key, verifiedAt: new Date().toISOString() }))
      await rename(tempPath, receiptPath)
    } catch {
      await rm(tempPath, { force: true }).catch(() => {})
    }
  }
}
