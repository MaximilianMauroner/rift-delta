import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { createServer, type Plugin } from 'vite'
import type { TournamentSeries } from '../src/domains/tournaments/read'

const longName = 'Northern Lights International Esports Club'
const team = (name: string, wins: number | null) => ({ id: name, name, code: null, gameWins: wins, outcome: null })
function series(id: string, stage: string, completed: boolean): TournamentSeries {
  return { id, eventId: 'fixture', stage, startTime: '2026-09-27T13:00:00.000Z', bestOf: 3, vodUrls: [],
    status: completed ? 'completed' : 'upcoming', sourceState: completed ? 'completed' : 'unstarted',
    teams: [team(longName, completed ? 2 : null), team('Beta', completed ? 0 : null)] }
}

test('current rounds clear the start mask and long names fit at 390px', async () => {
  let swiss = false
  const fixture: Plugin = { name: 'review-bracket-fixture', enforce: 'pre', transform(source, id) {
    if (!id.split('?')[0].endsWith('/src/views/tournaments/TournamentsView.tsx')) return
    return source.replace('  const [requestedEvent', "  if (view === 'bracket' && window.location.hash.includes('fixtureCrash=true')) throw new Error('Synthetic view crash')\n  const [requestedEvent")
  }, configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture').pathname
      if (!path.startsWith('/tournament-data/')) return next()
      response.setHeader('content-type', 'application/json')
      response.statusCode = path.endsWith('/feed.json') || path.endsWith('.health.json') ? 200 : 404
      response.end(JSON.stringify(path.endsWith('.health.json') ? { checkedAt: '2026-09-27T12:00:00.000Z', complete: true, warnings: [] }
        : { version: 1, source: 'leaguepedia-cargo', unsupportedApi: false, dataMode: 'synthetic-fixture', fetchedAt: '2026-09-27T12:00:00.000Z', sourceUpdatedAt: null,
          coverage: { start: '2026-09-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z', complete: true, warnings: [] },
          events: [{ id: 'fixture', sourceTournamentId: 'fixture', competition: 'lcs', season: '2026', label: 'Synthetic bracket',
            series: swiss ? [1, 2, 3].flatMap((round) => Array.from({ length: 4 }, (_, pair) => ({
              ...series(`r${round}-${pair}`, `Swiss Round ${round}`, round === 1),
              teams: [team(pair === 0 ? longName : `Fixture ${pair * 2}`, round === 1 ? 2 : null), team(`Fixture ${pair * 2 + 1}`, round === 1 ? 0 : null)],
            })))
              : [series('qf', 'Quarterfinals', true), series('sf', 'Semifinals', false), series('f', 'Finals', false)] }] }))
    })
  } }
  const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 }, plugins: [fixture] })
  await server.listen()
  const address = server.httpServer!.address()
  assert.ok(address && typeof address !== 'string')
  const executablePath = chromium.executablePath()
  const browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 740 }, reducedMotion: 'reduce' })
    for (const kind of ['elimination', 'swiss']) {
      swiss = kind === 'swiss'
      await page.goto(`http://127.0.0.1:${address.port}/?fixture=${kind}#tournaments?event=fixture`)
      const frame = page.getByRole('region', { name: 'Bracket, scrolls sideways' })
      await frame.locator('[aria-current="step"]').waitFor()
      if (swiss) assert.equal(await page.getByRole('region', { name: 'Swiss stage', exact: true }).count(), 1)
      const measure = await frame.evaluate((element) => {
        const current = element.querySelector('[aria-current="step"]')!
        const mask = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5
        const left = current.getBoundingClientRect().left - element.getBoundingClientRect().left
        return { left, mask, scrollLeft: element.scrollLeft }
      })
      console.log(kind, JSON.stringify(measure))
      assert.ok(measure.scrollLeft > 0)
      assert.ok(measure.left >= measure.mask, `${kind} current round clears the ${measure.mask}px start mask, left=${measure.left}`)
      const name = frame.locator('[data-slot="bracket-team"] span').filter({ hasText: longName }).first()
      assert.ok(await name.evaluate((element) => element.clientHeight === 32 && getComputedStyle(element).whiteSpace !== 'nowrap'), 'Long names have two visible lines')
      await name.click()
      assert.match(await page.locator('[aria-live="polite"]').innerText(), new RegExp(longName))
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.evaluate(() => localStorage.removeItem('tournament-feed'))
    }
    await page.goto(`http://127.0.0.1:${address.port}/#tournaments?fixtureCrash=true`)
    await page.getByText('This page could not load', { exact: true }).waitFor()
    assert.equal(await page.getByRole('navigation', { name: 'Tournament views' }).count(), 1)
    await page.getByRole('link', { name: 'Schedule', exact: true }).click()
    await page.getByRole('heading', { name: 'Synthetic bracket', exact: true }).waitFor()
    assert.equal(await page.getByText('This page could not load', { exact: true }).count(), 0)
    assert.equal(await page.getByRole('navigation', { name: 'Tournament views' }).count(), 1)
  } finally {
    await browser.close()
    await server.close()
  }
})
