import { AlertTriangle, RefreshCw, Search, X } from 'lucide-react'
import { type MouseEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { hashForModeAndScope } from '../browser/navigation'
import type { PublicSnapshotState } from '../browser/rankings/usePublicArtifacts'
import {
  scopeLabel
} from '../browser/rankings/usePublicArtifacts'
import { DataState } from '../components/ui'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { LoadingState, type PageLayout } from '../components/ui/loading'
import { cn } from '../shared/utils'
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
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-[var(--page-x)] pt-4 pb-2 max-sm:pt-3 max-sm:pb-1.5">
      <h1 className="text-xl font-bold text-text max-sm:text-lg">{MODE_TITLES[mode].title}</h1>
      <p className="text-sm leading-snug text-muted">{MODE_TITLES[mode].intro}</p>
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
}: {
  mode: Mode
  scope: string
  onGoHome?: (event: MouseEvent<HTMLAnchorElement>) => void
  search?: string
  onSearch?: (value: string) => void
  searchRef?: RefObject<HTMLInputElement | null>
  onIntent?: (mode: Mode) => void
}) {
  const ownRef = useRef<HTMLInputElement | null>(null)
  const inputRef = searchRef ?? ownRef
  const [searchOpen, setSearchOpen] = useState(false)
  const searching = Boolean(onSearch) && (searchOpen || Boolean(search))
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [inputRef, searchOpen])
  function closeSearch() {
    if (search) onSearch?.('')
    setSearchOpen(false)
  }
  const link = (entry: (typeof MODES)[number], className: string, icon?: boolean) => {
    const Icon = entry.icon
    return (
      <a
        key={entry.id}
        href={hashForModeAndScope(entry.id, scope)}
        className={className}
        aria-current={mode === entry.id ? 'page' : undefined}
        onPointerEnter={() => (onIntent ?? preloadView)(entry.id)}
        onFocus={() => (onIntent ?? preloadView)(entry.id)}
        onTouchStart={() => (onIntent ?? preloadView)(entry.id)}
      >
        {icon ? <Icon size={18} aria-hidden="true" /> : null}
        {entry.label}
      </a>
    )
  }

  return (
    <>
      <header className={cn('sticky top-0 z-50 flex h-[var(--app-nav-h)] items-stretch gap-6 border-b border-line bg-ground px-[var(--page-x)] max-lg:gap-3', !onSearch && 'max-sm:static')}>
        <a className={cn('flex shrink-0 items-center text-lg font-bold text-text no-underline', searching && 'max-sm:hidden')} href={hashForModeAndScope('rankings', scope)} onClick={onGoHome}>
          rift-delta
        </a>
        <nav className={cn('flex min-w-0 items-stretch overflow-x-auto max-sm:hidden', searching && 'max-lg:hidden')} aria-label="Primary">
          {MODES.map((entry) => link(entry, 'flex shrink-0 items-center border-b-2 border-transparent px-3 text-sm text-muted no-underline transition-colors duration-150 hover:text-text aria-[current=page]:border-focus aria-[current=page]:font-semibold aria-[current=page]:text-text max-lg:px-2'))}
        </nav>
        <div className={cn('ml-auto flex min-w-0 items-center gap-4', searching && 'max-lg:flex-1')}>
          {onSearch ? (
            <label className={cn('relative w-[280px] min-w-0', searching ? 'max-lg:w-full' : 'max-lg:hidden')}>
              <span className="sr-only">Find a team</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input
                ref={inputRef}
                type="search"
                className="pl-9 lg:pr-9"
                value={search ?? ''}
                placeholder="Find a team"
                aria-keyshortcuts="/"
                onChange={(event) => onSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape' && !search) setSearchOpen(false) }}
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-muted max-lg:hidden" aria-hidden="true">/</kbd>
            </label>
          ) : null}
          {onSearch ? (
            searching
              ? <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Close search" onClick={closeSearch}><X aria-hidden="true" /></Button>
              : <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Find a team" onClick={() => setSearchOpen(true)}><Search aria-hidden="true" /></Button>
          ) : null}
          <a className={cn('shrink-0 text-sm text-muted no-underline transition-colors duration-150 hover:text-text', searching && 'max-lg:hidden')} href="/lab">DPS lab</a>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] grid-cols-[repeat(4,minmax(0,1fr))_minmax(76px,1.25fr)] border-t border-line bg-ground pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Primary"
      >
        {MODES.map((entry) => link(entry, 'flex min-w-0 flex-col items-center justify-center gap-0.5 border-t-2 border-transparent text-xs text-muted no-underline aria-[current=page]:border-focus aria-[current=page]:font-semibold aria-[current=page]:text-text', true))}
      </nav>
    </>
  )
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
