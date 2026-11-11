import type { CSSProperties } from 'react'
import { Badge } from '../../components/ui/badge'
import { Panel, PanelFooter, PanelHeader } from '../../components/ui/panel'
import { SCOUTING_RULES, type Measure } from '../../domains/scouting/report'
import type { Role } from '../../domains/rankings/types'
import { formatMeasure, measureLabel, middleHalf, ordinal, peerNoun, peerRange, trackPosition } from './presentation'

function Strip({ measure }: { measure: Measure }) {
  const { metric, band, value } = measure
  if (!band || value === null) return <div className="sc-track" />
  const half = middleHalf(metric, band)
  return <div className="sc-track" role="img" aria-label={measureLabel(measure)}>
    <i className="sc-band" style={{ left: `${half.left}%`, width: `${half.width}%` }} />
    <i className="sc-med" style={{ left: `${trackPosition(metric, band, band.median)}%` }} />
    <i className="sc-dot" style={{ left: `${trackPosition(metric, band, value)}%` } as CSSProperties} />
  </div>
}

export function RankStrips({ role, measures }: { role: Role; measures: Measure[] }) {
  const peers = peerRange(measures)
  const unranked = measures.some(measure => measure.rank === null)
  return <Panel aria-labelledby="sc-rank-title">
    <PanelHeader title={`Against other ${peerNoun(role)}`} titleId="sc-rank-title" />
    <ul className="sc-ranks">
      {measures.map(measure => <li key={measure.metric.key}>
        <span className="sc-rl">{measure.metric.label}</span>
        <b className="sc-rv sc-num">{formatMeasure(measure.metric, measure.value)}</b>
        <Strip measure={measure} />
        <span className="sc-rr">{measure.rank === null ? <span className="sc-dim" aria-label="Not ranked">{'–'}</span>
          : measure.rank <= 3 ? <Badge variant="rank">{ordinal(measure.rank)}</Badge> : <span className="sc-rk sc-num">{ordinal(measure.rank)}</span>}</span>
      </li>)}
    </ul>
    <PanelFooter className="sc-pfoot">
      <span><i className="sc-key-band" />Middle half</span><span><i className="sc-key-med" />Median</span><span>Right is stronger</span>
      {peers ? <p>Ranked among {peers} {peerNoun(role)} with enough games.</p> : null}
      {unranked ? <p>Ranks need {SCOUTING_RULES.minFieldGames} games in the role and {SCOUTING_RULES.minMetricGames} with the measure.</p> : null}
    </PanelFooter>
  </Panel>
}
