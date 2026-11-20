import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPregamePlayerRatingEdges } from '../src/domains/rankings/internal/players/playerModel.ts'
import type { MatchRecord, Role } from '../src/domains/rankings/types.ts'

const roles: Role[] = ['Top', 'Jungle', 'Mid', 'Bot', 'Support']
const mainEvent = 'Synthetic LCK 2026 Spring'
const academyEvent = 'Synthetic LCK 2026 Academy Spring'

test('concurrent events retain separate lineups for both teams in the same league', () => {
  const main = game('main', 1, mainEvent)
  const academy = game('academy', 2, academyEvent)
  const mainTarget = target('main-target', 3, mainEvent)
  const academyTarget = target('academy-target', 3, academyEvent)
  const edges = buildPregamePlayerRatingEdges([main, academy, mainTarget, academyTarget])
  assert.deepEqual(edges.get(mainTarget.id), buildPregamePlayerRatingEdges([main, mainTarget]).get(mainTarget.id))
  assert.deepEqual(edges.get(academyTarget.id), buildPregamePlayerRatingEdges([academy, academyTarget]).get(academyTarget.id))
  assert.equal(edges.get(mainTarget.id)!.teamAObservedAt, '2026-01-01')
  assert.equal(edges.get(academyTarget.id)!.teamBObservedAt, '2026-01-02')
  assert.notEqual(edges.get(mainTarget.id)!.teamAAdjustment, 0)
})

test('partial observations merge with their own event lineup after another event plays', () => {
  const main = game('main', 1, mainEvent)
  const academy = game('academy', 2, academyEvent)
  for (const player of academy.teamARoster!.players) Object.assign(player.stats!, { kills: 0, deaths: 8, assists: 0 })
  for (const player of academy.teamBRoster!.players) Object.assign(player.stats!, { kills: 10, deaths: 1, assists: 10 })
  const partial = game('main-partial', 3, mainEvent, ['Top'])
  const mainTarget = target('main-target', 4, mainEvent)
  const academyTarget = target('academy-target', 4, academyEvent)
  const newEventTarget = target('new-event-target', 4, 'Synthetic LCK 2026 Summer')
  const edges = buildPregamePlayerRatingEdges([main, academy, partial, mainTarget, academyTarget, newEventTarget])
  assert.deepEqual(edges.get(mainTarget.id), buildPregamePlayerRatingEdges([main, partial, mainTarget]).get(mainTarget.id))
  assert.deepEqual(edges.get(academyTarget.id), buildPregamePlayerRatingEdges([academy, academyTarget]).get(academyTarget.id))
  assert.equal(edges.get(mainTarget.id)!.teamALineupCompleteness, 'complete-five-role')
  assert.equal(edges.get(mainTarget.id)!.teamBObservedAt, '2026-01-03')
  const fallback = edges.get(newEventTarget.id)!
  assert.equal(fallback.teamAObservedAt, '2026-01-03')
  assert.ok(fallback.teamAAdjustment < edges.get(mainTarget.id)!.teamAAdjustment)
  assert.ok(fallback.teamAAdjustment > edges.get(academyTarget.id)!.teamAAdjustment)
})

test('a first partial observation seeds from the prior team lineup and then keeps its own memory', () => {
  const main = game('main', 1, mainEvent)
  const top = game('academy-top', 2, academyEvent, ['Top'])
  const foreign = game('foreign-main', 3, mainEvent)
  for (const roster of [foreign.teamARoster!, foreign.teamBRoster!]) {
    for (const player of roster.players) player.id = `foreign-${player.id}`
  }
  const bot = game('academy-bot', 4, academyEvent, ['Bot'])
  const firstTarget = target('first-target', 4, academyEvent)
  const secondTarget = target('second-target', 5, academyEvent)
  const rows = [main, top, foreign, bot, firstTarget, secondTarget]
  const edges = buildPregamePlayerRatingEdges(rows)
  assert.deepEqual(edges.get(firstTarget.id), buildPregamePlayerRatingEdges([main, top, firstTarget]).get(firstTarget.id))
  assert.deepEqual(edges.get(secondTarget.id), buildPregamePlayerRatingEdges([main, top, bot, secondTarget]).get(secondTarget.id))
  assert.equal(edges.get(firstTarget.id)!.teamALineupCompleteness, 'complete-five-role')
  assert.equal(edges.get(firstTarget.id)!.teamACoverage, 0.82)
  assert.equal(edges.get(firstTarget.id)!.teamBObservedAt, '2026-01-02')
  assert.equal(edges.get(secondTarget.id)!.teamACoverage, 0.62)
  assert.equal(edges.get(secondTarget.id)!.teamBCoverage, 0.62)
  assert.equal(edges.get(secondTarget.id)!.teamAObservedAt, '2026-01-04')
  assert.deepEqual(buildPregamePlayerRatingEdges(rows.toReversed()), edges)
  const noPrior = buildPregamePlayerRatingEdges([top, firstTarget]).get(firstTarget.id)!
  assert.equal(noPrior.teamALineupCompleteness, 'partial')
  assert.equal(noPrior.teamACoverage, 0)
})

