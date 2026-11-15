import { lazy, Suspense, useCallback, useRef, type MouseEvent } from 'react'
import { hashForModeAndScope, readScopeFromHash, writeNavigationHash } from '../../browser/navigation'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { LoadingState } from '../../components/ui/loading'
import { currentSeasonScope } from '../../domains/rankings/read'
import { AppNavigation, ModeHeader } from '../AppShell'
import { tournamentSubviewAddress, useTournamentReportAddress } from '../../browser/tournament-reports/navigation'
import { buttonVariants } from '../../components/ui/button'
import { TournamentsView } from './routeLoading'

const PostmortemView = lazy(() => import('./postmortem/PostmortemView').then(module => ({ default: module.PostmortemView })))

export function TournamentRoute() {
  const query = useTournamentReportAddress()
  const postmortem = query.get('view') === 'postmortem'
  const scope = readScopeFromHash() ?? currentSeasonScope()
  const mainRef = useRef<HTMLElement | null>(null)
  const goHome = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    writeNavigationHash(hashForModeAndScope('rankings', scope), 'navigate')
  }, [scope])
  return <div className="flex min-h-full flex-col">
    <a className="fixed top-[-56px] left-3 z-80 rounded-md border border-[var(--accent-line)] bg-[var(--surface-2)] px-3 py-2 focus-visible:top-3" href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView({ block: 'start' }) }}>Skip to content</a>
    <AppNavigation mode="tournaments" scope={scope} onGoHome={goHome} />
    <main id="main-content" tabIndex={-1} ref={mainRef} className="min-w-0 flex-1 pb-6 max-sm:pb-[calc(var(--tabbar-h)+24px+env(safe-area-inset-bottom))]">
      <ModeHeader mode="tournaments" />
      <nav aria-label="Tournament views" className="flex flex-wrap gap-2 px-[var(--page-x)] pt-3">
        <a className={buttonVariants({ variant: 'tab', size: 'tab' })} href={tournamentSubviewAddress('bracket', query)} aria-current={!postmortem ? 'page' : undefined}>Schedule and bracket</a>
        <a className={buttonVariants({ variant: 'tab', size: 'tab' })} href={tournamentSubviewAddress('postmortem', query)} aria-current={postmortem ? 'page' : undefined}>Team reports</a>
      </nav>
      <RouteErrorBoundary key={postmortem ? 'postmortem' : 'tournaments'}>
        <Suspense fallback={<LoadingState presentation="page" layout="schedule" label="Loading Tournaments" />}>
          {postmortem ? <PostmortemView /> : <TournamentsView />}
        </Suspense>
      </RouteErrorBoundary>
    </main>
  </div>
}
