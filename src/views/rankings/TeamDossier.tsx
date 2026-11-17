import { ChevronLeft, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type {
  TeamHistoryArtifactState
} from '../../browser/rankings/usePublicArtifacts'
import type { ChartEvent, ChartSeries } from '../../components/LineChart'
import { TeamMark } from '../../components/TeamMark'
import { FormDots, RegionBadge, TierChip } from '../../components/ui'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { LoadingState } from '../../components/ui/loading'
import {
  tournamentBoundaryLabel
} from '../../domains/rankings/evidence'
import { eventTierConfig } from '../../domains/rankings/policy'
import type { RankingTierLabel } from '../../domains/rankings/read'
import { estimatePublicMatchup, NEAR_TIE_WIN_PROBABILITY, nearTieGroups, type PublicMatchupModel } from '../../domains/rankings/read'
import type { CompactPlayer, EventTier, PublicCurrentLineup, PublicTournamentMovementShard, PublicTournamentMovementTeam, RankingSummaryStanding, TeamHistorySeries } from '../../domains/rankings/types'
import { formatDate, formatModelVersion, formatNumber, formatRating, formatRatio, formatRecord, teamKey } from '../../shared/display'
import { leagueColor } from '../../shared/teamColor'
import { cn } from '../../shared/utils'
import { activeMovement, formatEventWeight, formatRankMovementLabel, formatRankValue, formatRatingMovement, formatUncertaintyBand, isEventTier, powerResumeGapSummary, rankMovementTone, recordBasisLabel, scoreFamilyLabel, teamRankFor, teamScoreFor } from './boardFormat'
import { LazyTeamHistoryLineChart } from './historyChart'
import { TeamLeagueProfile } from './TeamLeagueProfile'
import { ComponentBreakdown, PlayerRankingCard } from './PlayerDisclosure'
import { RecentMatches } from './RecentMatches'
import { dailyChartPointsFromHistoryPoints, tournamentChartPoints } from './teamHistoryChart'
import { type PlayerLoadState } from './types'

type RankEvidenceSummary = {
  label: string
  detail: string
  range: string
}

function summarizeRankEvidence(team: RankingSummaryStanding, standings: readonly RankingSummaryStanding[]): RankEvidenceSummary | null {
  const score = teamScoreFor(team)
  const uncertainty = team.ratingComponents?.uncertainty ?? team.uncertainty
  if (typeof score !== 'number' || typeof uncertainty !== 'number' || !Number.isFinite(score) || !Number.isFinite(uncertainty)) {
    return null
  }

  const teamKeyValue = teamKey(team)
  const rankedRows = standings.filter((standing) => {
    if (team.eligibility?.eligible !== false && standing.eligibility?.eligible === false) return false
    return typeof teamScoreFor(standing) === 'number' && Number.isFinite(teamScoreFor(standing))
  })
  const high = score + Math.max(0, uncertainty)
  const low = score - Math.max(0, uncertainty)
  const bestRank = 1 + rankedRows.filter((standing) => teamKey(standing) !== teamKeyValue && (teamScoreFor(standing) ?? -Infinity) > high).length
  const worstRank = Math.max(bestRank, 1 + rankedRows.filter((standing) => teamKey(standing) !== teamKeyValue && (teamScoreFor(standing) ?? -Infinity) > low).length)
  const label = bestRank === worstRank
    ? formatRankValue(bestRank)
    : `${formatRankValue(bestRank)}-${formatRankValue(worstRank)}`
  return {
    label,
    detail: `from the ${formatUncertaintyBand(uncertainty)} model evidence band`,
    range: `Power band ${formatRating(low)} to ${formatRating(high)}`,
  }
}

type MatchWeightSummary = {
  label: string
  detail: string
  title: string
}

function summarizeTeamMatchWeights(series?: TeamHistorySeries): MatchWeightSummary | null {
  const summaries = new Map<EventTier, { count: number; maximumWeight: number }>()
  for (const point of series?.points ?? []) {
    const tier = point[3]?.tier
    if (!isEventTier(tier)) continue
    const configuredWeight = eventTierConfig[tier].weight
    const appliedWeight = point[3]?.model?.w
    const current = summaries.get(tier) ?? { count: 0, maximumWeight: 0 }
    summaries.set(tier, {
      count: current.count + 1,
      maximumWeight: Math.max(current.maximumWeight, typeof appliedWeight === 'number' ? appliedWeight : configuredWeight),
    })
  }
  const entries = [...summaries.entries()]
  if (entries.length === 0) return null
  const [tier, summary] = entries.sort(([, left], [, right]) => right.maximumWeight - left.maximumWeight)[0]
  const config = eventTierConfig[tier]
  const events = [...new Set((series?.points ?? []).filter((point) => point[3]?.tier === tier).map((point) => point[3]?.event).filter(Boolean))]
  return {
    label: `Up to ${formatEventWeight(summary.maximumWeight)}`,
    detail: `${events.join(', ')} · ${formatNumber(summary.count)} series`,
    title: `${config.label} weighting tier (shared across events). ${config.description}`,
  }
}

const tournamentDataNoteClassName = 'border-t border-line pt-3 text-xs leading-[1.5] text-muted'
const sectionClassName = 'grid gap-3 border-t border-line px-4 py-4'
const disclosureClassName = 'border-t border-line px-4 py-3 [&>summary]:cursor-pointer [&>summary]:text-sm [&>summary]:font-semibold [&>summary]:text-text'

export type DossierNeighbours = {
  position: number
  count: number
  previous?: RankingSummaryStanding
  next?: RankingSummaryStanding
}

/**
 * One team's dossier. Beside the board on wide screens, and its own screen
 * below that, with Back, Previous and Next. Every fact the old drawer held is
 * here: the header, the facts row, the season line, the league strips, the
 * recent series and the disclosures for odds, score build and players.
 */
export function TeamDossier({
  team,
  standings,
  rankedStandings,
  model,
  tier,
  series,
  historyState,
  tournament,
  tournamentMovement,
  players,
  currentLineup,
  playerLoadState,
  playerScopeLabel,
  onRequestPlayers,
  seeded,
  events,
  neighbours,
  matchesHref,
  onClose,
  onShow,
}: {
  team: RankingSummaryStanding
  standings: readonly RankingSummaryStanding[]
  rankedStandings: readonly RankingSummaryStanding[]
  model?: PublicMatchupModel
  tier?: RankingTierLabel
  series?: TeamHistorySeries
  historyState: TeamHistoryArtifactState
  tournament?: PublicTournamentMovementShard
  tournamentMovement?: PublicTournamentMovementTeam
  players: CompactPlayer[]
  currentLineup?: PublicCurrentLineup
  playerLoadState: PlayerLoadState
  playerScopeLabel?: string
  onRequestPlayers?: () => void
  seeded: boolean
  /** International events to mark on the season chart. */
  events: ChartEvent[]
  /** Where the team sits in the board's current order, for Previous and Next. */
  neighbours?: DossierNeighbours
  matchesHref: string
  onClose: () => void
  onShow: (team: RankingSummaryStanding) => void
}) {
  const color = leagueColor(team.league)
  const trendSeries = useMemo<ChartSeries[]>(() => {
    if (!series || series.points.length < 2) return []
    return [{
      id: teamKey(team),
      label: team.code ?? team.team,
      color,
      points: tournament ? tournamentChartPoints(series.points, 'rating') : dailyChartPointsFromHistoryPoints(series.points),
    }]
  }, [color, series, team, tournament])

  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const key = teamKey(team)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [key])

  const totalGames = team.wins + team.losses
  const opponentFactor = Math.round((team.factors?.opponent ?? 0) * 100)
  const trendSummary = useMemo(() => summarizeTeamTrend(series), [series])
  const score = teamScoreFor(team)
  const rank = teamRankFor(team)
  const uncertainty = team.ratingComponents?.uncertainty ?? team.uncertainty
  const rankEvidence = useMemo(() => summarizeRankEvidence(team, standings), [team, standings])
  const weightSummary = useMemo(() => summarizeTeamMatchWeights(series), [series])
  const nearTie = useMemo(() => nearTieFact(team, rankedStandings, model), [model, rankedStandings, team])
  const powerResumeGap = powerResumeGapSummary(team)
  const movement = activeMovement(team)
  const opponents = useMemo(() => wouldBeatOdds(team, rankedStandings, model), [team, rankedStandings, model])
  const dossierLoading = [
    historyState.status === 'loading' ? 'rating and match history' : '',
    playerLoadState.status === 'loading' ? 'player rankings' : '',
  ].filter(Boolean).join(' and ')

  return (
    <section
      className="team-dossier"
      aria-label="Team details"
      style={{ '--league-color': color } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        onClose()
      }}
    >
      {dossierLoading ? <p className="sr-only" role="status" aria-live="polite">Loading {dossierLoading} for {team.team}.</p> : null}
      <nav className="team-dossier__nav" aria-label="Team pages">
        <Button type="button" variant="ghost" size="sm" className="team-dossier__back -ml-2 h-8 min-h-8 gap-1 px-2 font-semibold text-focus" onClick={onClose} aria-label="Back to rankings">
          <ChevronLeft size={16} aria-hidden="true" />
          Rankings
        </Button>
        {neighbours ? (
          <>
            <span className="text-sm text-muted tabular-nums" aria-live="polite">
              <span className="sr-only">{team.team}, </span>{formatNumber(neighbours.position)} of {formatNumber(neighbours.count)}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2" disabled={!neighbours.previous} onClick={() => neighbours.previous && onShow(neighbours.previous)} aria-label={neighbours.previous ? `Previous team, ${neighbours.previous.team}` : 'Previous team'}>
                Previous
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2" disabled={!neighbours.next} onClick={() => neighbours.next && onShow(neighbours.next)} aria-label={neighbours.next ? `Next team, ${neighbours.next.team}` : 'Next team'}>
                Next
              </Button>
            </span>
          </>
        ) : <span className="ml-auto" />}
        <Button type="button" variant="ghost" size="icon-sm" className="team-dossier__close" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </Button>
      </nav>

      <article className="team-dossier__card">
        <header className="flex items-start gap-3.5 px-4 pt-4 pb-3.5">
          <TeamMark team={team.team} code={team.code} className="size-12 border-0 bg-transparent max-sm:size-10" />
          <div className="mr-auto grid min-w-0 gap-1.5">
            <h2 ref={headingRef} tabIndex={-1} data-first-answer="team-detail" className="text-xl leading-tight font-semibold text-text outline-none">{team.team}</h2>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <RegionBadge region={team.league} />
              {tier ? <TierChip tier={tier} /> : null}
              <span className="tabular-nums">{team.eligibility?.eligible === false ? 'Unranked' : `Rank ${typeof rank === 'number' ? formatNumber(rank) : '—'}`}</span>
              {seeded ? <Badge variant="warning">Sample data</Badge> : null}
            </span>
          </div>
          <div className="grid shrink-0 justify-items-end leading-none">
            <span className="text-3xl font-bold text-text tabular-nums">{formatRating(score)}</span>
            <span className="mt-1.5 text-xs text-muted tabular-nums">{typeof uncertainty === 'number' ? `${formatUncertaintyBand(uncertainty)} Power` : 'Power'}</span>
          </div>
        </header>

        <dl className="team-dossier__facts" aria-label={`${team.team} key facts`}>
          {tournament && tournamentMovement ? (
            <>
              <div><dt>Opening</dt><dd><b>{formatRankValue(tournamentMovement.startRank)}, {formatRating(tournamentMovement.startRating)}</b><small>{formatDate(tournament.startDate)}</small></dd></div>
              <div><dt>{tournamentBoundaryLabel(tournament.status)}</dt><dd><b>{formatRankValue(tournamentMovement.endRank)}, {formatRating(tournamentMovement.endRating)}</b><small>{formatDate(tournament.boundaryDate)}</small></dd></div>
              <div><dt>Record in event</dt><dd><b>{formatRecord(team.wins, team.losses)}</b><small>{formatRatio(totalGames > 0 ? team.wins / totalGames : undefined)} of scored series</small></dd></div>
              <div><dt>Net movement</dt><dd><b className={cn(rankMovementTone(tournamentMovement.rankMovement) === 'up' && 'text-up!', rankMovementTone(tournamentMovement.rankMovement) === 'down' && 'text-down!')}>{formatRankMovementLabel(tournamentMovement.rankMovement)}</b><small>{formatRatingMovement(tournamentMovement.ratingDelta)} Power</small></dd></div>
            </>
          ) : (
            <>
              <div><dt>Likely rank</dt><dd><b>{rankEvidence?.label ?? 'Unavailable'}</b><small>{rankEvidence?.range ?? 'range its results support'}</small></dd></div>
              <div><dt>Last 30 days</dt><dd><b className={cn(movement && (movement.rankMovement ?? 0) > 0 && 'text-up!', movement && (movement.rankMovement ?? 0) < 0 && 'text-down!')}>{movement ? formatRankMovementLabel(movement.rankMovement) : 'No series'}</b><small>{movement ? `${formatRatingMovement(movement.ratingDelta ?? 0)} Power, #${movement.baselineRank} to #${movement.currentRank} over ${formatNumber(movement.scoredSeries)} series` : 'no scored matches'}</small></dd></div>
              <div><dt>Record</dt><dd><b>{formatRecord(team.wins, team.losses)}</b><small>{formatRatio(totalGames > 0 ? team.wins / totalGames : undefined)} of series won</small></dd></div>
              <div><dt>Rank on results alone</dt><dd><b>{team.deservedStanding?.rank ? `#${team.deservedStanding.rank}` : 'Unavailable'}</b><small>{powerResumeGap?.rankDetail ?? 'results rank unavailable'}{team.deservedStanding ? `, results score ${formatRating(team.deservedStanding.score)}` : ''}</small></dd></div>
              {nearTie ? <div><dt>Near tie</dt><dd><b>{nearTie.label}</b><small>{nearTie.detail}</small></dd></div> : null}
            </>
          )}
        </dl>

        <section className={sectionClassName} aria-label="Power over time">
          <h3 className="text-sm font-semibold text-text">{tournament ? `${tournament.label} movement` : 'Power this season'}</h3>
          {trendSeries.length > 0 ? (
            <div className="-mx-2 [&_.chart_svg]:min-h-[200px]">
              <Suspense fallback={<TrendChartSkeleton />}>
                <LazyTeamHistoryLineChart series={trendSeries} height={220} yLabel="Power" events={tournament ? undefined : events} />
              </Suspense>
            </div>
          ) : historyState.status === 'loading' ? (
            <TrendChartSkeleton />
          ) : historyState.status === 'missing' || historyState.status === 'error' ? (
            <p className="text-sm text-muted">{historyState.message}</p>
          ) : (
            <p className="text-sm text-muted">{historyState.status === 'idle' ? 'Rating history loads when this panel opens.' : 'Not enough history to chart this team yet.'}</p>
          )}
          {trendSummary ? (
            <p className="text-xs leading-[1.5] text-muted tabular-nums">
              From {formatRating(trendSummary.opening)} on {formatDate(trendSummary.startDate)} to {formatRating(trendSummary.current)}, net <b className={cn('font-semibold', trendSummary.netChange >= 0 ? 'text-up' : 'text-down')}>{formatRatingMovement(trendSummary.netChange)}</b>. Peak {formatRating(trendSummary.peak.value)} on {formatDate(trendSummary.peak.date)}{typeof trendSummary.bestRank === 'number' ? `, best rank #${trendSummary.bestRank}` : ''}.
              {trendSeries.length > 0 ? ' Power is a model rating. Tap or use the arrow keys on the chart to inspect each recorded change.' : ''}
            </p>
          ) : null}
          {tournament ? (
            <p className={tournamentDataNoteClassName}>
              {tournamentBoundaryLabel(tournament.status)} {formatDate(tournament.boundaryDate)}, rated through {formatDate(tournament.ratedThroughDate)}
              {tournament.scheduledEndDate ? `, scheduled end ${formatDate(tournament.scheduledEndDate)}` : ''}
              {tournament.dataLag ? '. Schedule results are ahead of rated evidence' : ''}
              {`. Model ${formatModelVersion(tournament.modelVersion)}.`}
            </p>
          ) : null}
        </section>

        {tournament ? null : <TeamLeagueProfile team={team} standings={standings} />}

        <section className={sectionClassName} aria-label="Match results">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Recent series</h3>
            <FormDots form={team.form} />
          </div>
          <RecentMatches
            matches={team.recentMatches}
            series={series}
            standings={standings}
            historyState={historyState}
            seriesOnly={Boolean(tournament)}
          />
          <a className="w-fit text-sm font-semibold text-focus underline-offset-2 hover:underline" href={matchesHref}>All {team.team} series in Matches</a>
        </section>

        {opponents.length > 0 ? (
          <details className={disclosureClassName}>
            <summary>Chance to beat the top teams</summary>
            <p className="mt-2 text-xs text-muted">Best of three, neutral side, model {formatModelVersion(model?.version)}.</p>
            <ul className="mt-3 grid gap-2" aria-label={`${team.code ?? team.team} against the top teams`}>
              {opponents.map(({ opponent, chance }) => (
                <li className="grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 text-sm" key={teamKey(opponent)}>
                  <b className="truncate font-bold text-text">{opponent.code ?? opponent.team}<span className="sr-only">: {chance}% for {team.code ?? team.team} to win a best of three</span></b>
                  <span className="relative h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${chance}%`, background: color }} />
                    <span className="absolute inset-y-[-2px] left-1/2 w-px bg-muted" />
                  </span>
                  <b className="text-right font-semibold text-text tabular-nums" aria-hidden="true">{chance}%</b>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className={disclosureClassName}>
          <summary>How the score is built</summary>
          <p className="mt-3 text-sm text-muted">League strength plus this team's results, roster and form. Evidence band {formatUncertaintyBand(uncertainty ?? 0)}{rankEvidence ? `, so its likely rank is ${rankEvidence.label}` : ''}. Score family {scoreFamilyLabel(team.scoreFamily)}. The record counts the {recordBasisLabel(team.recordBasis)}.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 [&_small]:block [&_small]:text-xs [&_small]:text-muted [&_b]:block [&_em]:block [&_em]:text-xs [&_em]:not-italic [&_em]:text-muted">
            {!tournament ? (
              <span>
                <small>Power rank vs results rank</small>
                <b>{powerResumeGap?.label ?? 'No results check'}</b>
                <em>{powerResumeGap?.detail ?? 'results rank unavailable'}</em>
              </span>
            ) : null}
            <span>
              <small>Most important events</small>
              <b>{weightSummary?.label ?? 'Pending'}</b>
              <em>{weightSummary ? `${weightSummary.detail}. ${weightSummary.title}` : 'match rows show each event weight'}</em>
            </span>
            {!tournament ? (
              <span>
                <small>Schedule strength</small>
                <b>{opponentFactor}%</b>
                <em>of the strongest possible schedule, from normalized opponent strength</em>
              </span>
            ) : null}
            {!tournament ? (
              <span>
                <small>Roster coverage</small>
                <b>{team.deservedStanding ? formatRatio(team.deservedStanding.rosterValidity) : 'Match-based'}</b>
                <em>{team.deservedStanding?.eligibility ?? (team.eligibility?.eligible === false ? 'Limited evidence' : 'Enough evidence to rank')}</em>
              </span>
            ) : null}
            {tournamentMovement ? (
              <span>
                <small>Endpoint eligibility</small>
                <b>{tournamentMovement.eligible ? 'Ranked' : 'Unranked'}</b>
                <em>{tournamentMovement.eligibilityReasons.join(', ') || 'ranking checks passed'}</em>
              </span>
            ) : null}
          </div>
          {tournament ? null : <div className="mt-3"><ComponentBreakdown team={team} /></div>}
        </details>
        <details className={disclosureClassName} onToggle={(event) => {
          if (event.currentTarget.open) onRequestPlayers?.()
        }}>
          <summary>Players</summary>
          <PlayerRankingCard team={team} players={players} currentLineup={currentLineup} loadState={playerLoadState} playerScopeLabel={playerScopeLabel} />
        </details>
      </article>
    </section>
  )
}

type NearTieFact = { label: string; detail: string }

/** The near tie with the ranked team above or below, by the board's own Bo1 rule. */
function nearTieFact(team: RankingSummaryStanding, ranked: readonly RankingSummaryStanding[], model?: PublicMatchupModel): NearTieFact | undefined {
  const index = ranked.findIndex((entry) => teamKey(entry) === teamKey(team))
  if (index < 0) return undefined
  const above = ranked[index - 1]
  const below = ranked[index + 1]
  const ties = (higher?: RankingSummaryStanding, lower?: RankingSummaryStanding) => Boolean(higher && lower && nearTieGroups([higher, lower], model).length === 1)
  const tied = [ties(above, team) ? above : undefined, ties(team, below) ? below : undefined].filter((entry): entry is RankingSummaryStanding => Boolean(entry))
  const name = (entry: RankingSummaryStanding) => entry.code ?? entry.team
  const gap = (higher: RankingSummaryStanding, lower: RankingSummaryStanding) => formatRating(Math.abs(higher.rating - lower.rating))
  const neighbour = tied[0] ?? above ?? below
  const detail = neighbour ? `${gap(team, neighbour)} ${neighbour === above ? 'behind' : 'ahead of'} ${name(neighbour)}` : 'no ranked neighbour'
  return {
    label: tied.length > 0 ? `With ${tied.map(name).join(' and ')}` : 'None',
    detail: tied.length > 0 ? `${detail}, under ${Math.round(NEAR_TIE_WIN_PROBABILITY * 100)}% per game` : detail,
  }
}

/** Best-of-three chances against the top five ranked teams other than this one. */
function wouldBeatOdds(team: RankingSummaryStanding, rankedStandings: readonly RankingSummaryStanding[], model?: PublicMatchupModel) {
  if (team.eligibility?.eligible === false) return []
  return rankedStandings
    .filter((other) => teamKey(other) !== teamKey(team))
    .slice(0, 5)
    .map((opponent) => ({
      opponent,
      chance: Math.round(estimatePublicMatchup(team, opponent, model, { bestOf: 3 }).homeSeriesWinProbability * 100),
    }))
}

function TrendChartSkeleton() {
  return <LoadingState presentation="chart" className="trend-chart-skeleton" label="Loading rating trajectory" announce={false} />
}

type TeamTrendSummary = {
  opening: number
  current: number
  netChange: number
  startDate: string
  endDate: string
  pointCount: number
  peak: { value: number; date: string }
  bestRank?: number
}

function summarizeTeamTrend(series?: TeamHistorySeries): TeamTrendSummary | null {
  if (!series || series.points.length < 2) return null
  const points = series.points
  const first = points[0]
  const last = points.at(-1)!
  let peak = { value: first[1], date: first[0] }
  let bestRank: number | undefined
  for (const point of points) {
    if (point[1] > peak.value) peak = { value: point[1], date: point[0] }
    const rank = point[2]
    if (Number.isFinite(rank) && rank > 0) bestRank = typeof bestRank === 'number' ? Math.min(bestRank, rank) : rank
  }
  return {
    opening: first[1],
    current: last[1],
    netChange: last[1] - first[1],
    startDate: first[0],
    endDate: last[0],
    pointCount: points.length,
    peak,
    bestRank,
  }
}
