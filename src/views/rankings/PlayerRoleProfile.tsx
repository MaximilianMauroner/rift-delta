import { FieldStrip, FieldStripKey } from '../../components/FieldStrip'
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
  const peers = `${profile.league ? `${profile.league} ` : ''}${player.role.toLowerCase()} players`
  return (
    <Card className="min-w-0 gap-3 overflow-visible p-4" role="region" aria-label="Role profile">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <h3 className="min-w-0 text-base font-semibold text-[var(--text-strong)]">Against other {peers}</h3>
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
              hint={playerPerformanceMetrics[position.metric].hint}
              within={profile.league ? `in ${profile.league}` : 'in the field'}
              subject={player.name}
              subjectId={player.id}
              position={position}
              format={(value, scale) => formatMetric(position.metric, value, scale)}
              nameFor={(id) => names.get(id) ?? id}
              minSamples={PLAYER_FIELD_MIN_GAMES}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No stat games for {player.name} in this scope.</p>
      )}
      <FieldStripKey subject={player.name} others={`Other ${peers}`}>
        <span>Players need {PLAYER_FIELD_MIN_GAMES} games to count. Not adjusted for champion or team.</span>
      </FieldStripKey>
    </Card>
  )
}
