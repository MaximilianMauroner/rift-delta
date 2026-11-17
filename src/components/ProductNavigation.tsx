import { buttonVariants } from './ui/button'

/** The way back from the DPS lab. Public routes carry this in their own header. */
export function ProductNavigation() {
  return <nav aria-label="rift-delta" className="flex flex-wrap items-center gap-2 border-b border-line bg-ground px-4 py-2">
    <a href="/" className="mr-auto font-semibold text-text no-underline">rift-delta</a>
    <a href="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Rankings</a>
    <a href="/lab" aria-current="page" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>DPS lab</a>
  </nav>
}
