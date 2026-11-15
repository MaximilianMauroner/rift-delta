import type { PublicArtifactFamily } from '../published/writePlan.ts'
import type { DataSourceInfo, MatchRecord, TeamProfile } from '../../types.ts'
import { teamIdFor } from '../published/schema.ts'
import { tournamentInstanceForEvent } from '../evidence/internationalTournaments.ts'
import { buildRankingModel } from '../replay/model.ts'
import { eventWeightContextForMatches } from '../replay/eventWeighting.ts'
import { buildPlayerStatsPower } from '../players/playerStatsPower.ts'
import {
  createPlayerPerformanceAccumulator,
  playerPerformanceValues,
  summarizePlayerPerformance,
} from '../players/playerPerformance.ts'
import { stableDigest } from '../replay/incremental/types.ts'
import { compareCodeUnits } from '../../../../shared/codeUnitOrder.mjs'
import {
  REPORT_METRICS,
  REPORT_ROLES,
  parseTournamentReport,
  parseTournamentReportIndex,
  reportPlayerKey,
  type TournamentReport,
  type TournamentReportIndex,
  type TournamentReportPlayer,
  type TournamentReportTeam,
} from '../../tournament-reports.ts'

export const TOURNAMENT_REPORT_INDEX_PATH = 'tournament-reports/index.json'
export const TOURNAMENT_REPORT_SHARD_DIR = 'tournament-reports/events'
export type TournamentReportInput = {
  matches: MatchRecord[]
  teams: Record<string, TeamProfile>
}

function isWorldsReportMatch(match: MatchRecord) {
  return (
    tournamentInstanceForEvent(match.event, match.season)?.family ===
      'worlds' &&
    match.tier !== 'qualifier' &&
    !/\b(?:qualifiers?|regional finals?|road to)\b/i.test(
      `${match.event} ${match.phase}`,
    )
  )
}

export function retainTournamentReportInput(
  matches: readonly MatchRecord[],
  teams: Record<string, TeamProfile>,
): TournamentReportInput {
  const retained = matches.filter(isWorldsReportMatch)
  const names = new Set(retained.flatMap((match) => [match.teamA, match.teamB]))
  return {
    matches: retained,
    teams: Object.fromEntries(
      Object.entries(teams).filter(([name]) => names.has(name)),
    ),
  }
}

function tournamentReportShardPath(id: string) {
  if (!/^worlds:\d{4}$/.test(id)) throw new Error('Invalid report edition')
  return `${TOURNAMENT_REPORT_SHARD_DIR}/${id.replace(':', '-')}.json`
}

type ReportBuildInput = {
  observed: TournamentReportInput
  ratedMatches: MatchRecord[]
  ratedTeams: Record<string, TeamProfile>
  source: string
  dataMode: string
  sources: DataSourceInfo[]
  modelVersion: string
  modelConfigHash: string
}

