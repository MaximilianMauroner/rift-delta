import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type Plugin } from 'vite'
import {
  createStaticRankingData,
  tournamentReportFamily,
} from '../src/domains/rankings/build.ts'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/artifact-write.ts'
import {
  parseTournamentReportIndex,
  parseTournamentReport,
  type TournamentReport,
} from '../src/domains/rankings/tournament-reports.ts'
import {
  createGenerationManifest,
  prepareSemanticArtifact,
} from '../scripts/public-artifact-storage.mjs'
import { reportGame, reportTeams } from './tournamentReportFixtures.ts'

function generation({ legacy = false, updated = false } = {}) {
  const matches = [
    reportGame('one'),
    reportGame('two', '2025-10-16', updated ? 900 : -200),
    reportGame('old', '2024-10-15', 400),
  ]
  delete matches[1]!.teamARoster!.players[2]!.stats!.goldDiffAt15
  if (updated) matches[0]!.teamARoster!.players[2]!.name = 'Updated Focal'
  const data = createStaticRankingData({
    matches,
    teams: reportTeams,
    rosters: {},
    source: 'Explicitly synthetic Worlds browser fixture',
    dataMode: 'seeded-sample',
    generatedAt: updated
      ? '2025-11-11T00:00:00.000Z'
      : '2025-11-10T00:00:00.000Z',
  })
  const family = tournamentReportFamily({
    observed: { matches, teams: reportTeams },
    ratedMatches: matches,
    ratedTeams: reportTeams,
    dataMode: data.dataMode,
    modelVersion: data.model.version,
    modelConfigHash: data.model.configHash,
  })
  const plan = createPublicArtifactWritePlan(data, {
    families: legacy ? [] : [family],
  })
  const objects = new Map<string, string>()
  const kinds = new Map<string, string>()
  const entries = plan.writes.map((write) => {
    const prepared = prepareSemanticArtifact(write.value)
    for (const object of [...(prepared.children ?? []), prepared])
      objects.set(`/data/objects/sha256/${object.digest}`, object.canonicalJson)
    kinds.set(
      `/data/objects/sha256/${prepared.digest}`,
      (write.value as { artifactKind: string }).artifactKind,
    )
    return {
      logicalPath: `/data/${write.relativePath}`,
      digest: prepared.digest,
      bytes: prepared.bytes,
    }
  })
  const meta = plan.manifest.artifactMeta!
  objects.set(
    '/data/ranking-summary.json',
    JSON.stringify(
      createGenerationManifest({
        generationId: meta.runId,
        rootManifest: plan.manifest,
        entries,
      }),
    ),
  )
  const index = legacy
    ? undefined
    : parseTournamentReportIndex(
        plan.writes.find(
          (write) => write.relativePath === 'tournament-reports/index.json',
        )!.value,
      )
  const reports = Object.fromEntries(
    plan.writes
      .filter(
        (write) =>
          (write.value as { artifactKind: string }).artifactKind ===
          'tournament-report',
      )
      .map((write) => {
        const report = parseTournamentReport(write.value)
        return [report.id, report]
      }),
  )
  return { objects, kinds, reports, index }
}

type Fixture = ReturnType<typeof generation>
type Control = {
  generation: Fixture
  unavailable?: string
  feedGate?: Promise<void>
  delay?: { edition: string; promise: Promise<void> }
}

async function journey(
  run: (
    page: Page,
    base: string,
    control: Control,
    requests: string[],
  ) => Promise<void>,
  initial = generation(),
) {
  const control: Control = { generation: initial }
  const requests: string[] = []
  const plugin: Plugin = {
    name: 'synthetic-worlds-report-http-fixture',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://fixture.invalid')
          .pathname
        if (!path.startsWith('/data/') && !path.startsWith('/tournament-data/'))
          return next()
        requests.push(path)
        const kind = control.generation.kinds.get(path)
        const body = control.generation.objects.get(path)
        const delay = control.delay
        const delayed =
          kind === 'tournament-report' &&
          body?.includes(`"id":"${delay?.edition}"`)
        const send = () => {
          if (response.destroyed) return
          response.statusCode =
            body && (!control.unavailable || control.unavailable !== kind)
              ? 200
              : 404
          response.setHeader('content-type', 'application/json')
          response.end(
            body && (!control.unavailable || control.unavailable !== kind)
              ? body
              : '{}',
          )
        }
        if (path === '/tournament-data/feed.json' && control.feedGate)
          void control.feedGate.then(send)
        else if (delayed && delay) void delay.promise.then(send)
        else send()
      })
    },
  }
  const server = await createServer({
    publicDir: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [plugin],
  })
  let browser: Browser | undefined
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    console.log(
      JSON.stringify({
        fixture: 'synthetic-worlds-report',
        checkout: process.cwd(),
        pid: process.pid,
        port: address.port,
      }),
    )
    const executablePath = chromium.executablePath()
    browser = await chromium.launch(
      existsSync(executablePath)
        ? { headless: true }
        : { headless: true, channel: 'chrome' },
    )
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    const external: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' || url.protocol === 'data:')
        return route.continue()
      external.push(url.href)
      return route.abort()
    })
    await run(page, `http://127.0.0.1:${address.port}`, control, requests)
    assert.deepEqual(errors, [])
    assert.deepEqual(external, [], 'The report makes no provider requests')
    assert.ok(
      requests.every((path) => !path.includes('latest-full')),
      'Mutable full snapshots are never browser authority',
    )
  } finally {
    await browser?.close()
    await server.close()
    console.log(
      JSON.stringify({
        fixture: 'synthetic-worlds-report',
        pid: process.pid,
        serverClosed: true,
      }),
    )
  }
}

