import type { RankingTierLabel } from '../../domains/rankings/read'
import type { RankingSummaryStanding } from '../../domains/rankings/types'

const TIERS: readonly RankingTierLabel[] = ['S', 'A', 'B', 'C']

export type FieldAxis = { min: number; max: number; ticks: number[] }

/** A rounded Power axis that holds every team, with ticks every 100 or 200. */
export function fieldAxis(ratings: readonly number[]): FieldAxis {
  const low = Math.min(...ratings)
  const high = Math.max(...ratings)
  const min = Math.floor((low - 20) / 50) * 50
  const max = Math.ceil((high + 20) / 50) * 50
  const step = max - min > 800 ? 200 : 100
  const ticks: number[] = []
  for (let tick = Math.ceil(min / step) * step; tick <= max; tick += step) ticks.push(tick)
  return { min, max, ticks }
}

export type TierZone = { tier: RankingTierLabel; from: number; to: number }

/**
 * Tier zones on the axis, or none. A zone is drawn only when every tier is
 * one unbroken Power range, so a band never claims a team of another tier.
 * Each boundary sits halfway across the gap between two tiers.
 */
export function tierZones(
  ranked: readonly RankingSummaryStanding[],
  tierFor: (team: RankingSummaryStanding) => RankingTierLabel | undefined,
  axis: Pick<FieldAxis, 'min' | 'max'>,
): TierZone[] {
  const ranges = TIERS.flatMap((tier) => {
    const ratings = ranked.filter((team) => tierFor(team) === tier).map((team) => team.rating)
    return ratings.length === 0 ? [] : [{ tier, low: Math.min(...ratings), high: Math.max(...ratings) }]
  })
  if (ranges.length < 2) return []
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].high > ranges[index - 1].low) return []
  }
  return ranges
    .map(({ tier }, index) => ({
      tier,
      from: index === ranges.length - 1 ? axis.min : Math.max(axis.min, (ranges[index].low + ranges[index + 1].high) / 2),
      to: index === 0 ? axis.max : Math.min(axis.max, (ranges[index - 1].low + ranges[index].high) / 2),
    }))
    .filter((zone) => zone.to > zone.from)
}

export type SwarmItem = { x: number; radius: number }

/**
 * Vertical offsets from the centre line that keep marks apart, in the given
 * order, so earlier marks sit nearest the line. A mark with no free place
 * inside the height takes the place with the least overlap.
 */
export function swarmOffsets(items: readonly SwarmItem[], height: number, gap = 2): number[] {
  const placed: { x: number; y: number; radius: number }[] = []
  return items.map(({ x, radius }) => {
    const limit = Math.max(0, height / 2 - radius)
    const step = Math.max(1, radius / 2)
    let best = 0
    let bestClearance = -Infinity
    for (let reach = 0; reach <= limit; reach += step) {
      for (const y of reach === 0 ? [0] : [-reach, reach]) {
        let clearance = Infinity
        for (const other of placed) {
          if (Math.abs(other.x - x) >= other.radius + radius + gap) continue
          clearance = Math.min(clearance, Math.hypot(other.x - x, other.y - y) - other.radius - radius - gap)
        }
        if (clearance >= 0) {
          placed.push({ x, y, radius })
          return y
        }
        if (clearance > bestClearance) {
          bestClearance = clearance
          best = y
        }
      }
    }
    placed.push({ x, y: best, radius })
    return best
  })
}