test('a new split uses the latest team lineup until its own first earlier observation', () => {
  const nextSplit = 'Synthetic LCK 2026 Summer'
  const main = game('main', 1, mainEvent)
  const academy = game('academy', 2, academyEvent)
  const debut = target('summer-debut', 3, nextSplit)
  const partial = game('summer-partial', 4, nextSplit, ['Top'])
  const laterAcademy = game('later-academy', 5, academyEvent)
  const later = target('summer-later', 6, nextSplit)
  const edges = buildPregamePlayerRatingEdges([main, academy, debut, partial, laterAcademy, later])
  assert.deepEqual(edges.get(debut.id), buildPregamePlayerRatingEdges([academy, debut]).get(debut.id))
  assert.equal(edges.get(debut.id)!.teamAObservedAt, '2026-01-02')
  assert.equal(edges.get(later.id)!.teamAObservedAt, '2026-01-04')
  assert.equal(edges.get(later.id)!.teamALineupCompleteness, 'complete-five-role')
  assert.equal(edges.get(later.id)!.teamBLineupCompleteness, 'complete-five-role')
  assert.equal(edges.get(later.id)!.teamACoverage, 0.82)
  assert.equal(edges.get(later.id)!.teamBCoverage, 0.82)
})

test('event memory admits only completed observations strictly before the forecast cutoff', () => {
  const main = game('main', 1, mainEvent)
  const academy = game('academy', 2, academyEvent)
  const delayed = game('delayed-main', 3, mainEvent)
  delayed.gameCompletedAtUtc = '2026-01-05T00:20:00Z'
  const unproven = game('unproven-main', 4, mainEvent)
  unproven.gameCompletedAtUtc = undefined
  const before = target('before', 4, mainEvent)
  const cutoff = target('cutoff', 5, mainEvent)
  const after = target('after', 6, mainEvent)
  const edges = buildPregamePlayerRatingEdges([main, academy, delayed, unproven, before, cutoff, after])
  assert.equal(edges.get(before.id)!.teamAObservedAt, '2026-01-01')
  assert.equal(edges.get(cutoff.id)!.teamBObservedAt, '2026-01-01')
  assert.equal(edges.get(after.id)!.teamAObservedAt, '2026-01-03')
  assert.deepEqual(edges.get(before.id), buildPregamePlayerRatingEdges([main, academy, before]).get(before.id))
  delayed.teamARoster!.observedAt = '2026-01-06'
  delayed.teamBRoster!.observedAt = '2026-01-06'
  assert.equal(buildPregamePlayerRatingEdges([main, academy, delayed, after]).get(after.id)!.teamAObservedAt, '2026-01-01')
})

test('canonical event identity includes season and league and input order cannot change edges', () => {
  const main = game('main', 1, mainEvent)
  const academy = game('academy', 2, academyEvent)
  academy.event = mainEvent
  academy.league = 'LCK CL'
  const next = target('main-target', 3, mainEvent)
  const newSeason = target('new-season', 4, mainEvent)
  newSeason.season = 2027
  const rows = [main, academy, next, newSeason]
  const edges = buildPregamePlayerRatingEdges(rows)
  assert.equal(edges.get(next.id)!.teamAObservedAt, '2026-01-01')
  assert.equal(edges.get(newSeason.id)!.teamBObservedAt, '2026-01-02')
  assert.deepEqual(buildPregamePlayerRatingEdges(rows.toReversed()), edges)
  assert.deepEqual(buildPregamePlayerRatingEdges([academy, newSeason, next, main]), edges)
})

function game(id: string, day: number, event: string, observedRoles: Role[] = roles): MatchRecord {
  const date = `2026-01-${String(day).padStart(2, '0')}`
  const roster = (team: string) => ({
    completeness: observedRoles.length === 5 ? 'complete-five-role' as const : 'partial' as const,
    sourceProvider: 'oracles-elixir' as const,
    observedAt: date,
    players: observedRoles.map(role => ({
      id: `${event}-${team}-${role}`, name: `${event}-${team}-${role}`, role,
      stats: { side: team === 'Alpha' ? 'blue' as const : 'red' as const, won: team === 'Alpha',
        kills: team === 'Alpha' ? 10 : 0, deaths: team === 'Alpha' ? 1 : 8, assists: 10,
        damageShare: 0.2, earnedGoldShare: 0.2, vspm: 1 },
    })),
  })
  return {
    id, sourceProvider: 'oracles-elixir', sourceGameId: id, officialMatchId: id, officialEventId: id,
    date, gameCompletedAtUtc: `${date}T12:30:00Z`, season: 2026, event,
    phase: 'Regular season', region: 'LCK', league: 'LCK',
    teamAHomeLeague: 'LCK', teamBHomeLeague: 'LCK', teamARegion: 'LCK', teamBRegion: 'LCK',
    bestOf: 1, tier: 'regional-regular', patch: '26.1', teamA: 'Alpha', teamB: 'Beta', winner: 'Alpha',
    teamAKills: 50, teamBKills: 0, teamAGold: 60000, teamBGold: 50000,
    teamARoster: roster('Alpha'), teamBRoster: roster('Beta'),
  }
}

function target(id: string, day: number, event: string): MatchRecord {
  return { ...game(id, day, event), teamARoster: undefined, teamBRoster: undefined }
}
