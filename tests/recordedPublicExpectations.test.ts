import assert from 'node:assert/strict'
import test from 'node:test'
import { createRatingReplayContext, materializeRankingModel, replayRatingDates } from '../src/domains/rankings/internal/replay/model.ts'
import { createMatchHistoryArtifacts, createStaticRankingData, createStaticRankingSummaryData, createTeamHistory, snapshotKey, teamStandingKey } from '../src/domains/rankings/internal/projections/snapshot.ts'
import type { PregamePlayerRatingEdge } from '../src/domains/rankings/internal/players/playerModel.ts'
import { emitPregamePredictionsForDate, processRatingSeriesForDate } from '../src/lib/ratingSeriesEngine.ts'
import { game, profiles, roster } from './seriesPassFixtures.ts'

function replay(bestOf: 1 | 2 | 3 | 5, tie = false) {
  const prior = game('prior', { winner: 'Beta' })
  const games = Array.from({ length: bestOf === 2 ? 2 : Math.ceil(bestOf / 2) }, (_, index) => {
    const swapped = index % 2 === 0
    return game(`target-${index + 1}`, {
      sourceMatchId: 'target', bestOf, bestOfBasis: 'provider', gameNumber: index + 1,
      date: '2026-01-02', datetimeUtc: `2026-01-02T${12 + index}:00:00Z`,
      teamA: swapped ? 'Beta' : 'Alpha', teamB: swapped ? 'Alpha' : 'Beta',
      teamARoster: roster(swapped ? 'new-Beta' : 'new-Alpha'),
      teamBRoster: roster(swapped ? 'new-Alpha' : 'new-Beta'),
      winner: tie && index === 1 ? 'Beta' : 'Alpha',
    })
  })
  const matches = [prior, ...games]
  const context = createRatingReplayContext(matches, structuredClone(profiles))
  const state = replayRatingDates({ context, replayMatches: [prior] })
  state.ratings.set('Alpha', 1900)
  state.ratings.set('Beta', 1300)
  state.executionRatings.set('Alpha', 1900)
  state.executionRatings.set('Beta', 1300)
  state.uncertainties.set('Alpha', 100)
  state.uncertainties.set('Beta', 100)
  const edges = new Map<string, PregamePlayerRatingEdge>(games.map((match, index) => [match.id, {
    teamAAdjustment: index === 0 ? 80 : -120, teamBAdjustment: index === 0 ? -40 : 160,
    teamACoverage: 1, teamBCoverage: 1,
    teamAEvidenceBasis: 'prior-observed', teamBEvidenceBasis: 'prior-observed',
    teamAFreshnessWeight: 1, teamBFreshnessWeight: 1,
  }]))
  const input = { matches: games, teams: context.teams, state, sideAdjustments: new Map([['26.1', 80]]),
    lastDate: games[0].date, pregamePlayerRatingEdges: edges }
  emitPregamePredictionsForDate(input)
  processRatingSeriesForDate(input)
  const first = state.predictions.find((prediction) => prediction.id === games[0].id)!
  const model = materializeRankingModel({ context, state })
  return { state, first, model, context, matches }
}

function publish(fixture: ReturnType<typeof replay>) {
  return createStaticRankingData({
    matches: fixture.matches, teams: fixture.context.teams, rosters: {},
    generatedAt: '2026-01-03T00:00:00Z', precomputedGlobalRanking: fixture.model,
    materializeSnapshotKeys: new Set([snapshotKey({ season: 'All', event: 'All', region: 'All' })]),
    materializeTournamentIds: new Set(),
  })
}

