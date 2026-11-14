import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExactPregameProbabilityState } from '../src/domains/rankings/internal/projections/pregameForecastTypes.ts'
import type { PregamePlayerRatingEdge } from '../src/domains/rankings/internal/players/playerModel.ts'
import { playerRatingPredictionWeight } from '../src/domains/rankings/internal/policy/modelConfig.ts'
import { createRatingReplayContext, replayRatingDates } from '../src/domains/rankings/internal/replay/model.ts'
import type { MatchRecord } from '../src/domains/rankings/types.ts'
import { emitPregamePredictionsForDate, processRatingSeriesForDate } from '../src/lib/ratingSeriesEngine.ts'
import { game, profiles, roster } from './seriesPassFixtures.ts'

const target = game('forecast-target', {
  date: '2026-01-02', datetimeUtc: '2026-01-02T12:00:00Z', bestOf: 3,
  teamARoster: undefined, teamBRoster: undefined, teamASide: undefined, teamBSide: undefined,
})
const priorEdge: PregamePlayerRatingEdge = {
  teamAAdjustment: 80, teamBAdjustment: -40, teamACoverage: 1, teamBCoverage: 1,
  teamAEvidenceBasis: 'prior-observed', teamBEvidenceBasis: 'prior-observed',
  teamAFreshnessWeight: 1, teamBFreshnessWeight: 1,
}
const sideAdjustments = new Map([['26.1', 80]])

function priorState() {
  const history = [game('forecast-history')]
  const context = createRatingReplayContext(history, profiles)
  const state = replayRatingDates({ context, replayMatches: history })
  state.rosterPriorOffsets.set('Alpha', 36)
  state.rosterPriorOffsets.set('Beta', -12)
  return state
}

function forecast(match: MatchRecord, edge: PregamePlayerRatingEdge | undefined, state = priorState()) {
  const exactStates: ExactPregameProbabilityState[] = []
  emitPregamePredictionsForDate({
    matches: [match], teams: profiles, state, sideAdjustments,
    pregamePlayerRatingEdges: new Map(edge ? [[match.id, edge]] : []),
    onExactState: (exact) => exactStates.push(exact),
  })
  const prediction = state.predictions.at(-1)!
  return {
    prediction,
    probabilities: Object.fromEntries(Object.entries(prediction).filter(([key]) => key.includes('WinProbability'))),
    variants: prediction.variants,
    exactStates,
  }
}

test('target side swaps cannot change published, variant or exact pregame probabilities', () => {
  const neutral = forecast(target, priorEdge)
  for (const [teamASide, teamBSide] of [['blue', 'red'], ['red', 'blue']] as const) {
    const changed = forecast({ ...target, teamASide, teamBSide }, priorEdge)
    assert.deepEqual(changed.probabilities, neutral.probabilities)
    assert.deepEqual(changed.variants, neutral.variants)
    assert.deepEqual(changed.exactStates, neutral.exactStates)
    assert.equal(changed.prediction.teamASide, teamASide)
    assert.equal(changed.prediction.teamBSide, teamBSide)
    assert.equal(changed.prediction.teamASideAdjustment, 0)
    assert.equal(changed.prediction.teamBSideAdjustment, 0)
  }
})

test('target roster presence and players cannot select forecast priors with the same history', () => {
  const baseline = forecast(target, priorEdge)
  const targets = [
    { ...target, teamARoster: roster('Alpha') },
    { ...target, teamBRoster: roster('Beta') },
    { ...target, teamARoster: roster('Alpha'), teamBRoster: roster('Beta') },
    { ...target, teamARoster: roster('unseen-Alpha'), teamBRoster: roster('unseen-Beta', 'partial') },
    { ...target, teamARoster: { ...roster('empty'), players: [] } },
  ]
  for (const changedTarget of targets) {
    const changed = forecast(changedTarget, priorEdge)
    assert.deepEqual(changed.probabilities, baseline.probabilities)
    assert.deepEqual(changed.variants, baseline.variants)
    assert.deepEqual(changed.exactStates, baseline.exactStates)
  }
  const carried = priorState()
  carried.rosterPriorOffsets.set('Alpha', priorEdge.teamAAdjustment * playerRatingPredictionWeight)
  carried.rosterPriorOffsets.set('Beta', priorEdge.teamBAdjustment * playerRatingPredictionWeight)
  assert.deepEqual(baseline.exactStates, forecast(target, undefined, carried).exactStates)
})

test('a prior-observed zero edge overrides each carried roster offset', () => {
  const zeroEdge = { ...priorEdge, teamAAdjustment: 0, teamBAdjustment: 0 }
  const noCarry = priorState()
  noCarry.rosterPriorOffsets.set('Alpha', 0)
  noCarry.rosterPriorOffsets.set('Beta', 0)
  const expected = forecast(target, zeroEdge, noCarry)
  const actual = forecast(target, zeroEdge)
  assert.deepEqual(actual.probabilities, expected.probabilities)
  assert.deepEqual(actual.variants, expected.variants)
  assert.deepEqual(actual.exactStates, expected.exactStates)
  assert.notDeepEqual(actual.exactStates, forecast(target, undefined).exactStates)
})

test('missing prior evidence preserves carry even when the target has rosters', () => {
  const baseline = forecast(target, undefined)
  const withRosters = { ...target, teamARoster: roster('unseen-Alpha'), teamBRoster: roster('unseen-Beta') }
  const missing = forecast(withRosters, undefined)
  assert.deepEqual(missing.probabilities, baseline.probabilities)
  assert.deepEqual(missing.variants, baseline.variants)
  assert.deepEqual(missing.exactStates, baseline.exactStates)
  for (const basis of ['unavailable', 'pregame-confirmed'] as const) {
    const changed = forecast(withRosters, { ...priorEdge, teamAEvidenceBasis: basis, teamBEvidenceBasis: basis })
    assert.deepEqual(changed.exactStates, baseline.exactStates)
    assert.deepEqual(changed.variants.published, baseline.variants.published)
  }
  const noCarry = priorState()
  noCarry.rosterPriorOffsets.set('Alpha', 0)
  noCarry.rosterPriorOffsets.set('Beta', 0)
  assert.notDeepEqual(baseline.exactStates, forecast(target, undefined, noCarry).exactStates)
})

test('postgame updates retain observed side adjustments and side-aware execution learning', () => {
  const blue = priorState()
  const red = priorState()
  for (const [state, teamASide, teamBSide] of [[blue, 'blue', 'red'], [red, 'red', 'blue']] as const) {
    processRatingSeriesForDate({
      matches: [{ ...target, teamASide, teamBSide }], teams: profiles, state, sideAdjustments,
      lastDate: target.date, pregamePlayerRatingEdges: new Map(),
    })
  }
  assert.equal(blue.latestRatingUpdates.get('Alpha')!.sideAdjustment, 40)
  assert.equal(blue.latestRatingUpdates.get('Beta')!.sideAdjustment, -40)
  assert.equal(red.latestRatingUpdates.get('Alpha')!.sideAdjustment, -40)
  assert.equal(red.latestRatingUpdates.get('Beta')!.sideAdjustment, 40)
  assert.notEqual(blue.executionRatings.get('Alpha'), red.executionRatings.get('Alpha'))
  assert.notEqual(blue.executionRatings.get('Beta'), red.executionRatings.get('Beta'))
})
