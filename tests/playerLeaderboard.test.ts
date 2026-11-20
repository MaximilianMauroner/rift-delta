import assert from 'node:assert/strict'
import test from 'node:test'
import { initialModeFromLocation, showsManifestErrorInAppShell } from '../src/browser/bootstrap.ts'
import { hashForModeAndScope } from '../src/browser/navigation.ts'
import { playerLeaderboardForScope, playerLeaderboardScore, resolvePlayerScope } from '../src/domains/rankings/read.ts'
import type { CompactPlayer, PlayerStatsPower, PublicPlayerDirectory, SnapshotFilter } from '../src/domains/rankings/types.ts'

const all: SnapshotFilter = { season: 'All', event: 'All', region: 'All' }
const season: SnapshotFilter = { ...all, season: '2026' }

function player(id: string, rating: number, rank: number, team = 'Fixture Team'): CompactPlayer {
  return { id, name: id, team, role: 'Mid', rating, rank, games: 30, delta: 0, impactMultiplier: 1 }
}

function statsPower(score: number): PlayerStatsPower {
  const evidence = { observed: 24, missing: 6, effectiveGames: 22.5 }
  return {
    version: 'stats-power-v3', score, role: 'Mid', sampleGames: 24, eligibleGames: 30, priorOnly: false, leagueAnchor: 100,
    evidenceThrough: '2026-10-01', metrics: { goldDiffAt15: evidence, xpDiffAt15: evidence, csDiffAt15: evidence },
  }
}

function directory(): PublicPlayerDirectory {
  return {
    artifactKind: 'player-directory', generatedAt: '2026-10-27T00:00:00Z', modelVersion: 'synthetic-fixture',
    modelConfigHash: 'synthetic-fixture', sourceProvider: 'synthetic-fixture',
    metric: { id: 'role-power', label: 'Fixture score', shortLabel: 'Score', description: 'Synthetic test score', interpretation: 'Higher first', teamResultSignal: 'included', independentSkillClaim: false },
    ratedPlayerCount: 1, ratedTeamCount: 1, roles: ['Mid'], currentLineups: {},
    players: [player('Previous season only', 900, 1, 'Legacy Team')],
    scopedPlayers: {
      '2026__All__All': [player('Third', 100, 3), player('First', 300, 1), player('Second', 200, 2)],
      '2025__All__All': [player('Previous season only', 900, 1, 'Legacy Team')],
    },
  }
}

function priorOnly(anchor: number): PlayerStatsPower {
  return { ...statsPower(anchor), sampleGames: 0, priorOnly: true, leagueAnchor: anchor }
}

function standings(rows: ReturnType<typeof playerLeaderboardForScope>['rows']) {
  return rows.map((row) => [row.id, row.leaderboardRank, row.leaderboardScore])
}

test('player leaderboard reads only the selected source scope and ranks an all-legacy scope by Role Power', () => {
  const data = directory()
  const before = structuredClone(data)
  const { scoreFamily, rows } = playerLeaderboardForScope(data, season)
  assert.equal(scoreFamily, 'role-power')
  assert.deepEqual(rows.map(({ id, rating, rank, games, leaderboardRank }) => ({ id, rating, rank, games, leaderboardRank })), [
    { id: 'First', rating: 300, rank: 1, games: 30, leaderboardRank: 1 },
    { id: 'Second', rating: 200, rank: 2, games: 30, leaderboardRank: 2 },
    { id: 'Third', rating: 100, rank: 3, games: 30, leaderboardRank: 3 },
  ])
  assert.deepEqual(data, before, 'Reading a leaderboard must preserve stored rows and their history')
  assert.deepEqual(playerLeaderboardForScope(data, all).rows.map((row) => row.id), ['Previous season only'])
})

