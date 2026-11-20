import { spawn } from 'node:child_process'
import { globSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureReferencePublicData } from '../../scripts/reference-public-data.mjs'

await ensureReferencePublicData()

const browserJourneys = [...globSync('tests/**/*Browser.test.ts')].sort()
const browserSet = new Set(browserJourneys)
const otherTests = [...globSync('tests/**/*.test.ts'), ...globSync('tests/**/*.test.mjs')]
  .filter((path) => !path.startsWith('tests/dps/') && !browserSet.has(path))
  .map((path) => ({ path, size: statSync(path).size }))
  .sort((a, b) => b.size - a.size)
  .map(({ path }) => path)

const env = { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.app.json' }

async function run(files, concurrency, childEnv = env) {
  if (!files.length) return 0
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', `--test-concurrency=${concurrency}`, ...files], {
    env: childEnv,
    stdio: 'inherit',
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

async function runBrowserJourneys() {
  if (!browserJourneys.length) return 0
  const outDir = await mkdtemp(join(tmpdir(), 'rift-browser-test-'))
  try {
    const { build } = await import('vite')
    await build({ logLevel: 'warn', build: { outDir, copyPublicDir: false, emptyOutDir: true } })
    return await run(browserJourneys, 1, { ...env, RIFT_BROWSER_TEST_BUILD_DIR: outDir })
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

const workers = Math.max(1, Math.min(availableParallelism() - 2, 2))
const results = await Promise.allSettled([run(otherTests, workers), runBrowserJourneys()])
const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason)
if (errors.length) throw new AggregateError(errors, 'Could not run ranking tests')
process.exitCode = results.find((result) => result.value !== 0)?.value ?? 0
