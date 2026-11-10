import { mkdir, readFile, realpath, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeChampions } from '../../src/domains/champions/analyze.ts'
import { demoDataset } from './demo.ts'
import { renderReport } from './report.ts'

const usage = 'Usage: pnpm exec tsx tools/champions/analyze.ts (--input <json> | --demo) --output <directory>'

export async function run(args: string[]): Promise<void> {
  let input: string | undefined
  let output: string | undefined
  let demo = false
  const seen = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!['--input', '--output', '--demo'].includes(arg) || seen.has(arg)) throw new Error(usage)
    seen.add(arg)
    if (arg === '--demo') demo = true
    else {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(usage)
      if (arg === '--input') input = value
      else output = value
    }
  }
  if (!output || demo === Boolean(input)) throw new Error(usage)
  const inputPath = input ? await realpath(resolve(input)) : undefined
  const raw: unknown = inputPath ? JSON.parse(await readFile(inputPath, 'utf8')) : demoDataset
  const analysis = analyzeChampions(raw)
  const json = JSON.stringify(analysis, null, 2) + '\n'
  const html = renderReport(analysis)
  const outputPath = resolve(output)
  if (inputPath === join(outputPath, 'analysis.json') || inputPath === join(outputPath, 'report.html')) throw new Error('Output must not overwrite source input')
  await mkdir(outputPath, { recursive: true })
  const directory = await realpath(outputPath)
  const jsonPath = join(directory, 'analysis.json')
  const htmlPath = join(directory, 'report.html')
  if (inputPath === jsonPath || inputPath === htmlPath) throw new Error('Output must not overwrite source input')
  await writeFile(jsonPath, json, { flag: 'wx' })
  try {
    await writeFile(htmlPath, html, { flag: 'wx' })
  } catch (error) {
    await unlink(jsonPath)
    throw error
  }
  process.stdout.write(`Wrote ${jsonPath}\nWrote ${htmlPath}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
