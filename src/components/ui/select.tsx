import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../shared/utils'

function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className="relative inline-flex min-w-0">
      <select
        data-slot="select"
        className={cn(
          'h-[var(--control-h)] min-w-[120px] max-w-[260px] appearance-none rounded-md border border-line bg-raised px-3 py-1 pr-8 text-sm text-text transition-colors duration-150 hover:border-muted focus-visible:border-focus disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
    </span>
  )
}

export { Select }
