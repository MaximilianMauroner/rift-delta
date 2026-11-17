import { AlertTriangle, FlaskConical, RefreshCw, Search, X } from 'lucide-react'
import { type MouseEvent, type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { hashForModeAndScope } from '../browser/navigation'
import type { PublicSnapshotState } from '../browser/rankings/usePublicArtifacts'
import {
  scopeLabel
} from '../browser/rankings/usePublicArtifacts'
import { compatibleMatchEvents } from '../domains/rankings/read'
import type { PublicMatchHistorySeriesRef } from '../domains/rankings/types'
import { DataState } from '../components/ui'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { LoadingState, type PageLayout } from '../components/ui/loading'
import { leagueColor } from '../shared/teamColor'
import { preloadView } from './rankings/routeLoading'
import { MODE_TITLES, MODES, PAGE_LAYOUTS, type Mode } from './shellConfig'

export function ManifestRouteShell({
  mode,
  scope,
  onGoHome,
  error,
}: {
  mode: Mode
  scope: string
  onGoHome?: (event: MouseEvent<HTMLAnchorElement>) => void
  error?: string
}) {
  return (
    <div className="flex min-h-full flex-col">
      <a className="fixed top-[-56px] left-3 z-80 rounded-md border border-focus bg-raised px-3 py-2 text-sm font-semibold text-text no-underline focus-visible:top-3" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView({ block: 'start' }) }}>Skip to content</a>
      <AppNavigation mode={mode} scope={scope} onGoHome={onGoHome} />
      <main id="main-content" className="flex min-w-0 flex-col" tabIndex={-1}>
        <ModeHeader mode={mode} />
        {mode !== 'tournaments' && mode !== 'profiles' && mode !== 'scouting' ? <div className="flex min-h-[53px] items-center border-b border-line px-[var(--page-x)] pb-2 text-sm text-muted max-sm:min-h-[86px]">
          Requested scope: <b className="ml-2 text-text">{scopeLabel(scope)}</b>
        </div> : null}
        {error ? (
          <section className="px-[var(--page-x)] pt-6">
            <Card role="alert">
              <DataState
                icon={<AlertTriangle size={26} aria-hidden="true" />}
                title="Rankings could not be loaded"
                action={
                  <Button type="button" variant="default" onClick={() => window.location.reload()}>
                    <RefreshCw size={15} aria-hidden="true" />
                    Retry
                  </Button>
                }
              >
                {error}
              </DataState>
            </Card>
          </section>
        ) : (
          <LoadingState presentation="page" layout={PAGE_LAYOUTS[mode]} label={`Loading ${MODE_TITLES[mode].title}`} />
        )}
      </main>
    </div>
  )
}

/**
 * Title and the one explanatory line, rendered in the same slot for every view
 * so no view can ship without one.
 */
export function ModeHeader({ mode }: { mode: Mode }) {
  return (
    <div className="app-mode-header">
      <h1>{MODE_TITLES[mode].title}</h1>
      <p>{MODE_TITLES[mode].intro}</p>
    </div>
  )
}

