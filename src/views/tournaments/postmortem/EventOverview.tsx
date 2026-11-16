import {
  CartesianGrid,
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
import { percent, rateInterval, signedGold } from '../../../components/fieldFormat'

const LIST_LENGTH = 5
const CHAMPION_ROWS = 10

export function EventOverview({
  report,
  onSelectTeam,
}: {
  report: TournamentReport
  onSelectTeam: (teamId: string) => void
}) {
  const summary = reportEventSummary(report)
  const teams = new Map(report.teams.map((team) => [team.id, team]))
  const code = (id: string) => teams.get(id)?.code ?? id
  const points = summary.teams.flatMap(({ team, games, winRate, goldDiffAt15 }) =>
    winRate === null || goldDiffAt15 === null
      ? []
      : [{ id: team.id, code: team.code, games, winRate: winRate * 100, gold: goldDiffAt15 }],
  )
  const meanOf = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  return (
    <section className="grid min-w-0 gap-3" aria-label="Tournament statistics">
      <h3 className="text-lg font-bold">Tournament</h3>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border lg:grid-cols-4">
        <RateTile label="Blue side wins" rate={summary.blueSide} />
        <RateTile label="Gold leader at 15 wins" rate={summary.leaderAt15} />
        <Tile
          label="Average game"
          value={summary.minutes.mean === null ? 'Unavailable' : `${summary.minutes.mean.toFixed(1)} min`}
          detail={
            summary.minutes.shortest === null
              ? 'No game lengths'
              : `Range ${summary.minutes.shortest.toFixed(1)}–${summary.minutes.longest!.toFixed(1)} min`
          }
        />
        <Tile
          label="Wins from behind at 15"
          value={`${summary.comebacks.length} of ${summary.games}`}
          detail="Games won by the team behind in gold at 15"
        />
      </div>
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="gap-0 py-0">
          <CardContent className="grid min-w-0 gap-2 py-4">
            <h4 className="text-sm font-bold">Team map</h4>
            <p className="text-xs text-muted-foreground">
              Early gold against results. Teams above the dashed win line won
              more than the field average. Teams to the right led more at 15.
              Select a dot to open the team.
            </p>
            <div
              className="h-72 min-w-0"
              role="img"
              aria-label={`Average gold difference at 15 and win rate for ${points.length} teams`}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ScatterChart margin={{ top: 12, right: 16, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis
                    type="number"
                    dataKey="gold"
                    name="Avg gold difference at 15"
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)' }}
                    tickFormatter={(value: number) => signedGold(value)}
                    label={{
                      value: 'Avg gold difference at 15',
                      position: 'insideBottom',
                      offset: -12,
                      fontSize: 10,
                      fill: 'var(--muted)',
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="winRate"
                    name="Win rate"
                    domain={[0, 100]}
                    width={40}
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)' }}
                    tickFormatter={(value: number) => `${value}%`}
                  />
                  <ReferenceLine x={0} stroke="var(--line-strong)" />
                  <ReferenceLine
                    y={meanOf(points.map((point) => point.winRate))}
                    stroke="var(--line-strong)"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    cursor={false}
                    content={({ payload }) => {
                      const point = payload?.[0]?.payload as (typeof points)[number] | undefined
                      return point ? (
                        <div className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-xs">
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
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(point) => onSelectTeam((point as unknown as { id: string }).id)}
                  >
                    <LabelList dataKey="code" position="top" fontSize={10} fill="var(--text)" />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <div className="grid min-w-0 content-start gap-3">
          <GameList
            title="Biggest comebacks"
            caption="Largest gold deficit at 15 that the team still won"
            rows={summary.comebacks.slice(0, LIST_LENGTH)}
            code={code}
            onSelectTeam={onSelectTeam}
          />
          <GameList
            title="Biggest gold swings after 15"
            caption="Change in gold difference from 15 minutes to the end"
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
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="w-[34%] py-1 font-normal">Champion</th>
                <th className="py-1 text-right font-normal">Picks</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">Teams</th>
                <th className="py-1 text-right font-normal">W–L</th>
                <th className="w-[38%] py-1 pl-3 font-normal">Win rate, 95% interval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
          <p className="text-xs text-muted-foreground">
            Wide intervals mean few games. An interval that covers 50% does not
            separate the champion from an even result.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface-2)] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-2xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function RateTile({ label, rate }: { label: string; rate: Rate }) {
  return (
    <Tile
      label={label}
      value={rate.value === null ? 'Unavailable' : percent(rate.value)}
      detail={rateInterval(rate)}
    />
  )
}

function IntervalBar({ rate }: { rate: Rate }) {
  if (!rate.interval || rate.value === null) return null
  return (
    <span className="flex items-center gap-2" title={rateInterval(rate)}>
      <span className="relative block h-3 min-w-0 flex-1" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 border-t border-border" />
        <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-[var(--line-strong)]" />
        <span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-[var(--accent-soft)]"
          style={{
            left: `${rate.interval.low * 100}%`,
            width: `${(rate.interval.high - rate.interval.low) * 100}%`,
          }}
        />
        <span
          className="absolute inset-y-0 w-0.5 bg-[var(--accent)]"
          style={{ left: `${rate.value * 100}%` }}
        />
      </span>
      <span className="w-9 text-right tabular-nums">{percent(rate.value)}</span>
    </span>
  )
}

function GameList({
  title,
  caption,
  rows,
  code,
  onSelectTeam,
}: {
  title: string
  caption: string
  rows: ReportTeamGame[]
  code: (id: string) => string
  onSelectTeam: (teamId: string) => void
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid min-w-0 gap-2 py-4">
        <div>
          <h4 className="text-sm font-bold">{title}</h4>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
        {rows.length ? (
          <ol className="grid min-w-0 divide-y divide-border">
            {rows.map((row) => (
              <li key={`${row.matchId}|${row.teamId}`}>
                <Button
                  variant="ghost"
                  aria-label={`Open ${code(row.teamId)} team report from ${title}`}
                  onClick={() => onSelectTeam(row.teamId)}
                  className="grid h-auto w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-none px-0 py-2 text-left whitespace-normal hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {code(row.teamId)} {row.result === 'W' ? 'beat' : 'lost to'} {code(row.opponentId)}
                    </span>
                    <span className="block text-2xs font-normal text-muted-foreground">
                      {row.date}
                      {row.gameNumber ? ` · Game ${row.gameNumber}` : ''}
                      {row.phase ? ` · ${row.phase}` : ''}
                    </span>
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    <span className="block font-semibold">
                      {signedGold(row.goldDiffAt15!)} → {signedGold(row.goldDiff!)}
                    </span>
                    <span className="block font-normal text-muted-foreground">
                      gold at 15 → end
                    </span>
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
