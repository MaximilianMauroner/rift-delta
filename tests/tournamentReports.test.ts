import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTournamentReports,
  retainTournamentReportInput,
  tournamentReportFamily,
} from '../src/domains/rankings/build.ts'
import {
  parseTournamentReport,
  parseTournamentReportIndex,
  reportTeamMetricLeaders,
  reportRoleMetricRanks,
  resolveReportSelection,
  reportEventSummary,
  reportTeamFieldPositions,
  reportTeamGames,
} from '../src/domains/rankings/tournament-reports.ts'
import { createStaticRankingData } from '../src/domains/rankings/build.ts'
import { createPublicArtifactWritePlan } from '../src/domains/rankings/artifact-write.ts'
import {
  artifactReferences,
  assertReferenceClosure,
} from '../src/domains/rankings/internal/published/logicalReferences.mjs'
import { parsePublicRankingManifest } from '../src/domains/rankings/published-read.ts'
import { prepareSemanticArtifact } from '../scripts/public-artifact-storage.mjs'
import { playerBaselineForLeague } from '../src/domains/rankings/internal/policy/playerPolicy.ts'
import { wilsonRate } from '../src/domains/rankings/field-statistics.ts'
import type { MatchRecord } from '../src/domains/rankings/types.ts'
import { reportGame, reportTeams } from './tournamentReportFixtures.ts'

const buildInput = (matches = [reportGame()]) => ({
  observed: retainTournamentReportInput(matches, reportTeams),
  ratedMatches: matches,
  ratedTeams: reportTeams,
  dataMode: 'seeded-sample',
  modelVersion: 'fixture-model',
  modelConfigHash: 'fixture-config',
})
const build = (matches = [reportGame()]) =>
  buildTournamentReports(
    buildInput(matches),
    (path) => `/data/${path}?v=fixture`,
  )

test('reports use reconciled Worlds identities and exclude qualifiers, regional finals and other events', () => {
  const main = { ...reportGame(), sourceUrl: '' }
  const { index, shards } = build([
    main,
    {
      ...reportGame('qualifier'),
      phase: 'Regional qualifier',
      tier: 'qualifier',
    },
    {
      ...reportGame('regional'),
      event: 'LPL 2025 Regional Finals',
      phase: 'Regional Finals',
    },
    { ...reportGame('tagged-qualifier'), event: 'Worlds 2025 Qualifier' },
    { ...reportGame('msi'), event: 'MSI 2025' },
    { ...reportGame('regular'), event: 'LCK 2026', season: 2026 },
  ])
  assert.deepEqual(
    index.tournaments.map((event) => event.id),
    ['worlds:2025'],
  )
  assert.equal(index.tournaments[0]!.coverage.observedGames, 1)
  assert.equal(index.tournaments[0]!.coverage.officialCompletion, 'unknown')
  assert.equal(parseTournamentReportIndex(index).tournaments.length, 1)
  const report = parseTournamentReport(
    Object.values(shards)[0],
    index.tournaments[0],
  )
  assert.equal(report.method.scoreVersion, 'stats-power-v3')
  assert.equal(report.provenance.dataMode, 'seeded-sample')
  assert.deepEqual(report.provenance.files, ['synthetic-worlds-fixture.csv'])
  const player = report.teams[0]!.participants.find(
    (player) => player.role === 'Mid',
  )!
  assert.equal(player.games[0]!.sourceGameId, 'source-worlds-game-1')
  assert.equal(player.games[0]!.metrics.goldDiffAt15, 500)
  assert.equal(player.games[0]!.sourceUrl, null)
  assert.equal(Object.hasOwn(player.games[0]!, 'statsPower'), false)
  assert.equal(player.statsPower?.sampleGames, 1)
  assert.ok(player.statsPower && player.statsPower.score > 90)
})

