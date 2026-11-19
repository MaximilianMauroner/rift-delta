import { estimatePublicMatchup, type PublicMatchupModel } from '../../domains/rankings/read'
import { NEAR_TIE_WIN_PROBABILITY } from '../../domains/rankings/read'
import type { RankingSummaryStanding } from '../../domains/rankings/types'

/**
 * The sentence at the top of the ranking: who leads and how firmly. Every
 * figure comes from the published standings and the public matchup model, so
 * the copy moves with the data.
 *
 * `ranked` must be the ranked teams on the board, best first. A filtered board
 * passes its filtered teams and a `scope` label, so the sentence never names
 * teams the list below it hides.
 */
export function boardHeadline(ranked: readonly RankingSummaryStanding[], model?: PublicMatchupModel, scope?: string): string | undefined {
  const [leader, runnerUp] = ranked
  if (!leader) return undefined
  const prefix = scope ? `${scope}: ` : ''
  if (!runnerUp) return scope ? `${prefix}${leader.team} is the only ranked team.` : `${leader.team} lead the ranking.`

  const leaderChance = Math.round(estimatePublicMatchup(leader, runnerUp, model, { bestOf: 1 }).homeGameWinProbability * 100)
  const gap = Math.round(leader.rating - runnerUp.rating)
  return leaderChance / 100 < NEAR_TIE_WIN_PROBABILITY
    ? `${prefix}${leader.team} lead, but ${runnerUp.team} are close to level: ${leaderChance}% per game.`
    : `${prefix}${leader.team} lead ${runnerUp.team} by ${gap} Power, a ${leaderChance}% game edge.`
}

/** The board filters as a short label, or undefined when the board shows the whole scope. */
export function headlineScope(filters: { region: string; tier: string; search: string; tournament?: string }): string | undefined {
  const search = filters.search.trim()
  const parts = [
    filters.region !== 'All' ? filters.region : undefined,
    filters.tier !== 'All' ? `${filters.tier} tier` : undefined,
    filters.tournament,
    search ? `search "${search}"` : undefined,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : undefined
}
