import assert from 'node:assert/strict'
import test from 'node:test'
import { neutralWinProbability } from '../src/domains/rankings/internal/queries/winProbability.ts'
import { rosterContinuityDate } from './seriesPassFixtures.ts'

test('series result expectations retain frozen strength across roster changes and repeated same-day teams', () => {
  const { capture } = rosterContinuityDate()
  const [changed, rematch, secondChange, unknown, unchanged] = capture.expected.series
  const alpha = capture.frame.teams.findIndex(({ team }) => team === 'Alpha')
  const beta = capture.frame.teams.findIndex(({ team }) => team === 'Beta')
  assert.deepEqual(capture.frame.series[0].teams, [alpha, beta])
  assert.deepEqual(capture.frame.series[0].members.at(-1)!.sides.map(({ team }) => team), [beta, alpha])
  assert.equal(changed.continuity[1].rosterContinuity, 0.78)
  assert.equal(changed.continuity[0].rosterContinuity, 0)
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