test('source-observed teams and low-game substitutions and role changes remain visible with raw missingness', () => {
  const first = reportGame('one')
  const second = reportGame('two', '2025-10-16', -100)
  second.teamARoster!.players[2]!.id = 'substitute'
  second.teamARoster!.players[2]!.name = 'Substitute'
  delete second.teamARoster!.players[2]!.stats!.goldDiffAt15
  const third = reportGame('three', '2025-10-17', 100)
  third.teamARoster!.players[0]!.id = first.teamARoster!.players[2]!.id
  third.teamARoster!.players[2]!.id = 'substitute'
  const input = buildInput([first, second, third])
  input.ratedMatches = [first]
  const { shards } = buildTournamentReports(input, (path) => `/data/${path}`)
  const report = parseTournamentReport(Object.values(shards)[0])
  const team = report.teams.find((team) => team.name === 'Alpha')!
  assert.equal(team.participants.length, 7)
  assert.equal(
    team.participants.find(
      (player) => player.playerId === 'a-2' && player.role === 'Mid',
    )!.games.length,
    1,
  )
  assert.ok(
    team.participants.some(
      (player) => player.playerId === 'a-2' && player.role === 'Top',
    ),
  )
  const substitute = team.participants.find(
    (player) => player.playerId === 'substitute',
  )!
  assert.deepEqual(substitute.performance.metrics.goldDiffAt15, {
    value: 100,
    games: 1,
    missing: 1,
  })
  assert.equal(substitute.games[0]!.metrics.goldDiffAt15, null)
  assert.equal(report.coverage.observedGames, 3)
  assert.equal(report.coverage.ratedGames, 1)
  assert.equal(
    team.participants.find((player) => player.role === 'Top')!.statsPower
      ?.priorOnly,
    true,
  )
})

test('event-role records retain team stints and validate selection', () => {
  const first = reportGame('one')
  const second = reportGame('two', '2025-10-16')
  second.teamBRoster!.players[2]!.id = 'a-2'
  const report = parseTournamentReport(
    Object.values(build([first, second]).shards)[0],
  )
  const players = report.teams.flatMap((team) => team.participants)
  const shared = players.filter((player) => player.playerId === 'a-2')
  assert.equal(shared.length, 2)
  assert.ok(
    shared.every(
      (player) =>
        player.scoreTeamIds.length === 2 &&
        player.statsPower?.eligibleGames === 3,
    ),
  )
  assert.equal(
    resolveReportSelection(report, { player: shared[1]!.key }).kind,
    'ready',
  )
  assert.equal(
    resolveReportSelection(report, { team: 'unknown' }).kind,
    'missing-team',
  )
  assert.equal(
    resolveReportSelection(report, { player: '' }).kind,
    'missing-player',
  )
  assert.equal(
    resolveReportSelection(report, {
      team: shared[0]!.teamId,
      player: shared[1]!.key,
    }).kind,
    'conflicting-selection',
  )
})

