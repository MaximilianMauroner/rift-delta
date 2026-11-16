import { TeamMark } from '../../../components/TeamMark'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import {
  reportTeamMetricLeaders,
  type TournamentReportPlayer,
  type TournamentReportTeam,
} from '../../../domains/rankings/tournament-reports'

export function TeamReportCard({
  team,
  selected,
  onSelect,
}: {
  team: TournamentReportTeam
  selected?: string
  onSelect: (player: TournamentReportPlayer) => void
}) {
  const goldLeaders = reportTeamMetricLeaders(team.participants, 'goldDiffAt15')
  const participationLeaders = reportTeamMetricLeaders(
    team.participants,
    'killParticipation',
  )
  const allGold = team.participants.flatMap((player) =>
    player.games.flatMap((game) =>
      game.metrics.goldDiffAt15 === null ? [] : game.metrics.goldDiffAt15,
    ),
  )
  const extent = Math.max(1, ...allGold.map(Math.abs))
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-3 border-b border-border bg-[var(--surface-2)] py-4">
        <div className="flex min-w-0 items-center gap-3">
          <TeamMark team={team.name} code={team.code} className="size-11" />
          <div className="min-w-0">
            <h4 className="break-words text-lg font-bold">{team.name}</h4>
            <p className="text-xs text-muted-foreground">
              {team.league} · {team.wins}W {team.losses}L · {team.observedGames}{' '}
              games
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatHighlight
            label="Highest avg GD15"
            values={goldLeaders}
            format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`}
            onSelect={onSelect}
          />
          <StatHighlight
            label="Highest avg kill participation"
            values={participationLeaders}
            format={(value) => `${(value * 100).toFixed(1)}%`}
            onSelect={onSelect}
          />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-2 px-0 pb-3 pt-3">
        <h5 className="px-4 text-sm font-bold">Lineup</h5>
        <div aria-hidden="true" className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] gap-2 px-4 text-2xs text-muted-foreground sm:hidden">
          <span>Role</span>
          <span>Player</span>
          <span className="text-right">Avg GD15</span>
        </div>
        <div
          aria-hidden="true"
          className="hidden grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem] items-end gap-2 px-4 text-2xs text-muted-foreground sm:grid"
        >
          <span>Role</span>
          <span>Player</span>
          <span className="grid gap-1">
            <span>GD15 range, gold</span>
            <span className="flex justify-between">
              <span>−{extent}</span>
              <span>0</span>
              <span>+{extent}</span>
            </span>
          </span>
          <span className="text-right">Avg GD15</span>
        </div>
        <div
          className="grid min-w-0 divide-y divide-border border-y border-border"
          role="group"
          aria-label="Observed lineup"
        >
          {team.participants.map((player) => {
            const gold = player.games.flatMap((game) =>
              game.metrics.goldDiffAt15 === null
                ? []
                : game.metrics.goldDiffAt15,
            )
            const minimum = gold.length ? Math.min(...gold) : 0
            const maximum = gold.length ? Math.max(...gold) : 0
            const mean = gold.length
              ? gold.reduce((sum, value) => sum + value, 0) / gold.length
              : null
            return (
              <Button
                key={player.key}
                variant="ghost"
                aria-pressed={player.key === selected}
                aria-label={`View ${player.name}, ${player.role}`}
                onClick={() => onSelect(player)}
                className="grid h-auto min-h-14 w-full min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-none border-l-2 border-transparent px-4 py-2 text-left whitespace-normal hover:bg-[var(--surface-2)] aria-pressed:border-l-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]"
              >
                <span className="text-xs font-normal text-muted-foreground">
                  {player.role}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="break-words text-sm font-semibold">
                    {player.name}
                  </span>
                </span>
                <span className="hidden min-w-0 sm:block">
                  {gold.length ? (
                    <span
                      role="img"
                      aria-label={`Observed GD15 range ${minimum} to ${maximum} gold`}
                      title={`Observed GD15 range ${minimum} to ${maximum} gold. ${gold.length} observed games.`}
                      className="relative block h-5"
                    >
                      <span className="absolute inset-x-0 top-1/2 border-t border-border" />
                      <span className="absolute inset-y-0 left-1/2 border-l border-border" />
                      <span
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm bg-[var(--accent-soft)]"
                        style={{
                          left: `${((minimum + extent) / (2 * extent)) * 100}%`,
                          width: `${((maximum - minimum) / (2 * extent)) * 100}%`,
                        }}
                      />
                      {mean !== null ? (
                        <span
                          className="absolute inset-y-1 w-0.5 bg-[var(--accent)]"
                          style={{
                            left: `${((mean + extent) / (2 * extent)) * 100}%`,
                          }}
                        />
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-2xs font-normal text-muted-foreground">
                      No GD15 data
                    </span>
                  )}
                </span>
                <span className="grid justify-items-end gap-0.5">
                  <span className="text-sm font-bold tabular-nums">
                    {mean === null
                      ? '—'
                      : `${mean > 0 ? '+' : ''}${mean.toFixed(1)}`}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
        <details className="px-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">About the lineup</summary>
          <p className="mt-2">
            GD15 compares gold with the opposing role at 15 minutes. The range
            and average use this team's games.
          </p>
        </details>
      </CardContent>
    </Card>
  )
}

function StatHighlight({
  label,
  values,
  format,
  onSelect,
}: {
  label: string
  values: Array<{ player: TournamentReportPlayer; value: number }>
  format: (value: number) => string
  onSelect: (player: TournamentReportPlayer) => void
}) {
  return (
    <div className="min-w-0 rounded-md bg-card px-3 py-2">
      <h5 className="text-xs text-muted-foreground">
        {label}
        {values.length > 1 ? ' · Tie' : ''}
      </h5>
      {values.length ? (
        values.map(({ player, value }) => (
          <Button
            key={player.key}
            variant="ghost"
            aria-label={`View ${player.name}, ${player.role}, ${label}`}
            className="grid h-auto w-full min-w-0 justify-start justify-items-start gap-0 px-0 py-1 whitespace-normal hover:text-[var(--accent)] min-[440px]:flex min-[440px]:justify-between min-[440px]:gap-2"
            onClick={() => onSelect(player)}
          >
            <span className="min-w-0 break-words text-left">{player.name}</span>
            <span className="font-semibold tabular-nums">{format(value)}</span>
          </Button>
        ))
      ) : (
        <p className="mt-2 text-sm">Unavailable</p>
      )}
    </div>
  )
}
