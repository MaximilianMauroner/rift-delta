import { Badge } from '../../components/ui/badge'
import { Panel, PanelHeader } from '../../components/ui/panel'
import { formatSigned } from '../../shared/display'
import { matchEventLabel } from '../../domains/rankings/read'
import { cn } from '../../shared/utils'

export type MovementSpotlight = {
  team: string
  code?: string
  /** Places gained (positive) or lost. */
  places: number
  ratingDelta: number
  /** Exact ranks and basis, for the tooltip. */
  detail: string
}

export type UpsetSpotlight = {
  winner: string
  loser: string
  /** Source event name, such as "LPL/2026 Season/Regional Finals". */
  event?: string
  /** Winner's pre-match chance, 0 to 1. */
  chance: number
}

/**
 * The last period in three lines: the biggest riser, the biggest faller, and
 * the biggest upset. Movement is stated as places moved rather than as a pair
 * of ranks, because the match-history ranks it is measured on can differ from
 * the published ranks on the board. The exact ranks stay in the tooltip.
 */
export function WhatChanged({
  period,
  riser,
  faller,
  upset,
}: {
  period: string
  riser?: MovementSpotlight
  faller?: MovementSpotlight
  upset?: UpsetSpotlight
}) {
  if (!riser && !faller && !upset) return null
  return (
    <Panel aria-label="What changed">
      <PanelHeader title="What changed" actions={<span className="text-xs text-muted">{period}</span>} />
      <ul className="grid gap-px bg-line">
        {riser ? <MovementRow movement={riser} /> : null}
        {faller ? <MovementRow movement={faller} /> : null}
        {upset ? (
          <li className="flex min-w-0 items-center gap-2.5 bg-surface px-4 py-2.5 text-sm">
            <Badge variant="secondary" className="shrink-0">Upset</Badge>
            <span className="min-w-0 text-muted">
              <b className="font-semibold text-text">{upset.winner}</b> beat {upset.loser} with a {Math.round(upset.chance * 100)}% chance
              {upset.event ? <span className="block truncate text-xs text-muted">{matchEventLabel(upset.event)}</span> : null}
            </span>
          </li>
        ) : null}
      </ul>
    </Panel>
  )
}

function MovementRow({ movement }: { movement: MovementSpotlight }) {
  const up = movement.places > 0 || (movement.places === 0 && movement.ratingDelta > 0)
  return (
    <li className="flex min-w-0 items-center gap-2.5 bg-surface px-4 py-2.5 text-sm" title={movement.detail}>
      <MovementChip places={movement.places} />
      <span className="min-w-0 truncate text-muted">
        <b className="font-semibold text-text">{movement.code ?? movement.team}</b>{' '}
        {movement.places === 0 ? 'held rank' : `${up ? 'up' : 'down'} ${Math.abs(movement.places)} ${Math.abs(movement.places) === 1 ? 'place' : 'places'}`}
      </span>
      <span className={cn('ml-auto shrink-0 text-xs font-semibold tabular-nums', movement.ratingDelta >= 0 ? 'text-up' : 'text-down')}>
        {formatSigned(movement.ratingDelta)}
      </span>
    </li>
  )
}

/** Rank change as a signed arrow and count, shared by the board and this panel. */
export function MovementChip({ places, title }: { places?: number; title?: string }) {
  if (places === undefined) {
    return <span className="inline-flex min-w-7 text-xs font-semibold text-muted" title={title}>—<span className="sr-only">no rank change recorded</span></span>
  }
  const tone = places > 0 ? 'up' : places < 0 ? 'down' : 'flat'
  return (
    <span
      className={cn(
        'inline-flex min-w-7 items-baseline gap-px text-xs font-bold tabular-nums',
        tone === 'up' && 'text-up',
        tone === 'down' && 'text-down',
        tone === 'flat' && 'text-muted',
      )}
      title={title}
    >
      <span aria-hidden="true">{tone === 'up' ? '↑' : tone === 'down' ? '↓' : '='}</span>
      <span aria-hidden="true">{places === 0 ? null : Math.abs(places)}</span>
      <span className="sr-only">{places === 0 ? 'no rank change' : `${places > 0 ? 'up' : 'down'} ${Math.abs(places)}`}</span>
    </span>
  )
}
