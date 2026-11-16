import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { fieldPlace, type FieldPosition, type FieldStanding } from '../domains/rankings/field-statistics'
import { cn } from '../shared/utils'
import { ordinal, standingLabel } from './fieldFormat'

/** The colour of a place, so the place itself says how good it is. */
const STANDING_TONE: Record<FieldStanding, string> = {
  top: 'text-[var(--rank-gold)]',
  above: 'text-[var(--win)]',
  close: 'text-muted-foreground',
  below: 'text-[var(--loss)]',
}

/**
 * One measure of one subject against its field. The place leads, coloured by how
 * good it is; the name and value follow, and the strip shows where every entry
 * sits. Better is always to the right, so a measure where lower is better runs
 * backwards. A style measure (`better` is null) has no place.
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
  note,
}: {
  label: string
  hint?: string
  subject: string
  subjectId: string
  position: FieldPosition
  /** `scale` is the largest size in the field, so one strip shares one number of decimals. */
  format: (value: number, scale: number) => string
  nameFor: (id: string) => string
  /** Completes "Best …", such as "in LPL" or "at Worlds". */
  within: string
  minSamples: number
  sampleUnit?: string
  /** A caveat next to the value, such as games the average skips. */
  note?: string
}) {
  const [explained, setExplained] = useState(false)
  const hintId = useId()
  const { value, field, mean, place, better, standing } = position
  const values = field.map((entry) => entry.value)
  const low = Math.min(...values, value ?? Infinity)
  const high = Math.max(...values, value ?? -Infinity)
  const spread = Number.isFinite(low) && high > low
  const scale = Number.isFinite(low) ? Math.max(Math.abs(low), Math.abs(high)) : Math.abs(value ?? 0)
  const show = (point: number) => format(point, scale)
  const at = (point: number) => {
    const share = spread ? (point - low) / (high - low) : 0.5
    return (better === 'lower' ? 1 - share : share) * 100
  }
  const [left, right] = better === 'lower' ? [high, low] : [low, high]
  const tooFew = value !== null && place === null
  const ranked = better !== null
  const entries: TrackEntry[] = [
    ...field.map((entry) => ({
      ...entry,
      name: entry.id === subjectId ? subject : nameFor(entry.id),
      place: ranked ? fieldPlace(field, entry.value, better) : null,
    })),
    ...(tooFew ? [{ id: subjectId, value, n: position.n, name: subject, place: null }] : []),
  ].sort((a, b) => at(a.value) - at(b.value))
  const shown = ranked ? place : null
  const verdict =
    value === null ? `No data for ${subject}`
    : tooFew ? `${position.n} ${sampleUnit}, needs ${minSamples} to count`
    : !ranked ? 'A style, not better or worse'
    : standing ? standingLabel(standing, better, within)
    : ''
  const summary =
    value === null
      ? `${label}: no data for ${subject}.`
      : `${label}: ${subject} ${show(value)}${shown ? `, ${ordinal(shown)} of ${field.length}` : ''}${
          mean !== null ? `. Average ${show(mean)}` : ''
        }${spread ? `. Range ${show(low)} to ${show(high)}` : ''}. ${verdict}.`
  return (
    <li className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] gap-x-3 py-3">
      <span className="grid content-start justify-items-center pt-0.5 text-center leading-none" title={verdict}>
        <span className={cn('text-xl font-extrabold tabular-nums', shown && standing ? STANDING_TONE[standing] : 'text-[var(--faint)]')}>
          {shown ? ordinal(shown) : '–'}
        </span>
        <span className="mt-1 text-2xs text-muted-foreground">
          {shown ? `of ${field.length}` : value === null ? 'no data' : tooFew ? `${position.n} of ${minSamples}` : 'style'}
        </span>
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          {hint ? (
            <button
              type="button"
              className="min-w-0 cursor-help rounded-sm text-left text-sm font-semibold text-[var(--text-strong)] underline decoration-[var(--line-strong)] decoration-dotted underline-offset-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              title={hint}
              aria-expanded={explained}
              aria-controls={hintId}
              onClick={() => setExplained(!explained)}
            >
              {label}
            </button>
          ) : (
            <span className="min-w-0 text-sm font-semibold text-[var(--text-strong)]">{label}</span>
          )}
          <span className="flex shrink-0 items-baseline gap-2">
            {note ? <span className="text-2xs text-muted-foreground">{note}</span> : null}
            <span className="text-base leading-none font-bold text-[var(--text-strong)] tabular-nums">
              {value === null ? '—' : show(value)}
            </span>
          </span>
        </span>
        {hint ? (
          <span id={hintId} className={explained ? 'text-xs text-muted-foreground' : 'sr-only'}>
            {hint}
          </span>
        ) : null}
        <FieldTrack
          summary={summary}
          describedBy={hint ? hintId : undefined}
          entries={entries}
          subjectId={subjectId}
          mean={spread ? mean : null}
          ends={spread ? [show(left), show(right)] : null}
          at={at}
          format={show}
          sampleUnit={sampleUnit}
        />
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
  describedBy,
  entries,
  subjectId,
  mean,
  ends,
  at,
  format,
  sampleUnit,
}: {
  summary: string
  describedBy?: string
  entries: TrackEntry[]
  subjectId: string
  mean: number | null
  ends: [string, string] | null
  at: (value: number) => number
  format: (value: number) => string
  sampleUnit: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const subjectIndex = Math.max(0, entries.findIndex((entry) => entry.id === subjectId))
  const current = active === null ? null : entries[active]
  const selected = Math.min(active ?? subjectIndex, entries.length - 1)
  const stack = current
    ? entries
        .filter((entry) => Math.abs(at(entry.value) - at(current.value)) < STACK_DISTANCE)
        .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
    : []
  const describe = (entry: TrackEntry) =>
    `${entry.place ? `${ordinal(entry.place)}, ` : ''}${entry.name}, ${format(entry.value)}, ${entry.n} ${sampleUnit}`
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
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(last, selected + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, selected - 1)
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
      className="relative mx-1.5 block h-8 min-w-0 cursor-crosshair touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      {...(entries.length
        ? {
            role: 'slider',
            tabIndex: 0,
            'aria-valuemin': 1,
            'aria-valuemax': entries.length,
            'aria-valuenow': selected + 1,
            'aria-valuetext': describe(entries[selected]!),
          }
        : { role: 'img' })}
      aria-label={summary}
      aria-describedby={describedBy}
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
      <span className="absolute inset-x-0 top-3 border-t border-[var(--line-strong)]" />
      {mean !== null ? (
        <span
          className="absolute top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
          style={{ left: `${at(mean)}%` }}
        />
      ) : null}
      {current ? (
        <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-[var(--focus)] opacity-60" style={{ left: `${at(current.value)}%` }} />
      ) : null}
      {entries.map((entry) =>
        entry.id === subjectId ? null : (
          <span
            key={entry.id}
            className={cn(
              'absolute top-3 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground opacity-55',
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
            className="absolute top-3 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--accent)]"
            style={{ left: `${at(entry.value)}%` }}
          />
        ))}
      {ends ? (
        <span className="absolute inset-x-0 top-5 flex justify-between text-2xs text-[var(--faint)] tabular-nums" aria-hidden="true">
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
      {children}
    </div>
  )
}
