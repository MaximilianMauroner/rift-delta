import { Panel, PanelHeader } from '../../components/ui/panel'
import type { PlayerReport, RoleBaseline } from '../../domains/scouting/report'
import { RateCell } from './LanePanel'
import { leadTone, shortDate, signed } from './presentation'

export function Facts({ facts, baseline }: { facts: PlayerReport['facts']; baseline: RoleBaseline }) {
  const { best, hardest, easiest, deathless } = facts
  return <Panel aria-labelledby="sc-facts-title">
    <PanelHeader title="Also worth knowing" titleId="sc-facts-title" />
    <div className="sc-facts">
      <RateCell label="Deathless games" tally={deathless} base={baseline.deathless} />
      {best?.lead != null ? <div className="sc-cell">
        <small>Biggest lane lead</small>
        <span className="sc-fig sc-fig-sm" data-tone={leadTone(best.lead)}>{signed(best.lead)}</span>
        <small className="sc-dim">{best.champion} vs {best.against}, {shortDate(best.date)}</small>
      </div> : null}
      {hardest ? <div className="sc-cell">
        <small>Weakest lane into</small>
        <span className="sc-fig sc-fig-text">{hardest.against}</span>
        <small className="sc-dim">{signed(hardest.lead)} over {hardest.laneGames} games{easiest ? ` · best into ${easiest.against}, ${signed(easiest.lead)}` : ''}</small>
      </div> : null}
    </div>
  </Panel>
}