function team(report: TournamentReport, name: string) {
  return report.teams.find((team) => team.name === name)!
}
const hash = (page: Page) =>
  page.evaluate(() => decodeURIComponent(location.hash))
const eventPicker = (page: Page) =>
  page.getByRole('combobox', { name: 'Report event', exact: true })
const teamPicker = (page: Page) =>
  page.getByRole('combobox', { name: 'Report team', exact: true })
const evidence = (page: Page, name = 'Focal') =>
  page.getByRole('region', { name: `Evidence for ${name}, Mid`, exact: true })

test(
  'Worlds reports are discoverable during feed errors and preserve event/team/player URLs, history, keyboard and narrow layouts',
  { timeout: 90_000 },
  async () => {
    await journey(async (page, base, control, requests) => {
      let releaseFeed = () => {}
      control.feedGate = new Promise<void>((resolve) => {
        releaseFeed = resolve
      })
      await page.goto(`${base}/#tournaments?scope=season:2025`)
      await page
        .getByRole('link', { name: 'Team reports', exact: true })
        .waitFor()
      await page
        .getByText('Loading tournament schedule', { exact: true })
        .waitFor()
      releaseFeed()
      control.feedGate = undefined
      await page.getByText(/Tournament schedule unavailable/).waitFor()
      const link = page.getByRole('link', { name: 'Team reports', exact: true })
      await link.focus()
      await page.keyboard.press('Enter')
      await page
        .getByRole('heading', { name: 'Worlds 2025', exact: true })
        .waitFor()
      await page
        .getByText(
          'Synthetic test fixture. These player stats and results are synthetic.',
        )
        .waitFor()
      await page.getByText('Best gold lead at 15', { exact: true }).waitFor()
      const overview = page.getByRole('region', {
        name: 'Tournament statistics',
        exact: true,
      })
      await overview.getByText('Blue side wins', { exact: true }).waitFor()
      await overview.getByText('Team chart values', { exact: true }).click()
      const chartValues = overview.getByRole('table', { name: 'Win rate and gold at 15 values' })
      await chartValues.getByRole('button', { name: 'Alpha', exact: true }).focus()
      assert.equal(await chartValues.getByRole('row').count(), 3)
      assert.match(await chartValues.innerText(), /Alpha[\s\S]*100.0%/)
      await overview.getByText('Team chart values', { exact: true }).click()
      const blueSide = overview
        .locator('li')
        .filter({ has: page.getByText('Blue side wins', { exact: true }) })
        .last()
      await blueSide.getByText('100%', { exact: true }).waitFor()
      await blueSide.getByText('2 of 2 games', { exact: true }).waitFor()
      await page
        .getByRole('region', { name: 'Alpha compared with the field' })
        .getByText('Win rate', { exact: true })
        .waitFor()
      await page.getByText('A style, not better or worse', { exact: true }).first().waitFor()
      await overview
        .getByRole('button', {
          name: 'Open BET team report from Biggest gold swings after 15',
          exact: true,
        })
        .click()
      await page
        .getByRole('region', { name: 'Beta game by game' })
        .getByRole('img', {
          name: 'Loss against ALP: −500 gold at 15, 0 at the end',
          exact: true,
        })
        .waitFor()
      assert.equal(await page.getByText(/StatsPower|league anchor/i).count(), 0)
      assert.equal(
        await page
          .getByRole('link', { name: 'Tournaments', exact: true })
          .first()
          .getAttribute('aria-current'),
        'page',
      )
      const feedCount = requests.filter((path) =>
        path.startsWith('/tournament-data/'),
      ).length
      const report = control.generation.reports['worlds:2025']!
      const beta = team(report, 'Beta')
      await teamPicker(page).selectOption(beta.id)
      await teamPicker(page).selectOption(team(report, 'Alpha').id)
      await page.getByText('Best kill participation', { exact: false }).waitFor()
      await page.getByRole('button', {
        name: 'View a-0, Top, Best kill participation',
        exact: true,
      }).click()
      await page.getByRole('region', { name: 'Evidence for a-0, Top' }).waitFor()
      await page
        .getByRole('button', {
          name: 'View Focal, Mid, Best gold lead at 15',
          exact: true,
        })
        .click()
      await evidence(page).waitFor()
      assert.equal(
        await teamPicker(page).inputValue(),
        team(report, 'Alpha').id,
      )
      assert.ok(
        (await hash(page)).includes(
          `player=${team(report, 'Alpha').participants.find((player) => player.role === 'Mid')!.key}`,
        ),
      )
      await teamPicker(page).selectOption(beta.id)
      const row = page.getByRole('button', {
        name: 'View b-2, Mid',
        exact: true,
      })
      await row.focus()
      await page.keyboard.press('Enter')
      await evidence(page, 'b-2').waitFor()
      const saved = await page.url()
      assert.ok((await hash(page)).includes('scope=season:2025'))
      assert.ok(
        (await hash(page)).includes(
          `player=${beta.participants.find((player) => player.role === 'Mid')!.key}`,
        ),
      )
      await page.reload()
      await evidence(page, 'b-2').waitFor()
      assert.equal(await page.url(), saved)
      await eventPicker(page).selectOption('worlds:2024')
      await page
        .getByRole('heading', { name: 'Worlds 2024', exact: true })
        .waitFor()
      assert.equal(
        new URLSearchParams((await hash(page)).split('?')[1]).has('player'),
        false,
      )
      assert.equal(
        new URLSearchParams((await hash(page)).split('?')[1]).has('team'),
        false,
      )
      await page.goBack()
      await evidence(page, 'b-2').waitFor()
      await page.goForward()
      await page
        .getByRole('heading', { name: 'Worlds 2024', exact: true })
        .waitFor()
      await page.goto(saved)
      await evidence(page, 'b-2').waitFor()
      await teamPicker(page).selectOption(team(report, 'Alpha').id)
      await page
        .getByRole('button', { name: 'View Focal, Mid', exact: true })
        .click()
      await evidence(page).waitFor()
      const goldAverage = evidence(page)
        .getByRole('region', { name: 'Event averages', exact: true })
        .locator('li')
        .filter({
          has: page.getByText('Gold lead at 15', { exact: true }),
        })
      const goldPlace = goldAverage.locator(':scope > span').first()
      const goldHead = goldAverage.locator(':scope > span').last().locator(':scope > span').first()
      await goldPlace.getByText('1st', { exact: true }).waitFor()
      await goldPlace.getByText('of 2', { exact: true }).waitFor()
      await goldHead.getByText('+500', { exact: true }).waitFor()
      await goldHead.getByText('1 game without data', { exact: true }).waitFor()
      await goldAverage
        .getByRole('slider', { name: /^Gold lead at 15: Focal \+500, 1st of 2\./ })
        .waitFor()
      await evidence(page).getByText(/^All \d+ games$/).click()
      await evidence(page)
        .getByText('Gold lead at 15: unavailable', { exact: true })
        .waitFor()
      const focal = team(report, 'Alpha').participants.find((player) => player.role === 'Mid')!
      const goldValues = focal.games.flatMap((game) => game.metrics.goldDiffAt15 === null ? [] : [game.metrics.goldDiffAt15])
      const formatGold = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('en-US')}`
      const lineupRange = `${formatGold(Math.min(...goldValues))} to ${formatGold(Math.max(...goldValues))} · ${goldValues.length} games`
      for (const width of [320, 360, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        assert.ok(await page.getByRole('button', { name: 'View Focal, Mid', exact: true }).getByText(lineupRange, { exact: true }).isVisible(), `Lineup range and game count are visible at ${width}px`)
        await page
          .getByText('Method and source provenance', { exact: true })
          .click()
        await page.getByText(/Missing values are excluded from each average/).waitFor()
        assert.equal(await page.getByText(/StatsPower|league anchor/i).count(), 0)
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `The report fits ${width}px`,
        )
        await page
          .getByText('Method and source provenance', { exact: true })
          .click()
      }
      assert.equal(
        requests.filter((path) => path.startsWith('/tournament-data/')).length,
        feedCount,
        'Archived report navigation does not mount the live feed',
      )
      await page.goto(
        `${base}/#tournaments?view=postmortem&scope=season:2024&event=worlds:2024`,
      )
      await page
        .getByRole('heading', { name: 'Worlds 2024', exact: true })
        .waitFor()
      await page
        .getByRole('navigation', { name: 'Primary', exact: true })
        .getByRole('link', { name: 'Rankings', exact: true })
        .click()
      assert.ok((await hash(page)).includes('scope=season:2024'))
    })
  },
)

