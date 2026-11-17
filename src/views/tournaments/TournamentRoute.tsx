import { lazy, Suspense, useCallback, useRef, useState, type MouseEvent } from 'react'
import { hashForModeAndScope, readScopeFromHash, writeNavigationHash } from '../../browser/navigation'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { LoadingState } from '../../components/ui/loading'
import { currentSeasonScope } from '../../domains/rankings/read'
import { AppNavigation } from '../AppShell'
import { useTournamentReportAddress, type TournamentTab } from '../../browser/tournament-reports/navigation'
import { TournamentsView } from './routeLoading'
import { TournamentTabs } from './TournamentTabs'
import './tournaments.css'

const PostmortemView = lazy(() => import('./postmortem/PostmortemView').then(module => ({ default: module.PostmortemView })))

export function TournamentRoute() {
  const query = useTournamentReportAddress()
  const view = query.get('view')
  const postmortem = view === 'postmortem'
  const [availability, setAvailability] = useState({ hasEvent: true, swiss: false })
  const onAvailabilityChange = useCallback((hasEvent: boolean, swiss: boolean) => setAvailability({ hasEvent, swiss }), [])
  const activeView = view === 'schedule' ? 'schedule' : view === 'swiss' && availability.swiss ? 'swiss' : 'bracket'
  const current: TournamentTab = postmortem ? 'postmortem' : activeView
  const tabs: TournamentTab[] = postmortem || availability.hasEvent
    ? ['bracket', 'schedule', ...(!postmortem && availability.swiss ? ['swiss' as const] : []), 'postmortem']
    : ['postmortem']
  const scope = readScopeFromHash() ?? currentSeasonScope()
  const mainRef = useRef<HTMLElement | null>(null)
  const goHome = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    writeNavigationHash(hashForModeAndScope('rankings', scope), 'navigate')
  }, [scope])
  return <div className="tournament-route flex min-h-full flex-col">
    <a className="fixed top-[-56px] left-3 z-80 rounded-md border border-focus bg-raised px-3 py-2 focus-visible:top-3" href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView({ block: 'start' }) }}>Skip to content</a>
    <AppNavigation mode="tournaments" scope={scope} onGoHome={goHome} />
    <main id="main-content" tabIndex={-1} ref={mainRef} className="min-w-0 flex-1 pb-6 max-sm:pb-[calc(var(--tabbar-h)+24px+env(safe-area-inset-bottom))]">
      <h1 className="sr-only">Tournaments</h1>
      <TournamentTabs current={current} tabs={tabs} className="px-[var(--page-x)] pt-2" />
      <RouteErrorBoundary key={current}>
        <Suspense fallback={<LoadingState presentation="page" layout="schedule" label="Loading Tournaments" />}>
          {postmortem ? <PostmortemView /> : <TournamentsView view={activeView} onAvailabilityChange={onAvailabilityChange} />}
        </Suspense>
      </RouteErrorBoundary>
    </main>
  </div>
}
