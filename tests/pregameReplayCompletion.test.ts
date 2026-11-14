import assert from 'node:assert/strict'
import test from 'node:test'
import { replayPregameSeriesState, replayPregameSeriesBatch, replaySimpleEloSeries, replaySimpleEloSeriesBatch } from '../src/domains/rankings/forecast.ts'
import type { AvailableRankingGame, PregameSeriesRequest } from '../src/domains/rankings/forecast.ts'
import { sampleMatches } from './fixtures/rankingFixtures.ts'

const cutoff = Date.parse('2026-02-10T10:00:00Z')
const request: PregameSeriesRequest = {
  seriesId: 'completion-series', eventId: 'completion-event', homeTeamId: 'gen', awayTeamId: 't1',
  homeSourceTeam: 'Gen.G', awaySourceTeam: 'T1', bestOf: 3, scheduleRevision: 'revision-1',
  scheduledStartAt: cutoff + 7200_000, scheduleObservedAt: cutoff - 1000, scheduleProvider: 'lolesports-schedule',
  asOf: cutoff, validUntil: cutoff + 7000_000, event: 'LCK 2026 Spring', patch: '26.1', season: 2026,
  league: 'LCK', region: 'LCK', tier: 'regional-regular',
}
const history: AvailableRankingGame[] = sampleMatches.slice(0, 2).map((match, index) => ({
  match: { ...match, id: `completed-${index}`, sourceProvider: 'oracles-elixir', sourceGameId: `completed-${index}`,
    gameCompletedAtUtc: `${match.date}T00:30:00Z` },
  observedAt: Date.parse(match.date) + 3600_000, resultAvailableAt: Date.parse(match.date) + 3600_000,
}))

for (const model of [
  { name: 'ranking', single: replayPregameSeriesState, batch: replayPregameSeriesBatch },
  { name: 'simple Elo', single: replaySimpleEloSeries, batch: replaySimpleEloSeriesBatch },
]) {
  test(`${model.name} verified replay excludes absent, invalid and future game completion`, () => {
    const baseline = model.single(history, request, 'verified')
    const unfinished = [undefined, 'invalid', new Date(cutoff + 1).toISOString()].map((gameCompletedAtUtc, index) => ({
      ...history[0], match: { ...history[0].match, id: `unfinished-${index}`, sourceGameId: `unfinished-${index}`,
        date: '2026-02-09', gameCompletedAtUtc, patch: '26.2', teamAKills: 90 },
      observedAt: cutoff - 500 + index, resultAvailableAt: cutoff - 1000,
    }))
    const inputs = [unfinished[0], ...history, ...unfinished.slice(1)]
    const batch = model.batch(inputs, [request, request], 'verified')
    assert.deepEqual([model.single(inputs, request, 'verified'), ...batch.results], [baseline, baseline, baseline])
    assert.equal(batch.replayCount, 1)
    assert.equal(batch.replayedGames, history.length)
    assert.deepEqual(model.batch(inputs.toReversed(), [request], 'verified').results, [baseline])
    assert.throws(() => model.single(unfinished, request, 'verified'), /No available|No completed causal/)
    assert.throws(() => model.batch(unfinished, [request], 'verified'), /No available|No completed causal/)
  })

  test(`${model.name} completion at the exact cutoff changes same-date batch history`, () => {
    const completedAt = cutoff + 1000
    const late: AvailableRankingGame = { match: { ...history[0].match, id: 'late-completion', sourceGameId: 'late-completion',
      date: '2026-02-09', winner: 'T1', gameCompletedAtUtc: new Date(completedAt).toISOString() },
      observedAt: cutoff - 500, resultAvailableAt: cutoff - 1000 }
    const targets = [{ ...request, asOf: completedAt }, request, { ...request, asOf: completedAt - 1 }]
    const inputs = [...history, late]
    const batch = model.batch(inputs, targets, 'verified')
    assert.deepEqual(batch.results, targets.map(target => model.single(inputs, target, 'verified')))
    assert.deepEqual(batch.results[1], model.single(history, request, 'verified'))
    assert.deepEqual(batch.results.map(row => row.usedGameIds), [
      ['completed-0', 'completed-1', 'late-completion'], ['completed-0', 'completed-1'], ['completed-0', 'completed-1'],
    ])
    assert.notDeepEqual(batch.results[0].state, batch.results[1].state)
    assert.equal(batch.replayCount, 2)
    assert.equal(batch.replayedGames, 5)
    for (const unavailable of [
      { ...late, observedAt: completedAt + 1 },
      { ...late, observedAt: completedAt + 1, resultAvailableAt: completedAt + 1 },
      { ...late, resultAvailableAt: null },
      { ...late, match: { ...late.match, date: '2026-02-10' } },
    ]) assert.deepEqual(model.single([...history, unavailable], targets[0], 'verified'), model.single(history, targets[0], 'verified'))
  })

  test(`${model.name} historical-limited replay keeps its existing clock and availability semantics`, () => {
    for (const gameCompletedAtUtc of [undefined, 'invalid', new Date(cutoff + 86400_000).toISOString()]) {
      const inputs = history.map(row => ({ ...row, match: { ...row.match, gameCompletedAtUtc },
        observedAt: cutoff + 1000, resultAvailableAt: null }))
      const single = model.single(inputs, request, 'historical-limited')
      assert.deepEqual(single.usedGameIds, ['completed-0', 'completed-1'])
      assert.deepEqual(model.batch(inputs, [request, request], 'historical-limited').results, [single, single])
      assert.throws(() => model.single(inputs, request, 'verified'), /No available|No completed causal/)
      const unavailable = { ...inputs[0], match: { ...inputs[0].match, id: 'future-result' }, resultAvailableAt: cutoff + 1 }
      assert.deepEqual(model.single([...inputs, unavailable], request, 'historical-limited'), single)
    }
  })
}

test('ranking replay admits a finished game from an unfinished series', () => {
  const game = { ...history[0], match: { ...history[0].match, id: 'ongoing-series-game', sourceGameId: 'ongoing-series-game',
    sourceMatchId: 'ongoing-series', bestOf: 3, bestOfBasis: 'official' as const } }
  const inputs = [...history, game]
  const single = replayPregameSeriesState(inputs, request, 'verified')
  assert.deepEqual(single.usedGameIds, ['completed-0', 'completed-1', 'ongoing-series-game'])
  assert.deepEqual(replayPregameSeriesBatch(inputs, [request], 'verified').results, [single])
})
