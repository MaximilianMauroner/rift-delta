import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Globe2, X } from 'lucide-react'
import {
  displayRegionPowerScore,
  displayRegionTotalTeamRating,
  isRegionPowerTeam,
  type RegionStrength,
} from '../../domains/rankings/read'
import type { PublicMatchHistoryEntry, PublicRegionHistorySeries, PublicTeamStanding } from '../../domains/rankings/types'
import type { MatchHistoryState, RegionHistoryScopeState } from '../../browser/rankings/usePublicArtifacts'
import { useHistoryDetail } from '../../hooks/useHistoryDetail'
import {
  formatDate,
  formatDecimal,
  formatNumber,
  formatRating,
  formatRatio,
  formatRecord,
  formatSigned,
} from '../../shared/display'
import { DataState, RegionBadge } from '../../components/ui'
import { FieldStrip, FieldStripKey } from '../../components/FieldStrip'
import { fieldPosition, type Better } from '../../domains/rankings/field-statistics'
import { LoadingState } from '../../components/ui/loading'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { PageShell } from '../../components/ui/page-shell'
import { Panel, PanelBody, PanelHeader } from '../../components/ui/panel'
import { Lane } from '../../components/ui/lane'
import { Table, TableBody, TableCell, TableRow } from '../../components/ui/table'
import { leagueColor } from '../../shared/teamColor'
import { cn } from '../../shared/utils'
import { TeamMark } from '../../components/TeamMark'
import { LineChart, type ChartSeries } from '../../components/LineChart'
import { RegionDepthChart } from '../../components/RegionDepthChart'
import { RegionPowerHistory } from './RegionPowerHistory'
import { CompareToggle } from '../rankings/CompareToggle'
import { seriesWinner } from '../matches/seriesOutcome'
import './regions.css'

