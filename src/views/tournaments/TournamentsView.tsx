import { TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currentHashQuery, hashParam, writeNavigationHash } from '../../browser/navigation'
import { eventAddress, resolveEventLink } from '../../browser/tournaments/eventAddress'
import { REFRESH_MS, useTournamentResources, type ForecastArtifacts } from '../../browser/tournaments/resources'
import { worldsFeedEventKey } from '../../browser/tournaments/worldsArtifacts'
import { TeamMark } from '../../components/TeamMark'
import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { LoadingState } from '../../components/ui/loading'
import { Select } from '../../components/ui/select'
import { forecastTournamentSeries, pinnedForecast, scoreConditionedSeriesOdds, type ForecastReceipt, type TournamentForecast } from '../../domains/tournaments/forecast'
import { formatTournamentTime, groupTournamentSeries, seriesWinner, type TournamentEvent, type TournamentFeed, type TournamentSeries } from '../../domains/tournaments/read'
import { findSwissEvent } from '../../domains/tournaments/simulation'
import { ConditionalPowerPreview } from './ConditionalPowerPreview'
import { SwissPreview } from './SwissPreview'
import { TournamentBracket } from './TournamentBracket'
import { WorldsTournamentPanel } from './WorldsTournamentPanel'
import { cn } from '../../shared/utils'
import type { TournamentTab } from '../../browser/tournament-reports/navigation'

/** The server rechecks Leaguepedia every five minutes while the hub is viewed. */
const STALE_MS = 15 * REFRESH_MS
const EMPTY_EVENTS: TournamentEvent[] = []

function replaceLegacyEventAlias(requested: string, address: string | undefined): void {
  if (!address || requested === address || window.location.hash.slice(1).split('?', 2)[0] !== 'tournaments') return
  const query = currentHashQuery()
  if (hashParam('event', query) !== requested) return
  query.set('event', address)
  writeNavigationHash(`#tournaments?${query}`, 'replace')
}

