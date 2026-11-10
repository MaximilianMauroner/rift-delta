import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir, symlink, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { analyzeChampions } from '../src/domains/champions/analyze.ts'
import { demoDataset } from '../tools/champions/demo.ts'

const cli = resolve('tools/champions/analyze.ts')
function command(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' })
}

test('real CLI reads the existing JSON example and writes aggregate JSON and standalone HTML', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-cli-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const input = resolve('tests/fixtures/champions/example.json')
  const before = await readFile(input, 'utf8')
  const output = join(directory, 'report')
  const result = command(['--input', input, '--output', output])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Wrote .*analysis.json/)
  assert.deepEqual((await readdir(output)).sort(), ['analysis.json', 'report.html'])
  const analysis: unknown = JSON.parse(await readFile(join(output, 'analysis.json'), 'utf8'))
  assert.deepEqual(analysis, analyzeChampions(JSON.parse(before)))
  const html = await readFile(join(output, 'report.html'), 'utf8')
  assert.match(html, /SYNTHETIC DATA/)
  assert.match(html, /<svg/)
  assert.match(html, /NOT scaling/)
  assert.doesNotMatch(html, /<script/)
  assert.equal(await readFile(input, 'utf8'), before)
})

test('real demo command is deterministic and reports explicit synthetic provenance', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-demo-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'demo')
  const result = command(['--demo', '--output', output])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(join(output, 'analysis.json'), 'utf8')), analyzeChampions(demoDataset))
})

test('validation and malformed JSON failures create no output directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-invalid-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const input = join(directory, 'input.json')
  const output = join(directory, 'output')
  const invalid = structuredClone(demoDataset)
  invalid.matches.push(structuredClone(invalid.matches[0]))
  await writeFile(input, JSON.stringify(invalid))
  const badData = command(['--input', input, '--output', output])
  assert.equal(badData.status, 1)
  assert.match(badData.stderr, /Duplicate match ID/)
  await assert.rejects(access(output))
  await writeFile(input, '{invalid')
  assert.equal(command(['--input', input, '--output', output]).status, 1)
  await assert.rejects(access(output))
})

test('source named analysis.json cannot be overwritten, including through a directory link', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-source-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'output')
  await mkdir(output)
  const input = join(output, 'analysis.json')
  const original = JSON.stringify(demoDataset)
  await writeFile(input, original)
  const alias = join(directory, 'alias')
  await symlink(output, alias)
  const result = command(['--input', input, '--output', alias])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /must not overwrite/)
  assert.equal(await readFile(input, 'utf8'), original)
  assert.deepEqual(await readdir(output), ['analysis.json'])
})

test('existing output files and symlinks remain unchanged and partial writes are removed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-existing-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'output')
  await mkdir(output)
  const sentinel = join(directory, 'sentinel')
  await writeFile(sentinel, 'keep')
  await symlink(sentinel, join(output, 'report.html'))
  const result = command(['--demo', '--output', output])
  assert.equal(result.status, 1)
  assert.equal(await readFile(sentinel, 'utf8'), 'keep')
  assert.deepEqual(await readdir(output), ['report.html'])
})

test('CLI rejects ambiguous or duplicate flags before output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'champions-flags-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'out')
  for (const args of [
    ['--demo', '--input', 'missing.json', '--output', output],
    ['--demo', '--demo', '--output', output],
    ['--demo', '--output'],
    ['--unknown', '--output', output],
  ]) {
    const result = command(args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Usage:/)
  }
  await assert.rejects(access(output))
})
