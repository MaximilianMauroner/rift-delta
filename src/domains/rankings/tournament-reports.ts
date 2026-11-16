import { z } from 'zod'
import {
  fieldPosition,
  wilsonRate,
  type Better,
  type FieldPosition,
  type Rate,
} from './field-statistics.ts'
import { playerPerformanceMetricKeys, playerPerformanceMetrics } from './internal/players/playerPerformance.ts'
import type { PlayerPerformanceMetric } from './types.ts'

export const REPORT_ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as const
const metric = z.enum(
  playerPerformanceMetricKeys as [PlayerPerformanceMetric, ...PlayerPerformanceMetric[]],
)
const text = z.string().min(1)
const count = z.number().int().nonnegative()
const day = z.iso.date()
const role = z.enum(REPORT_ROLES)
const mean = z.object({
  value: z.number().nullable(),
  games: count,
  missing: count,
})
const power = z.object({
  version: z.literal('stats-power-v3'),
  score: z.number(),
  role,
  sampleGames: count,
  eligibleGames: count,
  priorOnly: z.boolean(),
  leagueAnchor: z.number(),
  evidenceThrough: day,
  metrics: z.partialRecord(
    metric,
    z.object({
      observed: count,
      missing: count,
      effectiveGames: z.number().nonnegative(),
    }),
  ),
})
const provenance = z.object({
  dataMode: text,
  inputDigest: z.string().regex(/^fnv1a64-[a-f0-9]{16}$/),
  providers: z.array(text),
  files: z.array(text),
})
const method = z.object({
  version: z.literal('event-stats-power-v1'),
  scoreVersion: z.literal('stats-power-v3'),
  scoreScope: z.literal('event-player-role'),
  priorGames: z.literal(20),
  halfLifeDays: z.literal(90),
  leagueEvidenceThrough: day,
})
const coverage = z
  .object({
    observedGames: count,
    ratedGames: count,
    observedTeams: count,
    ratedTeams: count,
    participants: count,
    scoredParticipants: count,
    since: day,
    through: day,
    officialCompletion: z.literal('unknown'),
  })
  .refine(
    (value) =>
      value.ratedGames <= value.observedGames &&
      value.ratedTeams <= value.observedTeams &&
      value.scoredParticipants <= value.participants,
    'Invalid report coverage',
  )
const entry = z.object({
  id: z.string().regex(/^worlds:\d{4}$/),
  label: text,
  season: text,
  coverage,
  provenance,
  method,
  url: text,
})
const identity = { modelVersion: text, modelConfigHash: text }
const game = z.object({
  matchId: text,
  sourceProvider: text,
  sourceGameId: text.nullable(),
  sourceMatchId: text.nullable(),
  officialGameId: text.nullable(),
  sourceFileName: text.nullable(),
  sourceUrl: text.nullable(),
  date: day,
  datetimeUtc: text.nullable(),
  gameNumber: count.nullable(),
  event: text,
  opponentId: text,
  opponent: text,
  result: z.enum(['W', 'L', 'T']),
  champion: text.nullable(),
  metrics: z.record(metric, z.number().nullable()),
})
const side = z.enum(['blue', 'red'])
const gameSide = z.object({
  teamId: text,
  side: side.nullable(),
  kills: count.nullable(),
  gold: z.number().nonnegative().nullable(),
  towers: count.nullable(),
  dragons: count.nullable(),
  barons: count.nullable(),
  champions: z.array(text).max(5),
})
const reportGame = z.object({
  matchId: text,
  date: day,
  gameNumber: count.nullable(),
  phase: text.nullable(),
  patch: text.nullable(),
  lengthSeconds: z.number().positive().nullable(),
  winnerId: text.nullable(),
  sides: z.tuple([gameSide, gameSide]),
})
const participant = z.object({
  key: text,
  playerId: text,
  name: text,
  role,
  teamId: text,
  games: z.array(game).min(1),
  scoreTeamIds: z.array(text).min(1),
  statsPower: power.nullable(),
  performance: z.object({
    version: z.literal('observed-player-performance-v1'),
    aggregation: z.literal('unweighted-per-game-mean'),
    ratingEffect: z.literal('none'),
    metrics: z.record(metric, mean),
  }),
})
const team = z.object({
  id: text,
  name: text,
  code: text,
  league: text,
  region: text,
  observedGames: count,
  wins: count,
  losses: count,
  participants: z.array(participant),
})
const indexSchema = z.object({
  artifactKind: z.literal('tournament-report-index'),
  version: z.literal(1),
  ...identity,
  tournaments: z.array(entry),
})
const reportSchema = z
  .object({
    artifactKind: z.literal('tournament-report'),
    version: z.union([z.literal(1), z.literal(2)]),
    ...identity,
    id: entry.shape.id,
    label: text,
    season: text,
    coverage,
    provenance,
    method,
    teams: z.array(team),
    games: z.array(reportGame).optional(),
  })
  .refine(
    (report) => (report.version === 2) === (report.games !== undefined),
    'Report games must match the report version',
  )
  .transform((report) => ({ ...report, games: report.games ?? null }))
