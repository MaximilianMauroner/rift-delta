import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { currentHashQuery, profileScope } from '../../browser/navigation'
import { scoutingHref } from '../../browser/scouting/navigation'
import { FieldStrip, FieldStripKey } from '../../components/FieldStrip'
import { TeamMark } from '../../components/TeamMark'
import { RegionBadge } from '../../components/ui'
import { Button } from '../../components/ui/button'
import { Panel, PanelBody } from '../../components/ui/panel'
import { Select } from '../../components/ui/select'
import { PLAYER_FIELD_MIN_GAMES, playerRoleProfile } from '../../domains/rankings/field-statistics'
import { playerPerformanceMetrics } from '../../domains/rankings/read'
import type { CompactPlayer } from '../../domains/rankings/types'
import { formatDecimal, formatNumber, formatRating } from '../../shared/display'
import { formatMetric } from './playerMetricFormat'
import { playerLeague } from './playerData'

export function PlayerRoleProfile({
  players,
  choices,
  selectedId,
  scoreLabel,
  scoreValue,
  rank,
  open,
  onSelect,
  onClose,
}: {
  players: readonly CompactPlayer[]
  choices: readonly CompactPlayer[]
  selectedId: string
  scoreLabel: string
  scoreValue?: number
  rank: number | null
  open: boolean
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!open) return
    heading.current?.focus({ preventScroll: true })
    if (window.matchMedia('(max-width: 1279px)').matches) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [selectedId, open])
  const profile = playerRoleProfile(players, selectedId)
  if (!profile) return null
  const { player } = profile
  const league = playerLeague(player)
  const names = new Map(players.map((entry) => [entry.id, `${entry.name} (${entry.teamCode ?? entry.team})`]))
  const games = player.diagnostics?.sampleGames ?? 0
  const peers = `${profile.league ? `${profile.league} ` : ''}${player.role.toLowerCase()} players`
  const index = choices.findIndex((entry) => entry.id === player.id)
  const styleQuery = new URLSearchParams({ scope: profileScope(currentHashQuery().get('scope')), view: 'player', role: player.role, pa: `${player.id}|${player.role}` })
  return (
    <Panel
      className="r8-player-profile"
      league={league}
      role="region"
      aria-label="Role profile"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="r8-player-profile-heading">
        <TeamMark team={player.team} code={player.teamCode} className="size-10" />
        <div>
          <h2 ref={heading} tabIndex={-1} data-first-answer="players">{player.name}</h2>
          <span><RegionBadge region={league} size="sm" /> {player.role}, {player.team}</span>
        </div>
        <div className="r8-player-profile-score">
          <b>{scoreLabel === 'Stats Power' ? formatDecimal(scoreValue) : formatRating(scoreValue)}</b>
          <small>{scoreLabel}</small>
          <small>{rank === null ? 'Unranked' : `Rank ${rank}`}</small>
        </div>
      </header>
      <nav className="r8-player-profile-nav" aria-label="Player navigation">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={16} />Players
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous player"
          disabled={index <= 0}
          onClick={() => onSelect(choices[index - 1].id)}
        >
          <ChevronLeft size={16} />
        </Button>
        {index >= 0 ? <span className="text-xs text-muted tabular-nums">{index + 1} of {choices.length}</span> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next player"
          disabled={index < 0 || index >= choices.length - 1}
          onClick={() => onSelect(choices[index + 1].id)}
        >
          <ChevronRight size={16} />
        </Button>
      </nav>
      <PanelBody className="grid gap-3">
        <label className="r8-player-profile-picker">
          Profile player
          <Select aria-label="Profile player" value={player.id} onChange={(event) => onSelect(event.target.value)}>
            {choices.some((entry) => entry.id === player.id) ? null : <option value={player.id}>{player.name}</option>}
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.role} · {entry.teamCode ?? entry.team}</option>)}
          </Select>
        </label>
        <dl className="r8-player-profile-facts">
          <div><dt>Stat games</dt><dd>{formatNumber(player.statsPower?.sampleGames ?? games)}</dd></div>
          <div><dt>Role Power</dt><dd>{formatRating(player.rating)}</dd></div>
          <div><dt>Team games</dt><dd>{formatNumber(player.teamGames ?? player.games)}</dd></div>
        </dl>
        <div className="r8-player-profile-links">
          <a href={scoutingHref(player)} aria-label={`Full scouting report for ${player.name}`}>Scouting report</a>
          <a href={`#profiles?${styleQuery.toString()}`}>Style profile</a>
        </div>
        <h3 className="text-sm font-semibold text-text">Against other {peers}</h3>
        {games ? (
          <ol className="grid min-w-0 divide-y divide-line">
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
        ) : <p className="text-sm text-muted">No stat games for {player.name} in this scope.</p>}
        <FieldStripKey subject={player.name} others={`Other ${peers}`}>
          <span>Players need {PLAYER_FIELD_MIN_GAMES} games to count. Not adjusted for champion or team.</span>
        </FieldStripKey>
      </PanelBody>
    </Panel>
  )
}
