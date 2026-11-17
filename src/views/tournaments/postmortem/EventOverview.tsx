import {
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import {
  reportEventSummary,
  type ReportTeamGame,
  type TournamentReport,
} from '../../../domains/rankings/tournament-reports'
import type { Rate } from '../../../domains/rankings/field-statistics'
import { percent, signedGold } from '../../../components/fieldFormat'
import { ReportHighlights } from './ReportHighlights'
import { teamColor } from '../../../shared/teamColor'

const LIST_LENGTH = 5
const CHAMPION_ROWS = 10

export function EventOverview({
  report,
  caption,
  onSelectTeam,
}: {
  report: TournamentReport
  caption: string
  onSelectTeam: (teamId: string) => void
}) {
  const summary = reportEventSummary(report)
  const teams = new Map(report.teams.map((team) => [team.id, team]))
  const code = (id: string) => teams.get(id)?.code ?? id
  const rankOrder = summary.teams.map(({ team }) => team.code)
  const points = summary.teams.flatMap(({ team, games, winRate, goldDiffAt15 }) =>
    winRate === null || goldDiffAt15 === null
      ? []
      : [{ id: team.id, code: team.code, games, winRate: winRate * 100, gold: goldDiffAt15 }],
  )
  const meanOf = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  return (
    <section className="grid min-w-0 gap-3" aria-label="Tournament statistics">
      <h3 className="sr-only">Tournament</h3>
      <ul className="grid grid-cols-2 gap-px overflow-hidden border-y border-line bg-line lg:grid-cols-4">
        <RateTile label="Blue side wins" rate={summary.blueSide} />
        <RateTile label="Team ahead at 15 wins" rate={summary.leaderAt15} />
        <Tile
          label="Average game"
          value={summary.minutes.mean === null ? 'Unavailable' : `${summary.minutes.mean.toFixed(1)} min`}
          detail={
            summary.minutes.shortest === null
              ? 'No game lengths'
              : `Shortest ${summary.minutes.shortest.toFixed(1)} min, longest ${summary.minutes.longest!.toFixed(1)} min`
          }
        />
        <Tile
          label="Wins from behind at 15"
          value={`${summary.comebacks.length}`}
          detail={`of ${summary.games} games`}
        />
      </ul>
      <p className="-mt-1 text-xs text-muted">{caption}</p>
      <ReportHighlights report={report} />
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="gap-0 py-0">
          <CardContent className="grid min-w-0 gap-2 py-4">
            <h4 className="text-sm font-bold">Win rate and gold at 15</h4>
            <p className="text-xs text-muted">The dashed line is the average win rate. Select a team to open it.</p>
            <div
              className="h-72 min-w-0"
              role="img"
              aria-label={`Average gold lead at 15 and win rate for ${points.length} teams`}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ScatterChart margin={{ top: 24, right: 20, bottom: 20, left: 4 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis
                    type="number"
                    dataKey="gold"
                    name="Average gold lead at 15"
                    fontSize={12}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)' }}
                    tickFormatter={(value: number) => signedGold(value)}
                    label={{
                      value: 'Average gold lead at 15',
                      position: 'insideBottom',
                      offset: -12,
                      fontSize: 12,
                      fill: 'var(--muted)',
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="winRate"
                    name="Win rate"
                    domain={[0, 100]}
                    width={40}
                    fontSize={12}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)' }}
                    tickFormatter={(value: number) => `${value}%`}
                  />
                  <ReferenceLine x={0} stroke="var(--line)" />
                  <ReferenceLine
                    y={meanOf(points.map((point) => point.winRate))}
                    stroke="var(--line)"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    cursor={false}
                    content={({ payload }) => {
                      const point = payload?.[0]?.payload as (typeof points)[number] | undefined
                      return point ? (
                        <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs">
                          <p className="font-semibold">{teams.get(point.id)?.name}</p>
                          <p>
                            {point.winRate.toFixed(0)}% wins · {signedGold(point.gold)} gold at 15 ·{' '}
                            {point.games} games
                          </p>
                        </div>
                      ) : null
                    }}
                  />
                  <Scatter
                    data={points}
                    stroke="var(--surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(point) => onSelectTeam((point as unknown as { id: string }).id)}
                  >
                    {points.map((point) => <Cell key={point.id} fill={teamColor(point.code, rankOrder)} />)}
                    <LabelList dataKey="code" position="top" fontSize={12} fill="var(--text)" />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <div className="grid min-w-0 content-start gap-3">
          <GameList
            title="Biggest comebacks"
            rows={summary.comebacks.slice(0, LIST_LENGTH)}
            code={code}
            onSelectTeam={onSelectTeam}
          />
          <GameList
            title="Biggest gold swings after 15"
            rows={summary.swings.slice(0, LIST_LENGTH)}
            code={code}
            onSelectTeam={onSelectTeam}
          />
        </div>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="grid min-w-0 gap-2 py-4">
          <h4 className="text-sm font-bold">Most picked champions</h4>
          <table className="w-full table-fixed text-xs" aria-label="Most picked champions">
            <thead className="text-left text-muted">
              <tr>
                <th className="w-[34%] py-1 font-normal">Champion</th>
                <th className="py-1 text-right font-normal">Picks</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">Teams</th>
                <th className="py-1 text-right font-normal">W–L</th>
                <th className="w-[38%] py-1 pl-3 font-normal">Win rate and likely range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {summary.champions.slice(0, CHAMPION_ROWS).map((champion) => (
                <tr key={champion.champion}>
                  <td className="truncate py-1.5 font-semibold">{champion.champion}</td>
                  <td className="py-1.5 text-right tabular-nums">{champion.picks}</td>
                  <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">{champion.teams}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {champion.rate.successes}–{champion.rate.trials - champion.rate.successes}
                  </td>
                  <td className="py-1.5 pl-3">
                    <IntervalBar rate={champion.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">The bar shows the likely range of the true win rate.</p>
        </CardContent>
      </Card>
    </section>
  )
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <li className="min-w-0 bg-surface px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </li>
  )
}

function RateTile({ label, rate }: { label: string; rate: Rate }) {
  return (
    <Tile
      label={label}
      value={rate.value === null ? 'Unavailable' : percent(rate.value)}
      detail={`${rate.successes} of ${rate.trials} games`}
    />
  )
}

function IntervalBar({ rate }: { rate: Rate }) {
  if (!rate.interval || rate.value === null) return null
  return (
    <span className="flex items-center gap-2">
      <span className="relative block h-3 min-w-8 flex-1" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 border-t border-line" />
        <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-line" />
        <span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-md bg-[color-mix(in_srgb,var(--muted)_40%,transparent)]"
          style={{
            left: `${rate.interval.low * 100}%`,
            width: `${(rate.interval.high - rate.interval.low) * 100}%`,
          }}
        />
        <span
          className="absolute inset-y-0 w-0.5 bg-text"
          style={{ left: `${rate.value * 100}%` }}
        />
      </span>
      <span className="grid shrink-0 justify-items-end tabular-nums">
        <span>{percent(rate.value)}</span>
        <span className="text-muted">
          <span className="sr-only">likely </span>
          {percent(rate.interval.low)}–{percent(rate.interval.high)}
        </span>
      </span>
    </span>
  )
}

function GameList({
  title,
  rows,
  code,
  onSelectTeam,
}: {
  title: string
  rows: ReportTeamGame[]
  code: (id: string) => string
  onSelectTeam: (teamId: string) => void
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid min-w-0 gap-2 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-bold">{title}</h4>
          <span className="text-xs text-muted">Gold at 15 → end</span>
        </div>
        {rows.length ? (
          <ol className="grid min-w-0 divide-y divide-line">
            {rows.map((row) => (
              <li key={`${row.matchId}|${row.teamId}`}>
                <Button
                  variant="ghost"
                  aria-label={`Open ${code(row.teamId)} team report from ${title}`}
                  onClick={() => onSelectTeam(row.teamId)}
                  className="grid h-auto w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-none px-0 py-2 text-left whitespace-normal text-text hover:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {code(row.teamId)} {row.result === 'W' ? 'beat' : 'lost to'} {code(row.opponentId)}
                    </span>
                    <span className="block text-xs font-normal text-muted">
                      {row.date}
                      {row.gameNumber ? ` · Game ${row.gameNumber}` : ''}
                      {row.phase ? ` · ${row.phase}` : ''}
                    </span>
                  </span>
                  <span className="self-center text-right text-xs font-semibold tabular-nums">
                    {signedGold(row.goldDiffAt15!)} → {signedGold(row.goldDiff!)}
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm">No games qualify.</p>
        )}
      </CardContent>
    </Card>
  )
}
