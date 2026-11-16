import {
  reportTeamGames,
  type ReportTeamGame,
  type TournamentReport,
  type TournamentReportGame,
  type TournamentReportPlayer,
} from './tournament-reports.ts'

/** What a highlight is about. The view names it; the domain only identifies it. */
export type HighlightSubject =
  | { kind: 'game'; matchId: string; date: string; phase: string | null; winnerId: string | null; teamIds: [string, string] }
  | { kind: 'team'; teamId: string }
  | { kind: 'player'; player: TournamentReportPlayer; game: TournamentReportGame | null }
  | { kind: 'champion'; champion: string; wins: number; games: number }

export type HighlightUnit = 'minutes' | 'kills' | 'gold' | 'goldAt15' | 'percent' | 'games' | 'champions' | 'roles' | 'dragons' | 'damage'

type Candidate = { subject: HighlightSubject; value: number }
type Context = {
  report: TournamentReport
  teamGames: ReportTeamGame[]
  players: TournamentReportPlayer[]
}
type Measure = {
  title: string
  unit: HighlightUnit
  /** The record is the largest value, or the smallest for `min`. */
  record: 'max' | 'min'
  candidates: (context: Context) => Candidate[]
}

const HIGHLIGHT_MIN_POPULATION = 5
/** A record held by more entries than this is common, not stand-out. */
const HIGHLIGHT_MAX_HOLDERS = 2
const PLAYER_MIN_GAMES = 3
const CHAMPION_MIN_GAMES = 5

const gameSubject = (game: NonNullable<TournamentReport['games']>[number]): HighlightSubject => ({
  kind: 'game',
  matchId: game.matchId,
  date: game.date,
  phase: game.phase,
  winnerId: game.winnerId,
  teamIds: [game.sides[0].teamId, game.sides[1].teamId],
})

const teamGameSubject = (context: Context, row: ReportTeamGame): HighlightSubject =>
  gameSubject(context.report.games!.find((game) => game.matchId === row.matchId)!)

const playerGames = (context: Context) =>
  context.players.flatMap((player) => player.games.map((game) => ({ player, game })))

function championTallies(context: Context) {
  const tallies = new Map<string, { wins: number; games: number; roles: Set<string> }>()
  for (const player of context.players)
    for (const game of player.games) {
      if (!game.champion) continue
      const entry = tallies.get(game.champion) ?? { wins: 0, games: 0, roles: new Set<string>() }
      entry.games++
      if (game.result === 'W') entry.wins++
      entry.roles.add(player.role)
      tallies.set(game.champion, entry)
    }
  return [...tallies]
}

