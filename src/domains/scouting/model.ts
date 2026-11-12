import type { Role } from '../rankings/types.ts'

export const SCOUTING_VERSION = 'scouting-v2'
export const ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as const satisfies readonly Role[]

/** Every threshold a report depends on. The artifact stores a copy so a stale file is rejected on load. */
export const SCOUTING_RULES = {
  source: 'complete-paired-oracles-elixir',
  /** Games a player needs before the report is shown. Fewer games give numbers that mostly reflect chance. */
  minGames: 20,
  /** Games a peer needs to set ranks and bands for a role. */
  minFieldGames: 60,
  /** Games with a measure needed before that measure is ranked. */
  minMetricGames: 20,
  /** Recent window, in days before the newest game on record. */
  windowDays: 90,
  poolRows: 8,
  formGames: 10,
  /** Gold lead at 15 minutes that counts as ahead or behind. */
  laneBin: 500,
  minMatchupGames: 5,
  minChampionLaneGames: 8,
  /** Fewer games than this never get an above or below average verdict. */
  minVerdictGames: 15,
  trend: { newRecentGames: 2, risingRecentGames: 3, risingShareRatio: 1.6, fadingAllGames: 8, fadingShareRatio: 0.5 },
} as const

export type Metric = {
  key: string
  label: string
  better: 'high' | 'low'
  format: 'signed' | 'decimal' | 'integer' | 'percent'
}
export const METRICS = [
  { key: 'gd15', label: 'Lead at 15 minutes', better: 'high', format: 'signed' },
  { key: 'csm', label: 'Farm per minute', better: 'high', format: 'decimal' },
  { key: 'dpm', label: 'Damage per minute', better: 'high', format: 'integer' },
  { key: 'kp', label: 'Kill participation', better: 'high', format: 'percent' },
  { key: 'deaths', label: 'Deaths per game', better: 'low', format: 'decimal' },
] as const satisfies readonly Metric[]
export type MetricKey = typeof METRICS[number]['key']

export type WinCount = { games: number; wins: number }
/** `hits` out of `games`. Its meaning is set by the field that holds it. */
export type Tally = { games: number; hits: number }
export type Trend = 'new' | 'rising' | 'steady' | 'fading' | 'dropped'
export const TRENDS = ['new', 'rising', 'steady', 'fading', 'dropped'] as const satisfies readonly Trend[]
/** Gold lead at 15 minutes against the opposing player in the same role. Null when the game has no lane data. */
export type GameRef = { date: string; won: boolean; against: string; opponent: string; lead: number | null }
export type PlayedGame = GameRef & { champion: string }
export type ChampionRow = {
  champion: string
  all: WinCount
  recent: WinCount
  trend: Trend
  /** Mean lead on this champion. Null under the minimum lane games. */
  lead: { mean: number; games: number } | null
  /** Newest first. */
  last: GameRef[]
}
/** Counts of games with lane data, split by lead at 15 minutes. */
export type LaneSplit = { games: number; behind: number; even: number; ahead: number }
export type Matchup = { against: string; games: number; laneGames: number; lead: number }
export type ObservedMean = { mean: number; games: number }

export type PlayerReport = {
  id: string
  name: string
  role: Role
  teamId: string
  team: string
  league: string | null
  games: number
  wins: number
  /** Date of the newest game. */
  last: string
  recent: { games: number; champions: number }
  pool: ChampionRow[]
  /** Newest first. */
  form: PlayedGame[]
  /** The games before `form`, up to the same count. */
  before: WinCount
  lane: LaneSplit
  observed: Partial<Record<MetricKey, ObservedMean>>
  facts: {
    /** Wins in games that were 500 or more gold behind at 15 minutes. */
    behind: Tally
    /** Wins in games that were 500 or more gold ahead at 15 minutes. */
    ahead: Tally
    /** Games with zero deaths. */
    deathless: Tally
    best: PlayedGame | null
    worst: PlayedGame | null
    hardest: Matchup | null
    easiest: Matchup | null
  }
}

/** The same counts as a player report, over every player in a role. */
export type RoleBaseline = { lane: LaneSplit; behind: Tally; ahead: Tally; deathless: Tally }

/** One counted game for one player, as played. The lane lead is `values.gd15`. */
export type GameRow = {
  date: string
  champion: string
  won: boolean
  /** Champion of the opposing player in the same role. */
  against: string
  /** Name of the opposing player in the same role. */
  opponent: string
  values: Partial<Record<MetricKey, number>>
}

/** What the index knows about a player: enough to list, rank and link, without the games. */
export type ScoutingPlayer = {
  id: string
  name: string
  role: Role
  teamId: string
  team: string
  league: string | null
  games: number
  /** Date of the newest game. */
  last: string
  /** Games inside the recent window. */
  recent: number
  observed: Partial<Record<MetricKey, ObservedMean>>
  /** The player's games. */
  url: string
}

export type ExclusionReason = 'other-provider' | 'incomplete-pair' | 'missing-team-id' | 'champion-identity'

export type ScoutingIndex = {
  artifactKind: 'scouting-index'
  version: typeof SCOUTING_VERSION
  /** Date of the newest counted game. */
  through: string | null
  /** Date of the oldest counted game. */
  since: string | null
  countedGames: number
  excludedGames: number
  excludedByReason: Record<ExclusionReason, number>
  rules: typeof SCOUTING_RULES
  roles: Record<Role, RoleBaseline>
  players: ScoutingPlayer[]
}

/** One player's games in one role, oldest first in play order. It changes only when one of these games changes. */
export type ScoutingShard = {
  artifactKind: 'scouting-player'
  version: typeof SCOUTING_VERSION
  id: string
  role: Role
  games: GameRow[]
}

export function reportKey(player: Pick<PlayerReport, 'id' | 'role'>) {
  return `${player.id}|${player.role}`
}