test('missing and explicitly empty exact scopes never borrow season or all-season rows', () => {
  const data = directory()
  const empty = { scoreFamily: 'role-power', rows: [] }
  assert.deepEqual(playerLeaderboardForScope(undefined, season), empty)
  assert.deepEqual(playerLeaderboardForScope(data, { ...season, season: '2024' }), empty)
  assert.deepEqual(playerLeaderboardForScope(data, { ...season, checkpoint: 'split-2' }), empty)
  assert.deepEqual(playerLeaderboardForScope(data, { ...season, event: 'Synthetic event' }), empty)
  assert.deepEqual(playerLeaderboardForScope(data, { ...all, region: 'LCK' }), empty)
  data.scopedPlayers!['2026__All__All'] = []
  assert.deepEqual(playerLeaderboardForScope(data, season), empty)
})

test('team drawers keep their real fallback while the leaderboard stays exact', () => {
  const data = directory()
  assert.deepEqual(resolvePlayerScope(data, season).players.map((row) => row.id), [
    'Third', 'First', 'Second', 'Previous season only',
  ])
  assert.match(resolvePlayerScope(data, season).label, /all-season sources/)
})

test('equal Role Power shares a competition rank and keeps stored rank and stable identity order', () => {
  const data = directory()
  data.scopedPlayers!['2026__All__All'] = [player('B', 100, 2), player('D', 90, 4), player('C', 100, 1), player('A', 100, 2)]
  assert.deepEqual(playerLeaderboardForScope(data, season).rows.map((row) => [row.id, row.rank, row.leaderboardRank]), [
    ['C', 1, 1], ['A', 2, 1], ['B', 2, 1], ['D', 4, 4],
  ])
})

test('role rankings also work in a Role Power-only scope', () => {
  const data = directory()
  data.scopedPlayers!['2026__All__All'] = [
    player('Mid', 300, 1),
    { ...player('Support first', 200, 2), role: 'Support' },
    { ...player('Support second', 100, 3), role: 'Support' },
  ]
  const board = playerLeaderboardForScope(data, season, 'Support')
  assert.equal(board.scoreFamily, 'role-power')
  assert.deepEqual(board.rows.map((row) => [row.id, row.leaderboardRank]), [['Support first', 1], ['Support second', 2]])
})

test('a mixed scope ranks only observed Stats Power and lists Role Power-only and prior-only rows as unranked', () => {
  const data = directory()
  data.scopedPlayers!['2026__All__All'] = [
    { ...player('Ash', 300, 1), statsPower: statsPower(101.25) },
    { ...player('Birch', 200, 2), statsPower: statsPower(104.5) },
    { ...player('Cypress', 100, 3), statsPower: statsPower(104.5) },
    player('Dune', 5000, 4),
    { ...player('Elm', 10, 5), statsPower: statsPower(104.5 + 1e-12) },
    { ...player('Fir', 4000, 0), statsPower: priorOnly(120) },
  ]
  const before = structuredClone(data)
  const { scoreFamily, rows } = playerLeaderboardForScope(data, season)
  assert.equal(scoreFamily, 'stats-power')
  assert.deepEqual(standings(rows), [
    ['Elm', 1, { status: 'ranked', value: 104.5 + 1e-12 }],
    ['Birch', 2, { status: 'ranked', value: 104.5 }],
    ['Cypress', 2, { status: 'ranked', value: 104.5 }],
    ['Ash', 4, { status: 'ranked', value: 101.25 }],
    ['Fir', null, { status: 'unranked', reason: 'no-stat-games' }],
    ['Dune', null, { status: 'unranked', reason: 'no-score' }],
  ], 'A high Role Power or a league-anchor score must not enter the Stats Power ranking')
  assert.deepEqual(data, before, 'Selecting a score must not rewrite stored rows')
})

