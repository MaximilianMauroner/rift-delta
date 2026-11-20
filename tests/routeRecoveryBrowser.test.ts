import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { startBrowserFixture } from './fixtures/browserFixture'
import { createStaticRankingData } from '../src/domains/rankings/internal/projections/snapshot'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/internal/published/writePlan'

test('a missing Players stylesheet reloads the addressed page once and falls back if still missing', {
  skip: !process.env.RIFT_BROWSER_TEST_BUILD_DIR && 'Requires the production Vite preload helper',
  timeout: 45_000,
}, async () => {
  const data = createStaticRankingData({
    matches: [], teams: {}, rosters: {}, generatedAt: '2026-07-02T00:00:00.000Z', dataMode: 'seeded-sample',
  })
  const bodies = new Map(createPublicArtifactWritePlan(data).writes.map((write) => [`/data/${write.relativePath}`, write.contents]))
  const server = await startBrowserFixture({ name: 'route-recovery-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname
      if (!path.startsWith('/data/')) return next()
      response.setHeader('content-type', 'application/json')
      response.statusCode = bodies.has(path) ? 200 : 404
      response.end(bodies.get(path) ?? '{}')
    })
  } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}/`
    browser = await chromium.launch(existsSync(chromium.executablePath()) ? { headless: true } : { headless: true, channel: 'chrome' })
    for (const persistent of [false, true]) {
      const page = await browser.newPage()
      let failures = 0
      let documents = 0
      page.on('request', (request) => {
        if (request.resourceType() === 'document') documents += 1
      })
      await page.route('**/assets/PlayersView-*.css', async (route) => {
        if (persistent || failures === 0) {
          failures += 1
          await route.fulfill({ status: 404, body: 'Not found' })
        } else {
          await route.continue()
        }
      })
      if (persistent) {
        const url = `${base}#players?scope=all&player=Chovy`
        const retryCss = page.waitForResponse((response) => failures === 2 && /PlayersView-.*\.css$/.test(response.url()) && response.status() === 404)
        await page.goto(url, { waitUntil: 'commit' })
        await retryCss
        await page.getByRole('button', { name: 'Reload page' }).waitFor()
        assert.equal(failures, 2)
        assert.equal(page.url(), url)
      } else {
        await page.goto(`${base}#rankings?scope=all`)
        const players = page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Players', exact: true })
        const href = await players.getAttribute('href')
        const failedCss = page.waitForResponse((response) => /PlayersView-.*\.css$/.test(response.url()) && response.status() === 404)
        await players.hover()
        await failedCss
        assert.equal(documents, 1, 'Background prefetch does not reload the rankings page')
        await players.click()
        await page.getByRole('searchbox', { name: 'Find a player or team' }).waitFor()
        assert.equal(failures, 1)
        assert.equal(page.url(), `${base}${href}`)
      }
      assert.equal(documents, 2)
      await page.close()
    }
  } finally {
    await browser?.close()
    await server.close()
  }
})
