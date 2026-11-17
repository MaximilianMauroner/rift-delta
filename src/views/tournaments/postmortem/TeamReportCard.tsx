import { leagueColor } from '../../../shared/teamColor'
import { TeamMark } from '../../../components/TeamMark'
import { signedGold } from '../../../components/fieldFormat'
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
    <Card className="gap-0 border-l-[3px] py-0" style={{ borderLeftColor: leagueColor(team.league) }}>
      <CardHeader className="gap-3 border-b border-line bg-raised py-4">
        <div className="flex min-w-0 items-center gap-3">
          <TeamMark team={team.name} code={team.code} className="size-11" />
          <div className="min-w-0">
            <h4 className="break-words text-lg font-bold">{team.name}</h4>
            <p className="text-xs text-muted">
              {team.league} · {team.wins}W {team.losses}L · {team.observedGames}{' '}
              games
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatHighlight
            label="Best gold lead at 15"
            values={goldLeaders}
            format={signedGold}
            onSelect={onSelect}
          />
          <StatHighlight
            label="Best kill participation"
            values={participationLeaders}
            format={(value) => `${(value * 100).toFixed(1)}%`}
            onSelect={onSelect}
          />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-2 px-0 pb-3 pt-3">
        <h5 className="px-4 text-sm font-bold">Lineup</h5>
        <div aria-hidden="true" className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] gap-2 px-4 text-xs text-muted sm:hidden">
          <span>Role</span>
          <span>Player</span>
          <span className="text-right">Average</span>
        </div>
        <div
          aria-hidden="true"
          className="hidden grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem] items-end gap-2 px-4 text-xs text-muted sm:grid"
        >
          <span>Role</span>
          <span>Player</span>
          <span className="grid gap-1">
            <span>Gold lead at 15, every game</span>
            <span className="flex justify-between">
              <span>−{extent}</span>
              <span>0</span>
              <span>+{extent}</span>
            </span>
          </span>
          <span className="text-right">Average</span>
        </div>
        <div
          className="grid min-w-0 divide-y divide-line border-y border-line"
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
                className="grid h-auto min-h-14 w-full min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-none border-l-2 border-transparent px-4 py-2 text-left whitespace-normal text-text hover:bg-raised aria-pressed:border-l-[var(--focus)] aria-pressed:bg-[var(--focus-wash)] sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]"
              >
                <span className="text-xs font-normal text-muted">
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
                      aria-label={`Gold lead at 15 ranged from ${minimum} to ${maximum} gold in ${gold.length} games`}
                      className="relative block h-5"
                    >
                      <span className="absolute inset-x-0 top-1/2 border-t border-line" />
                      <span className="absolute inset-y-0 left-1/2 border-l border-line" />
                      <span
                        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-md bg-[color-mix(in_srgb,var(--muted)_40%,transparent)]"
                        style={{
                          left: `${((minimum + extent) / (2 * extent)) * 100}%`,
                          width: `${((maximum - minimum) / (2 * extent)) * 100}%`,
                        }}
                      />
                      {mean !== null ? (
                        <span
                          className="absolute inset-y-1 w-0.5 bg-text"
                          style={{
                            left: `${((mean + extent) / (2 * extent)) * 100}%`,
                          }}
                        />
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-muted">
                      No gold lead data
                    </span>
                  )}
                </span>
                <span className="grid justify-items-end gap-0.5">
                  <span className="text-sm font-bold tabular-nums">
                    {mean === null
                      ? '—'
                      : signedGold(mean)}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
        <details className="px-4 text-xs text-muted">
          <summary className="cursor-pointer">About the lineup</summary>
          <p className="mt-2">
            Gold lead at 15 is the player's gold against the lane opponent at
            15 minutes. The bar spans this team's games and the tick marks the
            average.
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
    <div className="min-w-0 rounded-md bg-surface px-3 py-2">
      <h5 className="text-xs text-muted">
        {label}
        {values.length > 1 ? ' · Tie' : ''}
      </h5>
      {values.length ? (
        values.map(({ player, value }) => (
          <Button
            key={player.key}
            variant="ghost"
            aria-label={`View ${player.name}, ${player.role}, ${label}`}
            className="grid h-auto w-full min-w-0 justify-start justify-items-start gap-0 px-0 py-1 whitespace-normal text-text hover:underline min-[440px]:flex min-[440px]:justify-between min-[440px]:gap-2"
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
