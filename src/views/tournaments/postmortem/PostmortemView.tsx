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
  reportAwards,
  type TournamentReport,
  type TournamentReportIndex,
} from '../../../domains/rankings/tournament-reports'
import { TeamReportCard } from './TeamReportCard'
import { PlayerEvidence } from './PlayerEvidence'

export function PostmortemView() {
  const { state, retry } = useTournamentReports()
  return (
    <section
      className="grid min-w-0 gap-3 px-[var(--page-x)] py-4"
      aria-label="Worlds team reports"
    >
      {state.status !== 'ready' ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">Worlds team reports</h2>
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
  const mvp = reportAwards(report.teams.flatMap((team) => team.participants))
  const uniqueMvp = [
    ...new Map(
      mvp.best.map((player) => [`${player.playerId}|${player.role}`, player]),
    ).values(),
  ]
  const { coverage } = report
  return (
    <>
      <header className="grid gap-3 rounded-md border border-border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="grid gap-1">
            <h2 className="text-xl font-bold">{report.label}</h2>
            <p className="text-sm text-muted-foreground">
              {coverage.observedGames} source-observed games ·{' '}
              {coverage.observedTeams} teams · {coverage.participants}{' '}
              player-role participants
            </p>
            <p className="text-xs text-muted-foreground">
              {coverage.since} through {coverage.through}. Official event
              completion is unknown.
            </p>
          </div>
          <div className="min-w-0 rounded-md bg-[var(--surface-2)] px-3 py-2 sm:min-w-56">
            <p className="text-xs font-semibold text-muted-foreground">
              {uniqueMvp.length > 1 ? 'Statistical MVP tie' : 'Statistical MVP'}
            </p>
            {uniqueMvp.length ? (
              uniqueMvp.map((player) => (
                <Button
                  key={player.key}
                  variant="ghost"
                  aria-label={`View statistical MVP ${player.name}, ${player.role}`}
                  className="h-auto w-full min-w-0 justify-between gap-4 px-0 py-1 text-left whitespace-normal hover:text-[var(--accent)]"
                  onClick={() =>
                    selectTournamentReport({
                      event: report.id,
                      team: player.teamId,
                      player: player.key,
                    })
                  }
                >
                  <span className="grid">
                    <span className="font-bold text-[var(--accent)]">{player.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {player.role} · {player.statsPower!.sampleGames} scored
                      games
                    </span>
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {player.statsPower!.score.toFixed(2)}
                  </span>
                </Button>
              ))
            ) : (
              <p className="mt-1 text-sm">No score has observed evidence.</p>
            )}
            <p className="text-2xs text-muted-foreground">
              Model report award. Official awards are separate.
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
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Coverage and award details
          </summary>
          <div className="mt-2 grid gap-1">
            <p>
              The ranking universe includes {coverage.ratedGames} of these games
              and {coverage.ratedTeams} teams.
            </p>
            <p>
              {mvp.eligible} participant rows have observed score evidence.
              Prior-only scores receive no awards. Awards use unrounded scores.
            </p>
          </div>
        </details>
      </header>
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
        <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
      ) : null}
      <details className="min-w-0 break-words border-t border-border pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">
          Method and source provenance
        </summary>
        <div className="mt-3 grid gap-2">
          <p>
            StatsPower uses {report.method.scoreVersion}. League anchors are
            near 100. Role-aware metrics use league strength, event weights, a{' '}
            {report.method.halfLifeDays}-day half-life and{' '}
            {report.method.priorGames}-game shrinkage. League evidence ends on{' '}
            {report.method.leagueEvidenceThrough}.
          </p>
          <p>
            Scores pool each player's games in the same role across this event.
            Event averages and role ranks include a player's games across teams.
            The gold trend and game list cover the selected team. StatsPower
            shrinks small samples toward the league anchor. Team assistance,
            matchups and champions affect the stats.
          </p>
          <p>
            Model {report.modelVersion} · Config {report.modelConfigHash} ·
            Method {report.method.version}
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
