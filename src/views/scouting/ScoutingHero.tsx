import { TeamMark } from '../../components/TeamMark'
import { Badge } from '../../components/ui/badge'
import { Panel } from '../../components/ui/panel'
import { SCOUTING_RULES, STALE_DAYS, staleDays, type Measure, type PlayerReport, type RoleBaseline } from '../../domains/scouting/report'
import type { Role } from '../../domains/rankings/types'
import { gameCount, leadTone, ordinal, percent, readingSentence, recentChampionCounts, shortDate, signed, winLoss } from './presentation'

function RecentChampions({ player }: { player: PlayerReport }) {
  const champions = recentChampionCounts(player)
  if (!champions.length) return null
  return <div className="sc-poolblock">
    <div className="sc-pooltop"><span>Recent champions</span><span>{gameCount(player.recent.games)} in the last {SCOUTING_RULES.windowDays} days</span></div>
    <ul className="sc-picks" aria-label="Recent champions">
      {champions.map(champion => <li key={champion.name} aria-label={`${champion.name}: ${gameCount(champion.games)}`}><span>{champion.name}</span><b className="sc-num">{champion.games}</b></li>)}
    </ul>
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
    <RecentChampions player={player} />
    <dl className="sc-ribbon">
      <div><dt>Win rate</dt><dd className="sc-fig">{percent(player.wins / player.games)}</dd><small>{gameCount(player.games)}</small></div>
      <div><dt>Lane lead at 15</dt>
        <dd className="sc-fig" data-tone={leadTone(lead?.value ?? null)}>{lead?.value == null ? '–' : signed(lead.value)}</dd>
        <small>{lead?.rank ? `${ordinal(lead.rank)} of ${lead.of}` : lead?.value == null ? 'No lane data' : 'Not ranked'}</small></div>
      <div><dt>{form.length === 1 ? 'Last game' : `Last ${form.length} games`}</dt><dd className="sc-fig">{winLoss(formWins, form.length)}</dd>
        <small>{player.before.games ? `${winLoss(player.before.wins, player.before.games)} the ${player.before.games} before` : 'No earlier games'}</small></div>
    </dl>
  </Panel>
}
