import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerRankingCard } from '../src/views/rankings/PlayerDisclosure.tsx'
import { createPlayerDirectory, createStaticRankingData } from '../src/domains/rankings/internal/projections/snapshot.ts'
import { compactStanding, parsePublicPlayerDirectory, teamIdFor } from '../src/domains/rankings/internal/published/schema.ts'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/internal/published/writePlan.ts'
import type { MatchRecord, MatchRosterSnapshot, Role, TeamProfile } from '../src/domains/rankings/types.ts'

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
const teams: Record<string, TeamProfile> = {
  Alpha: { name: 'Alpha', code: 'ALP', region: 'LCK', league: 'LCK' },
  Beta: { name: 'Beta', code: 'BET', region: 'LCK', league: 'LCK' },
}
const alphaId = teamIdFor({ team: 'Alpha', code: 'ALP' })

function roster(prefix: string, date: string): MatchRosterSnapshot {
  return {
    sourceProvider: 'oracles-elixir',
    observedAt: date,
    completeness: 'complete-five-role',
    players: roles.map((role) => ({
      id: `${prefix}-${role}`,
      name: `${prefix} ${role}`,
      role,
      stats: {
        side: prefix === 'beta' ? 'red' : 'blue',
        won: prefix !== 'beta',
        kills: 3,
        deaths: 2,
        assists: 8,
        damageShare: 0.2,
        earnedGoldShare: 0.2,
        vspm: role === 'Support' ? 2.2 : 1,
      },
    })),
  }
}

function match(id: string, date: string, overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id,
    sourceProvider: 'oracles-elixir',
    sourceGameId: id,
    sourceMatchId: `series-${id}`,
    sourceFileName: 'isolated-lineup-fixture.csv',
    date,
    season: 2026,
    event: 'LCK 2026 Spring',
    phase: 'Regular season',
    region: 'LCK',
    league: 'LCK',
    patch: '26.1',
    bestOf: 1,
    tier: 'regional-regular',
    teamA: 'Alpha',
    teamB: 'Beta',
    winner: 'Alpha',
    teamAKills: 15,
    teamBKills: 10,
    teamAGold: 60_000,
    teamBGold: 55_000,
    teamARoster: roster('alpha', date),
    teamBRoster: roster('beta', date),
    ...overrides,
  }
}

function history(): MatchRecord[] {
  return Array.from({ length: 20 }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return match(`history-${day}`, `2026-01-${day}`)
  })
}

function build(matches: MatchRecord[], compactPlayerDirectory = false) {
  return createStaticRankingData({
    matches,
    teams,
    rosters: {},
    generatedAt: '2026-01-25T00:00:00.000Z',
    dataMode: 'scheduled-public-data',
    source: 'Isolated sourced-roster regression fixture',
    compactPlayerDirectory,
  })
}

function substitution(date: string): MatchRosterSnapshot {
  const observed = roster('alpha', date)
  observed.players[2] = { ...observed.players[2], id: 'reserve-Mid', name: 'Reserve Mid' }
  return observed
}

test('a new low-game lineup replaces the old ranked roster without invented ratings', () => {
  const date = '2026-01-24'
  const data = build([...history(), match('debut', date, { teamARoster: roster('rookie', date) })])
  const directory = parsePublicPlayerDirectory(JSON.parse(JSON.stringify(createPlayerDirectory(data))))
  const lineup = directory.currentLineups[alphaId]

  assert.ok(lineup)
  assert.equal(lineup.observedAt, date)
  assert.equal(lineup.freshnessDays, 1)
  assert.equal(lineup.claim, 'last-observed')
  assert.equal(lineup.evidenceBasis, 'scored-series')
  assert.equal(lineup.completeness, 'complete-five-role')
  assert.deepEqual(lineup.coveredRoles, roles)
  assert.deepEqual(lineup.missingRoles, [])
  assert.deepEqual(lineup.starters.map((player) => player.playerId), roles.map((role) => `rookie-${role}`))
  assert.equal(lineup.starters.some((player) => 'rating' in player), false)
  assert.equal(directory.players.filter((player) => player.team === 'Alpha').length, 5)
  assert.equal(directory.players.some((player) => player.id.startsWith('rookie-')), false)
  assert.equal(directory.players.every((player) => player.games >= 20), true)
})

test('same-day substitutions use the latest timed game and preserve its whole roster across side swaps', () => {
  const date = '2026-01-24'
  const early = match('late-id', date, { datetimeUtc: `${date}T10:00:00Z` })
  const late = match('early-id', date, {
    datetimeUtc: `${date}T12:00:00Z`,
    teamA: 'Beta',
    teamB: 'Alpha',
    teamARoster: roster('beta', date),
    teamBRoster: substitution(date),
  })
  const directory = createPlayerDirectory(build([...history(), late, early]))
  const lineup = directory.currentLineups[alphaId]

  assert.ok(lineup)
  assert.equal(lineup.completeness, 'complete-five-role')
  assert.deepEqual(lineup.starters.map((player) => player.playerId), ['alpha-Top', 'alpha-Jungle', 'reserve-Mid', 'alpha-Bot', 'alpha-Support'])
  assert.equal(lineup.starters.find((player) => player.role === 'Mid')?.rating, undefined)
  assert.equal(typeof lineup.starters.find((player) => player.role === 'Top')?.rating, 'number')
  assert.deepEqual(lineup.substitutes, [])
})

