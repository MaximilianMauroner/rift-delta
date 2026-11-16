import type { PublicTeamStanding } from './internal/queries/publishedTypes.ts'
import type { CompactPlayer } from './internal/queries/publishedTypes.ts'
import { playerPerformanceMetricKeys, playerPerformanceMetrics } from './internal/players/playerPerformance.ts'
import type { PlayerPerformanceMetric } from './types.ts'

export type Interval = { low: number; high: number }
export type Rate = {
  successes: number
  trials: number
  value: number | null
  interval: Interval | null
}

export function wilsonRate(successes: number, trials: number): Rate {
  if (!trials) return { successes, trials, value: null, interval: null }
  const z = 1.959964
  const p = successes / trials
  const denominator = 1 + (z * z) / trials
  const center = (p + (z * z) / (2 * trials)) / denominator
  const spread =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))
  return {
    successes,
    trials,
    value: p,
    interval: {
      low: Math.max(0, center - spread),
      high: Math.min(1, center + spread),
    },
  }
}

/** Which way a measure gets better. `null` marks a style measure, where higher is not better. */
export type Better = 'higher' | 'lower' | null

/** Plain verdict for one entry against its field, in the direction of `better`. */
export type FieldStanding = 'top' | 'above' | 'close' | 'below'

export type FieldEntry = { id: string; value: number | null; n: number }

export type FieldPosition = {
  value: number | null
  n: number
  field: Array<{ id: string; value: number; n: number }>
  mean: number | null
  /** 1 is best, or highest for a style measure. Ties share the better place. */
  place: number | null
  better: Better
  standing: FieldStanding | null
}

/**
 * Places one entry in its field. Entries under minSamples stay out. The standing
 * is "top" for first place, else above or below when the entry is at least half
 * a population standard deviation from the field average.
 */
export function fieldPosition(
  entries: readonly FieldEntry[],
  ownId: string,
  minSamples: number,
  better: Better,
): FieldPosition {
  const field = entries.flatMap(({ id, value, n }) =>
    value === null || n < minSamples ? [] : [{ id, value, n }],
  )
  const own = entries.find((entry) => entry.id === ownId)
  const ranked = field.find((entry) => entry.id === ownId)
  const values = field.map((entry) => entry.value)
  const mean = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
  const sign = better === 'lower' ? -1 : 1
  const place = ranked
    ? 1 + field.filter((entry) => sign * entry.value > sign * ranked.value).length
    : null
  let standing: FieldStanding | null = null
  if (ranked && mean !== null && field.length >= 3) {
    const deviation = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
    )
    const z = deviation ? (sign * (ranked.value - mean)) / deviation : 0
    standing = place === 1 ? 'top' : z >= 0.5 ? 'above' : z <= -0.5 ? 'below' : 'close'
  }
  return { value: own?.value ?? null, n: own?.n ?? 0, field, mean, place, better, standing }
}

export const PLAYER_FIELD_MIN_GAMES = 10

export type PlayerRoleProfile = {
  player: CompactPlayer
  league: string | null
  positions: Array<FieldPosition & { metric: PlayerPerformanceMetric }>
}

/** Places a player's raw stat averages among same-role players of the same league in one scope. */
export function playerRoleProfile(
  players: readonly CompactPlayer[],
  playerId: string,
): PlayerRoleProfile | null {
  const player = players.find((entry) => entry.id === playerId)
  if (!player) return null
  const league = player.league ?? null
  const field = players.filter(
    (entry) =>
      entry.role === player.role && (league === null || entry.league === league),
  )
  return {
    player,
    league,
    positions: playerPerformanceMetricKeys.map((metric) => ({
      metric,
      ...fieldPosition(
        field.map((entry) => {
          const observed = entry.diagnostics?.performance?.metrics[metric]
          return { id: entry.id, value: observed?.value ?? null, n: observed?.games ?? 0 }
        }),
        player.id,
        PLAYER_FIELD_MIN_GAMES,
        playerPerformanceMetrics[metric].better,
      ),
    })),
  }
}

export const TEAM_FIELD_MIN_MATCHES = 5

export const TEAM_FIELD_METRICS = {
  rating: { label: 'Power', unit: 'rating', better: 'higher', hint: 'Team strength from match results.' },
  winRate: { label: 'Series win rate', unit: '%', better: 'higher', hint: 'Share of series won.' },
  winsAboveExpectation: { label: 'Wins vs expected', unit: 'wins', better: 'higher', hint: 'Series won minus the wins the ratings expected.' },
  recentForm: { label: 'Recent form', unit: '%', better: 'higher', hint: 'Share of the latest results won.' },
} as const satisfies Record<string, { label: string; unit: string; better: Better; hint: string }>
export type TeamFieldMetric = keyof typeof TEAM_FIELD_METRICS

/** Places a ranked team among teams of its league on rating, record and form. */
export function teamLeagueProfile(
  standings: readonly PublicTeamStanding[],
  teamId: string,
) {
  const team = standings.find((entry) => entry.teamId === teamId)
  if (!team) return null
  const field = standings.filter((entry) => entry.league === team.league)
  const measure = (
    entry: PublicTeamStanding,
    metric: TeamFieldMetric,
  ): FieldEntry => {
    const matches = entry.wins + entry.losses
    if (metric === 'rating') return { id: entry.teamId, value: entry.rating, n: matches }
    if (metric === 'winRate')
      return { id: entry.teamId, value: matches ? entry.wins / matches : null, n: matches }
    if (metric === 'winsAboveExpectation')
      return {
        id: entry.teamId,
        value: entry.deservedStanding?.winsAboveExpectation ?? null,
        n: matches,
      }
    const recent = entry.form.filter((result) => result === 'W' || result === 'L')
    return {
      id: entry.teamId,
      value: recent.length ? recent.filter((result) => result === 'W').length / recent.length : null,
      n: recent.length,
    }
  }
  return {
    team,
    positions: (Object.keys(TEAM_FIELD_METRICS) as TeamFieldMetric[]).map((metric) => ({
      metric,
      ...fieldPosition(
        field.map((entry) => measure(entry, metric)),
        team.teamId,
        metric === 'recentForm' ? 3 : TEAM_FIELD_MIN_MATCHES,
        TEAM_FIELD_METRICS[metric].better,
      ),
    })),
  }
}
