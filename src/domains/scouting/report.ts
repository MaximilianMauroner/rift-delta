import { METRICS, SCOUTING_RULES, type Metric, type MetricKey, type PlayerReport, type ScoutingPlayer, type Tally } from './model.ts'
import type { Role } from '../rankings/types.ts'

export * from './model.ts'
export { parseScoutingIndex, parseScoutingShard } from './parser.ts'
export { scoutingReport } from './compute.ts'

const dayMs = 86_400_000

/** 95% Wilson score interval for `wins` out of `games`. */
export function wilson95(wins: number, games: number): [number, number] {
  const z = 1.96
  const p = wins / games
  const denominator = 1 + z * z / games
  const centre = p + z * z / (2 * games)
  const margin = z * Math.sqrt(p * (1 - p) / games + z * z / (4 * games * games))
  return [(centre - margin) / denominator, (centre + margin) / denominator]
}

export type Verdict = 'small-sample' | 'above' | 'below' | 'close'

/** Says "above" or "below" only when the whole 95% interval is on one side of the baseline rate. */
export function verdict(tally: Tally, baselineRate: number): Verdict {
  if (tally.games < SCOUTING_RULES.minVerdictGames) return 'small-sample'
  const [low, high] = wilson95(tally.hits, tally.games)
  return low > baselineRate ? 'above' : high < baselineRate ? 'below' : 'close'
}

export const rate = (tally: Tally) => tally.hits / tally.games

export type Band = { min: number; max: number; q1: number; median: number; q3: number }
export type FieldMetric = { metric: Metric; band: Band; values: Array<{ key: string; value: number }> }
export type ScoutingField = Map<MetricKey, FieldMetric>

function quantile(sorted: readonly number[], q: number) {
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low)
}

/** Peers that set ranks and bands for one role. A peer needs enough games overall and with the measure. */
export function scoutingField(players: readonly ScoutingPlayer[], role: Role): ScoutingField {
  const peers = players.filter(player => player.role === role && player.games >= SCOUTING_RULES.minFieldGames)
  const field: ScoutingField = new Map()
  for (const metric of METRICS) {
    const values = peers.flatMap(player => {
      const observed = player.observed[metric.key]
      return observed && observed.games >= SCOUTING_RULES.minMetricGames ? [{ key: `${player.id}|${player.role}`, value: observed.mean }] : []
    })
    if (!values.length) continue
    const sorted = values.map(entry => entry.value).sort((a, b) => a - b)
    field.set(metric.key, {
      metric, values,
      band: { min: sorted[0]!, max: sorted.at(-1)!, q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75) },
    })
  }
  return field
}

export type Measure = {
  metric: Metric
  value: number | null
  games: number
  /** 1 is strongest among the field. Null when this player is not in the field for the measure. */
  rank: number | null
  /** Players ranked, this player included. */
  of: number
  band: Band | null
}

export function scoutingMeasures(player: Pick<PlayerReport, 'id' | 'role' | 'observed'>, field: ScoutingField): Measure[] {
  return METRICS.map(metric => {
    const observed = player.observed[metric.key]
    const entry = field.get(metric.key)
    const base = { metric, value: observed?.mean ?? null, games: observed?.games ?? 0, band: entry?.band ?? null }
    const key = `${player.id}|${player.role}`
    const inField = Boolean(observed && entry?.values.some(peer => peer.key === key))
    if (!observed || !entry || !inField) return { ...base, rank: null, of: entry?.values.length ?? 0 }
    const others = entry.values.filter(peer => peer.key !== key)
    const stronger = others.filter(peer => metric.better === 'high' ? peer.value > observed.mean : peer.value < observed.mean).length
    return { ...base, rank: stronger + 1, of: others.length + 1 }
  })
}

/** Whole days from the player's newest game to the newest game on record. */
export function staleDays(player: Pick<PlayerReport, 'last'>, through: string) {
  return Math.round((Date.parse(through) - Date.parse(player.last)) / dayMs)
}

/** A gap above this many days is shown as a warning on the report. */
export const STALE_DAYS = 14
