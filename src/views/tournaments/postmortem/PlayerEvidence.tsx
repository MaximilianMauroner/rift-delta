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
import { FieldStrip, FieldStripKey } from '../../../components/FieldStrip'
import { signedGold } from '../../../components/fieldFormat'
import { playerPerformanceMetrics } from '../../../domains/rankings/read'
import {
  reportRoleFieldPositions,
  type TournamentReportPlayer,
  type TournamentReportTeam,
} from '../../../domains/rankings/tournament-reports'
import { formatMetric } from '../../rankings/playerMetricFormat'

export function PlayerEvidence({
  player,
  teams,
}: {
  player: TournamentReportPlayer
  teams: TournamentReportTeam[]
}) {
  const positions = reportRoleFieldPositions(
    teams.flatMap((team) => team.participants),
    player,
  )
  const names = new Map(
    teams.flatMap((team) => team.participants.map((entry) => [entry.playerId, `${entry.name} (${team.code})`])),
  )
  const peers = `${player.role.toLowerCase()} players`
  const trend = player.games.map((game, index) => ({
    game: index + 1,
    gold: game.metrics.goldDiffAt15,
    date: game.date,
    opponent: game.opponent,
  }))
  return (
    <Card
      className="gap-0 overflow-visible py-0"
      role="region"
      aria-label={`Evidence for ${player.name}, ${player.role}`}
    >
      <CardHeader className="gap-3 border-b border-line bg-raised py-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="break-words text-lg font-bold">{player.name}</h4>
            <p className="text-xs text-muted">
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
        <section aria-label="Event averages" className="grid gap-2">
          <h5 className="text-base font-semibold text-text">Against other {peers}</h5>
          <ol className="grid min-w-0 divide-y divide-line">
            {positions.map((position) => {
              const metric = playerPerformanceMetrics[position.metric]
              return (
                <FieldStrip
                  key={position.metric}
                  label={metric.label}
                  hint={metric.hint}
                  subject={player.name}
                  subjectId={player.playerId}
                  position={position}
                  format={(value, scale) => formatMetric(position.metric, value, scale)}
                  nameFor={(id) => names.get(id) ?? id}
                  within="at the event"
                  minSamples={1}
                  note={position.missing ? `${position.missing} game${position.missing === 1 ? '' : 's'} without data` : undefined}
                />
              )
            })}
          </ol>
          <FieldStripKey subject={player.name} others={`Other ${peers}`} />
        </section>
        <section className="min-w-0" aria-label="Gold lead at 15, game by game">
          <h5 className="text-sm font-bold">Gold lead at 15, game by game</h5>
          <div
            className="mt-3 h-48 min-w-0"
            role="img"
            aria-label={`${player.name} gold lead at 15 over ${player.games.length} games. The values are listed below.`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={trend}
                margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
              >
                <XAxis
                  dataKey="game"
                  fontSize={12}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)' }}
                  label={{
                    value: 'Game',
                    position: 'insideBottom',
                    offset: -5,
                    fontSize: 12,
                    fill: 'var(--muted)',
                  }}
                />
                <YAxis width={48} fontSize={12} tickLine={false} tick={{ fill: 'var(--muted)' }} />
                <ReferenceLine y={0} stroke="var(--line)" />
                <Tooltip
                  labelFormatter={(value) => `Game ${value}`}
                  formatter={(value) => [`${signedGold(Number(value))} gold`, 'Gold lead at 15']}
                  contentStyle={{
                    background: 'var(--raised)',
                    borderColor: 'var(--line)',
                    fontSize: 12,
                  }}
                />
                <Line
                  dataKey="gold"
                  name="Gold lead at 15"
                  stroke="var(--text)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <details className="min-w-0" aria-label="Games">
          <summary className="cursor-pointer text-sm font-bold">All {player.games.length} games</summary>
          <ol className="mt-2 grid min-w-0 gap-2">
            {player.games.map((game, index) => (
              <li
                key={game.matchId}
                className={`min-w-0 rounded-md p-3 text-xs ${
                  game.result === 'W'
                    ? 'bg-[var(--up-wash)]'
                    : game.result === 'L'
                      ? 'bg-[var(--down-wash)]'
                      : 'bg-raised'
                }`}
              >
                <details className="min-w-0 break-words">
                  <summary className="cursor-pointer leading-6">
                    {index + 1}. {game.date} · <strong>{game.result}</strong> vs {game.opponent}{' '}
                    · {game.champion ?? 'Champion unavailable'}
                    <span className="block text-muted tabular-nums">
                      Gold lead at 15:{' '}
                      {game.metrics.goldDiffAt15 === null
                        ? 'unavailable'
                        : `${signedGold(game.metrics.goldDiffAt15)} gold`}
                    </span>
                  </summary>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    {Object.entries(playerPerformanceMetrics).map(([key, metric]) => (
                      <div key={key}>
                        <dt className="text-muted">{metric.label}</dt>
                        <dd className="tabular-nums">
                          {formatMetric(key as keyof typeof playerPerformanceMetrics, game.metrics[key as keyof typeof playerPerformanceMetrics])}
                        </dd>
                      </div>
                    ))}
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
        </details>
      </CardContent>
    </Card>
  )
}