export type TournamentReportIndex = z.infer<typeof indexSchema>
export type TournamentReportEntry = z.infer<typeof entry>
export type TournamentReport = z.output<typeof reportSchema>
export type TournamentReportTeam = z.infer<typeof team>
export type TournamentReportPlayer = z.infer<typeof participant>
export type TournamentReportGame = z.infer<typeof game>
export type TournamentReportMatch = z.infer<typeof reportGame>
export type ReportRolePosition = FieldPosition & { metric: PlayerPerformanceMetric; missing: number }

/** Places a player's event averages among every player of the same role, across all their teams. */
export function reportRoleFieldPositions(
  participants: readonly TournamentReportPlayer[],
  selected: TournamentReportPlayer,
): ReportRolePosition[] {
  const gamesByPlayer = new Map<string, TournamentReportGame[]>()
  for (const participant of participants) {
    if (participant.role !== selected.role) continue
    const games = gamesByPlayer.get(participant.playerId) ?? []
    games.push(...participant.games)
    gamesByPlayer.set(participant.playerId, games)
  }
  return playerPerformanceMetricKeys.map((metric) => {
    const averages = [...gamesByPlayer].map(([id, games]) => {
      const values = games.flatMap((game) =>
        game.metrics[metric] === null ? [] : [game.metrics[metric]],
      )
      return {
        id,
        value: values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null,
        n: values.length,
        missing: games.length - values.length,
      }
    })
    return {
      metric,
      missing: averages.find((entry) => entry.id === selected.playerId)?.missing ?? 0,
      ...fieldPosition(averages, selected.playerId, 1, playerPerformanceMetrics[metric].better),
    }
  })
}

export function reportPlayerKey(
  teamId: string,
  playerId: string,
  playerRole: string,
) {
  return [teamId, playerId, playerRole].map(encodeURIComponent).join('|')
}

export function parseTournamentReportIndex(
  value: unknown,
): TournamentReportIndex {
  const index = indexSchema.parse(value)
  if (
    new Set(index.tournaments.map((event) => event.id)).size !==
    index.tournaments.length
  )
    throw new Error('Duplicate report edition')
  for (const event of index.tournaments) {
    const url = new URL(event.url, 'https://reports.invalid')
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.pathname.startsWith('/data/tournament-reports/events/') ||
      url.username ||
      url.password
    )
      throw new Error('Invalid report URL')
  }
  return index
}