export function TournamentsView({ view, onAvailabilityChange }: { view: TournamentPanel; onAvailabilityChange: (hasEvent: boolean, swiss: boolean) => void }) {
  const [requestedEvent, setRequestedEvent] = useState(() => hashParam('event') ?? '')
  const { state, now, forecastArtifacts, refresh } = useTournamentResources(view)
  const events = state.status === 'ready' ? state.feed.events : EMPTY_EVENTS
  useEffect(() => {
    const onHashChange = () => {
      const query = currentHashQuery()
      const requested = hashParam('event', query) ?? ''
      const link = resolveEventLink(events, requested)
      replaceLegacyEventAlias(requested, link.kind === 'resolved' ? link.address : undefined)
      setRequestedEvent(requested)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [events])
  const link = resolveEventLink(events, requestedEvent)
  const selected = link.kind === 'resolved' ? link.event : link.kind === 'absent' ? nextEvent(events, now) : undefined
  const address = link.kind === 'resolved' ? link.address : undefined
  useEffect(() => {
    replaceLegacyEventAlias(requestedEvent, address)
  }, [address, requestedEvent])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  const grouped = useMemo(() => groupTournamentSeries(selected?.series ?? []), [selected])

  const swissAvailable = selected !== undefined && selected === findSwissEvent(events)
  const hasEvent = state.status !== 'ready' || selected !== undefined
  useEffect(() => {
    onAvailabilityChange(hasEvent, swissAvailable)
  }, [hasEvent, onAvailabilityChange, swissAvailable])
  if (state.status === 'loading') return <div className="grid min-w-0 gap-3 px-[var(--page-x)] pt-2"><LoadingState presentation="page" layout="schedule" delay={false} label="Loading tournament schedule" /></div>
  if (state.status === 'error') return <div className="grid min-w-0 gap-3 px-[var(--page-x)] pt-2 pb-6"><Alert variant="warning" role="alert"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Tournament schedule unavailable: {state.message} <Button className="ml-2" onClick={() => void refresh()}>Retry</Button></div></Alert></div>
  const sourceAge = now - Date.parse(state.health?.checkedAt ?? state.feed.fetchedAt)
  const stale = Boolean(state.error) || (state.health
    ? !state.health.complete || !Number.isFinite(sourceAge) || sourceAge > STALE_MS
    : !state.healthPending)
  const worldsPanel = selected?.competition === 'worlds' ? <WorldsTournamentPanel
    key={JSON.stringify([state.feed.source, worldsFeedEventKey(selected), forecastArtifacts.basis?.snapshotId, forecastArtifacts.basis?.model.version,
      forecastArtifacts.basis?.model.configHash, forecastArtifacts.basis?.ratingDataAsOf, forecastArtifacts.basis?.ratingPublishedAt, forecastArtifacts.basis?.identityMap.revision])}
    event={selected} forecast={{ seriesSource: state.feed.source, basis: forecastArtifacts.basis }} fixtureFeed={state.feed.dataMode === 'synthetic-fixture'} /> : null
  return (
    <div className="grid min-w-0 gap-3 px-[var(--page-x)] pt-2 pb-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor="tournament-event" className="sr-only">Competition</label>
        <Select id="tournament-event" className="h-auto max-w-full border-transparent bg-transparent py-1 pl-0 text-xl font-semibold text-text sm:text-2xl" value={selected?.id ?? ''} onChange={(event) => {
          const picked = events.find((candidate) => candidate.id === event.target.value)
          if (picked) selectEvent(picked, setRequestedEvent)
        }}>
          {!selected ? <option value="">{events.length === 0 ? 'No supported events' : 'Choose a competition'}</option> : null}
          {events.map((event) => <option key={event.id} value={event.id}>{event.label}{events.some((other) => other !== event && other.label === event.label) ? ` · ${event.sourceTournamentId}` : ''}</option>)}
        </Select>
        {state.feed.dataMode === 'synthetic-fixture' ? <p role="status" className="min-w-[7.5rem] flex-1 text-xs leading-snug text-[var(--warn)]"><TriangleAlert aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />Test fixture data. Not official LoL Esports results.</p> : null}
      </div>
      {stale ? <Alert variant="warning" role="status"><TriangleAlert aria-hidden="true" /><div className="min-w-0">
        Schedule may be stale. Feed changed {formatFeedAge(state.feed.fetchedAt, now)}, last checked {state.health ? formatFeedAge(state.health.checkedAt, now) : 'unknown'}.
        {[state.error, ...(state.health?.warnings ?? [])].filter(Boolean).map((warning) => ` ${warning}`).join('')}
        <Button variant="outline" size="sm" className="ml-2" onClick={() => void refresh()}>Retry</Button>
      </div></Alert> : null}
      {!state.feed.coverage.complete || state.feed.coverage.warnings.length ? (
        <Alert variant="warning" role="status"><TriangleAlert aria-hidden="true" /><div className="min-w-0">Coverage {state.feed.coverage.complete ? 'has warnings' : 'is incomplete'} for {state.feed.coverage.start.slice(0, 10)} to {state.feed.coverage.end.slice(0, 10)}. {state.feed.coverage.warnings.join(' ')}</div></Alert>
      ) : null}
      {link.kind === 'missing' ? <Alert role="status">This competition link is not in the current schedule. Choose a competition.</Alert>
        : link.kind === 'ambiguous' ? <Alert role="status">This competition link matches more than one event.</Alert>
          : !selected ? <p className="text-sm text-muted">No tournaments in the schedule window.</p> : view === 'bracket' ? (
        <>
          <h2 className="sr-only">{selected.label}</h2>
          <div className={cn('grid min-w-0 items-start gap-4', selected.competition === 'worlds' && 'lg:grid-cols-[minmax(0,1fr)_20rem]')}>
            <TournamentBracket key={selected.id} series={selected.series} timezone={timezone} />
            {worldsPanel}
          </div>
        </>
      ) : view === 'swiss' ? (
        <>
          <h2 className="text-lg font-semibold text-text">Worlds 2026 Swiss preview</h2>
          <SwissPreview event={selected}
            playInEvent={events.find((event) => event.competition === 'worlds' && event.season === selected.season && /\/Play-In$/.test(event.sourceTournamentId))}
            checkedAt={state.health?.checkedAt ?? state.feed.fetchedAt} timezone={timezone} />
        </>
      ) : (
        <>
          <h2 className="sr-only">{selected.label}</h2>
          {forecastArtifacts.ledgerWarning ? <p role="status" className="text-xs text-[var(--warn)]"><TriangleAlert aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />{forecastArtifacts.ledgerWarning}</p> : null}
          {SECTION_ORDER.some((group) => grouped[group].length > 0) ? null : <p className="text-sm text-muted">No series in the schedule window.</p>}
          {(['live', 'upcoming'] as const).map((group) => <ScheduleSection key={group} group={group} series={grouped[group]} timezone={timezone} now={now} seriesSource={state.feed.source} forecasts={forecastArtifacts} />)}
          {worldsPanel}
          {(['results', 'unresolved'] as const).map((group) => <ScheduleSection key={group} group={group} series={group === 'results' ? [...grouped.results].reverse() : grouped[group]} timezone={timezone} now={now} seriesSource={state.feed.source} forecasts={forecastArtifacts} />)}
        </>
      )}
      <footer className="mt-2 grid gap-1.5 border-t border-line pt-3 text-xs leading-[1.6] text-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Times in {timezone}.</span>
          <span className="min-w-[30ch]">Checked {state.health ? formatTournamentTime(state.health.checkedAt, timezone) : state.healthPending ? 'checking…' : 'unknown'}.</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button>
        </div>
        <p><SourceNote feed={state.feed} event={selected} /></p>
      </footer>
    </div>
  )
}

const SECTION_ORDER = ['live', 'upcoming', 'results', 'unresolved'] as const
const SECTION_TITLES = { live: 'Live now', upcoming: 'Up next', results: 'Latest results', unresolved: 'Results not confirmed' } as const

function formatFeedAge(timestamp: string, now: number) {
  const age = now - Date.parse(timestamp)
  if (!Number.isFinite(age)) return 'age unknown'
  if (age < 0) return 'timestamp is in the future'
  const minutes = Math.floor(age / REFRESH_MS)
  if (minutes < 1) return 'less than a minute ago'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

type ScheduleProps = { timezone: string; now: number; seriesSource: TournamentFeed['source']; forecasts: ForecastArtifacts }

/** Live first, then what is next, then the newest results. */
function ScheduleSection({ group, series, ...props }: ScheduleProps & { group: typeof SECTION_ORDER[number]; series: TournamentSeries[] }) {
  if (!series.length) return null
  return <section aria-label={group} className="grid gap-2">
    <h3 className={cn('flex items-baseline gap-2 text-base font-semibold', group === 'live' ? 'text-[var(--live)]' : 'text-text')}>{SECTION_TITLES[group]}{' '}<span className="text-xs font-normal text-muted tabular-nums">{series.length}</span></h3>
    <SeriesList series={series} {...props} />
  </section>
}

function SeriesList({ series, ...props }: ScheduleProps & { series: TournamentSeries[] }) {
  const days: Array<{ label: string; series: TournamentSeries[] }> = []
  for (const entry of series) {
    const label = entry.startTime ? formatDay(entry.startTime, props.timezone) : 'Date not supplied'
    const day = days.find((candidate) => candidate.label === label)
    if (day) day.series.push(entry)
    else days.push({ label, series: [entry] })
  }
  return <div className="grid gap-3">
    {days.map((day) => <div key={day.label} className="grid gap-1">
      <h4 className="text-xs font-semibold text-muted">{day.label}</h4>
      <ol className="divide-y divide-line border-y border-line bg-surface">
        {day.series.map((entry) => <SeriesRow key={entry.id} series={entry} {...props} />)}
      </ol>
    </div>)}
  </div>
}

function SeriesRow({ series, timezone, now, seriesSource, forecasts }: ScheduleProps & { series: TournamentSeries }) {
  const [first, second] = series.teams
  const winner = seriesWinner(series)
  const winningTeam = winner !== null ? series.teams[winner] : undefined
  const scheduledStartPassed = !series.startTime || now >= Date.parse(series.startTime)
  const forecast = useMemo<TournamentForecast | ForecastReceipt | null>(() => {
    if (series.status === 'upcoming') {
      const estimate = forecastTournamentSeries(series, forecasts.basis, { seriesSource })
      if (estimate.status === 'unavailable' && estimate.reason === 'unsupported-source') return estimate
      if (scheduledStartPassed) return { status: 'unavailable', reason: 'already-started', detail: 'Scheduled start has passed; a new pre-match estimate is withheld.' }
      return !forecasts.basis && estimate.status === 'unavailable' ? { ...estimate, detail: forecasts.reason ?? estimate.detail } : estimate
    }
    return pinnedForecast(forecasts.ledger, series, seriesSource)
  }, [forecasts, scheduledStartPassed, series, seriesSource])
  const scored = first?.gameWins != null || second?.gameWins != null
  const live = series.status === 'live'
  return <li className={cn('grid gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,auto)]', live && 'shadow-[inset_2px_0_0_var(--live)]')}>
    <div className="flex flex-wrap gap-x-2 text-xs text-muted sm:grid sm:gap-0.5">
      <span className="text-text tabular-nums">{series.startTime ? formatClock(series.startTime, timezone) : 'Time not supplied'}</span>
      <span>{series.stage ?? 'Stage not supplied'}</span>
      <span>{series.bestOf ? `Best of ${series.bestOf}` : 'Format not supplied'}</span>
    </div>
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 gap-1" aria-hidden="true">
        {[first, second].map((team, index) => team?.name
          ? <TeamMark key={index} team={team.name} code={team.code ?? undefined} fallback="initial" className="size-6" />
          : <span key={index} className="size-6 shrink-0 rounded-md border border-dashed border-line" />)}
      </span>
      <p className="min-w-0 text-base text-text">
        <span className={winner === 0 && winningTeam?.name ? 'font-bold' : undefined}>{first?.name ?? 'TBD'}</span> {scored ? <span className="whitespace-nowrap font-semibold tabular-nums">{score(first?.gameWins)}–{score(second?.gameWins)}</span> : <span className="text-muted">vs</span>} <span className={winner === 1 && winningTeam?.name ? 'font-bold' : undefined}>{second?.name ?? 'TBD'}</span>
      </p>
    </div>
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:col-start-2 lg:col-start-auto lg:justify-end">
      {live ? <Badge variant="live">Live</Badge> : <span>{series.status === 'unknown' ? `Source state: ${series.sourceState || 'unknown'}` : STATUS_LABELS[series.status]}</span>}
      {winningTeam?.name ? <span className="min-w-0 font-semibold text-text">Winner: {winningTeam.name}</span> : null}
      {series.vodUrls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline">Watch VOD</a>)}
    </p>
    <div className="grid min-w-0 gap-2 sm:col-start-2 lg:col-span-2">
      {forecast ? <SeriesForecast series={series} forecast={forecast} timezone={timezone} seriesSource={seriesSource} /> : null}
      <ConditionalPowerPreview key={JSON.stringify([series, forecast, forecasts.powerPreviews])} series={series} forecast={forecast} now={now} basis={forecasts.basis} powerPreviews={forecasts.powerPreviews} />
    </div>
  </li>
}

/** A model estimate, never a result: the preview role, a dashed line and its own label. */
function SeriesForecast({ series, forecast, timezone, seriesSource }: { series: TournamentSeries; forecast: TournamentForecast | ForecastReceipt; timezone: string; seriesSource: TournamentFeed['source'] }) {
  if (forecast.status !== 'ready') return <p className="text-xs text-muted">Forecast unavailable: {forecast.detail}</p>
  const [first, second] = series.teams
  const receipt = 'receiptKey' in forecast ? forecast : null
  const conditional = receipt && (series.status === 'live' || series.status === 'completed') ? scoreConditionedSeriesOdds(receipt, series, seriesSource) : null
  return <div className="grid min-w-0 gap-1.5 border-l-2 border-dashed border-[var(--forecast)] py-2 pr-2 pl-3 text-sm text-muted">
    <strong className="text-xs font-semibold text-[var(--forecast)]">{receipt ? 'Published pre-match forecast' : 'Forecast · Current model estimate · not archived'}</strong>
    <span className="text-text">Series win (Bo{forecast.bestOf}): {first?.name ?? 'Home'} {percent(forecast.homeSeriesWinProbability)} · {second?.name ?? 'Away'} {percent(forecast.awaySeriesWinProbability)}</span>
    <span>Game win: {first?.name ?? 'Home'} {percent(forecast.homeGameWinProbability)} · {second?.name ?? 'Away'} {percent(forecast.awayGameWinProbability)}</span>
    {conditional?.status === 'ready' ? <span>Score-conditioned series odds: {percent(conditional.homeSeriesWinProbability)} · {percent(conditional.awaySeriesWinProbability)}. Uses the frozen pre-series model, not in-game telemetry.</span> : null}
    {conditional?.status === 'unavailable' ? <span>Score-conditioned odds unavailable: {conditional.detail}</span> : null}
    <span className="text-xs">Power data through {forecast.ratingDataAsOf.slice(0, 10)} · Published {formatTournamentTime(forecast.ratingPublishedAt, timezone)} · Model {forecast.modelVersion} / {forecast.modelConfigHash} · Snapshot {forecast.snapshotId}</span>
    <span className="text-xs">{forecast.sideBasis} {receipt ? `Receipt published ${formatTournamentTime(receipt.publishedAt, timezone)} before the scheduled start, while source state was upcoming. Not certified for out-of-sample evaluation.` : ''}</span>
    {forecast.warnings.map((warning) => <span key={warning} className="text-xs">{warning}</span>)}
    <a href="#matches" className="text-xs underline">Rating evidence ledger</a>
  </div>
}
const STATUS_LABELS = { upcoming: 'Upcoming', live: 'Live', completed: 'Completed', postponed: 'Postponed', cancelled: 'Cancelled', unknown: 'Unknown' } as const
function formatDay(value: string, timezone: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone }).format(date) : 'Date not supplied'
}
function formatClock(value: string, timezone: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' }).format(date) : 'Unknown time'
}
function SourceNote({ feed, event }: { feed: TournamentFeed; event: TournamentEvent | undefined }) {
  if (feed.source === 'lolesports-persisted-site-api') return <>Source: LoL Esports public schedule.</>
  return <>Source: <a href={leaguepediaPageUrl(event?.sourceTournamentId ?? 'League of Legends Esports Wiki')} target="_blank" rel="noopener noreferrer" className="underline">Leaguepedia</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-SA 3.0</a>). Live means the start time has passed and no result is in yet.</>
}
function leaguepediaPageUrl(page: string) {
  return `https://lol.fandom.com/wiki/${page.replaceAll(' ', '_').split('/').map(encodeURIComponent).join('/')}`
}
function score(value: number | null | undefined) { return value ?? '–' }
function percent(value: number) { return `${(value * 100).toFixed(1)}%` }
/** Live first, then the next to start; tracked competitions before other events. */
function nextEvent(events: TournamentEvent[], now: number) {
  const tracked = events.filter((event) => event.competition !== null)
  return liveOrNext(tracked, now) ?? liveOrNext(events, now) ?? events.at(-1)
}
function liveOrNext(events: TournamentEvent[], now: number) {
  const live = events.find((event) => event.series.some((series) => series.status === 'live'))
  if (live) return live
  let nearest: { event: TournamentEvent; startsAt: number } | null = null
  for (const event of events) {
    for (const series of event.series) {
      if (series.status !== 'upcoming') continue
      const startsAt = Date.parse(series.startTime ?? '')
      if (!Number.isFinite(startsAt) || startsAt < now) continue
      if (!nearest || startsAt < nearest.startsAt) nearest = { event, startsAt }
    }
  }
  return nearest?.event
}
function selectEvent(event: TournamentEvent, update: (value: string) => void) {
  const address = eventAddress(event)
  update(address)
  const query = currentHashQuery()
  query.set('event', address)
  writeNavigationHash(`tournaments?${query}`, 'navigate')
}
type TournamentPanel = Exclude<TournamentTab, 'postmortem'>
