import type { SnapshotCheckpointOption } from '../../domains/rankings/types'
import { rankingScopePeriod } from '../../domains/rankings/read'
import { formatDate } from '../../shared/display'
import { Segmented, type SegmentedOption } from '../../components/ui'

export type PendingCheckpoint = { id: string; label: string }

const FULL_YEAR = 'full-year'

/**
 * Season and split scope, as one row plus one sentence.
 *
 * Season and split are segmented controls, so exactly one segment is filled
 * and that fill is the selection. The sentence beside them gives the selected
 * window, how far an ongoing split has reached, the date of the latest rated
 * match and the publication date. Nothing here hides behind a hover.
 */
export function ScopeBar({
  seasons,
  activeSeason,
  checkpoints,
  activeCheckpoint,
  pendingCheckpoint,
  throughDate,
  scopeThroughDate,
  publishedAt,
  onSelectSeason,
  onSelectCheckpoint,
  onIntent,
}: {
  seasons: string[]
  activeSeason?: string
  checkpoints: SnapshotCheckpointOption[]
  activeCheckpoint?: string
  pendingCheckpoint?: PendingCheckpoint
  /** Latest rated match overall, used for the ongoing split's progress. */
  throughDate?: string
  /** Latest rated match inside the selected scope. */
  scopeThroughDate?: string
  publishedAt?: string
  onSelectSeason: (season: string) => void
  onSelectCheckpoint: (checkpointId: string | undefined) => void
  onIntent?: (checkpointId: string | undefined) => void
}) {
  const season = activeSeason ?? 'All'
  const showSplits = season !== 'All' && checkpoints.length > 0
  const active = checkpoints.find((entry) => entry.id === activeCheckpoint)
  const progress = active?.ongoing ? checkpointProgress(active, throughDate) : undefined
  const options: SegmentedOption<string>[] = [
    { value: FULL_YEAR, label: 'Full year' },
    ...checkpoints.map((checkpoint) => ({
      value: checkpoint.id,
      label: checkpoint.label,
      marker: checkpoint.ongoing ? <LiveMarker /> : undefined,
    })),
    ...(pendingCheckpoint ? [{ value: pendingCheckpoint.id, label: pendingCheckpoint.label, title: `${pendingCheckpoint.label} has not started yet.`, disabled: true }] : []),
  ]
  const selection = season === 'All' ? 'all seasons' : active ? `${season}, ${active.label}` : `${season}, full year`

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-[var(--page-x)] pt-1 pb-3 max-sm:pb-2.5" role="group" aria-label="Ranking period">
      <Segmented
        value={season}
        options={seasons.map((value) => ({ value, label: value === 'All' ? 'All seasons' : value }))}
        onChange={onSelectSeason}
        ariaLabel="Season"
      />
      {showSplits ? (
        <Segmented
          value={activeCheckpoint ?? FULL_YEAR}
          options={options}
          onChange={(value) => onSelectCheckpoint(value === FULL_YEAR ? undefined : value)}
          onIntent={onIntent ? (value) => onIntent(value === FULL_YEAR ? undefined : value) : undefined}
          ariaLabel={`${season} period`}
        />
      ) : null}
      <p className="text-sm text-muted" aria-live="polite">
        <span className="sr-only">Showing {selection}. </span>
        {season === 'All' ? null : <>{rankingScopePeriod(season, active)}{progress === undefined ? '. ' : `, ${progress}% of its dates played. `}</>}
        {scopeThroughDate ? <>Results through <b className="font-semibold text-text">{formatDate(scopeThroughDate)}</b>.</> : null}
        {publishedAt ? <span className="max-sm:hidden"> Updated {formatDate(publishedAt)}.</span> : null}
      </p>
    </div>
  )
}

function LiveMarker() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="size-1.5 rounded-full bg-text" aria-hidden="true" />
      <span className="max-sm:sr-only">live</span>
    </span>
  )
}

/**
 * How far through an ongoing split the published data reaches, as a percentage
 * clamped to 0-100. Returns undefined when the dates cannot support an honest
 * answer, so the caller leaves the progress out.
 */
function checkpointProgress(checkpoint: SnapshotCheckpointOption, throughDate?: string) {
  if (!throughDate) return undefined
  const start = Date.parse(checkpoint.startDate)
  const end = Date.parse(checkpoint.endDate)
  const through = Date.parse(throughDate)
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(through)) return undefined
  if (end <= start) return undefined
  return Math.max(0, Math.min(100, Math.round(((through - start) / (end - start)) * 100)))
}
