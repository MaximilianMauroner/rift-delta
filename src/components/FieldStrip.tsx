import type { ReactNode } from 'react'
import type { FieldPosition } from '../domains/rankings/field-statistics'
import { cn } from '../shared/utils'
import { Badge } from './ui/badge'
import { ordinal, standingLabel } from './fieldFormat'

/**
 * One measure of one subject against its field: what the measure means, where the
 * subject sits among the others, its place, and a plain verdict. Better is always
 * to the right, so a measure where lower is better runs backwards.
 */
export function FieldStrip({
  label,
  hint,
  subject,
  subjectId,
  position,
  format,
  nameFor,
  within,
  minSamples,
  sampleUnit = 'games',
}: {
  label: string
  hint?: string
  subject: string
  subjectId: string
  position: FieldPosition
  format: (value: number) => string
  nameFor: (id: string) => string
  /** Completes "Best …", such as "in LPL" or "at Worlds". */
  within: string
  minSamples: number
  sampleUnit?: string
}) {
  const { value, field, mean, place, better, standing } = position
  const values = field.map((entry) => entry.value)
  const low = Math.min(...values, value ?? Infinity)
  const high = Math.max(...values, value ?? -Infinity)
  const spread = Number.isFinite(low) && high > low
  const at = (point: number) => {
    const share = spread ? (point - low) / (high - low) : 0.5
    return (better === 'lower' ? 1 - share : share) * 100
  }
  const [left, right] = better === 'lower' ? [high, low] : [low, high]
  const tooFew = value !== null && place === null
  const summary =
    value === null
      ? `${label}: no data for ${subject}.`
      : `${label}: ${subject} ${format(value)}${place ? `, ${ordinal(place)} of ${field.length}` : ''}${
          mean !== null ? `. Average ${format(mean)}` : ''
        }${spread ? `. Range ${format(low)} to ${format(high)}` : ''}.`
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_9.5rem]">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-semibold text-[var(--text-strong)]">{label}</span>
        {hint ? <span className="text-xs leading-snug text-muted-foreground">{hint}</span> : null}
      </span>
      <span
        className="relative col-span-2 row-start-2 mx-2 block h-12 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1"
        role="img"
        aria-label={summary}
      >
        <span className="absolute inset-x-0 top-6 border-t border-[var(--line-strong)]" />
        {mean !== null && spread ? (
          <>
            <span
              className="absolute top-0 -translate-x-1/2 text-2xs whitespace-nowrap text-muted-foreground tabular-nums"
              style={{ left: `clamp(2.5rem, ${at(mean)}%, calc(100% - 2.5rem))` }}
            >
              avg {format(mean)}
            </span>
            <span
              className="absolute top-4 h-4 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
              style={{ left: `${at(mean)}%` }}
            />
          </>
        ) : null}
        {field
          .filter((entry) => entry.id !== subjectId)
          .map((entry) => (
            <span
              key={entry.id}
              title={`${nameFor(entry.id)}: ${format(entry.value)} · ${entry.n} ${sampleUnit}`}
              className="absolute top-6 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground opacity-55"
              style={{ left: `${at(entry.value)}%` }}
            />
          ))}
        {value !== null ? (
          <span
            title={`${subject}: ${format(value)} · ${position.n} ${sampleUnit}`}
            className="absolute top-6 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--accent)]"
            style={{ left: `${at(value)}%` }}
          />
        ) : null}
        {spread ? (
          <span className="absolute inset-x-0 top-8 flex justify-between text-2xs text-[var(--faint)] tabular-nums" aria-hidden="true">
            <span className="-translate-x-2">{format(left)}</span>
            <span className="translate-x-2">{format(right)}</span>
          </span>
        ) : null}
      </span>
      <span className="contents sm:grid sm:justify-items-end sm:gap-1 sm:text-right">
        <span className="col-start-2 row-start-1 self-start text-right text-base leading-none font-bold text-[var(--text-strong)] tabular-nums sm:col-start-auto sm:row-start-auto sm:self-auto">
          {value === null ? '—' : format(value)}
        </span>
        <span className="col-span-2 row-start-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:col-span-1 sm:row-start-auto sm:grid sm:justify-items-end sm:gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {place ? `${ordinal(place)} of ${field.length}` : tooFew ? `${position.n} ${sampleUnit}, needs ${minSamples}` : 'No data'}
          </span>
          {standing ? (
            <Badge variant={standing === 'top' ? 'rank' : 'secondary'} className={cn(standing === 'close' && 'text-[var(--faint)]')}>
              {standingLabel(standing, better, within)}
            </Badge>
          ) : null}
        </span>
      </span>
    </li>
  )
}

/** The legend under a list of field strips, so each row does not repeat it. */
export function FieldStripKey({ subject, others, children }: { subject: string; others: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
        {subject}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-muted-foreground opacity-55" aria-hidden="true" />
        {others}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="h-3 w-0.5 rounded-full bg-muted-foreground" aria-hidden="true" />
        Average
      </span>
      <span>Right is better</span>
      {children}
    </div>
  )
}