function longestStreak(rows: ReportTeamGame[]) {
  let best = 0
  let run = 0
  for (const row of rows) {
    run = row.result === 'W' ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** Every measure the highlight finder may report. Each one lists every candidate, so the record can be compared with the usual value. */
export const REPORT_HIGHLIGHT_MEASURES = {
  longestGame: {
    title: 'Longest game',
    unit: 'minutes',
    record: 'max',
    candidates: ({ report }) =>
      (report.games ?? []).flatMap((game) =>
        game.lengthSeconds === null ? [] : [{ subject: gameSubject(game), value: game.lengthSeconds / 60 }],
      ),
  },
  shortestGame: {
    title: 'Fastest game',
    unit: 'minutes',
    record: 'min',
    candidates: ({ report }) =>
      (report.games ?? []).flatMap((game) =>
        game.lengthSeconds === null ? [] : [{ subject: gameSubject(game), value: game.lengthSeconds / 60 }],
      ),
  },
  bloodiestGame: {
    title: 'Bloodiest game',
    unit: 'kills',
    record: 'max',
    candidates: ({ report }) =>
      (report.games ?? []).flatMap((game) => {
        const [a, b] = game.sides
        return a.kills === null || b.kills === null ? [] : [{ subject: gameSubject(game), value: a.kills + b.kills }]
      }),
  },
  biggestWin: {
    title: 'Biggest gold win',
    unit: 'gold',
    record: 'max',
    candidates: (context) =>
      context.teamGames.flatMap((row) =>
        row.result !== 'W' || row.goldDiff === null ? [] : [{ subject: teamGameSubject(context, row), value: row.goldDiff }],
      ),
  },
  biggestComeback: {
    title: 'Biggest comeback',
    unit: 'goldAt15',
    record: 'min',
    candidates: (context) =>
      context.teamGames.flatMap((row) =>
        row.result !== 'W' || row.goldDiffAt15 === null
          ? []
          : [{ subject: teamGameSubject(context, row), value: row.goldDiffAt15 }],
      ),
  },
  mostDragons: {
    title: 'Most dragons in one game',
    unit: 'dragons',
    record: 'max',
    candidates: (context) =>
      context.teamGames.flatMap((row) =>
        row.dragons === null ? [] : [{ subject: teamGameSubject(context, row), value: row.dragons[0] }],
      ),
  },
  winStreak: {
    title: 'Longest win streak',
    unit: 'games',
    record: 'max',
    candidates: ({ report, teamGames }) =>
      report.teams.map((team) => ({
        subject: { kind: 'team', teamId: team.id },
        value: longestStreak(
          teamGames
            .filter((row) => row.teamId === team.id)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.gameNumber ?? 0) - (b.gameNumber ?? 0)),
        ),
      })),
  },
  laneLead: {
    title: 'Biggest lane lead in one game',
    unit: 'goldAt15',
    record: 'max',
    candidates: (context) =>
      playerGames(context).flatMap(({ player, game }) =>
        game.metrics.goldDiffAt15 === null
          ? []
          : [{ subject: { kind: 'player', player, game }, value: game.metrics.goldDiffAt15 }],
      ),
  },
  damageGame: {
    title: 'Most damage in one game',
    unit: 'damage',
    record: 'max',
    candidates: (context) =>
      playerGames(context).flatMap(({ player, game }) =>
        game.metrics.damagePerMinute === null
          ? []
          : [{ subject: { kind: 'player', player, game }, value: game.metrics.damagePerMinute }],
      ),
  },
  championPool: {
    title: 'Widest champion pool',
    unit: 'champions',
    record: 'max',
    candidates: ({ players }) =>
      players.flatMap((player) =>
        player.games.length < PLAYER_MIN_GAMES
          ? []
          : [{
              subject: { kind: 'player', player, game: null },
              value: new Set(player.games.flatMap((game) => (game.champion ? [game.champion] : []))).size,
            }],
      ),
  },
  championRecord: {
    title: 'Best champion record',
    unit: 'percent',
    record: 'max',
    candidates: (context) =>
      championTallies(context).flatMap(([champion, { wins, games }]) =>
        games < CHAMPION_MIN_GAMES ? [] : [{ subject: { kind: 'champion', champion, wins, games }, value: wins / games }],
      ),
  },
  flexPick: {
    title: 'Most flexible pick',
    unit: 'roles',
    record: 'max',
    candidates: (context) =>
      championTallies(context).flatMap(([champion, { wins, games, roles }]) =>
        games < 2 ? [] : [{ subject: { kind: 'champion', champion, wins, games }, value: roles.size }],
      ),
  },
} as const satisfies Record<string, Measure>

export type ReportHighlightMeasure = keyof typeof REPORT_HIGHLIGHT_MEASURES

export type ReportHighlight = {
  measure: ReportHighlightMeasure
  title: string
  unit: HighlightUnit
  subject: HighlightSubject
  value: number
  /** The usual value: the mean over every candidate of the measure. */
  mean: number
  population: number
  /** Other candidates that share the record. */
  ties: number
  /** How unusual the record is, in population standard deviations from the mean. */
  score: number
}

/**
 * Finds the most unusual records in a report. Each measure contributes its record,
 * scored by its distance from the measure's mean. A measure needs five candidates,
 * some spread, and a record held by at most two of them. The highest scores win.
 */
export function reportHighlights(report: TournamentReport, limit = 6): ReportHighlight[] {
  if (!report.games) return []
  const context: Context = {
    report,
    teamGames: reportTeamGames(report),
    players: report.teams.flatMap((team) => team.participants),
  }
  const highlights = (Object.keys(REPORT_HIGHLIGHT_MEASURES) as ReportHighlightMeasure[]).flatMap((measure) => {
    const definition: Measure = REPORT_HIGHLIGHT_MEASURES[measure]
    const candidates = definition.candidates(context)
    if (candidates.length < HIGHLIGHT_MIN_POPULATION) return []
    const values = candidates.map((candidate) => candidate.value)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
    if (!deviation) return []
    const record = definition.record === 'max' ? Math.max(...values) : Math.min(...values)
    const holders = candidates.filter((candidate) => candidate.value === record)
    if (holders.length > HIGHLIGHT_MAX_HOLDERS) return []
    return [{
      measure,
      title: definition.title,
      unit: definition.unit,
      subject: holders[0]!.subject,
      value: record,
      mean,
      population: candidates.length,
      ties: holders.length - 1,
      score: Math.abs(record - mean) / deviation,
    }]
  })
  return highlights.sort((a, b) => b.score - a.score || a.measure.localeCompare(b.measure)).slice(0, limit)
}
