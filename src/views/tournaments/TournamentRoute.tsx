import { lazy, Suspense, useCallback, useRef, type MouseEvent } from 'react'
import { hashForModeAndScope, readScopeFromHash, writeNavigationHash } from '../../browser/navigation'
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary'
import { LoadingState } from '../../components/ui/loading'
import { currentSeasonScope } from '../../domains/rankings/read'
import { AppNavigation, ModeHeader } from '../AppShell'
import { useTournamentReportAddress, type TournamentTab } from '../../browser/tournament-reports/navigation'
import { TournamentsView } from './routeLoading'
import { TournamentTabs } from './TournamentTabs'
import './tournaments.css'

const PostmortemView = lazy(() => import('./postmortem/PostmortemView').then(module => ({ default: module.PostmortemView })))

export function TournamentRoute() {
  const query = useTournamentReportAddress()
  const view = query.get('view')
  const postmortem = view === 'postmortem'
  const current: TournamentTab = postmortem ? 'postmortem' : view === 'schedule' || view === 'swiss' ? view : 'bracket'
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
      <ModeHeader mode="tournaments" />
      {postmortem ? <TournamentTabs current="postmortem" tabs={['bracket', 'schedule', 'postmortem']} className="px-[var(--page-x)] pt-2" /> : null}
      <RouteErrorBoundary key={postmortem ? 'postmortem' : 'tournaments'}>
        <Suspense fallback={<>
          {postmortem ? null : <TournamentTabs current={current} tabs={['bracket', 'schedule', 'postmortem']} className="px-[var(--page-x)] pt-2" />}
          <LoadingState presentation="page" layout="schedule" label="Loading Tournaments" />
        </>}>
          {postmortem ? <PostmortemView /> : <TournamentsView />}
        </Suspense>
      </RouteErrorBoundary>
    </main>
  </div>
}
