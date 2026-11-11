import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/badge'
import { Panel, PanelHeader } from '../../components/ui/panel'
import { SCOUTING_RULES, type ChampionRow, type GameRef } from '../../domains/scouting/report'
import { TREND_TAGS, leadTone, percent, poolRowLabel, shortDate, signed, winLoss } from './presentation'

export function ResultMark({ won }: { won: boolean }) {
  return <Badge variant={won ? 'win' : 'loss'} size="mark" role="img" aria-label={won ? 'Win' : 'Loss'}>{won ? 'W' : 'L'}</Badge>
}

function LastGames({ games }: { games: GameRef[] }) {
  return <ol className="sc-more-list">
    {games.map((game, index) => <li key={`${game.date}-${index}`}>
      <ResultMark won={game.won} />
      <span className="sc-dim sc-num">{shortDate(game.date)}</span>
      <span className="sc-vs">vs {game.against}</span>
      <b className="sc-num" data-tone={leadTone(game.lead)}>{game.lead === null ? <span className="sc-dim">no lane data</span> : signed(game.lead)}</b>
    </li>)}
  </ol>
}

function PoolRow({ row, open, onToggle }: { row: ChampionRow; open: boolean; onToggle: () => void }) {
  const tag = TREND_TAGS[row.trend]
  const id = `sc-more-${row.champion.replace(/[^A-Za-z0-9]+/g, '-')}`
  return <li>
    <button type="button" className="sc-poolrow" aria-expanded={open} aria-controls={id} aria-label={poolRowLabel(row)} onClick={onToggle}>
      <span className="sc-cn"><b>{row.champion}</b>{tag ? <span className="sc-trend">{tag.arrow ? `${tag.arrow} ` : ''}{tag.label}</span> : null}</span>
      <span className="sc-rec sc-num">{row.recent.games ? <><b>{row.recent.games}</b><span className="sc-dim">{winLoss(row.recent.wins, row.recent.games)}</span></> : <span className="sc-dim">none</span>}</span>
      <span className="sc-all sc-num"><b>{percent(row.all.wins / row.all.games)}</b><small>{row.all.games}</small></span>
      <span className="sc-lead sc-num" data-tone={leadTone(row.lead?.mean ?? null)}>{row.lead ? signed(row.lead.mean) : '–'}</span>
      <ChevronDown className="sc-chev" size={15} aria-hidden="true" />
    </button>
    {open ? <div className="sc-more" id={id} role="region" aria-label={`Last ${row.last.length} games on ${row.champion}`}><LastGames games={row.last} /></div> : null}
  </li>
}

export function PoolTable({ pool }: { pool: ChampionRow[] }) {
  const [open, setOpen] = useState<string | null>(pool[0]?.champion ?? null)
  return <Panel aria-labelledby="sc-pool-title">
    <PanelHeader title="What they play" titleId="sc-pool-title" />
    {pool.length ? <>
      <div className="sc-thead" aria-hidden="true"><span>Champion</span><span>{SCOUTING_RULES.windowDays} days</span><span>Win rate</span><span>Lane</span><span /></div>
      <ul className="sc-pool">
        {pool.map(row => <PoolRow key={row.champion} row={row} open={open === row.champion} onToggle={() => setOpen(open === row.champion ? null : row.champion)} />)}
      </ul>
    </> : <p className="sc-empty">No champion has enough games to list.</p>}
  </Panel>
}