export function buildTournamentReports(
  input: ReportBuildInput,
  urlForPath: (path: string) => string,
) {
  const byEdition = new Map<string, MatchRecord[]>()
  for (const match of input.observed.matches.filter(isWorldsReportMatch)) {
    const id = tournamentInstanceForEvent(match.event, match.season)!.id
    const games = byEdition.get(id) ?? []
    games.push(match)
    byEdition.set(id, games)
  }
  const shards: Record<string, TournamentReport> = {}
  const index: TournamentReportIndex = {
    artifactKind: 'tournament-report-index',
    version: 1,
    modelVersion: input.modelVersion,
    modelConfigHash: input.modelConfigHash,
    tournaments: [],
  }
  for (const [, matches] of [...byEdition].sort(([a], [b]) =>
    compareCodeUnits(b, a),
  )) {
    matches.sort(
      (a, b) =>
        compareCodeUnits(a.date, b.date) ||
        compareCodeUnits(a.datetimeUtc ?? '', b.datetimeUtc ?? '') ||
        (a.gameNumber ?? 0) - (b.gameNumber ?? 0) ||
        compareCodeUnits(a.id, b.id),
    )
    if (new Set(matches.map((match) => match.id)).size !== matches.length)
      throw new Error('Duplicate tournament report game')
    const identity = tournamentInstanceForEvent(
      matches[0]!.event,
      matches[0]!.season,
    )!
    const since = matches[0]!.date
    const through = matches.at(-1)!.date
    const leagueEvidence = input.ratedMatches.filter(
      (match) => match.date <= through,
    )
    const leagueRatings = new Map(
      buildRankingModel(leagueEvidence, input.ratedTeams).leagues.map(
        (league) => [league.league, league.score],
      ),
    )
    const scores = buildPlayerStatsPower(
      matches,
      {
        teams: input.observed.teams,
        eventWeightContext: eventWeightContextForMatches(matches),
      },
      leagueRatings,
    )
    const teams = observedTeams(matches, input.observed.teams)
    const scoreTeams = new Map<string, Set<string>>()
    for (const team of teams)
      for (const player of team.participants) {
        const key = `${player.playerId}|${player.role}`
        const ids = scoreTeams.get(key) ?? new Set<string>()
        ids.add(team.id)
        scoreTeams.set(key, ids)
      }
    for (const team of teams)
      for (const player of team.participants) {
        player.scoreTeamIds = [
          ...scoreTeams.get(`${player.playerId}|${player.role}`)!,
        ].sort(compareCodeUnits)
        player.statsPower =
          scores.get(player.playerId)?.get(player.role) ?? null
      }
    const ratedIds = new Set(input.ratedMatches.map((match) => match.id))
    const rated = matches.filter((match) => ratedIds.has(match.id))
    const players = teams.flatMap((team) => team.participants)
    const report: TournamentReport = {
      artifactKind: 'tournament-report',
      version: 1,
      modelVersion: input.modelVersion,
      modelConfigHash: input.modelConfigHash,
      id: identity.id,
      label: identity.label,
      season: identity.season,
      coverage: {
        observedGames: matches.length,
        ratedGames: rated.length,
        observedTeams: teams.length,
        ratedTeams: new Set(
          rated.flatMap((match) => [match.teamA, match.teamB]),
        ).size,
        participants: players.length,
        scoredParticipants: players.filter(
          (player) => player.statsPower && !player.statsPower.priorOnly,
        ).length,
        since,
        through,
        officialCompletion: 'unknown',
      },
      provenance: {
        source: input.source,
        dataMode: input.dataMode,
        inputDigest: stableDigest({
          matches,
          teams: input.observed.teams,
          leagueEvidence,
          ratedTeams: input.ratedTeams,
        }),
        providers: [
          ...new Set(matches.map((match) => match.sourceProvider ?? 'unknown')),
        ].sort(compareCodeUnits),
        files: [
          ...new Set(matches.flatMap((match) => match.sourceFileName ?? [])),
        ].sort(compareCodeUnits),
        sources: input.sources.map(({ name, url, retrievedAt }) => ({
          name,
          ...(url ? { url } : {}),
          ...(retrievedAt ? { retrievedAt } : {}),
        })),
      },
      method: {
        version: 'event-stats-power-v1',
        scoreVersion: 'stats-power-v3',
        scoreScope: 'event-player-role',
        priorGames: 20,
        halfLifeDays: 90,
        leagueEvidenceThrough: through,
      },
      teams,
    }
    const path = tournamentReportShardPath(report.id)
    shards[path] = report
    index.tournaments.push({
      id: report.id,
      label: report.label,
      season: report.season,
      coverage: report.coverage,
      provenance: report.provenance,
      method: report.method,
      url: urlForPath(path),
    })
  }
  return { index, shards }
}

