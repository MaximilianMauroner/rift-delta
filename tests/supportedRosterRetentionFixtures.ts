import { buildPregamePlayerRatingEdges } from '../src/domains/rankings/internal/players/playerModel.ts'
import { createRatingRunState } from '../src/domains/rankings/internal/replay/ratingRunState.ts'
import { processRatingSeriesForDate } from '../src/lib/ratingSeriesEngine.ts'
import type { MatchRecord, MatchRosterSnapshot } from '../src/domains/rankings/types.ts'
import { game, profiles, roster } from './seriesPassFixtures.ts'

export function ratedRoster(prefix: string, date: string, strength = 0.5): MatchRosterSnapshot {
  return { ...roster(prefix), observedAt: date, players: roster(prefix).players.map((player) => ({
    ...player, stats: { side: 'blue', won: strength > 0.5, kills: 10 * strength, deaths: 10 * (1 - strength),
      assists: 10 * strength, damageShare: strength, earnedGoldShare: strength, vspm: 4 * strength },
  })) }
}

export function retentionHistory(incomingStrength = 0.9): MatchRecord[] {
  return Array.from({ length: 8 }, (_, index) => {
    const date = `2026-01-0${index + 1}`
    return [
      game(`old-${index}`, { date, datetimeUtc: `${date}T12:00:00Z`, gameCompletedAtUtc: `${date}T12:30:00Z`,
        teamARoster: ratedRoster('old', date), teamBRoster: ratedRoster('Beta', date) }),
      game(`incoming-${index}`, { date, datetimeUtc: `${date}T14:00:00Z`, gameCompletedAtUtc: `${date}T14:30:00Z`,
        teamA: 'Gamma', teamB: 'Zulu', teamAHomeLeague: 'LCK', teamBHomeLeague: 'LCK', winner: 'Gamma',
        teamARoster: ratedRoster('incoming', date, incomingStrength),
        teamBRoster: ratedRoster('Zulu', date) }),
    ]
  }).flat()
}

export function retentionTargets(): MatchRecord[] {
  const date = '2026-01-20'
  return [
    game('upgrade-1', { sourceMatchId: 'upgrade', bestOf: 3, gameNumber: 1 }),
    game('upgrade-2', { sourceMatchId: 'upgrade', bestOf: 3, gameNumber: 2, teamA: 'Beta', teamB: 'Alpha' }),
    game('rematch'), game('downgrade'), game('upgrade-again'),
  ].map((row, index) => ({
    ...row, date, datetimeUtc: `${date}T${12 + index}:00:00Z`, gameCompletedAtUtc: `${date}T${12 + index}:30:00Z`,
    teamARoster: ratedRoster(row.teamA === 'Beta' ? 'Beta' : index === 3 ? 'old' : 'incoming', date),
    teamBRoster: ratedRoster(row.teamB === 'Beta' ? 'Beta' : 'incoming', date),
  }))
}

export function supportedRetentionDate(history = retentionHistory(), matches = retentionTargets()) {
  const state = createRatingRunState([], profiles)
  state.ratings.set('Alpha', 1900)
  state.executionRatings.set('Alpha', 1800)
  state.uncertainties.set('Alpha', 100)
  state.lastRosterByTeam.set('Alpha', ratedRoster('old', '2026-01-08'))
  state.lastRosterByTeam.set('Beta', ratedRoster('Beta', '2026-01-08'))
  const pregamePlayerRatingEdges = buildPregamePlayerRatingEdges([...history, ...matches], { teams: profiles })
  const capture = processRatingSeriesForDate({ matches, teams: profiles, state, pregamePlayerRatingEdges,
    sideAdjustments: new Map(), lastDate: matches[0].date, capture: true })!
  return { capture, state }
}
