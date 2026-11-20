import { cn } from '../../shared/utils'

/**
 * The one Compare control for team and region rows: a labelled checkbox that
 * takes the shared selected treatment when picked. Rankings and Regions used
 * to ship two different controls for the same action. On phones the label
 * sits under the checkbox, like the tab bar captions, so the control stays
 * narrow without becoming an unlabelled square.
 */
export function CompareToggle({
  picked,
  onToggle,
  label,
  className,
}: {
  picked: boolean
  onToggle: () => void
  label: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold whitespace-nowrap select-none max-sm:h-auto max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 max-sm:py-1 max-sm:text-xs',
        picked
          ? 'border-focus bg-[var(--focus-wash)] text-text'
          : 'border-line text-muted hover:text-text',
        className,
      )}
      data-slot="compare-toggle"
      data-row-click-exclude
    >
      <input type="checkbox" className="size-3.5 accent-[var(--focus)]" checked={picked} onChange={onToggle} aria-label={`Compare ${label}`} />
      <span>Compare</span>
    </label>
  )
}
