import assert from 'node:assert/strict'
import test from 'node:test'
import { neutralWinProbability } from '../src/domains/rankings/internal/queries/winProbability.ts'
import { effectiveLeagueRating } from '../src/domains/rankings/internal/policy/leagueTiers.ts'
import { powerRating } from '../src/domains/rankings/internal/replay/ratingCalculations.ts'
import { rosterContinuityDate, seedRosterContinuityContext } from './seriesPassFixtures.ts'

test('series result expectations retain frozen strength across roster changes and repeated same-day teams', () => {
  const { capture } = rosterContinuityDate()
  const [changed, rematch, secondChange, unknown, unchanged] = capture.expected.series
  const alpha = capture.frame.teams.findIndex(({ team }) => team === 'Alpha')
  const beta = capture.frame.teams.findIndex(({ team }) => team === 'Beta')
  assert.deepEqual(capture.frame.series[0].teams, [alpha, beta])
  assert.deepEqual(capture.frame.series[0].members.at(-1)!.sides.map(({ team }) => team), [beta, alpha])
  assert.equal(changed.continuity[1].rosterContinuity, 0.78)
  assert.equal(changed.continuity[0].rosterContinuity, 0)
  assert.deepEqual(changed.input.uncertainty, [100, 100])
  assert.equal(changed.continuity[0].uncertainty, 140)
  assert.equal(changed.continuity[1].uncertainty, 108.8)
  assert.deepEqual(changed.input.currentPowerRating, [1860.4, 1390])
  assert.deepEqual(rematch.input.currentPowerRating, changed.input.currentPowerRating)
  const retainedTwice = 1500 + 0.55 * (1860.4 - 1500)
  for (const series of [secondChange, unknown, unchanged]) {
    assert.deepEqual(series.input.currentPowerRating, [retainedTwice, 1500])
  }
  const expected = neutralWinProbability(
    { team: 'Alpha', rating: 1860.4, uncertainty: 100 },
    { team: 'Beta', rating: 1390, uncertainty: 100 }, 3,
  )
  assert.equal(changed.result.expectedOutcomeA, expected.teamAExpectedSeriesPoints)
  assert.equal(changed.result.seriesResidualA, 1 - expected.teamAExpectedSeriesPoints)
  assert.notEqual(changed.result.expectedOutcomeA, neutralWinProbability(
    { team: 'Alpha', rating: 1900, uncertainty: 100 },
    { team: 'Beta', rating: 1300, uncertainty: 100 }, 3,
  ).teamAExpectedSeriesPoints)
  assert.equal(capture.frame.teams[alpha].rating, 1900)
  assert.equal(rematch.members[0].sides[0].snapshotRating, 1900)
})

test('same-day results cannot enter later result expectations or prior-date predictions', () => {
  const won = rosterContinuityDate('Alpha')
  const lost = rosterContinuityDate('Beta')
  assert.notDeepEqual(won.capture.expected.series[1].continuity, lost.capture.expected.series[1].continuity)
  assert.deepEqual(won.capture.expected.series.map(({ input: { currentPowerRating, uncertainty, rosterContinuity } }) =>
    [currentPowerRating, uncertainty, rosterContinuity]), lost.capture.expected.series.map(({ input: { currentPowerRating, uncertainty, rosterContinuity } }) =>
    [currentPowerRating, uncertainty, rosterContinuity]))
  assert.deepEqual(won.state.predictions.map(({ teamARating, teamBRating, teamAGameWinProbability }) =>
    [teamARating, teamBRating, teamAGameWinProbability]), lost.state.predictions.map(({ teamARating, teamBRating, teamAGameWinProbability }) =>
    [teamARating, teamBRating, teamAGameWinProbability]))
  for (const prediction of won.state.predictions) {
    assert.equal(prediction.teamARating, prediction.teamA === 'Alpha' ? 1900 : 1300)
    assert.equal(prediction.teamBRating, prediction.teamB === 'Alpha' ? 1900 : prediction.teamB === 'Beta' ? 1300 : 1500)
  }
})

test('unchanged complete rosters preserve result expectations and ignore stale continuity', () => {
  const { capture } = rosterContinuityDate('Alpha', true)
  for (const [index, series] of capture.expected.series.entries()) {
    assert.deepEqual(series.input.currentPowerRating, [1900, index < 2 ? 1300 : 1500])
  }
  assert.deepEqual(capture.expected.series[0].input.rosterContinuity, [1, 1])
})

test('retained result ratings keep the frozen league, roster prior and momentum context', () => {
  const { capture } = rosterContinuityDate('Alpha', false, seedRosterContinuityContext)
  const [changed, rematch, secondChange, unknown, unchanged] = capture.expected.series
  const league = effectiveLeagueRating('LCK', 1600, 20)
  assert.notEqual(league, 1500)
  assert.deepEqual(changed.input.currentPowerRating, [powerRating(1860.4, league) + 17, powerRating(1390, league) - 8])
  assert.deepEqual(rematch.input.currentPowerRating, changed.input.currentPowerRating)
  const retainedTwice = 1500 + 0.55 * (1860.4 - 1500)
  const laterPower = [powerRating(retainedTwice, league) + 17, powerRating(1500, league) + 3]
  assert.deepEqual(secondChange.input.currentPowerRating, laterPower)
  assert.deepEqual(unknown.input.currentPowerRating, [laterPower[0] + 13, laterPower[1]])
  assert.deepEqual(unchanged.input.currentPowerRating, laterPower)
})