export function RegionsView({
  regions,
  standings,
  regionHistoryState,
  matchHistoryState,
  onRequestMatchHistoryPages,
  pickedIds,
  onToggle,
  onRequestRegionHistory,
}: {
  regions: RegionStrength[]
  standings: RegionStanding[]
  regionHistoryState: RegionHistoryScopeState
  matchHistoryState: MatchHistoryState
  onRequestMatchHistoryPages: (pages: number[]) => void
  pickedIds: Set<string>
  onToggle: (region: RegionStrength) => void
  onRequestRegionHistory?: () => void
}) {
  const { value: selectedRegionId, open: openRegionDetail, close: closeRegionDetail } = useHistoryDetail('regionDetail')
  const boardRef = useRef<HTMLDivElement>(null)
  const previousRegionId = useRef<string | null>(null)
  const boardScroll = useRef(0)
  useEffect(() => {
    const previous = previousRegionId.current
    previousRegionId.current = selectedRegionId
    const ownPage = window.matchMedia('(max-width: 1279px)').matches
    if (selectedRegionId && !previous && ownPage) window.scrollTo({ top: 0, behavior: 'auto' })
    if (!selectedRegionId && previous) {
      if (ownPage) window.scrollTo({ top: boardScroll.current, behavior: 'auto' })
      boardRef.current?.querySelector<HTMLButtonElement>(`[data-region="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true })
    }
  }, [selectedRegionId])
  const strongest = useMemo(
    () => [...regions].sort((a, b) => displayRegionPowerScore(b) - displayRegionPowerScore(a))[0],
    [regions],
  )
  const bestRecord = useMemo(
    () => regions
      .filter((region) => Number.isFinite(region.winsOverExpected))
      .sort((a, b) => (b.winsOverExpected ?? 0) - (a.winsOverExpected ?? 0))[0],
    [regions],
  )
  const selectedRegion = useMemo(
    () => regions.find((region) => region.region === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  )
  const selectedRegionTeams = useMemo(
    () => selectedRegion ? flagshipTeamsForRegion(selectedRegion, standings) : [],
    [selectedRegion, standings],
  )
  const historyLines = useMemo(
    () => regions
      .map((region) => ({ region: region.region, color: leagueColor(region.flagshipLeague ?? region.region) }))
      .filter((line) => pickedIds.size === 0 || pickedIds.has(line.region)),
    [pickedIds, regions],
  )
  const regionHistory = regionHistoryState.status === 'ready' ? regionHistoryState.data : undefined
  const powers = regions.map(displayRegionPowerScore)
  const laneMin = Math.floor(Math.min(...powers) / 100) * 100
  const laneMax = Math.max(laneMin + 100, Math.ceil(Math.max(...powers) / 100) * 100)

  if (regions.length === 0) {
    return (
      <PageShell>
        <Card>
          <DataState icon={<Globe2 size={26} aria-hidden="true" />} title="No regional data in this scope">
            Try a broader scope.
          </DataState>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell className={cn('regions-view', selectedRegion && 'regions-view--selected')}>
      <div ref={boardRef} className="regions-board">
        <p className="regions-lead" data-first-answer="regions">
          <strong>{strongest?.region}</strong> leads with {formatRating(strongest ? displayRegionPowerScore(strongest) : undefined)} Region power.
        </p>
        <details className="regions-scope-summary">
          <summary>{regions.length} regions in this scope</summary>
          <p>{regions.map((region) => region.region).join(', ')}.</p>
          {bestRecord && <p>Best international record by wins vs expected, {bestRecord.region} with {formatSignedDecimal(bestRecord.winsOverExpected)}.</p>}
        </details>
        <Panel>
          <PanelHeader title="Regional standings" />
          <div className="regions-scale" aria-hidden="true">
            <span>Rank / League</span><span>Power</span><span>{formatRating(laneMin)} to {formatRating(laneMax)}</span>
          </div>
          <Table className="regions-ladder" aria-label="League ladder">
            <TableBody>
              {regions.map((region) => {
                const picked = pickedIds.has(region.region)
                const power = displayRegionPowerScore(region)
                const league = region.flagshipLeague ?? region.region
                return (
                  <TableRow key={region.region} league={league} className={cn(selectedRegionId === region.region && 'regions-row--selected')}>
                    <TableCell className="regions-row-cell">
                      <Button
                        type="button"
                        variant="ghost"
                        data-row-open=""
                        data-region={region.region}
                        className="regions-row-open"
                        title={`Open ${region.region} region detail`}
                        aria-expanded={selectedRegionId === region.region}
                        onClick={() => {
                          boardScroll.current = window.scrollY
                          onRequestRegionHistory?.()
                          openRegionDetail(region.region)
                        }}
                        onFocus={onRequestRegionHistory}
                        onPointerEnter={onRequestRegionHistory}
                      >
                        <span className="regions-rank">{region.rank}</span>
                        <span className="regions-identity">
                          {region.region !== league ? <strong>{region.region}</strong> : null}
                          <RegionBadge region={league} />
                        </span>
                        <strong className="regions-power"><span className="sr-only">Region power </span>{formatRating(power)}</strong>
                        <Lane league={league} value={power} low={power} high={power} min={laneMin} max={laneMax} label={`${region.region} Region power ${formatRating(power)} on a scale from ${formatRating(laneMin)} to ${formatRating(laneMax)}`} />
                        <span className="regions-top-teams">
                          {region.topTeams.slice(0, 3).map((team) => (
                            <span className="regions-top-team" key={team.team}>
                              <TeamMark team={team.team} code={team.code} className="size-5 border-0 bg-transparent" imageClassName="p-0" />
                              <span>{team.team}</span>
                              <span className="sr-only">, Power {formatRating(team.rating)}</span>
                            </span>
                          ))}
                        </span>
                      </Button>
                      <details className="regions-row-facts">
                        <summary>View teams and record ({region.teamCount} teams)</summary>
                        <dl>
                          <div><dt>International record</dt><dd>{formatRecord(region.internationalWins, region.internationalLosses)} · {formatRatio(region.internationalWinRate)}</dd></div>
                          <div><dt>Wins vs expected</dt><dd>{formatSignedDecimal(region.winsOverExpected)}</dd></div>
                          <div><dt>Opponent Power</dt><dd>{formatRating(region.averageOpponentRating)}</dd></div>
                          <div><dt>Depth gap</dt><dd>{formatRating(power - displayRegionTotalTeamRating(region))}</dd></div>
                          <div><dt>All-team average</dt><dd>{formatRating(displayRegionTotalTeamRating(region))}</dd></div>
                        </dl>
                        <ul>
                          {region.topTeams.slice(0, 3).map((team) => <li key={team.team}>{team.team} · Power {formatRating(team.rating)}</li>)}
                        </ul>
                      </details>
                    </TableCell>
                    <TableCell className="regions-compare-cell">
                      <CompareToggle picked={picked} onToggle={() => onToggle(region)} label={region.region} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <RegionDossier
        region={selectedRegion}
        regions={regions}
        teams={selectedRegionTeams}
        series={selectedRegion ? regionHistory?.regionPowerSeries[selectedRegion.region] : undefined}
        matchHistoryState={matchHistoryState}
        onRequestMatchHistoryPages={onRequestMatchHistoryPages}
        onClose={closeRegionDetail}
      />

      <div className="regions-charts">
        <Panel>
          <PanelHeader
            title="Region power over time"
            description={`Each line shows the historical mean Power of up to three highest-rated teams from each region's eligible field, day by day. ${pickedIds.size > 0
              ? 'The chart shows only the regions that you compare.'
              : 'Select Compare on a region above to show only the regions that you compare.'}`}
          />
          <PanelBody className="px-0 pt-0 pb-1">
            <RegionPowerHistory state={regionHistoryState} lines={historyLines} standings={standings} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Region depth" />
          <PanelBody className="grid gap-3">
            <RegionDepthLegend />
            <p className="max-w-[78ch] text-sm leading-relaxed text-muted">Each dot is a team. Dots with similar Power stack down so each team stays reachable. Only horizontal position shows Power.</p>
            <RegionDepthChart regions={regions} />
          </PanelBody>
        </Panel>
      </div>
    </PageShell>
  )
}

type RegionStanding = Pick<PublicTeamStanding, 'team' | 'code' | 'region' | 'league' | 'rating' | 'rank' | 'eligibility'>

type RegionTeam = {
  team: string
  code?: string
  rating: number
  rank?: number
}

function RegionPowerTrend({ series, region, league }: { series?: PublicRegionHistorySeries; region: string; league: string }) {
  const chartSeries = useMemo<ChartSeries[]>(() => series && series.points.length >= 2 ? [{
    id: region,
    label: region,
    color: leagueColor(league),
    points: series.points.map((point) => ({ t: Date.parse(point[0]), y: point[1] })),
  }] : [], [league, region, series])
  const first = series?.points[0]
  const last = series?.points.at(-1)
  const delta = first && last ? last[1] - first[1] : undefined
  const deltaTone = typeof delta === 'number' && delta < 0
    ? 'down'
    : typeof delta === 'number' && delta > 0
      ? 'up'
      : undefined

  return (
    <section className="min-w-0 border-t border-line" aria-label={`${region} power trajectory`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-3 max-[560px]:px-3">
        <h3 className="text-base font-semibold text-text">Power trajectory</h3>
        {first && last && chartSeries.length > 0 ? (
          <span className="text-sm text-muted tabular-nums">
            <b className={deltaTone === 'up' ? 'text-up' : deltaTone === 'down' ? 'text-down' : 'text-text'}>{formatSignedDecimal(delta)}</b>
            {' '}from {formatDate(first[0])} to {formatDate(last[0])}
          </span>
        ) : null}
      </div>
      {chartSeries.length > 0 ? (
        <LineChart series={chartSeries} height={240} yLabel="Region power" yFormat={formatRating} />
      ) : (
        <p className="px-4 pt-2 pb-4 text-sm text-muted max-[560px]:px-3">History pending</p>
      )}
    </section>
  )
}


const internationalSeries = (region: RegionStrength) => region.internationalWins + region.internationalLosses

const REGION_STATS: Array<{
  label: string
  hint: string
  better: Better
  value: (region: RegionStrength) => number | undefined
  sample: (region: RegionStrength) => number
  unit: string
  format: (value: number) => string
}> = [
  { label: 'Adjusted win rate', hint: 'International win rate after opponent strength. 50% means as expected.', better: 'higher', value: (region) => region.opponentAdjustedWinRate, sample: internationalSeries, unit: 'international series', format: formatRatio },
  { label: 'Wins vs expected', hint: 'International wins minus the wins the ratings expected.', better: 'higher', value: (region) => region.winsOverExpected, sample: internationalSeries, unit: 'international series', format: formatSignedDecimal },
  { label: 'Best team', hint: 'Power of its strongest team.', better: 'higher', value: (region) => region.topTeamRating, sample: (region) => region.teamCount, unit: 'teams', format: formatRating },
  { label: 'Average team', hint: 'Average Power of all its ranked flagship teams.', better: 'higher', value: displayRegionTotalTeamRating, sample: (region) => region.teamCount, unit: 'teams', format: formatRating },
  { label: 'Opponent strength', hint: 'Average Power of its international opponents. Context, not better or worse.', better: null, value: (region) => region.averageOpponentRating, sample: internationalSeries, unit: 'international series', format: formatRating },
  { label: 'International sample', hint: 'How much the region score rests on its own international games. More games give a higher share.', better: null, value: (region) => region.connectivity, sample: internationalSeries, unit: 'international series', format: formatRatio },
]

function RegionDossier({
  region,
  regions,
  teams,
  series,
  matchHistoryState,
  onRequestMatchHistoryPages,
  onClose,
}: {
  region: RegionStrength | null
  regions: RegionStrength[]
  teams: RegionTeam[]
  series?: PublicRegionHistorySeries
  matchHistoryState: MatchHistoryState
  onRequestMatchHistoryPages: (pages: number[]) => void
  onClose: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const regionId = region?.region
  useEffect(() => {
    if (regionId) headingRef.current?.focus({ preventScroll: true })
  }, [regionId])
  if (!region) return null
  const displayedTeams = teams.length > 0 ? teams : region.topTeams

  return (
    <Panel
      className="region-dossier"
      role="region"
      aria-label={`${region.region} region detail`}
      league={region.flagshipLeague ?? region.region}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        onClose()
      }}
    >
      <nav className="region-dossier-header" aria-label="Region pages">
        <Button type="button" variant="ghost" className="region-dossier-back" onClick={onClose} aria-label="Back to regions"><ChevronLeft size={16} aria-hidden="true" />Regions</Button>
        <Button type="button" variant="ghost" className="region-dossier-close" onClick={onClose}><X size={16} aria-hidden="true" />Close</Button>
      </nav>
      <div className="region-dossier-body">
        <section className="flex flex-wrap items-start justify-between gap-4 p-1" aria-label={`${region.region} summary`}>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="region-dossier-heading text-xl leading-tight font-semibold text-text">{region.region}</h2>
            <p className="mt-2 flex max-w-[72ch] flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span:not(:last-child)::after]:ml-2.5 [&>span:not(:last-child)::after]:text-muted [&>span:not(:last-child)::after]:content-['·']">
              <span>Rank {region.rank}</span>
              <span>{region.flagshipLeague ?? 'Multiple flagship leagues'}</span>
              <span>{formatTier(region.tier)}</span>
              <span>{formatCountWithUnit(region.teamCount, 'flagship team')}</span>
            </p>
          </div>
          <strong className="grid justify-items-end gap-1 text-3xl leading-none text-text tabular-nums max-[560px]:justify-items-start">
            {formatRating(displayRegionPowerScore(region))}
            <span className="text-sm font-semibold text-muted">Region power</span>
          </strong>
        </section>

        <RegionPowerTrend series={series} region={region.region} league={region.flagshipLeague ?? region.region} />

        <div className="border-t border-line">
          <DetailStat
            label="International record"
            value={formatRecord(region.internationalWins, region.internationalLosses)}
            description={`Win rate ${formatRatio(region.internationalWinRate)}. Bo2 ties count as half.`}
          />
        </div>
        <details className="border-t border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">Compared with other regions</summary>
          <div className="mt-2 grid gap-2">
            <ol className="grid min-w-0 divide-y divide-line" aria-label={`${region.region} compared with other regions`}>
              {REGION_STATS.map((stat) => (
                <FieldStrip
                  key={stat.label}
                  label={stat.label}
                  hint={stat.hint}
                  subject={region.region}
                  subjectId={region.region}
                  position={fieldPosition(
                    regions.map((entry) => ({ id: entry.region, value: stat.value(entry) ?? null, n: stat.sample(entry) })),
                    region.region,
                    1,
                    stat.better,
                  )}
                  format={stat.format}
                  nameFor={(id) => id}
                  within="of all regions"
                  minSamples={1}
                  sampleUnit={stat.unit}
                />
              ))}
            </ol>
            <FieldStripKey subject={region.region} others="Other regions" />
          </div>
        </details>

        <details className="border-t border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">Matches and score history</summary>
          <RegionMatchHistory key={region.region} region={region} teams={displayedTeams} series={series} state={matchHistoryState} onRequestPages={onRequestMatchHistoryPages} />
        </details>

        <section className="grid gap-3 border-t border-line px-4 py-4 max-sm:px-3" aria-label={`${region.region} teams`}>
          <h3 className="text-base font-semibold text-text">Teams</h3>
          <div className="grid max-h-[min(420px,42vh)] overflow-y-auto pr-1.5 [scrollbar-gutter:stable]">
            {displayedTeams.length > 0 ? (
              displayedTeams.map((team, index) => (
                <div className="grid grid-cols-[52px_36px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-3 first:border-t-0 max-[560px]:grid-cols-[38px_32px_minmax(0,1fr)_auto] max-[560px]:gap-2" key={team.team}>
                  <span className="text-sm text-muted">{team.rank ? `#${team.rank}` : `#${index + 1}`}</span>
                  <TeamMark team={team.team} code={team.code} className="size-9 max-[560px]:size-8" />
                  <div>
                    <b className="block text-sm text-text [overflow-wrap:anywhere]">{team.team}</b>
                    {team.code ? <small className="mt-0.5 block text-sm text-muted">{team.code}</small> : null}
                  </div>
                  <strong className="text-text tabular-nums">{formatRating(team.rating)}</strong>
                </div>
              ))
            ) : (
              <p className="text-muted">No teams in this scope.</p>
            )}
          </div>
        </section>
      </div>
    </Panel>
  )
}

