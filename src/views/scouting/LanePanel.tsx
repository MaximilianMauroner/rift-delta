import { Badge } from '../../components/ui/badge'
import { Panel, PanelBody, PanelHeader } from '../../components/ui/panel'
import { rate, verdict, type LaneSplit, type Tally } from '../../domains/scouting/report'
import { baselineRate, gameCount, laneShares, percent, verdictBadge } from './presentation'

function LaneBar({ label, split, base }: { label: string; split: LaneSplit; base?: boolean }) {
  const shares = laneShares(split)
  return <div className="sc-lrow" data-base={base || undefined}>
    <span>{label}</span>
    {shares ? <div className="sc-stack" role="img"
      aria-label={`${label}: behind by 500 or more ${percent(shares.behind)}, within 500 ${percent(shares.even)}, ahead by 500 or more ${percent(shares.ahead)}, over ${gameCount(split.games)}`}>
      <i data-part="behind" style={{ flex: split.behind }}><b className="sc-num">{percent(shares.behind)}</b></i>
      <i data-part="even" style={{ flex: split.even }}><b className="sc-num">{percent(shares.even)}</b></i>
      <i data-part="ahead" style={{ flex: split.ahead }}><b className="sc-num">{percent(shares.ahead)}</b></i>
    </div> : <span className="sc-dim">No lane data</span>}
  </div>
}

/** A rate with its sample and the verdict against the role average. `verdict()` alone decides the comparison wording. */
export function RateCell({ label, tally, base }: { label: string; tally: Tally; base: Tally }) {
  const baseRate = baselineRate(base)
  const badge = tally.games && baseRate !== null ? verdictBadge(verdict(tally, baseRate)) : null
  return <div className="sc-cell">
    <small>{label}</small>
    <span className="sc-fig sc-fig-sm">{tally.games ? percent(rate(tally)) : '–'}</span>
    {badge ? <Badge variant={badge.variant}>{badge.arrow ? <i aria-hidden="true">{badge.arrow}</i> : null}{badge.label}</Badge> : null}
    <small className="sc-dim">{tally.hits} of {gameCount(tally.games)}{baseRate === null ? '' : ` · average ${percent(baseRate)}`}</small>
  </div>
}

export function LanePanel({ name, role, lane, behind, ahead, baseline }: {
  name: string
  role: string
  lane: LaneSplit
  behind: Tally
  ahead: Tally
  baseline: { lane: LaneSplit; behind: Tally; ahead: Tally }
}) {
  return <Panel aria-labelledby="sc-lane-title">
    <PanelHeader title="Lane at 15 minutes" titleId="sc-lane-title" />
    <PanelBody className="sc-lanebody">
      <LaneBar label={name} split={lane} />
      <LaneBar label={`Average ${role}`} split={baseline.lane} base />
      <p className="sc-legend"><span><i data-part="behind" />Behind 500+ gold</span><span><i data-part="even" />Within 500</span><span><i data-part="ahead" />Ahead 500+</span></p>
    </PanelBody>
    <div className="sc-duo">
      <RateCell label="Wins when behind" tally={behind} base={baseline.behind} />
      <RateCell label="Wins when ahead" tally={ahead} base={baseline.ahead} />
    </div>
  </Panel>
}
