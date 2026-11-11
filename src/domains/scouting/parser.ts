import { METRICS, ROLES, SCOUTING_RULES, SCOUTING_VERSION, TRENDS, reportKey, type ScoutingArtifact } from './model.ts'

type Raw = Record<string, unknown>

function ensure(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid scouting reports at ${path}`)
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
function whole(value: unknown, path: string): asserts value is number {
  ensure(typeof value === 'number' && Number.isSafeInteger(value), path)
}
function flag(value: unknown, path: string): asserts value is boolean {
  ensure(typeof value === 'boolean', path)
}
function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function date(value: unknown, path: string, nullable = false) {
  ensure(isDate(value) || (nullable && value === null), path)
}
function list(value: unknown, path: string, max: number): unknown[] {
  ensure(Array.isArray(value) && value.length <= max, path)
  return value as unknown[]
}
function winCount(value: unknown, path: string, cap = Number.MAX_SAFE_INTEGER) {
  const raw = record(value, path, ['games', 'wins'])
  count(raw.games, `${path}.games`, cap)
  count(raw.wins, `${path}.wins`, raw.games)
}
function tally(value: unknown, path: string, cap = Number.MAX_SAFE_INTEGER) {
  const raw = record(value, path, ['games', 'hits'])
  count(raw.games, `${path}.games`, cap)
  count(raw.hits, `${path}.hits`, raw.games)
}
function lane(value: unknown, path: string, cap = Number.MAX_SAFE_INTEGER) {
  const raw = record(value, path, ['games', 'behind', 'even', 'ahead'])
  count(raw.games, `${path}.games`, cap)
  for (const key of ['behind', 'even', 'ahead']) count(raw[key], `${path}.${key}`)
  ensure((raw.behind as number) + (raw.even as number) + (raw.ahead as number) === raw.games, path)
}
function gameRef(value: unknown, path: string, champion: boolean) {
  const raw = record(value, path, champion ? ['champion', 'date', 'won', 'against', 'opponent', 'lead'] : ['date', 'won', 'against', 'opponent', 'lead'])
  if (champion) text(raw.champion, `${path}.champion`)
  date(raw.date, `${path}.date`)
  flag(raw.won, `${path}.won`)
  text(raw.against, `${path}.against`)
  text(raw.opponent, `${path}.opponent`)
  ensure(raw.lead === null || (typeof raw.lead === 'number' && Number.isFinite(raw.lead)), `${path}.lead`)
  return raw
}
function newestFirst(games: Raw[], path: string) {
  ensure(games.every((game, i) => i === 0 || (game.date as string) <= (games[i - 1]!.date as string)), path)
}
function matchup(value: unknown, path: string) {
  if (value === null) return
  const raw = record(value, path, ['against', 'games', 'laneGames', 'lead'])
  text(raw.against, `${path}.against`)
  count(raw.games, `${path}.games`)
  count(raw.laneGames, `${path}.laneGames`, raw.games)
  ensure(raw.laneGames >= SCOUTING_RULES.minMatchupGames, `${path}.laneGames`)
  whole(raw.lead, `${path}.lead`)
}

function player(value: unknown, path: string) {
  const raw = record(value, path, ['id', 'name', 'role', 'teamId', 'team', 'league', 'games', 'wins', 'last', 'recent', 'pool', 'form', 'before', 'lane', 'observed', 'facts'])
  for (const key of ['id', 'name', 'teamId', 'team']) text(raw[key], `${path}.${key}`)
  ensure(ROLES.includes(raw.role as typeof ROLES[number]), `${path}.role`)
  ensure(raw.league === null || (typeof raw.league === 'string' && raw.league.trim().length > 0), `${path}.league`)
  count(raw.games, `${path}.games`)
  ensure((raw.games as number) >= SCOUTING_RULES.minGames, `${path}.games`)
  count(raw.wins, `${path}.wins`, raw.games as number)
  date(raw.last, `${path}.last`)
  const recent = record(raw.recent, `${path}.recent`, ['games', 'champions'])
  count(recent.games, `${path}.recent.games`, raw.games as number)
  count(recent.champions, `${path}.recent.champions`, recent.games as number)

  const champions = new Set<string>()
  const pool = list(raw.pool, `${path}.pool`, SCOUTING_RULES.poolRows)
  for (const [i, entry] of pool.entries()) {
    const p = `${path}.pool[${i}]`
    const row = record(entry, p, ['champion', 'all', 'recent', 'trend', 'lead', 'last'])
    text(row.champion, `${p}.champion`)
    ensure(!champions.has(row.champion), `${p}.champion`)
    champions.add(row.champion)
    winCount(row.all, `${p}.all`, raw.games as number)
    winCount(row.recent, `${p}.recent`, (row.all as Raw).games as number)
    ensure(((row.recent as Raw).wins as number) <= ((row.all as Raw).wins as number), `${p}.recent`)
    ensure(TRENDS.includes(row.trend as typeof TRENDS[number]), `${p}.trend`)
    if (row.lead !== null) {
      const lead = record(row.lead, `${p}.lead`, ['mean', 'games'])
      whole(lead.mean, `${p}.lead.mean`)
      count(lead.games, `${p}.lead.games`, (row.all as Raw).games as number)
      ensure((lead.games as number) >= SCOUTING_RULES.minChampionLaneGames, `${p}.lead.games`)
    }
    const last = list(row.last, `${p}.last`, 5).map((game, j) => gameRef(game, `${p}.last[${j}]`, false))
    ensure(last.length === Math.min(5, (row.all as Raw).games as number), `${p}.last`)
    newestFirst(last, `${p}.last`)
  }
  const form = list(raw.form, `${path}.form`, SCOUTING_RULES.formGames).map((game, i) => gameRef(game, `${path}.form[${i}]`, true))
  ensure(form.length === Math.min(SCOUTING_RULES.formGames, raw.games as number) && form[0]!.date === raw.last, `${path}.form`)
  newestFirst(form, `${path}.form`)
  winCount(raw.before, `${path}.before`, SCOUTING_RULES.formGames)
  ensure((raw.before as Raw).games === Math.min(SCOUTING_RULES.formGames, (raw.games as number) - form.length), `${path}.before`)
  lane(raw.lane, `${path}.lane`, raw.games as number)

  const observed = record(raw.observed, `${path}.observed`, METRICS.map(metric => metric.key))
  for (const [key, entry] of Object.entries(observed)) {
    const m = `${path}.observed.${key}`
    const mean = record(entry, m, ['mean', 'games'])
    ensure(typeof mean.mean === 'number' && Number.isFinite(mean.mean), `${m}.mean`)
    count(mean.games, `${m}.games`, raw.games as number)
    ensure((mean.games as number) > 0, `${m}.games`)
    if (key === 'kp') ensure((mean.mean as number) >= 0 && (mean.mean as number) <= 1, m)
    if (key !== 'gd15') ensure((mean.mean as number) >= 0, m)
  }
  const facts = record(raw.facts, `${path}.facts`, ['behind', 'ahead', 'deathless', 'best', 'worst', 'hardest', 'easiest'])
  for (const key of ['behind', 'ahead', 'deathless']) tally(facts[key], `${path}.facts.${key}`, raw.games as number)
  ensure(((facts.behind as Raw).games as number) <= ((raw.lane as Raw).games as number), `${path}.facts.behind`)
  ensure((facts.best === null) === (facts.worst === null), `${path}.facts.best`)
  if (facts.best !== null) {
    const best = gameRef(facts.best, `${path}.facts.best`, true)
    const worst = gameRef(facts.worst, `${path}.facts.worst`, true)
    ensure(typeof best.lead === 'number' && typeof worst.lead === 'number' && best.lead >= worst.lead, `${path}.facts.best`)
  }
  matchup(facts.hardest, `${path}.facts.hardest`)
  matchup(facts.easiest, `${path}.facts.easiest`)
  ensure(facts.easiest === null || facts.hardest !== null, `${path}.facts.easiest`)
}

export function parseScoutingArtifact(input: unknown): ScoutingArtifact {
  const raw = record(input, 'artifact', ['version', 'sourceSha256', 'through', 'since', 'countedGames', 'excludedGames', 'excludedByReason', 'rules', 'roles', 'players'])
  ensure(raw.version === SCOUTING_VERSION, 'version')
  ensure(typeof raw.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(raw.sourceSha256), 'sourceSha256')
  date(raw.through, 'through', true)
  date(raw.since, 'since', true)
  ensure((raw.through === null) === (raw.since === null) && (raw.through === null || (raw.since as string) <= (raw.through as string)), 'since')
  count(raw.countedGames, 'countedGames')
  count(raw.excludedGames, 'excludedGames')
  const reasons = record(raw.excludedByReason, 'excludedByReason', ['other-provider', 'incomplete-pair', 'missing-team-id', 'champion-identity'])
  let excluded = 0
  for (const key of ['other-provider', 'incomplete-pair', 'missing-team-id', 'champion-identity']) { count(reasons[key], `excludedByReason.${key}`); excluded += reasons[key] as number }
  ensure(excluded === raw.excludedGames, 'excludedGames')
  ensure(JSON.stringify(raw.rules) === JSON.stringify(SCOUTING_RULES), 'rules')
  const roles = record(raw.roles, 'roles', ROLES)
  for (const role of ROLES) {
    const p = `roles.${role}`
    const baseline = record(roles[role], p, ['lane', 'behind', 'ahead', 'deathless'])
    lane(baseline.lane, `${p}.lane`)
    for (const key of ['behind', 'ahead', 'deathless']) tally(baseline[key], `${p}.${key}`)
  }
  const players = list(raw.players, 'players', Number.MAX_SAFE_INTEGER)
  const keys = new Set<string>()
  for (const [i, entry] of players.entries()) {
    player(entry, `players[${i}]`)
    const key = reportKey(entry as { id: string; role: typeof ROLES[number] })
    ensure(!keys.has(key), `players[${i}].duplicateIdentity`)
    keys.add(key)
    ensure(raw.through !== null && ((entry as Raw).last as string) <= (raw.through as string), `players[${i}].last`)
  }
  return raw as unknown as ScoutingArtifact
}
