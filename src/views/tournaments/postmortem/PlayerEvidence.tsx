import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Medal } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import { Alert } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { cn } from '../../../shared/utils'
import {
  REPORT_METRICS,
  reportRoleMetricRanks,
  type TournamentReportPlayer,
  type TournamentReportTeam,
} from '../../../domains/rankings/tournament-reports'

const podium = {
  1: {
    variant: 'rank',
    surface: 'bg-[color-mix(in_srgb,var(--rank-gold)_9%,var(--surface-2))]',
    rail: 'bg-[var(--rank-gold)]',
  },
  2: {
    variant: 'rankSilver',
    surface: 'bg-[color-mix(in_srgb,#c6d7eb_8%,var(--surface-2))]',
    rail: 'bg-[#c6d7eb]',
  },
  3: {
    variant: 'rankBronze',
    surface: 'bg-[color-mix(in_srgb,#eab08d_9%,var(--surface-2))]',
    rail: 'bg-[#eab08d]',
  },
} as const

export function PlayerEvidence({
  player,
  teams,
}: {
  player: TournamentReportPlayer
  teams: TournamentReportTeam[]
}) {
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
              {player.role} · {player.games.length} games
            </p>
          </div>
        </div>
        {player.scoreTeamIds.length > 1 ? (
          <Alert role="status">
            Event averages and role ranks include games with{' '}
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
              const highlight =
                value.rank === 1 || value.rank === 2 || value.rank === 3
                  ? podium[value.rank]
                  : undefined
              return (
                <div
                  key={key}
                  className={cn(
                    'min-w-0 bg-[var(--surface-2)] p-3 last:odd:col-span-2',
                    highlight?.surface,
                  )}
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
                    {highlight ? (
                      <Badge variant={highlight.variant}>
                        <Medal aria-hidden="true" className="size-3" />
                        #{value.rank} of {value.players}
                      </Badge>
                    ) : value.rank === null ? (
                      'No rank'
                    ) : (
                      `#${value.rank} of ${value.players}`
                    )}
                    {value.missing
                      ? ` · ${value.missing} game${value.missing === 1 ? '' : 's'} missing`
                      : ''}
                    {value.rank !== null && value.players > 1 ? (
                      <span aria-hidden="true" className="mt-2 flex h-1.5 gap-px">
                        {Array.from({ length: value.players }, (_, index) => (
                          <span
                            key={index}
                            className={cn(
                              'min-w-0 flex-1 rounded-sm bg-[var(--line-strong)]',
                              index + 1 === value.rank &&
                                (highlight?.rail ?? 'bg-[var(--accent)]'),
                            )}
                          />
                        ))}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
          <p className="text-xs text-muted-foreground">
            Ranked against {player.role} players in this event. Higher averages
            rank first, on the left. Ranks use unrounded values and sample sizes vary.
          </p>
        </section>
        <section className="min-w-0" aria-label="Gold difference at 15 trend">
          <h5 className="text-sm font-bold">Gold difference at 15</h5>
          <div
            className="mt-3 h-48 min-w-0"
            role="img"
            aria-label={`${player.name} GD15 trend in gold over ${player.games.length} games. The values are listed below.`}
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
                    value: 'Game',
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
        <section className="grid gap-3" aria-label="Games">
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
