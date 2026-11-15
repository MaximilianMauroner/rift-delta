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
  const trend = player.games.map((game, index) => ({
    game: index + 1,
    gold: game.metrics.goldDiffAt15,
    date: game.date,
    opponent: game.opponent,
  }))
  return (
    <Card
      role="region"
      aria-label={`Evidence for ${player.name}, ${player.role}`}
    >
      <CardHeader className="gap-2">
        <h4 className="break-words text-xl font-semibold">{player.name}</h4>
        <p className="text-xs text-muted-foreground">
          {player.role} · {player.games.length} observed team games
        </p>
        <p className="text-sm">
          StatsPower{' '}
          <strong className="font-mono text-xl">
            {score ? score.score.toFixed(2) : 'unavailable'}
          </strong>
          {score ? ` · League anchor ${score.leagueAnchor.toFixed(2)}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          League anchors are near 100. Higher scores reflect stronger
          role-metric evidence relative to the event field.
        </p>
        {score ? (
          <p className="text-xs text-muted-foreground">
            {score.sampleGames} games with usable score evidence ·{' '}
            {score.eligibleGames} eligible games · Evidence through{' '}
            {score.evidenceThrough}
          </p>
        ) : null}
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
            . The raw means and game list below cover the selected team.
          </Alert>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-5">
        <section className="min-w-0" aria-label="Gold difference at 15 trend">
          <h5 className="text-sm font-semibold">Gold difference at 15</h5>
          <p className="text-xs text-muted-foreground">
            Observed gold by chronological team game. Missing observations leave
            gaps.
          </p>
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
                  label={{
                    value: 'Observed game',
                    position: 'insideBottom',
                    offset: -5,
                    fontSize: 10,
                  }}
                />
                <YAxis width={48} fontSize={10} tickLine={false} />
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
        <section aria-label="Raw aggregate means" className="grid gap-3">
          <h5 className="text-sm font-semibold">Raw per-game means</h5>
          <dl className="grid gap-3 min-[440px]:grid-cols-2">
            {Object.entries(REPORT_METRICS).map(([key, metric]) => {
              const value =
                player.performance.metrics[key as keyof typeof REPORT_METRICS]
              return (
                <div
                  key={key}
                  className="min-w-0 border-l-2 border-border pl-3"
                >
                  <dt className="text-xs text-muted-foreground">
                    {metric.label}
                  </dt>
                  <dd className="font-mono tabular-nums">
                    {value.value === null
                      ? 'Unavailable'
                      : `${(value.value * metric.multiplier).toFixed(1)} ${metric.unit}`}
                  </dd>
                  <dd className="text-2xs text-muted-foreground">
                    {value.games} observed · {value.missing} missing
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
        {score ? (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold">
              StatsPower metric evidence
            </summary>
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
          <h5 className="text-sm font-semibold">Observed games</h5>
          <ol className="grid min-w-0 gap-2">
            {player.games.map((game, index) => (
              <li
                key={game.matchId}
                className="min-w-0 rounded-md border border-border p-3 text-xs"
              >
                <details className="min-w-0 break-words">
                  <summary className="cursor-pointer leading-6">
                    {index + 1}. {game.date} · {game.result} vs {game.opponent}{' '}
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