test('role metric ranks combine team stints, handle ties and exclude missing or different-role players', () => {
  const report = parseTournamentReport(Object.values(build().shards)[0])
  const participants = report.teams.flatMap((team) => team.participants)
  const selected = structuredClone(participants.find((p) => p.role === 'Mid')!)
  const otherStint = structuredClone(selected)
  otherStint.teamId = 'another-team'
  otherStint.games[0]!.matchId = 'transfer-game'
  selected.games[0]!.metrics.goldDiffAt15 = 500
  otherStint.games[0]!.metrics.goldDiffAt15 = -100

  const tie = structuredClone(selected)
  tie.playerId = 'tie'
  tie.games[0]!.metrics.goldDiffAt15 = 200
  const leader = structuredClone(selected)
  leader.playerId = 'leader'
  leader.games[0]!.metrics.goldDiffAt15 = 300
  const missing = structuredClone(selected)
  missing.playerId = 'missing'
  missing.games[0]!.metrics.goldDiffAt15 = null
  const otherRole = structuredClone(selected)
  otherRole.playerId = 'top'
  otherRole.role = 'Top'
  otherRole.games[0]!.metrics.goldDiffAt15 = 9000
  selected.games[0]!.metrics.killParticipation = 0.6
  otherStint.games[0]!.metrics.killParticipation = null
  tie.games[0]!.metrics.killParticipation = 0.6
  leader.games[0]!.metrics.killParticipation = 0.9
  missing.games[0]!.metrics.killParticipation = 0.8
  const field = [selected, otherStint, tie, leader, missing, otherRole]

  assert.deepEqual(reportRoleMetricRanks(field, selected).goldDiffAt15, {
    value: 200,
    games: 2,
    missing: 0,
    rank: 2,
    players: 3,
  })
  assert.equal(reportRoleMetricRanks(field, tie).goldDiffAt15.rank, 2)
  assert.deepEqual(reportRoleMetricRanks(field, selected).killParticipation, {
    value: 0.6,
    games: 1,
    missing: 1,
    rank: 3,
    players: 4,
  })
  assert.deepEqual(reportRoleMetricRanks(field, missing).goldDiffAt15, {
    value: null,
    games: 0,
    missing: 1,
    rank: null,
    players: 3,
  })
  assert.deepEqual(
    reportRoleMetricRanks(field, otherStint).goldDiffAt15,
    reportRoleMetricRanks(field, selected).goldDiffAt15,
  )
})

test('team stat leaders use full precision, preserve ties and exclude missing values', () => {
  const report = parseTournamentReport(Object.values(build().shards)[0])
  const players = structuredClone(report.teams[0]!.participants.slice(0, 4))
  for (const player of players) player.games[0]!.metrics.goldDiffAt15 = null
  players[0]!.games[0]!.metrics.goldDiffAt15 = 0
  players[1]!.games[0]!.metrics.goldDiffAt15 = -0.001
  players[2]!.games[0]!.metrics.goldDiffAt15 = 0
  assert.deepEqual(
    reportTeamMetricLeaders(players, 'goldDiffAt15').map(({ player, value }) => [player.key, value]),
    [[players[0]!.key, 0], [players[2]!.key, 0]],
  )
  assert.deepEqual(reportTeamMetricLeaders(players, 'xpDiffAt15'), [])
})

test('a team opens its first player regardless of score', () => {
  const report = parseTournamentReport(Object.values(build().shards)[0])
  const team = report.teams[0]!
  const scored = team.participants.find(
    (player) => player.statsPower && !player.statsPower.priorOnly,
  )!
  assert.ok(scored)
  const first = team.participants.find((player) => player.key !== scored.key)!
  team.participants = [
    first,
    ...team.participants.filter((player) => player.key !== first.key),
  ]
  const selection = resolveReportSelection(report, { team: team.id })
  assert.equal(selection.kind, 'ready')
  if (selection.kind === 'ready')
    assert.equal(selection.player?.key, first.key)
})

test('league anchors stop at the event boundary and later games cannot alter an archived report', () => {
  const matches = [reportGame('one'), reportGame('two', '2025-10-16', -300)]
  const original = buildInput(matches)
  const future = {
    ...reportGame('future', '2026-11-01'),
    event: 'MSI 2026',
    teamBHomeLeague: 'LPL',
  }
  assert.deepEqual(
    buildTournamentReports(original, (path) => `/data/${path}`),
    buildTournamentReports(
      { ...original, ratedMatches: [...matches, future] },
      (path) => `/data/${path}`,
    ),
  )
})

