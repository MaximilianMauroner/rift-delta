import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { startBrowserFixture, type BrowserFixture } from './fixtures/browserFixture'
import { createStaticRankingData } from '../src/domains/rankings/internal/projections/snapshot.ts'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/internal/published/writePlan.ts'
import { statsPowerPolicy } from '../src/domains/rankings/internal/policy/statsPowerPolicy.ts'
import type { CompactPlayer, MatchRecord, PublicPlayerDirectory, PublicRankingManifest } from '../src/domains/rankings/types.ts'

const playerPath = '/data/entities/players.json'
const manifestPath = '/data/ranking-summary.json'
const playersAddress = '#players?scope=season%3A2026'

function player(name: string, team: string, role: CompactPlayer['role'], rating: number, rank: number): CompactPlayer {
  return {
    id: `synthetic-${name}`, name, team, region: team === 'Legacy Team' ? 'LEC' : 'LCK', role, rating, rank, games: 30 + rank,
    delta: 0, impactMultiplier: 1, ratingBasis: 'sourced-player-stats', sourceProvider: 'synthetic-fixture',
  }
}

function withStatsPower(row: CompactPlayer, score: number, sampleGames: number): CompactPlayer {
  const evidence = { observed: sampleGames, missing: row.games - sampleGames, effectiveGames: sampleGames }
  return {
    ...row,
    teamGames: 10 + row.rank,
    statsPower: {
      version: statsPowerPolicy.version, score, role: row.role, sampleGames, eligibleGames: row.games, priorOnly: sampleGames === 0,
      leagueAnchor: 100, evidenceThrough: '2025-07-01',
      metrics: Object.fromEntries(statsPowerPolicy.roleMetrics[row.role].map((metric) => [metric, evidence])),
    },
  }
}

function fixtureBodies() {
  const matches: MatchRecord[] = [2024, 2025, 2026].map((season) => ({
    id: `synthetic-${season}`, sourceProvider: 'seed', date: `${season}-07-01`,
    datetimeUtc: `${season}-07-01T12:00:00.000Z`, season, event: season === 2026 ? 'MSI 2026' : `Synthetic ${season}`,
    phase: 'Regular season', region: season === 2026 ? 'International' : 'LCK', league: season === 2026 ? 'MSI' : 'LCK', patch: '', bestOf: 1, bestOfBasis: 'provider',
    tier: 'regional-regular', teamA: 'Fixture Alpha', teamB: 'Fixture Beta', winner: 'Fixture Alpha',
    teamAKills: 10, teamBKills: 5, teamAGold: 60_000, teamBGold: 55_000,
  }))
  const data = createStaticRankingData({
    matches, teams: {
      'Fixture Alpha': { name: 'Fixture Alpha', code: 'FXA', league: 'LCK', region: 'LCK' },
      'Fixture Beta': { name: 'Fixture Beta', code: 'FXB', league: 'LCK', region: 'LCK' },
    }, rosters: {}, generatedAt: '2026-07-02T00:00:00.000Z', dataMode: 'seeded-sample',
    materializeSnapshotKeys: new Set(['All__All__All', '2026__All__All', '2026__All__All__split-2', '2025__All__All', '2024__All__All']),
    materializeTournamentIds: new Set(),
  })
  const bodies = new Map(createPublicArtifactWritePlan(data).writes.map((write) => [`/data/${write.relativePath}`, write.contents]))
  const original = bodies.get(playerPath)
  assert.ok(original, 'The fixture must use the normal published player artifact')
  const seasonPlayers = [
    { ...player('Cedar', 'Fixture Beta', 'Mid', 230, 3), league: 'LPL' },
    player('Aster', 'Fixture Alpha', 'Mid', 320, 1),
    player('Beacon', 'Fixture Alpha', 'Support', 260, 2),
  ]
  const legacy = player('Other-season only', 'Legacy Team', 'Top', 900, 1)
  const statsSeason = [
    withStatsPower(player('Delta', 'Legacy Team', 'Top', 400, 1), 101.2, 18),
    withStatsPower(player('Echo', 'Legacy Team', 'Mid', 300, 2), 104.54, 22),
    withStatsPower(player('Foxtrot', 'Legacy Team', 'Support', 200, 3), 104.5, 25),
  ]
  const directory: PublicPlayerDirectory = {
    ...JSON.parse(original) as PublicPlayerDirectory,
    sourceProvider: 'synthetic-fixture', ratedPlayerCount: 7, ratedTeamCount: 3,
    roles: ['Top', 'Mid', 'Support'], currentLineups: {},
    players: [legacy, ...seasonPlayers.map((row) => ({ ...row, rank: row.rank + 1 }))],
    scopedPlayers: { '2026__All__All': seasonPlayers, '2025__All__All': statsSeason, '2024__All__All': [] },
  }
  bodies.set(playerPath, JSON.stringify(directory))
  return bodies
}

