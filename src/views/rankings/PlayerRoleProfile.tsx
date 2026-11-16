import { FieldStrip } from '../../components/FieldStrip'
import { Card } from '../../components/ui/card'
import { Select } from '../../components/ui/select'
import { PLAYER_FIELD_MIN_GAMES, playerRoleProfile } from '../../domains/rankings/field-statistics'
import { playerPerformanceMetrics } from '../../domains/rankings/read'
import type { CompactPlayer } from '../../domains/rankings/types'
import { formatMetric } from './playerMetricFormat'

export function PlayerRoleProfile({
  players,
  choices,
  selectedId,
  onSelect,
}: {
  players: readonly CompactPlayer[]
  choices: readonly CompactPlayer[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const profile = playerRoleProfile(players, selectedId)
  if (!profile) return null
  const { player } = profile
  const names = new Map(players.map((entry) => [entry.id, `${entry.name} (${entry.teamCode ?? entry.team})`]))
  const games = player.diagnostics?.sampleGames ?? 0
  return (
    <Card className="min-w-0 gap-3 p-4" role="region" aria-label="Role profile">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Role profile</h3>
          <p className="text-xs text-muted-foreground">
            {player.name}'s raw averages against {[profile.league, player.role].filter(Boolean).join(' ')} players in this
            scope. Each dot is one player with {PLAYER_FIELD_MIN_GAMES}+ games. The tick is the field average.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Profile player
          <Select aria-label="Profile player" value={player.id} onChange={(event) => onSelect(event.target.value)}>
            {choices.some((entry) => entry.id === player.id) ? null : <option value={player.id}>{player.name}</option>}
            {choices.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · {entry.role} · {entry.teamCode ?? entry.team}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {games ? (
        <ol className="grid min-w-0 divide-y divide-border">
          {profile.positions.map((position) => (
            <FieldStrip
              key={position.metric}
              label={playerPerformanceMetrics[position.metric].label}
              subject={player.name}
              subjectId={player.id}
              position={position}
              format={(value) => formatMetric(position.metric, value)}
              nameFor={(id) => names.get(id) ?? id}
              minSamples={PLAYER_FIELD_MIN_GAMES}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No stat games for {player.name} in this scope.</p>
      )}
      <p className="text-xs text-muted-foreground">
        σ is the distance from the field average in standard deviations. p is the share of the field below. Raw averages
        are not adjusted for league strength, champions or team, so the field stays inside one league. They do not set
        Stats Power.
      </p>
    </Card>
  )
}
