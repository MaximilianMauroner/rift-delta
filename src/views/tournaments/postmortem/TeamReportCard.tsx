import { TeamMark } from '../../../components/TeamMark'
import { Button } from '../../../components/ui/button'
import { Card, CardContent, CardHeader } from '../../../components/ui/card'
import {
  reportAwards,
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
  const awards = reportAwards(team.participants)
  const allGold = team.participants.flatMap((player) =>
    player.games.flatMap((game) =>
      game.metrics.goldDiffAt15 === null ? [] : game.metrics.goldDiffAt15,
    ),
  )
  const extent = Math.max(1, ...allGold.map(Math.abs))
  return (
    <Card className="gap-0">
      <CardHeader className="gap-5 border-b border-border pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark team={team.name} code={team.code} className="size-12" />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-label text-[var(--accent)]">
              Team report
            </p>
            <h4 className="break-words text-2xl font-bold tracking-tight">{team.name}</h4>
            <p className="text-xs text-muted-foreground">
              {team.league} · {team.wins}W {team.losses}L · {team.observedGames}{' '}
              observed games
            </p>
          </div>
        </div>
        <div className="grid gap-2 min-[440px]:grid-cols-2">
          <Award
            label="Best StatsPower"
            players={awards.best}
            onSelect={onSelect}
          />
          <Award
            label="Lowest StatsPower"
            players={awards.lowest}
            onSelect={onSelect}
          />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h5 className="text-base font-bold">Observed lineup</h5>
          <span className="text-xs text-muted-foreground">Select a player to explore</span>
        </div>
        <div
          aria-hidden="true"
          className="hidden grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem] items-end gap-2 px-2 text-2xs text-muted-foreground sm:grid"
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
          <span className="text-right">StatsPower</span>
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
            const mean = player.performance.metrics.goldDiffAt15.value
            const observedScore =
              player.statsPower && !player.statsPower.priorOnly
            return (
              <Button
                key={player.key}
                variant="ghost"
                aria-pressed={player.key === selected}
                aria-label={`View ${player.name}, ${player.role}`}
                onClick={() => onSelect(player)}
                className="grid h-auto min-h-14 w-full min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-none border-l-2 border-transparent px-2 py-2 text-left whitespace-normal transition-colors hover:bg-[var(--surface-2)] aria-pressed:border-l-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]"
              >
                <span className="text-xs font-normal text-muted-foreground">
                  {player.role}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="break-words text-base font-semibold">
                    {player.name}
                  </span>
                  <span className="text-2xs font-normal text-muted-foreground">
                    {player.games.length} team games
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
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {observedScore ? player.statsPower!.score.toFixed(2) : '—'}
                  </span>
                  <span className="text-2xs font-normal text-muted-foreground sm:hidden">
                    StatsPower
                  </span>
                  {!observedScore ? (
                    <span className="text-2xs font-normal text-muted-foreground">
                      No observed score
                    </span>
                  ) : null}
                </span>
              </Button>
            )
          })}
        </div>
        <p className="text-2xs text-muted-foreground">
          All observed roles and substitutes. GD15 compares gold with the
          opposing role at 15 minutes. {awards.eligible} of{' '}
          {team.participants.length} participants have observed score evidence.
          Tied scores share the callout.
        </p>
      </CardContent>
    </Card>
  )
}

function Award({
  label,
  players,
  onSelect,
}: {
  label: string
  players: TournamentReportPlayer[]
  onSelect: (player: TournamentReportPlayer) => void
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--surface-2)] px-3 py-2.5">
      <h5 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {players.length > 1 ? ' · Tie' : ''}
      </h5>
      {players.length ? (
        players.map((player) => (
          <Button
            key={player.key}
            variant="ghost"
            className="h-auto w-full min-w-0 justify-between gap-2 px-0 py-1 whitespace-normal hover:text-[var(--accent)]"
            onClick={() => onSelect(player)}
          >
            <span className="break-words text-left">
              {player.name}
              <span className="block text-2xs font-normal text-muted-foreground">
                {player.role} · {player.statsPower!.sampleGames} scored games
              </span>
            </span>
            <span className="font-mono text-base font-semibold tabular-nums">
              {player.statsPower!.score.toFixed(2)}
            </span>
          </Button>
        ))
      ) : (
        <p className="mt-2 text-sm">No observed score evidence.</p>
      )}
    </div>
  )
}