test('the optional report family uses schema24 closure and semantic URLs while legacy manifests remain readable', () => {
  const matches = [reportGame()]
  const data = createStaticRankingData({
    matches,
    teams: reportTeams,
    rosters: {},
    source: 'Synthetic fixture',
    dataMode: 'seeded-sample',
    generatedAt: '2025-11-10T00:00:00.000Z',
  })
  const input = {
    ...buildInput(matches),
    modelVersion: data.model.version,
    modelConfigHash: data.model.configHash,
  }
  const legacy = createPublicArtifactWritePlan(data)
  assert.equal(
    parsePublicRankingManifest(legacy.manifest).tournamentReportIndexUrl,
    undefined,
  )
  const plan = createPublicArtifactWritePlan(data, {
    families: [tournamentReportFamily(input)],
  })
  assert.equal(plan.manifest.schemaVersion, 24)
  assert.ok(plan.manifest.tournamentReportIndexUrl)
  assert.equal(
    parsePublicRankingManifest(plan.manifest).tournamentReportIndexUrl,
    plan.manifest.tournamentReportIndexUrl,
  )
  const entries = plan.writes.map(
    (write) =>
      [
        `/data/${write.relativePath}`,
        artifactReferences(write.value as Record<string, unknown>),
      ] as [string, string[]],
  )
  assertReferenceClosure(
    new Map(entries),
    new Set(entries.map(([path]) => path)),
  )
  assert.throws(
    () =>
      assertReferenceClosure(
        new Map(entries),
        new Set(
          entries
            .map(([path]) => path)
            .filter((path) => !path.endsWith('/worlds-2025.json')),
        ),
      ),
    /Incomplete/,
  )
  const index = plan.writes.find(
    (write) => write.relativePath === 'tournament-reports/index.json',
  )!
  assert.ok(
    JSON.stringify(prepareSemanticArtifact(index.value).semantic).includes(
      '/data/tournament-reports/events/worlds-2025.json',
    ),
  )
  assert.throws(() =>
    parsePublicRankingManifest({
      ...plan.manifest,
      tournamentReportIndexUrl: '/data/elsewhere/index.json',
    }),
  )
  const invalid = structuredClone(Object.values(build(matches).shards)[0]!)
  invalid.teams[0]!.participants[0]!.performance.metrics.goldDiffAt15.missing++
  assert.throws(() => parseTournamentReport(invalid), /metric coverage/)
})

test('Worlds scores keep historical LTA N and LTA S home-league priors', () => {
  const game = {
    ...reportGame(),
    teamAHomeLeague: 'LTA N',
    teamBHomeLeague: 'LTA S',
  }
  const input = { ...buildInput([game]), ratedMatches: [] }
  const report = parseTournamentReport(
    Object.values(
      buildTournamentReports(input, (path) => `/data/${path}`).shards,
    )[0],
  )
  const anchor = (name: string) =>
    report.teams
      .find((team) => team.name === name)!
      .participants.find((player) => player.role === 'Top')!.statsPower!
      .leagueAnchor
  assert.equal(anchor('Alpha'), playerBaselineForLeague('LTA N', new Map()))
  assert.equal(anchor('Beta'), playerBaselineForLeague('LTA S', new Map()))
  assert.notEqual(anchor('Alpha'), anchor('Beta'))
})

test('incomplete roster evidence stays observable without a fabricated score or award', () => {
  const game = reportGame('partial')
  game.teamARoster!.completeness = 'partial'
  delete game.teamARoster!.players[2]!.stats
  const report = parseTournamentReport(Object.values(build([game]).shards)[0])
  const players = report.teams.flatMap((team) => team.participants)
  assert.equal(report.coverage.observedGames, 1)
  assert.equal(report.coverage.participants, 10)
  assert.equal(report.coverage.scoredParticipants, 0)
  assert.ok(players.every((player) => player.statsPower === null))
  const missing = players.find((player) => player.playerId === 'a-2')!
  assert.equal(missing.games[0]!.metrics.goldDiffAt15, null)
  assert.deepEqual(missing.performance.metrics.goldDiffAt15, {
    value: null,
    games: 0,
    missing: 1,
  })
})

