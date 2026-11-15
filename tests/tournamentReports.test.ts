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
  reportAwards,
  resolveReportSelection,
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
  assert.ok(
    reportAwards(team.participants).best.every(
      (player) => !player.statsPower?.priorOnly,
    ),
  )
})

test('event-role scores disclose teams and award exact ties without prior-only or absent scores', () => {
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
  const candidates = structuredClone(players.slice(0, 3))
  for (const candidate of candidates)
    candidate.statsPower = {
      ...shared[0]!.statsPower!,
      role: candidate.role,
      priorOnly: false,
      sampleGames: 1,
      score: 103,
    }
  const excluded = structuredClone(candidates[0]!)
  excluded.key = 'prior'
  excluded.statsPower!.priorOnly = true
  excluded.statsPower!.sampleGames = 0
  excluded.statsPower!.score = 200
  assert.equal(reportAwards([...candidates, excluded]).best.length, 3)
  assert.equal(reportAwards([...candidates, excluded]).lowest.length, 3)
  assert.equal(reportAwards([{ ...excluded, statsPower: null }]).eligible, 0)
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

test('a team opens its best observed player and falls back when all scores lack evidence', () => {
  const report = parseTournamentReport(Object.values(build().shards)[0])
  const team = report.teams[0]!
  const best = reportAwards(team.participants).best[0]!
  team.participants = [
    ...team.participants.filter((player) => player.key !== best.key),
    best,
  ]
  const selection = resolveReportSelection(report, { team: team.id })
  assert.equal(selection.kind, 'ready')
  if (selection.kind === 'ready') assert.equal(selection.player?.key, best.key)
  for (const player of team.participants) player.statsPower = null
  const fallback = resolveReportSelection(report, { team: team.id })
  assert.equal(fallback.kind, 'ready')
  if (fallback.kind === 'ready')
    assert.equal(fallback.player?.key, team.participants[0]!.key)
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
  assert.equal(reportAwards(players).eligible, 0)
  const missing = players.find((player) => player.playerId === 'a-2')!
  assert.equal(missing.games[0]!.metrics.goldDiffAt15, null)
  assert.deepEqual(missing.performance.metrics.goldDiffAt15, {
    value: null,
    games: 0,
    missing: 1,
  })
})
