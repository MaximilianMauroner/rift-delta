import { Badge } from '../../components/ui/badge'
import { Panel, PanelHeader } from '../../components/ui/panel'
import type { PlayedGame } from '../../domains/scouting/report'
import { ResultMark } from './PoolTable'
import { leadTone, shortDate, signed } from './presentation'

/** Bars grow right for a lane lead and left for a deficit, on one scale shared by every game. */
export function FormList({ form }: { form: PlayedGame[] }) {
  const largest = Math.max(1, ...form.map(game => Math.abs(game.lead ?? 0)))
  return <Panel aria-labelledby="sc-form-title">
    <PanelHeader title={form.length === 1 ? 'Last game' : `Last ${form.length} games`} titleId="sc-form-title" actions={<Badge>Lane lead at 15 minutes</Badge>} />
    <ol className="sc-glist">
      {form.map((game, index) => {
        const width = game.lead === null ? 0 : Math.abs(game.lead) / largest * 100
        return <li key={`${game.date}-${index}`}>
          <ResultMark won={game.won} />
          <span className="sc-gc"><b>{game.champion}</b><small>vs {game.against} {'·'} {shortDate(game.date)}</small></span>
          <div className="sc-axis" aria-hidden="true">
            <span data-side="neg">{game.lead !== null && game.lead < 0 ? <i style={{ width: `${width}%` }} /> : null}</span>
            <span data-side="pos">{game.lead !== null && game.lead >= 0 ? <i style={{ width: `${width}%` }} /> : null}</span>
          </div>
          <b className="sc-gv sc-num" data-tone={leadTone(game.lead)}>{game.lead === null ? <span className="sc-dim">no lane data</span> : signed(game.lead)}</b>
        </li>
      })}
    </ol>
  </Panel>
}
