import type { MatchRecord, MatchRosterSnapshot, PlayerGameStats, Role } from '../rankings/types.ts'
import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'
import {
  METRICS, ROLES, SCOUTING_RULES as RULES, SCOUTING_VERSION, reportKey,
  type ChampionRow, type GameRef, type LaneSplit, type Matchup, type MetricKey, type PlayedGame, type PlayerReport,
  type RoleBaseline, type ScoutingArtifact, type Tally, type Trend, type WinCount,
} from './model.ts'

type Row = {
  date: string
  champion: string
  won: boolean
  against: string
  opponent: string
  lead: number | null
  values: Partial<Record<MetricKey, number>>
  deaths: number | null
}
type Identity = { id: string; name: string; role: Role; teamId: string; team: string; league: string | null }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0
const NO_CHAMPION = new Set(['none', 'unknown', 'n/a'])
/** Adding zero turns -0 into 0, so a value never differs from its JSON copy. */
const round = (value: number) => Math.round(value * 1000) / 1000 + 0
const whole = (value: number) => Math.round(value) + 0
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const MEASURES: Record<MetricKey, (stats: PlayerGameStats) => number | undefined> = {
  gd15: stats => finite(stats.goldDiffAt15) ? stats.goldDiffAt15 + 0 : undefined,
  csm: stats => nonnegative(stats.csPerMinute) ? stats.csPerMinute : undefined,
  dpm: stats => nonnegative(stats.damagePerMinute) ? stats.damagePerMinute : undefined,
  kp: stats => nonnegative(stats.killParticipation) && stats.killParticipation <= 1 ? stats.killParticipation : undefined,
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

const wins = (rows: readonly Row[]) => rows.filter(row => row.won).length
const winCount = (rows: readonly Row[]): WinCount => ({ games: rows.length, wins: wins(rows) })
const emptyLane = (): LaneSplit => ({ games: 0, behind: 0, even: 0, ahead: 0 })
const emptyBaseline = (): RoleBaseline => ({ lane: emptyLane(), behind: { games: 0, hits: 0 }, ahead: { games: 0, hits: 0 }, deathless: { games: 0, hits: 0 } })

function laneFacts(rows: readonly Row[]): RoleBaseline {
  const part = emptyBaseline()
  for (const row of rows) {
    if (row.lead !== null) {
      part.lane.games++
      if (row.lead <= -RULES.laneBin) { part.lane.behind++; part.behind.games++; part.behind.hits += Number(row.won) }
      else if (row.lead >= RULES.laneBin) { part.lane.ahead++; part.ahead.games++; part.ahead.hits += Number(row.won) }
      else part.lane.even++
    }
    if (row.deaths !== null) { part.deathless.games++; part.deathless.hits += Number(row.deaths === 0) }
  }
  return part
}
function addTally(total: Tally, part: Tally) {
  total.games += part.games
  total.hits += part.hits
}
function addBaseline(total: RoleBaseline, part: RoleBaseline) {
  for (const key of ['games', 'behind', 'even', 'ahead'] as const) total.lane[key] += part.lane[key]
  addTally(total.behind, part.behind)
  addTally(total.ahead, part.ahead)
  addTally(total.deathless, part.deathless)
}

const ref = (row: Row): GameRef => ({ date: row.date, won: row.won, against: row.against, opponent: row.opponent, lead: row.lead })
const played = (row: Row): PlayedGame => ({ champion: row.champion, ...ref(row) })

function push<K>(groups: Map<K, Row[]>, key: K, row: Row) {
  const group = groups.get(key)
  if (group) group.push(row)
  else groups.set(key, [row])
}
function groupBy<K>(rows: readonly Row[], key: (row: Row) => K) {
  const groups = new Map<K, Row[]>()
  for (const row of rows) push(groups, key(row), row)
  return groups
}

function trendOf(firstSeen: string, cutoff: string, all: WinCount, recent: WinCount, totalGames: number, recentGames: number): Trend {
  const rule = RULES.trend
  const shareAll = all.games / totalGames
  const shareRecent = recentGames ? recent.games / recentGames : 0
  if (firstSeen > cutoff && recent.games >= rule.newRecentGames) return 'new'
  if (recent.games >= rule.risingRecentGames && shareRecent >= rule.risingShareRatio * shareAll) return 'rising'
  if (all.games >= rule.fadingAllGames && recent.games === 0) return 'dropped'
  if (all.games >= rule.fadingAllGames && shareRecent <= rule.fadingShareRatio * shareAll) return 'fading'
  return 'steady'
}

function pool(rows: readonly Row[], cutoff: string, recentRows: readonly Row[]): ChampionRow[] {
  const recentBy = groupBy(recentRows, row => row.champion)
  const all = [...groupBy(rows, row => row.champion)].map(([champion, own]): ChampionRow => {
    const recent = recentBy.get(champion) ?? []
    const all = winCount(own)
    const leads = own.flatMap(row => row.lead === null ? [] : [row.lead])
    return {
      champion, all, recent: winCount(recent),
      trend: trendOf(own[0]!.date, cutoff, all, winCount(recent), rows.length, recentRows.length),
      lead: leads.length >= RULES.minChampionLaneGames ? { mean: whole(mean(leads)), games: leads.length } : null,
      last: own.slice(-5).reverse().map(ref),
    }
  })
  // A player with few games has no champion that passes the bar, so show every champion instead of none.
  const regular = all.filter(row => row.all.games >= 5 || row.recent.games >= 2)
  return (regular.length ? regular : all)
    .sort((a, b) => b.recent.games - a.recent.games || b.all.games - a.all.games || compareCodeUnits(a.champion, b.champion))
    .slice(0, RULES.poolRows)
}

function matchups(rows: readonly Row[]): Matchup[] {
  return [...groupBy(rows, row => row.against)].flatMap(([against, own]) => {
    const leads = own.flatMap(row => row.lead === null ? [] : [row.lead])
    return leads.length >= RULES.minMatchupGames ? [{ against, games: own.length, laneGames: leads.length, lead: whole(mean(leads)) }] : []
  }).sort((a, b) => a.lead - b.lead || b.games - a.games || compareCodeUnits(a.against, b.against))
}

function report(identity: Identity, rows: readonly Row[], cutoff: string): PlayerReport {
  const recentRows = rows.filter(row => row.date > cutoff)
  let best: Row | undefined
  let worst: Row | undefined
  for (const row of rows) {
    if (row.lead === null) continue
    if (!best || row.lead >= best.lead!) best = row
    if (!worst || row.lead <= worst.lead!) worst = row
  }
  const against = matchups(rows)
  const facts = laneFacts(rows)
  const form = rows.slice(-RULES.formGames)
  const observed: PlayerReport['observed'] = {}
  for (const { key } of METRICS) {
    const values = rows.flatMap(row => row.values[key] === undefined ? [] : [row.values[key]!])
    if (values.length) observed[key] = { mean: round(mean(values)), games: values.length }
  }
  return {
    ...identity, games: rows.length, wins: wins(rows), last: rows.at(-1)!.date,
    recent: { games: recentRows.length, champions: new Set(recentRows.map(row => row.champion)).size },
    pool: pool(rows, cutoff, recentRows),
    form: form.map(played).reverse(),
    before: winCount(rows.slice(-2 * RULES.formGames, -RULES.formGames)),
    lane: facts.lane, observed,
    facts: {
      behind: facts.behind, ahead: facts.ahead, deathless: facts.deathless,
      best: best ? played(best) : null, worst: worst ? played(worst) : null,
      hardest: against[0] ?? null, easiest: against.length > 1 ? against.at(-1)! : null,
    },
  }
}

const dayMs = 86_400_000

export function buildScoutingReports(matches: readonly MatchRecord[], sourceSha256: string): ScoutingArtifact {
  // Games in one series share a placeholder time. The game number orders them when present. Otherwise the input order
  // does, because the source lists games in play order and game ids do not. Form and "newest first" depend on it.
  const sorted = [...matches].sort((a, b) => compareCodeUnits(a.date, b.date)
    || compareCodeUnits(a.datetimeUtc ?? '', b.datetimeUtc ?? '') || (a.gameNumber ?? 0) - (b.gameNumber ?? 0))
  if (new Set(sorted.map(match => match.id)).size !== sorted.length) throw new Error('Duplicate scouting input game identity')
  const excludedByReason: ScoutingArtifact['excludedByReason'] = { 'other-provider': 0, 'incomplete-pair': 0, 'missing-team-id': 0, 'champion-identity': 0 }
  const identities = new Map<string, Identity>()
  const rowsBy = new Map<string, Row[]>()
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
        const values: Row['values'] = {}
        for (const { key: metric } of METRICS) { const value = MEASURES[metric](stats); if (value !== undefined) values[metric] = value }
        const previous = identities.get(key)
        identities.set(key, { id: appearance.id, name: appearance.name, role: appearance.role, teamId: own.teamId!, team: match[`team${side}`], league: league ?? previous?.league ?? null })
        push(rowsBy, key, {
          date: match.date, champion: stats.champion!.trim(), won: stats.won, against: opposing.stats!.champion!.trim(), opponent: opposing.name,
          lead: values.gd15 ?? null, values, deaths: values.deaths ?? null,
        })
      }
    }
  }
  const roles = Object.fromEntries(ROLES.map(role => [role, emptyBaseline()])) as Record<Role, RoleBaseline>
  const players: PlayerReport[] = []
  const cutoff = through ? new Date(Date.parse(through) - RULES.windowDays * dayMs).toISOString().slice(0, 10) : ''
  for (const [key, rows] of [...rowsBy].sort(([x], [y]) => compareCodeUnits(x, y))) {
    const identity = identities.get(key)!
    addBaseline(roles[identity.role], laneFacts(rows))
    players.push(report(identity, rows, cutoff))
  }
  return {
    version: SCOUTING_VERSION, sourceSha256, through, since, countedGames: counted, excludedGames: sorted.length - counted, excludedByReason,
    rules: RULES, roles, players,
  }
}
