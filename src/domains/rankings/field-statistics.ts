import type { PublicTeamStanding } from './internal/queries/publishedTypes.ts'
import type { CompactPlayer } from './internal/queries/publishedTypes.ts'
import { playerPerformanceMetricKeys } from './internal/players/playerPerformance.ts'
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

export type FieldBand =
  | 'Far above field'
  | 'Above field'
  | 'Typical'
  | 'Below field'
  | 'Far below field'

export type FieldEntry = { id: string; value: number | null; n: number }

export type FieldPosition = {
  value: number | null
  n: number
  field: Array<{ id: string; value: number; n: number }>
  mean: number | null
  z: number | null
  percentile: number | null
  band: FieldBand | null
}

function band(z: number): FieldBand {
  if (z >= 1.5) return 'Far above field'
  if (z >= 0.5) return 'Above field'
  if (z > -0.5) return 'Typical'
  if (z > -1.5) return 'Below field'
  return 'Far below field'
}

/**
 * Places one entry in its field: z uses the population standard deviation,
 * percentile counts ties as half below. Entries under minSamples stay out.
 */
export function fieldPosition(
  entries: readonly FieldEntry[],
  ownId: string,
  minSamples: number,
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
  const deviation =
    mean === null
      ? 0
      : Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            values.length,
        )
  const others = field.filter((entry) => entry.id !== ownId)
  const z =
    !ranked || mean === null || values.length < 3 || !deviation
      ? null
      : (ranked.value - mean) / deviation
  return {
    value: own?.value ?? null,
    n: own?.n ?? 0,
    field,
    mean,
    z,
    percentile:
      !ranked || !others.length
        ? null
        : (100 *
            (others.filter((entry) => entry.value < ranked.value).length +
              others.filter((entry) => entry.value === ranked.value).length /
                2)) /
          others.length,
    band: z === null ? null : band(z),
  }
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
      ),
    })),
  }
}

export const TEAM_FIELD_MIN_MATCHES = 5

export const TEAM_FIELD_METRICS = {
  rating: { label: 'Power rating', unit: 'rating' },
  winRate: { label: 'Series win rate', unit: '%' },
  winsAboveExpectation: { label: 'Wins above expectation', unit: 'wins' },
  recentForm: { label: 'Recent form', unit: '%' },
} as const
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
    record: wilsonRate(team.wins, team.wins + team.losses),
    positions: (Object.keys(TEAM_FIELD_METRICS) as TeamFieldMetric[]).map((metric) => ({
      metric,
      ...fieldPosition(
        field.map((entry) => measure(entry, metric)),
        team.teamId,
        metric === 'recentForm' ? 3 : TEAM_FIELD_MIN_MATCHES,
      ),
    })),
  }
}
