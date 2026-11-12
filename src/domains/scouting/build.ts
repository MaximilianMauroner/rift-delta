import type { PublicArtifactFamily } from '../rankings/artifact-write.ts'
import type { MatchRecord, MatchRosterSnapshot, PlayerGameStats, Role } from '../rankings/types.ts'
import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'
import { addBaseline, emptyBaseline, laneFacts, observedMeans, recentCutoff } from './compute.ts'
import {
  METRICS, ROLES, SCOUTING_RULES as RULES, SCOUTING_VERSION, reportKey,
  type ExclusionReason, type GameRow, type MetricKey, type RoleBaseline, type ScoutingIndex, type ScoutingPlayer, type ScoutingShard,
} from './model.ts'
import { parseScoutingIndex, parseScoutingShard } from './parser.ts'

export const SCOUTING_INDEX_PATH = 'scouting/index.json'
export const SCOUTING_SHARD_DIR = 'scouting/players'

/** Data path of one player's games. Ids keep only safe characters, so two ids could meet; the builder rejects that. */
export function scoutingShardPath(player: { id: string; role: Role }) {
  return `${SCOUTING_SHARD_DIR}/${player.id.replace(/[^A-Za-z0-9_-]/g, '_')}_${player.role}.json`
}

type Identity = Omit<ScoutingPlayer, 'games' | 'last' | 'recent' | 'observed' | 'url'>

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0
const NO_CHAMPION = new Set(['none', 'unknown', 'n/a'])

/** Three decimals is finer than any value the report shows, and keeps each player's file small. */
const round = (value: number) => Math.round(value * 1000) / 1000

const MEASURES: Record<MetricKey, (stats: PlayerGameStats) => number | undefined> = {
  gd15: stats => finite(stats.goldDiffAt15) ? Math.round(stats.goldDiffAt15) + 0 : undefined,
  csm: stats => nonnegative(stats.csPerMinute) ? round(stats.csPerMinute) : undefined,
  dpm: stats => nonnegative(stats.damagePerMinute) ? round(stats.damagePerMinute) : undefined,
  kp: stats => nonnegative(stats.killParticipation) && stats.killParticipation <= 1 ? round(stats.killParticipation) : undefined,
  deaths: stats => Number.isSafeInteger(stats.deaths) && stats.deaths >= 0 ? stats.deaths : undefined,
}

function complete(roster: MatchRosterSnapshot | undefined): roster is MatchRosterSnapshot {
  return Boolean(roster?.sourceProvider === 'oracles-elixir' && roster.completeness === 'complete-five-role'
    && roster.players.length === 5 && new Set(roster.players.map(player => player.id)).size === 5
    && ROLES.every(role => roster.players.filter(player => player.role === role).length === 1)
    && roster.players.every(player => player.id?.trim() && player.name?.trim() && player.stats))
}

/** Pro games never repeat a champion, so ten distinct names is the check that the picks were read correctly. */
function champions(a: MatchRosterSnapshot, b: MatchRosterSnapshot) {
  const names = [...a.players, ...b.players].map(player => player.stats!.champion?.trim() ?? '')
  return names.every(name => name && !NO_CHAMPION.has(name.toLowerCase())) && new Set(names).size === 10
}

/**
 * The scouting index and one games file per player and role. A file holds only that player's games, so a new or
 * corrected game changes the index and the files of the ten players in it, and no other file.
 */
