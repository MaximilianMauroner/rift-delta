import type { PublicMatchHistoryEntry } from '../../domains/rankings/types'
import { hasConsistentImpactDirection } from '../../domains/rankings/read'
import { UPSET_CHANCE } from '../rankings/upset'

export type SeriesSide = 'A' | 'B'


/** Rating changes at or above this size draw a full-width bar. */
export const DELTA_BAR_CAP = 50

export type SeriesRatingChange =
  | { kind: 'held' }
  | { kind: 'missing' }
  | {
    kind: 'applied'
    teamA: number
    teamB: number
    /** Pre-match chance of the team named in `chanceSide`, on a 0-1 scale. */
    chance?: number
    chanceSide: SeriesSide
    eventWeight?: number
    upset: boolean
  }

/** The side with more series wins. A level score has no winner. */
export function seriesWinner(match: Pick<PublicMatchHistoryEntry, 'seriesWinsA' | 'seriesWinsB'>): SeriesSide | undefined {
  if (match.seriesWinsA === match.seriesWinsB) return undefined
  return match.seriesWinsA > match.seriesWinsB ? 'A' : 'B'
}

/**
 * A level score in an odd best-of cannot be a final result. The series state
 * comes from the score, so it cannot tell a live series from one with a
 * missing game. An even best-of can end level.
 */
export function isUnresolvedSeries(match: Pick<PublicMatchHistoryEntry, 'bestOf' | 'seriesWinsA' | 'seriesWinsB'>) {
  return !seriesWinner(match) && match.bestOf % 2 === 1
}

/**
 * Reads the series-level rating change from the summary game. The pre-match
 * chance is reported for the winner, because that is the number an upset is
 * judged by. Series whose deltas do not reconcile report `missing`, and show no
 * chance or upset, because their inputs are not trustworthy.
 */
export function seriesRatingChange(match: PublicMatchHistoryEntry): SeriesRatingChange {
  if (match.impact.unit === 'held') return { kind: 'held' }
  const { teamA, teamB, expectedTeamA, expectedTeamB, eventWeight } = match.impact
  if (!hasConsistentImpactDirection(match) || typeof teamA !== 'number' || typeof teamB !== 'number') return { kind: 'missing' }
  const winner = seriesWinner(match)
  const chanceSide = winner ?? 'A'
  const expected = chanceSide === 'A' ? expectedTeamA : expectedTeamB
  const chance = typeof expected === 'number' && Number.isFinite(expected) ? expected : undefined
  return {
    kind: 'applied',
    teamA,
    teamB,
    chance,
    chanceSide,
    eventWeight: typeof eventWeight === 'number' && Number.isFinite(eventWeight) ? eventWeight : undefined,
    upset: winner !== undefined && chance !== undefined && chance < UPSET_CHANCE,
  }
}

/** Bar length in pixels for a rating change. Any non-zero change stays visible. */
export function deltaBarWidth(delta: number, maxWidth: number) {
  const size = Math.min(Math.abs(delta), DELTA_BAR_CAP)
  if (size === 0 || !Number.isFinite(size)) return 0
  return Math.max(2, Math.round((size / DELTA_BAR_CAP) * maxWidth))
}