test('source series game order resolves a substitution when exact game times are absent', () => {
  const date = '2026-01-24'
  const early = match('source-series-game1', date, { sourceMatchId: 'source-series', bestOf: 3, gameNumber: 1 })
  const late = match('source-series-game2', date, { sourceMatchId: 'source-series', bestOf: 3, gameNumber: 2, teamARoster: substitution(date) })
  const directory = createPlayerDirectory(build([...history(), late, early]))

  assert.equal(directory.currentLineups[alphaId]?.starters.find((player) => player.role === 'Mid')?.playerId, 'reserve-Mid')
})

test('conflicting same-day rosters from unordered series do not produce a claimed lineup', () => {
  const date = '2026-01-24'
  const first = match('unknown-first', date, { gameNumber: 3, bestOf: 3 })
  const second = match('unknown-second', date, { gameNumber: 1, teamARoster: substitution(date) })
  const matches = [...history(), first, second]
  const directory = createPlayerDirectory(build(matches))

  assert.equal(directory.currentLineups[alphaId], undefined)
  assert.deepEqual(createPlayerDirectory(build(matches.toReversed())).currentLineups, directory.currentLineups)
  assert.equal(directory.currentLineups[teamIdFor({ team: 'Beta', code: 'BET' })]?.completeness, 'complete-five-role')
})

test('an untimed conflicting roster stays ambiguous beside a timed same-day roster', () => {
  const date = '2026-01-24'
  const timed = match('timed', date, { datetimeUtc: `${date}T16:00:00Z` })
  const untimed = match('untimed', date, { teamARoster: substitution(date) })

  assert.equal(createPlayerDirectory(build([...history(), timed, untimed])).currentLineups[alphaId], undefined)
})

test('latest partial roster evidence cannot borrow missing roles from earlier games', () => {
  const date = '2026-01-24'
  const partial = roster('rookie', date)
  partial.completeness = 'partial'
  partial.players = partial.players.filter((player) => player.role === 'Mid')
  const directory = createPlayerDirectory(build([...history(), match('partial', date, { teamARoster: partial })]))
  const lineup = directory.currentLineups[alphaId]

  assert.ok(lineup)
  assert.equal(lineup.observedAt, date)
  assert.equal(lineup.completeness, 'partial')
  assert.deepEqual(lineup.coveredRoles, ['Mid'])
  assert.deepEqual(lineup.missingRoles, ['Top', 'Jungle', 'Bot', 'Support'])
  assert.deepEqual(lineup.starters.map((player) => player.playerId), ['rookie-Mid'])
})

test('ranking rows alone cannot establish an observed lineup', () => {
  const data = build(history())
  data.matches = data.matches.map((game) => ({ ...game, teamARoster: undefined, teamBRoster: undefined }))
  const directory = createPlayerDirectory(data)

  assert.ok(directory.players.length > 0)
  assert.deepEqual(directory.currentLineups, {})
})

test('sourced lineup artifacts preserve full and compact publication parity and existing readers', () => {
  const date = '2026-01-24'
  const matches = [...history(), match('debut', date, { teamARoster: roster('rookie', date) })]
  const full = build(structuredClone(matches))
  const compact = build(structuredClone(matches), true)
  const fullDirectory = createPlayerDirectory(full)

  assert.ok(compact.precomputedPlayerDirectory)
  assert.deepEqual(compact.precomputedPlayerDirectory, fullDirectory)
  const publishedDirectory = (data: ReturnType<typeof build>) => {
    const plan = createPublicArtifactWritePlan(data)
    const players = plan.writes.find((write) => write.relativePath === 'entities/players.json')
    assert.ok(players)
    return parsePublicPlayerDirectory(JSON.parse(JSON.stringify(players.value)))
  }
  assert.deepEqual(publishedDirectory(compact), publishedDirectory(full))
  const partialPlan = createPublicArtifactWritePlan(compact, { affectedLogicalPaths: new Set(['entities/players.json']) })
  const partialPlayers = partialPlan.writes.find((write) => write.relativePath === 'entities/players.json')
  assert.ok(partialPlayers)
  assert.deepEqual(parsePublicPlayerDirectory(JSON.parse(JSON.stringify(partialPlayers.value))), publishedDirectory(full))
  assert.deepEqual(publishedDirectory(full).currentLineups[alphaId].starters.map((player) => player.playerId), roles.map((role) => `rookie-${role}`))
})

