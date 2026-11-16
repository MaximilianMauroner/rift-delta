import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { fieldPlace, type FieldPosition } from '../domains/rankings/field-statistics'
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
  const entries: TrackEntry[] = [
    ...field.map((entry) => ({
      ...entry,
      name: entry.id === subjectId ? subject : nameFor(entry.id),
      place: fieldPlace(field, entry.value, better),
    })),
    ...(tooFew ? [{ id: subjectId, value, n: position.n, name: subject, place: null }] : []),
  ].sort((a, b) => at(a.value) - at(b.value))
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
      <FieldTrack
        summary={summary}
        entries={entries}
        subjectId={subjectId}
        mean={spread ? mean : null}
        ends={spread ? [format(left), format(right)] : null}
        at={at}
        format={format}
        sampleUnit={sampleUnit}
      />
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

type TrackEntry = { id: string; value: number; n: number; name: string; place: number | null }

/** Entries closer than this, in percent of the strip, read as one stack of dots. */
const STACK_DISTANCE = 3

/**
 * The strip itself. Pointer, finger or arrow keys move along it and snap to the
 * nearest dot, and a card names that entry and every entry stacked with it.
 */
function FieldTrack({
  summary,
  entries,
  subjectId,
  mean,
  ends,
  at,
  format,
  sampleUnit,
}: {
  summary: string
  entries: TrackEntry[]
  subjectId: string
  mean: number | null
  ends: [string, string] | null
  at: (value: number) => number
  format: (value: number) => string
  sampleUnit: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const current = active === null ? null : entries[active]
  const stack = current
    ? entries
        .filter((entry) => Math.abs(at(entry.value) - at(current.value)) < STACK_DISTANCE)
        .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
    : []
  const describe = (entry: TrackEntry) =>
    `${entry.place ? `${ordinal(entry.place)}, ` : 'Not ranked, '}${entry.name}, ${format(entry.value)}, ${entry.n} ${sampleUnit}`
  const nearest = (event: PointerEvent<HTMLSpanElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * 100
    let best = 0
    entries.forEach((entry, index) => {
      if (Math.abs(at(entry.value) - x) < Math.abs(at(entries[best]!.value) - x)) best = index
    })
    setActive(best)
  }
  const step = (event: KeyboardEvent<HTMLSpanElement>) => {
    const last = entries.length - 1
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(last, (active ?? -1) + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, (active ?? last + 1) - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : undefined
    if (event.key === 'Escape') setActive(null)
    if (next === undefined) return
    event.preventDefault()
    setActive(next)
  }
  return (
    <span
      className="relative col-span-2 row-start-2 mx-2 block h-12 min-w-0 cursor-crosshair touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus)] sm:col-span-1 sm:col-start-2 sm:row-start-1"
      role="slider"
      tabIndex={entries.length ? 0 : -1}
      aria-label={summary}
      aria-valuemin={1}
      aria-valuemax={entries.length}
      aria-valuenow={active === null ? undefined : active + 1}
      aria-valuetext={current ? describe(current) : 'Use the arrow keys to name each entry'}
      onPointerDown={nearest}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' || event.buttons) nearest(event)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setActive(null)
      }}
      onKeyDown={step}
      onBlur={() => setActive(null)}
    >
      <span className="absolute inset-x-0 top-6 border-t border-[var(--line-strong)]" />
      {mean !== null ? (
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
      {current ? (
        <span className="absolute inset-y-1 w-px -translate-x-1/2 bg-[var(--focus)] opacity-60" style={{ left: `${at(current.value)}%` }} />
      ) : null}
      {entries.map((entry) =>
        entry.id === subjectId ? null : (
          <span
            key={entry.id}
            className={cn(
              'absolute top-6 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground opacity-55',
              stack.includes(entry) && 'size-2.5 bg-[var(--text-strong)] opacity-100',
            )}
            style={{ left: `${at(entry.value)}%` }}
          />
        ),
      )}
      {entries
        .filter((entry) => entry.id === subjectId)
        .map((entry) => (
          <span
            key={entry.id}
            className="absolute top-6 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--accent)]"
            style={{ left: `${at(entry.value)}%` }}
          />
        ))}
      {ends ? (
        <span className="absolute inset-x-0 top-8 flex justify-between text-2xs text-[var(--faint)] tabular-nums" aria-hidden="true">
          <span className="-translate-x-2">{ends[0]}</span>
          <span className="translate-x-2">{ends[1]}</span>
        </span>
      ) : null}
      {current ? (
        <span
          className="pointer-events-none absolute bottom-full z-20 mb-1 grid w-max max-w-56 -translate-x-1/2 gap-0.5 rounded-md border border-[var(--line-strong)] bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-pop)]"
          style={{ left: `clamp(5rem, ${at(current.value)}%, calc(100% - 5rem))` }}
          aria-hidden="true"
        >
          {stack.slice(0, 5).map((entry) => (
            <span key={entry.id} className="flex items-baseline gap-2 tabular-nums">
              <span className="w-8 shrink-0 text-muted-foreground">{entry.place ? ordinal(entry.place) : '–'}</span>
              <span className={cn('min-w-0 flex-1 truncate font-semibold', entry.id === subjectId && 'text-[var(--accent)]')}>{entry.name}</span>
              <span className="font-semibold">{format(entry.value)}</span>
            </span>
          ))}
          {stack.length > 5 ? <span className="text-muted-foreground">and {stack.length - 5} more</span> : null}
          {stack.length === 1 ? <span className="text-2xs text-muted-foreground">{current.n} {sampleUnit}</span> : null}
        </span>
      ) : null}
    </span>
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
      <span>Point at or drag along a strip to see who each dot is.</span>
      {children}
    </div>
  )
}
