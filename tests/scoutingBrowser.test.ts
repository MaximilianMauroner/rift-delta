import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer, type Plugin } from 'vite'
import { createStaticRankingData } from '../src/domains/rankings/internal/projections/snapshot.ts'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/internal/published/writePlan.ts'
import { scoutingFamily } from '../src/domains/scouting/build.ts'
import { createGenerationManifest, prepareSemanticArtifact } from '../scripts/public-artifact-storage.mjs'
import { FOCAL, focalSeason, scoutingGame } from './scoutingFixtures.ts'

/** The published generation, as the refresh worker writes it: a manifest and content addressed objects. */
function publishedGeneration() {
  const matches = [...focalSeason(), ...Array.from({ length: 3 }, (_, i) => scoutingGame({ id: `rare${i}`, date: '2026-06-05', teams: ['f', 'e'] }))]
  const data = createStaticRankingData({
    matches, teams: { Alpha: { name: 'Alpha', code: 'ALP', league: 'LCK', region: 'LCK' }, Beta: { name: 'Beta', code: 'BET', league: 'LCK', region: 'LCK' } },
    rosters: {}, generatedAt: '2026-06-11T00:00:00.000Z', dataMode: 'seeded-sample', source: 'Scouting browser fixture',
  })
  const plan = createPublicArtifactWritePlan(data, { families: [scoutingFamily(matches)] })
  const entries: Array<{ logicalPath: string; digest: string; bytes: number }> = []
  const objects = new Map<string, string>()
  for (const write of plan.writes) {
    const prepared = prepareSemanticArtifact(write.value)
    entries.push({ logicalPath: `/data/${write.relativePath}`, digest: prepared.digest, bytes: prepared.bytes })
    for (const object of [...(prepared.children ?? []), prepared]) objects.set(`/data/objects/sha256/${object.digest}`, object.canonicalJson)
  }
  const meta = plan.manifest.artifactMeta
  assert.ok(meta)
  assert.ok(plan.manifest.scoutingIndexUrl, 'The manifest links the scouting index')
  objects.set('/data/ranking-summary.json', JSON.stringify(createGenerationManifest({ generationId: meta.runId, rootManifest: plan.manifest, entries })))
  return objects
}

test('Scouting report loads its index and one player file from the published generation, and explains a link to a player with too few games', { timeout: 90_000 }, async () => {
  const objects = publishedGeneration()
  const requested: string[] = []
  const fixture: Plugin = { name: 'scouting-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname
      if (!path.startsWith('/data/') && !path.startsWith('/tournament-data/')) return next()
      requested.push(path)
      const body = objects.get(path)
      response.statusCode = body ? 200 : 404
      response.setHeader('content-type', 'application/json')
      response.end(body ?? '{}')
    })
  } }
  const server = await createServer({ publicDir: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: [fixture] })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const executablePath = chromium.executablePath()
    browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const heading = (name: string) => page.getByRole('heading', { level: 1, name, exact: true }).waitFor()
    const hash = () => page.evaluate(() => decodeURIComponent(location.hash))

    await page.goto(`http://127.0.0.1:${address.port}/#scouting?player=${encodeURIComponent(`${FOCAL}|Mid`)}`)
    await heading('Focal')
    assert.equal(await hash(), `#scouting?role=Mid&player=${FOCAL}|Mid`, 'The hash holds exactly the selection')
    assert.equal(await page.getByRole('link', { name: 'Players', exact: true }).first().getAttribute('aria-current'), 'page', 'Players stays the active tab')
    await page.getByRole('img', { name: 'Games by champion in the last 90 days: Riser 4, Steady 3, Fresh 2, Fader 1' }).waitFor()
    const scoutingKinds = requested.flatMap(path => /"content":\{"artifactKind":"(scouting-[a-z]+)"/.exec(objects.get(path) ?? '')?.[1] ?? [])
    assert.deepEqual(scoutingKinds, ['scouting-index', 'scouting-player'], 'The first report needs only the index and one player file')

    const steady = page.getByRole('button', { name: /^Steady\./ })
    assert.equal(await steady.getAttribute('aria-expanded'), 'false')
    await steady.focus()
    await page.keyboard.press('Enter')
    assert.equal(await steady.getAttribute('aria-expanded'), 'true')
    assert.equal(await page.getByRole('region', { name: 'Last 5 games on Steady' }).locator('li').count(), 5)
    await page.keyboard.press('Space')
    assert.equal(await steady.getAttribute('aria-expanded'), 'false')

    await page.getByRole('combobox', { name: 'Player', exact: true }).selectOption('b-2|Mid')
    await heading('b-2')
    await page.goBack()
    await heading('Focal')
    await page.reload()
    await heading('Focal')

    await page.goto(`http://127.0.0.1:${address.port}/#scouting?player=${encodeURIComponent('e-2|Mid')}`)
    await page.getByText(/Too few games for a report on e-2/).waitFor()
    await page.getByText(/A report needs 20/).waitFor()

    await page.goto(`http://127.0.0.1:${address.port}/#scouting?player=nobody%7CMid`)
    await page.getByText('No report matches this link.').waitFor()
    await heading('Focal')
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await server.close()
  }
})