test('role rankings compare players within the role without changing the scope score family', () => {
  const data = directory()
  data.scopedPlayers!['2026__All__All'] = [
    { ...player('Mid first', 200, 1), statsPower: statsPower(105) },
    { ...player('Top', 200, 2), role: 'Top', statsPower: { ...statsPower(104.5), role: 'Top' } },
    { ...player('Mid tie B', 200, 4), statsPower: statsPower(104) },
    { ...player('Mid tie A', 200, 3), statsPower: statsPower(104) },
    { ...player('Mid fourth', 200, 5), statsPower: statsPower(101) },
    { ...player('Mid prior', 200, 6), statsPower: priorOnly(100) },
    { ...player('Support without stats', 999, 7), role: 'Support' },
  ]
  const before = structuredClone(data)
  const allRoles = playerLeaderboardForScope(data, season)
  const mids = playerLeaderboardForScope(data, season, 'Mid')
  assert.deepEqual(mids.rows.map((row) => [row.id, row.leaderboardRank]), [
    ['Mid first', 1], ['Mid tie A', 2], ['Mid tie B', 2], ['Mid fourth', 4], ['Mid prior', null],
  ])
  assert.deepEqual(mids.rows.map((row) => row.id), allRoles.rows.filter((row) => row.role === 'Mid').map((row) => row.id))
  assert.deepEqual(playerLeaderboardForScope(data, season, 'All'), allRoles)
  assert.deepEqual(standings(playerLeaderboardForScope(data, season, 'Support').rows), [
    ['Support without stats', null, { status: 'unranked', reason: 'no-score' }],
  ])
  assert.equal(playerLeaderboardForScope(data, season, 'Support').scoreFamily, 'stats-power')
  assert.deepEqual(playerLeaderboardForScope(data, season, 'Jungle'), { scoreFamily: 'stats-power', rows: [] })
  assert.deepEqual(data, before)
})

test('a scope with only prior-only Stats Power has no ranked rows and invents no rank', () => {
  const data = directory()
  data.scopedPlayers!['2026__All__All'] = [
    { ...player('Late', 300, 2), statsPower: priorOnly(100) },
    { ...player('Early', 200, 1), statsPower: priorOnly(100) },
  ]
  const { scoreFamily, rows } = playerLeaderboardForScope(data, season)
  assert.equal(scoreFamily, 'stats-power')
  assert.deepEqual(standings(rows), [
    ['Early', null, { status: 'unranked', reason: 'no-stat-games' }],
    ['Late', null, { status: 'unranked', reason: 'no-stat-games' }],
  ])
})

test('one player score reads only its scope family and rejects non-finite values', () => {
  assert.deepEqual(playerLeaderboardScore({ rating: 80, statsPower: { ...statsPower(120), score: Number.NaN } }, 'stats-power'), { status: 'unranked', reason: 'no-score' })
  assert.deepEqual(playerLeaderboardScore({ rating: 80, statsPower: statsPower(-3) }, 'stats-power'), { status: 'ranked', value: -3 })
  assert.deepEqual(playerLeaderboardScore({ rating: 80 }, 'stats-power'), { status: 'unranked', reason: 'no-score' })
  assert.deepEqual(playerLeaderboardScore({ rating: 80, statsPower: statsPower(120) }, 'role-power'), { status: 'ranked', value: 80 })
  assert.deepEqual(playerLeaderboardScore({ rating: Number.NaN }, 'role-power'), { status: 'unranked', reason: 'no-score' })
})

test('Players addresses select the Players shell and preserve its query when the scope changes', () => {
  assert.equal(initialModeFromLocation('#players?scope=season%3A2026&player=Cedar&role=Mid', '/'), 'players')
  assert.equal(initialModeFromLocation('', '/players'), 'players')
  assert.equal(initialModeFromLocation('#teams', '/'), 'rankings')
  assert.equal(showsManifestErrorInAppShell('players'), true)
  assert.equal(hashForModeAndScope('players', 'season:2025', 'players?scope=season%3A2026&player=Cedar&role=Mid'),
    '#players?scope=season%3A2025&player=Cedar&role=Mid')
})
