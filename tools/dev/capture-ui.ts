import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { createServer, type Plugin } from 'vite'
import { createGenerationManifest, prepareSemanticArtifact } from '../../scripts/public-artifact-storage.mjs'
import { createPublicArtifactWritePlan } from '../../src/domains/rankings/artifact-write.ts'
import { createStaticRankingData, tournamentReportFamily } from '../../src/domains/rankings/build.ts'
import type { MatchRecord, TeamProfile } from '../../src/domains/rankings/types.ts'

const { values } = parseArgs({ options: { out: { type: 'string' } } })
if (!values.out) throw new Error('Usage: pnpm ui:capture --out <directory>')
const out = resolve(values.out)

const widths = [{ width: 320, height: 640, phone: true }, { width: 390, height: 740, phone: true }, { width: 1280, height: 800, phone: false }]
const feedTime = '2026-09-27T12:00:00.000Z'
const password = randomUUID()

type Route = {
  id: string
  answer: string
  open: (page: Page, base: string) => Promise<void>
  fixedClock?: boolean
  /** The page reads data the harness made up, not the reference snapshot. */
  synthetic?: boolean
}

const visit = (address: string) => async (page: Page, base: string) => { await page.goto(`${base}${address}`) }

async function openBoard(page: Page, base: string) {
  await page.goto(`${base}/#rankings?scope=all`)
  await page.locator('table tbody tr').first().waitFor()
}

const routes: Route[] = [
  { id: 'rankings', answer: 'table tbody tr', open: visit('/#rankings?scope=all') },
  {
    id: 'team-detail', answer: '[role="dialog"] h2',
    open: async (page, base) => {
      await openBoard(page, base)
      await page.getByTitle('Open Bilibili Gaming', { exact: true }).click()
    },
  },
  {
    id: 'comparison', answer: '[role="dialog"] section[aria-label*=" against "]',
    open: async (page, base) => {
      await openBoard(page, base)
      await page.getByRole('checkbox', { name: 'Compare Bilibili Gaming', exact: true }).check()
      await page.getByRole('checkbox', { name: 'Compare Gen.G', exact: true }).check()
      await page.getByRole('button', { name: 'Open comparison', exact: true }).click()
    },
  },
  { id: 'players', answer: 'table tbody tr', open: visit('/#players?scope=all') },
  { id: 'regions', answer: '[title$=" region detail"]', open: visit('/#regions?scope=all') },
  { id: 'matches', answer: 'table tbody tr, div.md\\:hidden > div', open: visit('/#matches?scope=all') },
  { id: 'tournaments', answer: '[aria-label="Bracket, scrolls sideways"] article', open: visit('/#tournaments?scope=all'), fixedClock: true },
  {
    id: 'tournament-reports', answer: '[aria-label="Tournament statistics"] li', fixedClock: true, synthetic: true,
    open: async (page, base) => {
      // The reference snapshot has no report family, so this page alone reads a synthetic generation.
      await page.route((url) => url.pathname.startsWith('/data/'), async (route) => {
        const body = reportGeneration.get(new URL(route.request().url()).pathname)
        await (body ? route.fulfill({ status: 200, contentType: 'application/json', body }) : route.fulfill({ status: 404, body: '{}' }))
      })
      await page.goto(`${base}/#tournaments?scope=all`)
      await page.getByRole('link', { name: 'Team reports', exact: true }).click()
    },
  },
  {
    id: 'lab-login', answer: 'form.login-card',
    open: async (page, base) => {
      await page.context().clearCookies()
      await page.goto(`${base}/lab/login`)
    },
  },
  {
    id: 'lab', answer: '.band:not(.band-flat) .question',
    open: async (page, base) => {
      await page.goto(`${base}/lab/login`)
      await page.locator('input[type="password"]').fill(password)
      await page.getByRole('button', { name: 'ENTER PROTOTYPE' }).click()
      await page.waitForURL(`${base}/lab`)
    },
  },
]

