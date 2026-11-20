import { TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import {
  useTournamentReport,
  useTournamentReports,
} from '../../../browser/tournament-reports/useTournamentReports'
import {
  selectTournamentReport,
  useTournamentReportAddress,
} from '../../../browser/tournament-reports/navigation'
import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Select } from '../../../components/ui/select'
import {
  resolveReportSelection,
  type TournamentReport,
  type TournamentReportIndex,
} from '../../../domains/rankings/tournament-reports'
import { TeamReportCard } from './TeamReportCard'
import { PlayerEvidence } from './PlayerEvidence'
import { EventOverview } from './EventOverview'
import { TeamFieldPosition, TeamGameSwings } from './TeamFieldPosition'

export function PostmortemView({ onEditionChange }: { onEditionChange: (edition: string | undefined) => void }) {
  const { state, retry } = useTournamentReports()
  return (
    <section
      className="grid min-w-0 gap-3 px-[var(--page-x)] pt-3 pb-5"
      aria-label="Worlds team reports"
    >
      {state.status !== 'ready' ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-2xl font-semibold">Worlds team reports</h2>
          <Button variant="outline" onClick={retry}>
            Refresh reports
          </Button>
        </div>
      ) : null}
      {state.status === 'loading' ? (
        <p role="status">Loading report catalog…</p>
      ) : state.status === 'unavailable' ? (
        <Alert data-first-answer="tournament-reports" role="status">
          Tournament reports are unavailable in this published generation.{' '}
          <Button variant="outline" onClick={retry}>
            Retry catalog
          </Button>
        </Alert>
      ) : state.status === 'error' ? (
        <Alert data-first-answer="tournament-reports" variant="warning" role="alert"><TriangleAlert aria-hidden="true" /><div className="min-w-0">
          Report catalog could not be loaded. {state.message}{' '}
          <Button variant="outline" onClick={retry}>
            Retry catalog
          </Button>
        </div></Alert>
      ) : (
        <ReportCatalog index={state.data} retryCatalog={retry} onEditionChange={onEditionChange} />
      )}
    </section>
  )
}

function ReportCatalog({
  index,
  retryCatalog,
  onEditionChange,
}: {
  index: TournamentReportIndex
  retryCatalog: () => void
  onEditionChange: (edition: string | undefined) => void
}) {
  const query = useTournamentReportAddress()
  const requested = query.get('event')
  const scheduleEdition = query.get('edition')
  const matchingEdition = index.tournaments.find((event) => event.id === scheduleEdition)
  const entry =
    requested === null
      ? matchingEdition ?? index.tournaments[0]
      : index.tournaments.find((event) => event.id === requested)
  const { state, retry } = useTournamentReport(index, entry)
  const edition = entry?.id
  useEffect(() => {
    onEditionChange(edition)
  }, [edition, onEditionChange])
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="report-event" className="text-sm font-semibold">
          Worlds report
        </label>
        <Select
          id="report-event"
          className="h-auto max-w-full border-transparent bg-transparent py-1 pl-0 text-xl font-semibold text-text sm:text-2xl"
          value={entry?.id ?? ''}
          onChange={(event) =>
            selectTournamentReport({ event: event.target.value, changeEdition: true })
          }
        >
          {!entry ? <option value="">Choose a report</option> : null}
          {index.tournaments.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </Select>
        {state.status === 'ready' && syntheticReport(state.data) ? (
          <p role="status" className="min-w-[7.5rem] flex-1 text-xs leading-snug text-[var(--warn)]"><TriangleAlert aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />
            Synthetic test fixture. These player stats and results are
            synthetic.
          </p>
        ) : null}
      </div>
      {!matchingEdition && (query.has('scheduleEvent') || scheduleEdition) ? <p role="status" className="text-sm text-muted">
        {scheduleEdition ? 'No Worlds report is available for this edition.' : 'Team reports cover Worlds editions.'}
        {entry ? ` Showing ${entry.label}.` : ''}
        {query.has('scheduleEvent') ? ' Your competition is saved for Bracket and Schedule.' : ''}
      </p> : null}
      {!entry ? (
        <Alert data-first-answer="tournament-reports" role="status">
          {requested !== null
            ? 'No report matches this event link.'
            : 'No Worlds reports have source-observed games in this generation.'}
        </Alert>
      ) : state.status === 'loading' ? (
        <p role="status">Loading {entry.label} report…</p>
      ) : state.status === 'unavailable' ? (
        <Alert data-first-answer="tournament-reports" role="status">
          This report artifact is unavailable.{' '}
          <Button variant="outline" onClick={retry}>
            Retry report
          </Button>
        </Alert>
      ) : state.status === 'error' ? (
        <Alert data-first-answer="tournament-reports" variant="warning" role="alert"><TriangleAlert aria-hidden="true" /><div className="min-w-0">
          This report could not be loaded. {state.message}{' '}
          <Button variant="outline" onClick={retry}>
            Retry report
          </Button>
        </div></Alert>
      ) : (
        <ReportBody report={state.data} />
      )}
      <div>
        <Button variant="outline" size="sm" onClick={retryCatalog}>
          Refresh reports
        </Button>
      </div>
    </>
  )
}