test('reports record each game and summarize sides, comebacks and gold swings', () => {
  const comeback = {
    ...reportGame('comeback', '2025-10-15', -1200),
    teamAGold: 70_000,
    teamBGold: 64_000,
    teamAKills: 18,
    teamBKills: 9,
    teamATowers: 9,
    teamBTowers: 3,
    teamADragons: 3,
    teamBDragons: 2,
    teamABarons: 1,
    teamBBarons: 0,
    gameLengthSeconds: 1980,
  }
  const lead = {
    ...reportGame('lead', '2025-10-16', 800),
    teamASide: 'red' as const,
    teamBSide: 'blue' as const,
    winner: 'Beta',
    gameLengthSeconds: 1500,
  }
  const { index, shards } = build([comeback, lead])
  const report = parseTournamentReport(
    Object.values(shards)[0],
    index.tournaments[0],
  )
  const alpha = report.teams.find((team) => team.name === 'Alpha')!.id
  const beta = report.teams.find((team) => team.name === 'Beta')!.id
  assert.deepEqual(report.games![0], {
    matchId: 'comeback',
    date: '2025-10-15',
    gameNumber: null,
    phase: 'Swiss',
    patch: null,
    lengthSeconds: 1980,
    winnerId: alpha,
    sides: [
      {
        teamId: alpha, side: 'blue', kills: 18, gold: 70_000, towers: 9, dragons: 3, barons: 1,
        champions: ['a-Top', 'a-Jungle', 'Pick', 'a-Bot', 'a-Support'],
      },
      {
        teamId: beta, side: 'red', kills: 9, gold: 64_000, towers: 3, dragons: 2, barons: 0,
        champions: ['b-Top', 'b-Jungle', 'Foe', 'b-Bot', 'b-Support'],
      },
    ],
  })
  assert.equal(report.games![1]!.sides[0].side, 'red')

  const summary = reportEventSummary(report)
  assert.equal(summary.games, 2)
  assert.deepEqual(
    [summary.blueSide.successes, summary.blueSide.trials],
    [2, 2],
    'Alpha won on blue and Beta won on blue',
  )
  assert.deepEqual(
    [summary.leaderAt15.successes, summary.leaderAt15.trials],
    [0, 2],
    'Both gold leaders at 15 lost',
  )
  assert.equal(summary.minutes.mean, 29)
  assert.equal(summary.comebacks.length, 2)
  assert.deepEqual(
    summary.comebacks.map((row) => [row.matchId, row.teamId, row.goldDiffAt15]),
    [['comeback', alpha, -1200], ['lead', beta, -800]],
  )
  assert.deepEqual(
    summary.swings.map((row) => [row.matchId, row.teamId, row.goldSwing]),
    [['comeback', alpha, 7200], ['lead', beta, 800]],
  )
  assert.equal(summary.champions.find((entry) => entry.champion === 'Pick')?.picks, 2)
})

test('result-only games keep picks but leave gold and kills unavailable', () => {
  const resultOnly = {
    ...reportGame('result-only', '2025-10-16'),
    dataCompleteness: 'match-result-only',
    teamARoster: undefined,
    teamBRoster: undefined,
    teamAKills: 0,
    teamBKills: 0,
    teamAGold: 0,
    teamBGold: 0,
    teamAPicks: ['Ksante', 'Vi', 'Azir', 'Varus', 'Rell'],
    teamBPicks: ['Rumble', 'Xin Zhao', 'Taliyah', 'Ezreal', null],
  } satisfies MatchRecord
  const { index, shards } = build([reportGame(), resultOnly])
  const report = parseTournamentReport(Object.values(shards)[0], index.tournaments[0])
  const alpha = report.teams.find((team) => team.name === 'Alpha')!.id
  const game = report.games!.find((entry) => entry.matchId === 'result-only')!
  assert.deepEqual(
    game.sides.map((side) => [side.gold, side.kills, side.champions.length]),
    [[null, null, 5], [null, null, 4]],
  )
  const row = reportTeamGames(report).find((entry) => entry.matchId === 'result-only' && entry.teamId === alpha)!
  assert.equal(row.goldDiff, null)
  assert.equal(row.kills, null)
  assert.deepEqual(
    reportEventSummary(report).champions.find((entry) => entry.champion === 'Azir')?.picks,
    1,
  )
})

