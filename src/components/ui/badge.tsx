import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../shared/utils'

/**
 * Every small labelled chip in the product. If a chip needs styling that no
 * variant here provides, add the variant rather than overriding one at the call
 * site: four distinct chip treatments used to be built inline because this file
 * only offered three.
 */
const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        secondary: 'border-line bg-raised text-muted',
        warning: 'border-line bg-raised text-text',
        rank: 'border-line bg-raised font-bold text-text',
        /* Competition and event labels. */
        event: 'border-line text-muted',
        /* Match outcome. Always carries its W or L letter. */
        win: 'border-transparent bg-[var(--up-wash)] text-up',
        loss: 'border-transparent bg-[var(--down-wash)] text-down',
        /* A series in progress. Always carries the word Live. */
        live: 'border-text text-text',
        /* Hypothetical scenario content, never a live result. */
        preview: 'border-dashed border-muted text-muted',
      },
      size: {
        default: '',
        /* Square tier and result marks, sized to align with a table row. */
        mark: 'grid size-[var(--mark-size,22px)] place-items-center px-0 py-0 text-center [--mark-size:22px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
)

function Badge({ className, variant, size, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, size, className }))} {...props} />
}

export { Badge }