function observedTeams(
  matches: MatchRecord[],
  profiles: Record<string, TeamProfile>,
): TournamentReportTeam[] {
  const teams = new Map<string, TournamentReportTeam>()
  const getTeam = (name: string) => {
    const profile = profiles[name]
    const id = teamIdFor({
      team: name,
      region: profile?.region,
      code: profile?.code,
    })
    let team = teams.get(id)
    if (!team) {
      team = {
        id,
        name,
        code: profile?.code ?? name,
        league: profile?.league ?? 'Unknown',
        region: profile?.region ?? 'International',
        observedGames: 0,
        wins: 0,
        losses: 0,
        participants: [],
      }
      teams.set(id, team)
    }
    return team
  }
  for (const match of matches) {
    for (const side of ['A', 'B'] as const) {
      const team = getTeam(match[`team${side}`])
      const opponent = getTeam(match[side === 'A' ? 'teamB' : 'teamA'])
      team.observedGames++
      if (match.winner === team.name) team.wins++
      if (match.winner === opponent.name) team.losses++
      for (const appearance of match[`team${side}Roster`]?.players ?? []) {
        const key = reportPlayerKey(team.id, appearance.id, appearance.role)
        let player = team.participants.find((player) => player.key === key)
        if (!player) {
          player = {
            key,
            playerId: appearance.id,
            name: appearance.name,
            role: appearance.role,
            teamId: team.id,
            scoreTeamIds: [team.id],
            statsPower: null,
            performance: summarizePlayerPerformance(
              createPlayerPerformanceAccumulator(),
              0,
            ),
            games: [],
          }
          team.participants.push(player)
        }
        const values = playerPerformanceValues(appearance.stats)
        player.games.push({
          matchId: match.id,
          sourceProvider: match.sourceProvider ?? 'unknown',
          sourceGameId: match.sourceGameId || null,
          sourceMatchId: match.sourceMatchId || null,
          officialGameId: match.officialGameId || null,
          sourceFileName: match.sourceFileName || null,
          sourceUrl: match.sourceUrl || null,
          date: match.date,
          datetimeUtc: match.datetimeUtc || null,
          gameNumber: match.gameNumber ?? null,
          event: match.event,
          opponentId: opponent.id,
          opponent: opponent.name,
          result:
            match.winner === team.name
              ? 'W'
              : match.winner === opponent.name
                ? 'L'
                : 'T',
          champion: appearance.stats?.champion || null,
          metrics: Object.fromEntries(
            Object.keys(REPORT_METRICS).map((key) => [
              key,
              values[key as keyof typeof values] ?? null,
            ]),
          ) as TournamentReportPlayer['games'][number]['metrics'],
        })
      }
    }
  }
  for (const team of teams.values()) {
    for (const player of team.participants) {
      const accumulator = createPlayerPerformanceAccumulator()
      for (const game of player.games) {
        for (const key of Object.keys(REPORT_METRICS) as Array<
          keyof typeof REPORT_METRICS
        >) {
          const value = game.metrics[key]
          if (value === null) continue
          accumulator[key].total += value
          accumulator[key].games++
        }
      }
      player.performance = summarizePlayerPerformance(
        accumulator,
        player.games.length,
      )
    }
    team.participants.sort(
      (a, b) =>
        REPORT_ROLES.indexOf(a.role) - REPORT_ROLES.indexOf(b.role) ||
        compareCodeUnits(a.name, b.name) ||
        compareCodeUnits(a.key, b.key),
    )
  }
  return [...teams.values()].sort((a, b) => compareCodeUnits(a.name, b.name))
}

export function tournamentReportFamily(
  input: ReportBuildInput,
): PublicArtifactFamily {
  return {
    indexPath: TOURNAMENT_REPORT_INDEX_PATH,
    shardDir: TOURNAMENT_REPORT_SHARD_DIR,
    manifestUrlKey: 'tournamentReportIndexUrl',
    create: (urlForPath) => buildTournamentReports(input, urlForPath),
    validateIndex: parseTournamentReportIndex,
    validateShard: (index) => (value) => {
      const report = parseTournamentReport(value)
      const entry = (index as TournamentReportIndex).tournaments.find(
        (event) => event.id === report.id,
      )
      if (!entry) throw new Error('Report has no catalog entry')
      return parseTournamentReport(value, entry)
    },
  }
}