export function AppNavigation({
  mode,
  scope,
  onGoHome,
  search,
  onSearch,
  searchRef,
  onIntent,
  leagues = LEAGUES,
  leagueEvents,
}: {
  mode: Mode | 'lab'
  scope: string
  onGoHome?: (event: MouseEvent<HTMLAnchorElement>) => void
  search?: string
  onSearch?: (value: string) => void
  searchRef?: RefObject<HTMLInputElement | null>
  onIntent?: (mode: Mode) => void
  leagues?: readonly string[]
  leagueEvents?: readonly Pick<PublicMatchHistorySeriesRef, 'league' | 'event'>[]
}) {
  const ownRef = useRef<HTMLInputElement | null>(null)
  const inputRef = searchRef ?? ownRef
  const [searchOpen, setSearchOpen] = useState(() => {
    if (!onSearch || window.innerWidth >= 1024) return false
    return new URLSearchParams(window.location.hash.split('?', 2)[1]).get('find') === 'team'
  })
  const hash = useSyncExternalStore(subscribeToAddress, () => window.location.hash, () => '')
  const query = new URLSearchParams(hash.split('?', 2)[1] ?? '')
  const filterKey = mode === 'matches' ? 'league' : 'region'
  const filtersLeague = mode === 'rankings' || mode === 'players' || mode === 'matches'
  const activeLeague = filtersLeague ? query.get(filterKey) ?? 'All' : undefined
  const home = hashForModeAndScope('rankings', scope)
  const publicHref = (hash: string) => mode === 'lab' ? `/${hash}` : hash

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [inputRef, searchOpen])

  function openSearch() {
    if (onSearch) setSearchOpen(true)
    else if (searchRef?.current) searchRef.current.focus()
    else window.location.assign(`/${home}&find=team`)
  }

  useEffect(() => {
    if (onSearch && new URLSearchParams(window.location.hash.split('?', 2)[1]).get('find') === 'team') {
      inputRef.current?.focus()
    }
  }, [inputRef, onSearch])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!onSearch || window.innerWidth >= 1024 || event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSearch])

  function closeSearch() {
    if (search) onSearch?.('')
    setSearchOpen(false)
  }

  function leagueHref(league: string) {
    const target = filtersLeague ? mode : 'rankings'
    const next = filtersLeague ? new URLSearchParams(query) : new URLSearchParams({ scope })
    const key = target === 'matches' ? 'league' : 'region'
    for (const key of ['page', 'teamDetail', 'compare', 'profile']) next.delete(key)
    const event = next.get('event')
    if (target === 'matches' && event && leagueEvents && !compatibleMatchEvents(leagueEvents, league).includes(event)) next.delete('event')
    if (league === 'All') next.delete(key)
    else next.set(key, league)
    return publicHref(`#${target}?${next.toString()}`)
  }

  const availableLeagues = leagueEvents?.map((entry) => entry.league) ?? leagues
  const otherLeagues = [...new Set(availableLeagues)].filter((league) => league !== 'All' && !LEAGUES.includes(league)).sort()
  const leagueLink = (league: string) => (
    <a key={league} href={leagueHref(league)} aria-current={activeLeague === league ? 'true' : undefined}>
      <span className="league-dot" style={{ background: leagueColor(league) }} aria-hidden="true" />
      {league === 'All' ? 'All leagues' : league}
    </a>
  )

  const viewLinks = MODES.map((entry) => {
    const Icon = entry.icon
    return (
      <a
        key={entry.id}
        href={publicHref(hashForModeAndScope(entry.id, scope))}
        className="app-view-link"
        aria-current={mode === entry.id ? 'page' : undefined}
        onPointerEnter={() => (onIntent ?? preloadView)(entry.id)}
        onFocus={() => (onIntent ?? preloadView)(entry.id)}
        onTouchStart={() => (onIntent ?? preloadView)(entry.id)}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="app-view-label">{entry.label}</span>
      </a>
    )
  })

  const searchControl = onSearch ? (
    <label className="app-search">
      <span className="sr-only">Find a team</span>
      <Search size={15} aria-hidden="true" />
      <Input ref={inputRef} type="search" value={search ?? ''} placeholder="Find a team" aria-keyshortcuts="/"
        onChange={(event) => onSearch(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') closeSearch() }} />
    </label>
  ) : <Button variant="outline" className="app-search-button" onClick={openSearch}><Search aria-hidden="true" /><span>Search</span></Button>

  const wordmark = <a className="app-wordmark" aria-label="rift-delta" href={publicHref(home)} onClick={onGoHome}>rift<span aria-hidden="true">Δ</span>delta</a>
  return (
    <>
      <header className="app-phone-header">
        {wordmark}
        <div className="app-phone-actions">
          <a href="/lab" aria-current={mode === 'lab' ? 'page' : undefined}>DPS lab</a>
          <Button variant="ghost" size="icon" aria-label="Search" onClick={openSearch}><Search aria-hidden="true" /></Button>
        </div>
      </header>
      <aside className="app-sidebar" aria-label="Site sidebar">
        {wordmark}
        <div className="app-sidebar-search">{!searchOpen ? searchControl : null}</div>
        <Button variant="ghost" size="icon" className="app-rail-search" aria-label="Search" onClick={openSearch}><Search aria-hidden="true" /></Button>
        <nav aria-label="Primary">{viewLinks}</nav>
        <nav className="app-leagues" aria-label={filtersLeague ? 'League filter' : 'Leagues'}>
          <span className="app-leagues-heading">Leagues</span>
          {['All', ...LEAGUES].map(leagueLink)}
          {otherLeagues.length > 0 ? (
            <details open={otherLeagues.includes(activeLeague ?? '')}>
              <summary>More leagues</summary>
              {otherLeagues.map(leagueLink)}
            </details>
          ) : null}
        </nav>
        <a href="/lab" className="app-view-link app-lab-link" aria-current={mode === 'lab' ? 'page' : undefined}>
          <FlaskConical size={18} aria-hidden="true" /><span className="app-view-label">DPS lab</span>
        </a>
      </aside>
      {searchOpen && onSearch ? <div className="app-search-overlay">{searchControl}<Button variant="ghost" size="icon" aria-label="Close search" onClick={closeSearch}><X aria-hidden="true" /></Button></div> : null}
      <nav className="app-tabbar" aria-label="Primary">{viewLinks}</nav>
    </>
  )
}

const LEAGUES = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL']

function subscribeToAddress(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('navigationchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('navigationchange', onChange)
  }
}

export function ScopedSnapshotState({ state, scope, layout }: { state: Exclude<PublicSnapshotState, { status: 'ready' }>; scope: string; layout: PageLayout }) {
  if (state.status === 'loading') {
    return <LoadingState presentation="page" layout={layout} label={`Loading ${scope}`} />
  }
  return (
    <section className="flex min-w-0 flex-col px-[var(--page-x)] pt-6">
      <Card>
        <DataState icon={<AlertTriangle size={26} aria-hidden="true" />} title={`Snapshot unavailable for ${scope}`}>
          {state.message}
        </DataState>
      </Card>
    </section>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-[min(460px,92vw)]">
        <DataState
          icon={<AlertTriangle size={26} aria-hidden="true" />}
          title="Snapshot unavailable"
          action={
            <Button type="button" variant="default" onClick={() => window.location.reload()}>
              <RefreshCw size={15} aria-hidden="true" />
              Retry
            </Button>
          }
        >
          {message}
        </DataState>
      </Card>
    </main>
  )
}