for (const bestOf of [1, 2, 3, 5] as const) {
  test(`Bo${bestOf} public expectations keep the first recorded forecast in each team's orientation`, () => {
    const fixture = replay(bestOf)
    const { state, first } = fixture
    assert.equal(first.dataCutoff, '2026-01-01')
    assert.equal(first.teamA, 'Beta')
    assert.equal(first.bestOf, bestOf)
    const final = state.histories.get('Alpha')!.at(-1)!
    assert.notEqual(first.teamBSeriesWinProbability, Number((1 - final.ratingUpdate.neutralResultResidual!).toFixed(4)),
      'fixture must expose the difference between prior-date forecast and retained-roster result update')
    if (bestOf > 1) {
      const last = state.predictions.at(-1)!
      const lastAlpha = last.teamA === 'Alpha' ? last.teamASeriesWinProbability : last.teamBSeriesWinProbability
      assert.notEqual(first.teamBSeriesWinProbability, lastAlpha)
    }
    if (bestOf === 1) assert.equal(first.teamBSeriesWinProbability, first.teamBGameWinProbability)
    if (bestOf === 2) {
      assert.ok(Math.abs(first.teamBSeriesWinProbability - first.teamBGameWinProbability ** 2) < 0.0002)
      assert.notEqual(first.teamBSeriesWinProbability, first.teamBExpectedSeriesPoints)
      assert.ok(first.teamASeriesWinProbability + first.teamBSeriesWinProbability < 1)
    }
    if (bestOf === 3 || bestOf === 5) assert.ok(first.teamBSeriesWinProbability > first.teamBGameWinProbability)

    const data = publish(fixture)
    const snapshot = data.snapshots[data.defaultSnapshotKey]
    const summary = createStaticRankingSummaryData(data)
    const history = createTeamHistory(data)
    for (const [team, expected] of [['Alpha', first.teamBSeriesWinProbability], ['Beta', first.teamASeriesWinProbability]] as const) {
      const standing = snapshot.standings.find((standing) => standing.team === team)!
      const recent = summary.snapshots[data.defaultSnapshotKey].standings.find((standing) => standing.team === team)!.recentMatches.at(-1)!
      assert.equal(recent.expectedWinProbability, expected)
      assert.equal(standing.history.at(-1)!.recordedSeriesWinProbability, expected)
      assert.equal(history.series[teamStandingKey(standing)].points.at(-1)![3]!.model!.e, Math.round(expected * 1000) / 1000)
    }
    const entries = Object.values(createMatchHistoryArtifacts(data).pages[data.defaultSnapshotKey]).flatMap((page) => page.matches)
    const applied = entries.find((entry) => entry.date === '2026-01-02' && entry.impact.unit === 'series-applied')!
    assert.equal(applied.teamA.name, 'Alpha')
    assert.equal(applied.impact.expectedTeamA, Number(first.teamBSeriesWinProbability.toFixed(3)))
    assert.equal(snapshot.standings.find((standing) => standing.team === 'Alpha')!.rollingMovement!.biggestUpsetWin!.expectedWinProbability,
      first.teamBSeriesWinProbability)
    assert.equal('predictions' in summary.manifest, false)
    assert.equal(JSON.stringify(summary.manifest).includes('recordedSeriesWinProbability'), false)
  })
}

test('a tied Bo2 keeps recorded win probability without changing it to expected points', () => {
  const fixture = replay(2, true)
  const data = publish(fixture)
  const summary = createStaticRankingSummaryData(data)
  const alpha = summary.snapshots[data.defaultSnapshotKey].standings.find((standing) => standing.team === 'Alpha')!
  assert.equal(alpha.recentMatches.at(-1)!.result, 'T')
  assert.equal(alpha.recentMatches.at(-1)!.expectedWinProbability, fixture.first.teamBSeriesWinProbability)
  const standing = data.snapshots[data.defaultSnapshotKey].standings.find((standing) => standing.team === 'Alpha')!
  const point = createTeamHistory(data).series[teamStandingKey(standing)].points.at(-1)!
  assert.equal(point[3]!.model!.e, Math.round(fixture.first.teamBSeriesWinProbability * 1000) / 1000)
  const applied = Object.values(createMatchHistoryArtifacts(data).pages[data.defaultSnapshotKey]).flatMap((page) => page.matches)
    .find((entry) => entry.date === '2026-01-02' && entry.impact.unit === 'series-applied')!
  assert.equal(applied.impact.expectedTeamA, Number(fixture.first.teamBSeriesWinProbability.toFixed(3)))
  assert.equal(alpha.rollingMovement?.biggestUpsetWin, undefined)
})

test('old history omits all public probabilities even when result residuals remain', () => {
  const fixture = replay(3)
  for (const standing of fixture.model.standings) {
    for (const point of standing.history) delete point.recordedSeriesWinProbability
  }
  const data = publish(fixture)
  const summary = createStaticRankingSummaryData(data)
  const history = createTeamHistory(data)
  for (const standing of data.snapshots[data.defaultSnapshotKey].standings) {
    const publicStanding = summary.snapshots[data.defaultSnapshotKey].standings.find((row) => row.team === standing.team)!
    assert.ok(publicStanding.recentMatches.every((match) => !('expectedWinProbability' in match)))
    assert.equal(publicStanding.rollingMovement?.biggestUpsetWin, undefined)
    assert.ok(history.series[teamStandingKey(standing)].points.every((point) => point[3]?.model?.e === undefined))
  }
  const entries = Object.values(createMatchHistoryArtifacts(data).pages[data.defaultSnapshotKey]).flatMap((page) => page.matches)
  for (const entry of entries) assert.equal('expectedTeamA' in entry.impact, false)
})
