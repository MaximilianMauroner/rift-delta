import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('local verification reuses success for the same inputs and reruns after a change or failure', {
  skip: process.platform === 'win32',
}, (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'rift-verify-receipt-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const write = (path, content, mode) => {
    const target = join(cwd, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, { mode })
  }
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })

  write('.gitignore', '.cache/\nnode_modules/\n')
  write('tools/dev/verify.mjs', '')
  copyFileSync(fileURLToPath(new URL('../tools/dev/verify.mjs', import.meta.url)), join(cwd, 'tools/dev/verify.mjs'))
  write('scripts/reference-public-data.mjs', 'export const referencePublicDataDir = ""; export async function verifyReferencePublicData() {}\n')
  write('node_modules/playwright-core/package.json', JSON.stringify({ exports: { '.': './index.cjs', './lib/coreBundle': './coreBundle.cjs' } }))
  write('node_modules/playwright-core/coreBundle.cjs', 'exports.registry = { registry: { findExecutable: (name) => ({ executablePath: () => `.cache/${name}` }) } };\n')
  write('.cache/chromium-headless-shell', 'headless shell', 0o755)
  write('node_modules/playwright-core/index.cjs', 'exports.chromium = { executablePath: () => process.execPath };\n')
  write('node_modules/.modules.yaml', 'modules\n')
  write('node_modules/.pnpm/lock.yaml', 'lock\n')
  write('bin/pnpm', `#!/bin/sh
test "$(git -C .cache/child rev-parse --show-toplevel)" = "$PWD/.cache/child" || exit 12
printf 'Full run\\n'
exit "$(cat .cache/test-exit)"
`, 0o755)
  write('.cache/test-exit', '0\n')
  git('init', '-q', '.cache/child')
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=Verify Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')

  const env = { PATH: [join(cwd, 'bin'), process.env.PATH].join(delimiter) }
  const verify = (args = [], extras = {}) => spawnSync(process.execPath, ['tools/dev/verify.mjs', ...args], {
    cwd, env: { ...env, ...extras }, encoding: 'utf8',
  })
  const first = verify(['--fresh'], {
    GIT_DIR: join(cwd, '.git'),
    GIT_WORK_TREE: cwd,
    npm_lifecycle_script: 'node tools/dev/verify.mjs --fresh',
  })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /^Full run/u)
  const repeat = verify([], { npm_lifecycle_script: 'node tools/dev/verify.mjs' })
  assert.equal(repeat.status, 0, repeat.stderr)
  assert.match(repeat.stdout, /^Reused successful verification/u)
  assert.match(verify([], { CI: 'true' }).stdout, /^Full run/u)

  write('.cache/test-exit', '11\n')
  assert.equal(verify(['--fresh']).status, 11)
  const afterFailure = verify()
  assert.equal(afterFailure.status, 11)
  assert.match(afterFailure.stdout, /^Full run/u)

  write('.cache/test-exit', '0\n')
  assert.equal(verify().status, 0)
  assert.match(verify().stdout, /^Reused successful verification/u)
  rmSync(join(cwd, '.cache/chromium-headless-shell'))
  assert.match(verify().stdout, /^Full run/u)
  write('.cache/chromium-headless-shell', 'headless shell', 0o755)
  assert.match(verify().stdout, /^Full run/u)
  write('node_modules/.pnpm/lock.yaml', 'changed lock\n')
  assert.match(verify().stdout, /^Full run/u)
  write('.gitignore', '.cache/\nnode_modules/\n# edited checkout\n')
  assert.match(verify().stdout, /^Full run/u)
})