test(
  'Worlds reports reject explicit invalid event/team/player selections without replacing their saved URLs',
  { timeout: 90_000 },
  async () => {
    await journey(async (page, base, control) => {
      const report = control.generation.reports['worlds:2025']!
      const alpha = team(report, 'Alpha')
      const beta = team(report, 'Beta')
      const mid = beta.participants.find((player) => player.role === 'Mid')!
      const cases = [
        ['event=missing', 'No report matches this event link.'],
        ['event=', 'No report matches this event link.'],
        ['event=worlds:2025&team=missing', 'No team matches this team link.'],
        [
          'event=worlds:2025&player=missing',
          'No participant matches this player link.',
        ],
        [
          `event=worlds:2025&team=${encodeURIComponent(alpha.id)}&player=${encodeURIComponent(mid.key)}`,
          'The player and team in this link do not match.',
        ],
      ]
      for (const [query, message] of cases) {
        await page.goto(`${base}/#tournaments?view=postmortem&${query}`)
        await page.getByText(message!, { exact: false }).waitFor()
        const saved = await page.url()
        await page.reload()
        await page.getByText(message!, { exact: false }).waitFor()
        assert.equal(await page.url(), saved)
      }
      await teamPicker(page).selectOption(beta.id)
      await page
        .getByRole('button', { name: 'View b-2, Mid', exact: true })
        .click()
      await evidence(page, 'b-2').waitFor()
      await page.goto(
        `${base}/#tournaments?view=postmortem&event=worlds:2025&player=${encodeURIComponent(mid.key)}`,
      )
      await evidence(page, 'b-2').waitFor()
      assert.equal(
        await teamPicker(page).inputValue(),
        beta.id,
        'A player-only link resolves its team',
      )
    })
  },
)

