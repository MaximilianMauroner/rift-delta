import { currentHashQuery, writeNavigationHash } from '../../browser/navigation'
import { tournamentTabAddress, useTournamentReportAddress, type TournamentTab } from '../../browser/tournament-reports/navigation'
import { buttonVariants } from '../../components/ui/button'
import { cn } from '../../shared/utils'

const LABELS: Record<TournamentTab, string> = { bracket: 'Bracket', schedule: 'Schedule', swiss: 'Swiss preview', postmortem: 'Team reports' }

/** One row for every tournament view. The address is read again at click time, so a scenario written since render is kept. */
export function TournamentTabs({ current, tabs, className }: { current: TournamentTab; tabs: readonly TournamentTab[]; className?: string }) {
  const query = useTournamentReportAddress()
  return <nav aria-label="Tournament views" className={cn('flex flex-wrap gap-1 sm:gap-1.5', className)}>
    {tabs.map((tab) => <a key={tab} href={tournamentTabAddress(tab, current, query)} aria-current={tab === current ? 'page' : undefined}
      className={buttonVariants({ variant: 'tab', size: 'tab', className: 'max-sm:px-2' })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        writeNavigationHash(tournamentTabAddress(tab, current, currentHashQuery()), 'navigate')
      }}>{LABELS[tab]}</a>)}
  </nav>
}
