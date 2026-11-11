import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer, type Plugin } from 'vite'
import { buildScoutingReports } from '../src/domains/scouting/build.ts'
import { FOCAL, focalSeason } from './scoutingFixtures.ts'

const artifactPath = '/data/scouting-reports.json'

test('Scouting report opens from a link, switches player, expands a pool row by keyboard and follows history', { timeout: 90_000 }, async () => {
  const body = JSON.stringify(buildScoutingReports(focalSeason(), 'a'.repeat(64)))
  const fixture: Plugin = { name: 'scouting-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname
      if (!path.startsWith('/data/') && !path.startsWith('/tournament-data/')) return next()
      response.statusCode = path === artifactPath ? 200 : 404
      response.setHeader('content-type', 'application/json')
      response.end(path === artifactPath ? body : '{}')
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

    await page.goto(`http://127.0.0.1:${address.port}/#scouting?player=nobody%7CMid`)
    await page.getByText('No report matches this link.').waitFor()
    await heading('Focal')
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await server.close()
  }
})
