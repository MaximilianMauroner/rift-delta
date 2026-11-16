import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fieldPosition,
  playerRoleProfile,
  teamLeagueProfile,
} from '../src/domains/rankings/field-statistics.ts'
import type { CompactPlayer, RankingSummaryStanding } from '../src/domains/rankings/types.ts'

test('field positions count ties as half below and leave out small samples', () => {
  const position = fieldPosition(
    [
      { id: 'a', value: 1, n: 10 },
      { id: 'b', value: 2, n: 10 },
      { id: 'c', value: 2, n: 10 },
      { id: 'd', value: 5, n: 10 },
      { id: 'tiny', value: 100, n: 1 },
    ],
    'b',
    5,
  )
  assert.deepEqual(position.field.map((entry) => entry.id), ['a', 'b', 'c', 'd'])
  assert.equal(position.mean, 2.5)
  assert.equal(position.percentile, 50, 'one below and one tie out of three others')
  assert.ok(Math.abs(position.z! - (2 - 2.5) / 1.5) < 1e-12)
  assert.equal(position.band, 'Typical')

  const tiny = fieldPosition([{ id: 'tiny', value: 100, n: 1 }, { id: 'a', value: 1, n: 10 }], 'tiny', 5)
  assert.equal(tiny.value, 100)
  assert.equal(tiny.z, null)
  assert.equal(tiny.percentile, null)
})

const player = (id: string, role: CompactPlayer['role'], league: string, kp: number | null, games = 20) =>
  ({
    id,
    name: id,
    team: `${id} team`,
    role,
    league,
    rank: 1,
    rating: 100,
    games,
    delta: 0,
    impactMultiplier: 1,
    diagnostics: {
      sampleGames: games,
      performance: {
        metrics: { killParticipation: { value: kp, games: kp === null ? 0 : games, missing: 0 } },
      },
    },
  }) as unknown as CompactPlayer

test('a role profile compares a player only with the same role in the same league', () => {
  const players = [
    player('focal', 'Mid', 'LCK', 0.6),
    player('peer', 'Mid', 'LCK', 0.7),
    player('peer2', 'Mid', 'LCK', 0.8),
    player('other-league', 'Mid', 'LPL', 0.1),
    player('other-role', 'Top', 'LCK', 0.1),
    player('few-games', 'Mid', 'LCK', 0.1, 4),
  ]
  const profile = playerRoleProfile(players, 'focal')!
  const kp = profile.positions.find((position) => position.metric === 'killParticipation')!
  assert.equal(profile.league, 'LCK')
  assert.deepEqual(kp.field.map((entry) => entry.id).sort(), ['focal', 'peer', 'peer2'])
  assert.equal(kp.percentile, 0)
  assert.equal(profile.positions.find((position) => position.metric === 'goldDiffAt15')!.value, null)
  assert.equal(playerRoleProfile(players, 'missing'), null)
})

const standing = (teamId: string, league: string, wins: number, losses: number, form: string[], wae?: number) =>
  ({
    teamId,
    team: teamId,
    code: teamId.toUpperCase(),
    league,
    rating: 1000 + wins * 10,
    wins,
    losses,
    form,
    deservedStanding: wae === undefined ? undefined : { winsAboveExpectation: wae },
  }) as unknown as RankingSummaryStanding

test('a league profile places a team among its league on record, rating and form', () => {
  const standings = [
    standing('a', 'LCK', 8, 2, ['W', 'W', 'L', 'W'], 2),
    standing('b', 'LCK', 5, 5, ['L', 'W', 'L', 'W'], 0),
    standing('c', 'LCK', 2, 8, ['L', 'L', 'L', 'W'], -2),
    standing('new', 'LCK', 1, 1, ['W', 'L'], 0),
    standing('x', 'LPL', 10, 0, ['W', 'W', 'W', 'W'], 5),
  ]
  const profile = teamLeagueProfile(standings, 'a')!
  assert.deepEqual([profile.record.successes, profile.record.trials], [8, 10])
  const win = profile.positions.find((position) => position.metric === 'winRate')!
  assert.equal(win.value, 0.8)
  assert.deepEqual(win.field.map((entry) => entry.id), ['a', 'b', 'c'], 'Other leagues and teams under five series stay out')
  assert.equal(win.percentile, 100)
  const form = profile.positions.find((position) => position.metric === 'recentForm')!
  assert.equal(form.value, 0.75)
  assert.equal(teamLeagueProfile(standings, 'missing'), null)
})
