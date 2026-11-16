import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTournamentReports, retainTournamentReportInput } from '../src/domains/rankings/build.ts'
import { reportHighlights } from '../src/domains/rankings/report-highlights.ts'
import { parseTournamentReport } from '../src/domains/rankings/tournament-reports.ts'
import { reportGame, reportTeams } from './tournamentReportFixtures.ts'

const reportOf = (seconds: number[], leads: number[] = seconds.map(() => 500)) => {
  const matches = seconds.map((length, index) => ({
    ...reportGame(`game-${index}`, `2025-10-${String(15 + index).padStart(2, '0')}`, leads[index]),
    gameLengthSeconds: length,
  }))
  const { shards } = buildTournamentReports(
    {
      observed: retainTournamentReportInput(matches, reportTeams),
      ratedMatches: matches,
      ratedTeams: reportTeams,
      dataMode: 'seeded-sample',
      modelVersion: 'fixture-model',
      modelConfigHash: 'fixture-config',
    },
    (path) => `/data/${path}`,
  )
  return parseTournamentReport(Object.values(shards)[0])
}

test('highlights report a record far from the usual value and skip records many games share', () => {
  const highlights = reportHighlights(reportOf([1800, 1860, 1800, 1860, 1800, 3000]))
  const longest = highlights.find((highlight) => highlight.measure === 'longestGame')
  assert.ok(longest, 'one 50 minute game among 30 minute games stands out')
  assert.equal(longest.value, 50)
  assert.equal(longest.mean, (30 * 3 + 31 * 2 + 50) / 6)
  assert.equal(longest.subject.kind, 'game')
  assert.equal(highlights[0]!.measure, 'longestGame', 'the most unusual record comes first')
  assert.ok(
    !highlights.some((highlight) => highlight.measure === 'shortestGame'),
    'three games share the 30 minute record, so it is not stand-out',
  )
  assert.ok(
    !highlights.some((highlight) => highlight.measure === 'bloodiestGame'),
    'every game has the same kills, so there is nothing to highlight',
  )
})

test('a report without game records has no highlights', () => {
  const report = reportOf([1800, 1860, 1800, 1860, 1800, 3000])
  assert.deepEqual(reportHighlights({ ...report, games: null }), [])
})

test('a comeback needs a win from behind, and a one-side record names that side', () => {
  const report = reportOf([1800, 1860, 1800, 1860, 1800, 3000], [100, 200, 300, 400, 500, 600])
  const games = report.games!
  games.forEach((game, index) => {
    game.sides[0].dragons = index === 5 ? 1 : 2
    game.sides[1].dragons = index === 5 ? 6 : 2
  })
  const highlights = reportHighlights(report)
  const dragons = highlights.find((highlight) => highlight.measure === 'mostDragons')
  assert.ok(dragons && dragons.subject.kind === 'game')
  assert.equal(dragons.value, 6)
  assert.equal(dragons.subject.holderId, games[5]!.sides[1].teamId, 'the losing side took the six dragons')
  assert.ok(
    !highlights.some((highlight) => highlight.measure === 'biggestComeback'),
    'every winner led at 15, so there is no comeback',
  )
})
