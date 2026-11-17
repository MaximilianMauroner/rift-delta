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

export function PostmortemView() {
  const { state, retry } = useTournamentReports()
  return (
    <section
      className="grid min-w-0 gap-3 px-[var(--page-x)] py-4"
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
        <Alert role="status">
          Tournament reports are unavailable in this published generation.{' '}
          <Button variant="outline" onClick={retry}>
            Retry catalog
          </Button>
        </Alert>
      ) : state.status === 'error' ? (
        <Alert variant="warning" role="alert">
          Report catalog could not be loaded. {state.message}{' '}
          <Button variant="outline" onClick={retry}>
            Retry catalog
          </Button>
        </Alert>
      ) : (
        <ReportCatalog index={state.data} retryCatalog={retry} />
      )}
    </section>
  )
}

function ReportCatalog({
  index,
  retryCatalog,
}: {
  index: TournamentReportIndex
  retryCatalog: () => void
}) {
  const query = useTournamentReportAddress()
  const requested = query.get('event')
  const entry =
    requested === null
      ? index.tournaments[0]
      : index.tournaments.find((event) => event.id === requested)
  const { state, retry } = useTournamentReport(index, entry)
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="report-event" className="sr-only">
            Report event
          </label>
          <Select
            id="report-event"
            value={entry?.id ?? ''}
            onChange={(event) =>
              selectTournamentReport({ event: event.target.value })
            }
          >
            {!entry ? <option value="">Choose a report</option> : null}
            {index.tournaments.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" onClick={retryCatalog}>
          Refresh reports
        </Button>
      </div>
      {!entry ? (
        <Alert role="status">
          {requested !== null
            ? 'No report matches this event link.'
            : 'No Worlds reports have source-observed games in this generation.'}
        </Alert>
      ) : state.status === 'loading' ? (
        <p role="status">Loading {entry.label} report…</p>
      ) : state.status === 'unavailable' ? (
        <Alert role="status">
          This report artifact is unavailable.{' '}
          <Button variant="outline" onClick={retry}>
            Retry report
          </Button>
        </Alert>
      ) : state.status === 'error' ? (
        <Alert variant="warning" role="alert">
          This report could not be loaded. {state.message}{' '}
          <Button variant="outline" onClick={retry}>
            Retry report
          </Button>
        </Alert>
      ) : (
        <ReportBody report={state.data} />
      )}
    </>
  )
}

function ReportBody({ report }: { report: TournamentReport }) {
  const query = useTournamentReportAddress()
  const selection = resolveReportSelection(report, {
    team: query.get('team') ?? undefined,
    player: query.get('player') ?? undefined,
  })
  const { coverage } = report
  const players = new Set(report.teams.flatMap((team) => team.participants.map((player) => player.playerId))).size
  return (
    <>
      <header className="grid gap-3 rounded-md border border-line bg-surface p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="grid gap-1">
            <h2 className="text-2xl font-bold">{report.label}</h2>
            <p className="text-sm text-muted">
              {coverage.observedGames} games · {coverage.observedTeams} teams ·{' '}
              {players} players · {coverage.since} to {coverage.through}
            </p>
          </div>
        </div>
        {report.provenance.dataMode === 'seeded-sample' ||
        report.provenance.providers.includes('seed') ? (
          <Alert variant="warning" role="status">
            Synthetic test fixture. These player stats and results are
            synthetic.
          </Alert>
        ) : null}
      </header>
      {report.games ? (
        <EventOverview
          report={report}
          onSelectTeam={(team) =>
            selectTournamentReport({ event: report.id, team })
          }
        />
      ) : (
        <Alert role="status">
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
        <Alert role="status">
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
              <Alert role="status">
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