const REGION_MATCH_PAGE_SIZE = 15

type RegionMatchSeries = {
  id: string
  games: PublicMatchHistoryEntry[]
  summary: PublicMatchHistoryEntry
}

function RegionMatchHistory({
  region,
  teams,
  series,
  state,
  onRequestPages,
}: {
  region: RegionStrength
  teams: RegionTeam[]
  series?: PublicRegionHistorySeries
  state: MatchHistoryState
  onRequestPages: (pages: number[]) => void
}) {
  const [page, setPage] = useState(1)
  const teamNames = useMemo(() => new Set(teams.map((team) => team.team)), [teams])
  const refs = useMemo(
    () => state.status === 'ready' ? state.data.catalog.series.filter((match) => teamNames.has(match.teamA.name) || teamNames.has(match.teamB.name)) : [],
    [state, teamNames],
  )
  const movements = useMemo(() => regionMovementsByDate(series), [series])
  const pageCount = Math.max(1, Math.ceil(refs.length / REGION_MATCH_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * REGION_MATCH_PAGE_SIZE
  const visibleRefs = refs.slice(pageStart, pageStart + REGION_MATCH_PAGE_SIZE)
  const neededPages = useMemo(() => [...new Set(visibleRefs.map((entry) => entry.page))], [visibleRefs])
  const neededPagesKey = neededPages.join(',')
  const loadedMatches = useMemo(() => state.status === 'ready' ? neededPages.flatMap((pageNumber) => {
    const pageState = state.data.pages[pageNumber]
    return pageState?.status === 'ready' ? pageState.data.matches : []
  }) : [], [neededPages, state])
  const loadedSeries = useMemo(() => new Map(regionMatchSeries(loadedMatches, teamNames).map((entry) => [entry.id, entry])), [loadedMatches, teamNames])
  const visibleMatches = visibleRefs.map((entry) => loadedSeries.get(entry.id)).filter((entry): entry is RegionMatchSeries => Boolean(entry))
  const pageFailure = state.status === 'ready' ? neededPages.map((pageNumber) => state.data.pages[pageNumber]).find((entry) => entry?.status === 'error' || entry?.status === 'missing') : undefined
  const pageLoading = state.status === 'ready' && neededPages.some((pageNumber) => {
    const pageState = state.data.pages[pageNumber]
    return !pageState || pageState.status === 'idle' || pageState.status === 'loading'
  })

  useEffect(() => {
    if (!neededPagesKey) return
    onRequestPages(neededPagesKey.split(',').map(Number))
  }, [neededPagesKey, onRequestPages])

  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface" aria-label={`${region.region} match and score history`}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 max-[560px]:p-3">
        <h3 className="text-base font-semibold text-text">Matches</h3>
      </div>

      {state.status === 'idle' ? (
        <p className="px-4 py-5 text-sm text-muted">Not loaded.</p>
      ) : state.status === 'loading' ? (
        <LoadingState presentation="rows" className="m-3" label={`Loading ${region.region} match history`} />
      ) : state.status === 'missing' || state.status === 'error' ? (
        <p className="px-4 py-5 text-sm text-muted">{state.message}</p>
      ) : refs.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">No matches in this scope.</p>
      ) : (
        <>
          {visibleMatches.length > 0 ? (
            <div>
              {visibleMatches.map((match) => (
                <RegionMatchRow
                  key={match.id}
                  match={match}
                  teamNames={teamNames}
                  movement={movements.get(match.summary.date)}
                />
              ))}
            </div>
          ) : null}
          {pageLoading ? <LoadingState presentation="rows" className="m-3" rowCount={6} label={`Loading ${region.region} matches`} /> : null}
          {pageFailure?.status === 'error' || pageFailure?.status === 'missing' ? (
            <p className="px-4 py-5 text-sm text-text" role="alert">{pageFailure.message}</p>
          ) : null}
          {pageCount > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted max-[560px]:px-3" aria-label={`${region.region} match history pagination`}>
              <span>{formatNumber(pageStart + 1)}–{formatNumber(pageStart + visibleRefs.length)} of {formatNumber(refs.length)}</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={`Previous ${region.region} match history page`}><ChevronLeft /></Button>
                <span className="min-w-20 text-center font-semibold text-text">Page {currentPage} of {pageCount}</span>
                <Button type="button" variant="outline" size="icon" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label={`Next ${region.region} match history page`}><ChevronRight /></Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function RegionMatchRow({
  match,
  teamNames,
  movement,
}: {
  match: RegionMatchSeries
  teamNames: Set<string>
  movement?: RegionDailyMovement
}) {
  const { summary } = match
  const teamAIsRegional = teamNames.has(summary.teamA.name)
  const teamBIsRegional = teamNames.has(summary.teamB.name)
  const regionalClash = teamAIsRegional && teamBIsRegional
  const winner = seriesWinner(summary)
  const outcome: 'clash' | 'draw' | 'win' | 'loss' = regionalClash ? 'clash' : winner === undefined ? 'draw' : winner === (teamAIsRegional ? 'A' : 'B') ? 'win' : 'loss'
  const outcomeClass = {
    clash: 'bg-line text-muted',
    draw: 'bg-line text-muted',
    win: 'bg-[var(--up-wash)] text-up',
    loss: 'bg-[var(--down-wash)] text-down',
  }[outcome]
  const outcomeLabel = { clash: 'Regional matchup', draw: 'Region draw', win: 'Region win', loss: 'Region loss' }[outcome]
  const impactParts = [
    teamAIsRegional && typeof summary.impact.teamA === 'number' ? `${summary.teamA.code} ${formatSigned(summary.impact.teamA)}` : undefined,
    teamBIsRegional && typeof summary.impact.teamB === 'number' ? `${summary.teamB.code} ${formatSigned(summary.impact.teamB)}` : undefined,
  ].filter((part): part is string => Boolean(part))
  const contributors = movement?.context?.contributingTeams ?? []
  const contributingTeam = [summary.teamA.name, summary.teamB.name].find((team) => teamNames.has(team) && contributors.includes(team))
  const contributorImpacts = [
    ...(teamAIsRegional && contributors.includes(summary.teamA.name) ? [summary.impact.teamA] : []),
    ...(teamBIsRegional && contributors.includes(summary.teamB.name) ? [summary.impact.teamB] : []),
  ]
  const directRegionEffect = summary.impact.unit === 'series-applied' && contributorImpacts.length > 0
    && contributorImpacts.every((impact): impact is number => typeof impact === 'number' && Number.isFinite(impact))
    ? contributorImpacts.reduce((total, impact) => total + impact, 0) / contributors.length
    : undefined

  return (
    <article className="grid gap-3 border-t border-line px-4 py-3.5 first:border-t-0 max-sm:px-3">
      <div className="text-sm text-muted">
        <span className="block">{formatDate(summary.datetimeUtc ?? summary.date)}</span>
        <span className="mt-1 block">Bo{summary.bestOf} · {match.games.length} {match.games.length === 1 ? 'game' : 'games'}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{summary.event}</p>
        <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
          <strong className={cn('[overflow-wrap:anywhere]', teamAIsRegional && 'text-text')}>{summary.teamA.name}</strong>
          <span className="shrink-0 font-bold text-text tabular-nums">{summary.seriesWinsA}–{summary.seriesWinsB}</span>
          <strong className={cn('[overflow-wrap:anywhere]', teamBIsRegional && 'text-text')}>{summary.teamB.name}</strong>
        </div>
      </div>
      <div>
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-1 text-xs font-bold',
          outcomeClass,
        )}>
          {outcomeLabel}
        </span>
        <p className="mt-1.5 text-sm text-muted tabular-nums">
          {impactParts.length > 0 ? `Team Power ${impactParts.join(' · ')}` : '—'}
        </p>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-t border-line pt-2.5">
        <ArrowRight className="size-4 text-muted" aria-hidden="true" />
        <div>
          <span className="block text-xs text-muted">Series</span>
          <strong className={cn('block text-sm tabular-nums', typeof directRegionEffect === 'number' && directRegionEffect > 0 ? 'text-up' : typeof directRegionEffect === 'number' && directRegionEffect < 0 ? 'text-down' : 'text-text')}>
            {typeof directRegionEffect === 'number'
              ? directRegionEffect === 0 ? 'No change' : `≈ ${formatSignedDecimal(directRegionEffect)} pts`
              : contributingTeam ? 'Unavailable' : 'Not top three'}
          </strong>
          <small className="mt-0.5 block text-xs text-muted">
            {movement
              ? `Day total ${formatSignedDecimal(movement.delta)} → ${formatRating(movement.score)}${contributingTeam ? ` · ${contributingTeam}` : ''}`
              : '—'}
          </small>
        </div>
      </div>
    </article>
  )
}

type RegionDailyMovement = {
  score: number
  delta: number
  context?: PublicRegionHistorySeries['points'][number][3]
}

function regionMovementsByDate(series?: PublicRegionHistorySeries) {
  const movements = new Map<string, RegionDailyMovement>()
  const points = [...(series?.points ?? [])].sort((left, right) => left[0].localeCompare(right[0]))
  points.forEach((point, index) => {
    const previous = points[index - 1]
    movements.set(point[0], {
      score: point[1],
      delta: previous ? Number((point[1] - previous[1]).toFixed(1)) : 0,
      context: point[3],
    })
  })
  return movements
}

function regionMatchSeries(matches: PublicMatchHistoryEntry[], teamNames: Set<string>): RegionMatchSeries[] {
  const groups = new Map<string, PublicMatchHistoryEntry[]>()
  for (const match of matches) {
    if (!teamNames.has(match.teamA.name) && !teamNames.has(match.teamB.name)) continue
    groups.set(match.seriesId, [...(groups.get(match.seriesId) ?? []), match])
  }
  return [...groups.entries()]
    .map(([id, games]) => {
      const sortedGames = games.toSorted((left, right) => left.gameNumber - right.gameNumber || left.id.localeCompare(right.id))
      const summary = sortedGames.findLast((game) => game.impact.unit === 'series-applied') ?? sortedGames.at(-1)
      if (!summary) throw new Error(`Cannot display empty regional match series ${id}`)
      return { id, games: sortedGames, summary }
    })
    .sort((left, right) => (right.summary.datetimeUtc ?? right.summary.date).localeCompare(left.summary.datetimeUtc ?? left.summary.date) || right.id.localeCompare(left.id))
}

function flagshipTeamsForRegion(region: RegionStrength, standings: RegionStanding[]): RegionTeam[] {
  return standings
    .filter((team) => isRegionPowerTeam(region, team))
    .slice()
    .sort((left, right) => right.rating - left.rating)
    .map((team) => ({
      team: team.team,
      code: team.code,
      rating: team.rating,
      rank: team.rank,
    }))
}

function DetailStat({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="grid min-w-0 gap-1 px-4 py-3.5">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <strong className="text-base text-text tabular-nums [overflow-wrap:anywhere]">{value}</strong>
      {description ? <p className="text-sm leading-relaxed text-muted">{description}</p> : null}
    </div>
  )
}

function formatTier(value?: string) {
  if (!value) return 'Unknown tier'
  return value
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function formatCountWithUnit(value: number | undefined, singular: string) {
  const unit = value === 1 ? singular : `${singular}s`
  return `${formatNumber(value)} ${unit}`
}

function RegionDepthLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Chart legend">
      <li className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-text" aria-hidden="true" />
        Top three
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="size-[7px] rounded-full bg-muted" aria-hidden="true" />
        Other ranked team
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 bg-text" aria-hidden="true" />
        Region score
      </li>
    </ul>
  )
}

function formatSignedDecimal(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (Math.abs(value) < 0.05) return '0'
  return value > 0 ? `+${formatDecimal(value)}` : formatDecimal(value)
}