function syntheticReport(report: TournamentReport) {
  return report.provenance.dataMode === 'seeded-sample' || report.provenance.providers.includes('seed')
}

function ReportBody({ report }: { report: TournamentReport }) {
  const query = useTournamentReportAddress()
  const selection = resolveReportSelection(report, {
    team: query.get('team') ?? undefined,
    player: query.get('player') ?? undefined,
  })
  const { coverage } = report
  const players = new Set(report.teams.flatMap((team) => team.participants.map((player) => player.playerId))).size
  const coverageCaption = <>
    {coverage.observedGames} games · {coverage.observedTeams} teams · {players} players ·{' '}
    <time className="whitespace-nowrap">{coverage.since}</time> to <time className="whitespace-nowrap">{coverage.through}</time>
  </>
  return (
    <>
      <h2 className="sr-only">{report.label}</h2>
      {report.games ? (
        <EventOverview
          report={report}
          caption={coverageCaption}
          onSelectTeam={(team) =>
            selectTournamentReport({ event: report.id, team })
          }
        />
      ) : (
        <Alert data-first-answer="tournament-reports" role="status">
          {coverageCaption}.
          This published report has no game records. Tournament and team
          statistics appear after the next report rebuild.
        </Alert>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="report-team" className="text-sm font-semibold">
          Report team
        </label>
        <Select
          id="report-team"
          value={selection.kind === 'ready' ? (selection.team?.id ?? '') : ''}
          onChange={(event) =>
            selectTournamentReport({
              event: report.id,
              team: event.target.value,
            })
          }
        >
          {selection.kind !== 'ready' ? (
            <option value="">Choose a team</option>
          ) : null}
          {report.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>
      </div>
      {selection.kind !== 'ready' ? (
        <Alert data-first-answer="tournament-reports" role="status">
          {selection.kind === 'missing-player'
            ? 'No participant matches this player link.'
            : selection.kind === 'missing-team'
              ? 'No team matches this team link.'
              : 'The player and team in this link do not match.'}{' '}
          Choose a team to continue.
        </Alert>
      ) : selection.team ? (
        <div className="grid min-w-0 items-start gap-3 xl:grid-cols-2 xl:grid-rows-[auto_auto_1fr]">
          <TeamReportCard
            team={selection.team}
            selected={selection.player?.key}
            onSelect={(player) =>
              selectTournamentReport({
                event: report.id,
                team: player.teamId,
                player: player.key,
              })
            }
          />
          <div className="min-w-0 xl:col-start-2 xl:row-span-3 xl:row-start-1">
            {selection.player ? (
              <PlayerEvidence
                key={selection.player.key}
                player={selection.player}
                teams={report.teams}
              />
            ) : (
              <Alert data-first-answer="tournament-reports" role="status">
                No player roster observations are available for this team.
              </Alert>
            )}
          </div>
          {report.games ? (
            <>
              <TeamFieldPosition report={report} team={selection.team} />
              <TeamGameSwings report={report} team={selection.team} />
            </>
          ) : null}
        </div>
      ) : null}
      <details className="min-w-0 break-words border-t border-line pt-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-text">
          Method and source provenance
        </summary>
        <div className="mt-3 grid gap-2">
          <p>
            Official event completion is unknown. Event averages and role ranks use each player's available games in
            the same role, including games across teams. The lineup, gold trend,
            and game list use the selected team's games. Missing values are
            excluded from each average. Ties use unrounded values.
          </p>
          <p>
            Team assistance, opponents, champions, and game context affect these
            statistics.
          </p>
          <p>
            Team gold difference at 15 is the sum of the five lane differences
            and is unavailable when a lane value is missing. Gold change after
            15 is the final gold difference minus the value at 15. Likely
            ranges are 95% Wilson intervals. A team is above or below average
            when it is at least half a population standard deviation from the
            field average, among teams with at least three qualifying games.
            These are descriptive statistics, not a win probability model.
          </p>
          <p>
            Data mode {report.provenance.dataMode} · Input digest{' '}
            {report.provenance.inputDigest}
          </p>
          <p>
            Providers {report.provenance.providers.join(', ')} · Files{' '}
            {report.provenance.files.join(', ') || 'No file names supplied'}
          </p>
        </div>
      </details>
    </>
  )
}
