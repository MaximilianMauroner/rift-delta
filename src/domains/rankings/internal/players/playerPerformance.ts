import { playerPerformancePolicy } from '../policy/playerPerformancePolicy.ts'
import type { PlayerGameStats, PlayerPerformanceMetric, PlayerPerformanceSummary } from '../../types.ts'

export const playerPerformanceMetrics = {
  killParticipation: { label: 'Kill participation', format: 'percent', decimals: 4, better: 'higher', hint: 'Share of team kills they took part in.' },
  damageGoldShareGap: { label: 'Damage for gold', format: 'points', decimals: 4, better: null, hint: 'Damage share minus gold share. A style, not better or worse.' },
  goldDiffAt15: { label: 'Gold lead at 15', format: 'signed', decimals: 1, better: 'higher', hint: 'Gold ahead of the lane opponent at 15 minutes.' },
  xpDiffAt15: { label: 'XP lead at 15', format: 'signed', decimals: 1, better: 'higher', hint: 'Experience ahead of the lane opponent at 15 minutes.' },
  csDiffAt15: { label: 'CS lead at 15', format: 'signed', decimals: 1, better: 'higher', hint: 'Minions and monsters ahead of the lane opponent at 15 minutes.' },
  damagePerMinute: { label: 'Damage per minute', format: 'number', decimals: 1, better: 'higher', hint: 'Damage to champions per minute.' },
  csPerMinute: { label: 'CS per minute', format: 'number', decimals: 2, better: 'higher', hint: 'Minions and monsters killed per minute.' },
  wardsPlacedPerMinute: { label: 'Wards placed per minute', format: 'number', decimals: 2, better: 'higher', hint: 'Wards put down per minute.' },
  wardsClearedPerMinute: { label: 'Wards cleared per minute', format: 'number', decimals: 2, better: 'higher', hint: 'Enemy wards destroyed per minute.' },
} as const satisfies Record<PlayerPerformanceMetric, { label: string; format: string; decimals: number; better: 'higher' | null; hint: string }>

export const playerPerformanceMetricKeys = Object.keys(playerPerformanceMetrics) as PlayerPerformanceMetric[]

export function playerPerformanceValues(stats?: PlayerGameStats): Record<PlayerPerformanceMetric, number | undefined> {
  const damageShare = bounded(stats?.damageShare, 0, 1)
  const goldShare = bounded(stats?.earnedGoldShare, 0, 1)
  return {
    killParticipation: bounded(stats?.killParticipation, 0, 1),
    damageGoldShareGap: damageShare === undefined || goldShare === undefined ? undefined : damageShare - goldShare,
    goldDiffAt15: finite(stats?.goldDiffAt15),
    xpDiffAt15: finite(stats?.xpDiffAt15),
    csDiffAt15: finite(stats?.csDiffAt15),
    damagePerMinute: bounded(stats?.damagePerMinute, 0),
    csPerMinute: bounded(stats?.csPerMinute, 0),
    wardsPlacedPerMinute: bounded(stats?.wardsPlacedPerMinute, 0),
    wardsClearedPerMinute: bounded(stats?.wardsClearedPerMinute, 0),
  }
}

export type PlayerPerformanceAccumulator = Record<PlayerPerformanceMetric, { total: number; games: number }>

export function createPlayerPerformanceAccumulator(): PlayerPerformanceAccumulator {
  return Object.fromEntries(playerPerformanceMetricKeys.map((key) => [key, { total: 0, games: 0 }])) as PlayerPerformanceAccumulator
}

export function recordPlayerPerformance(accumulator: PlayerPerformanceAccumulator, stats?: PlayerGameStats) {
  const values = playerPerformanceValues(stats)
  for (const key of playerPerformanceMetricKeys) {
    const value = values[key]
    if (value === undefined) continue
    accumulator[key].total += value
    accumulator[key].games += 1
  }
}

export function summarizePlayerPerformance(accumulator: PlayerPerformanceAccumulator, sampleGames: number): PlayerPerformanceSummary {
  return {
    ...playerPerformancePolicy,
    metrics: Object.fromEntries(playerPerformanceMetricKeys.map((key) => {
      const { total, games } = accumulator[key]
      return [key, {
        value: games ? Number((total / games).toFixed(playerPerformanceMetrics[key].decimals)) : null,
        games,
        missing: sampleGames - games,
      }]
    })) as PlayerPerformanceSummary['metrics'],
  }
}

function finite(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function bounded(value: number | undefined, min: number, max = Infinity) {
  const number = finite(value)
  return number !== undefined && number >= min && number <= max ? number : undefined
}