function feedSeries(id: string, a: string, b: string, stage: string, wins: [number, number] | null) {
  const team = (name: string, gameWins: number | null) => ({ id: name.toLowerCase(), name, code: name.slice(0, 3).toUpperCase(), gameWins, outcome: null })
  return {
    id, eventId: 'worlds:2026', startTime: wins ? '2026-09-26T13:00:00.000Z' : '2026-09-28T13:00:00.000Z', stage, bestOf: 5, vodUrls: [],
    status: wins ? 'completed' : 'upcoming', sourceState: wins ? 'completed' : 'unstarted',
    teams: [team(a, wins?.[0] ?? null), team(b, wins?.[1] ?? null)],
  }
}

const syntheticFeed = {
  version: 1, source: 'leaguepedia-cargo', unsupportedApi: false, dataMode: 'synthetic-fixture',
  fetchedAt: feedTime, sourceUpdatedAt: null,
  coverage: { start: '2026-09-13T00:00:00.000Z', end: '2026-11-12T23:59:59.999Z', complete: true, warnings: [] },
  events: [{
    id: 'worlds:2026', sourceTournamentId: 'fixture-worlds', competition: 'worlds', label: 'Worlds 2026', season: '2026',
    series: [
      feedSeries('qf-1', 'Alpha', 'Beta', 'Quarterfinals', [3, 1]),
      feedSeries('qf-2', 'Gamma', 'Delta', 'Quarterfinals', [2, 3]),
      feedSeries('qf-3', 'Epsilon', 'Zeta', 'Quarterfinals', [3, 0]),
      feedSeries('qf-4', 'Eta', 'Theta', 'Quarterfinals', [3, 2]),
      feedSeries('sf-1', 'Alpha', 'Delta', 'Semifinals', null),
      feedSeries('sf-2', 'Epsilon', 'Eta', 'Semifinals', null),
    ],
  }],
}

const reportRoles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as const
const reportTeams: Record<string, TeamProfile> = {
  Alpha: { name: 'Alpha', code: 'ALP', region: 'LCK', league: 'LCK' },
  Beta: { name: 'Beta', code: 'BET', region: 'LPL', league: 'LPL' },
  Gamma: { name: 'Gamma', code: 'GAM', region: 'LEC', league: 'LEC' },
  Delta: { name: 'Delta', code: 'DEL', region: 'LCS', league: 'LCS' },
}

/** One synthetic Worlds game: `lead` is the blue side's team gold lead at 15, `swing` its change by the end. */
function reportGame(index: number, blue: string, red: string, blueWins: boolean, lead: number, swing: number): MatchRecord {
  const date = `2025-10-${String(15 + Math.floor(index / 2)).padStart(2, '0')}`
  const roster = (team: string, side: 0 | 1) => ({
    sourceProvider: 'oracles-elixir' as const, teamId: team.toLowerCase(), observedAt: date, completeness: 'complete-five-role' as const,
    players: reportRoles.map((role, slot) => {
      const sign = side === 0 ? 1 : -1
      const share = [0.3, 0.15, 0.25, 0.2, 0.1][slot]!
      return {
        id: `${team.toLowerCase()}-${slot}`, name: `${team} ${role}`, role,
        stats: {
          side: side === 0 ? 'blue' as const : 'red' as const, won: side === 0 ? blueWins : !blueWins,
          kills: 2 + slot % 3, deaths: 1 + (index + slot) % 3, assists: 4 + slot,
          champion: ['Aatrox', 'Vi', 'Azir', 'Varus', 'Rell', 'Renekton', 'Xin Zhao', 'Orianna', 'Kalista', 'Nautilus'][(slot + index) % 10]!,
          goldDiffAt15: Math.round(sign * lead * share), damagePerMinute: 400 + 60 * slot + 15 * index, csPerMinute: slot === 4 ? 1.2 : 8 + slot / 4,
          killParticipation: 0.5 + slot / 20,
        },
      }
    }),
  })
  return {
    id: `capture-${index}`, sourceProvider: 'oracles-elixir', date, season: 2025, gameNumber: 1 + index % 3,
    event: 'Worlds 2025', phase: index < 6 ? 'Swiss' : 'Knockout', region: 'International', league: 'WLDs', patch: '', bestOf: 3, tier: 'worlds-main',
    teamA: blue, teamB: red, winner: blueWins ? blue : red, teamAHomeLeague: reportTeams[blue]!.league, teamBHomeLeague: reportTeams[red]!.league,
    teamAKills: 12, teamBKills: 9, teamAGold: 60_000 + lead + swing, teamBGold: 60_000,
    gameLengthSeconds: 60 * (28 + (index * 3) % 9),
    sourceGameId: `capture-game-${index}`, sourceMatchId: `capture-series-${index}`, sourceFileName: 'synthetic-capture-fixture.csv',
    teamARoster: roster(blue, 0), teamBRoster: roster(red, 1),
  } as MatchRecord
}

