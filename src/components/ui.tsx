import { AlertTriangle } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { leagueColor } from '../shared/teamColor'
import { Button } from './ui/button'
import { cn } from '../shared/utils'
import { Alert } from './ui/alert'
import { Badge } from './ui/badge'
import { tableHeadClassName } from './ui/table'

export function RegionBadge({ region, size = 'md' }: { region: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('league-label', size === 'sm' && 'text-xs')} style={{ '--league-color': leagueColor(region) } as CSSProperties}>
      <span className="league-dot" aria-hidden="true" />
      {region.toUpperCase()}
    </span>
  )
}

export function FormDots({ form }: { form?: string[] }) {
  const recent = (form ?? []).slice(-5)
  if (recent.length === 0) return <span className="text-muted">—</span>
  return (
    <span className="inline-flex gap-1" aria-label={`Recent form, oldest to latest: ${recent.join(', ')}. Latest: ${recent.at(-1)}.`}>
      {recent.map((result, index) => {
        const normalized = result.toLowerCase()
        const tone = normalized === 'w' ? 'w' : normalized === 't' ? 't' : 'l'
        const label = tone.toUpperCase()
        return (
          <i
            key={`${result}-${index}`}
            className={cn(
              'grid size-[17px] place-items-center text-xs font-bold not-italic',
              tone === 'w' && 'rounded-[3px] bg-[var(--up-wash)] text-up',
              tone === 'l' && 'rounded-[3px] bg-[var(--down-wash)] text-down',
              tone === 't' && 'bg-line text-muted',
              index === recent.length - 1 && 'underline decoration-2 underline-offset-2',
            )}
            aria-hidden="true"
          >
            {label}
          </i>
        )
      })}
    </span>
  )
}

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  title?: string
  disabled?: boolean
  /** Small trailing mark, such as the live dot on an ongoing split. */
  marker?: ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  onIntent,
  ariaLabel = 'Filter options',
  className,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  /** Hover or focus on an option, for prefetching what it would show. */
  onIntent?: (value: T) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-[var(--control-h)] max-w-full items-stretch overflow-hidden rounded-md border border-line bg-surface max-sm:w-full',
        className,
      )}
    >
      {options.map((option, index) => (
        <Button
          type="button"
          key={option.value}
          variant="tab"
          size="sm"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          onPointerEnter={onIntent ? () => onIntent(option.value) : undefined}
          onFocus={onIntent ? () => onIntent(option.value) : undefined}
          className={cn(
            'h-auto min-h-0 flex-1 gap-1.5 rounded-none border-y-0 border-r-0 border-l border-l-line px-3 text-sm whitespace-nowrap max-sm:min-w-0 max-sm:px-2',
            'aria-pressed:border-l-line aria-pressed:shadow-[inset_0_-2px_0_var(--focus)] disabled:opacity-60',
            index === 0 && 'border-l-0',
          )}
        >
          {option.label}
          {option.marker}
        </Button>
      ))}
    </div>
  )
}

export function DataState({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode
  title: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-8 text-center text-muted sm:py-10 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-text [&>p]:max-w-[46ch] [&>p]:text-sm [&>p]:leading-relaxed">
      <span className="mb-1 grid size-10 place-items-center border border-line bg-raised text-muted" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}

export function CountBadge({ children, variant = 'secondary' }: { children: ReactNode; variant?: 'secondary' | 'warning' }) {
  return (
    <Badge variant={variant} className="w-fit justify-self-start text-xs text-muted tabular-nums">
      {children}
    </Badge>
  )
}

export function SortHeader({
  label,
  columnKey,
  sortKey,
  descending,
  onSort,
  align,
  className,
}: {
  label: string
  columnKey: string
  sortKey: string
  descending: boolean
  onSort: (key: string) => void
  align?: 'right' | 'center'
  className?: string
}) {
  const active = sortKey === columnKey
  function activateSort() {
    onSort(columnKey)
  }

  return (
    <th
      scope="col"
      className={cn(
        tableHeadClassName,
        'select-none p-0!',
        active && 'text-focus',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'min-h-10 w-full cursor-pointer justify-start gap-1 border-0 bg-transparent px-3.5 py-3 text-xs font-[number:600] text-[inherit] hover:bg-transparent hover:text-text focus-visible:rounded-none focus-visible:text-text focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-focus max-sm:px-1 max-sm:leading-[1.15] max-sm:whitespace-normal',
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
        )}
        onClick={activateSort}
      >
        <span>{label}</span>
        {active ? <span aria-hidden="true">{descending ? '↓' : '↑'}</span> : null}
      </Button>
    </th>
  )
}

export function TierChip({ tier }: { tier: 'S' | 'A' | 'B' | 'C' }) {
  return <span className="tier-chip inline-grid h-[22px] min-w-6 place-items-center rounded-md px-1 text-xs font-bold" aria-label={`${tier} tier`} style={{ '--tier-color': `var(--tier-${tier.toLowerCase()})` } as CSSProperties}>{tier}</span>
}

export function WarningNote({ children }: { children: ReactNode }) {
  return <Alert variant="warning"><AlertTriangle size={16} aria-hidden="true" /><span>{children}</span></Alert>
}