async function expectPlayers(page: Page, names: string[]) {
  await page.waitForFunction((expected) => {
    const table = document.querySelector('table[aria-label="Player rankings"]')
    if (!table?.getClientRects().length) return false
    const actual = [...document.querySelectorAll('table[aria-label="Player rankings"] tbody tr [data-player-profile]')]
      .map((cell) => cell.textContent)
    return JSON.stringify(actual) === JSON.stringify(expected)
  }, names, { timeout: 5_000 })
  assert.deepEqual(await page.getByRole('table', { name: 'Player rankings' }).locator('tbody tr [data-player-profile]').allTextContents(), names)
}

test('Players supports navigation, exact seasons, score order, addressed filters and explicit artifact states', { timeout: 90_000 }, async () => {
  const bodies = fixtureBodies()
  const requests: string[] = []
  let holdPlayers = true
  let playerStatus = 200
  const pendingPlayers: Array<() => void> = []
  const fixture: BrowserFixture = { name: 'synthetic-player-leaderboard-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname
      if (path.startsWith('/tournament-data/')) {
        response.statusCode = 503
        response.end('{}')
        return
      }
      if (!path.startsWith('/data/')) return next()
      requests.push(path)
      const respond = () => {
        response.statusCode = path === playerPath ? playerStatus : bodies.has(path) ? 200 : 404
        response.setHeader('content-type', 'application/json')
        response.setHeader('cache-control', 'no-store')
        response.end(response.statusCode === 200 ? bodies.get(path) : '{}')
      }
      if (path === playerPath && holdPlayers) pendingPlayers.push(respond)
      else respond()
    })
  } }
  const server = await startBrowserFixture(fixture)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}/`
    const executablePath = chromium.executablePath()
    browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      window.IntersectionObserver = class extends window.IntersectionObserver { observe() {} }
    })
    const navigation = page.getByRole('navigation', { name: 'Primary', exact: true }).filter({ visible: true })
    const search = page.getByRole('searchbox', { name: 'Find a player or team', exact: true })
    const role = page.getByRole('combobox', { name: 'Role', exact: true })
    const rows = page.getByRole('table', { name: 'Player rankings' }).locator('tbody tr')
    const setHash = (hash: string) => page.evaluate((next) => { location.hash = next }, hash)

    await page.goto(`${base}#rankings?scope=season%3A2026&eligibility=all`)
    await page.locator('table tbody tr').first().waitFor()
    await page.getByRole('group', { name: '2026 period', exact: true }).waitFor()
    await page.getByRole('group', { name: '2026 period', exact: true }).getByRole('button', { name: 'Split 2', exact: true }).click()
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026:checkpoint:split-2')
    assert.equal(requests.includes(playerPath), false, 'The team board must keep player artifacts lazy')
    await navigation.getByRole('link', { name: 'Players', exact: true }).click()
    await page.getByRole('heading', { name: 'Player rankings', exact: true }).waitFor()
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026', null, { timeout: 5_000 })
    await page.getByRole('status').filter({ hasText: 'Loading player rankings' }).waitFor()
    assert.equal(await page.getByRole('group', { name: '2026 period', exact: true }).count(), 0, 'Players must not offer unpublished checkpoint scopes')
    assert.equal(await rows.count(), 0, 'Pending player data must not show another scope')
    assert.equal(await navigation.getByRole('link', { name: 'Players', exact: true }).getAttribute('aria-current'), 'page')
    await navigation.getByRole('link', { name: 'Rankings', exact: true }).click()
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    const directoryLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === playerPath, { timeout: 5_000 })
    holdPlayers = false
    pendingPlayers.splice(0).forEach((respond) => respond())
    await directoryLoaded
    await navigation.getByRole('link', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    assert.equal(requests.filter((path) => path === playerPath).length, 1, 'Leaving Players must keep its pending directory load')
    const leagueFilter = page.getByRole('navigation', { name: 'League filter' })
    await leagueFilter.getByRole('link', { name: 'LEC', exact: true }).click()
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('region') === 'LEC')
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Player rankings"] tbody tr').length === 0)
    await leagueFilter.getByRole('link', { name: 'LCK', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon'])
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon'])
    assert.equal(await leagueFilter.getByRole('link', { name: 'LCK', exact: true }).getAttribute('aria-current'), 'true')
    await leagueFilter.getByRole('link', { name: 'LPL', exact: true }).click()
    await expectPlayers(page, ['Cedar'])
    await page.reload()
    await expectPlayers(page, ['Cedar'])
    await page.goBack()
    await expectPlayers(page, ['Aster', 'Beacon'])
    await page.goForward()
    await expectPlayers(page, ['Cedar'])
    await leagueFilter.getByRole('link', { name: 'All leagues', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    assert.deepEqual(await rows.locator('.player-col-score').allTextContents(), ['320', '260', '230'])
    assert.deepEqual(await rows.locator('[data-player-stat="games"]').allTextContents(), ['31', '32', '33'])
    assert.equal(await page.locator('a[aria-label="Scouting report for Cedar"]').getAttribute('href'), '#scouting?player=synthetic-Cedar%7CMid', 'Each row links to its scouting report by player id and role')
    await page.getByRole('status').filter({ hasText: 'These are not official LoL Esports rankings.' }).waitFor()
    await page.getByText(/Source synthetic-fixture/).waitFor()
    await page.getByText(/Role Power uses model .+ includes individual stats, results, opponent strength and event context/).waitFor()
    assert.equal(await page.getByText(/Stats Power stats-power-v3 scores/).count(), 0, 'Role Power rows must not claim Stats Power')
    await rows.first().locator('summary').click()
    await rows.first().getByText('Season team', { exact: true }).waitFor()
    await rows.first().locator('summary').click()
    assert.equal(await page.getByText(/Stats Power ranks role stats/).count(), 0, 'The shell must not claim Stats Power for a Role Power-only scope')
    await page.getByText('Method', { exact: true }).click()
    assert.equal(await page.locator('.players-method').getByText(/90-day half-life/).count(), 0, 'Role Power must not claim the Stats Power recency policy')
    await page.locator('.players-method').getByText(/Season team is the most-played credited team in the selected season/).waitFor()
    await page.locator('.players-method').getByText('This scope has no Stats Power, so ranks use Role Power.', { exact: true }).waitFor()
    await page.locator('.players-method').getByText(/Because it includes team results, it does not measure individual skill alone/).waitFor()
    await page.getByRole('columnheader', { name: 'Role Power', exact: true }).waitFor()
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-count').waitFor()
    await page.getByText(/Seeded sample data. Player-stat freshness is unavailable/).waitFor()

    await setHash('#players?scope=all')
    await expectPlayers(page, ['Other-season only', 'Aster', 'Beacon', 'Cedar'])
    await rows.first().locator('summary').click()
    await rows.first().getByText('Latest team', { exact: true }).waitFor()
    await rows.first().locator('summary').click()
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-method').getByText(/Latest team is the latest observed team across all seasons/).waitFor()
    await page.getByText('Method', { exact: true }).click()
    await setHash(playersAddress)
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])

    await navigation.getByRole('link', { name: 'Rankings', exact: true }).click()
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    await page.getByRole('group', { name: '2026 period', exact: true }).getByRole('button', { name: 'Split 2', exact: true }).click()
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026:checkpoint:split-2')
    await navigation.getByRole('link', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026')
    for (const checkpoint of ['checkpoint%3Asplit-2', 'split-2']) {
      await page.goto(`${base}#players?scope=season%3A2026%3A${checkpoint}`)
      await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
      await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026', null, { timeout: 5_000 })
      await page.goBack()
      await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    }
    await page.goBack()
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('scope')), 'season:2026:checkpoint:split-2')
    await page.goForward()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026')
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.goto('about:blank')
    await page.goto(`${base}#players?scope=season%3A2026%3Acheckpoint%3Asplit-2`)
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026')
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])

    for (const query of ['', '?scope=', '?scope=invalid']) {
      await setHash('#rankings?scope=season%3A2026%3Acheckpoint%3Asplit-2&eligibility=all')
      await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
      await page.locator('table tbody tr').first().waitFor()
      await setHash(`#players${query}`)
      await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
      await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026', null, { timeout: 5_000 })
    }
    for (const requested of ['season:2019:checkpoint:split-2', 'season:2019', 'season:2099:split-2']) {
      await setHash(`${playersAddress}&player=Fixture&role=Mid&keep=untouched`)
      await expectPlayers(page, ['Aster', 'Cedar'])
      await setHash(`#players?scope=${encodeURIComponent(requested)}&player=Fixture&role=Mid&keep=untouched`)
      await expectPlayers(page, ['Aster', 'Cedar'])
      await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026', null, { timeout: 5_000 })
      assert.equal(await search.inputValue(), 'Fixture')
      assert.equal(await role.inputValue(), 'Mid')
      assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('keep')), 'untouched')
    }
    await setHash('#players?scope=season%3A2025')
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta'])
    await setHash('#players')
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta'])
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2025', null, { timeout: 5_000 })
    await page.goto('about:blank')
    await page.goto(`${base}#players?scope=season%3A2019%3Acheckpoint%3Asplit-2`)
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('scope') === 'season:2026', null, { timeout: 5_000 })

    await page.keyboard.press('/')
    assert.equal(await search.evaluate((input) => input === document.activeElement), true)
    await search.fill('Fixture')
    await role.selectOption('Mid')
    await expectPlayers(page, ['Aster', 'Cedar'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '2'], 'A role filter ranks players within that role')
    assert.deepEqual(await page.getByRole('combobox', { name: 'Profile player', exact: true }).locator('option').allTextContents(), [
      'Aster · Mid · Fixture Alpha', 'Cedar · Mid · Fixture Beta',
    ], 'Profile choices follow the selected role')
    const profile = page.getByRole('combobox', { name: 'Profile player', exact: true })
    await profile.selectOption('synthetic-Cedar')
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('profile') === 'synthetic-Cedar')
    await search.fill('cEdAr')
    await expectPlayers(page, ['Cedar'])
    await page.waitForFunction(() => {
      const query = new URLSearchParams(location.hash.split('?')[1])
      return location.hash.startsWith('#players?') && query.get('player') === 'cEdAr' && query.get('role') === 'Mid'
    })
    assert.equal(await page.getByRole('searchbox', { name: 'Find a team', exact: true }).count(), 0, 'Players search must not redirect to teams')
    await page.reload()
    await expectPlayers(page, ['Cedar'])
    assert.equal(await search.inputValue(), 'cEdAr')
    assert.equal(await role.inputValue(), 'Mid')
    assert.equal(await profile.inputValue(), 'synthetic-Cedar', 'The addressed profile survives a reload')
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['2'], 'Searching does not change the within-role rank')
    await role.selectOption('All')
    await expectPlayers(page, ['Cedar'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['3'], 'Clearing the role restores the all-role rank')

    await setHash(`${playersAddress}&player=Fixture+Alpha&role=Support`)
    await expectPlayers(page, ['Beacon'])
    await setHash(`${playersAddress}&role=Mid`)
    await expectPlayers(page, ['Aster', 'Cedar'])
    await page.goBack()
    await expectPlayers(page, ['Beacon'])
    await page.goForward()
    await expectPlayers(page, ['Aster', 'Cedar'])

    await setHash(`${playersAddress}&role=Mid&profile=synthetic-Cedar`)
    await expectPlayers(page, ['Aster', 'Cedar'])
    await search.fill('No such player')
    await page.getByRole('heading', { name: 'No players match these filters', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => !new URLSearchParams(location.hash.split('?')[1]).has('profile'))
    await role.selectOption('Top')
    await page.getByRole('heading', { name: 'No players match these filters', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.getByRole('group', { name: 'Season', exact: true }).getByRole('button', { name: '2025', exact: true }).click()
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '2', '3'], 'Different full-precision scores have different ranks even when the displayed scores match')
    assert.deepEqual(await rows.locator('.player-score-figure').allTextContents(), ['104.5', '104.5', '101.2'])
    assert.equal(await rows.first().getByText('Through Jul 1, 2025').count(), 1)
    await rows.first().locator('summary').click()
    await page.setViewportSize({ width: 320, height: 900 })
    assert.equal(await rows.first().evaluate((row) => {
      const score = row.querySelector('.r8-player-row-details')!.getBoundingClientRect()
      const date = row.querySelector('.player-score-evidence')!.getBoundingClientRect()
      return date.left >= score.left && date.right <= score.right
    }), true, 'The evidence date fits inside the score cell on mobile')
    await page.setViewportSize({ width: 1280, height: 900 })
    await rows.first().locator('summary').click()
    assert.deepEqual(await rows.locator('[data-player-stat="stat-games"]').allTextContents(), ['22', '25', '18'], 'Stat games stay separate from games')
    assert.deepEqual(await rows.locator('[data-player-stat="role-power"]').allTextContents(), ['300', '200', '400'], 'Role Power stays visible')
    assert.deepEqual(await rows.locator('[data-player-stat="games"]').allTextContents(), ['12', '13', '11'], 'Credited-team games stay separate from raw stat games')
    await page.getByRole('columnheader', { name: 'Stats Power', exact: true }).waitFor()
    await page.getByText(/Stats Power stats-power-v3 scores lane leads/).waitFor()
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-method').getByText(/It does not measure overall player ability/).waitFor()
    await page.locator('.players-method').getByText(/Its ordering across roles is not validated as a measure of player ability or role importance/).waitFor()
    await page.locator('.players-method').getByText(/Support uses kill participation, wards placed per minute, and wards cleared per minute. Ward counts measure activity, not ward quality/).waitFor()
    await page.locator('.players-method').getByText(/Newer games get more weight, with a 90-day half-life/).waitFor()
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-count').waitFor()
    const statsDirectory = JSON.parse(bodies.get(playerPath)!) as PublicPlayerDirectory
    statsDirectory.scopedPlayers!['2025__All__All'][1].statsPower!.score = 104.5
    bodies.set(playerPath, JSON.stringify(statsDirectory))
    await page.reload()
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '1', '3'], 'Equal full-precision Stats Power scores share a rank')
    await page.getByRole('group', { name: 'Season', exact: true }).getByRole('button', { name: '2024', exact: true }).click()
    await page.getByRole('heading', { name: 'No ranked players in this scope', exact: true }).waitFor()
    assert.equal(await rows.count(), 0, 'An empty exact season must not borrow all-season players')

    const priorOnlyRow = withStatsPower(player('Hotel', 'Legacy Team', 'Top', 800, 4), 110, 0)
    priorOnlyRow.statsPower!.leagueAnchor = 110
    statsDirectory.scopedPlayers!['2025__All__All'].push(priorOnlyRow, { ...player('Golf', 'Legacy Team', 'Mid', 999, 5), teamGames: 9 })
    bodies.set(playerPath, JSON.stringify(statsDirectory))
    await setHash('#players?scope=season%3A2025')
    await page.reload()
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta', 'Hotel', 'Golf'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '1', '3', '—Unranked', '—Unranked'], 'Only observed Stats Power gets a rank')
    assert.deepEqual(await rows.locator('.player-score-figure').allTextContents(), ['104.5', '104.5', '101.2', '—', '—'], 'Unavailable scores show a dash, not Role Power or the league anchor')
    assert.deepEqual(await rows.locator('.player-score-unranked').allTextContents(), ['Unranked. No stat games.', 'Unranked. No Stats Power.'])
    assert.deepEqual(await rows.locator('.player-score-evidence').allTextContents(), ['Through Jul 1, 2025', 'Through Jul 1, 2025', 'Through Jul 1, 2025'], 'Only ranked scores carry an evidence date')
    assert.equal(await rows.locator('.power-lane').count(), 3, 'Unranked rows get no score-range marker')
    assert.deepEqual(await rows.evaluateAll(elements => elements.map(row => row.querySelector('.power-lane') !== null)), [true, true, true, false, false], 'Only ranked players get a score-range track')
    assert.deepEqual(await rows.locator('[data-player-stat="stat-games"]').allTextContents(), ['22', '25', '18', '0', '—'])
    assert.deepEqual(await rows.locator('[data-player-stat="role-power"]').allTextContents(), ['300', '200', '400', '800', '999'], 'Role Power stays visible in its own column')
    await page.getByText('3 ranked by Stats Power. 2 unranked without a usable Stats Power score.', { exact: true }).waitFor()
    assert.equal(await page.locator('.player-score-key').innerText(), 'Scores run from 101.2 to 104.5. Filters keep this scale.', 'The score range uses ranked Stats Power only')
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-method').getByText(/A player without stat games is unranked, because a league-anchor score is not an observation/).waitFor()
    await page.getByText('Method', { exact: true }).click()
    await page.locator('.players-count').getByText(/Ranks across roles are rough\. Pick a role to compare fairly\.$/).waitFor()
    await role.selectOption('Top')
    await expectPlayers(page, ['Delta', 'Hotel'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '—Unranked'], 'Role ranks exclude other roles and keep unranked players unranked')
    assert.equal(await page.locator('.player-score-key').innerText(), 'Scores run from 101.2 to 104.5. Filters keep this scale.', 'Role filters keep the full scope score scale')
    await role.selectOption('Mid')
    await expectPlayers(page, ['Echo', 'Golf'])
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), ['1', '—Unranked'], 'Role ranking keeps unranked players unranked')
    await role.selectOption('All')
    await expectPlayers(page, ['Echo', 'Foxtrot', 'Delta', 'Hotel', 'Golf'])
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `The mixed scope must fit at ${width}px`)
      assert.deepEqual(await rows.evaluateAll((elements) => elements.map((row) => {
        const score = row.querySelector('.player-col-score')!.getBoundingClientRect()
        return [...row.querySelectorAll('.player-col-score > span:not([aria-hidden])')].every((part) => {
          const box = part.getBoundingClientRect()
          return box.left >= score.left - 0.5 && box.right <= score.right + 0.5 && box.bottom <= score.bottom + 0.5
        })
      })), [true, true, true, true, true], `Score text, dates and unranked notes fit inside the score cell at ${width}px`)
    }
    await page.setViewportSize({ width: 1280, height: 900 })

    await setHash(playersAddress)
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])

    playerStatus = 503
    await page.reload()
    const error = page.getByRole('alert').filter({ hasText: 'Player rankings unavailable' })
    await error.waitFor()
    assert.equal(await rows.count(), 0)
    assert.equal(await navigation.getByRole('link', { name: 'Rankings', exact: true }).isVisible(), true)
    playerStatus = 200
    await error.getByRole('button', { name: 'Retry', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    playerStatus = 404
    await page.reload()
    await error.waitFor()
    assert.equal(await rows.count(), 0)

    playerStatus = 200
    const manifest = JSON.parse(bodies.get(manifestPath)!) as PublicRankingManifest
    manifest.dataMode = 'scheduled-public-data'
    manifest.coverage.seededSample = false
    manifest.playerData.status = 'sourced-player-stats'
    manifest.generatedAt = '2026-11-15T12:00:00.000Z'
    manifest.coverage.coverageEnd = '2026-11-14'
    manifest.sources = [{
      name: "Oracle's Elixir CSV: synthetic-browser-fixture.csv", kind: 'game-stats',
      description: 'Synthetic source freshness fixture', status: 'active', coverageEnd: '2026-11-13',
      refreshReceipt: { status: 'failed', attemptedAt: '2026-11-15T10:00:00.000Z', downloadedCount: 0, reusedCount: 1, failedCount: 1 },
    }, {
      name: 'Leaguepedia Cargo: synthetic-browser-fixture', kind: 'match-data',
      description: 'Synthetic later match coverage', status: 'active', coverageEnd: '2026-11-14',
    }]
    for (const updateStatus of ['failed', 'partial']) {
      manifest.sources[0].refreshReceipt!.status = updateStatus
      bodies.set(manifestPath, JSON.stringify(manifest))
      await page.reload()
      await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
      const freshness = page.getByRole('status', { name: 'Player-stat freshness', exact: true })
      assert.match(await freshness.innerText(), /Oracle's Elixir source coverage through Nov 13, 2026/)
      assert.match(await freshness.innerText(), updateStatus === 'failed' ? /Latest Oracle's Elixir update failed/ : /Latest Oracle's Elixir update was partial/)
      assert.doesNotMatch(await freshness.innerText(), /Nov 14|Nov 15|quota/i, 'Player-stat freshness must use source coverage and public receipt status')
    }
    manifest.dataMode = 'seeded-sample'
    bodies.set(manifestPath, JSON.stringify(manifest))
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    const seededFreshness = page.getByRole('status', { name: 'Player-stat freshness', exact: true })
    assert.match(await seededFreshness.innerText(), /Seeded sample data. Player-stat freshness is unavailable/)
    assert.doesNotMatch(await seededFreshness.innerText(), /Nov 13|through/)
    manifest.dataMode = 'scheduled-public-data'
    manifest.sources[0].kind = 'seed'
    bodies.set(manifestPath, JSON.stringify(manifest))
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.getByRole('status', { name: 'Player-stat freshness', exact: true }).getByText(/Oracle's Elixir player-stat coverage is unavailable/).waitFor()
    manifest.sources = []
    bodies.set(manifestPath, JSON.stringify(manifest))
    await page.reload()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.getByRole('status', { name: 'Player-stat freshness', exact: true }).getByText(/Oracle's Elixir player-stat coverage is unavailable/).waitFor()
  } finally {
    pendingPlayers.splice(0).forEach((respond) => respond())
    await browser?.close()
    await server.close()
  }
})


test('Players profile navigation keeps focus, addressed history and responsive layouts', { timeout: 90_000 }, async () => {
  const bodies = fixtureBodies()
  const fixture: BrowserFixture = { name: 'synthetic-player-profile-fixture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = new URL(request.url ?? '/', 'http://fixture.invalid').pathname
      if (!path.startsWith('/data/') && !path.startsWith('/tournament-data/')) return next()
      response.statusCode = bodies.has(path) ? 200 : 404
      response.setHeader('content-type', 'application/json')
      response.setHeader('cache-control', 'no-store')
      response.end(bodies.get(path) ?? '{}')
    })
  } }
  const server = await startBrowserFixture(fixture)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}/`
    const executablePath = chromium.executablePath()
    browser = await chromium.launch(existsSync(executablePath) ? { headless: true } : { headless: true, channel: 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      window.IntersectionObserver = class extends window.IntersectionObserver { observe() {} }
    })
    const navigation = page.getByRole('navigation', { name: 'Primary', exact: true }).filter({ visible: true })
    const search = page.getByRole('searchbox', { name: 'Find a player or team', exact: true })
    const role = page.getByRole('combobox', { name: 'Role', exact: true })
    const rows = page.getByRole('table', { name: 'Player rankings' }).locator('tbody tr')
    await page.goto('about:blank')
    await page.goto(`${base}${playersAddress}&player=Fixture&role=Mid`)
    await expectPlayers(page, ['Aster', 'Cedar'])
    assert.equal(await search.inputValue(), 'Fixture')
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `The page must fit at ${width}px`)
      await role.focus()
      await role.press('Tab')
      assert.equal(await search.evaluate((input) => input === document.activeElement), true, 'Role comes before search in keyboard order')
    }
    await page.setViewportSize({ width: 320, height: 900 })
    const table = page.getByRole('table', { name: 'Player rankings' })
    assert.equal(await table.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The table has no horizontal overflow at 320px')
    assert.equal(await table.getAttribute('tabindex'), null, 'The table adds no keyboard stop')
    assert.equal(await table.evaluate((element) => {
      const viewport = element.parentElement!.getBoundingClientRect()
      const score = element.querySelector('.player-col-score')!.getBoundingClientRect()
      return score.left >= viewport.left && score.right <= viewport.right
    }), true, 'The primary score is visible before scrolling')
    await rows.first().locator('summary').focus()
    await page.keyboard.press('Enter')
    await rows.first().getByText('Season team', { exact: true }).waitFor()
    await rows.first().getByRole('link', { name: 'Scouting report for Aster', exact: true }).waitFor()
    await page.keyboard.press('Enter')
    await rows.first().getByRole('button', { name: 'Open profile for Aster', exact: true }).click()
    const playerProfile = page.getByRole('region', { name: 'Role profile', exact: true })
    await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).waitFor()
    assert.equal(await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).evaluate((heading) => heading === document.activeElement), true, 'Opening the default profile moves focus to its heading')
    assert.equal(await table.isVisible(), false, 'A phone profile replaces the list')
    assert.equal(await playerProfile.getByText('Stat games', { exact: true }).count(), 0, 'Missing Stats Power has no stat-games fact')
    assert.equal(await page.locator('[data-player-profile="synthetic-Aster"]').getAttribute('aria-current'), 'true')
    assert.equal(await page.locator('[data-player-profile="synthetic-Aster"]').getAttribute('aria-pressed'), null)
    await page.reload()
    await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).waitFor()
    await playerProfile.getByRole('button', { name: 'Next player', exact: true }).click()
    await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).waitFor()
    assert.equal(await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).evaluate(heading => heading === document.activeElement), false, 'Next does not focus the heading')
    await playerProfile.getByText('2 of 2', { exact: true }).waitFor()
    await page.waitForFunction(() => new URLSearchParams(location.hash.split('?')[1]).get('profile') === 'synthetic-Cedar')
    await page.goBack()
    await expectPlayers(page, ['Aster', 'Cedar'])
    assert.equal(await playerProfile.isVisible(), false)
    await page.goForward()
    await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).waitFor()
    await playerProfile.getByRole('button', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Cedar'])
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open profile for Cedar')
    await rows.last().getByRole('button', { name: 'Open profile for Cedar', exact: true }).click()
    await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).waitFor()
    await page.getByRole('link', { name: 'rift-delta', exact: true }).filter({ visible: true }).focus()
    await page.keyboard.press('Escape')
    await expectPlayers(page, ['Aster', 'Cedar'])
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Open profile for Cedar')
    await page.goto(`${base}#rankings?scope=season%3A2026&eligibility=all`)
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    await navigation.getByRole('link', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await rows.last().getByRole('button', { name: 'Open profile for Cedar', exact: true }).click()
    await playerProfile.getByRole('button', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.goBack()
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    await page.goto(`${base}${playersAddress}&profile=synthetic-Cedar`)
    await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).waitFor()
    await playerProfile.getByRole('button', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await page.waitForFunction(() => !new URLSearchParams(location.hash.split('?')[1]).has('profile'))
    await page.setViewportSize({ width: 800, height: 900 })
    await page.getByRole('combobox', { name: 'League', exact: true }).selectOption('LPL')
    await expectPlayers(page, ['Cedar'])
    await page.reload()
    await expectPlayers(page, ['Cedar'])
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])
    await navigation.getByRole('link', { name: 'Rankings', exact: true }).click()
    await page.getByRole('heading', { name: 'Team Power Index', exact: true }).waitFor()
    await navigation.getByRole('link', { name: 'Players', exact: true }).click()
    await expectPlayers(page, ['Aster', 'Beacon', 'Cedar'])


    await page.setViewportSize({ width: 1280, height: 900 })
    await rows.last().locator('.player-col-score').click()
    await playerProfile.getByRole('heading', { name: 'Cedar', exact: true }).waitFor()
    await rows.first().locator('.player-col-rank').click()
    await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).waitFor()
    await rows.last().locator('summary').click()
    assert.equal(await rows.last().locator('details').getAttribute('open') !== null, true)
    assert.equal(await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).isVisible(), true, 'The disclosure does not select its row')
    assert.equal(await playerProfile.getByRole('button', { name: 'Players', exact: true }).count(), 0, 'The desktop profile has no back button')
    const picker = playerProfile.getByRole('combobox', { name: 'Profile player', exact: true })
    await picker.focus()
    await picker.press('ArrowDown')
    await playerProfile.getByRole('heading', { name: 'Beacon', exact: true }).waitFor()
    assert.equal(await picker.evaluate(element => element === document.activeElement), true, 'ArrowDown keeps focus in the profile picker')
    await playerProfile.getByRole('button', { name: 'Previous player', exact: true }).click()
    await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).waitFor()
    assert.equal(await playerProfile.getByRole('heading', { name: 'Aster', exact: true }).evaluate(element => element === document.activeElement), false, 'Previous does not focus the heading')
    await picker.focus()
    await page.keyboard.press('Escape')
    assert.equal(await picker.inputValue(), 'synthetic-Aster')
    assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('profile')), 'synthetic-Aster', 'Desktop Escape keeps the selected profile')
    await page.goto(`${base}#players?scope=season%3A2025&profile=synthetic-Echo`)
    await playerProfile.getByRole('heading', { name: 'Echo', exact: true }).waitFor()
    assert.equal(await playerProfile.locator('.r8-player-profile-facts > div').filter({ has: page.getByText('Stat games', { exact: true }) }).locator('dd').innerText(), '22')
    assert.equal(await playerProfile.getByText('Games', { exact: true }).count(), 1)
  } finally {
    await browser?.close()
    await server.close()
  }
})
