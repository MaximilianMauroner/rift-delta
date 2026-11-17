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
    <li className="flex min-w-0 items-center gap-2.5 bg-surface px-4 py-2.5 text-sm">
      <MovementChip places={movement.places} />
      <span className="min-w-0 text-muted">
        <b className="font-semibold text-text">{movement.code ?? movement.team}</b>{' '}
        {movement.places === 0 ? 'held rank' : `${up ? 'up' : 'down'} ${Math.abs(movement.places)} ${Math.abs(movement.places) === 1 ? 'place' : 'places'}`}
        <small className="block text-xs">{movement.detail}</small>
      </span>
      <span className={cn('ml-auto shrink-0 text-xs font-semibold tabular-nums', movement.ratingDelta >= 0 ? 'text-up' : 'text-down')}>
        {formatSigned(movement.ratingDelta)}
      </span>
    </li>
  )
}

/** Rank change as a small signed chip, shared by the board and this panel. */
export function MovementChip({ places, title }: { places?: number; title?: string }) {
  if (places === undefined) {
    return <span className="inline-flex min-w-9 justify-center rounded-md bg-raised px-1.5 py-0.5 text-xs font-bold text-muted" title={title}>—</span>
  }
  const tone = places > 0 ? 'up' : places < 0 ? 'down' : 'flat'
  return (
    <span
      className={cn(
        'inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
        tone === 'up' && 'bg-[color-mix(in_srgb,var(--up)_12%,transparent)] text-up',
        tone === 'down' && 'bg-[color-mix(in_srgb,var(--down)_12%,transparent)] text-down',
        tone === 'flat' && 'bg-raised text-muted',
      )}
      title={title}
    >
      <span aria-hidden="true">{tone === 'up' ? '▲' : tone === 'down' ? '▼' : '='}</span>
      {places === 0 ? null : Math.abs(places)}
      <span className="sr-only">{places === 0 ? 'no rank change' : `${places > 0 ? 'up' : 'down'} ${Math.abs(places)}`}</span>
    </span>
  )
}