test('rates use Wilson intervals and empty samples stay unavailable', () => {
  const rate = wilsonRate(19, 34)
  assert.ok(Math.abs(rate.interval!.low - 0.3945) < 0.0005)
  assert.ok(Math.abs(rate.interval!.high - 0.7112) < 0.0005)
  assert.deepEqual(wilsonRate(0, 0), { successes: 0, trials: 0, value: null, interval: null })
})

test('field positions use z-scores and percentiles and skip teams with too few games', () => {
  const teams = {
    ...reportTeams,
    Gamma: { name: 'Gamma', code: 'GAM', region: 'LCK' as const, league: 'LCK' },
    Delta: { name: 'Delta', code: 'DEL', region: 'LCK' as const, league: 'LCK' },
  }
  const game = (id: string, a: string, b: string, aWins: boolean, day: number) => ({
    ...reportGame(id, `2025-10-${String(day).padStart(2, '0')}`),
    teamA: a,
    teamB: b,
    winner: aWins ? a : b,
  })
  const matches = [
    game('ab1', 'Alpha', 'Beta', true, 10),
    game('ab2', 'Alpha', 'Beta', true, 11),
    game('ab3', 'Alpha', 'Beta', true, 12),
    game('ag1', 'Alpha', 'Gamma', false, 13),
    game('bg1', 'Beta', 'Gamma', false, 14),
    game('bg2', 'Beta', 'Gamma', false, 15),
    game('ad1', 'Alpha', 'Delta', true, 16),
  ]
  const { index, shards } = buildTournamentReports(
    {
      observed: retainTournamentReportInput(matches, teams),
      ratedMatches: matches,
      ratedTeams: teams,
      dataMode: 'seeded-sample',
      modelVersion: 'fixture-model',
      modelConfigHash: 'fixture-config',
    },
    (path) => `/data/${path}`,
  )
  const report = parseTournamentReport(Object.values(shards)[0], index.tournaments[0])
  const id = (name: string) => report.teams.find((team) => team.name === name)!.id
  const winRate = (name: string) =>
    reportTeamFieldPositions(report, id(name)).find((entry) => entry.metric === 'winRate')!

  const alpha = winRate('Alpha')
  assert.equal(alpha.value, 0.8, 'Alpha won 4 of 5')
  assert.deepEqual(
    alpha.field.map((entry) => entry.id).sort(),
    [id('Alpha'), id('Beta'), id('Gamma')].sort(),
    'Delta has one game and stays out of the field',
  )
  const field = [0.8, 0, 1]
  const mean = field.reduce((sum, value) => sum + value, 0) / 3
  const sd = Math.sqrt(field.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 3)
  assert.ok(Math.abs(alpha.z! - (0.8 - mean) / sd) < 1e-9)
  assert.equal(alpha.percentile, 50, 'Alpha is above Beta and below Gamma')
  assert.equal(alpha.band, 'Typical', 'z is 0.46, inside half a standard deviation')
  const delta = winRate('Delta')
  assert.equal(delta.value, 0)
  assert.equal(delta.n, 1)
  assert.equal(delta.z, null)
  assert.equal(delta.percentile, null)
})

test('version 1 reports stay readable without game records and version 2 requires them', () => {
  const { index, shards } = build()
  const current = Object.values(shards)[0]!
  const withoutGames: Record<string, unknown> = { ...current }
  delete withoutGames.games
  assert.equal(
    parseTournamentReport({ ...withoutGames, version: 1 }, index.tournaments[0]).games,
    null,
  )
  assert.throws(() => parseTournamentReport({ ...withoutGames, version: 2 }))
  assert.throws(() => parseTournamentReport({ ...current, version: 1 }))
  assert.throws(() =>
    parseTournamentReport({
      ...current,
      games: current.games!.map((game) => ({ ...game, winnerId: 'team:unknown' })),
    }),
  )
})