export function parseTournamentReport(
  value: unknown,
  expected?: TournamentReportEntry,
): TournamentReport {
  const report = reportSchema.parse(value)
  if (
    expected &&
    (report.id !== expected.id ||
      report.label !== expected.label ||
      report.season !== expected.season ||
      JSON.stringify(report.coverage) !== JSON.stringify(expected.coverage) ||
      JSON.stringify(report.method) !== JSON.stringify(expected.method) ||
      JSON.stringify(report.provenance) !== JSON.stringify(expected.provenance))
  )
    throw new Error('Report does not match its catalog entry')
  const ids = new Set(report.teams.map((team) => team.id))
  if (
    ids.size !== report.teams.length ||
    ids.size !== report.coverage.observedTeams
  )
    throw new Error('Invalid report teams')
  const players = report.teams.flatMap((team) => team.participants)
  if (
    players.filter(
      (player) => player.statsPower && !player.statsPower.priorOnly,
    ).length !== report.coverage.scoredParticipants ||
    players.length !== report.coverage.participants ||
    new Set(players.map((player) => player.key)).size !== players.length
  )
    throw new Error('Invalid report participants')
  for (const team of report.teams) {
    for (const player of team.participants) {
      if (
        player.teamId !== team.id ||
        player.key !== reportPlayerKey(team.id, player.playerId, player.role) ||
        !player.scoreTeamIds.includes(team.id) ||
        player.scoreTeamIds.some((id) => !ids.has(id))
      )
        throw new Error('Invalid report participant identity')
      if (
        new Set(player.games.map((game) => game.matchId)).size !==
        player.games.length
      )
        throw new Error('Duplicate participant game')
      for (const observed of Object.values(player.performance.metrics)) {
        if (
          observed.games + observed.missing !== player.games.length ||
          (observed.games === 0) !== (observed.value === null)
        )
          throw new Error('Invalid report metric coverage')
      }
      if (
        player.statsPower &&
        (player.statsPower.role !== player.role ||
          player.statsPower.evidenceThrough > report.coverage.through ||
          player.statsPower.sampleGames > player.statsPower.eligibleGames ||
          player.statsPower.priorOnly !== (player.statsPower.sampleGames === 0))
      )
        throw new Error('Invalid report score evidence')
      for (const game of player.games) {
        if (
          !ids.has(game.opponentId) ||
          game.date < report.coverage.since ||
          game.date > report.coverage.through
        )
          throw new Error('Invalid report game')
      }
    }
  }
  if (report.games) {
    const games = new Map(report.games.map((game) => [game.matchId, game]))
    if (
      games.size !== report.games.length ||
      games.size !== report.coverage.observedGames
    )
      throw new Error('Invalid report games')
    for (const game of report.games) {
      const [a, b] = game.sides
      if (
        a.teamId === b.teamId ||
        !ids.has(a.teamId) ||
        !ids.has(b.teamId) ||
        (a.side !== null && a.side === b.side) ||
        (game.winnerId !== null &&
          game.winnerId !== a.teamId &&
          game.winnerId !== b.teamId) ||
        game.date < report.coverage.since ||
        game.date > report.coverage.through
      )
        throw new Error('Invalid report game record')
    }
    for (const player of players)
      for (const observed of player.games) {
        const sides = games.get(observed.matchId)?.sides.map((side) => side.teamId)
        if (
          !sides?.includes(player.teamId) ||
          !sides.includes(observed.opponentId)
        )
          throw new Error('Participant game has no report game record')
      }
  }
  return report
}

export function reportTeamMetricLeaders(
  players: readonly TournamentReportPlayer[],
  metric: PlayerPerformanceMetric,
) {
  const averages = players.flatMap((player) => {
    const values = player.games.flatMap((game) => {
      const value = game.metrics[metric]
      return value === null ? [] : [value]
    })
    return values.length
      ? [{
          player,
          value: values.reduce((sum, value) => sum + value, 0) / values.length,
        }]
      : []
  })
  if (!averages.length) return []
  const highest = Math.max(...averages.map((average) => average.value))
  return averages.filter((average) => average.value === highest)
}

export function resolveReportSelection(
  report: TournamentReport,
  requested: { team?: string; player?: string },
) {
  const player =
    requested.player === undefined
      ? undefined
      : report.teams
          .flatMap((team) => team.participants)
          .find((player) => player.key === requested.player)
  if (requested.player !== undefined && !player)
    return { kind: 'missing-player' } as const
  if (
    requested.team !== undefined &&
    !report.teams.some((team) => team.id === requested.team)
  )
    return { kind: 'missing-team' } as const
  if (
    player &&
    requested.team !== undefined &&
    player.teamId !== requested.team
  )
    return { kind: 'conflicting-selection' } as const
  const team =
    report.teams.find(
      (team) => team.id === (player?.teamId ?? requested.team),
    ) ?? report.teams[0]
  return {
    kind: 'ready',
    team,
    player: player ?? team?.participants[0],
  } as const
}

export type ReportTeamGame = {
  matchId: string
  date: string
  gameNumber: number | null
  phase: string | null
  teamId: string
  opponentId: string
  side: 'blue' | 'red' | null
  result: 'W' | 'L' | 'T'
  goldDiffAt15: number | null
  goldDiff: number | null
  goldSwing: number | null
  lengthSeconds: number | null
  kills: [number, number] | null
  towers: [number, number] | null
  dragons: [number, number] | null
  barons: [number, number] | null
}

