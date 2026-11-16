import { Card, CardContent } from '../../../components/ui/card'
import { cn } from '../../../shared/utils'
import {
  REPORT_FIELD_MIN_GAMES,
  REPORT_TEAM_METRICS,
  reportTeamFieldPositions,
  reportTeamGames,
  type TournamentReport,
  type TournamentReportTeam,
} from '../../../domains/rankings/tournament-reports'
import { formatTeamMetric, rateInterval, signedGold } from './reportFormat'

export function TeamFieldPosition({
  report,
  team,
}: {
  report: TournamentReport
  team: TournamentReportTeam
}) {
  const positions = reportTeamFieldPositions(report, team.id)
  const codes = new Map(report.teams.map((entry) => [entry.id, entry.code]))
  return (
    <Card className="gap-0 py-0" role="region" aria-label={`${team.name} compared with the field`}>
      <CardContent className="grid min-w-0 gap-3 py-4">
        <div>
          <h4 className="text-sm font-bold">Compared with the field</h4>
          <p className="text-xs text-muted-foreground">
            Each dot is one team. The large dot is {team.code}, the tick is
            the field average. σ is the distance from the average in standard
            deviations. p is the share of other teams below {team.code}.
          </p>
        </div>
        <ol className="grid min-w-0 divide-y divide-border">
          {positions.map((position) => {
            const metric = REPORT_TEAM_METRICS[position.metric]
            const values = position.field.map((entry) => entry.value)
            const low = Math.min(...values, position.value ?? Infinity)
            const high = Math.max(...values, position.value ?? -Infinity)
            const at = (value: number) =>
              high === low ? 50 : ((value - low) / (high - low)) * 100
            return (
              <li
                key={position.metric}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)_7.5rem]"
              >
                <span className="min-w-0 text-xs font-semibold">
                  {metric.label}
                </span>
                <span
                  className="relative col-span-2 row-start-2 block h-5 min-w-0 sm:col-span-1 sm:row-start-1 sm:col-start-2"
                  role="img"
                  aria-label={
                    position.value === null
                      ? `${metric.label} unavailable for ${team.code}`
                      : `${team.code} ${formatTeamMetric(metric.unit, position.value)} against ${position.field.length} teams`
                  }
                >
                  <span className="absolute inset-x-0 top-1/2 border-t border-border" />
                  {position.mean !== null && Number.isFinite(low) ? (
                    <span
                      className="absolute inset-y-0.5 w-px bg-[var(--line-strong)]"
                      style={{ left: `${at(position.mean)}%` }}
                    />
                  ) : null}
                  {position.field
                    .filter((entry) => entry.teamId !== team.id)
                    .map((entry) => (
                      <span
                        key={entry.teamId}
                        title={`${codes.get(entry.teamId)} ${formatTeamMetric(metric.unit, entry.value)} · ${entry.n} games`}
                        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground opacity-60"
                        style={{ left: `${at(entry.value)}%` }}
                      />
                    ))}
                  {position.value !== null ? (
                    <span
                      title={
                        position.rate
                          ? rateInterval(position.rate)
                          : `${position.n} games`
                      }
                      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--accent)]"
                      style={{ left: `${at(position.value)}%` }}
                    />
                  ) : null}
                </span>
                <span className="grid justify-items-end text-right">
                  <span className="text-sm font-bold tabular-nums">
                    {position.value === null
                      ? '—'
                      : formatTeamMetric(metric.unit, position.value)}
                  </span>
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {position.z === null
                      ? position.n < REPORT_FIELD_MIN_GAMES
                        ? `${position.n} games, too few`
                        : 'No field spread'
                      : `${position.z >= 0 ? '+' : '−'}${Math.abs(position.z).toFixed(1)}σ · p${position.percentile!.toFixed(0)}`}
                  </span>
                  {position.band ? (
                    <span className="text-2xs text-muted-foreground">
                      {position.band}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">
          A team enters a comparison after {REPORT_FIELD_MIN_GAMES} qualifying
          games. Rates show a 95% interval on hover. Higher is not always
          better: game length and gold change after 15 describe style.
        </p>
      </CardContent>
    </Card>
  )
}

export function TeamGameSwings({
  report,
  team,
}: {
  report: TournamentReport
  team: TournamentReportTeam
}) {
  const rows = reportTeamGames(report).filter((row) => row.teamId === team.id)
  const codes = new Map(report.teams.map((entry) => [entry.id, entry.code]))
  const extent = Math.max(
    1,
    ...rows.flatMap((row) => [Math.abs(row.goldDiff), Math.abs(row.goldDiffAt15 ?? 0)]),
  )
  const at = (value: number) => 50 + (value / extent) * 50
  return (
    <Card className="gap-0 py-0" role="region" aria-label={`${team.name} game by game`}>
      <CardContent className="grid min-w-0 gap-3 py-4">
        <div>
          <h4 className="text-sm font-bold">Game by game</h4>
          <p className="text-xs text-muted-foreground">
            Team gold difference at 15 (ring) and at the end (dot). The line
            shows how the lead changed after 15.
          </p>
        </div>
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_7rem] gap-2 text-2xs text-muted-foreground">
          <span />
          <span className="flex justify-between">
            <span>{signedGold(-extent)}</span>
            <span>0</span>
            <span>{signedGold(extent)}</span>
          </span>
          <span />
        </div>
        <ol className="grid min-w-0 gap-1">
          {rows.map((row) => {
            const start = row.goldDiffAt15
            const end = row.goldDiff
            return (
              <li
                key={row.matchId}
                className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_7rem] items-center gap-2"
              >
                <span className="min-w-0 truncate text-xs">
                  <span
                    className={cn(
                      'mr-1 font-bold',
                      row.result === 'W' ? 'text-[var(--win)]' : 'text-[var(--loss)]',
                    )}
                  >
                    {row.result}
                  </span>
                  vs {codes.get(row.opponentId)}
                  {row.side ? (
                    <span className="text-muted-foreground"> · {row.side}</span>
                  ) : null}
                </span>
                <span
                  className="relative block h-5 min-w-0"
                  role="img"
                  aria-label={`${row.result === 'W' ? 'Win' : 'Loss'} against ${codes.get(row.opponentId)}: ${start === null ? 'gold at 15 unavailable' : `${signedGold(start)} gold at 15`}, ${signedGold(end)} at the end`}
                >
                  <span className="absolute inset-x-0 top-1/2 border-t border-border" />
                  <span className="absolute inset-y-0 left-1/2 border-l border-[var(--line-strong)]" />
                  {start !== null ? (
                    <>
                      <span
                        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[var(--line-strong)]"
                        style={{
                          left: `${Math.min(at(start), at(end))}%`,
                          width: `${Math.abs(at(end) - at(start))}%`,
                        }}
                      />
                      <span
                        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-card"
                        style={{ left: `${at(start)}%` }}
                      />
                    </>
                  ) : null}
                  <span
                    className={cn(
                      'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                      row.result === 'W' ? 'bg-[var(--win)]' : 'bg-[var(--loss)]',
                    )}
                    style={{ left: `${at(end)}%` }}
                  />
                </span>
                <span className="text-right text-2xs whitespace-nowrap tabular-nums text-muted-foreground">
                  {start === null ? '—' : signedGold(start)} → {signedGold(end)}
                </span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
