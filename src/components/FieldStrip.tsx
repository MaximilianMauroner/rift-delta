import type { FieldPosition } from '../domains/rankings/field-statistics'

export function FieldStrip({
  label,
  subject,
  subjectId,
  position,
  format,
  nameFor,
  detail,
  minSamples,
  sampleUnit = 'games',
}: {
  label: string
  subject: string
  subjectId: string
  position: FieldPosition
  format: (value: number) => string
  nameFor: (id: string) => string
  detail?: string
  minSamples: number
  sampleUnit?: string
}) {
  const values = position.field.map((entry) => entry.value)
  const low = Math.min(...values, position.value ?? Infinity)
  const high = Math.max(...values, position.value ?? -Infinity)
  const at = (value: number) => (high === low ? 50 : ((value - low) / (high - low)) * 100)
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)_7.5rem]">
      <span className="min-w-0 text-xs font-semibold">{label}</span>
      <span
        className="relative col-span-2 row-start-2 block h-5 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1"
        role="img"
        aria-label={
          position.value === null
            ? `${label} unavailable for ${subject}`
            : `${subject} ${format(position.value)} against ${position.field.length} in the field`
        }
      >
        <span className="absolute inset-x-0 top-1/2 border-t border-border" />
        {position.mean !== null && Number.isFinite(low) ? (
          <span className="absolute inset-y-0.5 w-px bg-[var(--line-strong)]" style={{ left: `${at(position.mean)}%` }} />
        ) : null}
        {position.field
          .filter((entry) => entry.id !== subjectId)
          .map((entry) => (
            <span
              key={entry.id}
              title={`${nameFor(entry.id)} ${format(entry.value)} · ${entry.n} ${sampleUnit}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground opacity-60"
              style={{ left: `${at(entry.value)}%` }}
            />
          ))}
        {position.value !== null ? (
          <span
            title={detail ?? `${position.n} ${sampleUnit}`}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--accent)]"
            style={{ left: `${at(position.value)}%` }}
          />
        ) : null}
      </span>
      <span className="grid justify-items-end text-right">
        <span className="text-sm font-bold tabular-nums">{position.value === null ? '—' : format(position.value)}</span>
        <span className="text-2xs text-muted-foreground tabular-nums">
          {position.z === null
            ? position.value !== null && position.n < minSamples
              ? `${position.n} ${sampleUnit}, too few`
              : 'No field spread'
            : `${position.z >= 0 ? '+' : '−'}${Math.abs(position.z).toFixed(1)}σ · p${position.percentile!.toFixed(0)}`}
        </span>
        {position.band ? <span className="text-2xs text-muted-foreground">{position.band}</span> : null}
      </span>
    </li>
  )
}