export function buildScouting(matches: readonly MatchRecord[], urlForPath: (relativePath: string) => string) {
  // Games in one series share a placeholder time. The game number orders them when present. Otherwise the input order
  // does, because the source lists games in play order and game ids do not. Form and "newest first" depend on it.
  const sorted = [...matches].sort((a, b) => compareCodeUnits(a.date, b.date)
    || compareCodeUnits(a.datetimeUtc ?? '', b.datetimeUtc ?? '') || (a.gameNumber ?? 0) - (b.gameNumber ?? 0))
  if (new Set(sorted.map(match => match.id)).size !== sorted.length) throw new Error('Duplicate scouting input game identity')
  const excludedByReason: Record<ExclusionReason, number> = { 'other-provider': 0, 'incomplete-pair': 0, 'missing-team-id': 0, 'champion-identity': 0 }
  const identities = new Map<string, Identity>()
  const rowsBy = new Map<string, GameRow[]>()
  let counted = 0
  let since: string | null = null
  let through: string | null = null
  for (const match of sorted) {
    const a = match.teamARoster
    const b = match.teamBRoster
    const reason = match.sourceProvider !== 'oracles-elixir' ? 'other-provider'
      : !complete(a) || !complete(b) || new Set([...a.players, ...b.players].map(player => player.id)).size !== 10 ? 'incomplete-pair'
        : !a.teamId?.trim() || !b.teamId?.trim() || a.teamId === b.teamId ? 'missing-team-id'
          : !champions(a, b) ? 'champion-identity' : undefined
    if (reason) { excludedByReason[reason]++; continue }
    counted++
    since ??= match.date
    through = match.date
    for (const side of ['A', 'B'] as const) {
      const own = match[`team${side}Roster`]!
      const foe = match[`team${side === 'A' ? 'B' : 'A'}Roster`]!
      const league = match[`team${side}HomeLeague`]?.trim() || null
      for (const appearance of own.players) {
        const key = reportKey(appearance)
        const opposing = foe.players.find(player => player.role === appearance.role)!
        const stats = appearance.stats!
        const values: GameRow['values'] = {}
        for (const { key: metric } of METRICS) { const value = MEASURES[metric](stats); if (value !== undefined) values[metric] = value }
        const previous = identities.get(key)
        identities.set(key, { id: appearance.id, name: appearance.name, role: appearance.role, teamId: own.teamId!, team: match[`team${side}`], league: league ?? previous?.league ?? null })
        const row: GameRow = { date: match.date, champion: stats.champion!.trim(), won: stats.won, against: opposing.stats!.champion!.trim(), opponent: opposing.name, values }
        const rows = rowsBy.get(key)
        if (rows) rows.push(row)
        else rowsBy.set(key, [row])
      }
    }
  }
  const roles = Object.fromEntries(ROLES.map(role => [role, emptyBaseline()])) as Record<Role, RoleBaseline>
  const cutoff = through ? recentCutoff(through) : ''
  const players: ScoutingPlayer[] = []
  const shards: Record<string, ScoutingShard> = {}
  for (const [key, rows] of [...rowsBy].sort(([x], [y]) => compareCodeUnits(x, y))) {
    const identity = identities.get(key)!
    addBaseline(roles[identity.role], laneFacts(rows))
    const path = scoutingShardPath(identity)
    if (shards[path]) throw new Error(`Two scouting players share the file ${path}`)
    shards[path] = { artifactKind: 'scouting-player', version: SCOUTING_VERSION, id: identity.id, role: identity.role, games: rows }
    players.push({
      ...identity, games: rows.length, last: rows.at(-1)!.date, recent: rows.filter(row => row.date > cutoff).length,
      observed: observedMeans(rows), url: urlForPath(path),
    })
  }
  const index: ScoutingIndex = {
    artifactKind: 'scouting-index', version: SCOUTING_VERSION, through, since, countedGames: counted, excludedGames: sorted.length - counted,
    excludedByReason, rules: RULES, roles, players,
  }
  return { index, shards }
}

/** The scouting index and player files, for the public artifact writer. */
export function scoutingFamily(matches: readonly MatchRecord[]): PublicArtifactFamily {
  return {
    indexPath: SCOUTING_INDEX_PATH,
    shardDir: SCOUTING_SHARD_DIR,
    manifestUrlKey: 'scoutingIndexUrl',
    create: urlForPath => buildScouting(matches, urlForPath),
    validateIndex: parseScoutingIndex,
    validateShard: index => {
      const owners = new Map((index as ScoutingIndex).players.map(player => [scoutingShardPath(player), player]))
      return value => {
        const shard = value as ScoutingShard
        const owner = owners.get(scoutingShardPath(shard))
        if (!owner) throw new Error(`Invalid scouting data: no index entry for ${shard.id}`)
        return parseScoutingShard(value, owner)
      }
    },
  }
}
