import { z } from 'zod'
import { compareCodeUnits } from '../../shared/codeUnitOrder.mjs'

export const REPORT_ROLES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'] as const
export const REPORT_METRICS = {
  killParticipation: {
    label: 'Kill participation',
    unit: '%',
    multiplier: 100,
  },
  damageGoldShareGap: {
    label: 'Damage minus gold share',
    unit: 'pp',
    multiplier: 100,
  },
  goldDiffAt15: { label: 'Gold difference at 15', unit: 'gold', multiplier: 1 },
  xpDiffAt15: { label: 'XP difference at 15', unit: 'XP', multiplier: 1 },
  csDiffAt15: { label: 'CS difference at 15', unit: 'CS', multiplier: 1 },
  damagePerMinute: { label: 'Damage per minute', unit: '', multiplier: 1 },
  csPerMinute: { label: 'CS per minute', unit: '', multiplier: 1 },
  wardsPlacedPerMinute: {
    label: 'Wards placed per minute',
    unit: '',
    multiplier: 1,
  },
  wardsClearedPerMinute: {
    label: 'Wards cleared per minute',
    unit: '',
    multiplier: 1,
  },
} as const
const metric = z.enum(
  Object.keys(REPORT_METRICS) as [
    keyof typeof REPORT_METRICS,
    ...Array<keyof typeof REPORT_METRICS>,
  ],
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
const reportSchema = z.object({
  artifactKind: z.literal('tournament-report'),
  version: z.literal(1),
  ...identity,
  id: entry.shape.id,
  label: text,
  season: text,
  coverage,
  provenance,
  method,
  teams: z.array(team),
})
export type TournamentReportIndex = z.infer<typeof indexSchema>
export type TournamentReportEntry = z.infer<typeof entry>
export type TournamentReport = z.infer<typeof reportSchema>
export type TournamentReportTeam = z.infer<typeof team>
export type TournamentReportPlayer = z.infer<typeof participant>
export type TournamentReportGame = z.infer<typeof game>
type ReportMetric = keyof typeof REPORT_METRICS
type RoleMetricRank = {
  value: number | null
  games: number
  missing: number
  rank: number | null
  players: number
}

export function reportRoleMetricRanks(
  participants: readonly TournamentReportPlayer[],
  selected: TournamentReportPlayer,
): Record<ReportMetric, RoleMetricRank> {
  const gamesByPlayer = new Map<string, TournamentReportGame[]>()
  for (const participant of participants) {
    if (participant.role !== selected.role) continue
    const games = gamesByPlayer.get(participant.playerId) ?? []
    games.push(...participant.games)
    gamesByPlayer.set(participant.playerId, games)
  }

  return Object.fromEntries(
    (Object.keys(REPORT_METRICS) as ReportMetric[]).map((key) => {
      const averages = [...gamesByPlayer].map(([id, games]) => {
        const values = games.flatMap((game) =>
          game.metrics[key] === null ? [] : [game.metrics[key]],
        )
        return {
          id,
          value: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
          games: values.length,
          missing: games.length - values.length,
        }
      })
      const observed = averages.filter((average) => average.value !== null)
      const current = averages.find(
        (average) => average.id === selected.playerId,
      )
      const value = current?.value ?? null
      return [
        key,
        {
          value,
          games: current?.games ?? 0,
          missing: current?.missing ?? 0,
          rank:
            value === null
              ? null
              : 1 + observed.filter((other) => other.value! > value).length,
          players: observed.length,
        },
      ]
    }),
  ) as Record<ReportMetric, RoleMetricRank>
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
  return report
}

export function reportAwards(players: readonly TournamentReportPlayer[]) {
  const eligible = players.filter(
    (player) =>
      player.statsPower &&
      !player.statsPower.priorOnly &&
      player.statsPower.sampleGames > 0,
  )
  const sorted = [...eligible].sort(
    (a, b) =>
      b.statsPower!.score - a.statsPower!.score ||
      compareCodeUnits(a.key, b.key),
  )
  const tied = (score: number | undefined) =>
    sorted.filter((player) => player.statsPower!.score === score)
  return {
    best: tied(sorted[0]?.statsPower?.score),
    lowest: tied(sorted.at(-1)?.statsPower?.score),
    eligible: eligible.length,
  }
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
    player:
      player ??
      (team
        ? (reportAwards(team.participants).best[0] ?? team.participants[0])
        : undefined),
  } as const
}