export function reportTeamGames(report: TournamentReport): ReportTeamGame[] {
  const lanes = new Map<string, number[]>()
  for (const team of report.teams)
    for (const player of team.participants)
      for (const game of player.games) {
        const value = game.metrics.goldDiffAt15
        if (value === null) continue
        const key = `${game.matchId}|${team.id}`
        lanes.set(key, [...(lanes.get(key) ?? []), value])
      }
  return (report.games ?? []).flatMap((game) =>
    game.sides.map((own, index) => {
      const other = game.sides[1 - index]!
      const values = lanes.get(`${game.matchId}|${own.teamId}`) ?? []
      const goldDiffAt15 =
        values.length === REPORT_ROLES.length
          ? values.reduce((sum, value) => sum + value, 0)
          : null
      const goldDiff =
        own.gold === null || other.gold === null ? null : own.gold - other.gold
      const pair = (key: 'kills' | 'towers' | 'dragons' | 'barons') =>
        own[key] === null || other[key] === null
          ? null
          : ([own[key], other[key]] as [number, number])
      return {
        matchId: game.matchId,
        date: game.date,
        gameNumber: game.gameNumber,
        phase: game.phase,
        teamId: own.teamId,
        opponentId: other.teamId,
        side: own.side,
        result:
          game.winnerId === own.teamId
            ? 'W'
            : game.winnerId === other.teamId
              ? 'L'
              : 'T',
        goldDiffAt15,
        goldDiff,
        goldSwing:
          goldDiffAt15 === null || goldDiff === null
            ? null
            : goldDiff - goldDiffAt15,
        lengthSeconds: game.lengthSeconds,
        kills: pair('kills'),
        towers: pair('towers'),
        dragons: pair('dragons'),
        barons: pair('barons'),
      }
    }),
  )
}

type MetricValue = { value: number | null; n: number; rate?: Rate }
const meanOf = (values: number[]): MetricValue => ({
  value: values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null,
  n: values.length,
})
const rateOf = (games: ReportTeamGame[]): MetricValue => {
  const rate = wilsonRate(
    games.filter((game) => game.result === 'W').length,
    games.length,
  )
  return { value: rate.value, n: rate.trials, rate }
}
const shareOf = (
  games: ReportTeamGame[],
  pick: (game: ReportTeamGame) => [number, number] | null,
): MetricValue => {
  const pairs = games.flatMap((game) => {
    const pair = pick(game)
    return pair ? [pair] : []
  })
  const own = pairs.reduce((sum, [value]) => sum + value, 0)
  const total = pairs.reduce((sum, [a, b]) => sum + a + b, 0)
  return { value: total ? own / total : null, n: pairs.length }
}
const known = <T>(values: Array<T | null>) =>
  values.filter((value): value is T => value !== null)

export const REPORT_TEAM_METRICS = {
  winRate: {
    label: 'Win rate',
    unit: '%',
    better: 'higher',
    hint: 'Share of games won.',
    measure: rateOf,
  },
  goldDiffAt15: {
    label: 'Gold lead at 15',
    unit: 'gold',
    better: 'higher',
    hint: 'Average team gold lead at 15 minutes.',
    measure: (games: ReportTeamGame[]) =>
      meanOf(known(games.map((game) => game.goldDiffAt15))),
  },
  leadConversion: {
    label: 'Wins when ahead at 15',
    unit: '%',
    better: 'higher',
    hint: 'Share of games won after leading in gold at 15.',
    measure: (games: ReportTeamGame[]) =>
      rateOf(games.filter((game) => (game.goldDiffAt15 ?? 0) > 0)),
  },
  comebackRate: {
    label: 'Wins when behind at 15',
    unit: '%',
    better: 'higher',
    hint: 'Share of games won after trailing in gold at 15.',
    measure: (games: ReportTeamGame[]) =>
      rateOf(games.filter((game) => (game.goldDiffAt15 ?? 0) < 0)),
  },
  goldSwing: {
    label: 'Gold lead change after 15',
    unit: 'gold',
    better: null,
    hint: 'How much the gold lead grew after 15 minutes. A style, not better or worse.',
    measure: (games: ReportTeamGame[]) =>
      meanOf(known(games.map((game) => game.goldSwing))),
  },
  killShare: {
    label: 'Kill share',
    unit: '%',
    better: 'higher',
    hint: 'Share of all kills in its games.',
    measure: (games: ReportTeamGame[]) =>
      shareOf(games, (game) => game.kills),
  },
  towerShare: {
    label: 'Tower share',
    unit: '%',
    better: 'higher',
    hint: 'Share of all towers taken in its games.',
    measure: (games: ReportTeamGame[]) => shareOf(games, (game) => game.towers),
  },
  dragonShare: {
    label: 'Dragon share',
    unit: '%',
    better: 'higher',
    hint: 'Share of all dragons taken in its games.',
    measure: (games: ReportTeamGame[]) =>
      shareOf(games, (game) => game.dragons),
  },
  baronShare: {
    label: 'Baron share',
    unit: '%',
    better: 'higher',
    hint: 'Share of all Barons taken in its games.',
    measure: (games: ReportTeamGame[]) => shareOf(games, (game) => game.barons),
  },
  gameMinutes: {
    label: 'Game length',
    unit: 'min',
    better: null,
    hint: 'Average game time. A style, not better or worse.',
    measure: (games: ReportTeamGame[]) =>
      meanOf(known(games.map((game) => game.lengthSeconds)).map((s) => s / 60)),
  },
} as const satisfies Record<string, { label: string; unit: string; better: Better; hint: string; measure: (games: ReportTeamGame[]) => MetricValue }>
export type ReportTeamMetric = keyof typeof REPORT_TEAM_METRICS

