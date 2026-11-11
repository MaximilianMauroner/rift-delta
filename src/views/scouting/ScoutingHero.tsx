import type { CSSProperties } from 'react'
import { TeamMark } from '../../components/TeamMark'
import { Badge } from '../../components/ui/badge'
import { Panel } from '../../components/ui/panel'
import { SCOUTING_RULES, STALE_DAYS, staleDays, type Measure, type PlayerReport, type RoleBaseline } from '../../domains/scouting/report'
import type { Role } from '../../domains/rankings/types'
import { leadTone, ordinal, percent, poolSegments, readingSentence, shortDate, signed, winLoss } from './presentation'

function PoolStrip({ player }: { player: PlayerReport }) {
  const segments = poolSegments(player)
  if (!segments.length) return null
  const summary = segments.map(segment => `${segment.name} ${segment.games}`).join(', ')
  return <div className="sc-poolblock">
    <div className="sc-pooltop"><span>Last {SCOUTING_RULES.windowDays} days, by champion</span><span className="sc-num">{player.recent.games} games</span></div>
    <div role="img" aria-label={`Games by champion in the last ${SCOUTING_RULES.windowDays} days: ${summary}`}>
      <ul className="sc-strip" aria-hidden="true">
        {segments.map(segment => <li key={segment.name} data-size={segment.size} data-other={segment.heat === 0 || undefined}
          style={{ flex: segment.games, '--sc-heat': `var(--heat-${segment.heat || 1})` } as CSSProperties}
          title={`${segment.name}: ${segment.games} of ${player.recent.games} games`}>
          <b>{segment.name}</b><span className="sc-num">{segment.games}</span>
        </li>)}
      </ul>
    </div>
  </div>
}

export function ScoutingHero({ player, roles, through, measures }: { player: PlayerReport; roles: Record<Role, RoleBaseline>; through: string | null; measures: Measure[] }) {
  const lead = measures.find(measure => measure.metric.key === 'gd15')
  const stale = through ? staleDays(player, through) : 0
  const form = player.form
  const formWins = form.filter(game => game.won).length
  return <Panel className="sc-hero" aria-labelledby="sc-player-name">
    <div className="sc-hero-top">
      <TeamMark team={player.team} className="sc-hero-mark" />
      <div className="sc-hero-id">
        <h1 id="sc-player-name">{player.name}</h1>
        <p className="sc-chips"><Badge>{player.role}</Badge><span>{player.team}</span></p>
      </div>
      <p className="sc-reading">{readingSentence(player, roles)}</p>
    </div>
    {stale > STALE_DAYS ? <p className="sc-alert" role="status"><b>Last game {shortDate(player.last)}.</b> {stale} days before the newest record, so recent numbers may be old.</p> : null}
    <PoolStrip player={player} />
    <dl className="sc-ribbon">
      <div><dt>Win rate</dt><dd className="sc-fig">{percent(player.wins / player.games)}</dd><small>{player.games} games</small></div>
      <div><dt>Lane lead at 15</dt>
        <dd className="sc-fig" data-tone={leadTone(lead?.value ?? null)}>{lead?.value == null ? '–' : signed(lead.value)}</dd>
        <small>{lead?.rank ? `${ordinal(lead.rank)} of ${lead.of}` : lead?.value == null ? 'No lane data' : 'Not ranked'}</small></div>
      <div><dt>Last {form.length} games</dt><dd className="sc-fig">{winLoss(formWins, form.length)}</dd>
        <small>{player.before.games ? `${winLoss(player.before.wins, player.before.games)} the ${player.before.games} before` : 'No earlier games'}</small></div>
    </dl>
  </Panel>
}
