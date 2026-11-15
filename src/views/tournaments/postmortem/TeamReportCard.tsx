import { TeamMark } from '../../../components/TeamMark'
import { Badge } from '../../../components/ui/badge'
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
  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <TeamMark team={team.name} code={team.code} className="size-12" />
          <div className="min-w-0">
            <h4 className="break-words text-xl font-semibold">{team.name}</h4>
            <p className="text-xs text-muted-foreground">
              {team.league} · {team.wins}W {team.losses}L · {team.observedGames}{' '}
              observed games
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
        <p className="text-xs text-muted-foreground">
          {awards.eligible} of {team.participants.length} participant rows have
          observed score evidence. Tied scores share the callout.
        </p>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        <h5 className="text-sm font-semibold">Observed lineup</h5>
        <p className="text-xs text-muted-foreground">
          All observed roles and substitutes. Select a participant for evidence.
          GD15 is gold relative to the opposing role at 15 minutes.
        </p>
        <div
          className="grid min-w-0 gap-2"
          role="group"
          aria-label="Observed lineup"
        >
          {team.participants.map((player) => {
            const gold = player.games.flatMap((game) =>
              game.metrics.goldDiffAt15 === null
                ? []
                : game.metrics.goldDiffAt15,
            )
            const mean = player.performance.metrics.goldDiffAt15
            return (
              <Button
                key={player.key}
                variant="outline"
                aria-pressed={player.key === selected}
                aria-label={`View ${player.name}, ${player.role}`}
                onClick={() => onSelect(player)}
                className="h-auto w-full min-w-0 flex-wrap justify-between gap-x-3 gap-y-2 px-3 py-3 text-left whitespace-normal aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)]"
              >
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="text-xs text-muted-foreground">
                    {player.role}
                  </span>
                  <span className="break-words font-semibold">
                    {player.name}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {player.games.length} team games
                  </span>
                </span>
                <span className="grid justify-items-end gap-1">
                  <span className="font-mono text-lg tabular-nums">
                    {player.statsPower
                      ? player.statsPower.score.toFixed(2)
                      : 'Unavailable'}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    StatsPower
                  </span>
                  {!player.statsPower || player.statsPower.priorOnly ? (
                    <Badge variant="secondary">No observed score</Badge>
                  ) : player.statsPower.sampleGames < 20 ? (
                    <Badge variant="warning">Small sample</Badge>
                  ) : null}
                </span>
                <span className="grid w-full gap-1 border-t border-border pt-2 text-xs font-normal text-muted-foreground">
                  <span>
                    Mean GD15{' '}
                    {mean.value === null
                      ? 'unavailable'
                      : `${Math.round(mean.value)} gold`}{' '}
                    · {mean.games} observed, {mean.missing} missing
                  </span>
                  <span>
                    Observed GD15 range{' '}
                    {gold.length
                      ? `${Math.min(...gold)} to ${Math.max(...gold)} gold`
                      : 'unavailable'}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
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
    <div className="min-w-0 rounded-md border border-border bg-[var(--surface-2)] p-3">
      <h5 className="text-xs text-muted-foreground">
        {label}
        {players.length > 1 ? ' · Tie' : ''}
      </h5>
      {players.length ? (
        players.map((player) => (
          <Button
            key={player.key}
            variant="ghost"
            className="h-auto w-full min-w-0 justify-between gap-2 px-0 py-2 whitespace-normal"
            onClick={() => onSelect(player)}
          >
            <span className="break-words text-left">
              {player.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {player.role} · {player.statsPower!.sampleGames} scored games
              </span>
            </span>
            <span className="font-mono tabular-nums">
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