export const REPORT_FIELD_MIN_GAMES = 3

export type ReportFieldPosition = FieldPosition & {
  metric: ReportTeamMetric
  rate: Rate | null
}

export function reportTeamFieldPositions(
  report: TournamentReport,
  teamId: string,
): ReportFieldPosition[] {
  const rows = reportTeamGames(report)
  const byTeam = new Map(report.teams.map((team) => [team.id, [] as ReportTeamGame[]]))
  for (const row of rows) byTeam.get(row.teamId)!.push(row)
  return (Object.keys(REPORT_TEAM_METRICS) as ReportTeamMetric[]).map(
    (metric) => {
      const measured = [...byTeam].map(([id, games]) => ({
        id,
        ...REPORT_TEAM_METRICS[metric].measure(games),
      }))
      return {
        metric,
        rate: measured.find((entry) => entry.id === teamId)?.rate ?? null,
        ...fieldPosition(measured, teamId, REPORT_FIELD_MIN_GAMES, REPORT_TEAM_METRICS[metric].better),
      }
    },
  )
}

export type ReportChampion = {
  champion: string
  picks: number
  teams: number
  rate: Rate
}

export function reportEventSummary(report: TournamentReport) {
  const rows = reportTeamGames(report)
  const decided = rows.filter((row) => row.result !== 'T')
  const blue = decided.filter((row) => row.side === 'blue')
  const leaders = decided.filter((row) => (row.goldDiffAt15 ?? 0) > 0)
  const minutes = known((report.games ?? []).map((game) => game.lengthSeconds))
    .map((seconds) => seconds / 60)
    .sort((a, b) => a - b)
  const champions = new Map<
    string,
    { picks: number; wins: number; teams: Set<string> }
  >()
  for (const game of report.games ?? []) {
    if (game.winnerId === null) continue
    for (const side of game.sides)
      for (const champion of side.champions) {
        const entry = champions.get(champion) ?? {
          picks: 0,
          wins: 0,
          teams: new Set<string>(),
        }
        entry.picks++
        if (game.winnerId === side.teamId) entry.wins++
        entry.teams.add(side.teamId)
        champions.set(champion, entry)
      }
  }
  const teamPoints = report.teams.map((team) => {
    const games = rows.filter((row) => row.teamId === team.id)
    return {
      team,
      games: games.length,
      winRate: rateOf(games).value,
      goldDiffAt15: REPORT_TEAM_METRICS.goldDiffAt15.measure(games).value,
    }
  })
  return {
    games: report.games?.length ?? 0,
    blueSide: wilsonRate(
      blue.filter((row) => row.result === 'W').length,
      blue.length,
    ),
    leaderAt15: wilsonRate(
      leaders.filter((row) => row.result === 'W').length,
      leaders.length,
    ),
    minutes: {
      mean: minutes.length
        ? minutes.reduce((sum, value) => sum + value, 0) / minutes.length
        : null,
      shortest: minutes[0] ?? null,
      longest: minutes.at(-1) ?? null,
    },
    comebacks: decided
      .filter((row) => row.result === 'W' && (row.goldDiffAt15 ?? 0) < 0)
      .sort(
        (a, b) =>
          a.goldDiffAt15! - b.goldDiffAt15! ||
          compareText(a.matchId, b.matchId),
      ),
    swings: rows
      .filter((row) => (row.goldSwing ?? 0) > 0)
      .sort(
        (a, b) =>
          b.goldSwing! - a.goldSwing! || compareText(a.matchId, b.matchId),
      ),
    champions: [...champions]
      .map(([champion, entry]) => ({
        champion,
        picks: entry.picks,
        teams: entry.teams.size,
        rate: wilsonRate(entry.wins, entry.picks),
      }))
      .sort(
        (a, b) => b.picks - a.picks || compareText(a.champion, b.champion),
      ) satisfies ReportChampion[],
    teams: teamPoints,
  }
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
