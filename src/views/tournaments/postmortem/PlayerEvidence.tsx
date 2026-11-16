import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import { Alert } from '../../../components/ui/alert'
import {
  REPORT_METRICS,
  reportRoleMetricRanks,
  type TournamentReportPlayer,
  type TournamentReportTeam,
} from '../../../domains/rankings/tournament-reports'

export function PlayerEvidence({
  player,
  teams,
}: {
  player: TournamentReportPlayer
  teams: TournamentReportTeam[]
}) {
  const score = player.statsPower
  const ranks = reportRoleMetricRanks(
    teams.flatMap((team) => team.participants),
    player,
  )
  const trend = player.games.map((game, index) => ({
    game: index + 1,
    gold: game.metrics.goldDiffAt15,
    date: game.date,
    opponent: game.opponent,
  }))
  return (
    <Card
      className="gap-0 py-0"
      role="region"
      aria-label={`Evidence for ${player.name}, ${player.role}`}
    >
      <CardHeader className="gap-3 border-b border-border bg-[var(--surface-2)] py-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="break-words text-lg font-bold">{player.name}</h4>
            <p className="text-xs text-muted-foreground">
              {player.role} · {player.games.length} observed team games
            </p>
          </div>
          <div className="grid justify-items-end gap-0.5">
            <span className="text-xs text-muted-foreground">
              StatsPower
            </span>
            <strong className="text-xl font-bold tabular-nums text-[var(--accent)]">
              {score ? score.score.toFixed(2) : 'unavailable'}
            </strong>
          </div>
        </div>
        {score?.priorOnly ? (
          <Alert role="status">
            This score has only a league prior. It is excluded from report
            awards.
          </Alert>
        ) : null}
        {score && score.sampleGames < 20 && !score.priorOnly ? (
          <p className="text-xs text-muted-foreground">
            Small sample. The score shrinks toward the league anchor.
          </p>
        ) : null}
        {player.scoreTeamIds.length > 1 ? (
          <Alert role="status">
            This event-role score pools games with{' '}
            {player.scoreTeamIds
              .map((id) => teams.find((team) => team.id === id)?.name ?? id)
              .join(', ')}
            . The game trend and list below cover the selected team.
          </Alert>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-5 py-4">
        <section aria-label="Raw aggregate means" className="grid gap-3">
          <h5 className="text-sm font-bold">Event averages</h5>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border">
            {Object.entries(REPORT_METRICS).map(([key, metric]) => {
              const value = ranks[key as keyof typeof REPORT_METRICS]
              return (
                <div
                  key={key}
                  className="min-w-0 bg-[var(--surface-2)] p-3 last:odd:col-span-2"
                >
                  <dt className="text-xs text-muted-foreground">
                    {metric.label}
                  </dt>
                  <dd className="mt-1 text-base font-bold tabular-nums">
                    {value.value === null
                      ? 'Unavailable'
                      : `${(value.value * metric.multiplier).toFixed(1)} ${metric.unit}`}
                  </dd>
                  <dd className="mt-1 text-xs text-muted-foreground">
                    {value.rank === null
                      ? 'No rank'
                      : `#${value.rank} of ${value.players}`}
                    {' · '}
                    {value.games} observed
                    {value.missing ? ` · ${value.missing} missing` : ''}
                  </dd>
                </div>
              )
            })}
          </dl>
          <p className="text-xs text-muted-foreground">
            Ranked against {player.role} players in this event. Higher averages
            rank first. Ranks use unrounded values and sample sizes vary.
          </p>
        </section>
        <section className="min-w-0" aria-label="Gold difference at 15 trend">
          <h5 className="text-sm font-bold">Gold difference at 15</h5>
          <div
            className="mt-3 h-48 min-w-0"
            role="img"
            aria-label={`${player.name} GD15 trend in gold over ${player.games.length} games. The observed values are listed below.`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={trend}
                margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
              >
                <XAxis
                  dataKey="game"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)' }}
                  label={{
                    value: 'Observed game',
                    position: 'insideBottom',
                    offset: -5,
                    fontSize: 10,
                    fill: 'var(--muted)',
                  }}
                />
                <YAxis width={48} fontSize={10} tickLine={false} tick={{ fill: 'var(--muted)' }} />
                <ReferenceLine y={0} stroke="var(--line-strong)" />
                <Tooltip
                  labelFormatter={(value) => `Game ${value}`}
                  formatter={(value) => [`${value} gold`, 'GD15']}
                  contentStyle={{
                    background: 'var(--surface-2)',
                    borderColor: 'var(--line-strong)',
                    fontSize: 12,
                  }}
                />
                <Line
                  dataKey="gold"
                  name="GD15"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        {score ? (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">
              About StatsPower and metric evidence
            </summary>
            <p className="mt-2 text-muted-foreground">
              League anchor {score.leagueAnchor.toFixed(2)}. Higher scores reflect
              stronger role-metric evidence relative to the event field.{' '}
              {score.sampleGames} games with usable score evidence ·{' '}
              {score.eligibleGames} eligible games · Evidence through{' '}
              {score.evidenceThrough}.
            </p>
            <ul className="mt-2 grid gap-2">
              {Object.entries(score.metrics).map(([key, evidence]) => (
                <li key={key}>
                  {REPORT_METRICS[key as keyof typeof REPORT_METRICS].label} ·{' '}
                  {evidence.observed} observed · {evidence.missing} missing ·{' '}
                  {evidence.effectiveGames} effective games
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <section className="grid gap-3" aria-label="Observed games">
          <h5 className="text-sm font-bold">Games</h5>
          <ol className="grid min-w-0 gap-2">
            {player.games.map((game, index) => (
              <li
                key={game.matchId}
                className={`min-w-0 rounded-md p-3 text-xs ${
                  game.result === 'W'
                    ? 'bg-[#5383e8]/10'
                    : game.result === 'L'
                      ? 'bg-[#d36a6a]/10'
                      : 'bg-[var(--surface-2)]'
                }`}
              >
                <details className="min-w-0 break-words">
                  <summary className="cursor-pointer leading-6">
                    {index + 1}. {game.date} · <strong>{game.result}</strong> vs {game.opponent}{' '}
                    · {game.champion ?? 'Champion unavailable'}
                    <span className="block font-mono">
                      GD15{' '}
                      {game.metrics.goldDiffAt15 === null
                        ? 'unavailable'
                        : `${game.metrics.goldDiffAt15} gold`}
                    </span>
                  </summary>
                  <dl className="mt-2 grid gap-2">
                    {Object.entries(REPORT_METRICS).map(([key, metric]) => {
                      const value =
                        game.metrics[key as keyof typeof REPORT_METRICS]
                      return (
                        <div key={key}>
                          <dt className="text-muted-foreground">
                            {metric.label}
                          </dt>
                          <dd>
                            {value === null
                              ? 'Unavailable'
                              : `${(value * metric.multiplier).toFixed(1)} ${metric.unit}`}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                  <p className="mt-3">
                    Match {game.matchId} · Source game{' '}
                    {game.sourceGameId ?? 'unavailable'} · Source match{' '}
                    {game.sourceMatchId ?? 'unavailable'} · Official game{' '}
                    {game.officialGameId ?? 'unavailable'}
                  </p>
                  <p>
                    {game.sourceProvider} ·{' '}
                    {game.sourceFileName ?? 'File unavailable'} · {game.event}
                    {game.datetimeUtc ? ` · ${game.datetimeUtc}` : ''}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  )
}
