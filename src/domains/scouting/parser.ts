import { METRICS, ROLES, SCOUTING_RULES, SCOUTING_VERSION, reportKey, type ScoutingIndex, type ScoutingPlayer, type ScoutingShard } from './model.ts'

type Raw = Record<string, unknown>

/** Fields the publication pipeline adds to every artifact. They carry no scouting data. */
const PUBLICATION_KEYS = ['artifactMeta', 'generatedAt', 'modelVersion', 'modelConfigHash', 'schemaVersion']

function ensure(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid scouting data at ${path}`)
}
function record(value: unknown, path: string, allowed: readonly string[]): Raw {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value), path)
  ensure(Object.keys(value as Raw).every(key => allowed.includes(key)), path)
  return value as Raw
}
function text(value: unknown, path: string): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0, path)
}
function count(value: unknown, path: string, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  ensure(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max, path)
}
/** Deep equality that ignores key order, because the published form sorts keys. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue((a as Raw)[key], (b as Raw)[key]))
}
function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function date(value: unknown, path: string, nullable = false) {
  ensure(isDate(value) || (nullable && value === null), path)
}
function list(value: unknown, path: string): unknown[] {
  ensure(Array.isArray(value), path)
  return value as unknown[]
}
function tally(value: unknown, path: string) {
  const raw = record(value, path, ['games', 'hits'])
  count(raw.games, `${path}.games`)
  count(raw.hits, `${path}.hits`, raw.games)
}
function lane(value: unknown, path: string) {
  const raw = record(value, path, ['games', 'behind', 'even', 'ahead'])
  count(raw.games, `${path}.games`)
  for (const key of ['behind', 'even', 'ahead']) count(raw[key], `${path}.${key}`)
  ensure((raw.behind as number) + (raw.even as number) + (raw.ahead as number) === raw.games, path)
}
/** A game value or a mean of them. Deaths in one game are a whole number; their mean is not. */
function metricValue(key: string, value: unknown, path: string, oneGame: boolean) {
  ensure(typeof value === 'number' && Number.isFinite(value), path)
  if (key !== 'gd15') ensure(value >= 0, path)
  if (key === 'kp') ensure(value <= 1, path)
  if (key === 'deaths' && oneGame) ensure(Number.isSafeInteger(value), path)
}
const METRIC_KEYS = METRICS.map(metric => metric.key)

function player(value: unknown, path: string, through: string) {
  const raw = record(value, path, ['id', 'name', 'role', 'teamId', 'team', 'league', 'games', 'last', 'recent', 'observed', 'url'])
  for (const key of ['id', 'name', 'teamId', 'team', 'url']) text(raw[key], `${path}.${key}`)
  ensure((raw.url as string).startsWith('/data/'), `${path}.url`)
  ensure(ROLES.includes(raw.role as typeof ROLES[number]), `${path}.role`)
  ensure(raw.league === null || (typeof raw.league === 'string' && raw.league.trim().length > 0), `${path}.league`)
  count(raw.games, `${path}.games`)
  ensure((raw.games as number) >= 1, `${path}.games`)
  date(raw.last, `${path}.last`)
  ensure((raw.last as string) <= through, `${path}.last`)
  count(raw.recent, `${path}.recent`, raw.games as number)
  const observed = record(raw.observed, `${path}.observed`, METRIC_KEYS)
  for (const [key, entry] of Object.entries(observed)) {
    const mean = record(entry, `${path}.observed.${key}`, ['mean', 'games'])
    metricValue(key, mean.mean, `${path}.observed.${key}.mean`, false)
    count(mean.games, `${path}.observed.${key}.games`, raw.games as number)
    ensure((mean.games as number) > 0, `${path}.observed.${key}.games`)
  }
}

export function parseScoutingIndex(input: unknown): ScoutingIndex {
  const raw = record(input, 'index', ['artifactKind', 'version', 'through', 'since', 'countedGames', 'excludedGames', 'excludedByReason', 'rules', 'roles', 'players', ...PUBLICATION_KEYS])
  ensure(raw.artifactKind === 'scouting-index', 'artifactKind')
  ensure(raw.version === SCOUTING_VERSION, 'version')
  date(raw.through, 'through', true)
  date(raw.since, 'since', true)
  ensure((raw.through === null) === (raw.since === null) && (raw.through === null || (raw.since as string) <= (raw.through as string)), 'since')
  count(raw.countedGames, 'countedGames')
  count(raw.excludedGames, 'excludedGames')
  const reasons = record(raw.excludedByReason, 'excludedByReason', ['other-provider', 'incomplete-pair', 'missing-team-id', 'champion-identity'])
  let excluded = 0
  for (const key of ['other-provider', 'incomplete-pair', 'missing-team-id', 'champion-identity']) { count(reasons[key], `excludedByReason.${key}`); excluded += reasons[key] as number }
  ensure(excluded === raw.excludedGames, 'excludedGames')
  ensure(sameValue(raw.rules, SCOUTING_RULES), 'rules')
  const roles = record(raw.roles, 'roles', ROLES)
  for (const role of ROLES) {
    const baseline = record(roles[role], `roles.${role}`, ['lane', 'behind', 'ahead', 'deathless'])
    lane(baseline.lane, `roles.${role}.lane`)
    for (const key of ['behind', 'ahead', 'deathless']) tally(baseline[key], `roles.${role}.${key}`)
  }
  const players = list(raw.players, 'players')
  ensure(players.length === 0 || raw.through !== null, 'through')
  const keys = new Set<string>()
  for (const [i, entry] of players.entries()) {
    player(entry, `players[${i}]`, raw.through as string)
    const key = reportKey(entry as ScoutingPlayer)
    ensure(!keys.has(key), `players[${i}].duplicateIdentity`)
    keys.add(key)
  }
  return {
    artifactKind: 'scouting-index', version: SCOUTING_VERSION, through: raw.through as string | null, since: raw.since as string | null,
    countedGames: raw.countedGames, excludedGames: raw.excludedGames, excludedByReason: reasons as ScoutingIndex['excludedByReason'],
    rules: SCOUTING_RULES, roles: roles as ScoutingIndex['roles'], players: players as ScoutingPlayer[],
  }
}

/** Parses one player's games and checks that they belong to the index entry that linked to them. */
export function parseScoutingShard(input: unknown, owner: ScoutingPlayer): ScoutingShard {
  const raw = record(input, 'shard', ['artifactKind', 'version', 'id', 'role', 'games', ...PUBLICATION_KEYS])
  ensure(raw.artifactKind === 'scouting-player', 'artifactKind')
  ensure(raw.version === SCOUTING_VERSION, 'version')
  ensure(raw.id === owner.id && raw.role === owner.role, 'id')
  const games = list(raw.games, 'games')
  ensure(games.length === owner.games, 'games')
  for (const [i, entry] of games.entries()) {
    const path = `games[${i}]`
    const game = record(entry, path, ['date', 'champion', 'won', 'against', 'opponent', 'values'])
    date(game.date, `${path}.date`)
    ensure(i === 0 || (game.date as string) >= ((games[i - 1] as Raw).date as string), `${path}.date`)
    for (const key of ['champion', 'against', 'opponent']) text(game[key], `${path}.${key}`)
    ensure(typeof game.won === 'boolean', `${path}.won`)
    const values = record(game.values, `${path}.values`, METRIC_KEYS)
    for (const [key, value] of Object.entries(values)) metricValue(key, value, `${path}.values.${key}`, true)
  }
  ensure(games.length === 0 || (games.at(-1) as Raw).date === owner.last, 'last')
  return { artifactKind: 'scouting-player', version: SCOUTING_VERSION, id: owner.id, role: owner.role, games: games as ScoutingShard['games'] }
}