test('observed starters are available even when every player is below the ranking threshold', () => {
  const data = build([match('debut-only', '2026-01-24')])
  const directory = createPlayerDirectory(data)

  assert.deepEqual(directory.players, [])
  assert.equal(directory.ratedPlayerCount, 0)
  assert.equal(directory.currentLineups[alphaId]?.starters.length, 5)
  assert.equal(directory.currentLineups[alphaId]?.starters.some((player) => 'rating' in player), false)
})

test('fallback grouping cannot turn game numbers from unidentified series into chronology', () => {
  const date = '2026-01-24'
  const early = match('unknown-a', date, { sourceMatchId: undefined, gameNumber: 1, bestOf: 3 })
  const late = match('unknown-b', date, { sourceMatchId: undefined, gameNumber: 2, bestOf: 3, teamARoster: substitution(date) })

  assert.equal(createPlayerDirectory(build([...history(), early, late])).currentLineups[alphaId], undefined)
})

test('partial five-role source evidence and duplicate player identities cannot become a complete lineup', () => {
  const date = '2026-01-24'
  const partial = roster('rookie', date)
  partial.completeness = 'partial'
  const partialLineup = createPlayerDirectory(build([match('partial-five', date, { teamARoster: partial })])).currentLineups[alphaId]
  assert.equal(partialLineup?.completeness, 'partial')

  const duplicate = roster('rookie', date)
  duplicate.players[2].id = duplicate.players[0].id
  const duplicateLineup = createPlayerDirectory(build([match('duplicate-player', date, { teamARoster: duplicate })])).currentLineups[alphaId]
  assert.equal(duplicateLineup?.completeness, 'partial')
  assert.deepEqual(duplicateLineup?.missingRoles, ['Top', 'Mid'])
})

test('standings supply public team identity when the profile map is absent', () => {
  const data = build(history())
  data.teams = {}
  const directory = createPlayerDirectory(data)

  assert.equal(directory.players.find((player) => player.team === 'Alpha')?.teamId, alphaId)
  assert.equal(directory.currentLineups[alphaId]?.teamCode, 'ALP')
})

test('the player disclosure describes qualified career rows beside the sourced roster evidence', () => {
  const date = '2026-01-24'
  const data = build([...history(), match('debut', date, { teamARoster: roster('rookie', date) })])
  const directory = createPlayerDirectory(data)
  const standing = data.snapshots[data.defaultSnapshotKey].standings.find((standing) => standing.team === 'Alpha')
  assert.ok(standing)
  const team = compactStanding(standing)
  const html = renderToStaticMarkup(createElement(PlayerRankingCard, {
    team,
    players: directory.players.filter((player) => player.team === 'Alpha'),
    currentLineup: directory.currentLineups[alphaId],
    loadState: { status: 'ready' },
    playerScopeLabel: 'Career',
  }))

  assert.match(html, /Ranked career rows in Career/)
  assert.match(html, /Roster evidence from/)
  assert.match(html, /Observed players can have too few games to qualify for rankings/)
  assert.match(html, /Historical affiliation/)
  assert.doesNotMatch(html, /Last observed starter/)

  const empty = renderToStaticMarkup(createElement(PlayerRankingCard, {
    team,
    players: [],
    currentLineup: directory.currentLineups[alphaId],
    loadState: { status: 'ready' },
    playerScopeLabel: '2026',
  }))
  assert.match(empty, /No ranked player data in 2026/)
})

test('completion times order sourced games when start times are unavailable', () => {
  const date = '2026-01-24'
  const early = match('completed-early', date, { gameCompletedAtUtc: `${date}T10:35:00Z` })
  const late = match('completed-late', date, { gameCompletedAtUtc: `${date}T12:35:00Z`, teamARoster: substitution(date) })
  const lineup = createPlayerDirectory(build([...history(), late, early])).currentLineups[alphaId]

  assert.equal(lineup?.starters.find((player) => player.role === 'Mid')?.playerId, 'reserve-Mid')
})

test('source game suffixes order substitutions even with equal differently formatted series timestamps', () => {
  const date = '2026-01-24'
  const early = match('ordered-game1', date, {
    sourceMatchId: undefined,
    bestOf: 3,
    datetimeUtc: `${date}T12:00:00Z`,
  })
  const late = match('ordered-game2', date, {
    sourceMatchId: undefined,
    bestOf: 3,
    datetimeUtc: `${date}T12:00:00.000Z`,
    teamARoster: substitution(date),
  })
  const lineup = createPlayerDirectory(build([...history(), late, early])).currentLineups[alphaId]

  assert.equal(lineup?.starters.find((player) => player.role === 'Mid')?.playerId, 'reserve-Mid')
})

test('unordered complementary partial rosters cannot form a five-role observed lineup', () => {
  const date = '2026-01-24'
  const first = roster('rookie', date)
  first.completeness = 'partial'
  first.players = first.players.slice(0, 3)
  const second = roster('rookie', date)
  second.completeness = 'partial'
  second.players = second.players.slice(3)
  const data = build([match('partial-a', date, { teamARoster: first }), match('partial-b', date, { teamARoster: second })])

  assert.equal(createPlayerDirectory(data).currentLineups[alphaId], undefined)
})