/** A complete published generation whose only purpose is the reports capture. Every value is synthetic. */
function syntheticReportGeneration() {
  const matches = [
    reportGame(0, 'Alpha', 'Beta', true, 1800, 2500), reportGame(1, 'Gamma', 'Delta', false, 900, -4200),
    reportGame(2, 'Beta', 'Gamma', true, 2400, 1200), reportGame(3, 'Delta', 'Alpha', false, -600, -3100),
    reportGame(4, 'Alpha', 'Gamma', true, 300, 3900), reportGame(5, 'Beta', 'Delta', true, -1500, 5200),
    reportGame(6, 'Delta', 'Beta', false, 1100, -2800), reportGame(7, 'Alpha', 'Delta', true, 2600, 1900),
  ]
  const data = createStaticRankingData({
    matches, teams: reportTeams, rosters: {}, source: 'Synthetic capture-harness report fixture',
    dataMode: 'seeded-sample', generatedAt: '2025-11-10T00:00:00.000Z',
  })
  const family = tournamentReportFamily({
    observed: { matches, teams: reportTeams }, ratedMatches: matches, ratedTeams: reportTeams,
    dataMode: data.dataMode, modelVersion: data.model.version, modelConfigHash: data.model.configHash,
  })
  const plan = createPublicArtifactWritePlan(data, { families: [family] })
  const objects = new Map<string, string>()
  const entries = plan.writes.map((write) => {
    const prepared = prepareSemanticArtifact(write.value)
    for (const object of [...(prepared.children ?? []), prepared]) objects.set(`/data/objects/sha256/${object.digest}`, object.canonicalJson)
    return { logicalPath: `/data/${write.relativePath}`, digest: prepared.digest, bytes: prepared.bytes }
  })
  objects.set('/data/ranking-summary.json', JSON.stringify(createGenerationManifest({ generationId: plan.manifest.artifactMeta!.runId, rootManifest: plan.manifest, entries })))
  return objects
}

const reportGeneration = syntheticReportGeneration()

const tournamentFeedFixture: Plugin = {
  name: 'capture-tournament-feed-fixture',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      const body = path === '/tournament-data/feed.json' ? syntheticFeed
        : path === '/tournament-data/feed.json.health.json' ? { checkedAt: feedTime, complete: true, warnings: [] } : null
      if (!body) return next()
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(body))
    })
  },
}

// A title counts as hover-only when it holds a word that the element does not
// already show or announce. Verbs and joining words do not count, so "Open
// Bilibili Gaming" on a button that reads "Bilibili Gaming" adds nothing.
const addsNothing = ['open', 'close', 'show', 'hide', 'view', 'see', 'go', 'select', 'choose', 'compare', 'clear', 'sort', 'expand', 'collapse', 'toggle', 'remove', 'add', 'pin', 'unpin', 'copy', 'filter', 'find', 'search', 'play', 'watch', 'visit', 'to', 'the', 'a', 'an', 'for', 'of', 'on', 'in', 'by', 'with', 'and', 'or', 'this', 'that']

const measure = `(answer) => {
  const element = [...document.querySelectorAll(answer)].find((node) => node.getClientRects().length > 0)
  const text = (ids) => (ids ?? '').split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
  const words = (value) => value.toLowerCase().match(/[\\p{L}\\p{N}]+/gu) ?? []
  const addsNothing = new Set(${JSON.stringify(addsNothing)})
  const titleOnly = [...document.querySelectorAll('[title]')].filter((node) => {
    const title = words(node.getAttribute('title'))
    if (!title.length || node.getClientRects().length === 0) return false
    const explained = new Set(words([node.getAttribute('aria-label'), text(node.getAttribute('aria-labelledby')), text(node.getAttribute('aria-describedby')), node.innerText ?? node.textContent].join(' ')))
    return title.some((word) => !addsNothing.has(word) && !explained.has(word))
  })
  return {
    firstAnswerY: element ? Math.round(element.getBoundingClientRect().top + window.scrollY) : null,
    scrollWidth: document.documentElement.scrollWidth,
    layoutWidth: window.innerWidth,
    titleOnlyCount: titleOnly.length,
    titleOnlySamples: [...new Set(titleOnly.map((node) => node.getAttribute('title').trim()))].slice(0, 5),
  }
}`