test(
  'Worlds reports handle missing capabilities, retry, generation changes and aborted delayed shard races',
  { timeout: 90_000 },
  async () => {
    await journey(
      async (page, base, control, requests) => {
        await page.goto(`${base}/#tournaments?view=postmortem`)
        await page
          .getByText(
            'Tournament reports are unavailable in this published generation.',
            { exact: false },
          )
          .waitFor()
        control.generation = generation()
        control.unavailable = 'tournament-report-index'
        await page
          .getByRole('button', { name: 'Retry catalog', exact: true })
          .click()
        await page
          .getByText(
            'Tournament reports are unavailable in this published generation.',
            { exact: false },
          )
          .waitFor()
        control.unavailable = 'tournament-report'
        await page
          .getByRole('button', { name: 'Retry catalog', exact: true })
          .click()
        await page
          .getByText('This report artifact is unavailable.', { exact: false })
          .waitFor()
        control.unavailable = undefined
        await page
          .getByRole('button', { name: 'Retry report', exact: true })
          .click()
        await page
          .getByRole('heading', { name: 'Worlds 2025', exact: true })
          .waitFor()
        let release = () => {}
        control.delay = {
          edition: 'worlds:2024',
          promise: new Promise<void>((resolve) => {
            release = resolve
          }),
        }
        await eventPicker(page).selectOption('worlds:2024')
        await page
          .getByText('Loading Worlds 2024 report…', { exact: true })
          .waitFor()
        await eventPicker(page).selectOption('worlds:2025')
        await page
          .getByRole('heading', { name: 'Worlds 2025', exact: true })
          .waitFor()
        release()
        control.delay = undefined
        await page
          .getByRole('button', { name: 'Refresh reports', exact: true })
          .click()
        await page
          .getByRole('heading', { name: 'Worlds 2025', exact: true })
          .waitFor()
        control.generation = generation({ updated: true })
        await page
          .getByRole('button', { name: 'Refresh reports', exact: true })
          .click()
        await page
          .getByRole('button', { name: 'View Updated Focal, Mid', exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('heading', { name: 'Worlds 2024', exact: true })
            .count(),
          0,
        )
        assert.equal(
          requests.some((path) => path.startsWith('/tournament-data/')),
          false,
          'Opening the report directly never mounts the live feed',
        )
      },
      generation({ legacy: true }),
    )
  },
)
