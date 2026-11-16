import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fieldPosition,
  playerRoleProfile,
  teamLeagueProfile,
} from '../src/domains/rankings/field-statistics.ts'
import type { CompactPlayer, RankingSummaryStanding } from '../src/domains/rankings/types.ts'

test('field positions give ties the better place and leave out small samples', () => {
  const entries = [
    { id: 'a', value: 1, n: 10 },
    { id: 'b', value: 2, n: 10 },
    { id: 'c', value: 2, n: 10 },
    { id: 'd', value: 5, n: 10 },
    { id: 'tiny', value: 100, n: 1 },
  ]
  const position = fieldPosition(entries, 'b', 5, 'higher')
  assert.deepEqual(position.field.map((entry) => entry.id), ['a', 'b', 'c', 'd'])
  assert.equal(position.mean, 2.5)
  assert.equal(position.place, 2, 'b ties c behind d')
  assert.equal(position.standing, 'close', 'b is a third of a standard deviation below the mean')
  assert.equal(fieldPosition(entries, 'c', 5, 'higher').place, 2)
  assert.equal(fieldPosition(entries, 'd', 5, 'higher').standing, 'top')
  assert.equal(fieldPosition(entries, 'a', 5, 'higher').standing, 'below')

  const tiny = fieldPosition(entries, 'tiny', 5, 'higher')
  assert.equal(tiny.value, 100)
  assert.equal(tiny.place, null)
  assert.equal(tiny.standing, null)
})

test('a lower-is-better measure puts the smallest value first', () => {
  const entries = [
    { id: 'few', value: 1, n: 10 },
    { id: 'mid', value: 3, n: 10 },
    { id: 'many', value: 6, n: 10 },
  ]
  assert.equal(fieldPosition(entries, 'few', 1, 'lower').place, 1)
  assert.equal(fieldPosition(entries, 'few', 1, 'lower').standing, 'top')
  assert.equal(fieldPosition(entries, 'many', 1, 'lower').place, 3)
  assert.equal(fieldPosition(entries, 'many', 1, 'lower').standing, 'below')
  assert.equal(fieldPosition(entries, 'many', 1, null).place, 1, 'a style measure ranks the highest value first')
})

test('a field of two has places but no standing', () => {
  const entries = [{ id: 'a', value: 1, n: 1 }, { id: 'b', value: 2, n: 1 }]
  assert.deepEqual(
    [fieldPosition(entries, 'a', 1, 'higher').place, fieldPosition(entries, 'a', 1, 'higher').standing],
    [2, null],
  )
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
  assert.equal(kp.place, 3, 'focal has the lowest kill participation of three')
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
  const win = profile.positions.find((position) => position.metric === 'winRate')!
  assert.equal(win.value, 0.8)
  assert.deepEqual(win.field.map((entry) => entry.id), ['a', 'b', 'c'], 'Other leagues and teams under five series stay out')
  assert.equal(win.place, 1)
  assert.equal(win.standing, 'top')
  const form = profile.positions.find((position) => position.metric === 'recentForm')!
  assert.equal(form.value, 0.75)
  assert.equal(teamLeagueProfile(standings, 'missing'), null)
})