async function settle(page: Page) {
  const shape = 'document.getElementsByTagName("*").length + ":" + document.querySelectorAll("[title]").length + ":" + document.documentElement.scrollHeight'
  let previous = ''
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await page.evaluate(shape) as string
    if (current === previous) return
    previous = current
    await page.waitForTimeout(500)
  }
  throw new Error('The page did not stop changing within 20 seconds')
}

async function capture(context: BrowserContext, base: string, route: Route, size: { width: number; height: number }) {
  const page = await context.newPage()
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  if (route.fixedClock) await page.clock.install({ time: new Date(feedTime) })
  let failure: string | null = null
  try {
    await route.open(page, base)
    await page.locator(route.answer).filter({ visible: true }).first().waitFor({ timeout: 20_000 })
    // The lab keeps requests open, so network idle is best effort.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    await page.evaluate('document.fonts.ready')
    await settle(page)
  } catch (error) {
    failure = error instanceof Error ? error.message.split('\n')[0]! : String(error)
  }
  await page.evaluate('window.scrollTo(0, 0)')
  const metrics = await page.evaluate(`(${measure})(${JSON.stringify(route.answer)})`) as {
    firstAnswerY: number | null; scrollWidth: number; layoutWidth: number; titleOnlyCount: number; titleOnlySamples: string[]
  }
  const file = `${route.id}-${size.width}.png`
  await page.screenshot({ path: join(out, file), fullPage: true })
  await page.close()
  return {
    route: route.id, width: size.width, height: size.height, file, answerSelector: route.answer, synthetic: route.synthetic ?? false,
    ...metrics, overflow: metrics.scrollWidth > size.width, consoleErrors, failure,
  }
}

process.env.PROTOTYPE_ACCESS_PASSWORD = password
process.env.PROTOTYPE_SESSION_SECRET = randomUUID()
delete process.env.DATABASE_URL
delete process.env.VITE_RANKING_DATA_URL

async function freePort() {
  const probe = createNetServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const address = probe.address()
  await new Promise((done) => probe.close(done))
  if (!address || typeof address === 'string') throw new Error('No free port')
  return address.port
}

await mkdir(out, { recursive: true })
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: await freePort(), strictPort: true }, plugins: [tournamentFeedFixture] })
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite did not report a port')
  const base = `http://127.0.0.1:${address.port}`
  console.log(`Vite ${base} pid ${process.pid} checkout ${process.cwd()}`)
  const executablePath = chromium.executablePath()
  browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
  const captures = []
  for (const size of widths) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height }, isMobile: size.phone, hasTouch: size.phone,
      reducedMotion: 'reduce', timezoneId: 'Europe/Vienna', locale: 'en-US',
    })
    for (const route of routes) {
      const result = await capture(context, base, route, size)
      console.log(`${result.file} y=${result.firstAnswerY} overflow=${result.overflow} titleOnly=${result.titleOnlyCount} errors=${result.consoleErrors.length}${result.failure ? ` failure=${result.failure}` : ''}`)
      captures.push(result)
    }
    await context.close()
  }
  const manifest = JSON.parse(await readFile('public/data/ranking-summary.json', 'utf8')) as { generatedAt: string; dataMode: string; model: { version: string; configHash: string } }
  await writeFile(join(out, 'metrics.json'), `${JSON.stringify({
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    rankingData: { generatedAt: manifest.generatedAt, dataMode: manifest.dataMode, modelVersion: manifest.model.version, modelConfigHash: manifest.model.configHash },
    tournamentFeed: 'synthetic-fixture served by the capture harness',
    tournamentReports: 'synthetic: the tournament-reports capture reads a seeded-sample generation built by the capture harness, not the reference snapshot',
    captures,
  }, null, 2)}\n`)
} finally {
  await browser?.close()
  await server.close()
}
