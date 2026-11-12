import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'
import {
  METRICS, SCOUTING_RULES as RULES,
  type ChampionRow, type GameRef, type GameRow, type LaneSplit, type Matchup, type PlayedGame, type PlayerReport,
  type RoleBaseline, type ScoutingPlayer, type ScoutingShard, type Tally, type Trend, type WinCount,
} from './model.ts'

/** Adding zero turns -0 into 0, so a value never differs from its JSON copy. */
const round = (value: number) => Math.round(value * 1000) / 1000 + 0
const whole = (value: number) => Math.round(value) + 0
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const lead = (row: GameRow) => row.values.gd15 ?? null
const dayMs = 86_400_000

/** Games after this date are recent. */
export function recentCutoff(through: string) {
  return new Date(Date.parse(through) - RULES.windowDays * dayMs).toISOString().slice(0, 10)
}

const wins = (rows: readonly GameRow[]) => rows.filter(row => row.won).length
const winCount = (rows: readonly GameRow[]): WinCount => ({ games: rows.length, wins: wins(rows) })
const emptyLane = (): LaneSplit => ({ games: 0, behind: 0, even: 0, ahead: 0 })
export const emptyBaseline = (): RoleBaseline => ({ lane: emptyLane(), behind: { games: 0, hits: 0 }, ahead: { games: 0, hits: 0 }, deathless: { games: 0, hits: 0 } })

export function laneFacts(rows: readonly GameRow[]): RoleBaseline {
  const part = emptyBaseline()
  for (const row of rows) {
    const gold = lead(row)
    if (gold !== null) {
      part.lane.games++
      if (gold <= -RULES.laneBin) { part.lane.behind++; part.behind.games++; part.behind.hits += Number(row.won) }
      else if (gold >= RULES.laneBin) { part.lane.ahead++; part.ahead.games++; part.ahead.hits += Number(row.won) }
      else part.lane.even++
    }
    if (row.values.deaths !== undefined) { part.deathless.games++; part.deathless.hits += Number(row.values.deaths === 0) }
  }
  return part
}

function addTally(total: Tally, part: Tally) {
  total.games += part.games
  total.hits += part.hits
}
export function addBaseline(total: RoleBaseline, part: RoleBaseline) {
  for (const key of ['games', 'behind', 'even', 'ahead'] as const) total.lane[key] += part.lane[key]
  addTally(total.behind, part.behind)
  addTally(total.ahead, part.ahead)
  addTally(total.deathless, part.deathless)
}

export function observedMeans(rows: readonly GameRow[]): PlayerReport['observed'] {
  const observed: PlayerReport['observed'] = {}
  for (const { key } of METRICS) {
    const values = rows.flatMap(row => row.values[key] === undefined ? [] : [row.values[key]!])
    if (values.length) observed[key] = { mean: round(mean(values)), games: values.length }
  }
  return observed
}

const ref = (row: GameRow): GameRef => ({ date: row.date, won: row.won, against: row.against, opponent: row.opponent, lead: lead(row) })
const played = (row: GameRow): PlayedGame => ({ champion: row.champion, ...ref(row) })

function groupBy<K>(rows: readonly GameRow[], key: (row: GameRow) => K) {
  const groups = new Map<K, GameRow[]>()
  for (const row of rows) {
    const group = groups.get(key(row))
    if (group) group.push(row)
    else groups.set(key(row), [row])
  }
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

function pool(rows: readonly GameRow[], cutoff: string, recentRows: readonly GameRow[]): ChampionRow[] {
  const recentBy = groupBy(recentRows, row => row.champion)
  const all = [...groupBy(rows, row => row.champion)].map(([champion, own]): ChampionRow => {
    const recent = recentBy.get(champion) ?? []
    const all = winCount(own)
    const leads = own.flatMap(row => lead(row) === null ? [] : [lead(row)!])
    return {
      champion, all, recent: winCount(recent),
      trend: trendOf(own[0]!.date, cutoff, all, winCount(recent), rows.length, recentRows.length),
      lead: leads.length >= RULES.minChampionLaneGames ? { mean: whole(mean(leads)), games: leads.length } : null,
      last: own.slice(-5).reverse().map(ref),
    }
  })
  // A wide pool can leave no champion over the bar. Then every champion is shown instead of none.
  const regular = all.filter(row => row.all.games >= 5 || row.recent.games >= 2)
  return (regular.length ? regular : all)
    .sort((a, b) => b.recent.games - a.recent.games || b.all.games - a.all.games || compareCodeUnits(a.champion, b.champion))
    .slice(0, RULES.poolRows)
}

function matchups(rows: readonly GameRow[]): Matchup[] {
  return [...groupBy(rows, row => row.against)].flatMap(([against, own]) => {
    const leads = own.flatMap(row => lead(row) === null ? [] : [lead(row)!])
    return leads.length >= RULES.minMatchupGames ? [{ against, games: own.length, laneGames: leads.length, lead: whole(mean(leads)) }] : []
  }).sort((a, b) => a.lead - b.lead || b.games - a.games || compareCodeUnits(a.against, b.against))
}

/** The full report for one player, from the player's games and the date of the newest game on record. */
export function scoutingReport(player: ScoutingPlayer, shard: ScoutingShard, through: string): PlayerReport {
  const rows = shard.games
  const cutoff = recentCutoff(through)
  const recentRows = rows.filter(row => row.date > cutoff)
  let best: GameRow | undefined
  let worst: GameRow | undefined
  for (const row of rows) {
    const gold = lead(row)
    if (gold === null) continue
    if (!best || gold >= lead(best)!) best = row
    if (!worst || gold <= lead(worst)!) worst = row
  }
  const against = matchups(rows)
  const facts = laneFacts(rows)
  return {
    id: player.id, name: player.name, role: player.role, teamId: player.teamId, team: player.team, league: player.league,
    games: rows.length, wins: wins(rows), last: rows.at(-1)!.date,
    recent: { games: recentRows.length, champions: new Set(recentRows.map(row => row.champion)).size },
    pool: pool(rows, cutoff, recentRows),
    form: rows.slice(-RULES.formGames).map(played).reverse(),
    before: winCount(rows.slice(-2 * RULES.formGames, -RULES.formGames)),
    lane: facts.lane, observed: player.observed,
    facts: {
      behind: facts.behind, ahead: facts.ahead, deathless: facts.deathless,
      best: best ? played(best) : null, worst: worst ? played(worst) : null,
      hardest: against[0] ?? null, easiest: against.length > 1 ? against.at(-1)! : null,
    },
  }
}
