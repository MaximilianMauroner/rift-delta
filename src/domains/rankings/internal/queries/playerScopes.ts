import type { CompactPlayer, PublicPlayerDirectory, SnapshotFilter } from '../../types.ts'
import { snapshotKey } from '../published/schema.ts'
import { compareCodeUnits } from '../../../../shared/codeUnitOrder.mjs'

export type PlayerScopeBasis = 'current' | 'season-fallback' | 'all-seasons-fallback'

export type ResolvedPlayerScope = {
  players: PublicPlayerDirectory['players']
  currentLineups: PublicPlayerDirectory['currentLineups']
  label: string
}

export function emptyPlayerScope(filter: SnapshotFilter): ResolvedPlayerScope {
  return { players: [], currentLineups: {}, label: playerScopeLabel(filter, 'current') }
}

export type PlayerScoreFamily = 'stats-power' | 'role-power'

export type PlayerUnrankedReason = 'no-stat-games' | 'no-score'

export type PlayerLeaderboardScore =
  | { status: 'ranked'; value: number }
  | { status: 'unranked'; reason: PlayerUnrankedReason }

export type PlayerLeaderboardRow = CompactPlayer & (
  | { leaderboardRank: number; leaderboardScore: Extract<PlayerLeaderboardScore, { status: 'ranked' }> }
  | { leaderboardRank: null; leaderboardScore: Extract<PlayerLeaderboardScore, { status: 'unranked' }> }
)

export type PlayerLeaderboard = { scoreFamily: PlayerScoreFamily; rows: PlayerLeaderboardRow[] }

export function playerLeaderboardScore(
  player: Pick<CompactPlayer, 'rating' | 'statsPower'>,
  family: PlayerScoreFamily,
): PlayerLeaderboardScore {
  if (family === 'role-power') {
    return Number.isFinite(player.rating) ? { status: 'ranked', value: player.rating } : { status: 'unranked', reason: 'no-score' }
  }
  const power = player.statsPower
  if (!power || !Number.isFinite(power.score)) return { status: 'unranked', reason: 'no-score' }
  if (power.priorOnly || !(power.sampleGames > 0)) return { status: 'unranked', reason: 'no-stat-games' }
  return { status: 'ranked', value: power.score }
}

/**
 * Ranks one exact scope by one score family: Stats Power when any row has it, otherwise
 * Role Power. Equal full-precision scores share a rank. Unranked rows follow ranked rows.
 * Stored strength rank and stable IDs only order rows that the score does not separate.
 */
export function playerLeaderboardForScope(
  directory: PublicPlayerDirectory | undefined,
  filter: SnapshotFilter,
): PlayerLeaderboard {
  if (!directory) return { scoreFamily: 'role-power', rows: [] }
  const players = filter.season === 'All' && filter.event === 'All' && filter.region === 'All' && !filter.checkpoint
    ? directory.players
    : directory.scopedPlayers?.[snapshotKey(filter)] ?? []
  const scoreFamily: PlayerScoreFamily = players.some((player) => player.statsPower) ? 'stats-power' : 'role-power'
  const ordered = players
    .map((player) => ({ player, score: playerLeaderboardScore(player, scoreFamily) }))
    .sort((left, right) =>
      compareScores(left.score, right.score) || left.player.rank - right.player.rank || compareCodeUnits(left.player.id, right.player.id),
    )
  let previous: { value: number; rank: number } | undefined
  const rows = ordered.map(({ player, score }, index): PlayerLeaderboardRow => {
    if (score.status === 'unranked') return { ...player, leaderboardRank: null, leaderboardScore: score }
    const rank = previous?.value === score.value ? previous.rank : index + 1
    previous = { value: score.value, rank }
    return { ...player, leaderboardRank: rank, leaderboardScore: score }
  })
  return { scoreFamily, rows }
}

function compareScores(left: PlayerLeaderboardScore, right: PlayerLeaderboardScore) {
  if (left.status === 'ranked' && right.status === 'ranked') return right.value - left.value
  if (left.status === right.status) return 0
  return left.status === 'ranked' ? -1 : 1
}

export function resolvePlayerScope(
  directory: PublicPlayerDirectory | undefined,
  filter: SnapshotFilter,
): ResolvedPlayerScope {
  const currentScope = emptyPlayerScope(filter)
  if (!directory) return currentScope
  if (filter.season === 'All' && filter.event === 'All' && filter.region === 'All') {
    return { players: directory.players, currentLineups: directory.currentLineups, label: currentScope.label }
  }
  if (filter.season !== 'All' && filter.event === 'All' && filter.region === 'All') {
    const exactPlayers = directory.scopedPlayers?.[snapshotKey(filter)]
    const seasonPlayers = filter.checkpoint
      ? directory.scopedPlayers?.[snapshotKey({ season: filter.season, event: 'All', region: 'All' })]
      : undefined
    const scopedPlayers = exactPlayers ?? seasonPlayers
    if (scopedPlayers) {
      const scopedTeams = new Set(scopedPlayers.map((player) => player.team))
      const fallbackPlayers = directory.players.filter((player) => !scopedTeams.has(player.team))
      const basis: PlayerScopeBasis = fallbackPlayers.length > 0
        ? 'all-seasons-fallback'
        : exactPlayers ? 'current' : 'season-fallback'
      return {
        players: [...scopedPlayers, ...fallbackPlayers],
        currentLineups: directory.currentLineups,
        label: playerScopeLabel(filter, basis),
      }
    }
  }
  return currentScope
}

function playerScopeLabel(filter: SnapshotFilter, basis: PlayerScopeBasis) {
  if (basis === 'all-seasons-fallback') {
    return `${scopeBaseLabel(filter)}; teams without scoped rows use all-season sources`
  }
  if (basis === 'season-fallback') return `the ${filter.season} source season`
  return scopeBaseLabel(filter)
}

function scopeBaseLabel(filter: SnapshotFilter) {
  if (filter.season === 'All' && filter.event === 'All' && filter.region === 'All') return 'all seasons & events'
  if (filter.season !== 'All' && filter.event === 'All' && filter.region === 'All') {
    if (filter.checkpoint) return `the ${filter.season} ${checkpointLabel(filter.checkpoint)} checkpoint`
    return `the ${filter.season} source season`
  }
  if (filter.event !== 'All') return filter.event
  if (filter.region !== 'All') return `${filter.region} region scope`
  return 'the current scope'
}

function checkpointLabel(id: string) {
  return id.replaceAll('-', ' ')
}
